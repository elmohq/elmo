import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import type {
  ListModelsErrors,
  ListModelsResponse,
  ListModelsResponses,
  Model,
  ModelList,
} from '../types/models';

export const listModelsDescriptor = /* @__PURE__ */ callable({
  address: '/models',
  auth: apiKeyRequirements,
  method: 'get',
} as const);

/** The answer engines this deployment can track */
export class Models extends ElmoResource {
  /**
   * List trackable models
   *
   * The answer engines this deployment can track, so a client can build a model filter without hardcoding ids that differ between deployments.
   *
   * Requires no scope.
   */
  public list(options?: CallerOptions): RestCallPromise<ListModelsResponses, ListModelsErrors> {
    return callPromise(options?.client ?? this.client, listModelsDescriptor, options);
  }
}

export declare namespace Models {
  export type { ListModelsErrors, ListModelsResponse, ListModelsResponses, Model, ModelList };
}
