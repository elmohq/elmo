from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import random
import re
from typing import Any, Mapping


@dataclass(frozen=True)
class RetryAfterHeader:
    name: str
    """Header name, matched case-insensitively."""
    kind: str = "duration"
    """Whether a number counts forward from now, or names a moment."""
    unit: str = "second"
    """What a number in this header counts in."""


RETRY_AFTER_HEADERS: list[RetryAfterHeader] = [
    RetryAfterHeader(name="retry-after-ms", unit="millisecond"),
    RetryAfterHeader(name="retry-after"),
    RetryAfterHeader(name="x-ratelimit-reset-after"),
    RetryAfterHeader(name="x-ratelimit-reset", kind="moment"),
    RetryAfterHeader(name="x-rate-limit-reset", kind="moment"),
]


_ASCTIME = re.compile(
    r"[a-z]{3} ([a-z]{3}) +(\d\d?) (\d\d:\d\d:\d\d) (\d{4})", re.IGNORECASE
)


_MOMENT = re.compile(
    r"(?:(\d{4})-(\d\d)-(\d\d)[t ]|(?:[a-z]+, ?)?(\d\d?)[ -]([a-z]{3})[ -](\d\d|\d{4}) )(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3})\d*)?)? ?(z|gmt|utc?|[+-](?:[01]\d|2[0-3]):?[0-5]\d)",
    re.IGNORECASE,
)


_MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec"


def _moment(value: str) -> float | None:
    text = value.strip()
    asctime = _ASCTIME.fullmatch(text)
    match = _MOMENT.fullmatch(asctime.expand(r"\2 \1 \4 \3 GMT") if asctime else text)
    if match is None:
        return None
    groups = match.groups()
    iso_year, iso_month, iso_day, day, name, year = groups[:6]
    hour, minute, second, ms, zone = groups[6:]
    index = _MONTHS.find((name or "").lower())
    if not iso_month and index % 3:
        return None
    full = int(year or iso_year)
    if len(year or "") == 2:
        full += 2000 if full < 50 else 1900
    try:
        stated = datetime(
            full,
            int(iso_month) if iso_month else index // 3 + 1,
            int(day or iso_day),
            int(hour),
            int(minute),
            int(second or 0),
            int((ms or "").ljust(3, "0")) * 1000,
            tzinfo=timezone.utc,
        )
    except ValueError:
        return None
    digits = zone.replace(":", "")
    offset = int(digits[1:3]) * 3600 + int(digits[3:]) * 60 if len(digits) == 5 else 0
    return stated.timestamp() - (-offset if digits[0] == "-" else offset)


def parse_retry_after(
    value: str | None,
    header: RetryAfterHeader = RetryAfterHeader(name="retry-after"),
    now: float = 0.0,
) -> float | None:
    if not value:
        return None
    try:
        number = float(value)
    except ValueError:
        stated = _moment(value)
        return None if stated is None else max(0.0, stated - now)
    seconds = number / 1000 if header.unit == "millisecond" else number
    return max(0.0, seconds - now if header.kind == "moment" else seconds)


def retry_after_delay(
    response: Any, headers: list[RetryAfterHeader] | None = None, now: float = 0.0
) -> float | None:
    meta: Mapping[str, str] = getattr(response, "headers", None) or {}
    sent = _moment(meta.get("date") or "")
    clock = now if sent is None else sent

    for header in headers if headers is not None else RETRY_AFTER_HEADERS:
        delay = parse_retry_after(meta.get(header.name), header, clock)
        if delay is not None:
            return delay
    return None


BACKOFF_DELAY = 0.5


BACKOFF_MAX_DELAY = 30.0


MAX_RETRY_AFTER = 60.0


def exceeds_max_retry_after(
    delay: float | None, max_delay: float = MAX_RETRY_AFTER
) -> bool:
    return delay is not None and delay > max_delay


def backoff_delay(
    retry: int,
    delay: float = BACKOFF_DELAY,
    max_delay: float = BACKOFF_MAX_DELAY,
    jitter: bool = True,
    strategy: str = "exponential",
) -> float:
    growth = delay if strategy == "constant" else delay * 2**retry
    capped = min(growth, max_delay)
    return random.random() * capped if jitter else capped
