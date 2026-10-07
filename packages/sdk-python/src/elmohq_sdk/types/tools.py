from __future__ import annotations

from typing import Annotated, ClassVar

from pydantic import BaseModel, ConfigDict, Field


class AnalyzeBrandRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_name: str | None = Field(
        default=None, validation_alias="brandName", serialization_alias="brandName"
    )
    """Optional brand name hint. If omitted, inferred from the domain."""
    max_competitors: int = Field(
        default=20,
        ge=0,
        le=100,
        validation_alias="maxCompetitors",
        serialization_alias="maxCompetitors",
    )
    """Maximum number of competitor suggestions. 0 disables competitor generation entirely."""
    max_prompts: int = Field(
        default=30,
        ge=0,
        le=100,
        validation_alias="maxPrompts",
        serialization_alias="maxPrompts",
    )
    """Maximum number of suggested prompts. 0 disables prompt generation entirely."""
    website: Annotated[str, Field(min_length=1)]
    """Brand's website — a hostname or a full URL. A URL with a path (e.g. https://www.nike.com/golf) is analyzed as given; the returned website is always its domain."""


class OnboardingSuggestionCompetitorsItem(BaseModel):
    aliases: list[str]
    domains: list[str]
    name: str


class OnboardingSuggestionSuggestedPromptsItem(BaseModel):
    prompt: str
    tags: list[str]


class OnboardingSuggestion(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    additional_domains: list[str] = Field(
        ...,
        validation_alias="additionalDomains",
        serialization_alias="additionalDomains",
    )
    aliases: list[str]
    brand_name: str = Field(
        ..., validation_alias="brandName", serialization_alias="brandName"
    )
    competitors: list[OnboardingSuggestionCompetitorsItem]
    suggested_prompts: list[OnboardingSuggestionSuggestedPromptsItem] = Field(
        ..., validation_alias="suggestedPrompts", serialization_alias="suggestedPrompts"
    )
    website: str
    """Cleaned hostname"""


AnalyzeBrandRequestRequestBody = AnalyzeBrandRequest


AnalyzeBrandResponse = OnboardingSuggestion
"""Brand analysis suggestion"""
