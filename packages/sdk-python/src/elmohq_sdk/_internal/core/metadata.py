from __future__ import annotations

from typing import Any, Mapping, Sequence, cast

from .text import to_text
from .types import Metadata
from ..codec.json import dumped


def metadata_text(value: Any) -> str:
    written = dumped(value)
    if isinstance(written, dict):
        pairs = cast(dict[Any, Any], written).items()
        written = [one for pair in pairs if pair[1] is not None for one in pair]
    if isinstance(written, list):
        return ",".join(to_text(item) for item in cast(Sequence[Any], written))
    return to_text(written)


def merge_metadata(*sources: Mapping[str, Any] | None) -> Metadata:
    merged: Metadata = {}
    for source in sources:
        if not source:
            continue
        for key, value in source.items():
            name = key.lower()
            if value is None:
                merged.pop(name, None)
            else:
                merged[name] = metadata_text(value)
    return merged
