from __future__ import annotations

import inspect
from typing import Awaitable, Callable, Sequence, TypedDict, cast

from typing_extensions import TypeVar

from ..core.features import Feature
from ..core.types import FeatureContext, PreparedRequest, Result


TValue = TypeVar("TValue")


async def _awaited(value: TValue | Awaitable[TValue]) -> TValue:
    return await value if inspect.isawaitable(value) else cast(TValue, value)


ErrorHook = Callable[
    [BaseException, PreparedRequest], BaseException | Awaitable[BaseException]
]
"""Returns the error to raise, which may be another."""


RequestHook = Callable[[PreparedRequest], None | Awaitable[None]]
"""Reads the built request, last before it is sent. What it returns is ignored."""


ResponseHook = Callable[[Result, PreparedRequest], Result | Awaitable[Result]]
"""Returns the result to read, which may be another."""


class Interceptors(TypedDict, total=False):
    """Your own hooks, run at three points in every call.

    Each sequence runs in order. `request` sees the request after the
    credentials are on it and before it goes to the wire. `response` and
    `error` each return what the caller reads, so a hook that only observes
    returns what it was given.

    A call that reads a stream runs `request` and `error`, and no `response`
    hook at all: there is no single reply to hand one, and a hook that returned
    a different result would have nowhere to put it.

    One type for both clients, rather than one each, so both trees share a
    single options bag. A hook may be `async def`, which only the awaited
    client waits for: the plain one raises `TypeError` naming the phase rather
    than passing a coroutine on as a result.

    """

    error: Sequence[ErrorHook]
    request: Sequence[RequestHook]
    response: Sequence[ResponseHook]


def _declared(request: PreparedRequest) -> Interceptors:
    declared = request.options.get("interceptors")
    if not isinstance(declared, dict):
        return Interceptors()
    return cast(Interceptors, declared)


def _settled(value: TValue | Awaitable[TValue], phase: str) -> TValue:
    if inspect.isawaitable(value):
        if inspect.iscoroutine(value):
            value.close()
        raise TypeError(
            f"The {phase} interceptor returned an awaitable. Only the async client waits for one.",
        )
    return cast(TValue, value)


class InterceptorsFeature(Feature):
    name = "interceptors"

    def on_request(self, request: PreparedRequest, ctx: FeatureContext) -> None:
        for hook in _declared(request).get("request", ()):
            _settled(hook(request), "request")

    async def on_async_request(
        self, request: PreparedRequest, ctx: FeatureContext
    ) -> None:
        for hook in _declared(request).get("request", ()):
            await _awaited(hook(request))

    def on_result(
        self, result: Result, request: PreparedRequest, ctx: FeatureContext
    ) -> Result:
        for hook in _declared(request).get("response", ()):
            result = _settled(hook(result, request), "response")
        return result

    async def on_async_result(
        self, result: Result, request: PreparedRequest, ctx: FeatureContext
    ) -> Result:
        for hook in _declared(request).get("response", ()):
            result = await _awaited(hook(result, request))
        return result

    def on_error(
        self, error: BaseException, request: PreparedRequest, ctx: FeatureContext
    ) -> BaseException:
        for hook in _declared(request).get("error", ()):
            error = _settled(hook(error, request), "error")
        return error

    async def on_async_error(
        self, error: BaseException, request: PreparedRequest, ctx: FeatureContext
    ) -> BaseException:
        for hook in _declared(request).get("error", ()):
            error = await _awaited(hook(error, request))
        return error
