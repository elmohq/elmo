from __future__ import annotations

from typing import Any

from .errors import UnsupportedInteractionError, UnsupportedProtocolError
from .types import Binding, Interaction


PROTOCOL_FOR = {
    "clientStream": "rest",
    "duplex": "websocket",
    "publish": "channel",
    "serverStream": "rest",
    "subscribe": "channel",
    "unary": "rest",
}


def protocol_of(interaction: Interaction) -> str:
    protocol = PROTOCOL_FOR.get(interaction)
    if protocol is None:
        raise UnsupportedInteractionError("this client", interaction)
    return protocol


def resolve_protocol(
    protocols: dict[str, Any], interaction: Interaction
) -> tuple[Binding, Any]:
    protocol = protocol_of(interaction)
    setup = protocols.get(protocol)
    if setup is None:
        raise UnsupportedProtocolError(protocol, interaction)
    return setup["binding"], setup["transport"]


TRANSPORT_METHOD = {
    "clientStream": "client_stream",
    "duplex": "duplex",
    "publish": "publish",
    "serverStream": "server_stream",
    "subscribe": "subscribe",
    "unary": "unary",
}


def transport_method(interaction: Interaction) -> str:
    return TRANSPORT_METHOD.get(interaction, interaction)
