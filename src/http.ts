import { CountrError } from "./errors.js";

/** @internal */
export interface RequestOptions<T = unknown> {
  method: "GET" | "POST";
  url: string;
  apiKey: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
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
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    Accept: "application/json",
    ...opts.headers,
  };

  if (opts.body !== undefined && headers["Content-Type"] === undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await opts.fetchImpl(opts.url, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
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
      json = await response.json();
    } catch (err) {
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
    const body = json as Record<string, unknown> | null;
    const message =
      typeof body?.message === "string"
        ? body.message
        : `API request failed with status ${response.status}.`;
    const code =
      typeof body?.code === "string" ? body.code : "api_error";
    throw new CountrError(message, {
      statusCode: response.status,
      code,
    });
  }

  if (opts.validate) {
    try {
      return opts.validate(json);
    } catch (err) {
      if (err instanceof CountrError) throw err;
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
