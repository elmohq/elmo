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
from ..types.prompts import (
    CreatePromptResponse,
    DeletePromptResponse,
    GetPromptResponse,
    Prompt,
    UpdatePromptResponse,
)

if TYPE_CHECKING:
    from .runs import AsyncRuns, AsyncRunsWithResponse, Runs, RunsWithResponse
    from .shared import AsyncRequestOptions, RequestOptions
    from .snapshots import (
        AsyncSnapshot,
        AsyncSnapshotWithResponse,
        Snapshot,
        SnapshotWithResponse,
    )
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing
    from .._internal.page.page import AsyncPage, Page


class Prompts:
    """Manage brand prompts"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        *,
        brand_id: str | Missing = MISSING,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        enabled: bool | Missing = MISSING,
        tags: str | Missing = MISSING,
        q: str | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> Page[Prompt]:
        """List all prompts

        Retrieve a paginated list of all prompts across all brands

        Args:
            brand_id: Filter prompts by brand ID
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. This list had no ceiling before, so the maximum is set to bound a runaway query rather than to change what an existing caller gets back. Defaults to `20`.
            enabled: Only prompts with this tracking state.
            tags: Comma-separated tags. A prompt matches if it carries any of them.
            q: Case-insensitive substring match on prompt text.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "query", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "page"},
                {"in": "query", "key": "limit"},
                {"in": "query", "key": "enabled"},
                {"in": "query", "key": "tags"},
                {"in": "query", "key": "q"},
            ],
            brand_id=brand_id,
            page=page,
            limit=limit,
            enabled=enabled,
            tags=tags,
            q=q,
        )
        call_options = merge_params(call_options, options or {})
        return pages(
            self.client,
            OperationDescriptor(
                address="/prompts",
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
            Prompt.model_validate,
        )

    def create(
        self,
        *,
        brand_id: str,
        value: str,
        tags: List[str] | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> CreatePromptResponse:
        """Create a new prompt

        Create a new prompt for a brand. This will automatically schedule the prompt for execution.

        Args:
            brand_id: Brand identifier this prompt belongs to
            value: The prompt text
            tags: User-defined tags for categorizing this prompt
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "brand_id", "map": "brandId"},
                {"in": "body", "key": "value"},
                {"in": "body", "key": "tags"},
            ],
            brand_id=brand_id,
            value=value,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/prompts",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            CreatePromptResponse.model_validate,
        )

    def delete(
        self, prompt_id: UUID, /, options: RequestOptions | None = None
    ) -> DeletePromptResponse:
        """Delete a prompt

        Permanently delete a prompt and cancel all related scheduled jobs. This will also cascade delete all associated prompt runs.

        Requires an instance admin key; organization keys receive `403`. The dashboard has no delete either — stop tracking a prompt with `PATCH /prompts/{promptId}` and `enabled: false`, which keeps its history and frees the plan slot.

        Args:
            prompt_id: The ID of the prompt to delete
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "prompt_id", "map": "promptId"}], prompt_id=prompt_id
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}",
                interaction="unary",
                method="delete",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            DeletePromptResponse.model_validate,
        )

    def get(
        self, prompt_id: UUID, /, options: RequestOptions | None = None
    ) -> GetPromptResponse:
        """Get a prompt

        Retrieve a specific prompt by ID

        Args:
            prompt_id: The ID of the prompt
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "prompt_id", "map": "promptId"}], prompt_id=prompt_id
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetPromptResponse.model_validate,
        )

    def update(
        self,
        prompt_id: UUID,
        /,
        *,
        value: str | Missing = MISSING,
        enabled: bool | Missing = MISSING,
        tags: List[str] | Missing = MISSING,
        premium_models: List[str] | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> UpdatePromptResponse:
        """Update a prompt

        Update a prompt's properties. Only provided fields will be updated. Toggling `enabled` schedules or unschedules the recurring run job.

        Args:
            prompt_id: The ID of the prompt to update
            value: The prompt text
            enabled: Whether the prompt is enabled
            tags: User-defined tags for categorizing this prompt
            premium_models: Replaces the prompt's grounded models. Checked against the organization's premium pool.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "prompt_id", "map": "promptId"},
                {"in": "body", "key": "value"},
                {"in": "body", "key": "enabled"},
                {"in": "body", "key": "tags"},
                {"in": "body", "key": "premium_models", "map": "premiumModels"},
            ],
            prompt_id=prompt_id,
            value=value,
            enabled=enabled,
            tags=tags,
            premium_models=premium_models,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}",
                interaction="unary",
                media_type="application/json",
                method="patch",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            UpdatePromptResponse.model_validate,
        )

    @cached_property
    def runs(self) -> Runs:
        """Individual model answers behind the aggregates"""

        from .runs import Runs
        return Runs(self.client)

    @cached_property
    def snapshot(self) -> Snapshot:
        """Aggregated analytics snapshots for prompts"""

        from .snapshots import Snapshot
        return Snapshot(self.client)

    @cached_property
    def with_response(self) -> PromptsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return PromptsWithResponse(self)


class PromptsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, prompts: Prompts) -> None:
        self._client = prompts.client
        self.create = with_response(prompts.create)
        self.delete = with_response(prompts.delete)
        self.get = with_response(prompts.get)
        self.update = with_response(prompts.update)

    @cached_property
    def runs(self) -> RunsWithResponse:
        from .runs import Runs, RunsWithResponse
        return RunsWithResponse(Runs(self._client))

    @cached_property
    def snapshot(self) -> SnapshotWithResponse:
        from .snapshots import Snapshot, SnapshotWithResponse
        return SnapshotWithResponse(Snapshot(self._client))


class AsyncPrompts:
    """Manage brand prompts"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        *,
        brand_id: str | Missing = MISSING,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        enabled: bool | Missing = MISSING,
        tags: str | Missing = MISSING,
        q: str | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> AsyncPage[Prompt]:
        """List all prompts

        Retrieve a paginated list of all prompts across all brands

        Args:
            brand_id: Filter prompts by brand ID
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. This list had no ceiling before, so the maximum is set to bound a runaway query rather than to change what an existing caller gets back. Defaults to `20`.
            enabled: Only prompts with this tracking state.
            tags: Comma-separated tags. A prompt matches if it carries any of them.
            q: Case-insensitive substring match on prompt text.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "query", "key": "brand_id", "map": "brandId"},
                {"in": "query", "key": "page"},
                {"in": "query", "key": "limit"},
                {"in": "query", "key": "enabled"},
                {"in": "query", "key": "tags"},
                {"in": "query", "key": "q"},
            ],
            brand_id=brand_id,
            page=page,
            limit=limit,
            enabled=enabled,
            tags=tags,
            q=q,
        )
        call_options = merge_params(call_options, options or {})
        return await async_pages(
            self.client,
            OperationDescriptor(
                address="/prompts",
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
            Prompt.model_validate,
        )

    async def create(
        self,
        *,
        brand_id: str,
        value: str,
        tags: List[str] | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> CreatePromptResponse:
        """Create a new prompt

        Create a new prompt for a brand. This will automatically schedule the prompt for execution.

        Args:
            brand_id: Brand identifier this prompt belongs to
            value: The prompt text
            tags: User-defined tags for categorizing this prompt
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "body", "key": "brand_id", "map": "brandId"},
                {"in": "body", "key": "value"},
                {"in": "body", "key": "tags"},
            ],
            brand_id=brand_id,
            value=value,
            tags=tags,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/prompts",
                interaction="unary",
                media_type="application/json",
                method="post",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            CreatePromptResponse.model_validate,
        )

    async def delete(
        self, prompt_id: UUID, /, options: AsyncRequestOptions | None = None
    ) -> DeletePromptResponse:
        """Delete a prompt

        Permanently delete a prompt and cancel all related scheduled jobs. This will also cascade delete all associated prompt runs.

        Requires an instance admin key; organization keys receive `403`. The dashboard has no delete either — stop tracking a prompt with `PATCH /prompts/{promptId}` and `enabled: false`, which keeps its history and frees the plan slot.

        Args:
            prompt_id: The ID of the prompt to delete
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "prompt_id", "map": "promptId"}], prompt_id=prompt_id
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}",
                interaction="unary",
                method="delete",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            DeletePromptResponse.model_validate,
        )

    async def get(
        self, prompt_id: UUID, /, options: AsyncRequestOptions | None = None
    ) -> GetPromptResponse:
        """Get a prompt

        Retrieve a specific prompt by ID

        Args:
            prompt_id: The ID of the prompt
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "prompt_id", "map": "promptId"}], prompt_id=prompt_id
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetPromptResponse.model_validate,
        )

    async def update(
        self,
        prompt_id: UUID,
        /,
        *,
        value: str | Missing = MISSING,
        enabled: bool | Missing = MISSING,
        tags: List[str] | Missing = MISSING,
        premium_models: List[str] | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> UpdatePromptResponse:
        """Update a prompt

        Update a prompt's properties. Only provided fields will be updated. Toggling `enabled` schedules or unschedules the recurring run job.

        Args:
            prompt_id: The ID of the prompt to update
            value: The prompt text
            enabled: Whether the prompt is enabled
            tags: User-defined tags for categorizing this prompt
            premium_models: Replaces the prompt's grounded models. Checked against the organization's premium pool.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "prompt_id", "map": "promptId"},
                {"in": "body", "key": "value"},
                {"in": "body", "key": "enabled"},
                {"in": "body", "key": "tags"},
                {"in": "body", "key": "premium_models", "map": "premiumModels"},
            ],
            prompt_id=prompt_id,
            value=value,
            enabled=enabled,
            tags=tags,
            premium_models=premium_models,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}",
                interaction="unary",
                media_type="application/json",
                method="patch",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            UpdatePromptResponse.model_validate,
        )

    @cached_property
    def runs(self) -> AsyncRuns:
        """Individual model answers behind the aggregates"""

        from .runs import AsyncRuns
        return AsyncRuns(self.client)

    @cached_property
    def snapshot(self) -> AsyncSnapshot:
        """Aggregated analytics snapshots for prompts"""

        from .snapshots import AsyncSnapshot
        return AsyncSnapshot(self.client)

    @cached_property
    def with_response(self) -> AsyncPromptsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncPromptsWithResponse(self)


class AsyncPromptsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, prompts: AsyncPrompts) -> None:
        self._client = prompts.client
        self.create = async_with_response(prompts.create)
        self.delete = async_with_response(prompts.delete)
        self.get = async_with_response(prompts.get)
        self.update = async_with_response(prompts.update)

    @cached_property
    def runs(self) -> AsyncRunsWithResponse:
        from .runs import AsyncRuns, AsyncRunsWithResponse
        return AsyncRunsWithResponse(AsyncRuns(self._client))

    @cached_property
    def snapshot(self) -> AsyncSnapshotWithResponse:
        from .snapshots import AsyncSnapshot, AsyncSnapshotWithResponse
        return AsyncSnapshotWithResponse(AsyncSnapshot(self._client))
