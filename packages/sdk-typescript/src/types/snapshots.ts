import type {
  ForbiddenError,
  InternalServerError,
  MentionsSummary,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from './shared';

export type CitedUrlEntry = {
  /** Number of times this URL was cited */
  count: number;
  /** Page title if available */
  title: string | null;
  /** The cited URL */
  url: string;
};

export type PromptSnapshot = {
  /** Brand identifier this prompt belongs to */
  brandId: string;
  citations: {
    /** Number of citations to brand-owned domains */
    brandCitationsTotal: number;
    /** Total number of citations across all runs */
    citationsTotal: number;
    /** Top-K cited URLs ranked by frequency */
    citedUrlsTopK: Array<CitedUrlEntry>;
    /** Number of citations to competitor-owned domains */
    competitorCitationsTotal: number;
  };
  /** End of the queried date range (YYYY-MM-DD) */
  endDate: string;
  mentions: MentionsSummary;
  /** Unique identifier for the prompt */
  promptId: string;
  /** The prompt text */
  promptValue: string;
  /** Start of the queried date range (YYYY-MM-DD) */
  startDate: string;
};

export type GetPromptSnapshotErrors = {
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

export type GetPromptSnapshotResponses = {
  /** Prompt snapshot with mention and citation analytics */
  200: PromptSnapshot;
};

export type GetPromptSnapshotResponse =
  GetPromptSnapshotResponses[keyof GetPromptSnapshotResponses];

export type GetPromptSnapshotParams = {
  /** Start of date range (YYYY-MM-DD) */
  startDate: string;
  /** End of date range (YYYY-MM-DD) */
  endDate: string;
  /**
   * Number of top competitor entities to return in mentionsTopK
   *
   * @default 5
   * @minimum 1
   * @maximum 50
   */
  kMentions?: number;
  /**
   * Number of top cited URLs to return in citedUrlsTopK
   *
   * @default 10
   * @minimum 1
   * @maximum 50
   */
  kCitations?: number;
};
