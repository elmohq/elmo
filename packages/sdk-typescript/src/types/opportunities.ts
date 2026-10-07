import type {
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from './shared';

export type OpportunityPrompt = {
  /** The tracked prompt it resolved to, or null when it didn't match one. */
  promptId: string | null;
  /** The prompt as the report names it. */
  text: string;
};

export type CitedPage = {
  domain: string;
  title: string | null;
  url: string;
};

export type Opportunity = {
  /** Which workstream this belongs to: `creation` is net-new content, `existing-content` is a page that could win the mention with a refresh, `outreach` is earning a placement on a third-party site assistants cite, `social` is the community conversations they pull from. */
  category: 'creation' | 'existing-content' | 'outreach' | 'social';
  /** Pages on competitor domains cited for those prompts. */
  competitorCitations: Array<CitedPage>;
  /** Tracked prompts this would help. May be empty. */
  relatedPrompts: Array<OpportunityPrompt>;
  /** Short and action-oriented — the concrete surface or angle. */
  title: string;
  /** Why it is worth doing, in plain language. */
  why: string;
  /** Pages on the brand's own domains already cited for those prompts. */
  yourCitations: Array<CitedPage>;
};

/** The brand's latest Opportunities report — the same LLM-generated analysis the dashboard shows, read from the append-only history rather than regenerated. Elmo decides when to produce a new one; there is no way to trigger generation over the API, because it spends provider budget with no per-call metering behind it. */
export type BrandOpportunities = {
  brandId: string;
  generatedAt: Date | null;
  /** The model that produced the report, when recorded. */
  model: string | null;
  /** Prioritized, highest impact first. */
  opportunities: Array<Opportunity>;
  /** Caveats: hard-to-win areas, or tactics to avoid. */
  risks: Array<string>;
  /** `ready` when a report is present. `insufficient-data` when the brand hasn't accumulated enough tracked answers to say anything useful yet, in which case the lists are empty. */
  status: 'ready' | 'insufficient-data';
  /** A few bullets on where the brand stands and the through-line of the plan. */
  summary: Array<string>;
};

export type GetBrandOpportunitiesErrors = {
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

export type GetBrandOpportunitiesResponses = {
  /** Get the latest opportunities report */
  200: BrandOpportunities;
};

export type GetBrandOpportunitiesResponse =
  GetBrandOpportunitiesResponses[keyof GetBrandOpportunitiesResponses];
