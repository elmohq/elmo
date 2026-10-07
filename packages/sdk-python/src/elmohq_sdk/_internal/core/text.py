from __future__ import annotations

from datetime import date, time
from enum import Enum
from typing import Any


def to_text(value: Any) -> str:
    if isinstance(value, Enum):
        value = value.value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (date, time)):
        return value.isoformat()
    return value if isinstance(value, str) else str(value)
