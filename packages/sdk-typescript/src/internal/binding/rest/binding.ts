import type { ResolveAddress } from './address';
import { toApiError, unreadableBody } from './errors';
import { NO_BODY, selectCodec } from '../../codec/registry';
import { baseUrlOf } from '../../core/config';
import { classifyError, ElmoError, toTransportError } from '../../core/errors';
import type {
  Binding,
  CallableDescriptor,
  Codec,
  Credential,
  PreparedRequest,
  ResolvedOptions,
  Result,
} from '../../core/types';

function placeInHeader(credential: Credential, request: PreparedRequest<string>): void {
  request.meta[credential.name.toLowerCase()] = credential.value;
}

type Placer = (credential: Credential, request: PreparedRequest<string>) => void;

const PLACERS: Partial<Readonly<Record<Credential['in'], Placer>>> = { header: placeInHeader };

function parserFor(contentType: string | null): 'blob' | 'json' | 'text' {
  if (!contentType) return 'text';
  if (contentType.startsWith('application/json') || contentType.endsWith('+json')) return 'json';
  if (contentType.startsWith('text/')) return 'text';
  return 'blob';
}

async function readBody(raw: Response, codecs: ReadonlyArray<Codec> = []): Promise<unknown> {
  if (raw.body === null || raw.headers.get('content-length') === '0') return NO_BODY;

  const contentType = raw.headers.get('content-type');
  const codec = selectCodec(codecs, contentType ?? undefined);
  const parser = parserFor(contentType);

  try {
    if (codec?.decode) return await codec.decode(raw);
    if (parser === 'blob') return await raw.blob();

    const text = await raw.text();
    if (text === '') return NO_BODY;
    return parser === 'json' ? JSON.parse(text) : text;
  } catch (error) {
    if (error instanceof ElmoError) throw error;
    if (classifyError(error) === 'abort') throw toTransportError(error);
    throw unreadableBody(raw, error);
  }
}

export function createRestBinding(resolveAddress: ResolveAddress): Binding<string> {
  return {
    applyAuth(credential: Credential, request: PreparedRequest<string>): void {
      const place = PLACERS[credential.in];
      if (!place) {
        throw new Error(
          `This client places no credential in the ${credential.in}, so "${request.callable.address}" cannot be authenticated.`,
        );
      }
      place(credential, request);
    },
    name: 'rest',
    readError(result: Result, request: PreparedRequest<string>): unknown {
      const { response } = result;
      if (!response || (response.ok && result.error === undefined)) return;
      return toApiError(response.status, result.error, response, request.unauthenticated);
    },
    async readResult(
      raw: Response,
      request: PreparedRequest<string>,
      codecs: ReadonlyArray<Codec>,
    ): Promise<Result> {
      if (request.options.unread) return { ok: raw.ok, response: raw, status: raw.status };

      const value =
        raw.status === 204 || raw.status === 205 ? NO_BODY : await readBody(raw, codecs);

      return raw.ok
        ? { data: value, ok: true, response: raw, status: raw.status }
        : { error: value, ok: false, response: raw, status: raw.status };
    },
    resolveAddress(callable: CallableDescriptor, options: ResolvedOptions): string {
      return resolveAddress({
        address: callable.address,
        baseUrl: baseUrlOf(options, callable.baseUrl),
        path: options.path,
        query: options.query,
        serialization: callable.serialization,
      });
    },
  };
}
