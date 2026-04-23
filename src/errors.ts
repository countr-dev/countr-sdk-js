/**
 * Base error class for all errors thrown by the Countr SDK.
 *
 * @example
 * ```ts
 * import { CountrError } from "@countr/sdk";
 *
 * try {
 *   await client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 });
 * } catch (err) {
 *   if (err instanceof CountrError) {
 *     console.error(err.message, err.statusCode, err.code);
 *   }
 * }
 * ```
 */
export class CountrError extends Error {
  /** HTTP status code from the API response, if applicable. */
  readonly statusCode: number | undefined;
  /**
   * A short machine-readable error code.
   * May be returned by the API or set by the SDK itself.
   */
  readonly code: string | undefined;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "CountrError";
    this.statusCode = options?.statusCode;
    this.code = options?.code;

    // Maintain proper prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
