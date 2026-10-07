import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { getCompetitorDescriptor, getCompetitorFields } from '../resources/competitors';
import type { CallerOptions } from '../resources/shared';
import type { GetCompetitorErrors, GetCompetitorResponses } from '../types/competitors';

/** Get a competitor */
export function competitorsGet(
  client: Client,
  competitorId: string,
  options?: CallerOptions,
): RestCallPromise<GetCompetitorResponses, GetCompetitorErrors> {
  return callPromise(
    options?.client ?? client,
    getCompetitorDescriptor,
    mergeParams(groupParams({ competitorId }, getCompetitorFields, 'query'), options),
  );
}
