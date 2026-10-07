import type { Feature, PreparedRequest, Result } from '../core/types';

/**
 * Your own hooks, run at three points in every call.
 *
 * Each list runs in order. `request` sees the request after the credentials
 * are on it and before it goes to the wire. `response` and `error` each
 * receive what the call produced and return what the caller reads, so a hook
 * that only observes returns its first argument unchanged.
 *
 * A call that reads a stream runs `request` and `error`, and no `response`
 * hook at all: there is no single reply to hand one, and a hook that returned
 * a different result would have nowhere to put it.
 */
export interface Interceptors {
  /** Runs when a call fails. Return the error to raise, which may be another. */
  error?: ReadonlyArray<(error: unknown, request: PreparedRequest) => unknown>;
  /** Runs on the built request, last before it is sent. */
  request?: ReadonlyArray<(request: PreparedRequest) => Promise<void> | void>;
  /** Runs on the reply. Return the result to read, which may be another. */
  response?: ReadonlyArray<(result: Result, request: PreparedRequest) => Promise<Result> | Result>;
}

function interceptorsOf(request: PreparedRequest): Interceptors | undefined {
  return request.options['interceptors'] as Interceptors | undefined;
}

export function interceptorsFeature(): Feature {
  return {
    name: 'interceptors',
    async onError(error, request) {
      let current = error;
      for (const fn of interceptorsOf(request)?.error ?? []) current = await fn(current, request);
      return current;
    },
    async onRequest(request) {
      for (const fn of interceptorsOf(request)?.request ?? []) await fn(request);
    },
    async onResult(result, request) {
      let current = result;
      for (const fn of interceptorsOf(request)?.response ?? []) {
        current = await fn(current, request);
      }
      return current;
    },
  };
}
