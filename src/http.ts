import { CountrError } from "./errors.js";

/** Largest delay `setTimeout` supports (2^31 - 1 ms). */
const MAX_TIMER_MS = 2_147_483_647;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Extracts `code` and `message` from an error response body.
 * Prefers the API's shape `{ error: { code, message } }`, falls back to the
 * legacy top-level `{ code, message }`, then to generic defaults (e.g. for
 * non-JSON or empty bodies). Each field falls back independently.
 */
function parseErrorBody(
  json: unknown,
  status: number,
): { message: string; code: string } {
  const nested = isRecord(json) && isRecord(json.error) ? json.error : undefined;
  const top = isRecord(json) ? json : undefined;
  const pick = (key: "code" | "message"): string | undefined => {
    for (const src of [nested, top]) {
      const v = src?.[key];
      if (typeof v === "string" && v.trim()) return v;
    }
    return undefined;
  };
  return {
    message: pick("message") ?? `API request failed with status ${status}.`,
    code: pick("code") ?? "api_error",
  };
}

/** @internal */
export interface RequestOptions<T = unknown> {
  method: "GET" | "POST";
  url: string;
  apiKey: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Abort the request (including reading the body) after this many ms. */
  timeoutMs?: number;
  fetchImpl: typeof globalThis.fetch;
  /**
   * Optional runtime validator called with the parsed response body on
   * success. Should throw a `CountrError` if the shape is unexpected.
   */
  validate?: (data: unknown) => T;
}

/**
 * Executes an HTTP request and returns the parsed JSON response.
 * Throws a `CountrError` for non-2xx responses, JSON parse failures, or
 * responses that fail the optional `validate` check.
 *
 * @internal
 */
export async function request<T>(opts: RequestOptions<T>): Promise<T> {
  const headers = new Headers({
    Authorization: `Bearer ${opts.apiKey}`,
    Accept: "application/json",
  });

  if (opts.headers !== undefined) {
    for (const [key, value] of Object.entries(opts.headers)) {
      headers.set(key, value);
    }
  }

  if (opts.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Combine the caller's signal with an optional timeout. `timedOut` lets us
  // tell a timeout apart from a caller-initiated abort.
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onCallerAbort = () => controller.abort();

  if (opts.signal?.aborted) {
    controller.abort();
  } else {
    opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  }
  if (opts.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.min(opts.timeoutMs, MAX_TIMER_MS));
  }

  // Rejects when the controller aborts, so a custom `fetch` that ignores the
  // signal still cannot hang us past the timeout.
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => {
      reject(
        timedOut
          ? new CountrError(`Request timed out after ${opts.timeoutMs}ms.`, {
              code: "request_timeout",
            })
          : new CountrError("Request was aborted.", { code: "request_aborted" }),
      );
    };
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener("abort", fail, { once: true });
  });
  aborted.catch(() => undefined); // avoid unhandled rejection if never raced

  try {
    return await run(controller.signal, aborted);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }

  async function run(
    signal: AbortSignal,
    abortedPromise: Promise<never>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await Promise.race([
        opts.fetchImpl(opts.url, {
          method: opts.method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal,
        }),
        abortedPromise,
      ]);
    } catch (err) {
      if (err instanceof CountrError) throw err;
      if (timedOut) {
        throw new CountrError(`Request timed out after ${opts.timeoutMs}ms.`, {
          code: "request_timeout",
          cause: err,
        });
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new CountrError("Request was aborted.", {
          code: "request_aborted",
          cause: err,
        });
      }
      throw new CountrError("Network request failed.", {
        code: "network_error",
        cause: err,
      });
    }

    // Only attempt JSON parsing when the response carries a JSON content type
    // and has a body (i.e. is not a 204 No Content). This prevents spurious
    // "invalid_response" errors when the API or a gateway returns an empty or
    // non-JSON body (e.g. HTML error pages from proxies).
    let json: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const isJsonResponse =
      mediaType === "application/json" || mediaType.endsWith("+json");
    if (response.status !== 204 && isJsonResponse) {
      try {
        json = await Promise.race([response.json(), abortedPromise]);
      } catch (err) {
        if (err instanceof CountrError && err.code === "request_timeout") throw err;
        if (err instanceof CountrError && err.code === "request_aborted") throw err;
        throw new CountrError(
          `Failed to parse API response (status ${response.status}).`,
          {
            statusCode: response.status,
            code: "invalid_response",
            cause: err,
          },
        );
      }
    }

    if (!response.ok) {
      const { message, code } = parseErrorBody(json, response.status);
      throw new CountrError(message, {
        statusCode: response.status,
        code,
      });
    }

    if (opts.validate) {
      try {
        return opts.validate(json);
      } catch (err) {
        if (err instanceof CountrError) {
          // Enrich with the HTTP status code if the validator didn't set one.
          if (err.statusCode === undefined) {
            throw new CountrError(err.message, {
              statusCode: response.status,
              code: err.code,
              cause: err,
            });
          }
          throw err;
        }
        throw new CountrError("API response did not match expected shape.", {
          statusCode: response.status,
          code: "invalid_response",
          cause: err,
        });
      }
    }

    if (json === undefined) {
      throw new CountrError(
        `Expected a JSON response body (status ${response.status}).`,
        {
          statusCode: response.status,
          code: "invalid_response",
        },
      );
    }

    return json as T;
  }
}
