import type {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  Limit,
  MentionsSummary,
  NotFoundError,
  Page,
  PaymentRequiredError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from './shared';

export type CreateReportRequest = {
  /**
   * The brand name to analyze
   *
   * @minLength 1
   */
  brandName: string;
  /**
   * The brand's website — a domain (nike.com) or a full URL. A URL with a path (e.g. https://www.nike.com/golf) scopes the analysis to that page; mentions are tracked against its domain either way.
   *
   * @minLength 1
   */
  brandWebsite: string;
  /** Optional list of custom prompts to include in the report */
  manualPrompts?: Array<string>;
};

export type ReportSummary = {
  /** Brand name analyzed */
  brandName: string;
  /** Brand website URL */
  brandWebsite: string;
  /** Timestamp when the report completed */
  completedAt: Date | null;
  /** Timestamp when the report was created */
  createdAt: Date;
  /** Unique identifier for the report */
  id: string;
  /** Current report status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
};

/** Per-prompt snapshot of raw mention data from a report. Consumers compute SoV and other derived metrics. */
export type ReportPromptSnapshot = {
  mentions: MentionsSummary;
  /** The prompt text that was evaluated */
  promptValue: string;
  /** Number of evaluation runs for this prompt */
  totalRuns: number;
};

export type ListReportsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListReportsResponses = {
  /** Paginated list of reports */
  200: {
    /** The items on this page. Read this rather than the named key below. */
    data: Array<ReportSummary>;
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
    reports: Array<ReportSummary>;
  };
};

export type ListReportsResponse = ListReportsResponses[keyof ListReportsResponses];

export type CreateReportErrors = {
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

export type CreateReportResponses = {
  /** Report created and queued for generation */
  201: {
    brandName: string;
    brandWebsite: string;
    createdAt: Date;
    /** Unique identifier for the created report */
    reportId: string;
    /** Initial report status */
    status: 'pending';
  };
};

export type CreateReportResponse = CreateReportResponses[keyof CreateReportResponses];

export type GetReportErrors = {
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

export type GetReportResponses = {
  /** Report status and data. When status is 'completed', includes per-prompt snapshot data with raw mention counts. */
  200: {
    brandName: string;
    brandWebsite: string;
    completedAt: Date | null;
    createdAt: Date;
    /** Generation progress percentage (0-100). Available while processing. */
    progress?: number;
    /** Per-prompt snapshot data. Only present when status is 'completed'. */
    prompts?: Array<ReportPromptSnapshot>;
    reportId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    /** Derived stats (SoV, visibility, etc.). Format may change between versions. Only present when status is 'completed'. */
    unstable?: {
      /** Per-competitor SoV breakdown, sorted by SoV descending */
      competitors?: Array<{
        /** Competitor name */
        name: string;
        /** Number of individual prompt runs where this competitor was mentioned */
        promptRunsWithMentions: number;
        /** Number of prompts where this competitor was mentioned in at least one run */
        promptsWithMentions: number;
        /**
         * Share of voice (0-1): this competitor's mentions / total mentions (brand + all competitors)
         *
         * @minimum 0
         * @maximum 1
         */
        sov: number;
        /**
         * Visibility (0-1): prompt runs mentioning this competitor / total prompt runs
         *
         * @minimum 0
         * @maximum 1
         */
        visibility: number;
      }>;
      /** Number of individual prompt runs where the brand was mentioned */
      promptRunsWithBrandMentions?: number;
      /** Number of prompts where the brand was mentioned in at least one prompt run */
      promptsWithBrandMentions?: number;
      /**
       * Overall share of voice (0-1): brand_mentions / (brand_mentions + competitor_mentions). Null when no mentions at all.
       *
       * @minimum 0
       * @maximum 1
       */
      sov?: number | null;
      /** Total number of prompt runs across all prompts (each prompt is executed multiple times across different AI engines) */
      totalPromptRuns?: number;
      /** Total number of prompts evaluated */
      totalPrompts?: number;
      /**
       * Brand visibility (0-1): brand_mentions / total_prompt_runs (how often the brand appears at all across all prompt runs)
       *
       * @minimum 0
       * @maximum 1
       */
      visibility?: number;
    };
  };
};

export type GetReportResponse = GetReportResponses[keyof GetReportResponses];

export type ListReportsParams = {
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

export type CreateReportParams = {
  /**
   * The brand name to analyze
   *
   * @minLength 1
   */
  brandName: string;
  /**
   * The brand's website — a domain (nike.com) or a full URL. A URL with a path (e.g. https://www.nike.com/golf) scopes the analysis to that page; mentions are tracked against its domain either way.
   *
   * @minLength 1
   */
  brandWebsite: string;
  /** Optional list of custom prompts to include in the report */
  manualPrompts?: Array<string>;
};

export type GetReportParams = {
  /**
   * Number of top competitor entities to return in each prompt's mentionsTopK
   *
   * @default 5
   * @minimum 1
   * @maximum 50
   */
  kMentions?: number;
};
