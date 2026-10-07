import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import {
  getOrganizationBillingDescriptor,
  getOrganizationBillingFields,
} from '../resources/organizations';
import type { CallerOptions } from '../resources/shared';
import type {
  GetOrganizationBillingErrors,
  GetOrganizationBillingResponses,
} from '../types/organizations';

/**
 * Get billing state
 *
 * The organization's plan, its limits, and how much of each limit is already spent — enough for an integration to know a write will be rejected before attempting it.
 *
 * This endpoint is read-only by construction. No API key of any kind can change a subscription, an add-on quantity, or a payment method; there is no billing write endpoint and no billing write scope. Stripe identifiers, invoices, and payment methods are never returned.
 *
 * Deployments without billing answer `200` with `billingEnabled: false`, a null plan, and null limits, so callers need no special case.
 */
export function organizationsBillingGet(
  client: Client,
  organizationId: string,
  options?: CallerOptions,
): RestCallPromise<GetOrganizationBillingResponses, GetOrganizationBillingErrors> {
  return callPromise(
    options?.client ?? client,
    getOrganizationBillingDescriptor,
    mergeParams(groupParams({ organizationId }, getOrganizationBillingFields, 'query'), options),
  );
}
