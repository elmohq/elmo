from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Callable

from .address import ResolveAddress
from .errors import to_api_error, unreadable_body
from ...core.config import base_url_of
from ...core.errors import ElmoError
from ...core.types import (
    Credential,
    OperationDescriptor,
    PreparedRequest,
    RawResponse,
    Result,
)


def place_in_header(credential: Credential, request: PreparedRequest) -> None:
    request.meta[credential.name.lower()] = credential.value


Placer = Callable[[Credential, PreparedRequest], None]


PLACERS: dict[str, Placer] = {"header": place_in_header}


def parser_for(content_type: str) -> str:
    if not content_type:
        return "text"
    if (
        content_type.startswith("application/json")
        or content_type.split(";")[0].endswith("+json")
    ):
        return "json"
    if content_type.startswith("text/"):
        return "text"
    return "bytes"


@dataclass
class RestBinding:
    resolve: ResolveAddress
    name: str = "rest"

    def apply_auth(self, credential: Credential, request: PreparedRequest) -> None:
        place = PLACERS.get(credential.location)
        if place is None:
            where = credential.location
            address = request.operation.address
            raise ElmoError(
                f'This client places no credential in the {where}, so "{address}" cannot be authenticated.',
            )
        place(credential, request)

    def read_error(
        self, result: Result, request: PreparedRequest
    ) -> BaseException | None:
        response = result.response
        if (
            response is None
            or 200 <= response.status_code < 300
            and result.error is None
        ):
            return None
        return to_api_error(response.status_code, result.error, response)

    def read_result(self, raw: RawResponse, request: PreparedRequest) -> Result:
        ok = 200 <= raw.status_code < 300
        if raw.status_code in (204, 205):
            return Result(response=raw) if ok else Result(error=None, response=raw)
        parser = parser_for(raw.headers.get("content-type", ""))
        if parser == "bytes":
            value: Any = raw.content
        else:
            text = raw.content.decode("utf-8")
            if text == "":
                value = None
            elif parser == "json":
                try:
                    value = json.loads(text)
                except ValueError as cause:
                    raise unreadable_body(raw, cause) from cause
            else:
                value = text
        return (
            Result(data=value, response=raw)
            if ok
            else Result(error=value, response=raw)
        )

    def resolve_address(
        self, operation: OperationDescriptor, options: dict[str, Any]
    ) -> str:
        return self.resolve(
            base_url=base_url_of(options, operation.base_url),
            path=options.get("path"),
            query=options.get("query"),
            serialization=operation.serialization,
            url=operation.address,
        )


def create_rest_binding(resolve_address: ResolveAddress) -> RestBinding:
    return RestBinding(resolve=resolve_address)
