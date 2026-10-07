from __future__ import annotations

from typing import Any

from ..core.types import Codec, EncodedBody


def select_codec(codecs: list[Codec], media_type: str | None) -> Codec | None:
    if not media_type:
        return None
    for codec in codecs:
        for candidate in codec.media_types:
            if media_type.startswith(candidate):
                return codec
    return None


def encode_body(
    codecs: list[Codec], media_type: str | None, options: dict[str, Any]
) -> EncodedBody | None:
    body = options.get("body")
    if body is None:
        return None
    if "body_serializer" in options:
        serializer = options["body_serializer"]
        if serializer is None:
            return EncodedBody(content_type=media_type, payload=body)
        return EncodedBody(content_type=media_type, payload=serializer(body))
    codec = select_codec(codecs, media_type)
    if codec is None:
        return EncodedBody(content_type=media_type, payload=body)
    return codec.encode(body)
