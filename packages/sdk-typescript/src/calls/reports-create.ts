import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { createReportDescriptor } from '../resources/reports';
import type { CallerOptions } from '../resources/shared';
import type {
  CreateReportErrors,
  CreateReportParams,
  CreateReportResponses,
} from '../types/reports';

/**
 * Create a report
 *
 * Create a new AI Share of Voice report and queue it for generation. The report will evaluate the brand across multiple AI engines (ChatGPT, Claude, Google AI) using generated and optional custom prompts.
 *
 * Requires an instance admin key; organization keys receive `403`.
 */
export function reportsCreate(
  client: Client,
  params: CreateReportParams,
  options?: CallerOptions,
): RestCallPromise<CreateReportResponses, CreateReportErrors> {
  return callPromise(
    options?.client ?? client,
    createReportDescriptor,
    mergeParams(groupParams(params, 'body'), options),
  );
}
