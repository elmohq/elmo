from __future__ import annotations

from typing import Any, Mapping, cast

from .metadata import merge_metadata


MERGED_LAYERS = ("cookies", "path", "query")


def merge_configs(*sources: dict[str, Any] | None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for source in sources:
        if not source:
            continue
        merged.update(source)
    merged["headers"] = merge_metadata(
        *[source.get("headers") if source else None for source in sources]
    )
    for layer in MERGED_LAYERS:
        combined: dict[str, Any] = {}
        found = False
        for source in sources:
            named = source.get(layer) if source else None
            if isinstance(named, dict):
                combined.update(cast(dict[str, Any], named))
                found = True
        if found:
            merged[layer] = combined
    return merged


def create_config(**overrides: Any) -> dict[str, Any]:
    return merge_configs({"headers": {}}, overrides)


def base_url_of(options: dict[str, Any], fallback: str | None = None) -> str | None:
    stated: str | None = options.get("base_url")
    if stated is not None:
        return stated
    environment = options.get("environment")
    if environment is not None:
        environments: Mapping[str, str] = options.get("environments") or {}
        named: str | None = environments.get(environment)
        if named is not None:
            return named
    return fallback
