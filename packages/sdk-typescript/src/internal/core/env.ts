import type { CredentialSpec, ResolvedOptions } from './types';

export interface EnvDefaults {
  readonly baseUrl?: string;
  readonly credentials?: Readonly<Record<string, CredentialSpec>>;
  readonly environment?: string;
  readonly logLevel?: string;
}

export function impliedEnvironment(..._tokens: ReadonlyArray<unknown>): undefined {
  return undefined;
}

export function readEnv(name: string): string | undefined {
  const global = globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  const value = global.process?.env?.[name] ?? global.Deno?.env?.get?.(name);
  return value?.trim() || undefined;
}

function readable(credentials: Readonly<Record<string, CredentialSpec>>): ReadonlyArray<string> {
  return Object.keys(credentials).filter(
    (name) => credentials[name]!.variable && credentials[name]!.option !== false,
  );
}

export function envDefaults(base: ResolvedOptions, spec: EnvDefaults): ResolvedOptions {
  const reads = new WeakMap<object, ResolvedOptions>();

  function resolve(): ResolvedOptions {
    const read: ResolvedOptions = {};
    const address = spec.baseUrl ? (readEnv(spec.baseUrl) ?? base.baseUrl) : undefined;
    if (address !== undefined) read.baseUrl = address;
    if (spec.credentials) {
      const tokens: Record<string, string | undefined> = {};
      for (const name of readable(spec.credentials)) {
        tokens[name] = readEnv(spec.credentials[name]!.variable!);
      }
      Object.assign(read, tokens);
      const environment = impliedEnvironment(tokens, spec.credentials) ?? spec.environment;
      if (environment !== undefined) read.environment = environment;
    } else if (spec.environment !== undefined) {
      read.environment = spec.environment;
    }
    const level = spec.logLevel ? readEnv(spec.logLevel) : undefined;
    if (level !== undefined) read['logLevel'] = level;
    return read;
  }

  function resolvedFor(holder: object): ResolvedOptions {
    let read = reads.get(holder);
    if (!read) {
      read = resolve();
      reads.set(holder, read);
    }
    return read;
  }

  const decided: ReadonlyArray<keyof ResolvedOptions> = [
    ...(spec.credentials ? readable(spec.credentials) : []),
    ...(spec.baseUrl ? (['baseUrl'] as const) : []),
    ...(spec.credentials || spec.environment !== undefined ? (['environment'] as const) : []),
    ...(spec.logLevel ? (['logLevel'] as const) : []),
  ];

  const defaults = { ...base };
  for (const key of decided) {
    Object.defineProperty(defaults, key, {
      configurable: true,
      enumerable: true,
      get() {
        return resolvedFor(this as object)[key];
      },
    });
  }
  return defaults;
}
