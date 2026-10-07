# Elmo TypeScript SDK

TypeScript client for the [Elmo API](https://www.elmohq.com/docs/api). The client in `src/` is generated from the OpenAPI document by [Fern](https://buildwithfern.com); run `pnpm generate:sdk` from the repository root to regenerate it.

## Installation

```sh
npm install @elmohq/sdk
```

## Usage

Every Elmo deployment serves its own API, so pass its base URL along with an API key. Organization owners and admins issue keys under **Settings → API Keys**.

```ts
import { ElmoClient } from "@elmohq/sdk";

const elmo = new ElmoClient({
	baseUrl: "https://elmo.example.com/api/v1",
	token: "YOUR_API_KEY",
});

const { data: brands } = await elmo.brands.listBrands();

const analytics = await elmo.analytics.getBrandAnalytics({
	brandId: brands[0].id,
	start: "2026-09-01T00:00:00Z",
	end: "2026-10-01T00:00:00Z",
});
console.log(analytics.visibility, analytics.shareOfVoice);
```

Request and response types are exported under the `Elmo` namespace:

```ts
import type { Elmo } from "@elmohq/sdk";

const request: Elmo.ListBrandsRequest = { page: 2, limit: 50 };
```

## Errors

A non-2xx response throws an `ElmoError` (or a subclass for a documented status, such as `Elmo.NotFoundError`). A timeout throws `ElmoTimeoutError`.

```ts
import { ElmoError } from "@elmohq/sdk";

try {
	await elmo.brands.getBrand({ brandId: "acme" });
} catch (error) {
	if (error instanceof ElmoError) {
		console.log(error.statusCode, error.body);
	}
}
```

## Retries and timeouts

Failed requests are retried twice by default, and time out after 60 seconds. Both can be set for the client or for one request:

```ts
const elmo = new ElmoClient({ baseUrl, token, maxRetries: 0, timeoutInSeconds: 30 });

await elmo.opportunities.getBrandOpportunities({ brandId: "acme" }, { timeoutInSeconds: 600 });
```
