from __future__ import annotations

from datetime import datetime
from functools import cached_property
from typing import TYPE_CHECKING

from .shared import API_KEY_REQUIREMENTS
from .._internal.core.missing import MISSING
from .._internal.core.params import group_params, merge_params
from .._internal.core.response import (
    async_send,
    async_with_response,
    send,
    with_response,
)
from .._internal.core.types import OperationDescriptor
from ..client import async_client, client
from ..types.analytics import (
    GetBrandAnalyticsResponse,
    GetBrandQueryFanoutResponse,
    ListBrandCitationDomainsResponse,
    ListBrandCitationUrlsResponse,
    ListBrandPromptPerformanceResponse,
)

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing


class Analytics:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def get(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> GetBrandAnalyticsResponse:
        """Get a brand's analytics

        Visibility, share of voice, the per-model breakdown and the citation totals for one window, in one request.

        The long lists — cited domains and URLs, sub-queries, per-prompt results — are endpoints of their own. Everything else is always included.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/analytics",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandAnalyticsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AnalyticsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AnalyticsWithResponse(self)


class AnalyticsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, analytics: Analytics) -> None:
        self._client = analytics.client
        self.get = with_response(analytics.get)


class Domains:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> ListBrandCitationDomainsResponse:
        """List cited domains

        Domains the engines cited when answering this brand's prompts, categorized and compared against the equal-length window immediately before this one.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/citations/domains",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandCitationDomainsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> DomainsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return DomainsWithResponse(self)


class DomainsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, domains: Domains) -> None:
        self._client = domains.client
        self.list = with_response(domains.list)


class Urls:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> ListBrandCitationUrlsResponse:
        """List cited URLs

        Individual pages the engines cited, with their category and page type.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/citations/urls",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandCitationUrlsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> UrlsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return UrlsWithResponse(self)


class UrlsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, urls: Urls) -> None:
        self._client = urls.client
        self.list = with_response(urls.list)


class Citations:
    def __init__(self, client: Client = client) -> None:
        self.client = client

    @cached_property
    def domains(self) -> Domains:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        return Domains(self.client)

    @cached_property
    def urls(self) -> Urls:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        return Urls(self.client)

    @cached_property
    def with_response(self) -> CitationsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return CitationsWithResponse(self)


class CitationsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, citations: Citations) -> None:
        self._client = citations.client

    @cached_property
    def domains(self) -> DomainsWithResponse:
        return DomainsWithResponse(Domains(self._client))

    @cached_property
    def urls(self) -> UrlsWithResponse:
        return UrlsWithResponse(Urls(self._client))


class PromptPerformance:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> ListBrandPromptPerformanceResponse:
        """List prompt performance

        Per-prompt mention rates over the window. The analytics counterpart to `GET /prompts?brandId=`, which returns prompt configuration rather than results.

        A prompt the brand stopped tracking is not sampled, so it has no results over the window and does not appear here.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/prompt-performance",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandPromptPerformanceResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> PromptPerformanceWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return PromptPerformanceWithResponse(self)


class PromptPerformanceWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, prompt_performance: PromptPerformance) -> None:
        self._client = prompt_performance.client
        self.list = with_response(prompt_performance.list)


class QueryFanout:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def get(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> GetBrandQueryFanoutResponse:
        """Get query fan-out

        The searches engines ran while answering this brand's prompts. Engines that don't expose their searches still contribute runs, so `coverageRate` is the honest denominator.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/query-fanout",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandQueryFanoutResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> QueryFanoutWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return QueryFanoutWithResponse(self)


class QueryFanoutWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, query_fanout: QueryFanout) -> None:
        self._client = query_fanout.client
        self.get = with_response(query_fanout.get)


class AsyncAnalytics:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def get(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> GetBrandAnalyticsResponse:
        """Get a brand's analytics

        Visibility, share of voice, the per-model breakdown and the citation totals for one window, in one request.

        The long lists — cited domains and URLs, sub-queries, per-prompt results — are endpoints of their own. Everything else is always included.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/analytics",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandAnalyticsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncAnalyticsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncAnalyticsWithResponse(self)


class AsyncAnalyticsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, analytics: AsyncAnalytics) -> None:
        self._client = analytics.client
        self.get = async_with_response(analytics.get)


class AsyncDomains:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> ListBrandCitationDomainsResponse:
        """List cited domains

        Domains the engines cited when answering this brand's prompts, categorized and compared against the equal-length window immediately before this one.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/citations/domains",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandCitationDomainsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncDomainsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncDomainsWithResponse(self)


class AsyncDomainsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, domains: AsyncDomains) -> None:
        self._client = domains.client
        self.list = async_with_response(domains.list)


class AsyncUrls:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> ListBrandCitationUrlsResponse:
        """List cited URLs

        Individual pages the engines cited, with their category and page type.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/citations/urls",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandCitationUrlsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncUrlsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncUrlsWithResponse(self)


class AsyncUrlsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, urls: AsyncUrls) -> None:
        self._client = urls.client
        self.list = async_with_response(urls.list)


class AsyncCitations:
    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    @cached_property
    def domains(self) -> AsyncDomains:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        return AsyncDomains(self.client)

    @cached_property
    def urls(self) -> AsyncUrls:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        return AsyncUrls(self.client)

    @cached_property
    def with_response(self) -> AsyncCitationsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncCitationsWithResponse(self)


class AsyncCitationsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, citations: AsyncCitations) -> None:
        self._client = citations.client

    @cached_property
    def domains(self) -> AsyncDomainsWithResponse:
        return AsyncDomainsWithResponse(AsyncDomains(self._client))

    @cached_property
    def urls(self) -> AsyncUrlsWithResponse:
        return AsyncUrlsWithResponse(AsyncUrls(self._client))


class AsyncPromptPerformance:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> ListBrandPromptPerformanceResponse:
        """List prompt performance

        Per-prompt mention rates over the window. The analytics counterpart to `GET /prompts?brandId=`, which returns prompt configuration rather than results.

        A prompt the brand stopped tracking is not sampled, so it has no results over the window and does not appear here.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/prompt-performance",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandPromptPerformanceResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncPromptPerformanceWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncPromptPerformanceWithResponse(self)


class AsyncPromptPerformanceWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, prompt_performance: AsyncPromptPerformance) -> None:
        self._client = prompt_performance.client
        self.list = async_with_response(prompt_performance.list)


class AsyncQueryFanout:
    """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def get(
        self,
        brand_id: str,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        tags: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> GetBrandQueryFanoutResponse:
        """Get query fan-out

        The searches engines ran while answering this brand's prompts. Engines that don't expose their searches still contribute runs, so `coverageRate` is the honest denominator.

        Args:
            brand_id: Brand identifier.
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            tags: Comma-separated prompt tags. Only prompts carrying at least one of them are counted.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "tags"},
            ],
            brand_id=brand_id,
            start=start,
            end=end,
            model=model,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/query-fanout",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandQueryFanoutResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncQueryFanoutWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncQueryFanoutWithResponse(self)


class AsyncQueryFanoutWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, query_fanout: AsyncQueryFanout) -> None:
        self._client = query_fanout.client
        self.get = async_with_response(query_fanout.get)
