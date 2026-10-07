from __future__ import annotations

from logging import Logger
from typing import Any, TypedDict

from .._internal.core.types import (
    AsyncAuthValue,
    AsyncCredentialValue,
    AuthScheme,
    AuthValue,
    CredentialValue,
    RetryValue,
    TimeoutValue,
)
from .._internal.features.interceptors import Interceptors
from .._internal.features.logger import LogLevel


API_KEY_REQUIREMENTS = [AuthScheme(type="http", key="api_key", scheme="bearer")]


class RequestOptions(TypedDict, total=False):
    """What one call may set for itself, overriding the client it goes through."""

    api_key: CredentialValue
    """An instance admin key from `ADMIN_API_KEYS`, or an organization key
    (`elmo_…`) issued from the dashboard.

    Read from the `ELMO_API_KEY` environment variable when unset.
    """
    auth: AuthValue
    """Decides each credential a call sends, given the scheme and the value its
    option holds. What it returns is sent, so return the value to keep it.
    `False` sends no credential.
    """
    base_url: str
    """The base URL for this call, in place of the client's."""
    body: Any
    """The request body, before it is encoded."""
    headers: dict[str, str]
    """Headers to send. Merged per name, and `None` drops one."""
    interceptors: Interceptors
    """Run your own hooks around every call. Each is a sequence of callables,
    which the awaited client also waits for.

    `request` reads the request after the credentials are on it and before
    it is sent. `response` and `error` each return what the caller reads, so
    a hook that only observes returns what it was given.
    """
    log_level: LogLevel
    """Set the log level. Raise it to see what each call sent and what came
    back. `'debug'` adds headers, with credentials hidden.

    Read from the `ELMO_LOG` environment variable when unset.

    Defaults to `'off'`.
    """
    logger: Logger
    """Set the logger. This SDK's own `logging.Logger` by default, which writes
    to standard error unless the application has given it a handler of its
    own.
    """
    max_retries: int
    """The maximum number of times a failed call is sent again.

    A shorthand for `retry: { attempts: max_retries + 1 }`. It counts
    attempts and nothing else: a call that may already have been acted on is
    sent again only after 408, 425 or 429, or where it carries its API's
    idempotency key. `retry.methods` widens that.

    Defaults to `2`.
    """
    path: dict[str, Any]
    """Path parameters. Merged per name."""
    query: dict[str, Any]
    """Query parameters to add. Merged per name, and `None` drops one."""
    retry: RetryValue
    """How a failed call is retried, or `False` to send it once. A call whose
    body is a stream is always sent once.

    Defaults to `{ attempts: 3 }`.
    """
    timeout: TimeoutValue
    """The maximum time one attempt may run.

    Set `False` or `0` for no limit, or a function that takes the operation
    as `METHOD /path` and returns its limit.

    Defaults to `60`.

    The unit is seconds.
    """


class AsyncRequestOptions(TypedDict, total=False):
    """What one call may set for itself, overriding the client it goes through."""

    api_key: AsyncCredentialValue
    """An instance admin key from `ADMIN_API_KEYS`, or an organization key
    (`elmo_…`) issued from the dashboard.

    Read from the `ELMO_API_KEY` environment variable when unset.
    """
    auth: AsyncAuthValue
    """Decides each credential a call sends, given the scheme and the value its
    option holds. What it returns is sent, so return the value to keep it.
    `False` sends no credential.
    """
    base_url: str
    """The base URL for this call, in place of the client's."""
    body: Any
    """The request body, before it is encoded."""
    headers: dict[str, str]
    """Headers to send. Merged per name, and `None` drops one."""
    interceptors: Interceptors
    """Run your own hooks around every call. Each is a sequence of callables,
    which the awaited client also waits for.

    `request` reads the request after the credentials are on it and before
    it is sent. `response` and `error` each return what the caller reads, so
    a hook that only observes returns what it was given.
    """
    log_level: LogLevel
    """Set the log level. Raise it to see what each call sent and what came
    back. `'debug'` adds headers, with credentials hidden.

    Read from the `ELMO_LOG` environment variable when unset.

    Defaults to `'off'`.
    """
    logger: Logger
    """Set the logger. This SDK's own `logging.Logger` by default, which writes
    to standard error unless the application has given it a handler of its
    own.
    """
    max_retries: int
    """The maximum number of times a failed call is sent again.

    A shorthand for `retry: { attempts: max_retries + 1 }`. It counts
    attempts and nothing else: a call that may already have been acted on is
    sent again only after 408, 425 or 429, or where it carries its API's
    idempotency key. `retry.methods` widens that.

    Defaults to `2`.
    """
    path: dict[str, Any]
    """Path parameters. Merged per name."""
    query: dict[str, Any]
    """Query parameters to add. Merged per name, and `None` drops one."""
    retry: RetryValue
    """How a failed call is retried, or `False` to send it once. A call whose
    body is a stream is always sent once.

    Defaults to `{ attempts: 3 }`.
    """
    timeout: TimeoutValue
    """The maximum time one attempt may run.

    Set `False` or `0` for no limit, or a function that takes the operation
    as `METHOD /path` and returns its limit.

    Defaults to `60`.

    The unit is seconds.
    """
