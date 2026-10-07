import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { updatePromptDescriptor, updatePromptFields } from '../resources/prompts';
import type { CallerOptions } from '../resources/shared';
import type {
  UpdatePromptErrors,
  UpdatePromptParams,
  UpdatePromptResponses,
} from '../types/prompts';

/**
 * Update a prompt
 *
 * Update a prompt's properties. Only provided fields will be updated. Toggling `enabled` schedules or unschedules the recurring run job.
 */
export function promptsUpdate(
  client: Client,
  promptId: string,
  params: UpdatePromptParams,
  options?: CallerOptions,
): RestCallPromise<UpdatePromptResponses, UpdatePromptErrors> {
  return callPromise(
    options?.client ?? client,
    updatePromptDescriptor,
    mergeParams(groupParams({ ...params, promptId }, updatePromptFields, 'body'), options),
  );
}
