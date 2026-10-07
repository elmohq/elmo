import type {
  ForbiddenError,
  InternalServerError,
  ModelFilter,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  WindowEnd,
  WindowStart,
} from './shared';

/** The window the response was computed over, echoed back as the half-open instants it resolved to. */
export type DateRange = {
  /** Exclusive upper bound, in UTC. */
  end: Date;
  /** Inclusive lower bound, in UTC. */
  start: Date;
};

export type VisibilityPoint = {
  date: string;
  /**
   * Null on days with no runs to plot; the series is not gap-filled with zeros. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  visibility: number | null;
};

export type ShareOfVoiceEntry = {
  /** True for the tracked brand's own row. */
  isBrand: boolean;
  mentions: number;
  /** Brand or competitor name. */
  name: string;
  /** Distinct prompts this entity appeared in. */
  prompts: number;
  /**
   * This entity's share of all brand and competitor mentions. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  share: number;
};

export type ShareOfVoicePoint = {
  date: string;
  /**
   * The brand's share on this day. Null on days with no runs. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  share: number | null;
};

export type CitationDomain = {
  /** Which side of the citation landscape the domain sits on. */
  category:
    | 'brand'
    | 'competitor'
    | 'editorial'
    | 'reviews'
    | 'ecommerce'
    | 'social'
    | 'developer'
    | 'pr'
    | 'reference'
    | 'institutional'
    | 'other';
  /**
   * How this window compares with the equal-length window before it, as a multiplier of the previous count: 2 means twice as many citations, 0.5 means half, 1 means unchanged. Not a percentage change — 1.5 is "1.5x", which is a 50% increase. Null when the domain had no citations in the previous window, so there is nothing to divide by.
   *
   * @minimum 0
   */
  changeFactor: number | null;
  /** Citations to this domain in the window. */
  count: number;
  domain: string;
  /** Citations in the equal-length window immediately before this one. */
  previousCount: number;
  /** Distinct prompts whose answers cited this domain. */
  promptCount: number;
  /**
   * Share of all citations in the window. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  share: number;
};

export type CitationDomainList = {
  brandId: string;
  /** Every domain cited over the window, ordered by citation count. */
  data: Array<CitationDomain>;
  range: DateRange;
  totals: {
    citations: number;
    uniqueDomains: number;
    uniqueUrls: number;
  };
};

export type CitationUrl = {
  /** Which side of the citation landscape the domain sits on. */
  category:
    | 'brand'
    | 'competitor'
    | 'editorial'
    | 'reviews'
    | 'ecommerce'
    | 'social'
    | 'developer'
    | 'pr'
    | 'reference'
    | 'institutional'
    | 'other';
  count: number;
  domain: string;
  /** Not cited in the equal-length window immediately before this one. */
  isNew: boolean;
  /** What kind of page was cited. */
  pageType:
    | 'homepage'
    | 'article'
    | 'listicle'
    | 'howto'
    | 'comparison'
    | 'review'
    | 'forum'
    | 'video'
    | 'doc'
    | 'product'
    | 'info'
    | 'search'
    | 'shopping'
    | 'other';
  promptCount: number;
  title: string | null;
  url: string;
};

export type CitationUrlList = {
  brandId: string;
  /** Every URL cited over the window, ordered by citation count. */
  data: Array<CitationUrl>;
  range: DateRange;
  totals: {
    citations: number;
    uniqueDomains: number;
    uniqueUrls: number;
  };
};

export type FanoutQuery = {
  promptCount: number;
  /** A search the engine ran while answering. */
  query: string;
  runs: number;
};

export type BrandQueryFanout = {
  avgQueriesPerRun: number;
  brandId: string;
  /**
   * Share of fan-out query instances whose answer mentioned the brand. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  coverageRate: number;
  /** Every distinct sub-query over the window, ordered by the runs that ran it. */
  data: Array<FanoutQuery>;
  /** Runs that searched at all. Engines that don't expose their searches contribute runs but no queries. */
  fanoutRuns: number;
  range: DateRange;
  totalQueries: number;
  totalRuns: number;
  uniqueQueries: number;
};

export type PromptPerformance = {
  /**
   * Share of this prompt's runs mentioning the brand. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  brandMentionRate: number;
  /**
   * Share of this prompt's runs mentioning any tracked competitor. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  competitorMentionRate: number;
  firstEvaluatedAt: Date | null;
  lastRunAt: Date | null;
  promptId: string;
  tags: Array<string>;
  totalRuns: number;
  value: string;
};

export type PromptPerformanceList = {
  brandId: string;
  /** Every prompt sampled over the window, with its results. */
  data: Array<PromptPerformance>;
  range: DateRange;
};

export type ModelVisibility = {
  brandMentions: number;
  citations: number;
  label: string;
  model: string;
  runs: number;
  /**
   * Share of this model's runs that mentioned the brand. Ratio 0–1; multiply by 100 for a percentage.
   *
   * @minimum 0
   * @maximum 1
   */
  visibility: number | null;
};

/** Every non-paginated figure for a brand over one window. There is no parameter for selecting a subset: the four computations behind this share one scope resolution and run concurrently, so a subset would save a caller a fraction of one request and cost everyone a parameter to reason about. */
export type BrandAnalytics = {
  brandId: string;
  brandName: string;
  /** Per-model visibility and run counts. Only models that produced a run in the window appear. */
  models: Array<ModelVisibility>;
  range: DateRange;
  /** The brand against its tracked competitors. */
  shareOfVoice: {
    /**
     * The brand's own share at the end of the window. Ratio 0–1; multiply by 100 for a percentage.
     *
     * @minimum 0
     * @maximum 1
     */
    brand: number | null;
    /** Leaderboard, highest share first. */
    entries: Array<ShareOfVoiceEntry>;
    /** The brand's share over time. */
    series: Array<ShareOfVoicePoint>;
  };
  totals: {
    citations: number;
    /** Enabled prompts counted in the window. */
    prompts: number;
    runs: number;
    uniqueDomains: number;
    uniqueUrls: number;
  };
  /** How often the brand is mentioned at all. */
  visibility: {
    /**
     * The last plotted point — the number the dashboard hero shows. Ratio 0–1; multiply by 100 for a percentage.
     *
     * @minimum 0
     * @maximum 1
     */
    current: number | null;
    series: Array<VisibilityPoint>;
  };
};

/** Comma-separated prompt tags. Only prompts carrying at least one of them are counted. */
export type TagsFilter = string;

export type GetBrandAnalyticsErrors = {
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

export type GetBrandAnalyticsResponses = {
  /** Get a brand's analytics */
  200: BrandAnalytics;
};

export type GetBrandAnalyticsResponse =
  GetBrandAnalyticsResponses[keyof GetBrandAnalyticsResponses];

export type ListBrandCitationDomainsErrors = {
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

export type ListBrandCitationDomainsResponses = {
  /** List cited domains */
  200: CitationDomainList;
};

export type ListBrandCitationDomainsResponse =
  ListBrandCitationDomainsResponses[keyof ListBrandCitationDomainsResponses];

export type ListBrandCitationUrlsErrors = {
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

export type ListBrandCitationUrlsResponses = {
  /** List cited URLs */
  200: CitationUrlList;
};

export type ListBrandCitationUrlsResponse =
  ListBrandCitationUrlsResponses[keyof ListBrandCitationUrlsResponses];

export type ListBrandPromptPerformanceErrors = {
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

export type ListBrandPromptPerformanceResponses = {
  /** List prompt performance */
  200: PromptPerformanceList;
};

export type ListBrandPromptPerformanceResponse =
  ListBrandPromptPerformanceResponses[keyof ListBrandPromptPerformanceResponses];

export type GetBrandQueryFanoutErrors = {
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

export type GetBrandQueryFanoutResponses = {
  /** Get query fan-out */
  200: BrandQueryFanout;
};

export type GetBrandQueryFanoutResponse =
  GetBrandQueryFanoutResponses[keyof GetBrandQueryFanoutResponses];

export type GetBrandAnalyticsParams = {
  /** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
  start: WindowStart;
  /** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
  end: WindowEnd;
  /** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
  model?: ModelFilter;
  /** Comma-separated prompt tags. Only prompts carrying at least one of them are counted. */
  tags?: TagsFilter;
};

export type ListBrandCitationDomainsParams = {
  /** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
  start: WindowStart;
  /** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
  end: WindowEnd;
  /** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
  model?: ModelFilter;
  /** Comma-separated prompt tags. Only prompts carrying at least one of them are counted. */
  tags?: TagsFilter;
};

export type ListBrandCitationUrlsParams = {
  /** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
  start: WindowStart;
  /** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
  end: WindowEnd;
  /** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
  model?: ModelFilter;
  /** Comma-separated prompt tags. Only prompts carrying at least one of them are counted. */
  tags?: TagsFilter;
};

export type ListBrandPromptPerformanceParams = {
  /** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
  start: WindowStart;
  /** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
  end: WindowEnd;
  /** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
  model?: ModelFilter;
  /** Comma-separated prompt tags. Only prompts carrying at least one of them are counted. */
  tags?: TagsFilter;
};

export type GetBrandQueryFanoutParams = {
  /** Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there. */
  start: WindowStart;
  /** Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it. */
  end: WindowEnd;
  /** Restrict to one model, e.g. `chatgpt`. See `GET /models`. */
  model?: ModelFilter;
  /** Comma-separated prompt tags. Only prompts carrying at least one of them are counted. */
  tags?: TagsFilter;
};
