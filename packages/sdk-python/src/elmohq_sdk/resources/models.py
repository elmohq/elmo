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
from ..types.models import ListModelsResponse

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client


class Models:
    """The answer engines this deployment can track"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(self, options: RequestOptions | None = None) -> ListModelsResponse:
        """List trackable models

        The answer engines this deployment can track, so a client can build a model filter without hardcoding ids that differ between deployments.

        Requires no scope.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        return send(
            self.client,
            OperationDescriptor(
                address="/models",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            merge_params({}, options or {}),
            ListModelsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> ModelsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return ModelsWithResponse(self)


class ModelsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, models: Models) -> None:
        self._client = models.client
        self.list = with_response(models.list)


class AsyncModels:
    """The answer engines this deployment can track"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self, options: AsyncRequestOptions | None = None
    ) -> ListModelsResponse:
        """List trackable models

        The answer engines this deployment can track, so a client can build a model filter without hardcoding ids that differ between deployments.

        Requires no scope.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        return await async_send(
            self.client,
            OperationDescriptor(
                address="/models",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            merge_params({}, options or {}),
            ListModelsResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncModelsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncModelsWithResponse(self)


class AsyncModelsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, models: AsyncModels) -> None:
        self._client = models.client
        self.list = async_with_response(models.list)
