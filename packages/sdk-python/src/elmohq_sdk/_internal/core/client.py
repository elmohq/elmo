from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from .dispatch import DispatchSetup, async_dispatch, dispatch, prepare, resolve_options
from .protocol import resolve_protocol
from .types import OperationDescriptor, PreparedRequest, Result


@dataclass
class ClientBase:
    setup: DispatchSetup

    def prepare(
        self, operation: OperationDescriptor, options: dict[str, Any] | None = None
    ) -> PreparedRequest:
        """The request a call would send, built but not sent.

        Awaits nothing, so a credential function or `auth` that returns an
        awaitable raises `TypeError` here.

        """

        return prepare(self.setup, operation, options)

    def resolve_address(
        self, operation: OperationDescriptor, options: dict[str, Any] | None = None
    ) -> Any:
        """The address a call would go to, without sending anything."""

        binding, _ = resolve_protocol(self.setup.protocols, operation.interaction)
        return binding.resolve_address(operation, resolve_options(self.setup, options))


@dataclass
class Client(ClientBase):
    def call(
        self, operation: OperationDescriptor, options: dict[str, Any] | None = None
    ) -> Any:
        """Sends a call and reads the reply."""

        return dispatch(self.setup, operation, options)

    def exchange(
        self, operation: OperationDescriptor, options: dict[str, Any] | None = None
    ) -> Result:
        """Sends a call and hands back the whole reply, status and headers included."""

        return cast(Result, dispatch(self.setup, operation, options, envelope=True))


def create_client(setup: DispatchSetup) -> Client:
    return Client(setup=setup)


@dataclass
class AsyncClient(ClientBase):
    async def call(
        self, operation: OperationDescriptor, options: dict[str, Any] | None = None
    ) -> Any:
        """Sends a call and reads the reply."""

        return await async_dispatch(self.setup, operation, options)

    async def exchange(
        self, operation: OperationDescriptor, options: dict[str, Any] | None = None
    ) -> Result:
        """Sends a call and hands back the whole reply, status and headers included."""

        return cast(
            Result, await async_dispatch(self.setup, operation, options, envelope=True)
        )


def create_async_client(setup: DispatchSetup) -> AsyncClient:
    return AsyncClient(setup=setup)
