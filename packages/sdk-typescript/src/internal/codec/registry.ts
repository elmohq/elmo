import type { BodyInput, Codec, EncodedBody, ResolvedOptions } from '../core/types';

export const NO_BODY = null;

export function selectCodec(
  codecs: ReadonlyArray<Codec>,
  mediaType: string | undefined,
): Codec | undefined {
  if (!mediaType) return undefined;
  return codecs.find((codec) =>
    codec.mediaTypes.some((candidate) => mediaType.startsWith(candidate)),
  );
}

export function encodeBody(
  codecs: ReadonlyArray<Codec>,
  mediaType: string | undefined,
  options: ResolvedOptions,
): EncodedBody | undefined {
  if (options.body === undefined) return undefined;

  if (options.bodySerializer) {
    return { contentType: mediaType, payload: options.bodySerializer(options.body) };
  }
  if (options.bodySerializer === null) {
    return { contentType: mediaType, payload: options.body as BodyInput };
  }

  const codec = selectCodec(codecs, mediaType);
  if (!codec) return { contentType: mediaType, payload: options.body as BodyInput };
  return { contentType: codec.contentType, payload: codec.encode(options.body) };
}
