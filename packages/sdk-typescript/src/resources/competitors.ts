import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import { PagePromise, pages } from '../internal/page/page';
import type {
  Competitor,
  CompetitorsList,
  CreateCompetitorErrors,
  CreateCompetitorParams,
  CreateCompetitorRequest,
  CreateCompetitorResponse,
  CreateCompetitorResponses,
  DeleteCompetitorErrors,
  DeleteCompetitorResponse,
  DeleteCompetitorResponses,
  GetCompetitorErrors,
  GetCompetitorResponse,
  GetCompetitorResponses,
  ListCompetitorsErrors,
  ListCompetitorsParams,
  ListCompetitorsResponse,
  ListCompetitorsResponses,
  UpdateCompetitorErrors,
  UpdateCompetitorParams,
  UpdateCompetitorRequest,
  UpdateCompetitorResponse,
  UpdateCompetitorResponses,
} from '../types/competitors';

function reviveCompetitor(value: Competitor): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('Competitor.createdAt', value.createdAt, (raw) => new Date(raw));
  }
  if (value.updatedAt != null) {
    value.updatedAt = decoded('Competitor.updatedAt', value.updatedAt, (raw) => new Date(raw));
  }
}

function reviveCompetitorsList(value: CompetitorsList): void {
  if (value.data != null) {
    value.data.forEach((item) => {
      reviveCompetitor(item);
    });
  }
  if (value.competitors != null) {
    value.competitors.forEach((item) => {
      reviveCompetitor(item);
    });
  }
}

export const listCompetitorsDescriptor = /* @__PURE__ */ callable({
  address: '/competitors',
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
  validators: { response: /* @__PURE__ */ reviving(reviveCompetitorsList) },
} as const);

export const createCompetitorDescriptor = /* @__PURE__ */ callable({
  address: '/competitors',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'post',
  validators: { response: /* @__PURE__ */ reviving(reviveCompetitor) },
} as const);

export const deleteCompetitorFields = { path: ['competitorId'] };

export const deleteCompetitorDescriptor = /* @__PURE__ */ callable({
  address: '/competitors/{competitorId}',
  auth: apiKeyRequirements,
  method: 'delete',
  validators: { response: /* @__PURE__ */ reviving(reviveCompetitor) },
} as const);

export const getCompetitorFields = { path: ['competitorId'] };

export const getCompetitorDescriptor = /* @__PURE__ */ callable({
  address: '/competitors/{competitorId}',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveCompetitor) },
} as const);

export const updateCompetitorFields = { path: ['competitorId'] };

export const updateCompetitorDescriptor = /* @__PURE__ */ callable({
  address: '/competitors/{competitorId}',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'patch',
  validators: { response: /* @__PURE__ */ reviving(reviveCompetitor) },
} as const);

/** Manage brand competitors */
export class Competitors extends ElmoResource {
  /** Add a competitor */
  public create(
    params: CreateCompetitorParams,
    options?: CallerOptions,
  ): RestCallPromise<CreateCompetitorResponses, CreateCompetitorErrors> {
    return callPromise(
      options?.client ?? this.client,
      createCompetitorDescriptor,
      mergeParams(groupParams(params, 'body'), options),
    );
  }

  /**
   * Delete a competitor
   *
   * @param competitorId Competitor identifier (UUID)
   */
  public delete(
    competitorId: string,
    options?: CallerOptions,
  ): RestCallPromise<DeleteCompetitorResponses, DeleteCompetitorErrors> {
    return callPromise(
      options?.client ?? this.client,
      deleteCompetitorDescriptor,
      mergeParams(groupParams({ competitorId }, deleteCompetitorFields, 'query'), options),
    );
  }

  /**
   * Get a competitor
   *
   * @param competitorId Competitor identifier (UUID)
   */
  public get(
    competitorId: string,
    options?: CallerOptions,
  ): RestCallPromise<GetCompetitorResponses, GetCompetitorErrors> {
    return callPromise(
      options?.client ?? this.client,
      getCompetitorDescriptor,
      mergeParams(groupParams({ competitorId }, getCompetitorFields, 'query'), options),
    );
  }

  /** List competitors */
  public list(
    params?: ListCompetitorsParams,
    options?: CallerOptions,
  ): PagePromise<Competitor, CompetitorsList, ListCompetitorsErrors> {
    return pages(
      options?.client ?? this.client,
      listCompetitorsDescriptor,
      mergeParams(groupParams(params, 'query'), options),
    );
  }

  /**
   * Update a competitor
   *
   * @param competitorId Competitor identifier (UUID)
   */
  public update(
    competitorId: string,
    params: UpdateCompetitorParams,
    options?: CallerOptions,
  ): RestCallPromise<UpdateCompetitorResponses, UpdateCompetitorErrors> {
    return callPromise(
      options?.client ?? this.client,
      updateCompetitorDescriptor,
      mergeParams(
        groupParams({ ...params, competitorId }, updateCompetitorFields, 'body'),
        options,
      ),
    );
  }
}

export declare namespace Competitors {
  export type {
    Competitor,
    CompetitorsList,
    CreateCompetitorErrors,
    CreateCompetitorParams,
    CreateCompetitorRequest,
    CreateCompetitorResponse,
    CreateCompetitorResponses,
    DeleteCompetitorErrors,
    DeleteCompetitorResponse,
    DeleteCompetitorResponses,
    GetCompetitorErrors,
    GetCompetitorResponse,
    GetCompetitorResponses,
    ListCompetitorsErrors,
    ListCompetitorsParams,
    ListCompetitorsResponse,
    ListCompetitorsResponses,
    UpdateCompetitorErrors,
    UpdateCompetitorParams,
    UpdateCompetitorRequest,
    UpdateCompetitorResponse,
    UpdateCompetitorResponses,
  };
}
