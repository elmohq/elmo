from __future__ import annotations

from dataclasses import dataclass
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Iterator,
    Literal,
    Mapping,
    Protocol,
    Sequence,
    TypedDict,
)

from .backoff import RetryAfterHeader


BodyPayload = bytes | None


@dataclass
class EncodedBody:
    payload: BodyPayload
    content_type: str | None = None


Metadata = dict[str, str]


@dataclass
class Result:
    data: Any = None
    error: Any = None
    response: Any = None


class CallLog(Protocol):
    """The log of one call, which the logger sets on a request as it is prepared.

    What lets the parts of a call the logger does not wrap write to it: a retry
    about to wait, a stream opened outside the send phase, a stream that ended.

    """

    def ended(self, error: BaseException | None = None) -> None:
        """A stream this call opened stopped, with the error it stopped on."""

    def failed(self, error: BaseException) -> None:
        """The call failed for good."""

    def replied(self, response: Any) -> None:
        """A reply arrived, with its body unread."""

    def retrying(
        self, wait: float, retry: int, retries: int, after: Result | None = None
    ) -> None:
        """The call is about to be sent again in `wait` seconds, after the reply
        or the error in `after`. A stream that ended passes neither.

        """

    def sending(self) -> None:
        """The request is about to go out."""


Interaction = str


@dataclass
class AuthScheme:
    type: str
    location: str = "header"
    name: str = "Authorization"
    """The header, query parameter or cookie the credential is sent in."""
    key: str | None = None
    """Which credential this is. Its option, where it has one, has the same name."""
    scheme: str | None = None


AuthRequirement = AuthScheme | Sequence[AuthScheme]


CallTimeout = float | Literal[False]


@dataclass
class PaginationDescriptor:
    style: str
    cursor: str | None = None
    location: str = "query"
    items: str | None = None
    limit_param: str | None = None
    link: str | None = None
    more: str | None = None
    param: str | None = None
    pages: str | None = None
    size: str | None = None
    start: int | None = None
    total: str | None = None


class RetryRules(TypedDict, total=False):
    """How a failed call is sent again. Anything left out keeps the client's rule."""

    attempts: int
    """How many attempts in all, counting the first. Three by default."""
    delay: float
    """The first wait, in seconds, doubled for each attempt after it. Half a
    second by default.

    """
    jitter: bool
    """Spread each wait over `[0, computed]`. On by default."""
    max_delay: float
    """The longest computed wait, in seconds. Thirty by default."""
    max_retry_after: float
    """The longest wait the API may ask for, in seconds. Past it, the call gives
    up and hands back the reply as it is. Sixty by default.

    """
    methods: Sequence[str]
    """Methods that may be sent again. A request that never reached the API, a
    call carrying its API's idempotency key, and 408, 425 and 429 are sent again
    whatever this says. The idempotent methods by default.

    """
    retry_after: Sequence[RetryAfterHeader] | bool
    """Headers the API may name its own wait in, read before the backoff
    applies. `False` reads none.

    """
    retry_on_timeout: bool
    """Send the request again when an attempt runs past its deadline. Off by default."""
    statuses: Sequence[int]
    """Statuses worth another attempt, replacing the default rule rather than
    adding to it. A reply with `x-should-retry: false` is never retried.

    """
    strategy: Literal["constant", "exponential"]
    """Whether each wait doubles, or stays at `delay`. `"exponential"` by default."""


class StyleSpec(TypedDict, total=False):
    """The style a shape travels under, and whether it expands."""

    explode: bool
    style: str


class ParameterSerialization(TypedDict, total=False):
    """How one parameter is written, where the document diverges from the defaults."""

    allow_reserved: bool
    array: StyleSpec
    media_type: str
    object: StyleSpec


class SerializationDescriptor(TypedDict, total=False):
    """What an operation states about writing its parameters onto the wire."""

    query: dict[str, ParameterSerialization]


@dataclass
class OperationDescriptor:
    address: str
    interaction: Interaction
    auth: Sequence[AuthRequirement] | None = None
    auth_optional: bool = False
    base_url: str | None = None
    deprecated: bool = False
    """The API marks this operation deprecated. Set only where a logger reads it."""
    idempotency: str | None = None
    media_type: str | None = None
    method: str | None = None
    pagination: PaginationDescriptor | None = None
    retry: RetryRules | Literal[False] | None = None
    serialization: SerializationDescriptor | None = None
    timeout: CallTimeout | None = None


@dataclass
class Credential:
    location: str
    name: str
    value: str


@dataclass
class PlacedCredential:
    """One credential a request carries, and the scheme it answers for."""

    credential: Credential
    scheme: "AuthScheme"


@dataclass
class PreparedRequest:
    address: Any
    interaction: Interaction
    meta: Metadata
    operation: OperationDescriptor
    options: dict[str, Any]
    body: BodyPayload = None
    log: CallLog | None = None
    """Where this call's log lines go. Unset while logging is off."""
    placed: Sequence[PlacedCredential] | None = None
    """The credentials this request carries, set when they go on.

    What lets a credential be asked for again and replaced, since a value that
    was sent is the only way to tell an answer that changed from one that did
    not.

    """
    signal: Any = None


AsyncSend = Callable[[PreparedRequest], Awaitable[Result]]


class RawResponse(Protocol):
    @property
    def content(self) -> bytes: ...

    @property
    def headers(self) -> Mapping[str, str]: ...

    @property
    def status_code(self) -> int: ...

    def json(self) -> Any: ...


class Binding(Protocol):
    name: str

    def apply_auth(self, credential: Credential, request: PreparedRequest) -> None: ...

    def read_error(
        self, result: Result, request: PreparedRequest
    ) -> BaseException | None: ...

    def resolve_address(
        self, operation: OperationDescriptor, options: dict[str, Any]
    ) -> Any: ...

    def read_result(self, raw: RawResponse, request: PreparedRequest) -> Result: ...


@dataclass
class FeatureContext:
    binding: Binding
    transport: Any


Send = Callable[[PreparedRequest], Result]


class Codec(Protocol):
    media_types: list[str]
    name: str

    def encode(self, value: Any) -> EncodedBody: ...


@dataclass
class CredentialSpec:
    """What this client knows about one credential, under the name a caller passes it by."""

    environments: Sequence[str] = ()
    """Environments this credential is accepted at, by the names this client gives them."""
    option: bool = True
    """`False` where another option holds this credential's name, so only `auth` sets it."""
    prefix: str | None = None
    """Written in front of the credential, so a caller holds only the secret."""
    variable: str | None = None
    """Environment variable this credential is read from where a caller passes none."""


class StreamResponse(Protocol):
    @property
    def headers(self) -> Mapping[str, str]: ...

    @property
    def status_code(self) -> int: ...

    def close(self) -> None: ...

    def iter_bytes(self) -> Iterator[bytes]: ...

    def read(self) -> bytes: ...


class AsyncStreamResponse(Protocol):
    @property
    def headers(self) -> Mapping[str, str]: ...

    @property
    def status_code(self) -> int: ...

    async def aclose(self) -> None: ...

    def aiter_bytes(self) -> AsyncIterator[bytes]: ...

    async def aread(self) -> bytes: ...


AuthToken = str | None


CredentialValue = str | Callable[[], AuthToken]
"""A credential, or a function that returns one when a call needs it."""


AuthResolver = Callable[[AuthScheme, AuthToken], AuthToken]
"""Returns the credential to send for `scheme`, given the value its option
holds. `None` sends none for that scheme.

"""


AuthValue = AuthResolver | Literal[False]


RetryValue = RetryRules | bool
"""How a failed call is retried: the rules, `True` for the client's own, or
`False` to send it once.

"""


TimeoutPolicy = Callable[[str, CallTimeout | None], CallTimeout | None]
"""Chooses the deadline of one call. It is handed the operation, as
`METHOD /path`, and the operation's own limit, or the client's default
where it states none. Return the limit to use, or `None` to keep that one.

"""


TimeoutValue = CallTimeout | TimeoutPolicy
"""A limit in seconds, `False` for none, or a policy choosing one per call."""


AsyncCredentialValue = str | Callable[[], AuthToken | Awaitable[AuthToken]]


AsyncAuthResolver = Callable[[AuthScheme, AuthToken], AuthToken | Awaitable[AuthToken]]
"""Returns the credential to send for `scheme`, given the value its option
holds. `None` sends none for that scheme.

"""


AsyncAuthValue = AsyncAuthResolver | Literal[False]
