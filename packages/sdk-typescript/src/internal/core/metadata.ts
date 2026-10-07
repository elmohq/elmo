import { toText } from './text';
import type { Metadata, MetadataInput, MetadataValue } from './types';

function entriesOf(source: MetadataInput): Iterable<readonly [string, unknown]> {
  if (typeof (source as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return source as Iterable<readonly [string, string]>;
  }
  return Object.entries(source);
}

export function metadataText(value: unknown): string {
  if (Array.isArray(value)) return value.map(toText).join(',');
  if (typeof value !== 'object' || value === null || value instanceof Date) return toText(value);
  const pairs: Array<string> = [];
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== null) pairs.push(key, toText(item));
  }
  return pairs.join(',');
}

export function mergeMetadata(...sources: ReadonlyArray<MetadataInput | undefined>): Metadata {
  const merged: Record<string, MetadataValue> = {};
  for (const source of sources) {
    if (!source) continue;
    const seen = new Set<string>();
    for (const [key, value] of entriesOf(source)) {
      const name = key.toLowerCase();
      if (value === undefined) continue;
      if (value === null) {
        delete merged[name];
        seen.add(name);
        continue;
      }
      const text = metadataText(value);
      const held = seen.has(name) ? merged[name] : undefined;
      seen.add(name);
      if (held === undefined) merged[name] = text;
      else merged[name] = Array.isArray(held) ? [...held, text] : [held, text];
    }
  }
  return merged;
}

export function metadataValue(value: MetadataValue): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(', ') : value;
}

function metadataPairs(meta: Metadata): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) pairs.push([name, item]);
      continue;
    }
    pairs.push([name, value]);
  }
  return pairs;
}

export function metadataHeaders(meta: Metadata): Headers {
  const headers = new Headers();
  for (const [name, value] of metadataPairs(meta)) headers.append(name, value);
  return headers;
}
