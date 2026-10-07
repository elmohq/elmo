import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { PagePromise, pages } from '../internal/page/page';
import { listBrandsDescriptor } from '../resources/brands';
import type { CallerOptions } from '../resources/shared';
import type { Brand, BrandsList, ListBrandsErrors, ListBrandsParams } from '../types/brands';

/** List brands */
export function brandsList(
  client: Client,
  params?: ListBrandsParams,
  options?: CallerOptions,
): PagePromise<Brand, BrandsList, ListBrandsErrors> {
  return pages(
    options?.client ?? client,
    listBrandsDescriptor,
    mergeParams(groupParams(params, 'query'), options),
  );
}
