# Elmo Python SDK

Python client for the [Elmo API](https://www.elmohq.com/docs/api). The package in `src/elmohq_sdk` is generated from the OpenAPI document by [Fern](https://buildwithfern.com); run `pnpm generate:sdk` from the repository root to regenerate it.

## Installation

```sh
pip install elmohq-sdk
```

## Usage

Every Elmo deployment serves its own API, so pass its base URL along with an API key. Organization owners and admins issue keys under **Settings → API Keys**.

```python
import datetime as dt

from elmohq_sdk import Elmo

elmo = Elmo(
    base_url="https://elmo.example.com/api/v1",
    token="YOUR_API_KEY",
)

brands = elmo.brands.list_brands().data

analytics = elmo.analytics.get_brand_analytics(
    brands[0].id,
    start=dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc),
    end=dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc),
)
print(analytics.visibility, analytics.share_of_voice)
```

`AsyncElmo` takes the same arguments, and its methods are coroutines:

```python
from elmohq_sdk import AsyncElmo

elmo = AsyncElmo(base_url="https://elmo.example.com/api/v1", token="YOUR_API_KEY")
brands = (await elmo.brands.list_brands()).data
```

## Errors

A non-2xx response raises an `ApiError` (or a subclass for a documented status, such as `NotFoundError`).

```python
from elmohq_sdk.core.api_error import ApiError

try:
    elmo.brands.get_brand("acme")
except ApiError as error:
    print(error.status_code, error.body)
```

## Retries and timeouts

Failed requests are retried twice by default, and time out after 60 seconds. Both can be set for the client or for one request:

```python
elmo = Elmo(base_url=base_url, token=token, max_retries=0, timeout=30)

elmo.opportunities.get_brand_opportunities("acme", request_options={"timeout": 600})
```
