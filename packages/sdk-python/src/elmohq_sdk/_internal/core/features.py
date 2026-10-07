from __future__ import annotations

from typing import Any, Sequence

from .types import (
    AsyncSend,
    FeatureContext,
    OperationDescriptor,
    PreparedRequest,
    Result,
    Send,
)


class Feature:
    """Hooks that run at fixed points in every call."""

    name = "feature"

    def on_options(
        self,
        options: dict[str, Any],
        operation: OperationDescriptor,
        ctx: FeatureContext,
    ) -> None:
        """Reads and may rewrite the options a call resolved to. The last point
        where a change still reaches the wire.

        """

    def on_prepare(self, request: PreparedRequest, ctx: FeatureContext) -> None: ...

    async def on_async_prepare(
        self, request: PreparedRequest, ctx: FeatureContext
    ) -> None:
        self.on_prepare(request, ctx)

    def on_request(self, request: PreparedRequest, ctx: FeatureContext) -> None: ...

    async def on_async_request(
        self, request: PreparedRequest, ctx: FeatureContext
    ) -> None:
        self.on_request(request, ctx)

    def on_send(
        self, request: PreparedRequest, send: Send, ctx: FeatureContext
    ) -> Result:
        return send(request)

    async def on_async_send(
        self, request: PreparedRequest, send: AsyncSend, ctx: FeatureContext
    ) -> Result:
        return await send(request)

    def on_result(
        self, result: Result, request: PreparedRequest, ctx: FeatureContext
    ) -> Result:
        return result

    async def on_async_result(
        self, result: Result, request: PreparedRequest, ctx: FeatureContext
    ) -> Result:
        return self.on_result(result, request, ctx)

    def on_error(
        self, error: BaseException, request: PreparedRequest, ctx: FeatureContext
    ) -> BaseException:
        return error

    async def on_async_error(
        self, error: BaseException, request: PreparedRequest, ctx: FeatureContext
    ) -> BaseException:
        return self.on_error(error, request, ctx)


def run_options(
    features: Sequence[Feature],
    options: dict[str, Any],
    operation: OperationDescriptor,
    ctx: FeatureContext,
) -> None:
    for feature in features:
        feature.on_options(options, operation, ctx)


def run_prepare(
    features: Sequence[Feature], request: PreparedRequest, ctx: FeatureContext
) -> None:
    for feature in features:
        feature.on_prepare(request, ctx)


def run_error(
    features: Sequence[Feature],
    error: BaseException,
    request: PreparedRequest,
    ctx: FeatureContext,
) -> BaseException:
    for feature in reversed(features):
        error = feature.on_error(error, request, ctx)
    return error


def run_request(
    features: Sequence[Feature], request: PreparedRequest, ctx: FeatureContext
) -> None:
    for feature in features:
        feature.on_request(request, ctx)


def run_result(
    features: Sequence[Feature],
    result: Result,
    request: PreparedRequest,
    ctx: FeatureContext,
) -> Result:
    for feature in reversed(features):
        result = feature.on_result(result, request, ctx)
    return result


def _sent_through(feature: Feature, send: Send, ctx: FeatureContext) -> Send:
    def wrapped(request: PreparedRequest) -> Result:
        return feature.on_send(request, send, ctx)

    return wrapped


def wrap_send(features: Sequence[Feature], send: Send, ctx: FeatureContext) -> Send:
    for feature in reversed(features):
        send = _sent_through(feature, send, ctx)
    return send


async def run_async_error(
    features: Sequence[Feature],
    error: BaseException,
    request: PreparedRequest,
    ctx: FeatureContext,
) -> BaseException:
    for feature in reversed(features):
        error = await feature.on_async_error(error, request, ctx)
    return error


async def run_async_request(
    features: Sequence[Feature], request: PreparedRequest, ctx: FeatureContext
) -> None:
    for feature in features:
        await feature.on_async_request(request, ctx)


async def run_async_result(
    features: Sequence[Feature],
    result: Result,
    request: PreparedRequest,
    ctx: FeatureContext,
) -> Result:
    for feature in reversed(features):
        result = await feature.on_async_result(result, request, ctx)
    return result


def _async_sent_through(
    feature: Feature, send: AsyncSend, ctx: FeatureContext
) -> AsyncSend:
    async def wrapped(request: PreparedRequest) -> Result:
        return await feature.on_async_send(request, send, ctx)

    return wrapped


def wrap_async_send(
    features: Sequence[Feature], send: AsyncSend, ctx: FeatureContext
) -> AsyncSend:
    for feature in reversed(features):
        send = _async_sent_through(feature, send, ctx)
    return send


async def run_async_prepare(
    features: Sequence[Feature], request: PreparedRequest, ctx: FeatureContext
) -> None:
    for feature in features:
        await feature.on_async_prepare(request, ctx)
