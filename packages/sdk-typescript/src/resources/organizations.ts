import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import { PagePromise, pages } from '../internal/page/page';
import type {
  BillingPlan,
  GetOrganizationBillingErrors,
  GetOrganizationBillingResponse,
  GetOrganizationBillingResponses,
  GetOrganizationErrors,
  GetOrganizationResponse,
  GetOrganizationResponses,
  ListOrganizationsErrors,
  ListOrganizationsParams,
  ListOrganizationsResponse,
  ListOrganizationsResponses,
  Organization,
  OrganizationBilling,
  OrganizationList,
  PlanLimits,
} from '../types/organizations';

export const getOrganizationBillingFields = { path: ['organizationId'] };

function reviveBillingPlan(value: BillingPlan): void {
  if (value.periodEnd != null) {
    value.periodEnd = decoded('BillingPlan.periodEnd', value.periodEnd, (raw) => new Date(raw));
  }
}

function reviveOrganizationBilling(value: OrganizationBilling): void {
  if (value.plan != null) {
    reviveBillingPlan(value.plan);
  }
}

export const getOrganizationBillingDescriptor = /* @__PURE__ */ callable({
  address: '/organizations/{organizationId}/billing',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveOrganizationBilling) },
} as const);

function reviveOrganization(value: Organization): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('Organization.createdAt', value.createdAt, (raw) => new Date(raw));
  }
}

function reviveOrganizationList(value: OrganizationList): void {
  if (value.data != null) {
    value.data.forEach((item) => {
      reviveOrganization(item);
    });
  }
}

export const listOrganizationsDescriptor = /* @__PURE__ */ callable({
  address: '/organizations',
  auth: apiKeyRequirements,
  method: 'get',
  pagination: {
    items: 'data',
    limitParam: 'limit',
    pages: 'pagination.totalPages',
    param: 'page',
    size: 'pagination.limit',
    style: 'page',
    total: 'pagination.total',
  },
  validators: { response: /* @__PURE__ */ reviving(reviveOrganizationList) },
} as const);

export const getOrganizationFields = { path: ['organizationId'] };

export const getOrganizationDescriptor = /* @__PURE__ */ callable({
  address: '/organizations/{organizationId}',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveOrganization) },
} as const);

/** Organizations, their plan limits, and their usage */
export class Billing extends ElmoResource {
  /**
   * Get billing state
   *
   * The organization's plan, its limits, and how much of each limit is already spent — enough for an integration to know a write will be rejected before attempting it.
   *
   * This endpoint is read-only by construction. No API key of any kind can change a subscription, an add-on quantity, or a payment method; there is no billing write endpoint and no billing write scope. Stripe identifiers, invoices, and payment methods are never returned.
   *
   * Deployments without billing answer `200` with `billingEnabled: false`, a null plan, and null limits, so callers need no special case.
   */
  public get(
    organizationId: string,
    options?: CallerOptions,
  ): RestCallPromise<GetOrganizationBillingResponses, GetOrganizationBillingErrors> {
    return callPromise(
      options?.client ?? this.client,
      getOrganizationBillingDescriptor,
      mergeParams(groupParams({ organizationId }, getOrganizationBillingFields, 'query'), options),
    );
  }
}

/** Organizations, their plan limits, and their usage */
export class Organizations extends ElmoResource {
  /**
   * Get an organization
   *
   * No scope required. An organization outside the key's reach answers `404`, identically to one that does not exist.
   */
  public get(
    organizationId: string,
    options?: CallerOptions,
  ): RestCallPromise<GetOrganizationResponses, GetOrganizationErrors> {
    return callPromise(
      options?.client ?? this.client,
      getOrganizationDescriptor,
      mergeParams(groupParams({ organizationId }, getOrganizationFields, 'query'), options),
    );
  }

  /**
   * List organizations
   *
   * One entry for an organization key — the one it acts inside. Every organization for an instance admin key. No scope required: a key can only ever see the organization it is already bound to.
   */
  public list(
    params?: ListOrganizationsParams,
    options?: CallerOptions,
  ): PagePromise<Organization, OrganizationList, ListOrganizationsErrors> {
    return pages(
      options?.client ?? this.client,
      listOrganizationsDescriptor,
      mergeParams(groupParams(params, 'query'), options),
    );
  }

  private _billing?: Billing;
  /** Organizations, their plan limits, and their usage */
  get billing(): Billing {
    return (this._billing ??= new Billing(this.client));
  }
}

export declare namespace Billing {
  export type {
    BillingPlan,
    GetOrganizationBillingErrors,
    GetOrganizationBillingResponse,
    GetOrganizationBillingResponses,
    OrganizationBilling,
    PlanLimits,
  };
}

export declare namespace Organizations {
  export type {
    Billing,
    BillingPlan,
    GetOrganizationBillingErrors,
    GetOrganizationBillingResponse,
    GetOrganizationBillingResponses,
    GetOrganizationErrors,
    GetOrganizationResponse,
    GetOrganizationResponses,
    ListOrganizationsErrors,
    ListOrganizationsParams,
    ListOrganizationsResponse,
    ListOrganizationsResponses,
    Organization,
    OrganizationBilling,
    OrganizationList,
    PlanLimits,
  };
}
