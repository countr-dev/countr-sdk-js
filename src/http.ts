import { CountrError } from "./errors.js";

/** @internal */
export interface RequestOptions {
  method: "GET" | "POST";
  url: string;
  apiKey: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl: typeof globalThis.fetch;
}

/**
 * Executes an HTTP request and returns the parsed JSON response.
 * Throws a `CountrError` for non-2xx responses or JSON parse failures.
 *
 * @internal
 */
export async function request<T>(opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...opts.headers,
  };

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

  let json: unknown;
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

  return json as T;
}
