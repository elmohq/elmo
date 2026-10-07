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
from .._internal.core.types import OperationDescriptor, PaginationDescriptor
from .._internal.page.page import async_pages, pages
from ..client import async_client, client
from ..types.organizations import (
    GetOrganizationBillingResponse,
    GetOrganizationResponse,
    Organization,
)

if TYPE_CHECKING:
    from .shared import AsyncRequestOptions, RequestOptions
    from .._internal.core.client import AsyncClient, Client
    from .._internal.core.missing import Missing
    from .._internal.page.page import AsyncPage, Page


class Billing:
    """Organizations, their plan limits, and their usage"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def get(
        self, organization_id: str, /, options: RequestOptions | None = None
    ) -> GetOrganizationBillingResponse:
        """Get billing state

        The organization's plan, its limits, and how much of each limit is already spent — enough for an integration to know a write will be rejected before attempting it.

        This endpoint is read-only by construction. No API key of any kind can change a subscription, an add-on quantity, or a payment method; there is no billing write endpoint and no billing write scope. Stripe identifiers, invoices, and payment methods are never returned.

        Deployments without billing answer `200` with `billingEnabled: false`, a null plan, and null limits, so callers need no special case.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "organization_id", "map": "organizationId"}],
            organization_id=organization_id,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/organizations/{organizationId}/billing",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetOrganizationBillingResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> BillingWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return BillingWithResponse(self)


class BillingWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, billing: Billing) -> None:
        self._client = billing.client
        self.get = with_response(billing.get)


class Organizations:
    """Organizations, their plan limits, and their usage"""

    def __init__(self, client: Client = client) -> None:
        self.client = client

    def list(
        self,
        *,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: RequestOptions | None = None,
    ) -> Page[Organization]:
        """List organizations

        One entry for an organization key — the one it acts inside. Every organization for an instance admin key. No scope required: a key can only ever see the organization it is already bound to.

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
                address="/organizations",
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
            Organization.model_validate,
        )

    def get(
        self, organization_id: str, /, options: RequestOptions | None = None
    ) -> GetOrganizationResponse:
        """Get an organization

        No scope required. An organization outside the key's reach answers `404`, identically to one that does not exist.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "organization_id", "map": "organizationId"}],
            organization_id=organization_id,
        )
        call_options = merge_params(call_options, options or {})
        return send(
            self.client,
            OperationDescriptor(
                address="/organizations/{organizationId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetOrganizationResponse.model_validate,
        )

    @cached_property
    def billing(self) -> Billing:
        """Organizations, their plan limits, and their usage"""

        return Billing(self.client)

    @cached_property
    def with_response(self) -> OrganizationsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return OrganizationsWithResponse(self)


class OrganizationsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, organizations: Organizations) -> None:
        self._client = organizations.client
        self.get = with_response(organizations.get)

    @cached_property
    def billing(self) -> BillingWithResponse:
        return BillingWithResponse(Billing(self._client))


class AsyncBilling:
    """Organizations, their plan limits, and their usage"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def get(
        self, organization_id: str, /, options: AsyncRequestOptions | None = None
    ) -> GetOrganizationBillingResponse:
        """Get billing state

        The organization's plan, its limits, and how much of each limit is already spent — enough for an integration to know a write will be rejected before attempting it.

        This endpoint is read-only by construction. No API key of any kind can change a subscription, an add-on quantity, or a payment method; there is no billing write endpoint and no billing write scope. Stripe identifiers, invoices, and payment methods are never returned.

        Deployments without billing answer `200` with `billingEnabled: false`, a null plan, and null limits, so callers need no special case.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "organization_id", "map": "organizationId"}],
            organization_id=organization_id,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/organizations/{organizationId}/billing",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetOrganizationBillingResponse.model_validate,
        )

    @cached_property
    def with_response(self) -> AsyncBillingWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncBillingWithResponse(self)


class AsyncBillingWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, billing: AsyncBilling) -> None:
        self._client = billing.client
        self.get = async_with_response(billing.get)


class AsyncOrganizations:
    """Organizations, their plan limits, and their usage"""

    def __init__(self, client: AsyncClient = async_client) -> None:
        self.client = client

    async def list(
        self,
        *,
        page: int | Missing = MISSING,
        limit: int | Missing = MISSING,
        options: AsyncRequestOptions | None = None,
    ) -> AsyncPage[Organization]:
        """List organizations

        One entry for an organization key — the one it acts inside. Every organization for an instance admin key. No scope required: a key can only ever see the organization it is already bound to.

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
                address="/organizations",
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
            Organization.model_validate,
        )

    async def get(
        self, organization_id: str, /, options: AsyncRequestOptions | None = None
    ) -> GetOrganizationResponse:
        """Get an organization

        No scope required. An organization outside the key's reach answers `404`, identically to one that does not exist.

        Args:
            options: What one call may set for itself, overriding the client it goes through.
        """

        call_options = group_params(
            [{"in": "path", "key": "organization_id", "map": "organizationId"}],
            organization_id=organization_id,
        )
        call_options = merge_params(call_options, options or {})
        return await async_send(
            self.client,
            OperationDescriptor(
                address="/organizations/{organizationId}",
                interaction="unary",
                method="get",
                auth=API_KEY_REQUIREMENTS,
            ),
            call_options,
            GetOrganizationResponse.model_validate,
        )

    @cached_property
    def billing(self) -> AsyncBilling:
        """Organizations, their plan limits, and their usage"""

        return AsyncBilling(self.client)

    @cached_property
    def with_response(self) -> AsyncOrganizationsWithResponse:
        """The same calls, answering with the reply as well as what it decoded."""

        return AsyncOrganizationsWithResponse(self)


class AsyncOrganizationsWithResponse:
    """The same calls, answering with the reply as well as what it decoded."""

    def __init__(self, organizations: AsyncOrganizations) -> None:
        self._client = organizations.client
        self.get = async_with_response(organizations.get)

    @cached_property
    def billing(self) -> AsyncBillingWithResponse:
        return AsyncBillingWithResponse(AsyncBilling(self._client))
