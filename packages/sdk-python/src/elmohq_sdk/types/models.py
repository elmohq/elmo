from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    configured: bool
    """Whether this deployment is actually wired to reach it."""
    id: str
    """Identifier used by the `model` filter, e.g. `chatgpt`."""
    label: str
    """Human-readable name."""
    premium_capable: bool = Field(
        ..., validation_alias="premiumCapable", serialization_alias="premiumCapable"
    )
    """Whether this model can be tracked grounded, spending a premium pairing."""


class ModelList(BaseModel):
    data: list[Model]


ListModelsResponse = ModelList
"""List trackable models"""
