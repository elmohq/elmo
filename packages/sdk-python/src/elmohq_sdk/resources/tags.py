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
from ..types.tags import ListBrandTagsResponse

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client


class Tags:
    """The tags in use on a brand's prompts"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self, brand_id: str, /, options: RequestOptions | None = None
    ) -> ListBrandTagsResponse:
        """List a brand's tags

        Every tag in use on the brand's prompts, with how many carry each — enough to build the same filter the dashboard shows without paging the whole prompt list to derive it.

        Tags are not a resource of their own: a tag exists exactly as long as some prompt carries it. `branded` and `unbranded` are computed by Elmo and always listed.

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
                address="/brands/{brandId}/tags",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandTagsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> TagsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return TagsWithResponse(self)


class TagsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, tags: Tags) -> None:
        self._client = tags.client
        self.list = with_response(tags.list)


class AsyncTags:
    """The tags in use on a brand's prompts"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self, brand_id: str, /, options: AsyncRequestOptions | None = None
    ) -> ListBrandTagsResponse:
        """List a brand's tags

        Every tag in use on the brand's prompts, with how many carry each — enough to build the same filter the dashboard shows without paging the whole prompt list to derive it.

        Tags are not a resource of their own: a tag exists exactly as long as some prompt carries it. `branded` and `unbranded` are computed by Elmo and always listed.

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
                address="/brands/{brandId}/tags",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            ListBrandTagsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncTagsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncTagsWithResponse(self)


class AsyncTagsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, tags: AsyncTags) -> None:
        self._client = tags.client
        self.list = async_with_response(tags.list)
