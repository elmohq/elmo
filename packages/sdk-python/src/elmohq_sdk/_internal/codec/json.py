from __future__ import annotations

from dataclasses import dataclass, field
import json
from typing import Any, Sequence, cast

from ..core.text import to_text
from ..core.types import EncodedBody


def as_json(value: Any) -> Any:
    dump = getattr(value, "model_dump", None)
    if dump is None:
        return to_text(value)
    return dump(by_alias=True, exclude_unset=True, mode="json")


@dataclass
class JsonCodec:
    media_types: list[str] = field(default_factory=lambda: ["application/json"])
    name: str = "json"

    def encode(self, value: Any) -> EncodedBody:
        payload = json.dumps(value, default=as_json).encode("utf-8")
        return EncodedBody(payload=payload, content_type="application/json")


json_codec = JsonCodec()


def dumped(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return as_json(value)
    if isinstance(value, dict):
        return {key: dumped(item) for key, item in cast(dict[Any, Any], value).items()}
    if isinstance(value, (list, tuple)):
        return [dumped(item) for item in cast(Sequence[Any], value)]
    return value
