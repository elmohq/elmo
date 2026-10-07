import { mergeMetadata } from './metadata';
import type { ResolvedOptions } from './types';

function merge(
  sources: ReadonlyArray<Partial<ResolvedOptions> | undefined>,
  keepAccessors: boolean,
): ResolvedOptions {
  const merged: ResolvedOptions = {};
  for (const source of sources) {
    if (!source) continue;
    if (keepAccessors) Object.defineProperties(merged, Object.getOwnPropertyDescriptors(source));
    else Object.assign(merged, source);
  }
  merged.headers = mergeMetadata(...sources.map((source) => source?.headers));

  for (const key of ['cookies', 'path', 'query'] as const) {
    const layers = sources.filter((source) => source?.[key]);
    if (!layers.length) continue;
    const layer: Record<string, unknown> = {};
    for (const source of layers) {
      for (const [name, value] of Object.entries(source![key] as Record<string, unknown>)) {
        if (value !== undefined) layer[name] = value;
      }
    }
    merged[key] = layer;
  }

  return merged;
}

export function mergeConfigs(...sources: ReadonlyArray<Partial<ResolvedOptions> | undefined>) {
  return merge(sources, false);
}

export function createConfig(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return mergeConfigs({ errors: 'throw', headers: {} }, overrides);
}

export function baseUrlOf(options: ResolvedOptions, fallback?: string): string | undefined {
  if (options.baseUrl !== undefined) return options.baseUrl;
  const named =
    options.environment !== undefined ? options.environments?.[options.environment] : undefined;
  return named ?? fallback;
}

export function mergeDefaults(...sources: ReadonlyArray<Partial<ResolvedOptions> | undefined>) {
  return merge(sources, true);
}
