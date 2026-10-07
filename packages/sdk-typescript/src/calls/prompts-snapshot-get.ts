import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import type { CallerOptions } from '../resources/shared';
import { getPromptSnapshotDescriptor, getPromptSnapshotFields } from '../resources/snapshots';
import type {
  GetPromptSnapshotErrors,
  GetPromptSnapshotParams,
  GetPromptSnapshotResponses,
} from '../types/snapshots';

/**
 * Get prompt snapshot
 *
 * Get an aggregated snapshot of mention and citation analytics for a specific prompt over a date range. Use this to identify competitive gaps, track brand visibility trends, and discover top cited URLs.
 */
export function promptsSnapshotGet(
  client: Client,
  promptId: string,
  params: GetPromptSnapshotParams,
  options?: CallerOptions,
): RestCallPromise<GetPromptSnapshotResponses, GetPromptSnapshotErrors> {
  return callPromise(
    options?.client ?? client,
    getPromptSnapshotDescriptor,
    mergeParams(groupParams({ ...params, promptId }, getPromptSnapshotFields, 'query'), options),
  );
}
