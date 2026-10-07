import type { SerializationDescriptor } from '../../core/types';

export type ResolveAddress = (args: {
  /** The path as the API describes it, with its placeholders not yet filled. */
  address: string;
  baseUrl?: string | undefined;
  path?: Record<string, unknown> | undefined;
  query?: Record<string, unknown> | undefined;
  serialization?: SerializationDescriptor | undefined;
}) => string;

function joinPath(base: string, path: string): string {
  return base.endsWith('/') && path.startsWith('/') ? base + path.slice(1) : base + path;
}

export function joinAddress(baseUrl: string | undefined, path: string): string {
  const base = baseUrl ?? '';
  const hash = base.indexOf('#');
  const kept = hash === -1 ? base : base.slice(0, hash);
  const mark = kept.indexOf('?');
  if (mark === -1) return joinPath(kept, path);

  const joined = joinPath(kept.slice(0, mark), path);
  const query = kept.slice(mark + 1);
  if (!query) return joined;
  return `${joined}${joined.includes('?') ? '&' : '?'}${query}`;
}
