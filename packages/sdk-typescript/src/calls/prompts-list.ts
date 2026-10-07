import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { PagePromise, pages } from '../internal/page/page';
import { listPromptsDescriptor } from '../resources/prompts';
import type { CallerOptions } from '../resources/shared';
import type {
  ListPromptsErrors,
  ListPromptsParams,
  ListPromptsResponse,
  Prompt,
} from '../types/prompts';

/**
 * List all prompts
 *
 * Retrieve a paginated list of all prompts across all brands
 */
export function promptsList(
  client: Client,
  params?: ListPromptsParams,
  options?: CallerOptions,
): PagePromise<Prompt, ListPromptsResponse, ListPromptsErrors> {
  return pages(
    options?.client ?? client,
    listPromptsDescriptor,
    mergeParams(groupParams(params, 'query'), options),
  );
}
