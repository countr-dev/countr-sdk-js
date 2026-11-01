import type { CountrError } from "./errors.js";

// ---------------------------------------------------------------------------
// Public types for the Countr SDK
// ---------------------------------------------------------------------------

/**
 * Configuration options for CountrClient.
 */
export interface CountrClientConfig {
  /** Your Countr API key (e.g. `ck_test_xxx`). Required. */
  apiKey: string;
  /**
   * Override the base URL. Defaults to `https://api.countr.dev`.
   * Useful for testing or self-hosted deployments.
   */
  baseUrl?: string;
  /**
   * Provide a custom `fetch` implementation. Defaults to `globalThis.fetch`.
   * Useful in environments where `fetch` is not available globally.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Abort a request after this many milliseconds. Must be a positive finite
   * number. Defaults to `2000`. Can be overridden per call.
   * A timeout throws a `CountrError` with code `request_timeout`.
   */
  timeoutMs?: number;
  /**
   * Default for `checkConsume`: when Countr cannot be reached (network error,
   * timeout or HTTP 5xx), resolve with an allowed result marked
   * `failedOpen: true` instead of throwing. Never applies to 401, other 4xx
   * errors, explicit denials or caller aborts. Defaults to `false`
   * (fail closed: errors are thrown). Can be overridden per call.
   */
  failOpen?: boolean;
}

// ---------------------------------------------------------------------------
// checkConsume
// ---------------------------------------------------------------------------

/** Input for the `checkConsume` method. */
export interface CheckConsumeInput {
  /** A unique identifier for the subject being checked (e.g. user ID). */
  subject: string;
  /** The metric name to check (e.g. `"api_calls"`). */
  metric: string;
  /** The cost of this operation (a positive integer; the API rejects 0 and non-integers). */
  cost: number;
}

/** Optional per-call options for `checkConsume`. */
export interface CheckConsumeOptions {
  /**
   * An idempotency key to prevent duplicate consumption on retries.
   * Sent as the `Idempotency-Key` request header.
   */
  idempotencyKey?: string;
  /** An AbortSignal to cancel the request. Aborting never fails open. */
  signal?: AbortSignal;
  /** Overrides `CountrClientConfig.timeoutMs` for this call. */
  timeoutMs?: number;
  /** Overrides `CountrClientConfig.failOpen` for this call. */
  failOpen?: boolean;
}

/** Response returned by `checkConsume`. */
export interface CheckConsumeResponse {
  /** Whether the operation is allowed. */
  allowed: boolean;
  /** Remaining quota after this consumption, or `null` if unlimited. */
  remaining: number | null;
  /** Human-readable reason for the decision, or `null`. */
  reason: string | null;
  /**
   * Present and `true` only when the result was synthesised by the SDK
   * because Countr could not be reached and `failOpen` was enabled.
   * Real API responses never set it. In that case `allowed` is `true`,
   * `remaining` is `null` (unknown), `reason` is `"fail_open"`, and nothing
   * is known about whether quota was consumed.
   */
  failedOpen?: true;
  /** The error that triggered the fail-open result. Set with `failedOpen`. */
  error?: CountrError;
}

// ---------------------------------------------------------------------------
// getUsage
// ---------------------------------------------------------------------------

/** Input for the `getUsage` method. */
export interface GetUsageInput {
  /** A unique identifier for the subject being queried. */
  subject: string;
  /** The metric name to query. */
  metric: string;
}

/** Optional per-call options for `getUsage`. */
export interface GetUsageOptions {
  /** An AbortSignal to cancel the request. */
  signal?: AbortSignal;
  /** Overrides `CountrClientConfig.timeoutMs` for this call. */
  timeoutMs?: number;
}

/** Response returned by `getUsage`. */
export interface GetUsageResponse {
  subject: string;
  metric: string;
  /** The current usage value. */
  current: number;
  /** The configured limit, or `null` if unlimited. */
  limit: number | null;
  /** Remaining quota, or `null` if unlimited. */
  remaining: number | null;
  /** The reset window for this metric. */
  window: "none" | "day" | "month";
}
