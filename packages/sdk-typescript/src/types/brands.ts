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

/** Update brand-level fields. At least one field must be provided. Provided arrays replace the stored values verbatim. When `domains` is provided, the first entry becomes the primary website and the rest become additional domains. Prompts and competitors are managed via /prompts and /competitors. */
export type UpdateBrandRequest = {
  aliases?: Array<string>;
  /** @minLength 1 */
  brandName?: string;
  /**
   * Brand domains. The first entry is the primary website; remaining entries are additional domains.
   *
   * @minItems 1
   */
  domains?: Array<string>;
  /** Whether the brand is sampled at all. **Modifiable only with an instance admin key**: setting it with an organization key is a `403`, because disabling ends tracking silently while the plan keeps being billed and no dashboard control does it at any role. */
  enabled?: boolean;
};

export type Brand = {
  aliases: Array<string>;
  createdAt: Date;
  /** Sampling cadence override in hours. Null means the plan cadence. */
  delayOverrideHours: number | null;
  /** Brand domains. The first entry is the primary website; remaining entries are additional domains. */
  domains: Array<string>;
  enabled: boolean;
  /** Models this brand is tracked on. Null means the deployment default. */
  enabledModels: Array<string> | null;
  /** User-supplied brand identifier (e.g. "acme") */
  id: string;
  name: string;
  onboarded: boolean;
  /** The organization that owns this brand and is billed for it. */
  organizationId: string;
  updatedAt: Date;
};

export type BrandsList = {
  /**
   * Deprecated: read `data` instead. Kept while the one known consumer migrates, and removed in a future release.
   *
   * @deprecated
   */
  brands: Array<Brand>;
  /** The items on this page. Read this rather than the named key below. */
  data: Array<Brand>;
  pagination: Pagination;
};

export type ListBrandsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListBrandsResponses = {
  /** Paginated list of brands */
  200: BrandsList;
};

export type ListBrandsResponse = ListBrandsResponses[keyof ListBrandsResponses];

export type CreateBrandErrors = {
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

export type CreateBrandResponses = {
  /** Brand created */
  201: Brand;
};

export type CreateBrandResponse = CreateBrandResponses[keyof CreateBrandResponses];

export type GetBrandErrors = {
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

export type GetBrandResponses = {
  /** Brand */
  200: Brand;
};

export type GetBrandResponse = GetBrandResponses[keyof GetBrandResponses];

export type UpdateBrandErrors = {
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

export type UpdateBrandResponses = {
  /** Brand updated */
  200: Brand;
};

export type UpdateBrandResponse = UpdateBrandResponses[keyof UpdateBrandResponses];

/** Create a brand. Skips onboarding. The first entry in `domains` is treated as the brand's primary website; the rest are stored as additional domains. */
export type CreateBrandRequest = {
  aliases?: Array<string>;
  competitors?: Array<{
    aliases?: Array<string>;
    domains?: Array<string>;
    /** @minLength 1 */
    name: string;
  }>;
  /**
   * Brand domains. The first entry is the primary website; remaining entries are additional domains.
   *
   * @minItems 1
   */
  domains: Array<string>;
  /** @minLength 1 */
  id: string;
  /** @minLength 1 */
  name: string;
  /**
   * Organization to create the brand in.
   *
   * | | Omitted | Present |
   * | --- | --- | --- |
   * | **Organization key** | creates in the key's own organization | must name the key's own organization; any other value is a `400` |
   * | **Admin key** | provisions a new organization named after the brand id | creates in the named organization, which must already exist — `404` if it does not |
   *
   * An admin key omitting this field is currently the only way to create an organization over the API.
   */
  organizationId?: string;
  prompts?: Array<{
    /** @default true */
    enabled?: boolean;
    tags?: Array<string>;
    /** @minLength 1 */
    value: string;
  }>;
};

export type ListBrandsParams = {
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

export type CreateBrandParams = {
  /** @minLength 1 */
  id: string;
  /** @minLength 1 */
  name: string;
  /**
   * Brand domains. The first entry is the primary website; remaining entries are additional domains.
   *
   * @minItems 1
   */
  domains: Array<string>;
  aliases?: Array<string>;
  competitors?: Array<{
    aliases?: Array<string>;
    domains?: Array<string>;
    /** @minLength 1 */
    name: string;
  }>;
  prompts?: Array<{
    /** @default true */
    enabled?: boolean;
    tags?: Array<string>;
    /** @minLength 1 */
    value: string;
  }>;
  /**
   * Organization to create the brand in.
   *
   * | | Omitted | Present |
   * | --- | --- | --- |
   * | **Organization key** | creates in the key's own organization | must name the key's own organization; any other value is a `400` |
   * | **Admin key** | provisions a new organization named after the brand id | creates in the named organization, which must already exist — `404` if it does not |
   *
   * An admin key omitting this field is currently the only way to create an organization over the API.
   */
  organizationId?: string;
};

export type UpdateBrandParams = {
  /** @minLength 1 */
  brandName?: string;
  /**
   * Brand domains. The first entry is the primary website; remaining entries are additional domains.
   *
   * @minItems 1
   */
  domains?: Array<string>;
  aliases?: Array<string>;
  /** Whether the brand is sampled at all. **Modifiable only with an instance admin key**: setting it with an organization key is a `403`, because disabling ends tracking silently while the plan keeps being billed and no dashboard control does it at any role. */
  enabled?: boolean;
};
