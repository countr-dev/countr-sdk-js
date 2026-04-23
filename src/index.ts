/**
 * countr-sdk — Official JavaScript/TypeScript SDK for the Countr API.
 *
 * @example
 * ```ts
 * import { CountrClient } from "countr-sdk";
 *
 * const client = new CountrClient({ apiKey: "ck_usw_live_xxx" });
 *
 * const result = await client.checkConsume({
 *   subject: "user_abc",
 *   metric: "api_calls",
 *   cost: 1,
 * });
 * ```
 */

export { CountrClient } from "./client.js";
export { CountrError } from "./errors.js";
export type {
  CheckConsumeInput,
  CheckConsumeOptions,
  CheckConsumeResponse,
  CountrClientConfig,
  GetUsageInput,
  GetUsageOptions,
  GetUsageResponse,
} from "./types.js";
