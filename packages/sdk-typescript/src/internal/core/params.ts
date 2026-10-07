import type { ResolvedOptions } from './types';

export type ExtraKeys = 'body' | 'query';

export type FlatLayer = Readonly<Record<string, string>> | ReadonlyArray<string>;

export interface FlatFields {
  body?: FlatLayer;
  cookies?: FlatLayer;
  headers?: FlatLayer;
  path?: FlatLayer;
  query?: FlatLayer;
  whole?: string;
}

interface Placement {
  in: keyof FlatFields;
  map: string;
}

const NONE: ReadonlyMap<string, Placement> = new Map();

const LAYERS = ['cookies', 'headers', 'path', 'query'] as const;

export function mergeParams(
  inputs: Readonly<Record<string, unknown>> | undefined,
  options: Readonly<Record<string, unknown>> | undefined,
): ResolvedOptions {
  const merged: Record<string, unknown> = { ...inputs, ...options };
  if (inputs && options) {
    for (const layer of LAYERS) {
      const declared = inputs[layer] as Record<string, unknown> | undefined;
      const given = options[layer] as Record<string, unknown> | undefined;
      if (!declared || !given) continue;
      const both: Record<string, unknown> = { ...declared };
      for (const [name, value] of Object.entries(given)) {
        if (value !== undefined) both[name] = value;
      }
      merged[layer] = both;
    }
  }
  return merged as ResolvedOptions;
}

const placed = new WeakMap<FlatFields, ReadonlyMap<string, Placement>>();

function placements(fields: FlatFields): ReadonlyMap<string, Placement> {
  let known = placed.get(fields);
  if (!known) {
    const built = new Map<string, Placement>();
    for (const layer of Object.keys(fields) as Array<keyof FlatFields>) {
      const names = fields[layer];
      if (typeof names === 'string') built.set(names, { in: layer, map: names });
      else if (Array.isArray(names)) {
        for (const key of names) built.set(key, { in: layer, map: key });
      } else if (names) {
        for (const [key, wire] of Object.entries(names)) built.set(key, { in: layer, map: wire });
      }
    }
    known = built;
    placed.set(fields, built);
  }
  return known;
}

export function groupParams(
  options: Readonly<Record<string, unknown>> | undefined,
  fields?: FlatFields | ExtraKeys,
  extras?: ExtraKeys,
): ResolvedOptions {
  const bare = typeof fields === 'string';
  const named = fields && !bare ? placements(fields) : NONE;
  const rest = bare ? fields : extras;
  const grouped: Record<string, unknown> = {};
  const given: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options ?? {})) {
    const place = named.get(key);

    if (!place) {
      if (rest === undefined) given[key] = value;
      else ((grouped[rest] ??= {}) as Record<string, unknown>)[key] = value;
      continue;
    }

    if (place.in === 'whole') {
      grouped['body'] = value;
      continue;
    }

    ((grouped[place.in] ??= {}) as Record<string, unknown>)[place.map] = value;
  }

  return mergeParams(grouped, given);
}
