from __future__ import annotations

from functools import cached_property
from logging import Logger
from typing import Any, TYPE_CHECKING

import httpx2

from ._internal.binding.rest.address_simple import simple_address
from ._internal.binding.rest.binding import create_rest_binding
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
from ._internal.codec.json import json_codec
from ._internal.core.client import (
    AsyncClient,
    Client,
    create_async_client,
    create_client,
)
from ._internal.core.config import create_config
from ._internal.core.dispatch import (
    DispatchSetup,
    configure,
    own_transport,
    with_transport,
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
from ._internal.core.types import CredentialSpec
from ._internal.features.auth import AuthFeature
from ._internal.features.interceptors import InterceptorsFeature
from ._internal.features.logger import LoggerFeature
from ._internal.features.retry import RetryFeature
from ._internal.transport.httpx import (
    AsyncHttpxTransport,
    HttpxTransport,
    create_async_httpx_transport,
    create_httpx_transport,
)

if TYPE_CHECKING:
    from ._internal.core.types import (
        AsyncAuthValue,
        AsyncCredentialValue,
        AuthValue,
        CredentialValue,
        RetryValue,
        TimeoutValue,
    )
    from ._internal.features.interceptors import Interceptors
    from ._internal.features.logger import LogLevel
    from ._internal.transport.httpx import AsyncHttpxLike, HttpxLike
    from .resources.brands import (
        AsyncBrands,
        AsyncBrandsWithResponse,
        Brands,
        BrandsWithResponse,
    )
    from .resources.competitors import (
        AsyncCompetitors,
        AsyncCompetitorsWithResponse,
        Competitors,
        CompetitorsWithResponse,
    )
    from .resources.identity import AsyncMe, AsyncMeWithResponse, Me, MeWithResponse
    from .resources.models import (
        AsyncModels,
        AsyncModelsWithResponse,
        Models,
        ModelsWithResponse,
    )
    from .resources.organizations import (
        AsyncOrganizations,
        AsyncOrganizationsWithResponse,
        Organizations,
        OrganizationsWithResponse,
    )
    from .resources.prompts import (
        AsyncPrompts,
        AsyncPromptsWithResponse,
        Prompts,
        PromptsWithResponse,
    )
    from .resources.reports import (
        AsyncReports,
        AsyncReportsWithResponse,
        Reports,
        ReportsWithResponse,
    )
    from .resources.tools import (
        AsyncTools,
        AsyncToolsWithResponse,
        Tools,
        ToolsWithResponse,
    )


DECLARED_CREDENTIALS = {"api_key": CredentialSpec(variable="ELMO_API_KEY")}


transport: HttpxTransport = create_httpx_transport(factory=httpx2.Client)


client: Client = create_client(
    DispatchSetup(
        codecs=[json_codec],
        credentials=DECLARED_CREDENTIALS,
        defaults=create_config(
            base_url="/api/v1",
            timeout=60,
            headers={"user-agent": "elmo-sdk/0.1.0 (python)"},
        ),
        env={"base_url": "ELMO_BASE_URL", "log_level": "ELMO_LOG"},
        features=[
            AuthFeature(DECLARED_CREDENTIALS),
            RetryFeature(),
            LoggerFeature(),
            InterceptorsFeature(),
        ],
        protocols={
            "rest": {
                "binding": create_rest_binding(simple_address),
                "transport": transport,
            },
        },
    ),
)


async_transport: AsyncHttpxTransport = create_async_httpx_transport(
    factory=httpx2.AsyncClient
)


async_client: AsyncClient = create_async_client(
    DispatchSetup(
        codecs=[json_codec],
        credentials=DECLARED_CREDENTIALS,
        defaults=create_config(
            base_url="/api/v1",
            timeout=60,
            headers={"user-agent": "elmo-sdk/0.1.0 (python)"},
        ),
        env={"base_url": "ELMO_BASE_URL", "log_level": "ELMO_LOG"},
        features=[
            AuthFeature(DECLARED_CREDENTIALS),
            RetryFeature(),
            LoggerFeature(),
            InterceptorsFeature(),
        ],
        protocols={
            "rest": {
                "binding": create_rest_binding(simple_address),
                "transport": async_transport,
            },
        },
    ),
)


__version__ = "0.1.0"


class Elmo:
    """The Elmo API, as one object to call through.

    Pass `api_key`, or set `ELMO_API_KEY` and pass nothing.

    Options given here apply to every call it makes.

    Example:
        ```python
        elmo = Elmo()
        elmo.brands.list()
        ```
    """

    ApiError = ApiError
    AuthenticationError = AuthenticationError
    BadRequestError = BadRequestError
    ConflictError = ConflictError
    DecodeError = DecodeError
    ElmoError = ElmoError
    InternalServerError = InternalServerError
    MissingCredentialError = MissingCredentialError
    NotFoundError = NotFoundError
    PaymentRequiredError = PaymentRequiredError
    PermissionDeniedError = PermissionDeniedError
    RateLimitError = RateLimitError
    TransportError = TransportError
    TransportTimeoutError = TransportTimeoutError
    UnprocessableEntityError = UnprocessableEntityError
    UnsupportedInteractionError = UnsupportedInteractionError
    UnsupportedProtocolError = UnsupportedProtocolError

    def __init__(
        self,
        *,
        api_key: CredentialValue | None = None,
        auth: AuthValue | None = None,
        base_url: str | None = None,
        client: Client = client,
        default_headers: dict[str, str] | None = None,
        default_path: dict[str, Any] | None = None,
        default_query: dict[str, Any] | None = None,
        http_client: HttpxLike | None = None,
        interceptors: Interceptors | None = None,
        log_level: LogLevel | None = None,
        logger: Logger | None = None,
        max_retries: int | None = None,
        retry: RetryValue | None = None,
        timeout: TimeoutValue | None = None,
    ) -> None:
        """The Elmo API, as one object to call through.

        Pass `api_key`, or set `ELMO_API_KEY` and pass nothing.

        Options given here apply to every call it makes.

        Example:
            ```python
            elmo = Elmo()
            elmo.brands.list()
            ```

        Args:
            api_key: An instance admin key from `ADMIN_API_KEYS`, or an organization key (`elmo_…`) issued from the dashboard. Read from the `ELMO_API_KEY` environment variable when unset.
            auth: Decides each credential a call sends, given the scheme and the value its option holds. What it returns is sent, so return the value to keep it. `False` sends no credential.
            base_url: Override the base URL calls are sent to. Read from the `ELMO_BASE_URL` environment variable when unset.
            client: A client to dispatch through, in place of one built from options. For sharing one configured client across several SDKs, or for one built by hand.
            default_headers: Headers to send with every call. Merged per name with whatever a call sets, and `None` drops one.
            default_path: Path parameters every call starts from. Merged per name with whatever a call sets.
            default_query: Query parameters to add to every call. Merged per name with whatever a call sets, and `None` drops one.
            http_client: An `httpx2.Client` to send requests with, in place of the one this SDK opens. Set proxies, TLS and connection limits on it. Closing this SDK leaves it open, since whoever opened it owns it.
            interceptors: Run your own hooks around every call. Each is a sequence of callables, which the awaited client also waits for. `request` reads the request after the credentials are on it and before it is sent. `response` and `error` each return what the caller reads, so a hook that only observes returns what it was given.
            log_level: Set the log level. Raise it to see what each call sent and what came back. `'debug'` adds headers, with credentials hidden. Read from the `ELMO_LOG` environment variable when unset. Defaults to `'off'`.
            logger: Set the logger. This SDK's own `logging.Logger` by default, which writes to standard error unless the application has given it a handler of its own.
            max_retries: The maximum number of times a failed call is sent again. A shorthand for `retry: { attempts: max_retries + 1 }`. It counts attempts and nothing else: a call that may already have been acted on is sent again only after 408, 425 or 429, or where it carries its API's idempotency key. `retry.methods` widens that. Defaults to `2`.
            retry: How a failed call is retried, or `False` to send it once. A call whose body is a stream is always sent once. Defaults to `{ attempts: 3 }`.
            timeout: The maximum time one attempt may run. Set `False` or `0` for no limit, or a function that takes the operation as `METHOD /path` and returns its limit. Defaults to `60`. The unit is seconds.
        """

        self._transport = own_transport(transport, http_client, client.setup)
        self.client: Client = Client(
            setup=configure(
                with_transport(client.setup, self._transport),
                {
                    "api_key": api_key,
                    "auth": auth,
                    "base_url": base_url,
                    "headers": default_headers,
                    "path": default_path,
                    "query": default_query,
                    "interceptors": interceptors,
                    "log_level": log_level,
                    "logger": logger,
                    "max_retries": max_retries,
                    "retry": retry,
                    "timeout": timeout,
                },
            ),
        )

    def with_options(
        self,
        *,
        api_key: CredentialValue | None = None,
        auth: AuthValue | None = None,
        base_url: str | None = None,
        default_headers: dict[str, str] | None = None,
        default_path: dict[str, Any] | None = None,
        default_query: dict[str, Any] | None = None,
        interceptors: Interceptors | None = None,
        log_level: LogLevel | None = None,
        logger: Logger | None = None,
        max_retries: int | None = None,
        retry: RetryValue | None = None,
        timeout: TimeoutValue | None = None,
    ) -> Elmo:
        """The same calls, with different options.

        Options given here layer over the ones already in force. Headers merge
        per name, and everything else replaces. What this was called on does
        not change, and the two send over one connection pool.

        Args:
            api_key: An instance admin key from `ADMIN_API_KEYS`, or an organization key (`elmo_…`) issued from the dashboard. Read from the `ELMO_API_KEY` environment variable when unset.
            auth: Decides each credential a call sends, given the scheme and the value its option holds. What it returns is sent, so return the value to keep it. `False` sends no credential.
            base_url: Override the base URL calls are sent to. Read from the `ELMO_BASE_URL` environment variable when unset.
            default_headers: Headers to send with every call. Merged per name with whatever a call sets, and `None` drops one.
            default_path: Path parameters every call starts from. Merged per name with whatever a call sets.
            default_query: Query parameters to add to every call. Merged per name with whatever a call sets, and `None` drops one.
            interceptors: Run your own hooks around every call. Each is a sequence of callables, which the awaited client also waits for. `request` reads the request after the credentials are on it and before it is sent. `response` and `error` each return what the caller reads, so a hook that only observes returns what it was given.
            log_level: Set the log level. Raise it to see what each call sent and what came back. `'debug'` adds headers, with credentials hidden. Read from the `ELMO_LOG` environment variable when unset. Defaults to `'off'`.
            logger: Set the logger. This SDK's own `logging.Logger` by default, which writes to standard error unless the application has given it a handler of its own.
            max_retries: The maximum number of times a failed call is sent again. A shorthand for `retry: { attempts: max_retries + 1 }`. It counts attempts and nothing else: a call that may already have been acted on is sent again only after 408, 425 or 429, or where it carries its API's idempotency key. `retry.methods` widens that. Defaults to `2`.
            retry: How a failed call is retried, or `False` to send it once. A call whose body is a stream is always sent once. Defaults to `{ attempts: 3 }`.
            timeout: The maximum time one attempt may run. Set `False` or `0` for no limit, or a function that takes the operation as `METHOD /path` and returns its limit. Defaults to `60`. The unit is seconds.
        """

        derived = object.__new__(type(self))
        derived._transport = self._transport
        derived.client = Client(
            setup=configure(
                self.client.setup,
                {
                    "api_key": api_key,
                    "auth": auth,
                    "base_url": base_url,
                    "headers": default_headers,
                    "path": default_path,
                    "query": default_query,
                    "interceptors": interceptors,
                    "log_level": log_level,
                    "logger": logger,
                    "max_retries": max_retries,
                    "retry": retry,
                    "timeout": timeout,
                },
            ),
        )
        return derived

    def close(self) -> None:
        """Closes the connection pool this SDK opened.

        A client passed as `http_client` is left open, since whoever opened it
        owns it. An SDK derived with `with_options`, or built with this one's
        `client`, sends over this same pool, so closing either closes it for
        both. Calling this twice is harmless.
        """

        self._transport.close()

    def __enter__(self) -> Elmo:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    @cached_property
    def brands(self) -> Brands:
        """Manage brand records"""

        from .resources.brands import Brands
        return Brands(self.client)

    @cached_property
    def competitors(self) -> Competitors:
        """Manage brand competitors"""

        from .resources.competitors import Competitors
        return Competitors(self.client)

    @cached_property
    def me(self) -> Me:
        """What the calling key is and what it may reach"""

        from .resources.identity import Me
        return Me(self.client)

    @cached_property
    def models(self) -> Models:
        """The answer engines this deployment can track"""

        from .resources.models import Models
        return Models(self.client)

    @cached_property
    def organizations(self) -> Organizations:
        """Organizations, their plan limits, and their usage"""

        from .resources.organizations import Organizations
        return Organizations(self.client)

    @cached_property
    def prompts(self) -> Prompts:
        """Manage brand prompts"""

        from .resources.prompts import Prompts
        return Prompts(self.client)

    @cached_property
    def reports(self) -> Reports:
        """Generate and retrieve AI Share of Voice reports"""

        from .resources.reports import Reports
        return Reports(self.client)

    @cached_property
    def tools(self) -> Tools:
        """One-shot helpers (e.g. brand analysis) that don't persist anything"""

        from .resources.tools import Tools
        return Tools(self.client)

    @cached_property
    def with_response(self) -> ElmoWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return ElmoWithResponse(self)


class ElmoWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, elmo: Elmo) -> None:
        self._client = elmo.client

    @cached_property
    def brands(self) -> BrandsWithResponse:
        from .resources.brands import Brands, BrandsWithResponse
        return BrandsWithResponse(Brands(self._client))

    @cached_property
    def competitors(self) -> CompetitorsWithResponse:
        from .resources.competitors import Competitors, CompetitorsWithResponse
        return CompetitorsWithResponse(Competitors(self._client))

    @cached_property
    def me(self) -> MeWithResponse:
        from .resources.identity import Me, MeWithResponse
        return MeWithResponse(Me(self._client))

    @cached_property
    def models(self) -> ModelsWithResponse:
        from .resources.models import Models, ModelsWithResponse
        return ModelsWithResponse(Models(self._client))

    @cached_property
    def organizations(self) -> OrganizationsWithResponse:
        from .resources.organizations import Organizations, OrganizationsWithResponse
        return OrganizationsWithResponse(Organizations(self._client))

    @cached_property
    def prompts(self) -> PromptsWithResponse:
        from .resources.prompts import Prompts, PromptsWithResponse
        return PromptsWithResponse(Prompts(self._client))

    @cached_property
    def reports(self) -> ReportsWithResponse:
        from .resources.reports import Reports, ReportsWithResponse
        return ReportsWithResponse(Reports(self._client))

    @cached_property
    def tools(self) -> ToolsWithResponse:
        from .resources.tools import Tools, ToolsWithResponse
        return ToolsWithResponse(Tools(self._client))


class AsyncElmo:
    """The Elmo API, as one object to call through.

    Pass `api_key`, or set `ELMO_API_KEY` and pass nothing.

    Options given here apply to every call it makes.

    Example:
        ```python
        async_elmo = AsyncElmo()
        await async_elmo.brands.list()
        ```
    """

    ApiError = ApiError
    AuthenticationError = AuthenticationError
    BadRequestError = BadRequestError
    ConflictError = ConflictError
    DecodeError = DecodeError
    ElmoError = ElmoError
    InternalServerError = InternalServerError
    MissingCredentialError = MissingCredentialError
    NotFoundError = NotFoundError
    PaymentRequiredError = PaymentRequiredError
    PermissionDeniedError = PermissionDeniedError
    RateLimitError = RateLimitError
    TransportError = TransportError
    TransportTimeoutError = TransportTimeoutError
    UnprocessableEntityError = UnprocessableEntityError
    UnsupportedInteractionError = UnsupportedInteractionError
    UnsupportedProtocolError = UnsupportedProtocolError

    def __init__(
        self,
        *,
        api_key: AsyncCredentialValue | None = None,
        auth: AsyncAuthValue | None = None,
        base_url: str | None = None,
        client: AsyncClient = async_client,
        default_headers: dict[str, str] | None = None,
        default_path: dict[str, Any] | None = None,
        default_query: dict[str, Any] | None = None,
        http_client: AsyncHttpxLike | None = None,
        interceptors: Interceptors | None = None,
        log_level: LogLevel | None = None,
        logger: Logger | None = None,
        max_retries: int | None = None,
        retry: RetryValue | None = None,
        timeout: TimeoutValue | None = None,
    ) -> None:
        """The Elmo API, as one object to call through.

        Pass `api_key`, or set `ELMO_API_KEY` and pass nothing.

        Options given here apply to every call it makes.

        Example:
            ```python
            async_elmo = AsyncElmo()
            await async_elmo.brands.list()
            ```

        Args:
            api_key: An instance admin key from `ADMIN_API_KEYS`, or an organization key (`elmo_…`) issued from the dashboard. Read from the `ELMO_API_KEY` environment variable when unset.
            auth: Decides each credential a call sends, given the scheme and the value its option holds. What it returns is sent, so return the value to keep it. `False` sends no credential.
            base_url: Override the base URL calls are sent to. Read from the `ELMO_BASE_URL` environment variable when unset.
            client: A client to dispatch through, in place of one built from options. For sharing one configured client across several SDKs, or for one built by hand.
            default_headers: Headers to send with every call. Merged per name with whatever a call sets, and `None` drops one.
            default_path: Path parameters every call starts from. Merged per name with whatever a call sets.
            default_query: Query parameters to add to every call. Merged per name with whatever a call sets, and `None` drops one.
            http_client: An `httpx2.AsyncClient` to send requests with, in place of the one this SDK opens. Set proxies, TLS and connection limits on it. Closing this SDK leaves it open, since whoever opened it owns it.
            interceptors: Run your own hooks around every call. Each is a sequence of callables, which the awaited client also waits for. `request` reads the request after the credentials are on it and before it is sent. `response` and `error` each return what the caller reads, so a hook that only observes returns what it was given.
            log_level: Set the log level. Raise it to see what each call sent and what came back. `'debug'` adds headers, with credentials hidden. Read from the `ELMO_LOG` environment variable when unset. Defaults to `'off'`.
            logger: Set the logger. This SDK's own `logging.Logger` by default, which writes to standard error unless the application has given it a handler of its own.
            max_retries: The maximum number of times a failed call is sent again. A shorthand for `retry: { attempts: max_retries + 1 }`. It counts attempts and nothing else: a call that may already have been acted on is sent again only after 408, 425 or 429, or where it carries its API's idempotency key. `retry.methods` widens that. Defaults to `2`.
            retry: How a failed call is retried, or `False` to send it once. A call whose body is a stream is always sent once. Defaults to `{ attempts: 3 }`.
            timeout: The maximum time one attempt may run. Set `False` or `0` for no limit, or a function that takes the operation as `METHOD /path` and returns its limit. Defaults to `60`. The unit is seconds.
        """

        self._transport = own_transport(async_transport, http_client, client.setup)
        self.client: AsyncClient = AsyncClient(
            setup=configure(
                with_transport(client.setup, self._transport),
                {
                    "api_key": api_key,
                    "auth": auth,
                    "base_url": base_url,
                    "headers": default_headers,
                    "path": default_path,
                    "query": default_query,
                    "interceptors": interceptors,
                    "log_level": log_level,
                    "logger": logger,
                    "max_retries": max_retries,
                    "retry": retry,
                    "timeout": timeout,
                },
            ),
        )

    def with_options(
        self,
        *,
        api_key: AsyncCredentialValue | None = None,
        auth: AsyncAuthValue | None = None,
        base_url: str | None = None,
        default_headers: dict[str, str] | None = None,
        default_path: dict[str, Any] | None = None,
        default_query: dict[str, Any] | None = None,
        interceptors: Interceptors | None = None,
        log_level: LogLevel | None = None,
        logger: Logger | None = None,
        max_retries: int | None = None,
        retry: RetryValue | None = None,
        timeout: TimeoutValue | None = None,
    ) -> AsyncElmo:
        """The same calls, with different options.

        Options given here layer over the ones already in force. Headers merge
        per name, and everything else replaces. What this was called on does
        not change, and the two send over one connection pool.

        Args:
            api_key: An instance admin key from `ADMIN_API_KEYS`, or an organization key (`elmo_…`) issued from the dashboard. Read from the `ELMO_API_KEY` environment variable when unset.
            auth: Decides each credential a call sends, given the scheme and the value its option holds. What it returns is sent, so return the value to keep it. `False` sends no credential.
            base_url: Override the base URL calls are sent to. Read from the `ELMO_BASE_URL` environment variable when unset.
            default_headers: Headers to send with every call. Merged per name with whatever a call sets, and `None` drops one.
            default_path: Path parameters every call starts from. Merged per name with whatever a call sets.
            default_query: Query parameters to add to every call. Merged per name with whatever a call sets, and `None` drops one.
            interceptors: Run your own hooks around every call. Each is a sequence of callables, which the awaited client also waits for. `request` reads the request after the credentials are on it and before it is sent. `response` and `error` each return what the caller reads, so a hook that only observes returns what it was given.
            log_level: Set the log level. Raise it to see what each call sent and what came back. `'debug'` adds headers, with credentials hidden. Read from the `ELMO_LOG` environment variable when unset. Defaults to `'off'`.
            logger: Set the logger. This SDK's own `logging.Logger` by default, which writes to standard error unless the application has given it a handler of its own.
            max_retries: The maximum number of times a failed call is sent again. A shorthand for `retry: { attempts: max_retries + 1 }`. It counts attempts and nothing else: a call that may already have been acted on is sent again only after 408, 425 or 429, or where it carries its API's idempotency key. `retry.methods` widens that. Defaults to `2`.
            retry: How a failed call is retried, or `False` to send it once. A call whose body is a stream is always sent once. Defaults to `{ attempts: 3 }`.
            timeout: The maximum time one attempt may run. Set `False` or `0` for no limit, or a function that takes the operation as `METHOD /path` and returns its limit. Defaults to `60`. The unit is seconds.
        """

        derived = object.__new__(type(self))
        derived._transport = self._transport
        derived.client = AsyncClient(
            setup=configure(
                self.client.setup,
                {
                    "api_key": api_key,
                    "auth": auth,
                    "base_url": base_url,
                    "headers": default_headers,
                    "path": default_path,
                    "query": default_query,
                    "interceptors": interceptors,
                    "log_level": log_level,
                    "logger": logger,
                    "max_retries": max_retries,
                    "retry": retry,
                    "timeout": timeout,
                },
            ),
        )
        return derived

    async def aclose(self) -> None:
        """Closes the connection pool this SDK opened.

        A client passed as `http_client` is left open, since whoever opened it
        owns it. An SDK derived with `with_options`, or built with this one's
        `client`, sends over this same pool, so closing either closes it for
        both. Calling this twice is harmless.
        """

        await self._transport.aclose()

    async def __aenter__(self) -> AsyncElmo:
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        await self.aclose()

    @cached_property
    def brands(self) -> AsyncBrands:
        """Manage brand records"""

        from .resources.brands import AsyncBrands
        return AsyncBrands(self.client)

    @cached_property
    def competitors(self) -> AsyncCompetitors:
        """Manage brand competitors"""

        from .resources.competitors import AsyncCompetitors
        return AsyncCompetitors(self.client)

    @cached_property
    def me(self) -> AsyncMe:
        """What the calling key is and what it may reach"""

        from .resources.identity import AsyncMe
        return AsyncMe(self.client)

    @cached_property
    def models(self) -> AsyncModels:
        """The answer engines this deployment can track"""

        from .resources.models import AsyncModels
        return AsyncModels(self.client)

    @cached_property
    def organizations(self) -> AsyncOrganizations:
        """Organizations, their plan limits, and their usage"""

        from .resources.organizations import AsyncOrganizations
        return AsyncOrganizations(self.client)

    @cached_property
    def prompts(self) -> AsyncPrompts:
        """Manage brand prompts"""

        from .resources.prompts import AsyncPrompts
        return AsyncPrompts(self.client)

    @cached_property
    def reports(self) -> AsyncReports:
        """Generate and retrieve AI Share of Voice reports"""

        from .resources.reports import AsyncReports
        return AsyncReports(self.client)

    @cached_property
    def tools(self) -> AsyncTools:
        """One-shot helpers (e.g. brand analysis) that don't persist anything"""

        from .resources.tools import AsyncTools
        return AsyncTools(self.client)

    @cached_property
    def with_response(self) -> AsyncElmoWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncElmoWithResponse(self)


class AsyncElmoWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, elmo: AsyncElmo) -> None:
        self._client = elmo.client

    @cached_property
    def brands(self) -> AsyncBrandsWithResponse:
        from .resources.brands import AsyncBrands, AsyncBrandsWithResponse
        return AsyncBrandsWithResponse(AsyncBrands(self._client))

    @cached_property
    def competitors(self) -> AsyncCompetitorsWithResponse:
        from .resources.competitors import (
            AsyncCompetitors,
            AsyncCompetitorsWithResponse,
        )
        return AsyncCompetitorsWithResponse(AsyncCompetitors(self._client))

    @cached_property
    def me(self) -> AsyncMeWithResponse:
        from .resources.identity import AsyncMe, AsyncMeWithResponse
        return AsyncMeWithResponse(AsyncMe(self._client))

    @cached_property
    def models(self) -> AsyncModelsWithResponse:
        from .resources.models import AsyncModels, AsyncModelsWithResponse
        return AsyncModelsWithResponse(AsyncModels(self._client))

    @cached_property
    def organizations(self) -> AsyncOrganizationsWithResponse:
        from .resources.organizations import (
            AsyncOrganizations,
            AsyncOrganizationsWithResponse,
        )
        return AsyncOrganizationsWithResponse(AsyncOrganizations(self._client))

    @cached_property
    def prompts(self) -> AsyncPromptsWithResponse:
        from .resources.prompts import AsyncPrompts, AsyncPromptsWithResponse
        return AsyncPromptsWithResponse(AsyncPrompts(self._client))

    @cached_property
    def reports(self) -> AsyncReportsWithResponse:
        from .resources.reports import AsyncReports, AsyncReportsWithResponse
        return AsyncReportsWithResponse(AsyncReports(self._client))

    @cached_property
    def tools(self) -> AsyncToolsWithResponse:
        from .resources.tools import AsyncTools, AsyncToolsWithResponse
        return AsyncToolsWithResponse(AsyncTools(self._client))
