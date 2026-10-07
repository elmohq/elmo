import type {
  CallableDescriptor,
  CallLog,
  Feature,
  PreparedRequest,
  Result,
  Send,
} from '../core/types';

export type LogFn = (message: string, ...rest: ReadonlyArray<unknown>) => void;

/** Where log lines go, such as `console`. */
export interface Logger {
  debug: LogFn;
  error: LogFn;
  info: LogFn;
  warn: LogFn;
}

/**
 * How much a client logs. `'error'` writes calls that failed. `'warn'` adds
 * calls that recovered, such as a retry about to wait or a redirect followed,
 * and the first call to each deprecated operation. `'info'`
 * adds a line per attempt, with its status and how long it took. `'debug'`
 * adds headers, with credentials hidden.
 */
export type LogLevel = 'debug' | 'error' | 'info' | 'off' | 'warn';

const LEVELS: Readonly<Record<LogLevel, number>> = {
  debug: 40,
  error: 10,
  info: 30,
  off: 0,
  warn: 20,
};

export interface LoggerOptions {
  level?: LogLevel;
  logger?: Logger;
}

function addressOf(url: string): string {
  return url.split('?')[0] ?? '';
}

function describeCall(request: PreparedRequest): string {
  const method = request.callable.method?.toUpperCase();
  const address = typeof request.address === 'string' ? addressOf(request.address) : '';
  return method ? `${method} ${address}` : address;
}

const SECRET_HEADERS: ReadonlyArray<string> = [
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
];

function isSecret(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    SECRET_HEADERS.includes(lower) ||
    lower.endsWith('-key') ||
    lower.endsWith('-token') ||
    lower.endsWith('-secret')
  );
}

function safeHeaders(meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(meta)) {
    safe[name] = isSecret(name) ? '***' : value;
  }
  return safe;
}

function callLog(id: string, request: PreparedRequest, at: number, sink: Logger): CallLog {
  const label = describeCall(request);
  let started = Date.now();
  function line(text: string): string {
    return `[${id}] ${label} ${text}`;
  }

  return {
    ended(error) {
      const ms = Date.now() - started;
      if (error !== undefined) {
        if (at >= LEVELS.error) sink.error(line(`stream failed after ${ms} ms`), error);
      } else if (at >= LEVELS.info) {
        sink.info(line(`stream ended after ${ms} ms`));
      }
    },
    failed(error) {
      if (at >= LEVELS.error) sink.error(line('failed'), error);
    },
    replied(response) {
      const ms = Date.now() - started;
      if (response?.redirected && at >= LEVELS.warn) {
        sink.warn(line(`was redirected to ${addressOf(response.url)}`));
      }
      if (at >= LEVELS.info) sink.info(line(`→ ${response?.status ?? '?'} in ${ms} ms`));
      if (at >= LEVELS.debug) {
        sink.debug(`[${id}] received`, {
          headers: safeHeaders(Object.fromEntries(response?.headers ?? [])),
          ms,
          status: response?.status,
        });
      }
    },
    retrying(wait, retry, retries, after) {
      if (at < LEVELS.warn) return;
      const again = `retrying in ${Math.round(wait)} ms (${retry} of ${retries})`;
      if (after?.status !== undefined) {
        sink.warn(line(`→ ${after.status}, ${again}`));
      } else if (after?.error !== undefined) {
        sink.warn(line(`failed, ${again}`), after.error);
      } else {
        sink.warn(line(again));
      }
    },
    sending() {
      started = Date.now();
      if (at >= LEVELS.info) sink.info(`[${id}] ${label}`);
      if (at >= LEVELS.debug) sink.debug(`[${id}] sending`, { headers: safeHeaders(request.meta) });
    },
  };
}

function resolveLogging(
  base: LoggerOptions,
  request: PreparedRequest,
): { at: number; sink: Logger } | undefined {
  const named = (request.options['logLevel'] as LogLevel | undefined) ?? base.level ?? 'off';
  const at = LEVELS[named] ?? LEVELS.off;
  if (at === LEVELS.off) return undefined;

  const sink =
    (request.options['logger'] as Logger | undefined) ??
    base.logger ??
    (globalThis as { console?: Logger }).console;
  return sink ? { at, sink } : undefined;
}

/** Writes the trip out and what came back, around `next`. */
async function written(request: PreparedRequest, next: Send): Promise<Result> {
  const { log } = request;
  if (!log) return next(request);

  log.sending();
  const result = await next(request);
  log.replied(result.response);
  return result;
}

export function loggerFeature(options: LoggerOptions = {}): Feature {
  let counter = 0;
  const warned = new Set<CallableDescriptor>();

  return {
    name: 'logger',
    async onError(error, request) {
      request.log?.failed(error);
      return error;
    },
    onOpen: written,
    onPrepare(request) {
      const on = resolveLogging(options, request);
      if (!on) return;
      const id = `req_${++counter}`;
      request.log = callLog(id, request, on.at, on.sink);
      const { callable } = request;
      if (callable.deprecated && on.at >= LEVELS.warn && !warned.has(callable)) {
        warned.add(callable);
        const method = callable.method?.toUpperCase();
        const operation = method ? `${method} ${callable.address}` : callable.address;
        on.sink.warn(`[${id}] ${operation} is deprecated`);
      }
    },
    onSend: written,
  };
}
