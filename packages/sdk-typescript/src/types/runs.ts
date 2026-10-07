import type {
  ForbiddenError,
  InternalServerError,
  Limit,
  ModelFilter,
  NotFoundError,
  Page,
  Pagination,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  WindowEnd,
  WindowStart,
} from './shared';

/** A single model answer, without its text. Fetch `GET /prompts/{promptId}/runs/{runId}` for the answer itself. */
export type RunSummary = {
  brandId: string;
  brandMentioned: boolean;
  citationCount: number;
  competitorsMentioned: Array<string>;
  createdAt: Date;
  id: string;
  model: string;
  promptId: string;
  /** How the answer was obtained. Informational; not a stable enum. */
  provider: string | null;
  /** Searches the engine ran, where it exposes them. */
  webQueries: Array<string>;
  /** Whether the engine answered with its own web search on. */
  webSearchEnabled: boolean;
};

export type RunCitation = {
  /** Position within the answer's citation list. */
  citationIndex: number;
  domain: string;
  title: string | null;
  url: string;
};

/** One model answer with its normalized text and citations. */
export type Run = RunSummary & {
  answer: {
    /** The answer, normalized out of the provider's response. Null when nothing could be extracted. */
    text: string | null;
  };
  citations: Array<RunCitation>;
};

export type RunList = {
  data: Array<RunSummary>;
  pagination: Pagination;
};

export type ListPromptRunsErrors = {
  /** Invalid request data */
  400: ValidationError;
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Resource not found */
  404: NotFoundError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListPromptRunsResponses = {
  /** List runs for a prompt */
  200: RunList;
};

export type ListPromptRunsResponse = ListPromptRunsResponses[keyof ListPromptRunsResponses];

export type GetRunErrors = {
  /** Invalid request data */
  400: ValidationError;
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Resource not found */
  404: NotFoundError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type GetRunResponses = {
  /** Get a run */
  200: Run;
};

export type GetRunResponse = GetRunResponses[keyof GetRunResponses];

export type ListPromptRunsParams = {
  /** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
  start: WindowStart;
  /** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
  end: WindowEnd;
  /** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
  model?: ModelFilter;
  /**
   * Page number, 1-based.
   *
   * @default 1
   * @minimum 1
   */
  page?: Page;
  /**
   * Items per page. Values above the maximum are clamped, not rejected.
   *
   * @default 20
   * @minimum 1
   * @maximum 100
   */
  limit?: Limit;
};
