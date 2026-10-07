import type { BackoffOptions, RetryAfterHeader } from './backoff';
import { ApiError, ElmoError } from './errors';

export type BodyInput = NonNullable<RequestInit['body']>;

export type BodyPayload = BodyInput | null;

/**
 * One reply, as far as it has been read. Until its body is read, only `ok`,
 * `response` and `status` are set.
 */
export interface Result<TData = unknown, TError = unknown> {
  /** The decoded body of a 2xx reply. */
  data?: TData;
  /** The decoded body of a reply that failed. */
  error?: TError;
  /** `true` for a 2xx status. */
  ok?: boolean;
  response?: Response;
  status?: number;
}

/**
 * The log of one call, which the logger sets on a request as it is prepared.
 *
 * What lets the parts of a call the logger does not wrap write to it: a retry
 * about to wait, a reconnect, a stream that ended.
 */
export interface CallLog {
  /** A stream this call opened stopped, with the error it stopped on. */
  ended(error?: unknown): void;
  /** The call failed for good. */
  failed(error: unknown): void;
  /** A reply arrived, with its body unread. */
  replied(response: Response | undefined): void;
  /**
   * The call is about to be sent again in `wait` milliseconds, after the reply
   * or the error in `after`. A stream that ended passes neither.
   */
  retrying(wait: number, retry: number, retries: number, after?: Result): void;
  /** The request is about to go out. */
  sending(): void;
}

export interface AuthScheme {
  readonly in?: 'cookie' | 'header' | 'query';
  /** Which credential this is. Its option, where it has one, has the same name. */
  readonly key?: string;
  /** The header, query parameter or cookie the credential is sent in. */
  readonly name?: string;
  readonly scheme?: 'basic' | 'bearer';
  readonly type: 'apiKey' | 'http';
}

export type AuthRequirement = AuthScheme | ReadonlyArray<AuthScheme>;

export type CallTimeout = number | false;

export type Interaction = 'unary';

export type PaginationStyle = 'cursor' | 'link' | 'offset' | 'page';

export interface PaginationDescriptor {
  readonly cursor?: string;
  readonly in?: 'body' | 'query';
  readonly items?: string;
  readonly limitParam?: string;
  readonly link?: string;
  readonly more?: string;
  readonly pages?: string;
  readonly param?: string;
  readonly size?: string;
  readonly start?: number;
  readonly style: PaginationStyle;
  readonly total?: string;
}

export interface RetryRules extends BackoffOptions {
  /** How many attempts in all, counting the first. @default 3 */
  attempts?: number;
  /**
   * The longest wait the API may ask for, in milliseconds. Past it, the call
   * gives up and returns the reply as it is.
   *
   * @default 60000
   */
  maxRetryAfter?: number;
  /**
   * Methods that may be sent again. A failure that never reached the server,
   * a call carrying its API's idempotency key, and 408, 425 and 429 are sent
   * again whatever this says.
   *
   * @default idempotent methods
   */
  methods?: ReadonlyArray<string>;
  /**
   * Headers the API may name its own wait in, read before the backoff
   * applies. `false` reads none.
   *
   * @default `retry-after-ms`, `retry-after`, `x-ratelimit-reset-after`,
   * `x-ratelimit-reset` and `x-rate-limit-reset`, in that order
   */
  retryAfter?: ReadonlyArray<RetryAfterHeader> | boolean;
  /**
   * Send the request again when an attempt runs past its deadline. Turn it on
   * where a deadline catches a stalled connection rather than slow work.
   *
   * @default false
   */
  retryOnTimeout?: boolean;
  /**
   * Statuses worth another attempt, replacing the default rule rather than
   * adding to it. A reply with `x-should-retry: false` is never retried.
   */
  statuses?: ReadonlyArray<number>;
}

export interface ParameterSerialization {
  readonly allowReserved?: boolean;
  readonly array?: { readonly explode?: boolean; readonly style?: string };
  readonly mediaType?: string;
  readonly object?: { readonly explode?: boolean; readonly style?: string };
}

export interface SerializationDescriptor {
  readonly query?: Readonly<Record<string, ParameterSerialization>>;
}

export interface CallableDescriptor {
  readonly accept?: string;
  readonly address: string;
  readonly auth?: ReadonlyArray<AuthRequirement>;
  readonly authOptional?: boolean;
  readonly baseUrl?: string;
  /** The API marks this operation deprecated. Set only where a logger reads it. */
  readonly deprecated?: boolean;
  readonly idempotency?: string;
  readonly interaction?: Interaction;
  readonly mediaType?: string;
  readonly method?: string;
  readonly pagination?: PaginationDescriptor;
  readonly retry?: RetryRules | false;
  readonly serialization?: SerializationDescriptor;
  readonly timeout?: CallTimeout;
  readonly validators?: unknown;
}

export type MetadataValue = string | Array<string> | undefined;

export type Metadata = Record<string, MetadataValue>;

export interface Credential {
  in: 'cookie' | 'header' | 'query';
  name: string;
  value: string;
}

/** One credential a request carries, and the scheme it answers for. */
export interface PlacedCredential {
  readonly credential: Credential;
  readonly scheme: AuthScheme;
}

export type BodyOptions = {
  /** The request body, before it is encoded. */
  body?: unknown;
};

export type SignalOptions = {
  /** Cancels this call when it fires, retries included. */
  signal?: AbortSignal;
};

export type ExchangeOptions = BodyOptions & SignalOptions;

export type AuthToken = string | undefined;

/**
 * Returns the credential to send for `scheme`, given the value its option
 * holds. `undefined` sends none for that scheme.
 */
export type AuthResolver = (scheme: AuthScheme, value: AuthToken) => Promise<AuthToken> | AuthToken;

export type AuthValue = AuthResolver | null;

export type BodySerializerOptions = {
  /**
   * Encodes the request body, in place of the default for its content type.
   * `null` sends the body as given.
   */
  bodySerializer?: ((body: unknown) => BodyPayload) | null;
};

export type BaseUrlOptions<TBaseUrl = string> = {
  /** The base URL for this call, in place of the client's. */
  baseUrl?: TBaseUrl;
};

export type CredentialOptions<TAuth = AuthValue> = {
  /**
   * Decides each credential a call sends, given the scheme and the value its
   * option holds. What it returns is sent, so return the value to keep it.
   * `null` sends no credential.
   */
  auth?: TAuth;
};

export type EnvironmentOptions<TEnvironment = string> = {
  /** Which environment to send to. `baseUrl` wins over this. */
  environment?: TEnvironment;
};

export type ConnectionOptions<
  TBaseUrl = string,
  TAuth = AuthValue,
  TEnvironment = string,
> = BaseUrlOptions<TBaseUrl> &
  CredentialOptions<TAuth> &
  ([TEnvironment] extends [never] ? unknown : EnvironmentOptions<TEnvironment>);

export type CookieOptions = {
  /**
   * Cookies to send, serialized into the `cookie` header.
   *
   * **A browser will not send these.** `Cookie` is a forbidden header name.
   */
  cookies?: Record<string, unknown>;
};

export type EnvironmentMapOptions = {
  environments?: Readonly<Record<string, string>>;
};

/**
 * How a failure reaches the caller.
 *
 * - `'throw'` resolves to the payload and throws the failure.
 * - `'return'` resolves to the result envelope and throws nothing.
 *
 * Either way, one call can do the other: `result()` returns a failure
 * without throwing, and `unwrap()` throws it.
 */
export type ErrorMode = 'return' | 'throw';

export type ErrorOptions = {
  /**
   * Whether a failure is thrown or handed back beside the data. Set on a
   * client's defaults, not per call.
   *
   * @default 'throw'
   */
  errors?: ErrorMode;
};

export type MetadataInput = Headers | Iterable<readonly [string, string]> | Record<string, unknown>;

export type MetadataOptions = {
  /** Headers to send. Merged per name, and `null` drops one. */
  headers?: MetadataInput;
  /** Path parameters. Merged per name. */
  path?: Record<string, unknown>;
  /** Query parameters to add. Merged per name, and `null` drops one. */
  query?: Record<string, unknown>;
};

export type SharedOptions<
  TAddress = string,
  TAuth = AuthValue,
  TEnvironment = string,
> = BodySerializerOptions &
  ConnectionOptions<TAddress, TAuth, TEnvironment> &
  CookieOptions &
  EnvironmentMapOptions &
  ErrorOptions &
  MetadataOptions;

export type CallOptions = ExchangeOptions & SharedOptions;

export interface ResolvedOptions extends CallOptions {
  [key: string]: unknown;
  envelope?: boolean;
  raw?: boolean;
  unread?: boolean;
}

export interface PreparedRequest<TAddress = unknown> {
  /** Where the request goes. Over HTTP, the whole URL, query string included. */
  address: TAddress;
  /** The request body, already encoded. */
  body: BodyPayload | undefined;
  /** The operation this request calls, as declared, `method` included. */
  callable: CallableDescriptor;
  interaction: Interaction;
  /** Where this call's log lines go. Unset while logging is off. */
  log?: CallLog;
  /** The headers to send, by lowercase name. */
  meta: Metadata;
  /** The options this call resolved to: the client's, with the call's own on top. */
  options: ResolvedOptions;
  /**
   * The credentials this request carries, set when they go on.
   *
   * What lets a credential be asked for again and replaced, since a value that
   * was sent is the only way to tell an answer that changed from one that did
   * not.
   */
  placed?: ReadonlyArray<PlacedCredential>;
  signal?: AbortSignal | undefined;
  unauthenticated?: () => string;
}

export type TransportInteraction = 'unary';

interface UnaryTransport<TAddress> {
  /**
   * Sends one request and resolves to the reply, whatever its status, with the
   * body unread. Rejects only when no reply arrived.
   */
  unary(request: PreparedRequest<TAddress>): Promise<Response>;
}

type TransportMethods<TAddress> = UnaryTransport<TAddress>;

export type Transport<TAddress, TInteraction extends TransportInteraction> = {
  readonly name: string;
} & Pick<TransportMethods<TAddress>, TInteraction>;

/** A credential, or a function that returns one when a call needs it. */
export type CredentialValue = AuthToken | (() => Promise<AuthToken> | AuthToken);

export interface Codec {
  readonly contentType: string | undefined;
  decode?(raw: Response): Promise<unknown>;
  encode(value: unknown): BodyPayload;
  readonly mediaTypes: ReadonlyArray<string>;
  readonly name: string;
}

export type StatusOf<TKey> = TKey extends number ? TKey : number;

export type AnyTransport<TAddress = unknown> = {
  readonly name: string;
} & Partial<TransportMethods<TAddress>>;

export interface Binding<TAddress = unknown> {
  applyAuth(credential: Credential, request: PreparedRequest<TAddress>): void;
  readonly name: string;
  readError?(result: Result, request: PreparedRequest<TAddress>): unknown;
  readResult?(
    raw: Response,
    request: PreparedRequest<TAddress>,
    codecs: ReadonlyArray<Codec>,
  ): Promise<Result>;
  resolveAddress(callable: CallableDescriptor, options: ResolvedOptions): TAddress;
}

export interface FeatureContext {
  binding: Binding;
  transport: AnyTransport;
}

export type Send = (request: PreparedRequest) => Promise<Result>;

/** Hooks that run at fixed points in every call. */
export interface Feature {
  readonly name: string;
  onError?(error: unknown, request: PreparedRequest, ctx: FeatureContext): unknown;
  /**
   * Wraps the trip that opens a stream, as `onSend` wraps a call's. A stream is
   * opened once, so a feature that would send one again registers none.
   */
  onOpen?(request: PreparedRequest, next: Send, ctx: FeatureContext): Promise<Result>;
  /**
   * Reads and may rewrite the options a call resolved to. The last point
   * where a change still reaches the wire.
   */
  onOptions?(
    options: ResolvedOptions,
    callable: CallableDescriptor,
    ctx: FeatureContext,
  ): Promise<void> | void;
  onPrepare?(request: PreparedRequest, ctx: FeatureContext): Promise<void> | void;
  onRequest?(request: PreparedRequest, ctx: FeatureContext): Promise<void> | void;
  onResult?(
    result: Result,
    request: PreparedRequest,
    ctx: FeatureContext,
  ): Promise<Result> | Result;
  /**
   * Wraps the trip to the wire. Call `next` to make it, skip it to answer
   * from elsewhere, or call it repeatedly to retry. Its reply arrives with
   * the body unread, so cancel one you abandon.
   */
  onSend?(request: PreparedRequest, next: Send, ctx: FeatureContext): Promise<Result>;
}

/** What this client knows about one credential, under the name a caller passes it by. */
export type CredentialSpec = {
  /** Environments this credential is accepted at, by the names this client gives them. */
  readonly environments?: ReadonlyArray<string>;
  /** `false` where another option holds this credential's name, so only `auth` sets it. */
  readonly option?: false;
  /** Written in front of the credential, so a caller holds only the secret. */
  readonly prefix?: string;
  /** Environment variable this credential is read from where a caller passes none. */
  readonly variable?: string;
};

export interface EncodedBody {
  contentType: string | undefined;
  payload: BodyPayload;
}

export type ErrorOf<TErrors> = TErrors extends object
  ? {
      [K in keyof TErrors]: {
        data?: never;
        error: ApiError<TErrors[K]>;
        ok: false;
        status: StatusOf<K>;
      };
    }[keyof TErrors]
  : never;

type OutputOf<TResponses> = TResponses extends object
  ? {
      [K in keyof TResponses]: {
        data: TResponses[K];
        error?: never;
        ok: true;
        status: StatusOf<K>;
      };
    }[keyof TResponses]
  : Result;

export type UnansweredOf = {
  data?: never;
  error: ElmoError;
  ok: false;
  status?: undefined;
};

/** What awaiting a call gives back, which the client's `errors` mode decides. */
export type CallResult<
  TResponses = unknown,
  TErrors = unknown,
  TMode extends ErrorMode = 'throw',
> = TMode extends 'return'
  ? ErrorOf<TErrors> | OutputOf<TResponses> | UnansweredOf
  : TResponses extends object
    ? TResponses[keyof TResponses]
    : unknown;

export type PageOptions = {
  /**
   * Where to start reading, from an earlier page's `nextPageParam`. Unset, the
   * walk starts at the page the call's own arguments name.
   */
  pageParam?: unknown;
};

/** What `result()` gives back: the payload, or the failure as a value. */
export type ResultEnvelope<TResponses = unknown, TErrors = unknown> = CallResult<
  TResponses,
  TErrors,
  'return'
>;

/** What a paged call hands back when its failure is read rather than thrown. */
export type PageEnvelope<TAwaited = unknown, TErrors = unknown> =
  | ErrorOf<TErrors>
  | UnansweredOf
  | {
      data: TAwaited;
      error?: never;
      ok: true;
      status: number;
    };

/** What awaiting a paged call gives back, which the client's `errors` mode decides. */
export type PageResult<
  TAwaited = unknown,
  TErrors = unknown,
  TMode extends ErrorMode = 'throw',
> = TMode extends 'return' ? PageEnvelope<TAwaited, TErrors> : TAwaited;
