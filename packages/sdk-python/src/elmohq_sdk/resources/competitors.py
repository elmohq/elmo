from __future__ import annotations

from functools import cached_property
from typing import List, TYPE_CHECKING
from uuid import UUID

from .shared import API_KEY_REQUIREMENTS
from .._internal.core.missing import MISSING
from .._internal.core.params import group_params, merge_params
from .._internal.core.response import (
    async_send,
    async_with_response,
    send,
    with_response,
)
from .._internal.core.types import OperationDescriptor, PaginationDescriptor
from .._internal.page.page import async_pages, pages
from ..client import async_client, client
from ..types.competitors import (
    Competitor,
    CreateCompetitorResponse,
    DeleteCompetitorResponse,
    GetCompetitorResponse,
    UpdateCompetitorResponse,
)

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing
    from .._internal.page.page import AsyncPage, Page


class Competitors:
    """Manage brand competitors"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        *,
        brand_id: str | Missing = MISSING,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> Page[Competitor]:
        """List competitors

        Args:
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. Defaults to `20`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "query", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "page"},
                {"in": "query", "key": "limit"},
            ],
            brand_id=brand_id,
            page=page,
            limit=limit,
        )
        call_options = merge_params(call_options, options or {})
        return pages(
            self.client,
            OperationDescriptor(
                address="/competitors",
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
            Competitor.model_validate,
        )

    def create(
        self,
        *,
        brand_id: str,
        name: str,
        domains: List[str] | Missing = MISSING,
        aliases: List[str] | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> CreateCompetitorResponse:
        """Add a competitor

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "brand_id", "map": "brandId"},
                {"in": "body", "key": "name"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
            ],
            brand_id=brand_id,
            name=name,
            domains=domains,
            aliases=aliases,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/competitors",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            CreateCompetitorResponse.model_validate,
        )

    def delete(
        self, competitor_id: UUID, /, options: RequestOptions | None = None
    ) -> DeleteCompetitorResponse:
        """Delete a competitor

        Args:
            competitor_id: Competitor identifier (UUID)
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "competitor_id", "map": "competitorId"}],
            competitor_id=competitor_id,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/competitors/{competitorId}",
                interaction="unary",
                method="delete",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            DeleteCompetitorResponse.model_validate,
        )

    def get(
        self, competitor_id: UUID, /, options: RequestOptions | None = None
    ) -> GetCompetitorResponse:
        """Get a competitor

        Args:
            competitor_id: Competitor identifier (UUID)
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "competitor_id", "map": "competitorId"}],
            competitor_id=competitor_id,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/competitors/{competitorId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetCompetitorResponse.model_validate,
        )

    def update(
        self,
        competitor_id: UUID,
        /,
        *,
        name: str | Missing = MISSING,
        domains: List[str] | Missing = MISSING,
        aliases: List[str] | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> UpdateCompetitorResponse:
        """Update a competitor

        Args:
            competitor_id: Competitor identifier (UUID)
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "competitor_id", "map": "competitorId"},
                {"in": "body", "key": "name"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
            ],
            competitor_id=competitor_id,
            name=name,
            domains=domains,
            aliases=aliases,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/competitors/{competitorId}",
                interaction="unary",
                media_type="application/json",
                method="patch",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            UpdateCompetitorResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> CompetitorsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return CompetitorsWithResponse(self)


class CompetitorsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, competitors: Competitors) -> None:
        self._client = competitors.client
        self.create = with_response(competitors.create)
        self.delete = with_response(competitors.delete)
        self.get = with_response(competitors.get)
        self.update = with_response(competitors.update)


class AsyncCompetitors:
    """Manage brand competitors"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        *,
        brand_id: str | Missing = MISSING,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> AsyncPage[Competitor]:
        """List competitors

        Args:
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. Defaults to `20`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "query", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "page"},
                {"in": "query", "key": "limit"},
            ],
            brand_id=brand_id,
            page=page,
            limit=limit,
        )
        call_options = merge_params(call_options, options or {})
        return await async_pages(
            self.client,
            OperationDescriptor(
                address="/competitors",
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
            Competitor.model_validate,
        )

    async def create(
        self,
        *,
        brand_id: str,
        name: str,
        domains: List[str] | Missing = MISSING,
        aliases: List[str] | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> CreateCompetitorResponse:
        """Add a competitor

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "brand_id", "map": "brandId"},
                {"in": "body", "key": "name"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
            ],
            brand_id=brand_id,
            name=name,
            domains=domains,
            aliases=aliases,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/competitors",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            CreateCompetitorResponse.model_validate,
        )

    async def delete(
        self, competitor_id: UUID, /, options: AsyncRequestOptions | None = None
    ) -> DeleteCompetitorResponse:
        """Delete a competitor

        Args:
            competitor_id: Competitor identifier (UUID)
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "competitor_id", "map": "competitorId"}],
            competitor_id=competitor_id,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/competitors/{competitorId}",
                interaction="unary",
                method="delete",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            DeleteCompetitorResponse.model_validate,
        )

    async def get(
        self, competitor_id: UUID, /, options: AsyncRequestOptions | None = None
    ) -> GetCompetitorResponse:
        """Get a competitor

        Args:
            competitor_id: Competitor identifier (UUID)
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "competitor_id", "map": "competitorId"}],
            competitor_id=competitor_id,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/competitors/{competitorId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetCompetitorResponse.model_validate,
        )

    async def update(
        self,
        competitor_id: UUID,
        /,
        *,
        name: str | Missing = MISSING,
        domains: List[str] | Missing = MISSING,
        aliases: List[str] | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> UpdateCompetitorResponse:
        """Update a competitor

        Args:
            competitor_id: Competitor identifier (UUID)
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "competitor_id", "map": "competitorId"},
                {"in": "body", "key": "name"},
                {"in": "body", "key": "domains"},
                {"in": "body", "key": "aliases"},
            ],
            competitor_id=competitor_id,
            name=name,
            domains=domains,
            aliases=aliases,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/competitors/{competitorId}",
                interaction="unary",
                media_type="application/json",
                method="patch",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            UpdateCompetitorResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncCompetitorsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncCompetitorsWithResponse(self)


class AsyncCompetitorsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, competitors: AsyncCompetitors) -> None:
        self._client = competitors.client
        self.create = async_with_response(competitors.create)
        self.delete = async_with_response(competitors.delete)
        self.get = async_with_response(competitors.get)
        self.update = async_with_response(competitors.update)
