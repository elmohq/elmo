from __future__ import annotations

from dataclasses import dataclass, field
import threading
from typing import Any, Awaitable, Callable, Protocol, cast
from urllib.parse import unquote_plus

from ..core.types import (
    AsyncStreamResponse,
    Interaction,
    PreparedRequest,
    RawResponse,
    StreamResponse,
)


class HttpxResponse(RawResponse, StreamResponse, Protocol): ...


class HttpxLike(Protocol):
    """The part of an httpx client this SDK calls. A client from a fork of httpx fits too."""

    def build_request(
        self,
        method: str,
        url: str,
        *,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> Any: ...

    def close(self) -> None: ...

    def send(
        self, request: Any, *, stream: bool = False, auth: Any = None
    ) -> HttpxResponse: ...


class AsyncHttpxResponse(RawResponse, AsyncStreamResponse, Protocol): ...


class AsyncHttpxLike(Protocol):
    """`HttpxLike` for an async client, whose `send` is awaitable."""

    def aclose(self) -> Awaitable[None]: ...

    @property
    def is_closed(self) -> bool: ...

    def build_request(
        self,
        method: str,
        url: str,
        *,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> Any: ...

    def send(
        self, request: Any, *, stream: bool = False, auth: Any = None
    ) -> Awaitable[AsyncHttpxResponse]: ...


def _name(pair: str) -> str:
    return unquote_plus(pair.partition("=")[0])


def _pairs(query: str) -> list[str]:
    return [pair for pair in query.split("&") if pair]


def httpx_options(request: PreparedRequest) -> dict[str, Any]:
    options: dict[str, Any] = {
        "content": request.body,
        "headers": dict(request.meta),
        "method": (request.operation.method or "get").upper(),
        "url": request.address,
    }
    timeout = request.options.get("timeout")
    if timeout is not None:
        options["timeout"] = timeout or None
    return options


def build_httpx_request(
    client: HttpxLike | AsyncHttpxLike, request: PreparedRequest
) -> Any:
    built = client.build_request(**httpx_options(request))
    _, _, ours = request.address.partition("?")
    sent = built.url.query.decode("ascii")
    if sent == ours:
        return built
    names = {_name(pair) for pair in _pairs(ours)}
    theirs = [pair for pair in _pairs(sent) if _name(pair) not in names]
    query = "&".join(_pairs(ours) + theirs)
    built.url = built.url.copy_with(query=query.encode("ascii") if query else None)
    return built


def _as_placed(request: Any) -> Any:
    return request


def send_options(request: PreparedRequest) -> dict[str, Any]:
    return {"auth": _as_placed} if "authorization" in request.meta else {}


@dataclass
class HttpxTransport:
    client: HttpxLike | None = None
    factory: Callable[[], HttpxLike] | None = None
    name: str = "httpx2"
    supports: list[Interaction] = field(
        default_factory=lambda: ["serverStream", "unary"]
    )
    _built: HttpxLike | None = field(default=None, init=False, repr=False)
    _lock: threading.Lock = field(
        default_factory=threading.Lock, init=False, repr=False
    )

    def __post_init__(self) -> None:
        if self.client is None and self.factory is None:
            raise ValueError("An httpx transport needs `client` or `factory`.")

    def _current(self) -> HttpxLike:
        if self.client is not None:
            return self.client
        if self._built is None:
            with self._lock:
                if self._built is None:
                    self._built = cast(Callable[[], HttpxLike], self.factory)()
        return self._built

    def close(self) -> None:
        built = self._built
        self._built = None
        if built is not None:
            built.close()

    def server_stream(self, request: PreparedRequest) -> StreamResponse:
        client = self._current()
        return client.send(
            build_httpx_request(client, request), stream=True, **send_options(request)
        )

    def unary(self, request: PreparedRequest) -> RawResponse:
        client = self._current()
        return client.send(
            build_httpx_request(client, request), **send_options(request)
        )


def create_httpx_transport(
    client: HttpxLike | None = None,
    name: str = "httpx2",
    *,
    factory: Callable[[], HttpxLike] | None = None,
) -> HttpxTransport:
    return HttpxTransport(client=client, factory=factory, name=name)


class _EventLoop(Protocol):
    def is_closed(self) -> bool: ...


@dataclass
class AsyncHttpxTransport:
    client: AsyncHttpxLike | None = None
    factory: Callable[[], AsyncHttpxLike] | None = None
    name: str = "httpx2"
    supports: list[Interaction] = field(
        default_factory=lambda: ["serverStream", "unary"]
    )
    _clients: dict[_EventLoop, AsyncHttpxLike] = field(
        default_factory=lambda: {}, init=False, repr=False
    )
    _lock: threading.Lock = field(
        default_factory=threading.Lock, init=False, repr=False
    )

    def __post_init__(self) -> None:
        if self.client is None and self.factory is None:
            raise ValueError("An async httpx transport needs `client` or `factory`.")

    def _current(self) -> AsyncHttpxLike:
        if self.client is not None:
            return self.client
        import asyncio

        loop = asyncio.get_running_loop()
        built = self._clients.get(loop)
        if built is not None:
            return built
        with self._lock:
            for closed in [loop_ for loop_ in self._clients if loop_.is_closed()]:
                del self._clients[closed]
            if loop not in self._clients:
                self._clients[loop] = cast(Callable[[], AsyncHttpxLike], self.factory)()
            return self._clients[loop]

    async def server_stream(self, request: PreparedRequest) -> AsyncStreamResponse:
        client = self._current()
        return await client.send(
            build_httpx_request(client, request), stream=True, **send_options(request)
        )

    async def unary(self, request: PreparedRequest) -> RawResponse:
        client = self._current()
        return await client.send(
            build_httpx_request(client, request), **send_options(request)
        )

    async def aclose(self) -> None:
        with self._lock:
            built = list(self._clients.values())
            self._clients.clear()
        for client in built:
            if not client.is_closed:
                await client.aclose()


def create_async_httpx_transport(
    client: AsyncHttpxLike | None = None,
    name: str = "httpx2",
    *,
    factory: Callable[[], AsyncHttpxLike] | None = None,
) -> AsyncHttpxTransport:
    return AsyncHttpxTransport(client=client, factory=factory, name=name)
