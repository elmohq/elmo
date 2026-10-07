import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded } from '../internal/features/validate';
import { PagePromise, pages } from '../internal/page/page';
import type {
  CreateReportErrors,
  CreateReportParams,
  CreateReportRequest,
  CreateReportResponse,
  CreateReportResponses,
  GetReportErrors,
  GetReportParams,
  GetReportResponse,
  GetReportResponses,
  ListReportsErrors,
  ListReportsParams,
  ListReportsResponse,
  ListReportsResponses,
  ReportPromptSnapshot,
  ReportSummary,
} from '../types/reports';

function reviveReportSummary(value: ReportSummary): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('ReportSummary.createdAt', value.createdAt, (raw) => new Date(raw));
  }
  if (value.completedAt != null) {
    value.completedAt = decoded(
      'ReportSummary.completedAt',
      value.completedAt,
      (raw) => new Date(raw),
    );
  }
}

export const listReportsDescriptor = /* @__PURE__ */ callable({
  address: '/reports',
  auth: apiKeyRequirements,
  method: 'get',
  pagination: {
    items: 'data',
    limitParam: 'limit',
    pages: 'pagination.totalPages',
    param: 'page',
    size: 'pagination.limit',
    style: 'page',
    total: 'pagination.total',
  },
  validators: {
    response: (data: unknown) => {
      const value = data as ListReportsResponse;
      if (value == null) {
        return value;
      }
      if (value.data != null) {
        value.data.forEach((item) => {
          reviveReportSummary(item);
        });
      }
      if (value.reports != null) {
        value.reports.forEach((item) => {
          reviveReportSummary(item);
        });
      }
      return value;
    },
  },
} as const);

export const createReportDescriptor = /* @__PURE__ */ callable({
  address: '/reports',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'post',
  validators: {
    response: (data: unknown) => {
      const value = data as CreateReportResponse;
      if (value == null) {
        return value;
      }
      if (value.createdAt != null) {
        value.createdAt = decoded('createdAt', value.createdAt, (raw) => new Date(raw));
      }
      return value;
    },
  },
} as const);

export const getReportFields = { path: ['reportId'] };

export const getReportDescriptor = /* @__PURE__ */ callable({
  address: '/reports/{reportId}',
  auth: apiKeyRequirements,
  method: 'get',
  validators: {
    response: (data: unknown) => {
      const value = data as GetReportResponse;
      if (value == null) {
        return value;
      }
      if (value.createdAt != null) {
        value.createdAt = decoded('createdAt', value.createdAt, (raw) => new Date(raw));
      }
      if (value.completedAt != null) {
        value.completedAt = decoded('completedAt', value.completedAt, (raw) => new Date(raw));
      }
      return value;
    },
  },
} as const);

/** Generate and retrieve AI Share of Voice reports */
export class Reports extends ElmoResource {
  /**
   * Create a report
   *
   * Create a new AI Share of Voice report and queue it for generation. The report will evaluate the brand across multiple AI engines (ChatGPT, Claude, Google AI) using generated and optional custom prompts.
   *
   * Requires an instance admin key; organization keys receive `403`.
   */
  public create(
    params: CreateReportParams,
    options?: CallerOptions,
  ): RestCallPromise<CreateReportResponses, CreateReportErrors> {
    return callPromise(
      options?.client ?? this.client,
      createReportDescriptor,
      mergeParams(groupParams(params, 'body'), options),
    );
  }

  /**
   * Get report status and data
   *
   * Poll a report's status. When completed, returns per-prompt snapshot data with raw mention counts. Consumers are responsible for computing SoV and other derived metrics from the raw data.
   *
   * Requires an instance admin key; organization keys receive `403`.
   *
   * @param reportId The ID of the report
   */
  public get(
    reportId: string,
    params?: GetReportParams,
    options?: CallerOptions,
  ): RestCallPromise<GetReportResponses, GetReportErrors> {
    return callPromise(
      options?.client ?? this.client,
      getReportDescriptor,
      mergeParams(groupParams({ ...params, reportId }, getReportFields, 'query'), options),
    );
  }

  /**
   * List reports
   *
   * Retrieve a paginated list of all reports, ordered by creation date (newest first).
   *
   * Requires an instance admin key; organization keys receive `403`.
   */
  public list(
    params?: ListReportsParams,
    options?: CallerOptions,
  ): PagePromise<ReportSummary, ListReportsResponse, ListReportsErrors> {
    return pages(
      options?.client ?? this.client,
      listReportsDescriptor,
      mergeParams(groupParams(params, 'query'), options),
    );
  }
}

export declare namespace Reports {
  export type {
    CreateReportErrors,
    CreateReportParams,
    CreateReportRequest,
    CreateReportResponse,
    CreateReportResponses,
    GetReportErrors,
    GetReportParams,
    GetReportResponse,
    GetReportResponses,
    ListReportsErrors,
    ListReportsParams,
    ListReportsResponse,
    ListReportsResponses,
    ReportPromptSnapshot,
    ReportSummary,
  };
}
