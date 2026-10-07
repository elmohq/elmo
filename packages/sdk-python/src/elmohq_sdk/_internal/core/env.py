from __future__ import annotations

import os
from typing import Any, Mapping

from .types import CredentialSpec


def implied_environment(*_held: Any) -> str | None:
    return None


def read_env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def read_defaults(
    env: Mapping[str, str], credentials: Mapping[str, CredentialSpec]
) -> dict[str, Any]:
    read: dict[str, Any] = {}
    for option, variable in env.items():
        value = read_env(variable)
        if value is not None:
            read[option] = value
    held: dict[str, str | None] = {}
    for name, spec in credentials.items():
        if spec.variable and spec.option:
            held[name] = read_env(spec.variable)
    read.update({name: token for name, token in held.items() if token is not None})

    environment = implied_environment(held, credentials)
    if environment is not None:
        read["environment"] = environment
    return read


def with_implied_environment(
    options: dict[str, Any], *_credentials: Any
) -> dict[str, Any]:
    return options
