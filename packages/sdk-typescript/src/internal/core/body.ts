import type { Result } from './types';

export function discardBody(result: Result | undefined): void {
  const { response } = result ?? {};
  if (response && !response.bodyUsed) void response.body?.cancel().catch(() => {});
}

export function isStreamed(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return typeof (body as ReadableStream).getReader === 'function' || Symbol.asyncIterator in body;
}
