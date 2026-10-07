from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from .shared import OpenEnum, Pagination


class Organization(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(populate_by_name=True)
    brand_count: int = Field(
        ..., validation_alias="brandCount", serialization_alias="brandCount"
    )
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    id: str
    name: str
    slug: str


class PlanLimits(BaseModel):
    """The organization's plan limits. Every field is null on deployments without billing."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, protected_namespaces=(), use_attribute_docstrings=True
    )
    max_brands: int | None = Field(
        ..., validation_alias="maxBrands", serialization_alias="maxBrands"
    )
    """Null means no limit."""
    max_prompts: int | None = Field(
        ..., validation_alias="maxPrompts", serialization_alias="maxPrompts"
    )
    """Enabled prompts across the whole organization. Null means no limit."""
    model_menu: list[str] | None = Field(
        ..., validation_alias="modelMenu", serialization_alias="modelMenu"
    )
    """Models the plan may pick from. Null means any."""
    model_picks: int | None = Field(
        ..., validation_alias="modelPicks", serialization_alias="modelPicks"
    )
    """Models trackable per brand."""
    premium_pool: int = Field(
        ..., validation_alias="premiumPool", serialization_alias="premiumPool"
    )
    """Prompt/model pairings trackable grounded."""
    premium_runs_per_day: int = Field(
        ...,
        validation_alias="premiumRunsPerDay",
        serialization_alias="premiumRunsPerDay",
    )
    standard_runs_per_day: int | None = Field(
        ...,
        validation_alias="standardRunsPerDay",
        serialization_alias="standardRunsPerDay",
    )


class BillingPlanInterval(str, OpenEnum):
    """Null on a negotiated plan, which carries no billing interval."""

    MONTHLY = "monthly"
    ANNUAL = "annual"


class BillingPlanStanding(str, OpenEnum):
    """What the subscription means for service, and the only field a caller needs to act on: `active` and `grace` keep tracking running, `paused` stops it, `none` is unsubscribed. The payment provider's own status string is deliberately not passed through."""

    ACTIVE = "active"
    GRACE = "grace"
    PAUSED = "paused"
    NONE = "none"


class BillingPlan(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    cancel_at_period_end: bool = Field(
        ...,
        validation_alias="cancelAtPeriodEnd",
        serialization_alias="cancelAtPeriodEnd",
    )
    interval: BillingPlanInterval | None = None
    """Null on a negotiated plan, which carries no billing interval."""
    key: str | None
    """Plan identifier, or `custom` for a negotiated plan."""
    name: str
    """Display name."""
    period_end: datetime | None = Field(
        default=None, validation_alias="periodEnd", serialization_alias="periodEnd"
    )
    standing: BillingPlanStanding
    """What the subscription means for service, and the only field a caller needs to act on: `active` and `grace` keep tracking running, `paused` stops it, `none` is unsubscribed. The payment provider's own status string is deliberately not passed through."""
    tracking_active: bool = Field(
        ..., validation_alias="trackingActive", serialization_alias="trackingActive"
    )
    """Whether prompts are currently being sampled."""


class OrganizationBillingUsage(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(populate_by_name=True)
    brands: int
    enabled_prompts: int = Field(
        ..., validation_alias="enabledPrompts", serialization_alias="enabledPrompts"
    )
    premium_pairings_assigned: int = Field(
        ...,
        validation_alias="premiumPairingsAssigned",
        serialization_alias="premiumPairingsAssigned",
    )


class OrganizationBilling(BaseModel):
    """Read-only view of an organization's subscription, limits, and usage. The API has no way to change any of it: there is no billing write endpoint and no billing write scope. Stripe identifiers, payment methods, and invoices are deliberately not exposed — those live in the Stripe customer portal."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    billing_enabled: bool = Field(
        ..., validation_alias="billingEnabled", serialization_alias="billingEnabled"
    )
    """False on self-hosted deployments, where nothing is metered."""
    limits: PlanLimits | None
    organization_id: str = Field(
        ..., validation_alias="organizationId", serialization_alias="organizationId"
    )
    plan: BillingPlan | None
    """Null when the organization has no subscription, or when billing is disabled."""
    usage: OrganizationBillingUsage


class OrganizationList(BaseModel):
    data: list[Organization]
    pagination: Pagination


GetOrganizationResponse = Organization
"""Get an organization"""


GetOrganizationBillingResponse = OrganizationBilling
"""Get billing state"""
