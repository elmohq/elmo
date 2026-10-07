from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from .shared import OpenEnum


class ApiKeyIdentityKeyType(str, OpenEnum):
    """`admin` for an instance key, `organization` for a dashboard-issued key."""

    ADMIN = "admin"
    ORGANIZATION = "organization"


class ApiKeyIdentityRateLimitWindow(str, OpenEnum):
    MINUTE = "minute"
    HOUR = "hour"


class ApiKeyIdentityRateLimit(BaseModel):
    """The key's configured limit — generous by design: it exists to stop a runaway loop, not to meter normal use. Enforcement is a fixed window and approximate under concurrency."""

    limit: int
    window: ApiKeyIdentityRateLimitWindow


class ApiKeyIdentityScopesItem(str, OpenEnum):
    READ = "read"
    WRITE = "write"


class ApiKeyIdentity(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        populate_by_name=True, use_attribute_docstrings=True
    )
    brand_ids: list[str] | None = Field(
        ..., validation_alias="brandIds", serialization_alias="brandIds"
    )
    """Brands the key is narrowed to, or null when it reaches every brand in its organization. Never an empty array — a restriction to no brands is rejected at creation rather than treated as no restriction."""
    created_at: datetime | None = Field(
        ..., validation_alias="createdAt", serialization_alias="createdAt"
    )
    created_by: str | None = Field(
        ..., validation_alias="createdBy", serialization_alias="createdBy"
    )
    """The key's label, as given when it was issued. Null for admin keys."""
    expires_at: datetime | None = Field(
        ..., validation_alias="expiresAt", serialization_alias="expiresAt"
    )
    """When the key stops working, if it has an expiry."""
    key_type: ApiKeyIdentityKeyType = Field(
        ..., validation_alias="keyType", serialization_alias="keyType"
    )
    """`admin` for an instance key, `organization` for a dashboard-issued key."""
    last_used_at: datetime | None = Field(
        ..., validation_alias="lastUsedAt", serialization_alias="lastUsedAt"
    )
    organization_id: str | None = Field(
        ..., validation_alias="organizationId", serialization_alias="organizationId"
    )
    """The organization this key acts inside. Null for admin keys."""
    organization_name: str | None = Field(
        ..., validation_alias="organizationName", serialization_alias="organizationName"
    )
    rate_limit: ApiKeyIdentityRateLimit | None = Field(
        ..., validation_alias="rateLimit", serialization_alias="rateLimit"
    )
    """The key's configured limit — generous by design: it exists to stop a runaway loop, not to meter normal use. Enforcement is a fixed window and approximate under concurrency."""
    scopes: list[ApiKeyIdentityScopesItem]
    """Scopes this key holds. A read-write key lists both; an admin key always does."""


GetMeResponse = ApiKeyIdentity
"""Describe the calling key"""
