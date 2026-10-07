import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { createCompetitorDescriptor } from '../resources/competitors';
import type { CallerOptions } from '../resources/shared';
import type {
  CreateCompetitorErrors,
  CreateCompetitorParams,
  CreateCompetitorResponses,
} from '../types/competitors';

/** Add a competitor */
export function competitorsCreate(
  client: Client,
  params: CreateCompetitorParams,
  options?: CallerOptions,
): RestCallPromise<CreateCompetitorResponses, CreateCompetitorErrors> {
  return callPromise(
    options?.client ?? client,
    createCompetitorDescriptor,
    mergeParams(groupParams(params, 'body'), options),
  );
}
