import type { BaseUrl, BehaviorOptions, ClientCredentials, ClientOptions } from '../client';
import type { Client } from '../internal/core/client';
import { clientFor, withClient } from '../internal/core/client';
import type {
  AuthScheme,
  AuthValue,
  BodySerializerOptions,
  ConnectionOptions,
  MetadataOptions,
  PageOptions,
  SignalOptions,
} from '../internal/core/types';

/** What one call may set for itself, overriding the client it goes through. */
export type CallerOptions = BehaviorOptions &
  BodySerializerOptions &
  ClientCredentials &
  ConnectionOptions<BaseUrl, AuthValue, never> &
  MetadataOptions &
  PageOptions &
  SignalOptions & {
    /**
     * The client that sends this call, in place of the one this SDK uses.
     *
     * Build one with `createElmoClient`.
     */
    client?: Client;
  };

/** An instance admin key from `ADMIN_API_KEYS`, or an organization key (`elmo_…`) issued from the dashboard. */
export const apiKeyRequirements = [
  {
    key: 'apiKey',
    scheme: 'bearer',
    type: 'http',
  },
] as const satisfies ReadonlyArray<AuthScheme>;

export class ElmoResource {
  /** The client every call on this SDK dispatches through. */
  readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * The same calls, with different options.
   *
   * Options given here layer over the ones already in force. Headers,
   * path parameters and query parameters merge per name. Everything else
   * replaces. What this was called on does not change.
   */
  public withOptions(options: ClientOptions): this {
    return withClient(this, clientFor(options, this.client));
  }
}
