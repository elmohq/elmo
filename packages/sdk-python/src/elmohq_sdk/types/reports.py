from __future__ import annotations

from datetime import datetime
from typing import Annotated, ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .shared import MentionsSummary, OpenEnum


class CreateReportRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_name: str = Field(
        ..., min_length=1, validation_alias="brandName", serialization_alias="brandName"
    )
    """The brand name to analyze"""
    brand_website: str = Field(
        ...,
        min_length=1,
        validation_alias="brandWebsite",
        serialization_alias="brandWebsite",
    )
    """The brand's website — a domain (nike.com) or a full URL. A URL with a path (e.g. https://www.nike.com/golf) scopes the analysis to that page; mentions are tracked against its domain either way."""
    manual_prompts: list[str] | None = Field(
        default=None,
        validation_alias="manualPrompts",
        serialization_alias="manualPrompts",
    )
    """Optional list of custom prompts to include in the report"""


class ReportSummaryStatus(str, OpenEnum):
    """Current report status"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportSummary(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_name: str = Field(
        ..., validation_alias="brandName", serialization_alias="brandName"
    )
    """Brand name analyzed"""
    brand_website: str = Field(
        ..., validation_alias="brandWebsite", serialization_alias="brandWebsite"
    )
    """Brand website URL"""
    completed_at: datetime | None = Field(
        ..., validation_alias="completedAt", serialization_alias="completedAt"
    )
    """Timestamp when the report completed"""
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    """Timestamp when the report was created"""
    id: UUID
    """Unique identifier for the report"""
    status: ReportSummaryStatus
    """Current report status"""


class ReportPromptSnapshot(BaseModel):
    """Per-prompt snapshot of raw mention data from a report. Consumers compute SoV and other derived metrics."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    mentions: MentionsSummary
    prompt_value: str = Field(
        ..., validation_alias="promptValue", serialization_alias="promptValue"
    )
    """The prompt text that was evaluated"""
    total_runs: int = Field(
        ..., validation_alias="totalRuns", serialization_alias="totalRuns"
    )
    """Number of evaluation runs for this prompt"""


CreateReportRequestRequestBody = CreateReportRequest


class CreateReportStatus(str, OpenEnum):
    """Initial report status"""

    PENDING = "pending"


class CreateReportResponse(BaseModel):
    """Report created and queued for generation"""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_name: str = Field(
        ..., validation_alias="brandName", serialization_alias="brandName"
    )
    brand_website: str = Field(
        ..., validation_alias="brandWebsite", serialization_alias="brandWebsite"
    )
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    report_id: UUID = Field(
        ..., validation_alias="reportId", serialization_alias="reportId"
    )
    """Unique identifier for the created report"""
    status: CreateReportStatus
    """Initial report status"""


class GetReportStatus(str, OpenEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class GetReportUnstableCompetitorsItem(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    name: str
    """Competitor name"""
    prompt_runs_with_mentions: int = Field(
        ...,
        validation_alias="promptRunsWithMentions",
        serialization_alias="promptRunsWithMentions",
    )
    """Number of individual prompt runs where this competitor was mentioned"""
    prompts_with_mentions: int = Field(
        ...,
        validation_alias="promptsWithMentions",
        serialization_alias="promptsWithMentions",
    )
    """Number of prompts where this competitor was mentioned in at least one run"""
    sov: Annotated[float, Field(ge=0, le=1)]
    """Share of voice (0-1): this competitor's mentions / total mentions (brand + all competitors)"""
    visibility: Annotated[float, Field(ge=0, le=1)]
    """Visibility (0-1): prompt runs mentioning this competitor / total prompt runs"""


class GetReportUnstable(BaseModel):
    """Derived stats (SoV, visibility, etc.). Format may change between versions. Only present when status is 'completed'."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    competitors: list[GetReportUnstableCompetitorsItem] | None = None
    """Per-competitor SoV breakdown, sorted by SoV descending"""
    prompt_runs_with_brand_mentions: int | None = Field(
        default=None,
        validation_alias="promptRunsWithBrandMentions",
        serialization_alias="promptRunsWithBrandMentions",
    )
    """Number of individual prompt runs where the brand was mentioned"""
    prompts_with_brand_mentions: int | None = Field(
        default=None,
        validation_alias="promptsWithBrandMentions",
        serialization_alias="promptsWithBrandMentions",
    )
    """Number of prompts where the brand was mentioned in at least one prompt run"""
    sov: float | None = None
    """Overall share of voice (0-1): brand_mentions / (brand_mentions + competitor_mentions). Null when no mentions at all."""
    total_prompt_runs: int | None = Field(
        default=None,
        validation_alias="totalPromptRuns",
        serialization_alias="totalPromptRuns",
    )
    """Total number of prompt runs across all prompts (each prompt is executed multiple times across different AI engines)"""
    total_prompts: int | None = Field(
        default=None,
        validation_alias="totalPrompts",
        serialization_alias="totalPrompts",
    )
    """Total number of prompts evaluated"""
    visibility: Annotated[float, Field(ge=0, le=1)] | None = None
    """Brand visibility (0-1): brand_mentions / total_prompt_runs (how often the brand appears at all across all prompt runs)"""


class GetReportResponse(BaseModel):
    """Report status and data. When status is 'completed', includes per-prompt snapshot data with raw mention counts."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_name: str = Field(
        ..., validation_alias="brandName", serialization_alias="brandName"
    )
    brand_website: str = Field(
        ..., validation_alias="brandWebsite", serialization_alias="brandWebsite"
    )
    completed_at: datetime | None = Field(
        ..., validation_alias="completedAt", serialization_alias="completedAt"
    )
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    progress: int | None = None
    """Generation progress percentage (0-100). Available while processing."""
    prompts: list[ReportPromptSnapshot] | None = None
    """Per-prompt snapshot data. Only present when status is 'completed'."""
    report_id: UUID = Field(
        ..., validation_alias="reportId", serialization_alias="reportId"
    )
    status: GetReportStatus
    unstable: GetReportUnstable | None = None
    """Derived stats (SoV, visibility, etc.). Format may change between versions. Only present when status is 'completed'."""
