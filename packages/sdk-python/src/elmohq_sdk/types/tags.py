from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field


class Tag(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    name: str
    """The tag, normalized to lower case."""
    prompt_count: int = Field(
        ..., validation_alias="promptCount", serialization_alias="promptCount"
    )
    """Prompts in this brand carrying the tag."""
    system: bool
    """True for `branded` and `unbranded`, which Elmo computes from the prompt text. A system tag always appears here; applying it to a prompt as a user tag overrides the computed classification rather than creating a new tag."""


class TagList(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_id: str = Field(
        ..., validation_alias="brandId", serialization_alias="brandId"
    )
    data: list[Tag]
    """System tags first, then user tags alphabetically — the order the dashboard's filter shows."""


ListBrandTagsResponse = TagList
"""List a brand's tags"""
