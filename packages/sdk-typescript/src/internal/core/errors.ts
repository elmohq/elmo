import { retryAfterDelay } from './backoff';
import type { Interaction, StatusOf } from './types';
import type { Error as Error2 } from '../../types/shared';

export type FailureBody = Error2;

/** The base of every error this SDK throws, including one from a call that never arrived. */
export class ElmoError extends Error {
  override name: string = 'ElmoError';
}

const CODE_KEYS: ReadonlyArray<string> = ['code', 'error_code', 'errorCode'];

function statedCode(bag: Record<string, unknown>): string | number | undefined {
  for (const key of CODE_KEYS) {
    const value = bag[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return value;
  }
  return undefined;
}

function describeCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const body = error as Record<string, unknown>;
  const direct = statedCode(body);
  if (direct !== undefined) return direct;

  for (const value of Object.values(body)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = statedCode(value as Record<string, unknown>);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

const MAX_MESSAGE_BODY = 200;

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function shorten(text: string): string {
  const line = oneLine(text);
  if (line.length <= MAX_MESSAGE_BODY) return line;
  const cut = line.slice(0, MAX_MESSAGE_BODY);
  const space = cut.lastIndexOf(' ');
  const kept = space > MAX_MESSAGE_BODY / 2 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

const MESSAGE_KEYS: ReadonlyArray<string> = [
  'message',
  'error_message',
  'errorMessage',
  'error',
  'detail',
  'title',
  'description',
];

function statedMessage(bag: Record<string, unknown>): string | undefined {
  for (const key of MESSAGE_KEYS) {
    const value = bag[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function describeFailure(error: unknown): string | undefined {
  if (typeof error === 'string') return shorten(error.trim()) || undefined;
  if (!error || typeof error !== 'object') return undefined;

  const body = error as Record<string, unknown>;
  const direct = statedMessage(body);
  if (direct) return shorten(direct);

  for (const value of Object.values(body)) {
    if (value && typeof value === 'object') {
      const nested = statedMessage(value as Record<string, unknown>);
      if (nested) return shorten(nested);
    }
  }

  const json = JSON.stringify(error);
  return json && json !== '{}' && json !== '[]' ? shorten(json) : undefined;
}

function isStructured(body: unknown): boolean {
  return typeof body === 'object' && body !== null && !(body instanceof Blob);
}

const REQUEST_ID_HEADERS: ReadonlyArray<string> = [
  'x-request-id',
  'request-id',
  'x-correlation-id',
  'x-amzn-requestid',
  'cf-ray',
];

function requestIdOf(response: Response): string | undefined {
  for (const header of REQUEST_ID_HEADERS) {
    const value = response.headers.get(header);
    if (value) return value;
  }
  return undefined;
}

/** A failure the API answered with, so there is a status and a reply to read. */
export class ApiError<TError = FailureBody> extends ElmoError {
  /** The API's own error code, read from the failure body. `undefined` where it carried none. */
  readonly code: string | number | undefined;
  /**
   * The decoded failure body. `undefined` where the reply carried none, or
   * carried text such as a proxy's page, which is in `message` instead.
   */
  readonly error: TError | undefined;
  /** The request id to quote when reporting this failure. */
  readonly requestId: string | undefined;
  /**
   * The reply that carried this failure. Its body is already read, so take the
   * decoded one from {@link ApiError.error} or {@link ApiError.message}.
   */
  readonly response: Response;
  /** Milliseconds the API asked to wait before trying again. */
  readonly retryAfter: number | undefined;
  readonly status: number;

  constructor(status: number, body: unknown, response: Response, note?: string) {
    const reason = response.statusText ? `${status} ${response.statusText}` : `${status}`;
    const where = response.url ? ` for "${response.url}"` : '';
    const said = describeFailure(body);
    const tail = note
      ? `. ${note}${said ? ` The API said: ${said}` : ''}`
      : said
        ? `: ${said}`
        : '.';
    super(`The API answered ${reason}${where}${tail}`);
    this.code = describeCode(body);
    this.error = isStructured(body) ? (body as TError) : undefined;
    this.name = 'ApiError';
    this.requestId = requestIdOf(response);
    this.response = response;
    this.retryAfter = retryAfterDelay(response);
    this.status = status;
  }
}

/** The failures one call can arrive as, narrowed to the statuses its description declares. */
export type ApiErrorOf<TErrors> = TErrors extends object
  ? {
      [K in keyof TErrors]: ApiError<TErrors[K]> & { readonly status: StatusOf<K> };
    }[keyof TErrors]
  : ApiError;

/** Whether a caught value is a failure the API answered with. */
export function isApiError<TErrors = unknown>(value: unknown): value is ApiErrorOf<TErrors> {
  return value instanceof ApiError;
}

/** Thrown before the request goes out, when no credential satisfied the call. */
export class MissingCredentialError extends ElmoError {
  override readonly name = 'MissingCredentialError';
  /** Credential options that would have satisfied the call. */
  readonly schemes: ReadonlyArray<string>;

  constructor(message: string, schemes: ReadonlyArray<string> = []) {
    super(message);
    this.schemes = schemes;
  }
}

/** Which way a {@link TransportError} failed. `connect` and `other` have no class of their own. */
export type TransportErrorKind = 'abort' | 'connect' | 'other' | 'timeout';

const TRANSPORT_MESSAGES: Readonly<Record<TransportErrorKind, string>> = {
  abort: 'The request was called off before the API answered.',
  connect: 'The request never reached the API.',
  other: 'The request failed before the API answered.',
  timeout: 'The API did not answer in time.',
};

/** Thrown when no answer arrived, so there is no status to go on. */
export class TransportError extends ElmoError {
  readonly kind: TransportErrorKind;

  constructor(
    kind: TransportErrorKind,
    cause?: unknown,
    message: string = TRANSPORT_MESSAGES[kind],
  ) {
    super(message, { cause });
    this.kind = kind;
    this.name = 'TransportError';
  }
}

/** Thrown when the request was called off before the API answered. */
export class AbortError extends TransportError {
  constructor(cause?: unknown) {
    super('abort', cause);
    this.name = 'AbortError';
  }
}

export function calledOffWith(reason: unknown): TransportError {
  return reason instanceof TransportError ? reason : new AbortError(reason);
}

const CONNECT_CODES: ReadonlyArray<string> = [
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
];

const TIMEOUT_CODES: ReadonlyArray<string> = ['ECONNABORTED', 'ETIMEDOUT'];

function codeOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const { code } = current as { code?: unknown };
    if (typeof code === 'string') return code;
    current = current.cause;
  }
  return undefined;
}

export function classifyError(error: unknown): TransportErrorKind {
  if (error instanceof TransportError) return error.kind;

  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'abort';
    if (error.name === 'TimeoutError') return 'timeout';
  }

  const code = codeOf(error);
  if (code !== undefined) {
    if (CONNECT_CODES.includes(code)) return 'connect';
    if (TIMEOUT_CODES.includes(code)) return 'timeout';
  }

  return 'other';
}

/**
 * Thrown when the API sent nothing for as long as the call allowed, before the
 * reply arrived or between two pieces of its body.
 */
export class TimeoutError extends TransportError {
  /** Milliseconds the API was allowed to send nothing. */
  readonly timeout: number | undefined;

  constructor(timeout?: number, cause?: unknown, target?: string) {
    super(
      'timeout',
      cause,
      timeout === undefined
        ? TRANSPORT_MESSAGES.timeout
        : `${target ?? 'The request'} timed out: the API sent nothing for ${timeout} ms. Pass a larger \`timeout\` with the call, or \`timeout: false\` to wait as long as it takes.`,
    );
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

export class UnsupportedInteractionError extends ElmoError {
  readonly interaction: Interaction;
  readonly transport: string;

  constructor(transport: string, interaction: Interaction) {
    super(`Transport "${transport}" cannot send this call. It has no "${interaction}" method.`);
    this.interaction = interaction;
    this.name = 'UnsupportedInteractionError';
    this.transport = transport;
  }
}

const TRANSPORT_CLASSES: Partial<Record<TransportErrorKind, (cause: unknown) => TransportError>> = {
  abort: (cause) => new AbortError(cause),
  timeout: (cause) => new TimeoutError(undefined, cause),
};

export function toTransportError(error: unknown): TransportError {
  if (error instanceof TransportError) return error;
  const kind = classifyError(error);
  return TRANSPORT_CLASSES[kind]?.(error) ?? new TransportError(kind, error);
}

/** A reply from the API that this SDK could not read, whatever its status. */
export class DecodeError extends ElmoError {
  /** Where the value sat, such as `Brand.tags[].addedAt`, or absent where the whole reply failed. */
  readonly at: string | undefined;
  /** The reply. Its body is already read. */
  readonly response: Response | undefined;
  readonly status: number | undefined;
  /** What the API sent. The message holds only a short form of it. */
  readonly value: unknown;

  constructor(
    message: string,
    options: {
      at?: string | undefined;
      cause?: unknown;
      response?: Response | undefined;
      value?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.at = options.at;
    this.name = 'DecodeError';
    this.response = options.response;
    this.status = options.response?.status;
    this.value = options.value;
  }
}

export function emptyPathParameter(name: string, url: string) {
  return new ElmoError(
    `Path parameter \`${name}\` is empty. \`${url}\` cannot be sent without it.`,
  );
}

function sent(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (typeof value === 'string') return `"${shorten(value)}"`;
  if (value === null || typeof value !== 'object') return shorten(String(value));
  try {
    return shorten(JSON.stringify(value) ?? String(value));
  } catch {
    return shorten(String(value));
  }
}

export function unreadableValue(
  at: string | undefined,
  value: unknown,
  cause?: unknown,
  response?: Response,
): DecodeError {
  const where = at === undefined ? 'the reply' : `\`${at}\` from the reply`;
  return new DecodeError(`Could not read ${where}: the API sent ${sent(value)}.`, {
    at,
    cause,
    response,
    value,
  });
}
