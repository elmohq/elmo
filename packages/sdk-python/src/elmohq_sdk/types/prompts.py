from __future__ import annotations

from datetime import datetime
from typing import Annotated, ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Prompt(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    """Brand identifier this prompt belongs to"""
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    """Timestamp when the prompt was created"""
    enabled: bool
    """Whether the prompt is currently enabled"""
    id: UUID
    """Unique identifier for the prompt"""
    premium_models: list[str] = Field(
        ..., validation_alias="premiumModels", serialization_alias="premiumModels"
    )
    """Models this prompt is tracked on grounded. Each entry spends one premium pairing."""
    system_tags: list[str] = Field(
        ..., validation_alias="systemTags", serialization_alias="systemTags"
    )
    """Auto-computed system tags (e.g., 'branded', 'unbranded'). Read-only."""
    tags: list[str]
    """User-defined tags for categorizing this prompt"""
    updated_at: datetime = Field(
        ..., validation_alias="updatedAt", serialization_alias="updatedAt"
    )
    """Timestamp when the prompt was last updated"""
    value: str
    """The actual prompt text"""


class CreatePromptRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    """Brand identifier this prompt belongs to"""
    tags: list[str] | None = None
    """User-defined tags for categorizing this prompt"""
    value: Annotated[str, Field(min_length=1)]
    """The prompt text"""


class UpdatePromptRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    enabled: bool | None = None
    """Whether the prompt is enabled"""
    premium_models: list[str] | None = Field(
        default=None,
        validation_alias="premiumModels",
        serialization_alias="premiumModels",
    )
    """Replaces the prompt's grounded models. Checked against the organization's premium pool."""
    tags: list[str] | None = None
    """User-defined tags for categorizing this prompt"""
    value: Annotated[str, Field(min_length=1)] | None = None
    """The prompt text"""


CreatePromptRequestRequestBody = CreatePromptRequest


UpdatePromptRequestRequestBody = UpdatePromptRequest


CreatePromptResponse = Prompt
"""Prompt created successfully"""


class DeletePromptResponse(BaseModel):
    """Prompt deleted (returns the deleted prompt)"""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    """Brand identifier this prompt belongs to"""
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    """Timestamp when the prompt was created"""
    deleted_runs_count: int = Field(
        ..., validation_alias="deletedRunsCount", serialization_alias="deletedRunsCount"
    )
    """Number of related prompt_runs rows deleted by the cascade."""
    enabled: bool
    """Whether the prompt is currently enabled"""
    id: UUID
    """Unique identifier for the prompt"""
    premium_models: list[str] = Field(
        ..., validation_alias="premiumModels", serialization_alias="premiumModels"
    )
    """Models this prompt is tracked on grounded. Each entry spends one premium pairing."""
    system_tags: list[str] = Field(
        ..., validation_alias="systemTags", serialization_alias="systemTags"
    )
    """Auto-computed system tags (e.g., 'branded', 'unbranded'). Read-only."""
    tags: list[str]
    """User-defined tags for categorizing this prompt"""
    updated_at: datetime = Field(
        ..., validation_alias="updatedAt", serialization_alias="updatedAt"
    )
    """Timestamp when the prompt was last updated"""
    value: str
    """The actual prompt text"""


GetPromptResponse = Prompt
"""Prompt details"""


UpdatePromptResponse = Prompt
"""Prompt updated successfully"""
