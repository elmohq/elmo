# Elmo Python SDK

Python SDK for the Elmo API.

## Installation

Install the SDK from PyPI. It needs Python 3.10 or later.

```sh
uv add elmohq-sdk
```

<details>
<summary>Other package managers</summary>

```sh
pip install elmohq-sdk
```

```sh
poetry add elmohq-sdk
```

```sh
pdm add elmohq-sdk
```

</details>

## Usage

Set `ELMO_API_KEY` in your environment, then call the API:

```python
from elmohq_sdk import Elmo

elmo = Elmo()
data = elmo.brands.list()
print(data)
```

The same call with `AsyncElmo`:

```python
import asyncio

from elmohq_sdk import AsyncElmo

async_elmo = AsyncElmo()


async def main() -> None:
    data = await async_elmo.brands.list()
    print(data)


asyncio.run(main())
```

## Authentication

Pass `api_key`, or set `ELMO_API_KEY` and pass nothing.

```python
from elmohq_sdk import Elmo

elmo = Elmo(api_key="…")
```

## Closing the client

This SDK opens a connection pool on its first call. A `with` block closes it on the way out. Where the client lives as long as the process, call `close()` when you shut it down. A client you passed as `http_client` is left open, since you own it.

```python
from elmohq_sdk import Elmo

with Elmo() as elmo:
    elmo.brands.list()
```

The same with `AsyncElmo`, which closes with `aclose()`:

```python
import asyncio

from elmohq_sdk import AsyncElmo


async def main() -> None:
    async with AsyncElmo() as async_elmo:
        await async_elmo.brands.list()


asyncio.run(main())
```

## Pagination

Iterate a paginated call to read every item. Each page is fetched when the loop reaches it.

```python
from elmohq_sdk import Elmo

elmo = Elmo()
for item in elmo.brands.list():
    print(item)
```

## Errors

When the API replies with an error status, a call raises `ApiError`, or a subclass named for the status. Every exception the SDK raises subclasses `ElmoError`. `data` is the body read as the model the API description gives it, or `None` where the body does not match. `error` holds the body as it arrived.

```python
from elmohq_sdk import ApiError, Elmo

elmo = Elmo()
try:
    elmo.brands.list()
except ApiError as error:
    print(error.status, error.data)
```

## Retries

The SDK retries a failed call up to 2 times. It retries after a connection error, a 408, 425 or 429 status, or most 5xx statuses. A `POST` or `PATCH` may already have changed something, so it is retried only after a 408, 425 or 429, unless the call sends the idempotency key the API description declares. Each wait is longer than the last, or as long as `Retry-After` asks. Set `max_retries` on the client or on one call:

```python
from elmohq_sdk import Elmo

elmo = Elmo(max_retries=5)
elmo.with_options(max_retries=0).brands.list()
```

## Timeouts

An attempt that runs longer than 60 seconds raises `TransportTimeoutError`. Set `timeout` in seconds on the client or on one call, or `False` for no limit:

```python
from elmohq_sdk import Elmo

elmo = Elmo(timeout=20)
elmo.with_options(timeout=5).brands.list()
```

## Logging

Logging is off until you set `log_level` or the `ELMO_LOG` environment variable. `"info"` logs each call and its reply, and `"debug"` adds headers, with credentials redacted. Records go to a logger under `elmohq_sdk`, which writes to standard error until the application configures logging. Pass `logger` to use your own.

```python
from elmohq_sdk import Elmo

elmo = Elmo(log_level="info")
```

## Requirements

- Python 3.10 or later
