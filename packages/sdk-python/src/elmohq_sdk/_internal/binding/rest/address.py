from __future__ import annotations

from typing import Any, Protocol

from ...core.types import SerializationDescriptor


class ResolveAddress(Protocol):
    def __call__(
        self,
        *,
        url: str,
        base_url: str | None = None,
        path: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        serialization: SerializationDescriptor | None = None,
    ) -> str: ...


def join_address(base_url: str | None, path: str) -> str:
    """Puts a base URL in front of an address, whatever the base carries.

    A base a caller pasted can end in a slash, carry a query, or carry a
    fragment. The fragment goes, the query moves to the end, and one slash
    joins the two paths.

    """

    base = (base_url or "").partition("#")[0]
    kept, _, query = base.partition("?")
    if kept.endswith("/") and path.startswith("/"):
        path = path[1:]
    joined = kept + path
    if not query:
        return joined
    return f"{joined}{'&' if '?' in joined else '?'}{query}"
