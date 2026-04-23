# @countr/sdk

Official JavaScript/TypeScript SDK for [Countr](https://countr.dev) — a usage tracking and rate-limiting API.

[![npm version](https://img.shields.io/npm/v/@countr/sdk)](https://www.npmjs.com/package/@countr/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is Countr?

Countr is a developer API for tracking usage and enforcing rate limits across your users and services. Define metrics, check and consume quota, and query current usage — all from a simple REST API.

This SDK is the official JavaScript/TypeScript client for the Countr API. It is designed for **server-side usage** in Node.js, Next.js, and other serverless runtimes.

---

## Installation

```bash
npm install @countr/sdk
# or
pnpm add @countr/sdk
# or
yarn add @countr/sdk
```

**Requires Node.js 20.19.0+** (uses the built-in `fetch` API).

---

## Quickstart

```ts
import { CountrClient } from "@countr/sdk";

const client = new CountrClient({
  apiKey: "ck_usw_live_xxx",
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
  cost: 1,               // number — how much to consume (>= 0)
});

// result: { allowed: boolean, remaining: number | null, reason: string | null }

if (result.allowed) {
  // proceed
} else {
  console.log("Blocked:", result.reason);
}
```

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
import { CountrClient, CountrError } from "@countr/sdk";

const client = new CountrClient({ apiKey: "ck_usw_live_xxx" });

try {
  const result = await client.checkConsume({
    subject: "user_abc",
    metric: "api_calls",
    cost: 1,
  });
} catch (err) {
  if (err instanceof CountrError) {
    console.error("Countr API error:", err.message);
    console.error("Status:", err.statusCode);   // e.g. 429
    console.error("Code:", err.code);           // e.g. "rate_limited"
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

## Client configuration

```ts
const client = new CountrClient({
  apiKey: "ck_usw_live_xxx",   // required
  baseUrl: "https://api.countr.dev",  // optional — override for testing
  fetch: customFetch,          // optional — provide your own fetch
});
```

| Option    | Type                        | Default                     | Description                         |
|-----------|-----------------------------|-----------------------------|-------------------------------------|
| `apiKey`  | `string`                    | **required**                | Your Countr API key                 |
| `baseUrl` | `string`                    | `https://api.countr.dev`    | Override the API base URL           |
| `fetch`   | `typeof globalThis.fetch`   | `globalThis.fetch`          | Custom fetch implementation         |

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
} from "@countr/sdk";
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

## License

MIT — see [LICENSE](LICENSE).
