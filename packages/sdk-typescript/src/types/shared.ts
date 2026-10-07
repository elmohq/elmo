export type Error = {
  /** Stable machine-readable code. Deliberately not an enum: new values are added without a version bump, so treat an unrecognized one as its HTTP status implies. Currently: `unauthorized`, `insufficient_scope`, `forbidden`, `not_found`, `validation_error`, `conflict`, `rate_limited`, `method_not_allowed`, `read_only`, `no_active_plan`, `brand_limit`, `prompt_limit`, `model_not_in_plan`, `model_picks_exceeded`, `premium_not_in_plan`, `premium_pool_exhausted`, `cadence_faster_than_plan`, `internal_error`. */
  code?: string;
  /** Error type */
  error: string;
  /** Detailed error message */
  message?: string;
};

/** Aggregated mention counts for a prompt across its evaluation runs. */
export type MentionsSummary = {
  /** Number of runs where the brand was mentioned */
  brandMentionsTotal: number;
  /** Total count of individual competitor mentions across all runs (a single run mentioning 3 competitors counts as 3) */
  competitorMentionsTotal: number;
  /** Top-K competitor entities ranked by mention count */
  mentionsTopK: Array<MentionEntry>;
  /** Total brand + competitor mentions across all runs */
  mentionsTotal: number;
};

export type MentionEntry = {
  /** Number of runs where this entity was mentioned */
  count?: number;
  /** Competitor entity name */
  entity: string;
};

export type Pagination = {
  limit: number;
  page: number;
  /** Total items matching the request. */
  total: number;
  totalPages: number;
};

/** Brand identifier. */
export type BrandIdPath = string;

/**
 * Page number, 1-based.
 *
 * @default 1
 * @minimum 1
 */
export type Page = number;

/**
 * Items per page. Values above the maximum are clamped, not rejected.
 *
 * @default 20
 * @minimum 1
 * @maximum 100
 */
export type Limit = number;

/** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
export type WindowStart = Date;

/** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
export type WindowEnd = Date;

/** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
export type ModelFilter = string;

/** Authentication required */
export type UnauthorizedError = Error;

/** Resource not found */
export type NotFoundError = Error;

/** Invalid request data */
export type ValidationError = Error;

/** Internal server error */
export type InternalServerError = Error;

/** Resource already exists */
export type ConflictError = Error;

/** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
export type ForbiddenError = Error;

/** Per-key rate limit exceeded. */
export type RateLimitError = Error;

/** The organization has no active subscription. Cloud deployments only. */
export type PaymentRequiredError = Error;
