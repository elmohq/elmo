import type { CredentialSpec, ResolvedOptions } from './types';

export function applyAliases(
  config: Partial<ResolvedOptions>,
  aliases: Readonly<Record<string, string>> | undefined,
): Partial<ResolvedOptions> {
  if (!aliases) return config;

  let applied: Record<string, unknown> | undefined;
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (!(alias in config)) continue;
    applied ??= { ...config };
    if (applied[canonical] === undefined) applied[canonical] = applied[alias];
    delete applied[alias];
  }

  return (applied as Partial<ResolvedOptions> | undefined) ?? config;
}

export function applyCredentials(
  config: Partial<ResolvedOptions>,
  credentials: Readonly<Record<string, CredentialSpec>> | undefined,
): Partial<ResolvedOptions> {
  if (!credentials) return config;

  let applied: Record<string, unknown> | undefined;
  const environments = new Set<string>();

  for (const [name, spec] of Object.entries(credentials)) {
    if (spec.option === false || !(name in config)) continue;
    if (config[name] === undefined) {
      applied ??= { ...config };
      delete applied[name];
      continue;
    }
    for (const environment of spec.environments ?? []) environments.add(environment);
  }

  const [environment, ...others] = environments;
  if (environment === undefined || others.length || 'environment' in config) {
    return (applied as Partial<ResolvedOptions> | undefined) ?? config;
  }
  return { ...(applied ?? config), environment };
}
