from __future__ import annotations

import math
from typing import Any, AsyncIterator, Callable, Generic, Iterator, cast

from typing_extensions import TypeVar

from ..core.errors import ElmoError
from ..core.response import as_it_arrived, read_reply
from ..core.types import OperationDescriptor, PaginationDescriptor


TItem = TypeVar("TItem")


class _Walk:
    __slots__ = ("cursor", "operation", "options", "position")

    def __init__(
        self,
        operation: OperationDescriptor,
        options: dict[str, Any],
        position: int,
        cursor: Any = None,
    ) -> None:
        self.cursor: Any = cursor
        self.operation: OperationDescriptor = operation
        self.options: dict[str, Any] = options
        self.position: int = position


def _read_path(value: Any, path: str | None) -> Any:
    if not path:
        return value
    current = value
    for key in path.split("."):
        if isinstance(current, dict):
            current = cast(dict[str, Any], current).get(key)
        else:
            current = getattr(current, key, None)
        if current is None:
            return None
    return current


def _read_items(
    data: Any,
    pagination: PaginationDescriptor,
    read: Callable[[Any], Any] = as_it_arrived,
    response: Any = None,
) -> list[Any]:
    items = _read_path(data, pagination.items)
    if not isinstance(items, (list, tuple)):
        return []
    return [read_reply(read, item, response) for item in cast(list[Any], items)]


def _read_count(data: Any, path: str | None) -> float | None:
    if not path:
        return None
    value = _read_path(data, path)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return float(value)


def _start_of(pagination: PaginationDescriptor) -> int:
    if pagination.start is not None:
        return pagination.start
    return 1 if pagination.style == "page" else 0


def _with_position(
    options: dict[str, Any], pagination: PaginationDescriptor, value: Any
) -> dict[str, Any]:
    name = pagination.param
    if not name:
        return options
    layer = pagination.location or "query"
    placed = dict(options)
    own: dict[str, Any] = placed.get(layer) or {}
    placed[layer] = {**own, name: value}
    return placed


def _step_counted(
    walk: _Walk,
    pagination: PaginationDescriptor,
    data: Any,
    response: Any,
    count: int,
    limit: int | None,
) -> _Walk | None:
    if not count:
        return None
    size = _read_count(data, pagination.size)
    if size is None:
        size = limit
    paged = pagination.style == "page"
    position = walk.position + (1 if paged else int(size or count))
    start = _start_of(pagination)

    pages = _read_count(data, pagination.pages) if paged else None
    total = _read_count(data, pagination.total)
    if pages is None and total is None and size is not None and count < size:
        return None
    if pages is not None and position - start >= pages:
        return None
    if total is not None:
        read = (
            (position - start) * (count if size is None else size)
            if paged
            else position
        )
        if read >= total:
            return None
    return _Walk(
        operation=walk.operation,
        options=_with_position(walk.options, pagination, position),
        position=position,
    )


Stepper = Callable[
    [_Walk, PaginationDescriptor, Any, Any, int, int | None], _Walk | None
]


STEPPERS: dict[str, Stepper] = {"page": _step_counted}


def _step_walk(
    walk: _Walk,
    pagination: PaginationDescriptor,
    data: Any,
    response: Any,
    count: int,
    limit: int | None,
) -> _Walk | None:
    step = STEPPERS.get(pagination.style)
    if step is None:
        address = walk.operation.address
        raise ElmoError(
            f'Cannot walk "{address}": this client does not page by "{pagination.style}".',
        )
    if pagination.more and _read_path(data, pagination.more) is False:
        return None
    return step(walk, pagination, data, response, count, limit)


def _load_page(
    client: Any,
    walk: _Walk,
    pagination: PaginationDescriptor,
    limit: int | None,
    max_pages: int,
    read: Callable[[Any], Any] = as_it_arrived,
) -> "Page[Any]":
    result = client.exchange(walk.operation, walk.options)

    data = getattr(result, "data", None)
    response = getattr(result, "response", None)
    items = _read_items(data, pagination, read, response)

    return Page(
        address=walk.operation.address,
        body=data,
        client=client,
        data=items,
        limit=limit,
        max_pages=max_pages,
        pagination=pagination,
        read=read,
        response=response,
        walk=_step_walk(walk, pagination, data, response, len(items), limit),
    )


class Page(Generic[TItem]):
    """One page of a paginated call.

    Iterating a page walks from it to the end of the collection, so iterating the
    first one covers everything.

    """

    __slots__ = (
        "_address",
        "_client",
        "_limit",
        "_max_pages",
        "_next",
        "_pagination",
        "_read",
        "body",
        "data",
        "response",
    )

    def __init__(
        self,
        address: str,
        client: Any,
        data: list[TItem],
        body: Any,
        limit: int | None,
        max_pages: int,
        pagination: PaginationDescriptor,
        read: Callable[[Any], Any],
        response: Any,
        walk: _Walk | None,
    ) -> None:
        self.body: Any = body
        """The whole reply body, counts and all."""
        self.data: list[TItem] = data
        """The items on this page, read out of the body."""
        self.response: Any = response
        """The transport's own reply, for a status, a header or a rate-limit line."""
        self._address = address
        self._client = client
        self._limit = limit
        self._max_pages = max_pages
        self._next = walk
        self._pagination = pagination
        self._read = read

    def has_next_page(self) -> bool:
        """Whether a page follows this one. It sends no request: this page's reply holds the answer."""

        return self._next is not None

    def get_next_page(self) -> "Page[TItem]":
        """The next page. Raises when `has_next_page` is false."""

        if self._next is None:
            raise ElmoError(
                f'"{self._address}" has no page after this one. Check `has_next_page()` first.',
            )
        return _load_page(
            self._client,
            self._next,
            self._pagination,
            self._limit,
            self._max_pages,
            self._read,
        )

    def __iter__(self) -> Iterator[TItem]:
        """Every item, page after page, up to `max_pages`."""

        current: "Page[TItem]" = self
        index = 1
        while True:
            for item in current.data:
                yield item
            if index >= self._max_pages or not current.has_next_page():
                return
            current = current.get_next_page()
            index += 1


DEFAULT_MAX_PAGES = 1000


def _opened_at(options: dict[str, Any], pagination: PaginationDescriptor) -> Any:
    if not pagination.param:
        return None
    stated: dict[str, Any] = options.get(pagination.location or "query") or {}
    return stated.get(pagination.param)


def _pagination_of(operation: OperationDescriptor) -> PaginationDescriptor:
    if operation.pagination is not None:
        return operation.pagination
    raise ElmoError(
        f'"{operation.address}" is not a paged call, so it has no pages to walk.'
    )


def _open_walk(operation: OperationDescriptor, options: dict[str, Any]) -> _Walk:
    pagination = _pagination_of(operation)
    resolved = dict(options)
    opened = _opened_at(options, pagination)
    position = (
        opened
        if isinstance(opened, int) and not isinstance(opened, bool)
        else _start_of(pagination)
    )
    return _Walk(
        cursor=opened if pagination.style == "cursor" else None,
        operation=operation,
        options=resolved,
        position=position,
    )


def _requested_limit(
    options: dict[str, Any], pagination: PaginationDescriptor
) -> int | None:
    if not pagination.limit_param:
        return None
    stated: dict[str, Any] = options.get(pagination.location or "query") or {}
    try:
        limit = int(stated[pagination.limit_param])
    except (KeyError, TypeError, ValueError):
        return None
    return limit if limit > 0 else None


def pages(
    client: Any,
    operation: OperationDescriptor,
    options: dict[str, Any] | None = None,
    read: Callable[[Any], Any] = as_it_arrived,
) -> "Page[Any]":
    pagination = _pagination_of(operation)
    resolved = dict(options or {})
    max_pages = resolved.pop("max_pages", DEFAULT_MAX_PAGES)
    limit = _requested_limit(resolved, pagination)
    return _load_page(
        client, _open_walk(operation, resolved), pagination, limit, max_pages, read
    )


async def _load_async_page(
    client: Any,
    walk: _Walk,
    pagination: PaginationDescriptor,
    limit: int | None,
    max_pages: int,
    read: Callable[[Any], Any] = as_it_arrived,
) -> "AsyncPage[Any]":
    result = await client.exchange(walk.operation, walk.options)

    data = getattr(result, "data", None)
    response = getattr(result, "response", None)
    items = _read_items(data, pagination, read, response)

    return AsyncPage(
        address=walk.operation.address,
        body=data,
        client=client,
        data=items,
        limit=limit,
        max_pages=max_pages,
        pagination=pagination,
        read=read,
        response=response,
        walk=_step_walk(walk, pagination, data, response, len(items), limit),
    )


class AsyncPage(Generic[TItem]):
    """One page of a paginated call, over an awaited client.

    Iterating a page walks from it to the end of the collection, so iterating the
    first one covers everything.

    """

    __slots__ = (
        "_address",
        "_client",
        "_limit",
        "_max_pages",
        "_next",
        "_pagination",
        "_read",
        "body",
        "data",
        "response",
    )

    def __init__(
        self,
        address: str,
        client: Any,
        data: list[TItem],
        body: Any,
        limit: int | None,
        max_pages: int,
        pagination: PaginationDescriptor,
        read: Callable[[Any], Any],
        response: Any,
        walk: _Walk | None,
    ) -> None:
        self.body: Any = body
        """The whole reply body, counts and all."""
        self.data: list[TItem] = data
        """The items on this page, read out of the body."""
        self.response: Any = response
        """The transport's own reply, for a status, a header or a rate-limit line."""
        self._address = address
        self._client = client
        self._limit = limit
        self._max_pages = max_pages
        self._next = walk
        self._pagination = pagination
        self._read = read

    def has_next_page(self) -> bool:
        """Whether a page follows this one. It sends no request: this page's reply holds the answer."""

        return self._next is not None

    async def get_next_page(self) -> "AsyncPage[TItem]":
        """The next page. Raises when `has_next_page` is false."""

        if self._next is None:
            raise ElmoError(
                f'"{self._address}" has no page after this one. Check `has_next_page()` first.',
            )
        return await _load_async_page(
            self._client,
            self._next,
            self._pagination,
            self._limit,
            self._max_pages,
            self._read,
        )

    async def __aiter__(self) -> AsyncIterator[TItem]:
        """Every item, page after page, up to `max_pages`."""

        current: "AsyncPage[TItem]" = self
        index = 1
        while True:
            for item in current.data:
                yield item
            if index >= self._max_pages or not current.has_next_page():
                return
            current = await current.get_next_page()
            index += 1


async def async_pages(
    client: Any,
    operation: OperationDescriptor,
    options: dict[str, Any] | None = None,
    read: Callable[[Any], Any] = as_it_arrived,
) -> "AsyncPage[Any]":
    pagination = _pagination_of(operation)
    resolved = dict(options or {})
    max_pages = resolved.pop("max_pages", DEFAULT_MAX_PAGES)
    limit = _requested_limit(resolved, pagination)
    return await _load_async_page(
        client, _open_walk(operation, resolved), pagination, limit, max_pages, read
    )
