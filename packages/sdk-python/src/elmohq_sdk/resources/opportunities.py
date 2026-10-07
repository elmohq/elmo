from __future__ import annotations

from functools import cached_property
from typing import TYPE_CHECKING

from .shared import API_KEY_REQUIREMENTS
from .._internal.core.params import group_params, merge_params
from .._internal.core.response import (
    async_send,
    async_with_response,
    send,
    with_response,
)
from .._internal.core.types import OperationDescriptor
from ..client import async_client, client
from ..types.opportunities import GetBrandOpportunitiesResponse

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client


class Opportunities:
    """Where a brand could win more citations, and why"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def get(
        self, brand_id: str, /, options: RequestOptions | None = None
    ) -> GetBrandOpportunitiesResponse:
        """Get the latest opportunities report

        **Experimental — the response shape may still change.**

        The brand's Opportunities report: a prioritized set of ways to get cited more often, with the tracked prompts and cited pages behind each one. The same analysis the dashboard shows, from the same code.

        Generation is inline and synchronous. A stored report is served while it is fresh and regenerated when it is not, so there is nothing to poll for and no way to be handed a stale one — but a request that triggers a generation waits for it. The freshness window bounds the cost: however many callers ask, one generation per brand per window. There is deliberately no `POST`, which would spend provider budget with nothing metering it per call.

        Experimental.

        Args:
            brand_id: Brand identifier.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "brand_id", "map": "brandId"}], brand_id=brand_id
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/opportunities",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandOpportunitiesResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> OpportunitiesWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return OpportunitiesWithResponse(self)


class OpportunitiesWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, opportunities: Opportunities) -> None:
        self._client = opportunities.client
        self.get = with_response(opportunities.get)


class AsyncOpportunities:
    """Where a brand could win more citations, and why"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def get(
        self, brand_id: str, /, options: AsyncRequestOptions | None = None
    ) -> GetBrandOpportunitiesResponse:
        """Get the latest opportunities report

        **Experimental — the response shape may still change.**

        The brand's Opportunities report: a prioritized set of ways to get cited more often, with the tracked prompts and cited pages behind each one. The same analysis the dashboard shows, from the same code.

        Generation is inline and synchronous. A stored report is served while it is fresh and regenerated when it is not, so there is nothing to poll for and no way to be handed a stale one — but a request that triggers a generation waits for it. The freshness window bounds the cost: however many callers ask, one generation per brand per window. There is deliberately no `POST`, which would spend provider budget with nothing metering it per call.

        Experimental.

        Args:
            brand_id: Brand identifier.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "brand_id", "map": "brandId"}], brand_id=brand_id
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/brands/{brandId}/opportunities",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetBrandOpportunitiesResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncOpportunitiesWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncOpportunitiesWithResponse(self)


class AsyncOpportunitiesWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, opportunities: AsyncOpportunities) -> None:
        self._client = opportunities.client
        self.get = async_with_response(opportunities.get)
