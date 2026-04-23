/**
 * Quickstart example for countr-sdk
 *
 * This file demonstrates the main SDK features.
 * It uses a custom fetch mock so it can run without a real API key.
 *
 * To run against the real API:
 *   export COUNTR_API_KEY=ck_usw_live_xxx
 *   npx tsx examples/quickstart.ts
 */

import { CountrClient, CountrError } from "../src/index.js";

// ---------------------------------------------------------------------------
// Mock fetch for demonstration purposes (remove when using a real API key)
// ---------------------------------------------------------------------------
const mockFetch: typeof globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();

  if (url.includes("/v1/check-consume")) {
    return new Response(
      JSON.stringify({ allowed: true, remaining: 99, reason: null }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (url.includes("/v1/usage")) {
    return new Response(
      JSON.stringify({
        subject: "user_abc",
        metric: "api_calls",
        current: 1,
        limit: 100,
        remaining: 99,
        window: "day",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ message: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
};

// ---------------------------------------------------------------------------
// Create client
// ---------------------------------------------------------------------------
const client = new CountrClient({
  apiKey: process.env["COUNTR_API_KEY"] ?? "ck_demo_key",
  fetch: process.env["COUNTR_API_KEY"] ? undefined : mockFetch,
});

// ---------------------------------------------------------------------------
// checkConsume example
// ---------------------------------------------------------------------------
async function runCheckConsume() {
  console.log("\n--- checkConsume ---");

  const result = await client.checkConsume({
    subject: "user_abc",
    metric: "api_calls",
    cost: 1,
  });

  console.log("allowed:", result.allowed);
  console.log("remaining:", result.remaining);
  console.log("reason:", result.reason);
}

// ---------------------------------------------------------------------------
// checkConsume with idempotency key
// ---------------------------------------------------------------------------
async function runCheckConsumeIdempotent() {
  console.log("\n--- checkConsume with idempotency key ---");

  const result = await client.checkConsume(
    { subject: "user_abc", metric: "api_calls", cost: 1 },
    { idempotencyKey: "order-9f3a1" },
  );

  console.log("allowed:", result.allowed);
}

// ---------------------------------------------------------------------------
// getUsage example
// ---------------------------------------------------------------------------
async function runGetUsage() {
  console.log("\n--- getUsage ---");

  const usage = await client.getUsage({
    subject: "user_abc",
    metric: "api_calls",
  });

  console.log(`current: ${usage.current}`);
  console.log(`limit: ${usage.limit ?? "unlimited"}`);
  console.log(`remaining: ${usage.remaining ?? "unlimited"}`);
  console.log(`window: ${usage.window}`);
}

// ---------------------------------------------------------------------------
// Error handling example
// ---------------------------------------------------------------------------
async function runErrorHandling() {
  console.log("\n--- error handling ---");

  const errorClient = new CountrClient({
    apiKey: "ck_demo_key",
    fetch: async () =>
      new Response(
        JSON.stringify({ message: "Rate limit exceeded", code: "rate_limited" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
  });

  try {
    await errorClient.checkConsume({
      subject: "user_abc",
      metric: "api_calls",
      cost: 1,
    });
  } catch (err) {
    if (err instanceof CountrError) {
      console.log("Caught CountrError:");
      console.log("  message:", err.message);
      console.log("  statusCode:", err.statusCode);
      console.log("  code:", err.code);
    }
  }
}

// ---------------------------------------------------------------------------
// Run all examples
// ---------------------------------------------------------------------------
(async () => {
  try {
    await runCheckConsume();
    await runCheckConsumeIdempotent();
    await runGetUsage();
    await runErrorHandling();
    console.log("\n✓ All examples completed successfully.");
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }
})();
