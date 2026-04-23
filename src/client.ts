import { CountrError } from "./errors.js";
import { request } from "./http.js";
import type {
  CheckConsumeInput,
  CheckConsumeOptions,
  CheckConsumeResponse,
  CountrClientConfig,
  GetUsageInput,
  GetUsageOptions,
  GetUsageResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.countr.dev";

// ---------------------------------------------------------------------------
// Runtime response validators
// ---------------------------------------------------------------------------

function isNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function validateCheckConsumeResponse(data: unknown): CheckConsumeResponse {
  const r = data as Record<string, unknown>;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof r.allowed !== "boolean" ||
    !isNumberOrNull(r.remaining) ||
    !isStringOrNull(r.reason)
  ) {
    throw new CountrError(
      "Unexpected response shape from /v1/check-consume.",
      { code: "invalid_response" },
    );
  }
  return data as CheckConsumeResponse;
}

const VALID_WINDOWS = new Set<GetUsageResponse["window"]>(["none", "day", "month"]);

function validateGetUsageResponse(data: unknown): GetUsageResponse {
  const r = data as Record<string, unknown>;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof r.subject !== "string" ||
    typeof r.metric !== "string" ||
    typeof r.current !== "number" || !Number.isFinite(r.current) ||
    !isNumberOrNull(r.limit) ||
    !isNumberOrNull(r.remaining) ||
    !VALID_WINDOWS.has(r.window as GetUsageResponse["window"])
  ) {
    throw new CountrError(
      "Unexpected response shape from /v1/usage.",
      { code: "invalid_response" },
    );
  }
  return data as GetUsageResponse;
}

/**
 * The official Countr API client.
 *
 * @example
 * ```ts
 * import { CountrClient } from "@countr/sdk";
 *
 * const client = new CountrClient({ apiKey: "ck_usw_live_xxx" });
 * ```
 */
export class CountrClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: CountrClientConfig) {
    if (!config.apiKey || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
      throw new CountrError("A valid API key is required.", {
        code: "missing_api_key",
      });
    }

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new CountrError(
        "No fetch implementation found. " +
          "Please upgrade to Node.js 20+ or pass a custom fetch via `config.fetch`.",
        { code: "missing_fetch" },
      );
    }

    if (config.baseUrl !== undefined) {
      if (typeof config.baseUrl !== "string" || !config.baseUrl.trim()) {
        throw new CountrError(
          "config.baseUrl must be a non-empty string when provided.",
          { code: "invalid_config" },
        );
      }
    }

    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl?.trim() ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = fetchImpl;
  }

  // ---------------------------------------------------------------------------
  // checkConsume
  // ---------------------------------------------------------------------------

  /**
   * Checks whether an action is allowed and consumes quota if so.
   *
   * @example
   * ```ts
   * const result = await client.checkConsume({
   *   subject: "user_abc",
   *   metric: "api_calls",
   *   cost: 1,
   * });
   *
   * if (!result.allowed) {
   *   throw new Error("Rate limit exceeded");
   * }
   * ```
   */
  async checkConsume(
    input: CheckConsumeInput,
    options?: CheckConsumeOptions,
  ): Promise<CheckConsumeResponse> {
    this.validateCheckConsumeInput(input);

    const extraHeaders: Record<string, string> = {};
    if (options?.idempotencyKey !== undefined) {
      if (
        typeof options.idempotencyKey !== "string" ||
        !options.idempotencyKey.trim()
      ) {
        throw new CountrError(
          "`idempotencyKey` must be a non-empty string when provided.",
          { code: "invalid_input" },
        );
      }
      extraHeaders["Idempotency-Key"] = options.idempotencyKey.trim();
    }

    return request<CheckConsumeResponse>({
      method: "POST",
      url: `${this.baseUrl}/v1/check-consume`,
      apiKey: this.apiKey,
      body: {
        subject: input.subject,
        metric: input.metric,
        cost: input.cost,
      },
      headers: extraHeaders,
      signal: options?.signal,
      fetchImpl: this.fetchImpl,
      validate: validateCheckConsumeResponse,
    });
  }

  // ---------------------------------------------------------------------------
  // getUsage
  // ---------------------------------------------------------------------------

  /**
   * Retrieves current usage information for a subject and metric.
   *
   * @example
   * ```ts
   * const usage = await client.getUsage({
   *   subject: "user_abc",
   *   metric: "api_calls",
   * });
   *
   * console.log(`Used ${usage.current} of ${usage.limit ?? "unlimited"}`);
   * ```
   */
  async getUsage(
    input: GetUsageInput,
    options?: GetUsageOptions,
  ): Promise<GetUsageResponse> {
    this.validateGetUsageInput(input);

    const params = new URLSearchParams({
      subject: input.subject,
      metric: input.metric,
    });

    return request<GetUsageResponse>({
      method: "GET",
      url: `${this.baseUrl}/v1/usage?${params.toString()}`,
      apiKey: this.apiKey,
      signal: options?.signal,
      fetchImpl: this.fetchImpl,
      validate: validateGetUsageResponse,
    });
  }

  // ---------------------------------------------------------------------------
  // Private validation helpers
  // ---------------------------------------------------------------------------

  private validateCheckConsumeInput(input: CheckConsumeInput): void {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new CountrError("`input` must be a non-null object.", {
        code: "invalid_input",
      });
    }
    if (
      !input.subject ||
      typeof input.subject !== "string" ||
      !input.subject.trim()
    ) {
      throw new CountrError("`subject` must be a non-empty string.", {
        code: "invalid_input",
      });
    }
    if (
      !input.metric ||
      typeof input.metric !== "string" ||
      !input.metric.trim()
    ) {
      throw new CountrError("`metric` must be a non-empty string.", {
        code: "invalid_input",
      });
    }
    if (typeof input.cost !== "number" || input.cost < 0 || !isFinite(input.cost)) {
      throw new CountrError("`cost` must be a non-negative finite number.", {
        code: "invalid_input",
      });
    }
  }

  private validateGetUsageInput(input: GetUsageInput): void {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new CountrError("`input` must be a non-null object.", {
        code: "invalid_input",
      });
    }
    if (
      !input.subject ||
      typeof input.subject !== "string" ||
      !input.subject.trim()
    ) {
      throw new CountrError("`subject` must be a non-empty string.", {
        code: "invalid_input",
      });
    }
    if (
      !input.metric ||
      typeof input.metric !== "string" ||
      !input.metric.trim()
    ) {
      throw new CountrError("`metric` must be a non-empty string.", {
        code: "invalid_input",
      });
    }
  }
}
