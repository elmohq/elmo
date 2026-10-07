from __future__ import annotations

import re
from typing import Any, Iterable, Sequence, cast

from .address import join_address
from .encode import encode_component, encode_name
from ...codec.json import dumped
from ...core.errors import empty_path_parameter
from ...core.types import SerializationDescriptor


ABSOLUTE_URL_RE = re.compile(r"^[a-z][a-z\d+.-]*://", re.IGNORECASE)


PATH_PARAM_RE = re.compile(r"\{([^{}]+)\}")


def path_value(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return ",".join(encode_component(item) for item in cast(Sequence[Any], value))
    if isinstance(value, dict):
        parts: list[str] = []
        for key, item in cast(dict[str, Any], value).items():
            parts.append(encode_component(key))
            parts.append(encode_component(item))
        return ",".join(parts)
    return encode_component(value)


def simple_address(
    *,
    url: str,
    base_url: str | None = None,
    path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
    serialization: SerializationDescriptor | None = None,
) -> str:
    path = dumped(path)
    query = dumped(query)
    absolute = bool(ABSOLUTE_URL_RE.match(url))
    path_url = url if absolute or url.startswith("/") else "/" + url
    address = path_url if absolute else join_address(base_url, path_url)

    if path:

        def substitute(match: "re.Match[str]") -> str:
            name = match.group(1)
            value = path.get(name)
            if value is None or value == "":
                raise empty_path_parameter(name, url)
            return path_value(value)

        address = PATH_PARAM_RE.sub(substitute, address)
    if not query:
        return address
    search: list[str] = []
    for name, value in query.items():
        if isinstance(value, dict):
            pairs: Iterable[tuple[str, Any]] = cast(dict[str, Any], value).items()
        elif isinstance(value, (list, tuple)):
            pairs = [(name, item) for item in cast(Sequence[Any], value)]
        else:
            pairs = [(name, value)]
        for key, item in pairs:
            if item is not None:
                search.append(f"{encode_name(key)}={encode_component(item)}")
    if not search:
        return address
    return f"{address}{'&' if '?' in address else '?'}{'&'.join(search)}"
