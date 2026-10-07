import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { updateCompetitorDescriptor, updateCompetitorFields } from '../resources/competitors';
import type { CallerOptions } from '../resources/shared';
import type {
  UpdateCompetitorErrors,
  UpdateCompetitorParams,
  UpdateCompetitorResponses,
} from '../types/competitors';

/** Update a competitor */
export function competitorsUpdate(
  client: Client,
  competitorId: string,
  params: UpdateCompetitorParams,
  options?: CallerOptions,
): RestCallPromise<UpdateCompetitorResponses, UpdateCompetitorErrors> {
  return callPromise(
    options?.client ?? client,
    updateCompetitorDescriptor,
    mergeParams(groupParams({ ...params, competitorId }, updateCompetitorFields, 'body'), options),
  );
}
