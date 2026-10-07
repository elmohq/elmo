import type {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  PaymentRequiredError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from './shared';

export type OnboardingSuggestion = {
  additionalDomains: Array<string>;
  aliases: Array<string>;
  brandName: string;
  competitors: Array<{
    aliases: Array<string>;
    domains: Array<string>;
    name: string;
  }>;
  suggestedPrompts: Array<{
    prompt: string;
    tags: Array<string>;
  }>;
  /** Cleaned hostname */
  website: string;
};

export type AnalyzeBrandErrors = {
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

export type AnalyzeBrandResponses = {
  /** Brand analysis suggestion */
  200: OnboardingSuggestion;
};

export type AnalyzeBrandResponse = AnalyzeBrandResponses[keyof AnalyzeBrandResponses];

export type AnalyzeBrandRequest = {
  /** Optional brand name hint. If omitted, inferred from the domain. */
  brandName?: string;
  /**
   * Maximum number of competitor suggestions. 0 disables competitor generation entirely.
   *
   * @default 20
   * @minimum 0
   * @maximum 100
   */
  maxCompetitors?: number;
  /**
   * Maximum number of suggested prompts. 0 disables prompt generation entirely.
   *
   * @default 30
   * @minimum 0
   * @maximum 100
   */
  maxPrompts?: number;
  /**
   * Brand's website — a hostname or a full URL. A URL with a path (e.g. https://www.nike.com/golf) is analyzed as given; the returned website is always its domain.
   *
   * @minLength 1
   */
  website: string;
};

export type AnalyzeBrandParams = {
  /**
   * Brand's website — a hostname or a full URL. A URL with a path (e.g. https://www.nike.com/golf) is analyzed as given; the returned website is always its domain.
   *
   * @minLength 1
   */
  website: string;
  /** Optional brand name hint. If omitted, inferred from the domain. */
  brandName?: string;
  /**
   * Maximum number of competitor suggestions. 0 disables competitor generation entirely.
   *
   * @default 20
   * @minimum 0
   * @maximum 100
   */
  maxCompetitors?: number;
  /**
   * Maximum number of suggested prompts. 0 disables prompt generation entirely.
   *
   * @default 30
   * @minimum 0
   * @maximum 100
   */
  maxPrompts?: number;
};
