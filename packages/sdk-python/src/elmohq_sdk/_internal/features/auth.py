from __future__ import annotations

import inspect
from typing import Any, Callable, Iterator, Mapping, Sequence

from ..core.errors import MissingCredentialError
from ..core.features import Feature
from ..core.types import (
    AuthRequirement,
    AuthScheme,
    AuthToken,
    Credential,
    CredentialSpec,
    FeatureContext,
    PlacedCredential,
    PreparedRequest,
)


def _labeled(name: str, specs: Mapping[str, CredentialSpec]) -> str:
    spec = specs.get(name)
    variable = spec.variable if spec else None
    return f"`{name}` (`{variable}`)" if variable else f"`{name}`"


def _conjoined(names: list[str], specs: Mapping[str, CredentialSpec]) -> str:
    return " and ".join(_labeled(name, specs) for name in names)


def _either(alternatives: list[str]) -> str:
    if len(alternatives) <= 2:
        return " or ".join(alternatives)
    return f"{', '.join(alternatives[:-1])}, or {alternatives[-1]}"


def _advice(offered: list[list[str]], specs: Mapping[str, CredentialSpec]) -> str:
    if not offered:
        return ""
    alternatives = [_conjoined(keys, specs) for keys in offered]
    if len(alternatives) > 1 and any(len(keys) > 1 for keys in offered):
        return " Either " + ", or ".join(f"set {one}" for one in alternatives) + "."
    return f" Set {_either(alternatives)}."


def _asked_as(scheme: AuthScheme) -> Any:
    return scheme.key if scheme.key is not None else id(scheme)


def schemes_of(requirement: AuthRequirement) -> Sequence[AuthScheme]:
    return [requirement] if isinstance(requirement, AuthScheme) else requirement


def _candidates(request: PreparedRequest, *_specs: Any) -> list[Sequence[AuthScheme]]:
    return [schemes_of(one) for one in request.operation.auth or []]


def _keys_of(offered: list[list[str]]) -> list[str]:
    seen: dict[str, None] = {}
    for keys in offered:
        for key in keys:
            seen[key] = None
    return list(seen)


def _offered(declared: Sequence[AuthRequirement]) -> list[list[str]]:
    named = [[s.key for s in schemes_of(one) if s.key is not None] for one in declared]
    return [keys for keys in named if keys]


def _ruled_out(*_ruling: Any) -> Iterator[AuthScheme]:
    return iter(())


def _wanted(
    request: PreparedRequest,
    alternatives: Sequence[Sequence[AuthScheme]],
    asked: dict[Any, AuthToken],
) -> Iterator[AuthScheme]:
    if request.options.get("auth") is False:
        return
    for schemes in alternatives:
        for scheme in schemes:
            key = _asked_as(scheme)
            if key not in asked:
                yield scheme
            if not asked[key]:
                break
        else:
            return


async def _awaited(value: Any) -> AuthToken:
    token: AuthToken = await value if inspect.isawaitable(value) else value
    return token


def _stated(
    scheme: AuthScheme,
    options: Mapping[str, Any],
    schemes: Mapping[str, CredentialSpec],
) -> Any:
    if scheme.key is None:
        return None
    spec = schemes.get(scheme.key)
    if spec is not None and not spec.option:
        return None
    return options.get(scheme.key)


async def async_token_for(
    scheme: AuthScheme,
    options: Mapping[str, Any],
    schemes: Mapping[str, CredentialSpec],
) -> AuthToken:
    """The same, on the client that waits for an answer."""

    stated = _stated(scheme, options, schemes)
    value = await _awaited(stated()) if callable(stated) else stated
    auth = options.get("auth")
    return await _awaited(auth(scheme, value)) if callable(auth) else value


def _format_bearer(token: str) -> str:
    return f"Bearer {token}"


SchemeFormat = Callable[[str], str]


SCHEME_FORMATS: dict[str, SchemeFormat] = {"bearer": _format_bearer}


def format_token(
    scheme: AuthScheme, token: AuthToken, prefix: str | None = None
) -> AuthToken:
    if not token:
        return None
    if prefix is not None:
        return f"{prefix}{token}"
    write = SCHEME_FORMATS.get(scheme.scheme) if scheme.scheme else None
    return write(token) if write else token


def credential_for(
    scheme: AuthScheme, token: AuthToken, schemes: Mapping[str, CredentialSpec]
) -> Credential | None:
    """What one scheme sends, given the token it was answered with."""

    spec = schemes.get(scheme.key) if scheme.key else None
    value = format_token(scheme, token, spec.prefix if spec else None)
    if not value:
        return None
    return Credential(location=scheme.location, name=scheme.name, value=value)


def _settled(value: Any, source: str) -> AuthToken:
    if inspect.isawaitable(value):
        if inspect.iscoroutine(value):
            value.close()
        raise TypeError(
            f"{source} returned an awaitable. Only the async client waits for one."
        )
    token: AuthToken = value
    return token


def token_for(
    scheme: AuthScheme,
    options: Mapping[str, Any],
    schemes: Mapping[str, CredentialSpec],
) -> AuthToken:
    """The credential for one scheme: its option, then what `auth` makes of it."""

    stated = _stated(scheme, options, schemes)
    value = (
        _settled(stated(), f"The function passed as `{scheme.key}`")
        if callable(stated)
        else stated
    )
    auth = options.get("auth")
    return _settled(auth(scheme, value), "`auth`") if callable(auth) else value


class AuthFeature(Feature):
    name = "auth"

    def __init__(self, schemes: Mapping[str, CredentialSpec] | None = None) -> None:
        self.schemes: dict[str, CredentialSpec] = dict(schemes or {})

    def on_prepare(self, request: PreparedRequest, ctx: FeatureContext) -> None:
        declared = request.operation.auth
        if not declared:
            return
        asked: dict[Any, AuthToken] = {}
        alternatives = _candidates(request, self.schemes)
        for scheme in _wanted(request, alternatives, asked):
            asked[_asked_as(scheme)] = token_for(scheme, request.options, self.schemes)
        if self._placed(request, ctx, alternatives, asked):
            return
        for scheme in _ruled_out(request, alternatives, asked, self.schemes):
            asked[_asked_as(scheme)] = token_for(scheme, request.options, self.schemes)
        self._refuse(request)

    async def on_async_prepare(
        self, request: PreparedRequest, ctx: FeatureContext
    ) -> None:
        declared = request.operation.auth
        if not declared:
            return
        asked: dict[Any, AuthToken] = {}
        alternatives = _candidates(request, self.schemes)
        for scheme in _wanted(request, alternatives, asked):
            token = await async_token_for(scheme, request.options, self.schemes)
            asked[_asked_as(scheme)] = token
        if self._placed(request, ctx, alternatives, asked):
            return
        for scheme in _ruled_out(request, alternatives, asked, self.schemes):
            token = await async_token_for(scheme, request.options, self.schemes)
            asked[_asked_as(scheme)] = token
        self._refuse(request)

    def _placed(
        self,
        request: PreparedRequest,
        ctx: FeatureContext,
        alternatives: Sequence[Sequence[AuthScheme]],
        asked: Mapping[Any, AuthToken],
    ) -> bool:
        if request.options.get("auth") is False:
            return False
        for schemes in alternatives:
            placed = self._credentials_for(schemes, asked)
            if placed is None:
                continue
            for entry in placed:
                ctx.binding.apply_auth(entry.credential, request)
            request.placed = placed
            return True
        return False

    def _refuse(self, request: PreparedRequest) -> None:
        if request.options.get("auth") is False or request.operation.auth_optional:
            return
        offered = _offered(request.operation.auth or [])
        raise MissingCredentialError(
            f"This call needs a credential that was not set.{_advice(offered, self.schemes)}",
            _keys_of(offered),
        )

    def _credentials_for(
        self, schemes: Sequence[AuthScheme], asked: Mapping[Any, AuthToken]
    ) -> list[PlacedCredential] | None:
        placed: list[PlacedCredential] = []
        for scheme in schemes:
            token = asked.get(_asked_as(scheme))
            credential = credential_for(scheme, token, self.schemes)
            if credential is None:
                return None
            placed.append(PlacedCredential(credential=credential, scheme=scheme))
        return placed
