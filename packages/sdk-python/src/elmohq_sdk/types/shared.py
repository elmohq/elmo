from __future__ import annotations

from enum import Enum
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field


class Error(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    code: str | None = None
    """Stable machine-readable code. Deliberately not an enum: new values are added without a version bump, so treat an unrecognized one as its HTTP status implies. Currently: `unauthorized`, `insufficient_scope`, `forbidden`, `not_found`, `validation_error`, `conflict`, `rate_limited`, `method_not_allowed`, `read_only`, `no_active_plan`, `brand_limit`, `prompt_limit`, `model_not_in_plan`, `model_picks_exceeded`, `premium_not_in_plan`, `premium_pool_exhausted`, `cadence_faster_than_plan`, `internal_error`."""
    error: str
    """Error type"""
    message: str | None = None
    """Detailed error message"""


class OpenEnum(Enum):
    """An enum that keeps a value it does not list.

    APIs add values over time. One this class does not list becomes a
    member of its own, whose `value` is what was sent, rather than an error.
    """

    @classmethod
    def _missing_(cls, value: object) -> Any:
        kind: Any = getattr(cls, "_member_type_", object)
        if kind is not object and isinstance(value, kind):
            member = kind.__new__(cls, value)
            member._name_ = str(value)
            member._value_ = value
            return cls._value2member_map_.setdefault(value, member)
        return None


class MentionEntry(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    count: int | None = None
    """Number of runs where this entity was mentioned"""
    entity: str
    """Competitor entity name"""


class MentionsSummary(BaseModel):
    """Aggregated mention counts for a prompt across its evaluation runs."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_mentions_total: int = Field(
        ...,
        validation_alias="brandMentionsTotal",
        serialization_alias="brandMentionsTotal",
    )
    """Number of runs where the brand was mentioned"""
    competitor_mentions_total: int = Field(
        ...,
        validation_alias="competitorMentionsTotal",
        serialization_alias="competitorMentionsTotal",
    )
    """Total count of individual competitor mentions across all runs (a single run mentioning 3 competitors counts as 3)"""
    mentions_top_k: list[MentionEntry] = Field(
        ..., validation_alias="mentionsTopK", serialization_alias="mentionsTopK"
    )
    """Top-K competitor entities ranked by mention count"""
    mentions_total: int = Field(
        ..., validation_alias="mentionsTotal", serialization_alias="mentionsTotal"
    )
    """Total brand + competitor mentions across all runs"""


class Pagination(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    limit: int
    page: int
    total: int
    """Total items matching the request."""
    total_pages: int = Field(
        ..., validation_alias="totalPages", serialization_alias="totalPages"
    )
