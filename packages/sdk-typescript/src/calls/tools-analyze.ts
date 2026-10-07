import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import type { CallerOptions } from '../resources/shared';
import { analyzeBrandDescriptor } from '../resources/tools';
import type { AnalyzeBrandErrors, AnalyzeBrandParams, AnalyzeBrandResponses } from '../types/tools';

/**
 * Analyze a website
 *
 * Run brand analysis without persisting anything. Returns suggested additional domains, aliases, competitors, and prompts.
 *
 * Requires an instance admin key; organization keys receive `403`.
 */
export function toolsAnalyze(
  client: Client,
  params: AnalyzeBrandParams,
  options?: CallerOptions,
): RestCallPromise<AnalyzeBrandResponses, AnalyzeBrandErrors> {
  return callPromise(
    options?.client ?? client,
    analyzeBrandDescriptor,
    mergeParams(groupParams(params, 'body'), options),
  );
}
