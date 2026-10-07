from __future__ import annotations

from datetime import datetime
from typing import Annotated, ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .shared import Pagination


class Competitor(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(populate_by_name=True)
    aliases: list[str]
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    domains: list[str]
    id: UUID
    name: str
    updated_at: datetime = Field(
        ..., validation_alias="updatedAt", serialization_alias="updatedAt"
    )


class CompetitorsList(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    competitors: list[Competitor] = Field(..., deprecated=True)
    """Deprecated: read `data` instead. Kept while the one known consumer migrates, and removed in a future release."""
    data: list[Competitor]
    """The items on this page. Read this rather than the named key below."""
    pagination: Pagination


class CreateCompetitorRequest(BaseModel):
    """Add a competitor to a brand."""

    model_config: ClassVar[ConfigDict] = ConfigDict(populate_by_name=True)
    aliases: list[str] | None = None
    brand_id: str = Field(
        ..., min_length=1, validation_alias="brandId", serialization_alias="brandId"
    )
    domains: list[str] | None = None
    name: Annotated[str, Field(min_length=1)]


class UpdateCompetitorRequest(BaseModel):
    """Update a competitor. At least one field must be provided. Provided arrays replace the stored values verbatim."""

    aliases: list[str] | None = None
    domains: list[str] | None = None
    name: Annotated[str, Field(min_length=1)] | None = None


CreateCompetitorRequestRequestBody = CreateCompetitorRequest


UpdateCompetitorRequestRequestBody = UpdateCompetitorRequest


CreateCompetitorResponse = Competitor
"""Competitor created"""


DeleteCompetitorResponse = Competitor
"""Competitor deleted (returns the deleted competitor)"""


GetCompetitorResponse = Competitor
"""Competitor"""


UpdateCompetitorResponse = Competitor
"""Competitor updated"""
