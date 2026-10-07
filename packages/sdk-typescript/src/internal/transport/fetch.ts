import { isStreamed } from '../core/body';
import { metadataHeaders } from '../core/metadata';
import type { PreparedRequest, Transport } from '../core/types';

export type FetchOptions = Omit<RequestInit, 'body' | 'headers' | 'method' | 'signal'>;

const OWNED = ['body', 'headers', 'method', 'signal'] as const;

function extraInit(request: PreparedRequest<string>): RequestInit | undefined {
  const extra = request.options['fetchOptions'] as RequestInit | undefined;
  if (!extra) return undefined;
  const rest: RequestInit = { ...extra };
  for (const key of OWNED) delete rest[key];
  return rest;
}

function toRequestInit(request: PreparedRequest<string>): RequestInit {
  return {
    ...extraInit(request),
    ...(request.body !== undefined && { body: request.body }),
    ...(isStreamed(request.body) && { duplex: 'half' }),
    headers: metadataHeaders(request.meta),
    method: (request.callable.method ?? 'get').toUpperCase(),
    ...(request.signal !== undefined && { signal: request.signal }),
  };
}

export function createFetchTransport(
  fetchFn?: typeof globalThis.fetch,
): Transport<string, 'unary'> {
  function send(request: PreparedRequest<string>): Promise<Response> {
    const configured = request.options['fetch'] as typeof globalThis.fetch | undefined;
    const call = configured ?? fetchFn ?? globalThis.fetch;
    return call(request.address, toRequestInit(request));
  }

  return {
    name: 'fetch',
    unary: send,
  };
}
