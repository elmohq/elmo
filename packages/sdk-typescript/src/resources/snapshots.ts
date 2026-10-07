import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import type {
  CitedUrlEntry,
  GetPromptSnapshotErrors,
  GetPromptSnapshotParams,
  GetPromptSnapshotResponse,
  GetPromptSnapshotResponses,
  PromptSnapshot,
} from '../types/snapshots';

export const getPromptSnapshotFields = { path: ['promptId'] };

export const getPromptSnapshotDescriptor = /* @__PURE__ */ callable({
  address: '/prompts/{promptId}/snapshot',
  auth: apiKeyRequirements,
  method: 'get',
} as const);

/** Aggregated analytics snapshots for prompts */
export class Snapshot extends ElmoResource {
  /**
   * Get prompt snapshot
   *
   * Get an aggregated snapshot of mention and citation analytics for a specific prompt over a date range. Use this to identify competitive gaps, track brand visibility trends, and discover top cited URLs.
   *
   * @param promptId The ID of the prompt
   */
  public get(
    promptId: string,
    params: GetPromptSnapshotParams,
    options?: CallerOptions,
  ): RestCallPromise<GetPromptSnapshotResponses, GetPromptSnapshotErrors> {
    return callPromise(
      options?.client ?? this.client,
      getPromptSnapshotDescriptor,
      mergeParams(groupParams({ ...params, promptId }, getPromptSnapshotFields, 'query'), options),
    );
  }
}

export declare namespace Snapshot {
  export type {
    CitedUrlEntry,
    GetPromptSnapshotErrors,
    GetPromptSnapshotParams,
    GetPromptSnapshotResponse,
    GetPromptSnapshotResponses,
    PromptSnapshot,
  };
}
