import type {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  Page,
  PaymentRequiredError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from './shared';

export type Prompt = {
  /** Brand identifier this prompt belongs to */
  brandId: string;
  /** Timestamp when the prompt was created */
  createdAt: Date;
  /** Whether the prompt is currently enabled */
  enabled: boolean;
  /** Unique identifier for the prompt */
  id: string;
  /** Models this prompt is tracked on grounded. Each entry spends one premium pairing. */
  premiumModels: Array<string>;
  /** Auto-computed system tags (e.g., 'branded', 'unbranded'). Read-only. */
  systemTags: Array<string>;
  /** User-defined tags for categorizing this prompt */
  tags: Array<string>;
  /** Timestamp when the prompt was last updated */
  updatedAt: Date;
  /** The actual prompt text */
  value: string;
};

export type CreatePromptRequest = {
  /** Brand identifier this prompt belongs to */
  brandId: string;
  /** User-defined tags for categorizing this prompt */
  tags?: Array<string>;
  /**
   * The prompt text
   *
   * @minLength 1
   */
  value: string;
};

export type UpdatePromptRequest = {
  /** Whether the prompt is enabled */
  enabled?: boolean;
  /** Replaces the prompt's grounded models. Checked against the organization's premium pool. */
  premiumModels?: Array<string>;
  /** User-defined tags for categorizing this prompt */
  tags?: Array<string>;
  /**
   * The prompt text
   *
   * @minLength 1
   */
  value?: string;
};

export type ListPromptsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListPromptsResponses = {
  /** List of prompts */
  200: {
    /** The items on this page. Read this rather than the named key below. */
    data: Array<Prompt>;
    pagination: {
      limit: number;
      page: number;
      total: number;
      totalPages: number;
    };
    /**
     * Deprecated: read `data` instead. Kept while the one known consumer migrates, and removed in a future release.
     *
     * @deprecated
     */
    prompts: Array<Prompt>;
  };
};

export type ListPromptsResponse = ListPromptsResponses[keyof ListPromptsResponses];

export type CreatePromptErrors = {
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

export type CreatePromptResponses = {
  /** Prompt created successfully */
  201: Prompt;
};

export type CreatePromptResponse = CreatePromptResponses[keyof CreatePromptResponses];

export type DeletePromptErrors = {
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

export type DeletePromptResponses = {
  /** Prompt deleted (returns the deleted prompt) */
  200: Prompt & {
    /** Number of related prompt_runs rows deleted by the cascade. */
    deletedRunsCount: number;
  };
};

export type DeletePromptResponse = DeletePromptResponses[keyof DeletePromptResponses];

export type GetPromptErrors = {
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

export type GetPromptResponses = {
  /** Prompt details */
  200: Prompt;
};

export type GetPromptResponse = GetPromptResponses[keyof GetPromptResponses];

export type UpdatePromptErrors = {
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

export type UpdatePromptResponses = {
  /** Prompt updated successfully */
  200: Prompt;
};

export type UpdatePromptResponse = UpdatePromptResponses[keyof UpdatePromptResponses];

export type ListPromptsParams = {
  /** Filter prompts by brand ID */
  brandId?: string;
  /**
   * Page number, 1-based.
   *
   * @default 1
   * @minimum 1
   */
  page?: Page;
  /**
   * Items per page. Values above the maximum are clamped, not rejected. This list had no ceiling before, so the maximum is set to bound a runaway query rather than to change what an existing caller gets back.
   *
   * @default 20
   * @minimum 1
   * @maximum 1000
   */
  limit?: number;
  /** Only prompts with this tracking state. */
  enabled?: boolean;
  /** Comma-separated tags. A prompt matches if it carries any of them. */
  tags?: string;
  /** Case-insensitive substring match on prompt text. */
  q?: string;
};

export type CreatePromptParams = {
  /** Brand identifier this prompt belongs to */
  brandId: string;
  /**
   * The prompt text
   *
   * @minLength 1
   */
  value: string;
  /** User-defined tags for categorizing this prompt */
  tags?: Array<string>;
};

export type UpdatePromptParams = {
  /**
   * The prompt text
   *
   * @minLength 1
   */
  value?: string;
  /** Whether the prompt is enabled */
  enabled?: boolean;
  /** User-defined tags for categorizing this prompt */
  tags?: Array<string>;
  /** Replaces the prompt's grounded models. Checked against the organization's premium pool. */
  premiumModels?: Array<string>;
};
