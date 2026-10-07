import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import { PagePromise, pages } from '../internal/page/page';
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

export const listPromptRunsFields = { path: ['promptId'] };

function reviveRunSummary(value: RunSummary): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('RunSummary.createdAt', value.createdAt, (raw) => new Date(raw));
  }
}

function reviveRunList(value: RunList): void {
  if (value.data != null) {
    value.data.forEach((item) => {
      reviveRunSummary(item);
    });
  }
}

export const listPromptRunsDescriptor = /* @__PURE__ */ callable({
  address: '/prompts/{promptId}/runs',
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
  validators: { response: /* @__PURE__ */ reviving(reviveRunList) },
} as const);

export const getRunFields = { path: ['promptId', 'runId'] };

function reviveRun(value: Run): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('Run.createdAt', value.createdAt, (raw) => new Date(raw));
  }
}

export const getRunDescriptor = /* @__PURE__ */ callable({
  address: '/prompts/{promptId}/runs/{runId}',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveRun) },
} as const);

/** Individual model answers behind the aggregates */
export class Runs extends ElmoResource {
  /**
   * Get a run
   *
   * One model answer, with its text normalized out of the provider’s response and its citations in the order the engine listed them. A run belonging to some other prompt answers `404`. The provider’s raw payload is deliberately not exposed — its shape belongs to the provider, not to this API.
   */
  public get(
    promptId: string,
    runId: string,
    options?: CallerOptions,
  ): RestCallPromise<GetRunResponses, GetRunErrors> {
    return callPromise(
      options?.client ?? this.client,
      getRunDescriptor,
      mergeParams(groupParams({ promptId, runId }, getRunFields, 'query'), options),
    );
  }

  /**
   * List runs for a prompt
   *
   * Individual model answers behind the aggregates, newest first, without their text — the list stays small enough to page through. Fetch `GET /prompts/{promptId}/runs/{runId}` for the answer itself.
   */
  public list(
    promptId: string,
    params: ListPromptRunsParams,
    options?: CallerOptions,
  ): PagePromise<RunSummary, RunList, ListPromptRunsErrors> {
    return pages(
      options?.client ?? this.client,
      listPromptRunsDescriptor,
      mergeParams(groupParams({ ...params, promptId }, listPromptRunsFields, 'query'), options),
    );
  }
}

export declare namespace Runs {
  export type {
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
  };
}
