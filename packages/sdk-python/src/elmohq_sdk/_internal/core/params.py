from __future__ import annotations

import functools
from typing import Any, Mapping

from .missing import MISSING


def group_params(fields: list[dict[str, Any]], /, **values: Any) -> dict[str, Any]:
    named = {field["key"]: field for field in fields}
    grouped: dict[str, Any] = {}

    for key, value in values.items():
        if value is MISSING:
            continue
        field = named.get(key)
        if field is None:
            grouped[key] = value
            continue
        if field.get("whole"):
            grouped["body"] = value
            continue
        slot = grouped.setdefault(field["in"], {})
        slot[field.get("map") or key] = value
    return grouped


LAYERS = ("cookies", "headers", "path", "query")


def merge_params(inputs: dict[str, Any], options: Mapping[str, Any]) -> dict[str, Any]:
    merged = {**inputs, **options}
    for layer in LAYERS:
        named = inputs.get(layer)
        given = options.get(layer)
        if isinstance(named, dict) and isinstance(given, dict):
            merged[layer] = {**named, **given}
    return merged


@functools.lru_cache(maxsize=None)
def input_adapter(shape: Any) -> Any:
    from pydantic import TypeAdapter

    return TypeAdapter(shape)


def validate_input(shape: Any, value: Any) -> Any:
    """Validates each dict in `value` into the model `shape` names there.

    A model passes through as it is. A dict that does not fit its model
    raises `pydantic.ValidationError`, as the model's own constructor does.

    """

    if value is MISSING or value is None:
        return value
    return input_adapter(shape).validate_python(value)
