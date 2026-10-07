import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { deleteCompetitorDescriptor, deleteCompetitorFields } from '../resources/competitors';
import type { CallerOptions } from '../resources/shared';
import type { DeleteCompetitorErrors, DeleteCompetitorResponses } from '../types/competitors';

/** Delete a competitor */
export function competitorsDelete(
  client: Client,
  competitorId: string,
  options?: CallerOptions,
): RestCallPromise<DeleteCompetitorResponses, DeleteCompetitorErrors> {
  return callPromise(
    options?.client ?? client,
    deleteCompetitorDescriptor,
    mergeParams(groupParams({ competitorId }, deleteCompetitorFields, 'query'), options),
  );
}
