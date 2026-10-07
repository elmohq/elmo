import { backoffDelay, exceedsMaxRetryAfter, retryAfterDelay, sleep } from '../core/backoff';
import { discardBody, isStreamed } from '../core/body';
import { calledOffWith, classifyError } from '../core/errors';
import type { Feature, PreparedRequest, Result, RetryRules } from '../core/types';

/** Which failed calls are sent again, how many times, and how long each waits first. */
export interface RetryOptions extends RetryRules {
  /**
   * How long to wait before the next attempt, in milliseconds, in place of the
   * API's retry headers and the backoff. `undefined` keeps the usual wait.
   * **{@link maxRetryAfter} does not limit what this returns.**
   */
  retryDelay?(
    result: Result | undefined,
    request: PreparedRequest,
    attempt: number,
  ): number | undefined;
  /**
   * Whether to retry after this reply, in place of `statuses` and
   * `x-should-retry`. The body is unread: read it from `response.clone()`.
   */
  retryOn?(result: Result, request: PreparedRequest): boolean;
}

function askedFor(config: RetryOptions, result: Result): number | undefined {
  const headers = config.retryAfter;
  if (headers === false || !result.response) return undefined;
  return retryAfterDelay(result.response, headers === true ? undefined : headers);
}

const IDEMPOTENT_METHODS: ReadonlyArray<string> = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PUT',
  'TRACE',
];

function isRepeatable(config: RetryOptions, request: PreparedRequest): boolean {
  const method = request.callable.method?.toUpperCase();
  if (!method) return false;
  if ((config.methods ?? IDEMPOTENT_METHODS).includes(method)) return true;
  const { idempotency } = request.callable;
  return idempotency !== undefined && request.meta[idempotency] !== undefined;
}

function attemptsFor(
  base: RetryOptions,
  override: RetryOptions | true | undefined,
  request: PreparedRequest,
): number {
  if (override && override !== true && override.attempts !== undefined) return override.attempts;
  const retries = request.options['maxRetries'];
  if (typeof retries === 'number' && Number.isFinite(retries)) return Math.max(0, retries) + 1;
  return base.attempts ?? 3;
}

function resolveRetry(base: RetryOptions, request: PreparedRequest): RetryOptions | undefined {
  const override = request.options['retry'] as RetryOptions | boolean | undefined;
  if (override === false) return undefined;

  const declared = request.callable.retry;
  if (declared === false && override === undefined) return undefined;

  const stated = declared ? { ...base, ...declared } : base;
  const config = override && override !== true ? { ...stated, ...override } : stated;
  const attempts = attemptsFor(stated, override, request);
  return attempts <= 1 ? undefined : { ...config, attempts };
}

const REFUSED_STATUSES: ReadonlyArray<number> = [408, 425, 429];

const RETRY_HEADER = 'x-should-retry';

const PERMANENT_STATUSES: ReadonlyArray<number> = [501, 505, 506, 508, 510, 511];

function worthAnotherAttempt(status: number): boolean {
  if (status >= 500) return !PERMANENT_STATUSES.includes(status);
  return REFUSED_STATUSES.includes(status);
}

function shouldRetry(
  config: RetryOptions,
  result: Result,
  request: PreparedRequest,
  repeatable: boolean,
): boolean {
  const { response } = result;
  if (!response) return false;
  if (!repeatable && !REFUSED_STATUSES.includes(response.status)) return false;
  if (config.retryOn) return config.retryOn(result, request);
  if (response.headers.get(RETRY_HEADER) === 'false') return false;
  const { statuses } = config;
  return statuses ? statuses.includes(response.status) : worthAnotherAttempt(response.status);
}

function shouldRetryError(config: RetryOptions, error: unknown, repeatable: boolean): boolean {
  const kind = classifyError(error);
  if (kind === 'abort') return false;
  if (kind === 'connect') return true;
  if (kind === 'timeout') return repeatable && config.retryOnTimeout === true;
  return repeatable;
}

export function retryFeature(options: RetryOptions = {}): Feature {
  return {
    name: 'retry',
    async onSend(request, next) {
      const config = isStreamed(request.body) ? undefined : resolveRetry(options, request);
      if (!config) return next(request);

      const attempts = config.attempts ?? 3;
      const repeatable = isRepeatable(config, request);

      for (let attempt = 0; ; attempt++) {
        const last = attempt >= attempts - 1;
        let result: Result | undefined;
        let wait: number | undefined;

        try {
          result = await next(request);
          if (last || !shouldRetry(config, result, request, repeatable)) return result;

          wait = config.retryDelay?.(result, request, attempt);
          if (wait === undefined) {
            wait = askedFor(config, result);
            if (exceedsMaxRetryAfter(wait, config.maxRetryAfter)) return result;
          }
        } catch (error) {
          if (last || !shouldRetryError(config, error, repeatable)) throw error;
          wait = config.retryDelay?.(undefined, request, attempt);
          result = { error };
        }

        discardBody(result);
        wait ??= backoffDelay(attempt, config);
        request.log?.retrying(wait, attempt + 1, attempts - 1, result);
        await sleep(wait, request.signal).catch((reason: unknown) => {
          throw calledOffWith(reason);
        });
      }
    },
  };
}
