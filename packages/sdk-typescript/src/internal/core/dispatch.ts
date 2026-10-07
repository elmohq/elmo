import { mergeConfigs } from './config';
import { applyAliases, applyCredentials } from './credentials';
import { toTransportError, UnsupportedInteractionError } from './errors';
import { FeatureRunner } from './features';
import { mergeMetadata, metadataValue } from './metadata';
import type { ProtocolLookup } from './protocol';
import type {
  AnyTransport,
  Binding,
  CallableDescriptor,
  Codec,
  CredentialSpec,
  EncodedBody,
  Feature,
  FeatureContext,
  PreparedRequest,
  ResolvedOptions,
  Result,
  Send,
} from './types';

export interface DispatchSetup {
  accept?: string;
  aliases?: Readonly<Record<string, string>>;
  codecs: ReadonlyArray<Codec>;
  cookies?: (cookies: Record<string, unknown> | undefined) => string | undefined;
  credentials?: Readonly<Record<string, CredentialSpec>>;
  defaults: ResolvedOptions;
  encodeBody?: (
    codecs: ReadonlyArray<Codec>,
    mediaType: string | undefined,
    options: ResolvedOptions,
  ) => EncodedBody | undefined;
  features?: ReadonlyArray<Feature>;
  protocol: ProtocolLookup;
  transports?: (name: string) => AnyTransport;
}

export interface Exchange {
  read(from?: Response): Promise<unknown>;
  /** The `Response`, with its body unread. */
  readonly response: Response | undefined;
}

interface Sent {
  binding: Binding;
  ctx: FeatureContext;
  result: Result;
  runner: FeatureRunner;
}

async function readReply(
  setup: DispatchSetup,
  sent: Sent,
  request: PreparedRequest,
  from?: Response,
): Promise<unknown> {
  const { binding, ctx, runner } = sent;

  try {
    const raw = from ?? sent.result.response;
    let result =
      request.options.unread || !raw
        ? sent.result
        : await binding.readResult!(raw, request, setup.codecs);

    result = await runner.result(result, request, ctx);

    if (request.options.unread) return result.response;

    const failure = binding.readError?.(result, request) ?? result.error;

    if (request.options.raw) {
      return failure === undefined ? result : { ...result, error: failure };
    }

    if (failure !== undefined) {
      if (request.options.errors !== 'return' && !request.options.envelope) throw failure;
      return {
        data: undefined,
        error: await runner.error(failure, request, ctx),
        ok: false,
        status: result.status,
      };
    }

    return request.options.errors === 'return' || request.options.envelope
      ? { data: result.data, error: undefined, ok: true, status: result.status }
      : result.data;
  } catch (error) {
    throw await runner.error(error, request, ctx);
  }
}

export function rejectUnsendable(transport: AnyTransport, request: PreparedRequest): never {
  throw new UnsupportedInteractionError(transport.name, request.interaction);
}

function shellOf(request: PreparedRequest): PreparedRequest {
  if (request.options.unread) return request;
  return { ...request, options: { ...request.options, unread: true } };
}

function transportFor(setup: DispatchSetup, named: unknown, fallback: AnyTransport): AnyTransport {
  if (named === undefined) return fallback;
  if (typeof named !== 'string') return named as AnyTransport;
  const found = setup.transports?.(named);
  if (!found) throw new Error(`This client carries no transport named "${named}".`);
  return found;
}

async function sendRequest(setup: DispatchSetup, request: PreparedRequest): Promise<Sent> {
  const protocol = setup.protocol(request.interaction);
  const { binding } = protocol;
  const transport = transportFor(setup, request.options['transport'], protocol.transport);
  const runner = new FeatureRunner(setup.features);
  const ctx = { binding, transport };

  const { unary } = transport;
  if (request.interaction !== 'unary' || !unary) rejectUnsendable(transport, request);

  try {
    if (!binding.readResult) {
      throw new Error(
        `The "${binding.name}" binding reads no reply, so it cannot answer this call.`,
      );
    }

    const send: Send = async (attempt) => {
      await runner.request(attempt, ctx);
      let raw: Response;
      try {
        raw = await unary.call(transport, attempt);
      } catch (error) {
        throw toTransportError(error);
      }
      return binding.readResult!(raw, shellOf(attempt), setup.codecs);
    };

    return { binding, ctx, result: await runner.send(send, ctx)(request), runner };
  } catch (error) {
    throw await runner.error(error, request, ctx);
  }
}

export async function execute(setup: DispatchSetup, request: PreparedRequest): Promise<unknown> {
  return readReply(setup, await sendRequest(setup, request), request);
}

export function buildRequest(
  setup: DispatchSetup,
  callable: CallableDescriptor,
  resolved: ResolvedOptions,
): PreparedRequest {
  const interaction = callable.interaction ?? 'unary';
  const { binding } = setup.protocol(interaction);
  const encoded = setup.encodeBody?.(setup.codecs, callable.mediaType, resolved);
  const meta = mergeMetadata(resolved.headers);
  if (encoded?.contentType && meta['content-type'] === undefined) {
    meta['content-type'] = encoded.contentType;
  }

  const accept = callable.accept ?? setup.accept;
  if (accept && meta['accept'] === undefined) meta['accept'] = accept;

  const cookies = setup.cookies?.(resolved.cookies);
  if (cookies) {
    const held = metadataValue(meta['cookie']);
    meta['cookie'] = held ? `${held}; ${cookies}` : cookies;
  }

  return {
    address: binding.resolveAddress(callable, resolved),
    body: encoded?.payload,
    callable,
    interaction,
    meta,
    options: resolved,
    signal: resolved.signal,
  };
}

export async function prepare<TAddress = unknown>(
  setup: DispatchSetup,
  callable: CallableDescriptor,
  options: ResolvedOptions = {},
): Promise<PreparedRequest<TAddress>> {
  const { binding, transport } = setup.protocol(callable.interaction);
  const resolved = mergeConfigs(
    setup.defaults,
    applyCredentials(applyAliases(options, setup.aliases), setup.credentials),
  );
  const runner = new FeatureRunner(setup.features);
  const ctx = { binding, transport };

  await runner.options(resolved, callable, ctx);

  const request = buildRequest(setup, callable, resolved);

  await runner.prepare(request, ctx);
  return request as PreparedRequest<TAddress>;
}

export async function dispatch(
  setup: DispatchSetup,
  callable: CallableDescriptor,
  options: ResolvedOptions = {},
): Promise<unknown> {
  return execute(setup, await prepare(setup, callable, options));
}

export async function exchange(
  setup: DispatchSetup,
  callable: CallableDescriptor,
  options: ResolvedOptions = {},
): Promise<Exchange> {
  const request = await prepare(setup, callable, options);
  const sent = await sendRequest(setup, request);
  let read: Promise<unknown> | undefined;
  return {
    read: (from) => (read ??= readReply(setup, sent, request, from)),
    response: sent.result.response,
  };
}
