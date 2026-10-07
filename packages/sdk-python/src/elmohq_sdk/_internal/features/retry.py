from __future__ import annotations

from dataclasses import dataclass, replace
import time
from typing import Any, Sequence, cast

from ..core.backoff import (
    BACKOFF_DELAY,
    BACKOFF_MAX_DELAY,
    MAX_RETRY_AFTER,
    RetryAfterHeader,
    backoff_delay,
    exceeds_max_retry_after,
    retry_after_delay,
)
from ..core.errors import DecodeError, TransportError
from ..core.features import Feature
from ..core.types import (
    AsyncSend,
    FeatureContext,
    PreparedRequest,
    Result,
    RetryRules,
    Send,
)


@dataclass(frozen=True)
class _Rules:
    attempts: int
    delay: float
    jitter: bool
    max_delay: float
    max_retry_after: float
    methods: Sequence[str] | None
    retry_after: Sequence[RetryAfterHeader] | None
    retry_on_timeout: bool
    statuses: Sequence[int] | None
    strategy: str


def _attempts(stated: _Rules, own: RetryRules | None, request: PreparedRequest) -> int:
    if own is not None and "attempts" in own:
        return own["attempts"]
    retries = request.options.get("max_retries")
    if isinstance(retries, int) and not isinstance(retries, bool):
        return max(0, retries) + 1
    return stated.attempts


def _asked_for(rules: _Rules, result: Result) -> float | None:
    if result.response is None:
        return None
    headers = None if rules.retry_after is None else list(rules.retry_after)
    return retry_after_delay(result.response, headers, now=time.time())


def _backoff(rules: _Rules, attempt: int) -> float:
    return backoff_delay(
        attempt, rules.delay, rules.max_delay, rules.jitter, rules.strategy
    )


PERMANENT_STATUSES: list[int] = [501, 505, 506, 508, 510, 511]


REFUSED_STATUSES: list[int] = [408, 425, 429]


RETRY_HEADER = "x-should-retry"


def _worth_repeating(rules: _Rules, result: Result, repeatable: bool) -> bool:
    response = result.response
    if response is None:
        return False
    status = response.status_code
    if not repeatable and status not in REFUSED_STATUSES:
        return False
    if response.headers.get(RETRY_HEADER) == "false":
        return False
    if rules.statuses is not None:
        return status in rules.statuses
    if status >= 500:
        return status not in PERMANENT_STATUSES
    return status in REFUSED_STATUSES


def _delay_after(
    rules: _Rules, result: Result, repeatable: bool, attempt: int, last: bool
) -> float | None:
    if last or not _worth_repeating(rules, result, repeatable):
        return None
    asked = _asked_for(rules, result)
    if exceeds_max_retry_after(asked, rules.max_retry_after):
        return None
    if asked is not None:
        return asked
    return _backoff(rules, attempt)


def _worth_repeating_error(
    rules: _Rules, error: BaseException, repeatable: bool
) -> bool:
    if isinstance(error, TransportError):
        if error.kind == "connect":
            return True
        if error.kind == "timeout":
            return repeatable and rules.retry_on_timeout
        return repeatable
    return repeatable and isinstance(error, DecodeError)


def _delay_after_error(
    rules: _Rules, error: BaseException, repeatable: bool, attempt: int, last: bool
) -> float | None:
    if last or not _worth_repeating_error(rules, error, repeatable):
        return None
    return _backoff(rules, attempt)


def _log_retry(
    request: PreparedRequest, wait: float, attempt: int, attempts: int, after: Result
) -> None:
    log = getattr(request, "log", None)
    if log is not None:
        log.retrying(wait, attempt + 1, attempts - 1, after)


def _merged(rules: _Rules, stated: RetryRules) -> _Rules:
    fields = _Rules.__dataclass_fields__
    changes: dict[str, Any] = {}
    for name, value in stated.items():
        if name in fields:
            changes[name] = value
    headers = changes.get("retry_after")
    if isinstance(headers, bool):
        changes["retry_after"] = None if headers else []
    return replace(rules, **changes)


IDEMPOTENT_METHODS: list[str] = ["delete", "get", "head", "options", "put", "trace"]


def _repeatable(rules: _Rules, request: PreparedRequest) -> bool:
    method = (request.operation.method or "").lower()
    if not method:
        return False
    allowed = IDEMPOTENT_METHODS
    if rules.methods is not None:
        allowed = [name.lower() for name in rules.methods]
    if method in allowed:
        return True
    key = request.operation.idempotency
    return key is not None and request.meta.get(key) is not None


class RetryFeature(Feature):
    name = "retry"

    def __init__(
        self,
        attempts: int = 3,
        delay: float = BACKOFF_DELAY,
        jitter: bool = True,
        max_delay: float = BACKOFF_MAX_DELAY,
        max_retry_after: float = MAX_RETRY_AFTER,
        methods: list[str] | None = None,
        retry_after: list[RetryAfterHeader] | None = None,
        retry_on_timeout: bool = False,
        statuses: list[int] | None = None,
        strategy: str = "exponential",
    ) -> None:
        self.rules = _Rules(
            attempts=attempts,
            delay=delay,
            jitter=jitter,
            max_delay=max_delay,
            max_retry_after=max_retry_after,
            methods=methods,
            retry_after=retry_after,
            retry_on_timeout=retry_on_timeout,
            statuses=statuses,
            strategy=strategy,
        )

    def on_send(
        self, request: PreparedRequest, send: Send, ctx: FeatureContext
    ) -> Result:
        rules = self._resolve(request)
        if rules is None:
            return send(request)
        repeatable = _repeatable(rules, request)
        attempt = 0

        while True:
            last = attempt >= rules.attempts - 1
            try:
                result = send(request)
                wait = _delay_after(rules, result, repeatable, attempt, last)
                if wait is None:
                    return result
            except Exception as error:
                wait = _delay_after_error(rules, error, repeatable, attempt, last)
                if wait is None:
                    raise
                result = Result(error=error)
            _log_retry(request, wait, attempt, rules.attempts, result)
            time.sleep(wait)
            attempt += 1

    async def on_async_send(
        self, request: PreparedRequest, send: AsyncSend, ctx: FeatureContext
    ) -> Result:
        rules = self._resolve(request)
        if rules is None:
            return await send(request)
        repeatable = _repeatable(rules, request)
        attempt = 0

        while True:
            last = attempt >= rules.attempts - 1
            try:
                result = await send(request)
                wait = _delay_after(rules, result, repeatable, attempt, last)
                if wait is None:
                    return result
            except Exception as error:
                wait = _delay_after_error(rules, error, repeatable, attempt, last)
                if wait is None:
                    raise
                result = Result(error=error)
            _log_retry(request, wait, attempt, rules.attempts, result)
            import asyncio

            await asyncio.sleep(wait)
            attempt += 1

    def _resolve(self, request: PreparedRequest) -> _Rules | None:
        called = request.options.get("retry")
        if called is False:
            return None
        declared = request.operation.retry
        if declared is False and called is None:
            return None
        stated = _merged(self.rules, declared) if declared else self.rules
        own = cast(RetryRules, called) if isinstance(called, dict) else None
        rules = stated if own is None else _merged(stated, own)
        attempts = _attempts(stated, own, request)
        return None if attempts <= 1 else replace(rules, attempts=attempts)
