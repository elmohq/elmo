import type {
  ForbiddenError,
  InternalServerError,
  Limit,
  NotFoundError,
  Page,
  Pagination,
  RateLimitError,
  UnauthorizedError,
} from './shared';

export type Organization = {
  brandCount: number;
  createdAt: Date;
  id: string;
  name: string;
  slug: string;
};

/** The organization's plan limits. Every field is null on deployments without billing. */
export type PlanLimits = {
  /** Null means no limit. */
  maxBrands: number | null;
  /** Enabled prompts across the whole organization. Null means no limit. */
  maxPrompts: number | null;
  /** Models the plan may pick from. Null means any. */
  modelMenu: Array<string> | null;
  /** Models trackable per brand. */
  modelPicks: number | null;
  /** Prompt/model pairings trackable grounded. */
  premiumPool: number;
  premiumRunsPerDay: number;
  standardRunsPerDay: number | null;
};

/** Read-only view of an organization's subscription, limits, and usage. The API has no way to change any of it: there is no billing write endpoint and no billing write scope. Stripe identifiers, payment methods, and invoices are deliberately not exposed — those live in the Stripe customer portal. */
export type OrganizationBilling = {
  /** False on self-hosted deployments, where nothing is metered. */
  billingEnabled: boolean;
  limits: PlanLimits | null;
  organizationId: string;
  /** Null when the organization has no subscription, or when billing is disabled. */
  plan: BillingPlan | null;
  usage: {
    brands: number;
    enabledPrompts: number;
    premiumPairingsAssigned: number;
  };
};

export type BillingPlan = {
  cancelAtPeriodEnd: boolean;
  /** Null on a negotiated plan, which carries no billing interval. */
  interval?: 'monthly' | 'annual' | null;
  /** Plan identifier, or `custom` for a negotiated plan. */
  key: string | null;
  /** Display name. */
  name: string;
  periodEnd?: Date | null;
  /** What the subscription means for service, and the only field a caller needs to act on: `active` and `grace` keep tracking running, `paused` stops it, `none` is unsubscribed. The payment provider's own status string is deliberately not passed through. */
  standing: 'active' | 'grace' | 'paused' | 'none';
  /** Whether prompts are currently being sampled. */
  trackingActive: boolean;
};

export type OrganizationList = {
  data: Array<Organization>;
  pagination: Pagination;
};

export type ListOrganizationsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListOrganizationsResponses = {
  /** List organizations */
  200: OrganizationList;
};

export type ListOrganizationsResponse =
  ListOrganizationsResponses[keyof ListOrganizationsResponses];

export type GetOrganizationErrors = {
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

export type GetOrganizationResponses = {
  /** Get an organization */
  200: Organization;
};

export type GetOrganizationResponse = GetOrganizationResponses[keyof GetOrganizationResponses];

export type GetOrganizationBillingErrors = {
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

export type GetOrganizationBillingResponses = {
  /** Get billing state */
  200: OrganizationBilling;
};

export type GetOrganizationBillingResponse =
  GetOrganizationBillingResponses[keyof GetOrganizationBillingResponses];

export type ListOrganizationsParams = {
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
