import { calledOffWith, TimeoutError } from '../core/errors';
import type {
  CallableDescriptor,
  CallTimeout,
  Feature,
  PreparedRequest,
  Result,
  Send,
} from '../core/types';

/**
 * Chooses the deadline of one call. It is handed the operation, as
 * `METHOD /path`, and the operation's own limit, or the client's default where
 * it states none. Return the limit to use, or `undefined` to keep that one.
 */
export type TimeoutPolicy = (operation: string, timeout: CallTimeout) => CallTimeout | undefined;

/** A limit in milliseconds, `false` for none, or a policy choosing one per call. */
export type TimeoutValue = CallTimeout | TimeoutPolicy;

export interface TimeoutOptions {
  ms?: number;
}

function describeTarget(request: PreparedRequest): string | undefined {
  const { method } = request.callable;
  if (typeof request.address !== 'string') return undefined;
  const address = request.address.split('?')[0];
  return method ? `${method.toUpperCase()} "${address}"` : `"${address}"`;
}

export const DEFAULT_TIMEOUT = 60_000;

function operationKey({ address, method }: CallableDescriptor): string {
  return method ? `${method.toUpperCase()} ${address}` : address;
}

export function resolveTimeout(base: TimeoutOptions, request: PreparedRequest): number | undefined {
  const own = request.callable.timeout ?? base.ms ?? DEFAULT_TIMEOUT;
  const option = request.options['timeout'] as TimeoutValue | undefined;
  const ms =
    typeof option === 'function'
      ? (option(operationKey(request.callable), own) ?? own)
      : (option ?? own);
  if (ms === false) return undefined;
  return ms > 0 && Number.isFinite(ms) ? ms : undefined;
}

/**
 * The reply, with a body that gives up once the API goes quiet for `ms`.
 *
 * The limit runs only while a read waits on the API, so a caller who takes a
 * while between reads is never cut off by their own pace.
 */
function watchedReply(
  response: Response,
  wait: <T>(pending: Promise<T>) => Promise<T>,
  done: () => void,
): Response {
  const reader = response.body!.getReader();
  const body = new ReadableStream<Uint8Array>({
    cancel(reason) {
      done();
      return reader.cancel(reason);
    },
    async pull(controller) {
      const step = await wait(reader.read()).catch((error: unknown) => {
        done();
        reader.cancel(error).catch(done);
        throw error;
      });
      if (step.done) {
        done();
        controller.close();
      } else {
        controller.enqueue(step.value);
      }
    },
  });
  const watched = new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
  Object.defineProperty(watched, 'redirected', { value: response.redirected });
  Object.defineProperty(watched, 'url', { value: response.url });
  return watched;
}

/**
 * Gives up once the API sends nothing for the limit: before the reply arrives,
 * or between two pieces of its body. A reply that keeps arriving is never cut
 * off, however long it takes, which is what lets a stream run under the same
 * limit as a call.
 *
 * Raced rather than left to the transport, which may ignore the signal.
 */
export function timeoutFeature(options: TimeoutOptions = {}): Feature {
  async function bounded(request: PreparedRequest, next: Send): Promise<Result> {
    const ms = resolveTimeout(options, request);
    if (ms === undefined) return next(request);

    const caller = request.signal;
    const controller = new AbortController();
    const { signal } = controller;

    function abortWithCaller(): void {
      controller.abort(caller?.reason);
    }

    if (caller?.aborted) abortWithCaller();
    caller?.addEventListener('abort', abortWithCaller, { once: true });

    const abandoned = new Promise<never>((_, reject) => {
      function giveUp(): void {
        reject(calledOffWith(signal.reason));
      }
      if (signal.aborted) giveUp();
      else signal.addEventListener('abort', giveUp, { once: true });
    });
    abandoned.catch(() => {});

    function expire(): void {
      controller.abort(new TimeoutError(ms, undefined, describeTarget(request)));
    }

    async function wait<T>(pending: Promise<T>): Promise<T> {
      const timer = setTimeout(expire, ms);
      try {
        return await Promise.race([pending, abandoned]);
      } finally {
        clearTimeout(timer);
      }
    }

    function done(): void {
      caller?.removeEventListener('abort', abortWithCaller);
    }

    request.signal = signal;
    const result = await wait(next(request))
      .catch((error: unknown) => {
        done();
        throw error;
      })
      .finally(() => {
        request.signal = caller;
      });
    const { response } = result;
    if (response?.body) return { ...result, response: watchedReply(response, wait, done) };
    done();
    return result;
  }

  return { name: 'timeout', onOpen: bounded, onSend: bounded };
}
