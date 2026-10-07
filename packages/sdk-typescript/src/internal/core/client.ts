import { mergeConfigs, mergeDefaults } from './config';
import { applyAliases, applyCredentials } from './credentials';
import type { DispatchSetup, Exchange } from './dispatch';
import { dispatch, exchange, prepare } from './dispatch';
import type {
  CallableDescriptor,
  CallResult,
  ErrorMode,
  PreparedRequest,
  ResolvedOptions,
} from './types';

export interface Client {
  /** Sends a call and reads the reply. */
  call<TData = unknown, TError = unknown, TMode extends ErrorMode = 'throw'>(
    callable: CallableDescriptor,
    options?: ResolvedOptions,
  ): Promise<CallResult<TData, TError, TMode>>;
  /** Sends a call and hands back the reply with its body not yet read. */
  exchange(callable: CallableDescriptor, options?: ResolvedOptions): Promise<Exchange>;
  /** The request a call would send, built but not sent. */
  prepare<TAddress = unknown>(
    callable: CallableDescriptor,
    options?: ResolvedOptions,
  ): Promise<PreparedRequest<TAddress>>;
  /** The address a call would go to, without sending anything. */
  resolveAddress<TAddress = unknown>(
    callable: CallableDescriptor,
    options?: ResolvedOptions,
  ): TAddress;
  readonly setup: DispatchSetup;
}

export function createClient(setup: DispatchSetup): Client {
  return {
    call<TData = unknown, TError = unknown, TMode extends ErrorMode = 'throw'>(
      callable: CallableDescriptor,
      options?: ResolvedOptions,
    ): Promise<CallResult<TData, TError, TMode>> {
      return dispatch(setup, callable, options) as Promise<CallResult<TData, TError, TMode>>;
    },
    exchange: (callable, options) => exchange(setup, callable, options),
    prepare<TAddress = unknown>(callable: CallableDescriptor, options: ResolvedOptions = {}) {
      return prepare(setup, callable, options) as Promise<PreparedRequest<TAddress>>;
    },
    resolveAddress<TAddress = unknown>(
      callable: CallableDescriptor,
      options: ResolvedOptions = {},
    ) {
      const { binding } = setup.protocol(callable.interaction);
      return binding.resolveAddress(callable, mergeConfigs(setup.defaults, options)) as TAddress;
    },
    setup,
  };
}

export function clientFor(
  args: (Partial<ResolvedOptions> & { client?: Client; key?: string }) | undefined,
  fallback?: Client,
): Client {
  const { client, key: _key, ...args_ } = args ?? {};
  const base = client ?? fallback;
  if (!base) throw new Error('This SDK has no client of its own. Pass one as `client`.');
  const config = applyCredentials(applyAliases(args_, base.setup.aliases), base.setup.credentials);
  if (client && !Object.keys(config).length) return client;
  return createClient({ ...base.setup, defaults: mergeDefaults(base.setup.defaults, config) });
}

export function withClient<T extends object>(source: T, client: Client, key = 'client'): T {
  const derived = Object.create(Object.getPrototypeOf(source)) as Record<string, Client>;
  derived[key] = client;
  return derived as T;
}
