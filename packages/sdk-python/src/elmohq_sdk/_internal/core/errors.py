from __future__ import annotations

import json
import time
from typing import (
    Any,
    Callable,
    ClassVar,
    Generic,
    Iterable,
    Mapping,
    Sequence,
    TYPE_CHECKING,
    cast,
)

from typing_extensions import TypeGuard, TypeVar

from .backoff import retry_after_delay
from .text import to_text
from .types import Interaction, PreparedRequest, RawResponse

if TYPE_CHECKING:
    from ...types.shared import Error


def read_error(body: Any) -> Error:
    from ...types.shared import Error
    return Error.model_validate(body)


BODY_READERS: Sequence[Callable[[Any], Any]] = (read_error,)


FailureBody = Mapping[str, Any] | list[Any]


class ElmoError(Exception):
    """The base of every error this SDK raises, including one from a call that never arrived."""


TBody = TypeVar("TBody", covariant=True, default="Error")


CODE_KEYS: list[str] = ["code", "error_code", "errorCode"]


def _is_mapping(value: Any) -> TypeGuard[Mapping[str, Any]]:
    return isinstance(value, Mapping)


def _stated(bag: Mapping[str, Any], keys: list[str]) -> str | int | None:
    for key in keys:
        value = bag.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if key in CODE_KEYS and isinstance(value, int) and not isinstance(value, bool):
            return value
    return None


def describe_code(body: Any) -> str | int | None:
    if not _is_mapping(body):
        return None
    direct = _stated(body, CODE_KEYS)
    if direct is not None:
        return direct
    for value in body.values():
        if _is_mapping(value):
            nested = _stated(value, CODE_KEYS)
            if nested is not None:
                return nested
    return None


MESSAGE_KEYS: list[str] = [
    "message",
    "error_message",
    "errorMessage",
    "error",
    "detail",
    "title",
    "description",
]


MAX_MESSAGE_BODY = 200


def _shorten(text: str) -> str:
    line = " ".join(text.split())
    if len(line) <= MAX_MESSAGE_BODY:
        return line
    cut = line[:MAX_MESSAGE_BODY]
    space = cut.rfind(" ")
    kept = cut[:space] if space > MAX_MESSAGE_BODY // 2 else cut
    return f"{kept.rstrip()}…"


def describe_failure(body: Any) -> str | None:
    if isinstance(body, str):
        return _shorten(body.strip()) or None
    if _is_mapping(body):
        direct = _stated(body, MESSAGE_KEYS)
        if direct:
            return _shorten(str(direct))
        values: Iterable[Any] = body.values()
    elif isinstance(body, list):
        values = cast(Iterable[Any], body)
    else:
        return None
    for value in values:
        if _is_mapping(value):
            nested = _stated(value, MESSAGE_KEYS)
            if nested:
                return _shorten(str(nested))
    try:
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return None
    return _shorten(encoded) if encoded not in ("{}", "[]") else None


def read_data(readers: Sequence[Callable[[Any], Any]], body: Any) -> Any:
    if not isinstance(body, (Mapping, list)):
        return None
    for read in readers:
        try:
            return read(body)
        except Exception:
            continue
    return None


REQUEST_ID_HEADERS: list[str] = [
    "x-request-id",
    "request-id",
    "x-correlation-id",
    "x-amzn-requestid",
    "cf-ray",
]


def request_id_of(response: Any) -> str | None:
    meta: Mapping[str, str] = getattr(response, "headers", None) or {}
    for header in REQUEST_ID_HEADERS:
        value: str | None = meta.get(header)
        if value:
            return value
    return None


class ApiError(ElmoError, Generic[TBody]):
    """A failure the API answered with, so there is a status and a reply to read."""

    _readers: ClassVar[Sequence[Callable[[Any], Any]]] = BODY_READERS

    def __init__(
        self,
        status: int,
        body: Any = None,
        response: RawResponse | None = None,
        note: str | None = None,
    ) -> None:
        reason = getattr(response, "reason_phrase", "") or ""
        stated = f"{status} {reason}" if reason else f"{status}"
        url = getattr(response, "url", "") or ""
        where = f' for "{url}"' if url else ""
        said = describe_failure(body)
        structured = isinstance(body, (Mapping, list))
        if note:
            tail = f". {note}" + (f" The API said: {said}" if said else "")
        else:
            tail = f": {said}" if said else "."
        super().__init__(f"The API answered {stated}{where}{tail}")

        self.code: str | int | None = describe_code(body)
        """The API's own error code, read from the failure body. `None` where it carried none."""
        self.error: FailureBody | None = body if structured else None
        """The decoded failure body. `None` where the reply carried none, or carried
        text such as a proxy's page, which is in the message instead.
        """
        self.data: TBody | None = read_data(self._readers, body)
        """The failure body, read as the model the API description gives it. `None`
        where it gives none, or where the body does not match, which `error` still holds.
        """
        self.headers: dict[str, str] = dict(getattr(response, "headers", None) or {})
        """The reply's headers, so a caller can read one the SDK does not lift."""
        self.request_id: str | None = request_id_of(response)
        """The request id to quote when reporting this failure."""
        self.response = response
        """The reply that carried this failure. Its body is already read."""
        self.retry_after: float | None = retry_after_delay(response, now=time.time())
        """Seconds the API asked to wait before trying again."""
        self.status = status


class DecodeError(ElmoError):
    """A reply from the API that this SDK could not read, whatever its status."""

    def __init__(
        self,
        message: str,
        at: str | None = None,
        response: RawResponse | None = None,
        value: Any = None,
    ) -> None:
        super().__init__(message)
        self.at: str | None = at
        """Where the value sat, or `None` where the whole reply failed."""
        self.response = response
        """The reply. Its body is already read."""
        self.status: int | None = getattr(response, "status_code", None)
        self.value: Any = value
        """What the API sent. The message holds only a short form of it."""


def empty_path_parameter(name: str, url: str) -> ElmoError:
    return ElmoError(
        f"Path parameter `{name}` is empty. `{url}` cannot be sent without it."
    )


class UnsupportedProtocolError(ElmoError):
    def __init__(self, protocol: str, interaction: Interaction) -> None:
        super().__init__(
            f'This client does not speak "{protocol}", so it cannot answer a "{interaction}" call.',
        )
        self.interaction = interaction
        self.protocol = protocol


class UnsupportedInteractionError(ElmoError):
    def __init__(
        self, transport: str, interaction: Interaction, method: str | None = None
    ) -> None:
        super().__init__(
            f'Transport "{transport}" cannot send this call. It has no "{method or interaction}" method.',
        )
        self.interaction = interaction
        self.transport = transport


TRANSPORT_MESSAGES: dict[str, str] = {
    "connect": "The request never reached the API.",
    "other": "The request failed before the API answered.",
    "timeout": "The API did not answer in time.",
}


class TransportError(ElmoError):
    """Raised when no answer arrived, so there is no status to go on."""

    def __init__(self, message: str, kind: str = "other") -> None:
        super().__init__(message)
        self.kind: str = kind
        """Which way it failed: `connect`, `timeout`, or `other`."""


class TransportTimeoutError(TransportError):
    """Raised when the API sent nothing for as long as the call allowed, before
    the reply arrived or between two pieces of its body.

    Not the builtin `TimeoutError`, so `except TimeoutError` does not catch it.

    """

    def __init__(self, timeout: float | None = None, target: str | None = None) -> None:
        message = TRANSPORT_MESSAGES["timeout"]
        if timeout is not None:
            message = f"{target or 'The request'} timed out: the API sent nothing for {timeout:g} s. Pass a larger `timeout` with the call, or `timeout=False` to wait as long as it takes."
        super().__init__(message, kind="timeout")
        self.timeout: float | None = timeout
        """Seconds the API was allowed to send nothing."""


def _target(request: PreparedRequest) -> str:
    method = (request.operation.method or "").upper()
    address = f'"{str(request.address).split("?")[0]}"'
    return f"{method} {address}" if method else address


def _timeout_error(request: PreparedRequest | None) -> TransportTimeoutError:
    limit = request.options.get("timeout") if request is not None else None
    if request is None or isinstance(limit, bool):
        return TransportTimeoutError()
    if not isinstance(limit, (int, float)) or limit <= 0:
        return TransportTimeoutError()
    return TransportTimeoutError(float(limit), _target(request))


def to_transport_error(
    error: BaseException, request: PreparedRequest | None = None
) -> BaseException:
    if isinstance(error, ElmoError):
        return error
    names = {base.__name__ for base in type(error).__mro__}
    if "ConnectTimeout" in names or "PoolTimeout" in names:
        return TransportError(TRANSPORT_MESSAGES["connect"], kind="connect")
    if "TimeoutException" in names or "Timeout" in names:
        return _timeout_error(request)
    if "ConnectError" in names or "ConnectionError" in names:
        return TransportError(TRANSPORT_MESSAGES["connect"], kind="connect")
    if "TransportError" in names or "HTTPError" in names or "RequestError" in names:
        return TransportError(TRANSPORT_MESSAGES["other"])
    return error


class MissingCredentialError(ElmoError):
    """Raised before the request goes out, when no credential satisfied the call."""

    def __init__(self, message: str, schemes: list[str] | None = None) -> None:
        super().__init__(message)
        self.schemes: list[str] = list(schemes or [])
        """Credential options that would have satisfied the call."""


def unreadable_value(
    at: str | None,
    value: Any = None,
    response: RawResponse | None = None,
    missing: bool = False,
) -> DecodeError:
    if missing:
        said = "nothing"
    elif isinstance(value, str):
        said = f'"{_shorten(value)}"'
    else:
        said = _shorten(to_text(value))
    where = "the reply" if at is None else f"`{at}` from the reply"
    return DecodeError(
        f"Could not read {where}: the API sent {said}.",
        at=at,
        response=response,
        value=value,
    )
