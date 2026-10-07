# Elmo TypeScript SDK

TypeScript SDK for the Elmo API.

## Installation

Install the SDK from npm. It needs Node.js 20.19 or later.

```sh
npm install @elmohq/sdk
```

<details>
<summary>Other package managers</summary>

```sh
pnpm add @elmohq/sdk
```

```sh
yarn add @elmohq/sdk
```

```sh
bun add @elmohq/sdk
```

```sh
deno add npm:@elmohq/sdk
```

```sh
nub add @elmohq/sdk
```

```sh
vlt install @elmohq/sdk
```

```sh
aube add @elmohq/sdk
```

</details>

## Usage

Set `ELMO_API_KEY` in your environment, then call the API:

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo();
const data = await elmo.brands.list();
console.log(data);
```

Each call is also a function in `@elmohq/sdk/calls`, so a bundle keeps only the calls you import.

```ts
import { createElmoClient } from '@elmohq/sdk';
import { brandsList } from '@elmohq/sdk/calls';

const client = createElmoClient();
await brandsList(client);
```

## Authentication

Pass `apiKey`, or set `ELMO_API_KEY` and pass nothing.

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo({ apiKey: '…' });
```

## Pagination

Iterate a paginated call to read every item. Each page is fetched when the loop reaches it.

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo();
for await (const item of elmo.brands.list()) {
  console.log(item);
}
```

## Errors

When the API replies with an error status, a call throws `ApiError`, or a subclass named for the status. Every error the SDK throws extends `ElmoError`.

```ts
import { ApiError, Elmo } from '@elmohq/sdk';

const elmo = new Elmo();
try {
  await elmo.brands.list();
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.status, error.error);
  } else {
    throw error;
  }
}
```

Call `.result()` to read the failure without catching it. It resolves with `ok: false` and the `error`.

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo();
const result = await elmo.brands.list().result();
if (!result.ok) {
  console.log(result.error);
}
```

## Retries

The SDK retries a failed call up to 2 times. It retries after a connection error, a 408, 425 or 429 status, or most 5xx statuses. A `POST` or `PATCH` may already have changed something, so it is retried only after a 408, 425 or 429, unless the call sends the idempotency key the API description declares. Each wait is longer than the last, or as long as `Retry-After` asks. Set `maxRetries` on the client or on one call:

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo({ maxRetries: 5 });
await elmo.withOptions({ maxRetries: 0 }).brands.list();
```

## Timeouts

An attempt that runs longer than 60 seconds throws `TimeoutError`. Set `timeout` in milliseconds on the client or on one call, or `false` for no limit:

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo({ timeout: 20000 });
await elmo.withOptions({ timeout: 5000 }).brands.list();
```

## Logging

Logging is off until you set `logLevel` or the `ELMO_LOG` environment variable. `'info'` logs each call and its reply, and `'debug'` adds headers, with credentials redacted. Logs go to `console` unless you pass a `logger`.

```ts
import { Elmo } from '@elmohq/sdk';

const elmo = new Elmo({ logLevel: 'info' });
```

## Requirements

- Node.js 20.19 or later
- TypeScript 5.5 or later, for its types, and 5.8 or later to `require()` it from CommonJS
