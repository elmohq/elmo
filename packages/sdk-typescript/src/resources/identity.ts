import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { decoded, reviving } from '../internal/features/validate';
import type { ApiKeyIdentity, GetMeErrors, GetMeResponse, GetMeResponses } from '../types/identity';

function reviveApiKeyIdentity(value: ApiKeyIdentity): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('ApiKeyIdentity.createdAt', value.createdAt, (raw) => new Date(raw));
  }
  if (value.expiresAt != null) {
    value.expiresAt = decoded('ApiKeyIdentity.expiresAt', value.expiresAt, (raw) => new Date(raw));
  }
  if (value.lastUsedAt != null) {
    value.lastUsedAt = decoded(
      'ApiKeyIdentity.lastUsedAt',
      value.lastUsedAt,
      (raw) => new Date(raw),
    );
  }
}

export const getMeDescriptor = /* @__PURE__ */ callable({
  address: '/me',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveApiKeyIdentity) },
} as const);

/** What the calling key is and what it may reach */
export class Me extends ElmoResource {
  /**
   * Describe the calling key
   *
   * What this key is, which organization and brands it reaches, and which scopes it holds. Requires no scope, so it is always safe to call first when wiring up an integration.
   */
  public get(options?: CallerOptions): RestCallPromise<GetMeResponses, GetMeErrors> {
    return callPromise(options?.client ?? this.client, getMeDescriptor, options);
  }
}

export declare namespace Me {
  export type { ApiKeyIdentity, GetMeErrors, GetMeResponse, GetMeResponses };
}
