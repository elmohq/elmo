from __future__ import annotations

from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import AnyUrl, BaseModel, ConfigDict, Field

from .shared import OpenEnum


class OpportunityPrompt(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    prompt_id: UUID | None = Field(
        ..., validation_alias="promptId", serialization_alias="promptId"
    )
    """The tracked prompt it resolved to, or null when it didn't match one."""
    text: str
    """The prompt as the report names it."""


class CitedPage(BaseModel):
    domain: str
    title: str | None
    url: AnyUrl


class OpportunityCategory(str, OpenEnum):
    """Which workstream this belongs to: `creation` is net-new content, `existing-content` is a page that could win the mention with a refresh, `outreach` is earning a placement on a third-party site assistants cite, `social` is the community conversations they pull from."""

    CREATION = "creation"
    EXISTING_CONTENT = "existing-content"
    OUTREACH = "outreach"
    SOCIAL = "social"


class Opportunity(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    category: OpportunityCategory
    """Which workstream this belongs to: `creation` is net-new content, `existing-content` is a page that could win the mention with a refresh, `outreach` is earning a placement on a third-party site assistants cite, `social` is the community conversations they pull from."""
    competitor_citations: list[CitedPage] = Field(
        ...,
        validation_alias="competitorCitations",
        serialization_alias="competitorCitations",
    )
    """Pages on competitor domains cited for those prompts."""
    related_prompts: list[OpportunityPrompt] = Field(
        ..., validation_alias="relatedPrompts", serialization_alias="relatedPrompts"
    )
    """Tracked prompts this would help. May be empty."""
    title: str
    """Short and action-oriented — the concrete surface or angle."""
    why: str
    """Why it is worth doing, in plain language."""
    your_citations: list[CitedPage] = Field(
        ..., validation_alias="yourCitations", serialization_alias="yourCitations"
    )
    """Pages on the brand's own domains already cited for those prompts."""


class BrandOpportunitiesStatus(str, OpenEnum):
    """`ready` when a report is present. `insufficient-data` when the brand hasn't accumulated enough tracked answers to say anything useful yet, in which case the lists are empty."""

    READY = "ready"
    INSUFFICIENT_DATA = "insufficient-data"


class BrandOpportunities(BaseModel):
    """The brand's latest Opportunities report — the same LLM-generated analysis the dashboard shows, read from the append-only history rather than regenerated. Elmo decides when to produce a new one; there is no way to trigger generation over the API, because it spends provider budget with no per-call metering behind it."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    generated_at: datetime | None = Field(
        ..., validation_alias="generatedAt", serialization_alias="generatedAt"
    )
    model: str | None
    """The model that produced the report, when recorded."""
    opportunities: list[Opportunity]
    """Prioritized, highest impact first."""
    risks: list[str]
    """Caveats: hard-to-win areas, or tactics to avoid."""
    status: BrandOpportunitiesStatus
    """`ready` when a report is present. `insufficient-data` when the brand hasn't accumulated enough tracked answers to say anything useful yet, in which case the lists are empty."""
    summary: list[str]
    """A few bullets on where the brand stands and the through-line of the plan."""


GetBrandOpportunitiesResponse = BrandOpportunities
"""Get the latest opportunities report"""
