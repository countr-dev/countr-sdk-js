// ---------------------------------------------------------------------------
// Public types for the Countr SDK
// ---------------------------------------------------------------------------

/**
 * Configuration options for CountrClient.
 */
export interface CountrClientConfig {
  /** Your Countr API key (e.g. `ck_usw_live_xxx`). Required. */
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
  /** The cost of this operation (must be a non-negative number). */
  cost: number;
}

/** Optional per-call options for `checkConsume`. */
export interface CheckConsumeOptions {
  /**
   * An idempotency key to prevent duplicate consumption on retries.
   * Sent as the `Idempotency-Key` request header.
   */
  idempotencyKey?: string;
  /** An AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

/** Response returned by `checkConsume`. */
export interface CheckConsumeResponse {
  /** Whether the operation is allowed. */
  allowed: boolean;
  /** Remaining quota after this consumption, or `null` if unlimited. */
  remaining: number | null;
  /** Human-readable reason for the decision, or `null`. */
  reason: string | null;
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
