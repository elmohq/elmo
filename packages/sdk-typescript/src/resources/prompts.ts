import { Runs } from './runs';
import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { Snapshot } from './snapshots';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import { PagePromise, pages } from '../internal/page/page';
import type {
  CreatePromptErrors,
  CreatePromptParams,
  CreatePromptRequest,
  CreatePromptResponse,
  CreatePromptResponses,
  DeletePromptErrors,
  DeletePromptResponse,
  DeletePromptResponses,
  GetPromptErrors,
  GetPromptResponse,
  GetPromptResponses,
  ListPromptsErrors,
  ListPromptsParams,
  ListPromptsResponse,
  ListPromptsResponses,
  Prompt,
  UpdatePromptErrors,
  UpdatePromptParams,
  UpdatePromptRequest,
  UpdatePromptResponse,
  UpdatePromptResponses,
} from '../types/prompts';
import type {
  GetRunErrors,
  GetRunResponse,
  GetRunResponses,
  ListPromptRunsErrors,
  ListPromptRunsParams,
  ListPromptRunsResponse,
  ListPromptRunsResponses,
  Run,
  RunCitation,
  RunList,
  RunSummary,
} from '../types/runs';
import type {
  CitedUrlEntry,
  GetPromptSnapshotErrors,
  GetPromptSnapshotParams,
  GetPromptSnapshotResponse,
  GetPromptSnapshotResponses,
  PromptSnapshot,
} from '../types/snapshots';

function revivePrompt(value: Prompt): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('Prompt.createdAt', value.createdAt, (raw) => new Date(raw));
  }
  if (value.updatedAt != null) {
    value.updatedAt = decoded('Prompt.updatedAt', value.updatedAt, (raw) => new Date(raw));
  }
}

export const listPromptsDescriptor = /* @__PURE__ */ callable({
  address: '/prompts',
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
  validators: {
    response: (data: unknown) => {
      const value = data as ListPromptsResponse;
      if (value == null) {
        return value;
      }
      if (value.data != null) {
        value.data.forEach((item) => {
          revivePrompt(item);
        });
      }
      if (value.prompts != null) {
        value.prompts.forEach((item) => {
          revivePrompt(item);
        });
      }
      return value;
    },
  },
} as const);

export const createPromptDescriptor = /* @__PURE__ */ callable({
  address: '/prompts',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'post',
  validators: { response: /* @__PURE__ */ reviving(revivePrompt) },
} as const);

export const deletePromptFields = { path: ['promptId'] };

export const deletePromptDescriptor = /* @__PURE__ */ callable({
  address: '/prompts/{promptId}',
  auth: apiKeyRequirements,
  method: 'delete',
  validators: {
    response: (data: unknown) => {
      const value = data as DeletePromptResponse;
      if (value == null) {
        return value;
      }
      if (value.createdAt != null) {
        value.createdAt = decoded('createdAt', value.createdAt, (raw) => new Date(raw));
      }
      if (value.updatedAt != null) {
        value.updatedAt = decoded('updatedAt', value.updatedAt, (raw) => new Date(raw));
      }
      return value;
    },
  },
} as const);

export const getPromptFields = { path: ['promptId'] };

export const getPromptDescriptor = /* @__PURE__ */ callable({
  address: '/prompts/{promptId}',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(revivePrompt) },
} as const);

export const updatePromptFields = { path: ['promptId'] };

export const updatePromptDescriptor = /* @__PURE__ */ callable({
  address: '/prompts/{promptId}',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'patch',
  validators: { response: /* @__PURE__ */ reviving(revivePrompt) },
} as const);

/** Manage brand prompts */
export class Prompts extends ElmoResource {
  /**
   * Create a new prompt
   *
   * Create a new prompt for a brand. This will automatically schedule the prompt for execution.
   */
  public create(
    params: CreatePromptParams,
    options?: CallerOptions,
  ): RestCallPromise<CreatePromptResponses, CreatePromptErrors> {
    return callPromise(
      options?.client ?? this.client,
      createPromptDescriptor,
      mergeParams(groupParams(params, 'body'), options),
    );
  }

  /**
   * Delete a prompt
   *
   * Permanently delete a prompt and cancel all related scheduled jobs. This will also cascade delete all associated prompt runs.
   *
   * Requires an instance admin key; organization keys receive `403`. The dashboard has no delete either — stop tracking a prompt with `PATCH /prompts/{promptId}` and `enabled: false`, which keeps its history and frees the plan slot.
   *
   * @param promptId The ID of the prompt to delete
   */
  public delete(
    promptId: string,
    options?: CallerOptions,
  ): RestCallPromise<DeletePromptResponses, DeletePromptErrors> {
    return callPromise(
      options?.client ?? this.client,
      deletePromptDescriptor,
      mergeParams(groupParams({ promptId }, deletePromptFields, 'query'), options),
    );
  }

  /**
   * Get a prompt
   *
   * Retrieve a specific prompt by ID
   *
   * @param promptId The ID of the prompt
   */
  public get(
    promptId: string,
    options?: CallerOptions,
  ): RestCallPromise<GetPromptResponses, GetPromptErrors> {
    return callPromise(
      options?.client ?? this.client,
      getPromptDescriptor,
      mergeParams(groupParams({ promptId }, getPromptFields, 'query'), options),
    );
  }

  /**
   * List all prompts
   *
   * Retrieve a paginated list of all prompts across all brands
   */
  public list(
    params?: ListPromptsParams,
    options?: CallerOptions,
  ): PagePromise<Prompt, ListPromptsResponse, ListPromptsErrors> {
    return pages(
      options?.client ?? this.client,
      listPromptsDescriptor,
      mergeParams(groupParams(params, 'query'), options),
    );
  }

  /**
   * Update a prompt
   *
   * Update a prompt's properties. Only provided fields will be updated. Toggling `enabled` schedules or unschedules the recurring run job.
   *
   * @param promptId The ID of the prompt to update
   */
  public update(
    promptId: string,
    params: UpdatePromptParams,
    options?: CallerOptions,
  ): RestCallPromise<UpdatePromptResponses, UpdatePromptErrors> {
    return callPromise(
      options?.client ?? this.client,
      updatePromptDescriptor,
      mergeParams(groupParams({ ...params, promptId }, updatePromptFields, 'body'), options),
    );
  }

  private _runs?: Runs;
  /** Individual model answers behind the aggregates */
  get runs(): Runs {
    return (this._runs ??= new Runs(this.client));
  }

  private _snapshot?: Snapshot;
  /** Aggregated analytics snapshots for prompts */
  get snapshot(): Snapshot {
    return (this._snapshot ??= new Snapshot(this.client));
  }
}

export declare namespace Prompts {
  export type {
    CitedUrlEntry,
    CreatePromptErrors,
    CreatePromptParams,
    CreatePromptRequest,
    CreatePromptResponse,
    CreatePromptResponses,
    DeletePromptErrors,
    DeletePromptResponse,
    DeletePromptResponses,
    GetPromptErrors,
    GetPromptResponse,
    GetPromptResponses,
    GetPromptSnapshotErrors,
    GetPromptSnapshotParams,
    GetPromptSnapshotResponse,
    GetPromptSnapshotResponses,
    GetRunErrors,
    GetRunResponse,
    GetRunResponses,
    ListPromptRunsErrors,
    ListPromptRunsParams,
    ListPromptRunsResponse,
    ListPromptRunsResponses,
    ListPromptsErrors,
    ListPromptsParams,
    ListPromptsResponse,
    ListPromptsResponses,
    Prompt,
    PromptSnapshot,
    Run,
    RunCitation,
    RunList,
    Runs,
    RunSummary,
    Snapshot,
    UpdatePromptErrors,
    UpdatePromptParams,
    UpdatePromptRequest,
    UpdatePromptResponse,
    UpdatePromptResponses,
  };
}
