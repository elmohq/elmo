import type {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  Limit,
  NotFoundError,
  Page,
  Pagination,
  PaymentRequiredError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from './shared';

export type Competitor = {
  aliases: Array<string>;
  brandId: string;
  createdAt: Date;
  domains: Array<string>;
  id: string;
  name: string;
  updatedAt: Date;
};

export type CompetitorsList = {
  /**
   * Deprecated: read `data` instead. Kept while the one known consumer migrates, and removed in a future release.
   *
   * @deprecated
   */
  competitors: Array<Competitor>;
  /** The items on this page. Read this rather than the named key below. */
  data: Array<Competitor>;
  pagination: Pagination;
};

/** Add a competitor to a brand. */
export type CreateCompetitorRequest = {
  aliases?: Array<string>;
  /** @minLength 1 */
  brandId: string;
  domains?: Array<string>;
  /** @minLength 1 */
  name: string;
};

/** Update a competitor. At least one field must be provided. Provided arrays replace the stored values verbatim. */
export type UpdateCompetitorRequest = {
  aliases?: Array<string>;
  domains?: Array<string>;
  /** @minLength 1 */
  name?: string;
};

export type ListCompetitorsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListCompetitorsResponses = {
  /** Paginated list of competitors */
  200: CompetitorsList;
};

export type ListCompetitorsResponse = ListCompetitorsResponses[keyof ListCompetitorsResponses];

export type CreateCompetitorErrors = {
  /** Invalid request data */
  400: ValidationError;
  /** Authentication required */
  401: UnauthorizedError;
  /** The organization has no active subscription. Cloud deployments only. */
  402: PaymentRequiredError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Resource already exists */
  409: ConflictError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type CreateCompetitorResponses = {
  /** Competitor created */
  201: Competitor;
};

export type CreateCompetitorResponse = CreateCompetitorResponses[keyof CreateCompetitorResponses];

export type DeleteCompetitorErrors = {
  /** Invalid request data */
  400: ValidationError;
  /** Authentication required */
  401: UnauthorizedError;
  /** The organization has no active subscription. Cloud deployments only. */
  402: PaymentRequiredError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Resource not found */
  404: NotFoundError;
  /** Resource already exists */
  409: ConflictError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type DeleteCompetitorResponses = {
  /** Competitor deleted (returns the deleted competitor) */
  200: Competitor;
};

export type DeleteCompetitorResponse = DeleteCompetitorResponses[keyof DeleteCompetitorResponses];

export type GetCompetitorErrors = {
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

export type GetCompetitorResponses = {
  /** Competitor */
  200: Competitor;
};

export type GetCompetitorResponse = GetCompetitorResponses[keyof GetCompetitorResponses];

export type UpdateCompetitorErrors = {
  /** Invalid request data */
  400: ValidationError;
  /** Authentication required */
  401: UnauthorizedError;
  /** The organization has no active subscription. Cloud deployments only. */
  402: PaymentRequiredError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Resource not found */
  404: NotFoundError;
  /** Resource already exists */
  409: ConflictError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type UpdateCompetitorResponses = {
  /** Competitor updated */
  200: Competitor;
};

export type UpdateCompetitorResponse = UpdateCompetitorResponses[keyof UpdateCompetitorResponses];

export type ListCompetitorsParams = {
  brandId?: string;
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

export type CreateCompetitorParams = {
  /** @minLength 1 */
  brandId: string;
  /** @minLength 1 */
  name: string;
  domains?: Array<string>;
  aliases?: Array<string>;
};

export type UpdateCompetitorParams = {
  /** @minLength 1 */
  name?: string;
  domains?: Array<string>;
  aliases?: Array<string>;
};
