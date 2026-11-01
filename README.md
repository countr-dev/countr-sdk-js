# countr-sdk

Official JavaScript/TypeScript SDK for [Countr](https://countr.dev) — a usage enforcement API (rate limits, quotas and credits).

[![npm version](https://img.shields.io/npm/v/countr-sdk)](https://www.npmjs.com/package/countr-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is Countr?

Countr is a developer API for tracking usage and enforcing rate limits across your users and services. Define metrics, check and consume quota, and query current usage — all from a simple REST API.

This SDK is the official JavaScript/TypeScript client for the Countr API. It is designed for **server-side usage** in Node.js, Next.js, and other serverless runtimes.

---

## Installation

```bash
npm install countr-sdk
# or
pnpm add countr-sdk
# or
yarn add countr-sdk
```

**Requires Node.js 20.19.0+** (uses the built-in `fetch` API).

---

## Quickstart

```ts
import { CountrClient } from "countr-sdk";

const client = new CountrClient({
  apiKey: "ck_test_xxx",
});

// Check and consume quota
const result = await client.checkConsume({
  subject: "user_abc",     // who is performing the action
  metric: "api_calls",     // which metric to check
  cost: 1,                 // how much to consume
});

if (!result.allowed) {
  throw new Error("Rate limit exceeded");
}

// Get current usage
const usage = await client.getUsage({
  subject: "user_abc",
  metric: "api_calls",
});

console.log(`Used ${usage.current} of ${usage.limit ?? "unlimited"} calls`);
```

---

## `checkConsume()`

Check whether an action is allowed and consume quota at the same time.

**Endpoint:** `POST /v1/check-consume`

```ts
const result = await client.checkConsume({
  subject: "user_abc",   // string — identifies the actor
  metric: "api_calls",   // string — the metric to check
  cost: 1,               // number — how much to consume (positive integer)
});

// result: { allowed: boolean, remaining: number | null, reason: string | null }

if (result.allowed) {
  // proceed
} else {
  console.log("Blocked:", result.reason);
}
```

A denial is a normal result (`allowed: false`), not an exception. Requests are
denied when a subject limit, or your plan's per-second, per-minute or monthly
cap, is reached. There are no overages: every plan is denied at its monthly
cap. See [countr.dev/pricing](https://countr.dev/pricing) for plan limits.

### With idempotency key

Use an idempotency key to safely retry requests without double-consuming quota.

```ts
const result = await client.checkConsume(
  {
    subject: "user_abc",
    metric: "api_calls",
    cost: 1,
  },
  {
    idempotencyKey: "order-9f3a1c",  // unique key for this operation
  },
);
```

---

## `getUsage()`

Retrieve current usage for a subject and metric.

**Endpoint:** `GET /v1/usage?subject=...&metric=...`

```ts
const usage = await client.getUsage({
  subject: "user_abc",
  metric: "api_calls",
});

// usage: {
//   subject: string
//   metric: string
//   current: number
//   limit: number | null
//   remaining: number | null
//   window: "none" | "day" | "month"
// }

console.log(`${usage.current} / ${usage.limit ?? "∞"} (${usage.window})`);
```

---

## Error handling

All API and network errors are thrown as `CountrError` instances.

```ts
import { CountrClient, CountrError } from "countr-sdk";

const client = new CountrClient({ apiKey: "ck_test_xxx" });

try {
  const result = await client.checkConsume({
    subject: "user_abc",
    metric: "api_calls",
    cost: 1,
  });
} catch (err) {
  if (err instanceof CountrError) {
    console.error("Countr API error:", err.message);
    console.error("Status:", err.statusCode);   // e.g. 401, 503 (undefined for network errors)
    console.error("Code:", err.code);           // e.g. "network_error", "request_timeout"
  }
}
```

### `CountrError` properties

| Property     | Type                   | Description                                      |
|--------------|------------------------|--------------------------------------------------|
| `message`    | `string`               | Human-readable error description                 |
| `statusCode` | `number \| undefined`  | HTTP status code from the API, if applicable     |
| `code`       | `string \| undefined`  | Machine-readable error code                      |
| `cause`      | `unknown`              | Underlying error (network failure, parse error)  |

---

## Timeouts and fail-open

Countr sits on your request path, so decide what should happen if it is slow or
down.

- **Fail open (recommended for most apps):** allow the request if Countr cannot
  be reached. Your app stays available during an outage.
- **Fail closed (default in the SDK, use for strict enforcement):** throw, and
  let your code block the request.

```ts
const client = new CountrClient({
  apiKey: "ck_test_xxx",
  timeoutMs: 2000,   // default; requests are aborted after 2 seconds
  failOpen: true,    // default is false
});

const result = await client.checkConsume({
  subject: "user_abc",
  metric: "api_calls",
  cost: 1,
});

if (result.failedOpen) {
  // Countr was unreachable. Allowed by policy, not by a real check.
  console.warn("countr fail-open:", result.error?.code, result.error?.statusCode);
}

if (!result.allowed) {
  throw new Error("Rate limit exceeded");
}
```

Both options can be overridden per call, and the per-call value wins:

```ts
// Strict for this one operation, even though the client fails open:
await client.checkConsume(input, { failOpen: false, timeoutMs: 5000 });
```

A fail-open result is `{ allowed: true, remaining: null, reason: "fail_open",
failedOpen: true, error }`. `failedOpen` is only ever set by the SDK, never by
the API, so you can log or alert on it. `remaining: null` means unknown here.

**It fails open only on** network errors, timeouts (`request_timeout`) and HTTP
5xx (including the API's 503). **It never fails open on** 401, other 4xx
errors, explicit denials (`allowed: false`), malformed responses, invalid input,
or when you abort via `signal`. Those still throw or return as before.

Notes:

- `failOpen` applies to `checkConsume()` only. `getUsage()` honours `timeoutMs`
  but always throws on failure.
- The SDK does not retry. After a timeout, the request may or may not have been
  counted by Countr. If you retry yourself, reuse the same `idempotencyKey` so
  an allowed request is not counted twice.
- The 2000 ms default timeout is new. Earlier versions had no timeout; pass a
  larger `timeoutMs` if you need one.

---

## Client configuration

```ts
const client = new CountrClient({
  apiKey: "ck_test_xxx",   // required
  baseUrl: "https://api.countr.dev",  // optional — override for testing
  fetch: customFetch,          // optional — provide your own fetch
});
```

| Option    | Type                        | Default                     | Description                         |
|-----------|-----------------------------|-----------------------------|-------------------------------------|
| `apiKey`  | `string`                    | **required**                | Your Countr API key                 |
| `baseUrl` | `string`                    | `https://api.countr.dev`    | Override the API base URL           |
| `fetch`   | `typeof globalThis.fetch`   | `globalThis.fetch`          | Custom fetch implementation         |
| `timeoutMs` | `number`                  | `2000`                      | Abort a request after this many ms  |
| `failOpen`  | `boolean`                 | `false`                     | Allow instead of throwing when Countr is unreachable (see below) |

---

## Aborting requests

All methods accept an optional `signal` for request cancellation via `AbortController`.

```ts
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

const result = await client.checkConsume(
  { subject: "user_abc", metric: "api_calls", cost: 1 },
  { signal: controller.signal },
);
```

---

## TypeScript

Full TypeScript support is built in. All request/response types are exported:

```ts
import type {
  CountrClientConfig,
  CheckConsumeInput,
  CheckConsumeOptions,
  CheckConsumeResponse,
  GetUsageInput,
  GetUsageOptions,
  GetUsageResponse,
} from "countr-sdk";
```

---

## Server-side usage

This SDK is designed for **server-side** use cases:

- Node.js backends
- Next.js API routes and Server Actions
- Edge functions (Vercel Edge, Cloudflare Workers — ensure `fetch` is available)
- Other serverless runtimes

It relies on `fetch` being available globally (Node.js 20.19.0+) or passed explicitly via `config.fetch`.

---

## Publishing

This package publishes to npm as the unscoped public package `countr-sdk`.

```bash
npm run build       # compile to dist/ via tsup
npm pack            # optional — inspect the tarball contents
npm publish         # publish to npm (no --access flag needed; package is unscoped)
```

`prepublishOnly` runs the build automatically, so `npm publish` from a clean checkout is sufficient. Only the `dist/` directory (plus `package.json`, `README.md`, and `LICENSE`) is included in the published tarball.

---

## License

MIT — see [LICENSE](LICENSE).
