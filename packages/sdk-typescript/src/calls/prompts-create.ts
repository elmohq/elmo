import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { createPromptDescriptor } from '../resources/prompts';
import type { CallerOptions } from '../resources/shared';
import type {
  CreatePromptErrors,
  CreatePromptParams,
  CreatePromptResponses,
} from '../types/prompts';

/**
 * Create a new prompt
 *
 * Create a new prompt for a brand. This will automatically schedule the prompt for execution.
 */
export function promptsCreate(
  client: Client,
  params: CreatePromptParams,
  options?: CallerOptions,
): RestCallPromise<CreatePromptResponses, CreatePromptErrors> {
  return callPromise(
    options?.client ?? client,
    createPromptDescriptor,
    mergeParams(groupParams(params, 'body'), options),
  );
}
