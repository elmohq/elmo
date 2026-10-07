from __future__ import annotations

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
from ..types.tools import AnalyzeBrandResponse

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing


class Tools:
    """One-shot helpers (e.g. brand analysis) that don't persist anything"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def analyze(
        self,
        *,
        website: str,
        brand_name: str | Missing = MISSING,
        max_competitors: int | Missing = MISSING,
        max_prompts: int | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> AnalyzeBrandResponse:
        """Analyze a website

        Run brand analysis without persisting anything. Returns suggested additional domains, aliases, competitors, and prompts.

        Requires an instance admin key; organization keys receive `403`.

        Args:
            website: Brand's website — a hostname or a full URL. A URL with a path (e.g. https://www.nike.com/golf) is analyzed as given; the returned website is always its domain.
            brand_name: Optional brand name hint. If omitted, inferred from the domain.
            max_competitors: Maximum number of competitor suggestions. 0 disables competitor generation entirely. Defaults to `20`.
            max_prompts: Maximum number of suggested prompts. 0 disables prompt generation entirely. Defaults to `30`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "website"},
                {"in": "body", "key": "brand_name", "map": "brandName"},
                {"in": "body", "key": "max_competitors", "map": "maxCompetitors"},
                {"in": "body", "key": "max_prompts", "map": "maxPrompts"},
            ],
            website=website,
            brand_name=brand_name,
            max_competitors=max_competitors,
            max_prompts=max_prompts,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/tools/analyze",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            AnalyzeBrandResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> ToolsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return ToolsWithResponse(self)


class ToolsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, tools: Tools) -> None:
        self._client = tools.client
        self.analyze = with_response(tools.analyze)


class AsyncTools:
    """One-shot helpers (e.g. brand analysis) that don't persist anything"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def analyze(
        self,
        *,
        website: str,
        brand_name: str | Missing = MISSING,
        max_competitors: int | Missing = MISSING,
        max_prompts: int | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> AnalyzeBrandResponse:
        """Analyze a website

        Run brand analysis without persisting anything. Returns suggested additional domains, aliases, competitors, and prompts.

        Requires an instance admin key; organization keys receive `403`.

        Args:
            website: Brand's website — a hostname or a full URL. A URL with a path (e.g. https://www.nike.com/golf) is analyzed as given; the returned website is always its domain.
            brand_name: Optional brand name hint. If omitted, inferred from the domain.
            max_competitors: Maximum number of competitor suggestions. 0 disables competitor generation entirely. Defaults to `20`.
            max_prompts: Maximum number of suggested prompts. 0 disables prompt generation entirely. Defaults to `30`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "website"},
                {"in": "body", "key": "brand_name", "map": "brandName"},
                {"in": "body", "key": "max_competitors", "map": "maxCompetitors"},
                {"in": "body", "key": "max_prompts", "map": "maxPrompts"},
            ],
            website=website,
            brand_name=brand_name,
            max_competitors=max_competitors,
            max_prompts=max_prompts,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/tools/analyze",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            AnalyzeBrandResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncToolsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncToolsWithResponse(self)


class AsyncToolsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, tools: AsyncTools) -> None:
        self._client = tools.client
        self.analyze = async_with_response(tools.analyze)
