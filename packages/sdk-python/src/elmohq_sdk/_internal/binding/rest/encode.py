from __future__ import annotations

from typing import Any
from urllib.parse import quote

from ...core.text import to_text


_UNRESERVED = "!'()*-._~"


def encode_component(value: Any) -> str:
    return quote(to_text(value), safe=_UNRESERVED)


def encode_name(name: str) -> str:
    return encode_component(name).replace("%5B", "[").replace("%5D", "]")
