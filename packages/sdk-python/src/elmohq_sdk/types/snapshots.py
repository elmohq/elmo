from __future__ import annotations

from datetime import date
from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .shared import MentionsSummary


class CitedUrlEntry(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    count: int
    """Number of times this URL was cited"""
    title: str | None
    """Page title if available"""
    url: str
    """The cited URL"""


class PromptSnapshotCitations(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_citations_total: int = Field(
        ...,
        validation_alias="brandCitationsTotal",
        serialization_alias="brandCitationsTotal",
    )
    """Number of citations to brand-owned domains"""
    citations_total: int = Field(
        ..., validation_alias="citationsTotal", serialization_alias="citationsTotal"
    )
    """Total number of citations across all runs"""
    cited_urls_top_k: list[CitedUrlEntry] = Field(
        ..., validation_alias="citedUrlsTopK", serialization_alias="citedUrlsTopK"
    )
    """Top-K cited URLs ranked by frequency"""
    competitor_citations_total: int = Field(
        ...,
        validation_alias="competitorCitationsTotal",
        serialization_alias="competitorCitationsTotal",
    )
    """Number of citations to competitor-owned domains"""


class PromptSnapshot(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    """Brand identifier this prompt belongs to"""
    citations: PromptSnapshotCitations
    end_date: date = Field(
        ..., validation_alias="endDate", serialization_alias="endDate"
    )
    """End of the queried date range (YYYY-MM-DD)"""
    mentions: MentionsSummary
    prompt_id: UUID = Field(
        ..., validation_alias="promptId", serialization_alias="promptId"
    )
    """Unique identifier for the prompt"""
    prompt_value: str = Field(
        ..., validation_alias="promptValue", serialization_alias="promptValue"
    )
    """The prompt text"""
    start_date: date = Field(
        ..., validation_alias="startDate", serialization_alias="startDate"
    )
    """Start of the queried date range (YYYY-MM-DD)"""


GetPromptSnapshotResponse = PromptSnapshot
"""Prompt snapshot with mention and citation analytics"""
