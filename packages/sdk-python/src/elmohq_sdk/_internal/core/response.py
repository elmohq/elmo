from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
import functools
from typing import Any, Awaitable, Callable, Generic, Mapping, cast

from typing_extensions import ParamSpec, TypeVar

from .errors import ElmoError, unreadable_value
from .types import OperationDescriptor


T = TypeVar("T")


Readers = Mapping[str, Callable[[Any], T] | None]
"""A reader for each reply an operation declares, by the key the document filed
it under: a status, a range such as `2XX`, or `default`. `None` for a reply
with no body.

"""


Read = Callable[[Any], T] | Readers[T]


@dataclass
class Response(Generic[T]):
    """A call's answer, and the reply that carried it."""

    data: T
    """What the call would have handed back on its own."""
    response: Any
    """The transport's own reply, for a header or a rate-limit line."""
    status: int
    """The status the reply arrived with, which says which declared reply `data` is."""


_wants_response: ContextVar[bool] = ContextVar("hey_api_wants_response", default=False)


def read_reply(read: Callable[[Any], T], payload: Any, response: Any = None) -> T:
    """Reads a reply through a check, and reports whatever the check refuses."""

    try:
        return read(payload)
    except ElmoError:
        raise
    except Exception as error:
        owner = getattr(read, "__self__", None)
        at: str | None = (
            getattr(error, "title", None)
            or getattr(owner, "__name__", None)
        )
        listed = getattr(error, "errors", None)
        issues = cast(list[Any], listed()) if callable(listed) else []
        if not issues:
            raise unreadable_value(at, payload, response) from error
        first = issues[0]
        for part in first.get("loc", ()):
            if isinstance(part, int):
                at = f"{at or ''}[{part}]"
            else:
                at = f"{at}.{part}" if at else str(part)
        missing = first.get("type") == "missing"
        value = None if missing else first.get("input")
        raise unreadable_value(at, value, response, missing) from error


def _nothing(payload: Any) -> None:
    return None


def as_it_arrived(payload: Any) -> Any:
    return payload


def reader_for(read: Read[T], response: Any) -> Callable[[Any], T]:
    """The reader for the reply that arrived: its status, then its range, then `default`."""

    if callable(read):
        return read
    stated: dict[str, Callable[[Any], T] | None] = {}
    for key, reader in read.items():
        stated[key.upper()] = reader
    status = getattr(response, "status_code", None)
    keys = (
        ["DEFAULT"]
        if status is None
        else [str(status), f"{status // 100}XX", "DEFAULT"]
    )
    for key in keys:
        if key in stated:
            found = stated[key]
            return cast("Callable[[Any], T]", _nothing if found is None else found)
    return cast("Callable[[Any], T]", as_it_arrived)


def _answer(read: Read[T], exchange: Any) -> T:
    response = exchange.response
    data = read_reply(reader_for(read, response), exchange.data, response)
    if not _wants_response.get():
        return data
    status: int = getattr(response, "status_code", 0)
    return cast("T", Response(data=data, response=response, status=status))


def send(
    client: Any,
    operation: OperationDescriptor,
    options: dict[str, Any] | None = None,
    read: Read[T] = as_it_arrived,
) -> T:
    exchange = client.exchange(operation, options)
    return _answer(read, exchange)


P = ParamSpec("P")


R = TypeVar("R")


def with_response(method: Callable[P, R]) -> Callable[P, Response[R]]:
    @functools.wraps(method)
    def wrapped(*args: P.args, **kwargs: P.kwargs) -> Response[R]:
        token = _wants_response.set(True)
        try:
            return cast("Response[R]", method(*args, **kwargs))
        finally:
            _wants_response.reset(token)

    return wrapped


async def async_send(
    client: Any,
    operation: OperationDescriptor,
    options: dict[str, Any] | None = None,
    read: Read[T] = as_it_arrived,
) -> T:
    exchange = await client.exchange(operation, options)
    return _answer(read, exchange)


def async_with_response(
    method: Callable[P, Awaitable[R]],
) -> Callable[P, Awaitable[Response[R]]]:
    @functools.wraps(method)
    async def wrapped(*args: P.args, **kwargs: P.kwargs) -> Response[R]:
        token = _wants_response.set(True)
        try:
            return cast("Response[R]", await method(*args, **kwargs))
        finally:
            _wants_response.reset(token)

    return wrapped
