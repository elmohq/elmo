from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ._internal.binding.rest.errors import (
        AuthenticationError,
        BadRequestError,
        ConflictError,
        InternalServerError,
        NotFoundError,
        PaymentRequiredError,
        PermissionDeniedError,
        RateLimitError,
        UnprocessableEntityError,
    )
    from ._internal.core.errors import (
        ApiError,
        DecodeError,
        ElmoError,
        MissingCredentialError,
        TransportError,
        TransportTimeoutError,
        UnsupportedInteractionError,
        UnsupportedProtocolError,
    )
    from ._internal.core.missing import MISSING, Missing
    from ._internal.core.response import Response
    from ._internal.core.types import (
        AsyncAuthResolver,
        AsyncAuthValue,
        AsyncCredentialValue,
        AuthResolver,
        AuthScheme,
        AuthValue,
        CallTimeout,
        CredentialValue,
        TimeoutPolicy,
        TimeoutValue,
    )
    from ._internal.features.logger import LogLevel
    from ._internal.page.page import AsyncPage, Page
    from ._internal.transport.httpx import AsyncHttpxLike, HttpxLike
    from .client import AsyncElmo, Elmo, __version__
    from .resources.shared import AsyncRequestOptions, RequestOptions

__all__ = [
    "ApiError",
    "AsyncAuthResolver",
    "AsyncAuthValue",
    "AsyncCredentialValue",
    "AsyncElmo",
    "AsyncHttpxLike",
    "AsyncPage",
    "AsyncRequestOptions",
    "AuthResolver",
    "AuthScheme",
    "AuthValue",
    "AuthenticationError",
    "BadRequestError",
    "CallTimeout",
    "ConflictError",
    "CredentialValue",
    "DecodeError",
    "Elmo",
    "ElmoError",
    "HttpxLike",
    "InternalServerError",
    "LogLevel",
    "MISSING",
    "Missing",
    "MissingCredentialError",
    "NotFoundError",
    "Page",
    "PaymentRequiredError",
    "PermissionDeniedError",
    "RateLimitError",
    "RequestOptions",
    "Response",
    "TimeoutPolicy",
    "TimeoutValue",
    "TransportError",
    "TransportTimeoutError",
    "UnprocessableEntityError",
    "UnsupportedInteractionError",
    "UnsupportedProtocolError",
    "__version__",
]


_LAZY_EXPORTS = {
    "ApiError": ("._internal.core.errors", "ApiError"),
    "AsyncAuthResolver": ("._internal.core.types", "AsyncAuthResolver"),
    "AsyncAuthValue": ("._internal.core.types", "AsyncAuthValue"),
    "AsyncCredentialValue": ("._internal.core.types", "AsyncCredentialValue"),
    "AsyncElmo": (".client", "AsyncElmo"),
    "AsyncHttpxLike": ("._internal.transport.httpx", "AsyncHttpxLike"),
    "AsyncPage": ("._internal.page.page", "AsyncPage"),
    "AsyncRequestOptions": (".resources.shared", "AsyncRequestOptions"),
    "AuthResolver": ("._internal.core.types", "AuthResolver"),
    "AuthScheme": ("._internal.core.types", "AuthScheme"),
    "AuthValue": ("._internal.core.types", "AuthValue"),
    "AuthenticationError": ("._internal.binding.rest.errors", "AuthenticationError"),
    "BadRequestError": ("._internal.binding.rest.errors", "BadRequestError"),
    "CallTimeout": ("._internal.core.types", "CallTimeout"),
    "ConflictError": ("._internal.binding.rest.errors", "ConflictError"),
    "CredentialValue": ("._internal.core.types", "CredentialValue"),
    "DecodeError": ("._internal.core.errors", "DecodeError"),
    "Elmo": (".client", "Elmo"),
    "ElmoError": ("._internal.core.errors", "ElmoError"),
    "HttpxLike": ("._internal.transport.httpx", "HttpxLike"),
    "InternalServerError": ("._internal.binding.rest.errors", "InternalServerError"),
    "LogLevel": ("._internal.features.logger", "LogLevel"),
    "MISSING": ("._internal.core.missing", "MISSING"),
    "Missing": ("._internal.core.missing", "Missing"),
    "MissingCredentialError": ("._internal.core.errors", "MissingCredentialError"),
    "NotFoundError": ("._internal.binding.rest.errors", "NotFoundError"),
    "Page": ("._internal.page.page", "Page"),
    "PaymentRequiredError": ("._internal.binding.rest.errors", "PaymentRequiredError"),
    "PermissionDeniedError": (
        "._internal.binding.rest.errors",
        "PermissionDeniedError",
    ),
    "RateLimitError": ("._internal.binding.rest.errors", "RateLimitError"),
    "RequestOptions": (".resources.shared", "RequestOptions"),
    "Response": ("._internal.core.response", "Response"),
    "TimeoutPolicy": ("._internal.core.types", "TimeoutPolicy"),
    "TimeoutValue": ("._internal.core.types", "TimeoutValue"),
    "TransportError": ("._internal.core.errors", "TransportError"),
    "TransportTimeoutError": ("._internal.core.errors", "TransportTimeoutError"),
    "UnprocessableEntityError": (
        "._internal.binding.rest.errors",
        "UnprocessableEntityError",
    ),
    "UnsupportedInteractionError": (
        "._internal.core.errors",
        "UnsupportedInteractionError",
    ),
    "UnsupportedProtocolError": ("._internal.core.errors", "UnsupportedProtocolError"),
    "__version__": (".client", "__version__"),
}


if not TYPE_CHECKING:

    def __getattr__(name: str) -> object:
        if name not in _LAZY_EXPORTS:
            raise AttributeError(f"module {__name__} has no attribute {name}")
        module, attribute = _LAZY_EXPORTS[name]
        value = getattr(import_module(module, __name__), attribute)
        globals()[name] = value
        return value


def __dir__() -> list[str]:
    return list(__all__)
