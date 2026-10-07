import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { getPromptDescriptor, getPromptFields } from '../resources/prompts';
import type { CallerOptions } from '../resources/shared';
import type { GetPromptErrors, GetPromptResponses } from '../types/prompts';

/**
 * Get a prompt
 *
 * Retrieve a specific prompt by ID
 */
export function promptsGet(
  client: Client,
  promptId: string,
  options?: CallerOptions,
): RestCallPromise<GetPromptResponses, GetPromptErrors> {
  return callPromise(
    options?.client ?? client,
    getPromptDescriptor,
    mergeParams(groupParams({ promptId }, getPromptFields, 'query'), options),
  );
}
