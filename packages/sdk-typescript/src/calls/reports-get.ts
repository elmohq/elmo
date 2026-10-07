import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { getReportDescriptor, getReportFields } from '../resources/reports';
import type { CallerOptions } from '../resources/shared';
import type { GetReportErrors, GetReportParams, GetReportResponses } from '../types/reports';

/**
 * Get report status and data
 *
 * Poll a report's status. When completed, returns per-prompt snapshot data with raw mention counts. Consumers are responsible for computing SoV and other derived metrics from the raw data.
 *
 * Requires an instance admin key; organization keys receive `403`.
 */
export function reportsGet(
  client: Client,
  reportId: string,
  params?: GetReportParams,
  options?: CallerOptions,
): RestCallPromise<GetReportResponses, GetReportErrors> {
  return callPromise(
    options?.client ?? client,
    getReportDescriptor,
    mergeParams(groupParams({ ...params, reportId }, getReportFields, 'query'), options),
  );
}
