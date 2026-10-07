import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { PagePromise, pages } from '../internal/page/page';
import { listPromptRunsDescriptor, listPromptRunsFields } from '../resources/runs';
import type { CallerOptions } from '../resources/shared';
import type {
  ListPromptRunsErrors,
  ListPromptRunsParams,
  RunList,
  RunSummary,
} from '../types/runs';

/**
 * List runs for a prompt
 *
 * Individual model answers behind the aggregates, newest first, without their text — the list stays small enough to page through. Fetch `GET /prompts/{promptId}/runs/{runId}` for the answer itself.
 */
export function promptsRunsList(
  client: Client,
  promptId: string,
  params: ListPromptRunsParams,
  options?: CallerOptions,
): PagePromise<RunSummary, RunList, ListPromptRunsErrors> {
  return pages(
    options?.client ?? client,
    listPromptRunsDescriptor,
    mergeParams(groupParams({ ...params, promptId }, listPromptRunsFields, 'query'), options),
  );
}
