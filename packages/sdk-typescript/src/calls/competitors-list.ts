import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { PagePromise, pages } from '../internal/page/page';
import { listCompetitorsDescriptor } from '../resources/competitors';
import type { CallerOptions } from '../resources/shared';
import type {
  Competitor,
  CompetitorsList,
  ListCompetitorsErrors,
  ListCompetitorsParams,
} from '../types/competitors';

/** List competitors */
export function competitorsList(
  client: Client,
  params?: ListCompetitorsParams,
  options?: CallerOptions,
): PagePromise<Competitor, CompetitorsList, ListCompetitorsErrors> {
  return pages(
    options?.client ?? client,
    listCompetitorsDescriptor,
    mergeParams(groupParams(params, 'query'), options),
  );
}
