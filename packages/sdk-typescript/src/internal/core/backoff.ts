export interface BackoffOptions {
  /** Base delay in milliseconds. @default 500 */
  delay?: number;
  /**
   * Spread each delay over `[0, computed]`, so callers that failed together
   * do not all come back at once.
   *
   * @default true
   */
  jitter?: boolean;
  /** Upper bound on any single delay, in milliseconds. @default 30000 */
  maxDelay?: number;
  /**
   * How the wait grows. `'exponential'` doubles the base delay each time, up
   * to `maxDelay`. `'constant'` waits the base delay every time.
   *
   * @default 'exponential'
   */
  strategy?: 'constant' | 'exponential';
}

export interface RetryAfterHeader {
  /** Whether a number counts forward from now, or names a moment. @default 'duration' */
  readonly kind?: 'duration' | 'moment';
  /** Header name, matched case-insensitively. */
  readonly name: string;
  /** What a number in this header counts in. @default 'second' */
  readonly unit?: 'millisecond' | 'second';
}

export const RETRY_AFTER_HEADERS: ReadonlyArray<RetryAfterHeader> = [
  { name: 'retry-after-ms', unit: 'millisecond' },
  { name: 'retry-after' },
  { name: 'x-ratelimit-reset-after' },
  { kind: 'moment', name: 'x-ratelimit-reset' },
  { kind: 'moment', name: 'x-rate-limit-reset' },
];

const ASCTIME = /^[a-z]{3} [a-z]{3} +\d\d? \d\d:\d\d:\d\d \d{4}$/i;

const ZONED = /(?:gmt|utc?|z|[+-]\d\d:?\d\d)$/i;

function moment(value: string): number | undefined {
  const text = value.trim();
  const date = ZONED.test(text)
    ? Date.parse(text)
    : ASCTIME.test(text)
      ? Date.parse(`${text} GMT`)
      : NaN;
  return Number.isNaN(date) ? undefined : date;
}

export function parseRetryAfter(
  value: string | null | undefined,
  header: RetryAfterHeader = { name: 'retry-after' },
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;

  const number = Number(value);
  if (Number.isFinite(number)) {
    const ms = header.unit === 'millisecond' ? number : number * 1000;
    return Math.max(0, header.kind === 'moment' ? ms - now : ms);
  }

  const date = moment(value);
  if (date === undefined) return undefined;
  return Math.max(0, date - now);
}

export function retryAfterDelay(
  response: Response,
  headers: ReadonlyArray<RetryAfterHeader> = RETRY_AFTER_HEADERS,
  now = Date.now(),
): number | undefined {
  const clock = moment(response.headers.get('date') ?? '') ?? now;

  for (const header of headers) {
    const delay = parseRetryAfter(response.headers.get(header.name), header, clock);
    if (delay !== undefined) return delay;
  }

  return undefined;
}

export function backoffDelay(retry: number, options: BackoffOptions = {}): number {
  const { delay = 500, jitter = true, maxDelay = 30_000, strategy = 'exponential' } = options;
  const growth = strategy === 'constant' ? delay : delay * 2 ** retry;
  const capped = Math.min(growth, maxDelay);
  return jitter ? Math.random() * capped : capped;
}

export const MAX_RETRY_AFTER = 60_000;

export function exceedsMaxRetryAfter(delay: number | undefined, max?: number): boolean {
  return delay !== undefined && delay > (max ?? MAX_RETRY_AFTER);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(signal!.reason);
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
