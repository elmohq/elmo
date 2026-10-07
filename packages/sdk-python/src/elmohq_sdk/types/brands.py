from __future__ import annotations

from datetime import datetime
from typing import Annotated, ClassVar, TypedDict

from pydantic import BaseModel, ConfigDict, Field
from typing_extensions import NotRequired

from .shared import Pagination


class CreateBrandRequestCompetitorsItem(BaseModel):
    aliases: list[str] | None = None
    domains: list[str] | None = None
    name: Annotated[str, Field(min_length=1)]


class CreateBrandRequestCompetitorsItemDict(TypedDict):
    aliases: NotRequired[list[str] | None]
    domains: NotRequired[list[str] | None]
    name: str


class CreateBrandRequestPromptsItem(BaseModel):
    enabled: bool = True
    tags: list[str] | None = None
    value: Annotated[str, Field(min_length=1)]


class CreateBrandRequestPromptsItemDict(TypedDict):
    enabled: NotRequired[bool]
    tags: NotRequired[list[str] | None]
    value: str


class CreateBrandRequest(BaseModel):
    """Create a brand. Skips onboarding. The first entry in `domains` is treated as the brand's primary website; the rest are stored as additional domains."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    aliases: list[str] | None = None
    competitors: list[CreateBrandRequestCompetitorsItem] | None = None
    domains: Annotated[list[str], Field(min_length=1)]
    """Brand domains. The first entry is the primary website; remaining entries are additional domains."""
    id: Annotated[str, Field(min_length=1)]
    name: Annotated[str, Field(min_length=1)]
    organization_id: str | None = Field(
        default=None,
        validation_alias="organizationId",
        serialization_alias="organizationId",
    )
    """Organization to create the brand in.

    | | Omitted | Present |
    | --- | --- | --- |
    | **Organization key** | creates in the key's own organization | must name the key's own organization; any other value is a `400` |
    | **Admin key** | provisions a new organization named after the brand id | creates in the named organization, which must already exist — `404` if it does not |

    An admin key omitting this field is currently the only way to create an organization over the API.
    """
    prompts: list[CreateBrandRequestPromptsItem] | None = None


class UpdateBrandRequest(BaseModel):
    """Update brand-level fields. At least one field must be provided. Provided arrays replace the stored values verbatim. When `domains` is provided, the first entry becomes the primary website and the rest become additional domains. Prompts and competitors are managed via /prompts and /competitors."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    aliases: list[str] | None = None
    brand_name: str | None = Field(
        default=None,
        min_length=1,
        validation_alias="brandName",
        serialization_alias="brandName",
    )
    domains: Annotated[list[str], Field(min_length=1)] | None = None
    """Brand domains. The first entry is the primary website; remaining entries are additional domains."""
    enabled: bool | None = None
    """Whether the brand is sampled at all. **Modifiable only with an instance admin key**: setting it with an organization key is a `403`, because disabling ends tracking silently while the plan keeps being billed and no dashboard control does it at any role."""


class Brand(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    aliases: list[str]
    created_at: datetime = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    delay_override_hours: int | None = Field(
        ...,
        validation_alias="delayOverrideHours",
        serialization_alias="delayOverrideHours",
    )
    """Sampling cadence override in hours. Null means the plan cadence."""
    domains: list[str]
    """Brand domains. The first entry is the primary website; remaining entries are additional domains."""
    enabled: bool
    enabled_models: list[str] | None = Field(
        ..., validation_alias="enabledModels", serialization_alias="enabledModels"
    )
    """Models this brand is tracked on. Null means the deployment default."""
    id: str
    """User-supplied brand identifier (e.g. "acme")"""
    name: str
    onboarded: bool
    organization_id: str = Field(
        ..., validation_alias="organizationId", serialization_alias="organizationId"
    )
    """The organization that owns this brand and is billed for it."""
    updated_at: datetime = Field(
        ..., validation_alias="updatedAt", serialization_alias="updatedAt"
    )


class BrandsList(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(use_attribute_docstrings=True)
    brands: list[Brand] = Field(..., deprecated=True)
    """Deprecated: read `data` instead. Kept while the one known consumer migrates, and removed in a future release."""
    data: list[Brand]
    """The items on this page. Read this rather than the named key below."""
    pagination: Pagination


CreateBrandRequestRequestBody = CreateBrandRequest


UpdateBrandRequestRequestBody = UpdateBrandRequest


CreateBrandResponse = Brand
"""Brand created"""


GetBrandResponse = Brand
"""Brand"""


UpdateBrandResponse = Brand
"""Brand updated"""
