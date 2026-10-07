from __future__ import annotations

from functools import cached_property
from typing import List, TYPE_CHECKING

from .shared import API_KEY_REQUIREMENTS
from .._internal.core.missing import MISSING
from .._internal.core.params import group_params, merge_params, validate_input
from .._internal.core.response import (
    async_send,
    async_with_response,
    send,
    with_response,
)
from .._internal.core.types import OperationDescriptor, PaginationDescriptor
from .._internal.page.page import async_pages, pages
from ..client import async_client, client
from ..types.brands import (
    Brand,
    CreateBrandRequestCompetitorsItem,
    CreateBrandRequestPromptsItem,
    CreateBrandResponse,
    GetBrandResponse,
    UpdateBrandResponse,
)

if TYPE_CHECKING:
    from .analytics import (
        Analytics,
        AnalyticsWithResponse,
        AsyncAnalytics,
        AsyncAnalyticsWithResponse,
        AsyncCitations,
        AsyncCitationsWithResponse,
        AsyncPromptPerformance,
        AsyncPromptPerformanceWithResponse,
        AsyncQueryFanout,
        AsyncQueryFanoutWithResponse,
        Citations,
        CitationsWithResponse,
        PromptPerformance,
        PromptPerformanceWithResponse,
        QueryFanout,
        QueryFanoutWithResponse,
    )
    from .opportunities import (
        AsyncOpportunities,
        AsyncOpportunitiesWithResponse,
        Opportunities,
        OpportunitiesWithResponse,
    )
    from .shared import AsyncRequestOptions, RequestOptions
    from .tags import AsyncTags, AsyncTagsWithResponse, Tags, TagsWithResponse
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing
    from .._internal.page.page import AsyncPage, Page
    from ..types.brands import (
        CreateBrandRequestCompetitorsItemDict,
        CreateBrandRequestPromptsItemDict,
    )


class Brands:
    """Manage brand records"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        *,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> Page[Brand]:
        """List brands

        Args:
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. Defaults to `20`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "query", "key": "page"}, {"in": "query", "key": "limit"}],
            page=page,
            limit=limit,
        )
        call_options = merge_params(call_options, options or {})
        return pages(
            self.client,
            OperationDescriptor(
                address="/brands",
                interaction="unary",
                method="get",
                pagination=PaginationDescriptor(
                    style="page",
                    items="data",
                    limit_param="limit",
                    pages="pagination.totalPages",
                    param="page",
                    size="pagination.limit",
                    total="pagination.total",
                ),
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            Brand.model_validate,
        )

    def create(
        self,
        *,
        id: str,
        name: str,
        domains: List[str],
        aliases: List[str] | Missing = MISSING,
        competitors: List[
            CreateBrandRequestCompetitorsItem | CreateBrandRequestCompetitorsItemDict
        ]
        | Missing = MISSING,
        prompts: List[CreateBrandRequestPromptsItem | CreateBrandRequestPromptsItemDict]
        | Missing = MISSING,
        organization_id: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> CreateBrandResponse:
        """Create a brand

        Args:
            domains: Brand domains. The first entry is the primary website; remaining entries are additional domains.
            organization_id: Organization to create the brand in. **Organization key**, Omitted: creates in the key's own organization. **Organization key**, Present: must name the key's own organization; any other value is a `400`. **Admin key**, Omitted: provisions a new organization named after the brand id. **Admin key**, Present: creates in the named organization, which must already exist — `404` if it does not. An admin key omitting this field is currently the only way to create an organization over the API.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "id"},
                {"in": "body", "key": "name"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
                {"in": "body", "key": "competitors"},
                {"in": "body", "key": "prompts"},
                {"in": "body", "key": "organization_id", "map": "organizationId"},
            ],
            id=id,
            name=name,
            domains=domains,
            aliases=aliases,
            competitors=validate_input(
                List[CreateBrandRequestCompetitorsItem], competitors
            ),
            prompts=validate_input(List[CreateBrandRequestPromptsItem], prompts),
            organization_id=organization_id,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            CreateBrandResponse.model_validate,
        )

    def get(
        self, brand_id: str, /, options: RequestOptions | None = None
    ) -> GetBrandResponse:
        """Get a brand

        Args:
            brand_id: Brand identifier
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "brand_id", "map": "brandId"}], brand_id=brand_id
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandResponse.model_validate,
        )

    def update(
        self,
        brand_id: str,
        /,
        *,
        brand_name: str | Missing = MISSING,
        domains: List[str] | Missing = MISSING,
        aliases: List[str] | Missing = MISSING,
        enabled: bool | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> UpdateBrandResponse:
        """Update a brand

        Args:
            brand_id: Brand identifier
            domains: Brand domains. The first entry is the primary website; remaining entries are additional domains.
            enabled: Whether the brand is sampled at all. **Modifiable only with an instance admin key**: setting it with an organization key is a `403`, because disabling ends tracking silently while the plan keeps being billed and no dashboard control does it at any role.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "body", "key": "brand_name", "map": "brandName"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
                {"in": "body", "key": "enabled"},
            ],
            brand_id=brand_id,
            brand_name=brand_name,
            domains=domains,
            aliases=aliases,
            enabled=enabled,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}",
                interaction="unary",
                media_type="application/json",
                method="patch",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            UpdateBrandResponse.model_validate,
        )

    @cached_property
    def analytics(self) -> Analytics:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        from .analytics import Analytics
        return Analytics(self.client)

    @cached_property
    def citations(self) -> Citations:
        from .analytics import Citations
        return Citations(self.client)

    @cached_property
    def opportunities(self) -> Opportunities:
        """Where a brand could win more citations, and why"""

        from .opportunities import Opportunities
        return Opportunities(self.client)

    @cached_property
    def prompt_performance(self) -> PromptPerformance:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        from .analytics import PromptPerformance
        return PromptPerformance(self.client)

    @cached_property
    def query_fanout(self) -> QueryFanout:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        from .analytics import QueryFanout
        return QueryFanout(self.client)

    @cached_property
    def tags(self) -> Tags:
        """The tags in use on a brand's prompts"""

        from .tags import Tags
        return Tags(self.client)

    @cached_property
    def with_response(self) -> BrandsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return BrandsWithResponse(self)


class BrandsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, brands: Brands) -> None:
        self._client = brands.client
        self.create = with_response(brands.create)
        self.get = with_response(brands.get)
        self.update = with_response(brands.update)

    @cached_property
    def analytics(self) -> AnalyticsWithResponse:
        from .analytics import Analytics, AnalyticsWithResponse
        return AnalyticsWithResponse(Analytics(self._client))

    @cached_property
    def citations(self) -> CitationsWithResponse:
        from .analytics import Citations, CitationsWithResponse
        return CitationsWithResponse(Citations(self._client))

    @cached_property
    def opportunities(self) -> OpportunitiesWithResponse:
        from .opportunities import Opportunities, OpportunitiesWithResponse
        return OpportunitiesWithResponse(Opportunities(self._client))

    @cached_property
    def prompt_performance(self) -> PromptPerformanceWithResponse:
        from .analytics import PromptPerformance, PromptPerformanceWithResponse
        return PromptPerformanceWithResponse(PromptPerformance(self._client))

    @cached_property
    def query_fanout(self) -> QueryFanoutWithResponse:
        from .analytics import QueryFanout, QueryFanoutWithResponse
        return QueryFanoutWithResponse(QueryFanout(self._client))

    @cached_property
    def tags(self) -> TagsWithResponse:
        from .tags import Tags, TagsWithResponse
        return TagsWithResponse(Tags(self._client))


class AsyncBrands:
    """Manage brand records"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        *,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> AsyncPage[Brand]:
        """List brands

        Args:
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. Defaults to `20`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "query", "key": "page"}, {"in": "query", "key": "limit"}],
            page=page,
            limit=limit,
        )
        call_options = merge_params(call_options, options or {})
        return await async_pages(
            self.client,
            OperationDescriptor(
                address="/brands",
                interaction="unary",
                method="get",
                pagination=PaginationDescriptor(
                    style="page",
                    items="data",
                    limit_param="limit",
                    pages="pagination.totalPages",
                    param="page",
                    size="pagination.limit",
                    total="pagination.total",
                ),
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            Brand.model_validate,
        )

    async def create(
        self,
        *,
        id: str,
        name: str,
        domains: List[str],
        aliases: List[str] | Missing = MISSING,
        competitors: List[
            CreateBrandRequestCompetitorsItem | CreateBrandRequestCompetitorsItemDict
        ]
        | Missing = MISSING,
        prompts: List[CreateBrandRequestPromptsItem | CreateBrandRequestPromptsItemDict]
        | Missing = MISSING,
        organization_id: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> CreateBrandResponse:
        """Create a brand

        Args:
            domains: Brand domains. The first entry is the primary website; remaining entries are additional domains.
            organization_id: Organization to create the brand in. **Organization key**, Omitted: creates in the key's own organization. **Organization key**, Present: must name the key's own organization; any other value is a `400`. **Admin key**, Omitted: provisions a new organization named after the brand id. **Admin key**, Present: creates in the named organization, which must already exist — `404` if it does not. An admin key omitting this field is currently the only way to create an organization over the API.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "id"},
                {"in": "body", "key": "name"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
                {"in": "body", "key": "competitors"},
                {"in": "body", "key": "prompts"},
                {"in": "body", "key": "organization_id", "map": "organizationId"},
            ],
            id=id,
            name=name,
            domains=domains,
            aliases=aliases,
            competitors=validate_input(
                List[CreateBrandRequestCompetitorsItem], competitors
            ),
            prompts=validate_input(List[CreateBrandRequestPromptsItem], prompts),
            organization_id=organization_id,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            CreateBrandResponse.model_validate,
        )

    async def get(
        self, brand_id: str, /, options: AsyncRequestOptions | None = None
    ) -> GetBrandResponse:
        """Get a brand

        Args:
            brand_id: Brand identifier
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "brand_id", "map": "brandId"}], brand_id=brand_id
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandResponse.model_validate,
        )

    async def update(
        self,
        brand_id: str,
        /,
        *,
        brand_name: str | Missing = MISSING,
        domains: List[str] | Missing = MISSING,
        aliases: List[str] | Missing = MISSING,
        enabled: bool | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> UpdateBrandResponse:
        """Update a brand

        Args:
            brand_id: Brand identifier
            domains: Brand domains. The first entry is the primary website; remaining entries are additional domains.
            enabled: Whether the brand is sampled at all. **Modifiable only with an instance admin key**: setting it with an organization key is a `403`, because disabling ends tracking silently while the plan keeps being billed and no dashboard control does it at any role.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "brand_id", "map": "brandId"},
                {"in": "body", "key": "brand_name", "map": "brandName"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
                {"in": "body", "key": "enabled"},
            ],
            brand_id=brand_id,
            brand_name=brand_name,
            domains=domains,
            aliases=aliases,
            enabled=enabled,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}",
                interaction="unary",
                media_type="application/json",
                method="patch",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            UpdateBrandResponse.model_validate,
        )

    @cached_property
    def analytics(self) -> AsyncAnalytics:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        from .analytics import AsyncAnalytics
        return AsyncAnalytics(self.client)

    @cached_property
    def citations(self) -> AsyncCitations:
        from .analytics import AsyncCitations
        return AsyncCitations(self.client)

    @cached_property
    def opportunities(self) -> AsyncOpportunities:
        """Where a brand could win more citations, and why"""

        from .opportunities import AsyncOpportunities
        return AsyncOpportunities(self.client)

    @cached_property
    def prompt_performance(self) -> AsyncPromptPerformance:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        from .analytics import AsyncPromptPerformance
        return AsyncPromptPerformance(self.client)

    @cached_property
    def query_fanout(self) -> AsyncQueryFanout:
        """Aggregated visibility, share of voice, citations, and query fan-out for a brand"""

        from .analytics import AsyncQueryFanout
        return AsyncQueryFanout(self.client)

    @cached_property
    def tags(self) -> AsyncTags:
        """The tags in use on a brand's prompts"""

        from .tags import AsyncTags
        return AsyncTags(self.client)

    @cached_property
    def with_response(self) -> AsyncBrandsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncBrandsWithResponse(self)


class AsyncBrandsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, brands: AsyncBrands) -> None:
        self._client = brands.client
        self.create = async_with_response(brands.create)
        self.get = async_with_response(brands.get)
        self.update = async_with_response(brands.update)

    @cached_property
    def analytics(self) -> AsyncAnalyticsWithResponse:
        from .analytics import AsyncAnalytics, AsyncAnalyticsWithResponse
        return AsyncAnalyticsWithResponse(AsyncAnalytics(self._client))

    @cached_property
    def citations(self) -> AsyncCitationsWithResponse:
        from .analytics import AsyncCitations, AsyncCitationsWithResponse
        return AsyncCitationsWithResponse(AsyncCitations(self._client))

    @cached_property
    def opportunities(self) -> AsyncOpportunitiesWithResponse:
        from .opportunities import AsyncOpportunities, AsyncOpportunitiesWithResponse
        return AsyncOpportunitiesWithResponse(AsyncOpportunities(self._client))

    @cached_property
    def prompt_performance(self) -> AsyncPromptPerformanceWithResponse:
        from .analytics import (
            AsyncPromptPerformance,
            AsyncPromptPerformanceWithResponse,
        )
        return AsyncPromptPerformanceWithResponse(AsyncPromptPerformance(self._client))

    @cached_property
    def query_fanout(self) -> AsyncQueryFanoutWithResponse:
        from .analytics import AsyncQueryFanout, AsyncQueryFanoutWithResponse
        return AsyncQueryFanoutWithResponse(AsyncQueryFanout(self._client))

    @cached_property
    def tags(self) -> AsyncTagsWithResponse:
        from .tags import AsyncTags, AsyncTagsWithResponse
        return AsyncTagsWithResponse(AsyncTags(self._client))
