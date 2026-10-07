import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { PagePromise, pages } from '../internal/page/page';
import { listReportsDescriptor } from '../resources/reports';
import type { CallerOptions } from '../resources/shared';
import type {
  ListReportsErrors,
  ListReportsParams,
  ListReportsResponse,
  ReportSummary,
} from '../types/reports';

/**
 * List reports
 *
 * Retrieve a paginated list of all reports, ordered by creation date (newest first).
 *
 * Requires an instance admin key; organization keys receive `403`.
 */
export function reportsList(
  client: Client,
  params?: ListReportsParams,
  options?: CallerOptions,
): PagePromise<ReportSummary, ListReportsResponse, ListReportsErrors> {
  return pages(
    options?.client ?? client,
    listReportsDescriptor,
    mergeParams(groupParams(params, 'query'), options),
  );
}
