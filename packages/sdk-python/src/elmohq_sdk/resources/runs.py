from __future__ import annotations

from datetime import datetime
from functools import cached_property
from uuid import UUID
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
from .._internal.core.types import OperationDescriptor, PaginationDescriptor
from .._internal.page.page import async_pages, pages
from ..client import async_client, client
from ..types.runs import GetRunResponse, RunSummary

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing
    from .._internal.page.page import AsyncPage, Page


class Runs:
    """Individual model answers behind the aggregates"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        prompt_id: UUID,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> Page[RunSummary]:
        """List runs for a prompt

        Individual model answers behind the aggregates, newest first, without their text — the list stays small enough to page through. Fetch `GET /prompts/{promptId}/runs/{runId}` for the answer itself.

        Args:
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. Defaults to `20`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "prompt_id", "map": "promptId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "page"},
                {"in": "query", "key": "limit"},
            ],
            prompt_id=prompt_id,
            start=start,
            end=end,
            model=model,
            page=page,
            limit=limit,
        )
        call_options = merge_params(call_options, options or {})
        return pages(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}/runs",
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
            RunSummary.model_validate,
        )

    def get(
        self, prompt_id: UUID, run_id: UUID, /, options: RequestOptions | None = None
    ) -> GetRunResponse:
        """Get a run

        One model answer, with its text normalized out of the provider’s response and its citations in the order the engine listed them. A run belonging to some other prompt answers `404`. The provider’s raw payload is deliberately not exposed — its shape belongs to the provider, not to this API.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "prompt_id", "map": "promptId"},
                {"in": "path", "key": "run_id", "map": "runId"},
            ],
            prompt_id=prompt_id,
            run_id=run_id,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}/runs/{runId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetRunResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> RunsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return RunsWithResponse(self)


class RunsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, runs: Runs) -> None:
        self._client = runs.client
        self.get = with_response(runs.get)


class AsyncRuns:
    """Individual model answers behind the aggregates"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        prompt_id: UUID,
        /,
        *,
        start: datetime,
        end: datetime,
        model: str | Missing = MISSING,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> AsyncPage[RunSummary]:
        """List runs for a prompt

        Individual model answers behind the aggregates, newest first, without their text — the list stays small enough to page through. Fetch `GET /prompts/{promptId}/runs/{runId}` for the answer itself.

        Args:
            start: Inclusive lower bound of the window, an ISO 8601 timestamp such as `2026-01-01T00:00:00Z`. A bare `YYYY-MM-DD` is rejected: that is `/prompts/{promptId}/snapshot`'s spelling and means a local calendar day there.
            end: Exclusive upper bound of the window, an ISO 8601 timestamp. The window is half-open: a run at exactly `end` is outside it.
            model: Restrict to one model, e.g. `chatgpt`. See `GET /models`.
            page: Page number, 1-based. Defaults to `1`.
            limit: Items per page. Values above the maximum are clamped, not rejected. Defaults to `20`.
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "prompt_id", "map": "promptId"},
                {"in": "query", "key": "start"},
                {"in": "query", "key": "end"},
                {"in": "query", "key": "model"},
                {"in": "query", "key": "page"},
                {"in": "query", "key": "limit"},
            ],
            prompt_id=prompt_id,
            start=start,
            end=end,
            model=model,
            page=page,
            limit=limit,
        )
        call_options = merge_params(call_options, options or {})
        return await async_pages(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}/runs",
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
            RunSummary.model_validate,
        )

    async def get(
        self,
        prompt_id: UUID,
        run_id: UUID,
        /,
        options: AsyncRequestOptions | None = None,
    ) -> GetRunResponse:
        """Get a run

        One model answer, with its text normalized out of the provider’s response and its citations in the order the engine listed them. A run belonging to some other prompt answers `404`. The provider’s raw payload is deliberately not exposed — its shape belongs to the provider, not to this API.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [
                {"in": "path", "key": "prompt_id", "map": "promptId"},
                {"in": "path", "key": "run_id", "map": "runId"},
            ],
            prompt_id=prompt_id,
            run_id=run_id,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/prompts/{promptId}/runs/{runId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetRunResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncRunsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncRunsWithResponse(self)


class AsyncRunsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, runs: AsyncRuns) -> None:
        self._client = runs.client
        self.get = async_with_response(runs.get)
