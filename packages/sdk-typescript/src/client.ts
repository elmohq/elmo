import { simpleAddress } from './internal/binding/rest/address-simple';
import { createRestBinding } from './internal/binding/rest/binding';
import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PaymentRequiredError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from './internal/binding/rest/errors';
import { jsonCodec } from './internal/codec/json';
import { encodeBody } from './internal/codec/registry';
import type { BackoffOptions, RetryAfterHeader } from './internal/core/backoff';
import { RestCallPromise } from './internal/core/call-promise';
import type { Client } from './internal/core/client';
import { clientFor, createClient } from './internal/core/client';
import { createConfig } from './internal/core/config';
import { envDefaults } from './internal/core/env';
import type { ApiErrorOf, FailureBody, TransportErrorKind } from './internal/core/errors';
import {
  AbortError,
  ApiError,
  DecodeError,
  ElmoError,
  MissingCredentialError,
  TimeoutError,
  TransportError,
} from './internal/core/errors';
import { oneProtocol } from './internal/core/protocol';
import type {
  AuthResolver,
  AuthScheme,
  AuthToken,
  AuthValue,
  BodyInput,
  BodyPayload,
  BodySerializerOptions,
  CallResult,
  CallTimeout,
  CredentialOptions,
  CredentialValue,
  ErrorMode,
  Feature,
  MetadataInput,
  MetadataOptions,
  PageEnvelope,
  PageResult,
  PreparedRequest,
  Result,
  ResultEnvelope,
  RetryRules,
  Transport,
  TransportInteraction,
} from './internal/core/types';
import { authFeature } from './internal/features/auth';
import type { Interceptors } from './internal/features/interceptors';
import { interceptorsFeature } from './internal/features/interceptors';
import type { LogFn, Logger, LogLevel } from './internal/features/logger';
import { loggerFeature } from './internal/features/logger';
import type { RetryOptions } from './internal/features/retry';
import { retryFeature } from './internal/features/retry';
import type { TimeoutPolicy, TimeoutValue } from './internal/features/timeout';
import { timeoutFeature } from './internal/features/timeout';
import { validateFeature } from './internal/features/validate';
import type { Page } from './internal/page/page';
import { PagePromise } from './internal/page/page';
import type { FetchOptions } from './internal/transport/fetch';
import { createFetchTransport } from './internal/transport/fetch';
import { Brands } from './resources/brands';
import { Competitors } from './resources/competitors';
import { Me } from './resources/identity';
import { Models } from './resources/models';
import { Organizations } from './resources/organizations';
import { Prompts } from './resources/prompts';
import { Reports } from './resources/reports';
import type { CallerOptions } from './resources/shared';
import { ElmoResource } from './resources/shared';
import { Tools } from './resources/tools';
import type { DateRange, TagsFilter } from './types/analytics';
import type {
  Brand,
  BrandsList,
  CreateBrandErrors,
  CreateBrandParams,
  CreateBrandRequest,
  CreateBrandResponse,
  CreateBrandResponses,
  GetBrandErrors,
  GetBrandResponse,
  GetBrandResponses,
  ListBrandsErrors,
  ListBrandsParams,
  ListBrandsResponse,
  ListBrandsResponses,
  UpdateBrandErrors,
  UpdateBrandParams,
  UpdateBrandRequest,
  UpdateBrandResponse,
  UpdateBrandResponses,
} from './types/brands';
import type {
  Competitor,
  CompetitorsList,
  CreateCompetitorErrors,
  CreateCompetitorParams,
  CreateCompetitorRequest,
  CreateCompetitorResponse,
  CreateCompetitorResponses,
  DeleteCompetitorErrors,
  DeleteCompetitorResponse,
  DeleteCompetitorResponses,
  GetCompetitorErrors,
  GetCompetitorResponse,
  GetCompetitorResponses,
  ListCompetitorsErrors,
  ListCompetitorsParams,
  ListCompetitorsResponse,
  ListCompetitorsResponses,
  UpdateCompetitorErrors,
  UpdateCompetitorParams,
  UpdateCompetitorRequest,
  UpdateCompetitorResponse,
  UpdateCompetitorResponses,
} from './types/competitors';
import type { ApiKeyIdentity, GetMeErrors, GetMeResponse, GetMeResponses } from './types/identity';
import type {
  ListModelsErrors,
  ListModelsResponse,
  ListModelsResponses,
  Model,
  ModelList,
} from './types/models';
import type {
  GetOrganizationErrors,
  GetOrganizationResponse,
  GetOrganizationResponses,
  ListOrganizationsErrors,
  ListOrganizationsParams,
  ListOrganizationsResponse,
  ListOrganizationsResponses,
  Organization,
  OrganizationList,
} from './types/organizations';
import type {
  CreatePromptErrors,
  CreatePromptParams,
  CreatePromptRequest,
  CreatePromptResponse,
  CreatePromptResponses,
  DeletePromptErrors,
  DeletePromptResponse,
  DeletePromptResponses,
  GetPromptErrors,
  GetPromptResponse,
  GetPromptResponses,
  ListPromptsErrors,
  ListPromptsParams,
  ListPromptsResponse,
  ListPromptsResponses,
  Prompt,
  UpdatePromptErrors,
  UpdatePromptParams,
  UpdatePromptRequest,
  UpdatePromptResponse,
  UpdatePromptResponses,
} from './types/prompts';
import type {
  CreateReportErrors,
  CreateReportParams,
  CreateReportRequest,
  CreateReportResponse,
  CreateReportResponses,
  GetReportErrors,
  GetReportParams,
  GetReportResponse,
  GetReportResponses,
  ListReportsErrors,
  ListReportsParams,
  ListReportsResponse,
  ListReportsResponses,
  ReportPromptSnapshot,
  ReportSummary,
} from './types/reports';
import type {
  BrandIdPath,
  ConflictError as ConflictError2,
  Error,
  ForbiddenError,
  InternalServerError as InternalServerError2,
  Limit,
  MentionEntry,
  MentionsSummary,
  ModelFilter,
  NotFoundError as NotFoundError2,
  Page as Page2,
  Pagination,
  PaymentRequiredError as PaymentRequiredError2,
  RateLimitError as RateLimitError2,
  UnauthorizedError,
  ValidationError,
  WindowEnd,
  WindowStart,
} from './types/shared';
import type {
  AnalyzeBrandErrors,
  AnalyzeBrandParams,
  AnalyzeBrandRequest,
  AnalyzeBrandResponse,
  AnalyzeBrandResponses,
  OnboardingSuggestion,
} from './types/tools';

export type BaseUrl = `${string}://${string}/api/v1` | (string & {});

/**
 * How this client sends calls. Set on the client, or on one call to
 * override it there.
 */
export type BehaviorOptions = {
  /**
   * Specify a custom `fetch` implementation.
   *
   * Defaults to the global `fetch`, read for each request.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Additional `RequestInit` options passed to `fetch` calls.
   *
   * A call that sets this replaces the whole block the client set.
   */
  fetchOptions?: FetchOptions;
  /**
   * Run your own hooks around every call. Each is an array of functions, which
   * may be async.
   *
   * `request` reads the request after the credentials are on it and before it is
   * sent. `response` and `error` each return what the caller reads, so a hook
   * that only observes returns what it was given.
   */
  interceptors?: Interceptors;
  /**
   * Set the log level. Raise it to see what each call sent and what came back.
   * `'debug'` adds headers, with credentials hidden.
   *
   * Read from the `ELMO_LOG` environment variable when unset.
   *
   * @default 'off'
   */
  logLevel?: LogLevel;
  /**
   * Set the logger. Anything with `debug`, `error`, `info` and `warn` methods.
   * Defaults to `globalThis.console`.
   */
  logger?: Logger;
  /**
   * The most pages one walk fetches before it stops. Stepping through
   * `getNextPage()` by hand is not capped.
   *
   * @default 1000
   */
  maxPages?: number;
  /**
   * The maximum number of times a failed call is sent again.
   *
   * A shorthand for `retry: { attempts: maxRetries + 1 }`. It counts attempts
   * and nothing else: a call that may already have been acted on is sent again
   * only after 408, 425 or 429, or where it carries its API's idempotency key.
   * `retry.methods` widens that.
   *
   * @default 2
   */
  maxRetries?: number;
  /**
   * How a failed call is retried, or `false` to send it once. A call whose body
   * is a stream is always sent once.
   *
   * @default { attempts: 3 }
   */
  retry?: RetryOptions | boolean;
  /**
   * The maximum time one attempt may run.
   *
   * Set `false` or `0` for no limit, or a function that takes the operation as
   * `METHOD /path` and returns its limit.
   *
   * @default 60000
   *
   * @unit milliseconds
   */
  timeout?: TimeoutValue;
  /**
   * Send calls through a transport of your own, for an HTTP library
   * this client does not use.
   *
   * To swap the `fetch` it calls, use `fetch` or `fetchOptions`.
   */
  transport?: Transport<string, 'unary'>;
};

/**
 * The credentials this API takes, each under its own name.
 *
 * Given to the constructor, one is sent with every call. Given to a call,
 * it is sent with that call alone.
 */
export type ClientCredentials = {
  /**
   * An instance admin key from `ADMIN_API_KEYS`, or an organization key
   * (`elmo_…`) issued from the dashboard.
   *
   * Read from the `ELMO_API_KEY` environment variable when unset.
   */
  apiKey?: CredentialValue;
};

/** The options particular to this API. */
export type ClientNarrowing = {
  /**
   * Override the base URL calls are sent to.
   *
   * Read from the `ELMO_BASE_URL` environment variable when unset.
   */
  baseUrl?: BaseUrl;
  /**
   * Headers to send with every call.
   *
   * Merged per name with whatever a call sets, and `null` drops one.
   */
  defaultHeaders?: MetadataOptions['headers'];
  /**
   * Path parameters every call starts from.
   *
   * Merged per name with whatever a call sets.
   */
  defaultPath?: MetadataOptions['path'];
  /**
   * Query parameters to add to every call.
   *
   * Merged per name with whatever a call sets, and `null` drops one.
   */
  defaultQuery?: MetadataOptions['query'];
};

/** Everything a client can be built with, and the defaults every call starts from. */
export type ClientOptions = BehaviorOptions &
  BodySerializerOptions &
  ClientCredentials &
  ClientNarrowing &
  CredentialOptions;

const declaredCredentials = { apiKey: { variable: 'ELMO_API_KEY' } };

let fetchTransportInstance: ReturnType<typeof createFetchTransport> | undefined;

export function fetchTransport() {
  return (fetchTransportInstance ??= createFetchTransport());
}

let clientInstance: ReturnType<typeof createClient> | undefined;

export function client() {
  return (clientInstance ??= createClient({
    accept: 'application/json',
    aliases: {
      defaultHeaders: 'headers',
      defaultPath: 'path',
      defaultQuery: 'query',
    },
    codecs: [jsonCodec],
    credentials: declaredCredentials,
    defaults: envDefaults(
      createConfig({
        baseUrl: '/api/v1',
        headers: { 'user-agent': 'elmo-sdk/0.1.0 (typescript)' },
      }),
      {
        baseUrl: 'ELMO_BASE_URL',
        logLevel: 'ELMO_LOG',
        credentials: declaredCredentials,
      },
    ),
    encodeBody,
    features: [
      authFeature({ schemes: declaredCredentials }),
      retryFeature(),
      loggerFeature(),
      timeoutFeature(),
      interceptorsFeature(),
      validateFeature(),
    ],
    protocol: oneProtocol({
      binding: createRestBinding(simpleAddress),
      transport: fetchTransport(),
    }),
  }));
}

/**
 * A client for this API. Options given here apply to every call made
 * through it. Pass it to a call, or to an SDK, in place of the default one.
 *
 * @example
 * const elmo = createElmoClient({ apiKey: '…' });
 */
export function createElmoClient(options?: ClientOptions): Client {
  return clientFor(options, client());
}

/**
 * The Elmo API, as one object to call through.
 *
 * Pass `apiKey`, or set `ELMO_API_KEY` and pass nothing.
 *
 * Options given here apply to every call it makes.
 *
 * @example
 * const elmo = new Elmo();
 * await elmo.brands.list();
 */
export class Elmo extends ElmoResource {
  constructor(
    args?:
      | (ClientOptions & {
          client?: never;
        })
      | {
          /**
           * A client to dispatch through, in place of one built from options.
           *
           * For sharing one configured client across several SDKs, or for
           * one built with `createElmoClient`.
           */
          client: Client;
        },
  ) {
    super(clientFor(args, client()));
  }

  private _brands?: Brands;
  /** Manage brand records */
  get brands(): Brands {
    return (this._brands ??= new Brands(this.client));
  }

  private _competitors?: Competitors;
  /** Manage brand competitors */
  get competitors(): Competitors {
    return (this._competitors ??= new Competitors(this.client));
  }

  private _me?: Me;
  /** What the calling key is and what it may reach */
  get me(): Me {
    return (this._me ??= new Me(this.client));
  }

  private _models?: Models;
  /** The answer engines this deployment can track */
  get models(): Models {
    return (this._models ??= new Models(this.client));
  }

  private _organizations?: Organizations;
  /** Organizations, their plan limits, and their usage */
  get organizations(): Organizations {
    return (this._organizations ??= new Organizations(this.client));
  }

  private _prompts?: Prompts;
  /** Manage brand prompts */
  get prompts(): Prompts {
    return (this._prompts ??= new Prompts(this.client));
  }

  private _reports?: Reports;
  /** Generate and retrieve AI Share of Voice reports */
  get reports(): Reports {
    return (this._reports ??= new Reports(this.client));
  }

  private _tools?: Tools;
  /** One-shot helpers (e.g. brand analysis) that don't persist anything */
  get tools(): Tools {
    return (this._tools ??= new Tools(this.client));
  }

  /** Thrown when the request was called off before the API answered. */
  static AbortError = AbortError;
  /** A failure the API answered with, so there is a status and a reply to read. */
  static ApiError = ApiError;
  /** No usable credential reached the API: it was missing, unreadable, or rejected. */
  static AuthenticationError = AuthenticationError;
  /** The API could not read the request, so it did not act on it. */
  static BadRequestError = BadRequestError;
  /** The call collided with the resource's current state: a duplicate, or a concurrent change. */
  static ConflictError = ConflictError;
  /** A reply from the API that this SDK could not read, whatever its status. */
  static DecodeError = DecodeError;
  /** The base of every error this SDK throws, including one from a call that never arrived. */
  static ElmoError = ElmoError;
  /** The API failed after accepting the call. Every status from 500 up arrives as this. */
  static InternalServerError = InternalServerError;
  /** Thrown before the request goes out, when no credential satisfied the call. */
  static MissingCredentialError = MissingCredentialError;
  /** Nothing is at this address, or the credential may not see what is. */
  static NotFoundError = NotFoundError;
  /** The plan or the quota on this account does not cover the call. */
  static PaymentRequiredError = PaymentRequiredError;
  /** The credential was accepted, but it does not grant this call. */
  static PermissionDeniedError = PermissionDeniedError;
  /** Too many calls. {@link ApiError.retryAfter} carries how long the API asked to wait. */
  static RateLimitError = RateLimitError;
  /**
   * Thrown when the API sent nothing for as long as the call allowed, before the
   * reply arrived or between two pieces of its body.
   */
  static TimeoutError = TimeoutError;
  /** Thrown when no answer arrived, so there is no status to go on. */
  static TransportError = TransportError;
  /** The request was read, and its contents were rejected. */
  static UnprocessableEntityError = UnprocessableEntityError;
}

export declare namespace Elmo {
  export type {
    AnalyzeBrandErrors,
    AnalyzeBrandParams,
    AnalyzeBrandRequest,
    AnalyzeBrandResponse,
    AnalyzeBrandResponses,
    ApiErrorOf,
    ApiKeyIdentity,
    AuthResolver,
    AuthScheme,
    AuthToken,
    AuthValue,
    BackoffOptions,
    BaseUrl,
    BodyInput,
    BodyPayload,
    Brand,
    BrandIdPath,
    Brands,
    BrandsList,
    CallerOptions,
    CallResult,
    CallTimeout,
    Client,
    ClientOptions,
    Competitor,
    Competitors,
    CompetitorsList,
    ConflictError2 as ConflictErrorResponse,
    CreateBrandErrors,
    CreateBrandParams,
    CreateBrandRequest,
    CreateBrandResponse,
    CreateBrandResponses,
    CreateCompetitorErrors,
    CreateCompetitorParams,
    CreateCompetitorRequest,
    CreateCompetitorResponse,
    CreateCompetitorResponses,
    CreatePromptErrors,
    CreatePromptParams,
    CreatePromptRequest,
    CreatePromptResponse,
    CreatePromptResponses,
    CreateReportErrors,
    CreateReportParams,
    CreateReportRequest,
    CreateReportResponse,
    CreateReportResponses,
    CredentialValue,
    DateRange,
    DeleteCompetitorErrors,
    DeleteCompetitorResponse,
    DeleteCompetitorResponses,
    DeletePromptErrors,
    DeletePromptResponse,
    DeletePromptResponses,
    Error,
    ErrorMode,
    FailureBody,
    Feature,
    FetchOptions,
    ForbiddenError,
    GetBrandErrors,
    GetBrandResponse,
    GetBrandResponses,
    GetCompetitorErrors,
    GetCompetitorResponse,
    GetCompetitorResponses,
    GetMeErrors,
    GetMeResponse,
    GetMeResponses,
    GetOrganizationErrors,
    GetOrganizationResponse,
    GetOrganizationResponses,
    GetPromptErrors,
    GetPromptResponse,
    GetPromptResponses,
    GetReportErrors,
    GetReportParams,
    GetReportResponse,
    GetReportResponses,
    InternalServerError2 as InternalServerErrorResponse,
    Limit,
    ListBrandsErrors,
    ListBrandsParams,
    ListBrandsResponse,
    ListBrandsResponses,
    ListCompetitorsErrors,
    ListCompetitorsParams,
    ListCompetitorsResponse,
    ListCompetitorsResponses,
    ListModelsErrors,
    ListModelsResponse,
    ListModelsResponses,
    ListOrganizationsErrors,
    ListOrganizationsParams,
    ListOrganizationsResponse,
    ListOrganizationsResponses,
    ListPromptsErrors,
    ListPromptsParams,
    ListPromptsResponse,
    ListPromptsResponses,
    ListReportsErrors,
    ListReportsParams,
    ListReportsResponse,
    ListReportsResponses,
    LogFn,
    Logger,
    LogLevel,
    Me,
    MentionEntry,
    MentionsSummary,
    MetadataInput,
    Model,
    ModelFilter,
    ModelList,
    Models,
    NotFoundError2 as NotFoundErrorResponse,
    OnboardingSuggestion,
    Organization,
    OrganizationList,
    Organizations,
    Page,
    PageEnvelope,
    Page2 as PageParameter,
    PagePromise,
    PageResult,
    Pagination,
    PaymentRequiredError2 as PaymentRequiredErrorResponse,
    PreparedRequest,
    Prompt,
    Prompts,
    RateLimitError2 as RateLimitErrorResponse,
    ReportPromptSnapshot,
    Reports,
    ReportSummary,
    RestCallPromise,
    Result,
    ResultEnvelope,
    RetryAfterHeader,
    RetryOptions,
    RetryRules,
    TagsFilter,
    TimeoutPolicy,
    TimeoutValue,
    Tools,
    Transport,
    TransportErrorKind,
    TransportInteraction,
    UnauthorizedError,
    UpdateBrandErrors,
    UpdateBrandParams,
    UpdateBrandRequest,
    UpdateBrandResponse,
    UpdateBrandResponses,
    UpdateCompetitorErrors,
    UpdateCompetitorParams,
    UpdateCompetitorRequest,
    UpdateCompetitorResponse,
    UpdateCompetitorResponses,
    UpdatePromptErrors,
    UpdatePromptParams,
    UpdatePromptRequest,
    UpdatePromptResponse,
    UpdatePromptResponses,
    ValidationError,
    WindowEnd,
    WindowStart,
  };
}
