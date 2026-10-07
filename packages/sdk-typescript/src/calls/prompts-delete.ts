import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { deletePromptDescriptor, deletePromptFields } from '../resources/prompts';
import type { CallerOptions } from '../resources/shared';
import type { DeletePromptErrors, DeletePromptResponses } from '../types/prompts';

/**
 * Delete a prompt
 *
 * Permanently delete a prompt and cancel all related scheduled jobs. This will also cascade delete all associated prompt runs.
 *
 * Requires an instance admin key; organization keys receive `403`. The dashboard has no delete either — stop tracking a prompt with `PATCH /prompts/{promptId}` and `enabled: false`, which keeps its history and frees the plan slot.
 */
export function promptsDelete(
  client: Client,
  promptId: string,
  options?: CallerOptions,
): RestCallPromise<DeletePromptResponses, DeletePromptErrors> {
  return callPromise(
    options?.client ?? client,
    deletePromptDescriptor,
    mergeParams(groupParams({ promptId }, deletePromptFields, 'query'), options),
  );
}
