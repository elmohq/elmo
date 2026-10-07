from __future__ import annotations

from functools import cached_property
from typing import TYPE_CHECKING

from .shared import API_KEY_REQUIREMENTS
from .._internal.core.params import merge_params
from .._internal.core.response import (
    async_send,
    async_with_response,
    send,
    with_response,
)
from .._internal.core.types import OperationDescriptor
from ..client import async_client, client
from ..types.identity import GetMeResponse

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client


class Me:
    """What the calling key is and what it may reach"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def get(self, options: RequestOptions | None = None) -> GetMeResponse:
        """Describe the calling key

        What this key is, which organization and brands it reaches, and which scopes it holds. Requires no scope, so it is always safe to call first when wiring up an integration.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        return send(
            self.client,
            OperationDescriptor(
                address="/me",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            merge_params({}, options or {}),
            GetMeResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> MeWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return MeWithResponse(self)


class MeWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, me: Me) -> None:
        self._client = me.client
        self.get = with_response(me.get)


class AsyncMe:
    """What the calling key is and what it may reach"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def get(self, options: AsyncRequestOptions | None = None) -> GetMeResponse:
        """Describe the calling key

        What this key is, which organization and brands it reaches, and which scopes it holds. Requires no scope, so it is always safe to call first when wiring up an integration.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        return await async_send(
            self.client,
            OperationDescriptor(
                address="/me",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            merge_params({}, options or {}),
            GetMeResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncMeWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncMeWithResponse(self)


class AsyncMeWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, me: AsyncMe) -> None:
        self._client = me.client
        self.get = async_with_response(me.get)
