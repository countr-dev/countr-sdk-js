import { describe, it, expect, vi, beforeEach } from "vitest";
import { CountrClient } from "../src/client.js";
import { CountrError } from "../src/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeaders(contentType = "application/json") {
  return { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) };
}

function makeFetch(
  status: number,
  body: unknown,
  ok?: boolean,
  contentType = "application/json",
): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: ok ?? (status >= 200 && status < 300),
    status,
    headers: makeHeaders(contentType),
    json: () => Promise.resolve(body),
  }) as unknown as typeof globalThis.fetch;
}

function makeFailingFetch(error: Error): typeof globalThis.fetch {
  return vi.fn().mockRejectedValue(error) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// CountrClient construction
// ---------------------------------------------------------------------------

describe("CountrClient construction", () => {
  it("throws if apiKey is missing", () => {
    expect(
      () => new CountrClient({ apiKey: "", fetch: makeFetch(200, {}) }),
    ).toThrow(CountrError);
  });

  it("throws if apiKey is whitespace-only", () => {
    expect(
      () => new CountrClient({ apiKey: "   ", fetch: makeFetch(200, {}) }),
    ).toThrow(CountrError);
  });

  it("throws if fetch is unavailable and none is supplied", () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = undefined as unknown as typeof globalThis.fetch;
    try {
      expect(() => new CountrClient({ apiKey: "ck_test" })).toThrow(CountrError);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("accepts a custom baseUrl", () => {
    const client = new CountrClient({
      apiKey: "ck_test",
      baseUrl: "http://localhost:3000/",
      fetch: makeFetch(200, {}),
    });
    expect(client).toBeInstanceOf(CountrClient);
  });

  it("throws if baseUrl is an empty string", () => {
    expect(
      () =>
        new CountrClient({
          apiKey: "ck_test",
          baseUrl: "",
          fetch: makeFetch(200, {}),
        }),
    ).toThrow(CountrError);
  });

  it("throws if baseUrl is a whitespace-only string", () => {
    expect(
      () =>
        new CountrClient({
          apiKey: "ck_test",
          baseUrl: "   ",
          fetch: makeFetch(200, {}),
        }),
    ).toThrow(CountrError);
  });

  it("trims leading/trailing whitespace from baseUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ allowed: true, remaining: null, reason: null }),
    });
    const client = new CountrClient({
      apiKey: "ck_test",
      baseUrl: "  http://localhost:3000  ",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    await client.checkConsume({ subject: "user_1", metric: "calls", cost: 1 });
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/v1/check-consume");
  });

  it("strips multiple trailing slashes from baseUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ allowed: true, remaining: null, reason: null }),
    });
    const client = new CountrClient({
      apiKey: "ck_test",
      baseUrl: "http://localhost:3000///",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    await client.checkConsume({ subject: "user_1", metric: "calls", cost: 1 });
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).not.toContain("//v1");
    expect(url).toContain("http://localhost:3000/v1/check-consume");
  });
});

// ---------------------------------------------------------------------------
// checkConsume
// ---------------------------------------------------------------------------

describe("checkConsume", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: CountrClient;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ allowed: true, remaining: 99, reason: null }),
    });
    client = new CountrClient({
      apiKey: "ck_test",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
  });

  it("returns a CheckConsumeResponse on success", async () => {
    const result = await client.checkConsume({
      subject: "user_1",
      metric: "api_calls",
      cost: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(result.reason).toBeNull();
  });

  it("sends a POST to /v1/check-consume", async () => {
    await client.checkConsume({
      subject: "user_1",
      metric: "api_calls",
      cost: 1,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/check-consume");
    expect(init.method).toBe("POST");
  });

  it("sends Authorization header", async () => {
    await client.checkConsume({
      subject: "user_1",
      metric: "api_calls",
      cost: 1,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer ck_test");
  });

  it("sends Idempotency-Key when provided", async () => {
    await client.checkConsume(
      { subject: "user_1", metric: "api_calls", cost: 1 },
      { idempotencyKey: "idem-123" },
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBe("idem-123");
  });

  it("does not send Idempotency-Key when not provided", async () => {
    await client.checkConsume({
      subject: "user_1",
      metric: "api_calls",
      cost: 1,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBeNull();
  });

  it("throws CountrError on invalid input – missing subject", async () => {
    await expect(
      client.checkConsume({ subject: "", metric: "api_calls", cost: 1 }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid input – whitespace-only subject", async () => {
    await expect(
      client.checkConsume({ subject: "   ", metric: "api_calls", cost: 1 }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid input – whitespace-only metric", async () => {
    await expect(
      client.checkConsume({ subject: "user_1", metric: "   ", cost: 1 }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid input – null input", async () => {
    await expect(
      // @ts-expect-error testing JS null input
      client.checkConsume(null),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid idempotencyKey – empty string", async () => {
    await expect(
      client.checkConsume(
        { subject: "user_1", metric: "api_calls", cost: 1 },
        { idempotencyKey: "" },
      ),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid idempotencyKey – whitespace-only", async () => {
    await expect(
      client.checkConsume(
        { subject: "user_1", metric: "api_calls", cost: 1 },
        { idempotencyKey: "   " },
      ),
    ).rejects.toThrow(CountrError);
  });

  it("trims idempotencyKey before sending", async () => {
    await client.checkConsume(
      { subject: "user_1", metric: "api_calls", cost: 1 },
      { idempotencyKey: "  idem-abc  " },
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBe("idem-abc");
  });

  it("trims subject and metric in the request body", async () => {
    await client.checkConsume({
      subject: "  user_1  ",
      metric: "  api_calls  ",
      cost: 1,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.subject).toBe("user_1");
    expect(body.metric).toBe("api_calls");
  });

  it("sets Content-Type on POST and is accessible case-insensitively via Headers object", async () => {
    await client.checkConsume({ subject: "u", metric: "m", cost: 1 });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    // Headers normalizes header names — get() is case-insensitive
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("throws CountrError on invalid input – negative cost", async () => {
    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: -5 }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError for non-2xx JSON response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ message: "Rate limit exceeded", code: "rate_limited" }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({
      name: "CountrError",
      statusCode: 429,
      code: "rate_limited",
    });
  });

  it("throws CountrError with default message for non-2xx non-JSON response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      headers: makeHeaders("text/html"),
      json: () => Promise.reject(new SyntaxError("not json")),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({
      name: "CountrError",
      statusCode: 503,
      code: "api_error",
      message: "API request failed with status 503.",
    });
  });

  it("parses application/problem+json error bodies", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      headers: makeHeaders("application/problem+json"),
      json: () =>
        Promise.resolve({ message: "Too many requests", code: "rate_limited" }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({
      name: "CountrError",
      statusCode: 429,
      code: "rate_limited",
      message: "Too many requests",
    });
  });

  it("throws CountrError with default message for non-2xx empty body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: makeHeaders(),
      json: () => Promise.resolve(null),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", statusCode: 500 });
  });

  it("throws CountrError for invalid response shape", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => Promise.resolve({ unexpected: "shape" }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError when `remaining` is wrong type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ allowed: true, remaining: "a lot", reason: null }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError when `reason` is wrong type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ allowed: true, remaining: 99, reason: 42 }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError when `remaining` is NaN", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ allowed: true, remaining: NaN, reason: null }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("includes statusCode from HTTP response when validate throws without one", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => Promise.resolve({ allowed: "yes", remaining: null, reason: null }),
    });

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({
      name: "CountrError",
      code: "invalid_response",
      statusCode: 200,
    });
  });

  it("throws CountrError on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", code: "network_error" });
  });

  it("throws CountrError on abort", async () => {
    const abortError = new Error("The user aborted a request.");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValue(abortError);

    await expect(
      client.checkConsume({ subject: "user_1", metric: "api_calls", cost: 1 }),
    ).rejects.toMatchObject({ name: "CountrError", code: "request_aborted" });
  });
});

// ---------------------------------------------------------------------------
// getUsage
// ---------------------------------------------------------------------------

describe("getUsage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: CountrClient;

  const usageBody = {
    subject: "user_1",
    metric: "api_calls",
    current: 5,
    limit: 100,
    remaining: 95,
    window: "day",
  };

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => Promise.resolve(usageBody),
    });
    client = new CountrClient({
      apiKey: "ck_test",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
  });

  it("returns a GetUsageResponse on success", async () => {
    const result = await client.getUsage({
      subject: "user_1",
      metric: "api_calls",
    });

    expect(result).toEqual(usageBody);
  });

  it("sends a GET to /v1/usage with query params", async () => {
    await client.getUsage({ subject: "user_1", metric: "api_calls" });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/usage");
    expect(url).toContain("subject=user_1");
    expect(url).toContain("metric=api_calls");
    expect(init.method).toBe("GET");
  });

  it("sends Authorization header", async () => {
    await client.getUsage({ subject: "user_1", metric: "api_calls" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer ck_test");
  });

  it("does not send Content-Type header on GET requests", async () => {
    await client.getUsage({ subject: "user_1", metric: "api_calls" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("trims subject and metric in query params", async () => {
    await client.getUsage({ subject: "  user_1  ", metric: "  api_calls  " });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("subject=user_1");
    expect(url).toContain("metric=api_calls");
    expect(url).not.toContain("subject=+user_1");
    expect(url).not.toContain("metric=+api_calls");
  });

  it("throws CountrError when 2xx response has non-JSON content type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders("text/plain"),
      json: () => Promise.resolve(usageBody),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError on invalid input – missing metric", async () => {
    await expect(
      client.getUsage({ subject: "user_1", metric: "" }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid input – whitespace-only subject", async () => {
    await expect(
      client.getUsage({ subject: "   ", metric: "api_calls" }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid input – whitespace-only metric", async () => {
    await expect(
      client.getUsage({ subject: "user_1", metric: "   " }),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError on invalid input – null input", async () => {
    await expect(
      // @ts-expect-error testing JS null input
      client.getUsage(null),
    ).rejects.toThrow(CountrError);
  });

  it("throws CountrError for non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ message: "Not found", code: "not_found" }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({
      name: "CountrError",
      statusCode: 404,
      code: "not_found",
    });
  });

  it("throws CountrError for invalid response shape", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => Promise.resolve({ subject: "user_1" }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError when `window` is invalid value", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({
          subject: "user_1",
          metric: "api_calls",
          current: 5,
          limit: 100,
          remaining: 95,
          window: "week",
        }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError when `limit` is wrong type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({
          subject: "user_1",
          metric: "api_calls",
          current: 5,
          limit: "unlimited",
          remaining: 95,
          window: "day",
        }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("includes statusCode from HTTP response when validate throws without one", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => Promise.resolve({ subject: "user_1" }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({
      name: "CountrError",
      code: "invalid_response",
      statusCode: 200,
    });
  });

  it("throws CountrError when `current` is NaN", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ ...usageBody, current: NaN }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });

  it("throws CountrError when `remaining` is Infinity", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () =>
        Promise.resolve({ ...usageBody, remaining: Infinity }),
    });

    await expect(
      client.getUsage({ subject: "user_1", metric: "api_calls" }),
    ).rejects.toMatchObject({ name: "CountrError", code: "invalid_response" });
  });
});

// ---------------------------------------------------------------------------
// CountrError
// ---------------------------------------------------------------------------

describe("CountrError", () => {
  it("is an instance of Error", () => {
    const err = new CountrError("Something went wrong");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name CountrError", () => {
    const err = new CountrError("Something went wrong");
    expect(err.name).toBe("CountrError");
  });

  it("stores statusCode, code, and cause", () => {
    const cause = new Error("original");
    const err = new CountrError("wrapped", {
      statusCode: 503,
      code: "service_unavailable",
      cause,
    });

    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("service_unavailable");
    expect(err.cause).toBe(cause);
  });
});

// ---------------------------------------------------------------------------
// timeoutMs and failOpen
// ---------------------------------------------------------------------------

describe("timeoutMs and failOpen", () => {
  const input = { subject: "user_1", metric: "api_calls", cost: 1 };
  const okBody = { allowed: true, remaining: 9, reason: null };
  const denyBody = { allowed: false, remaining: 0, reason: "limit_exceeded" };

  /** Never resolves and ignores the abort signal (worst-case custom fetch). */
  const hangingFetch = () =>
    vi.fn().mockImplementation(() => new Promise(() => {})) as unknown as typeof globalThis.fetch;

  const make = (fetch: typeof globalThis.fetch, extra = {}) =>
    new CountrClient({ apiKey: "ck_test", fetch, ...extra });

  it("returns a normal allow without failedOpen", async () => {
    const result = await make(makeFetch(200, okBody), { failOpen: true }).checkConsume(input);
    expect(result).toEqual(okBody);
    expect(result.failedOpen).toBeUndefined();
  });

  it("returns an explicit denial as-is, even with failOpen", async () => {
    const result = await make(makeFetch(200, denyBody), { failOpen: true }).checkConsume(input);
    expect(result.allowed).toBe(false);
    expect(result.failedOpen).toBeUndefined();
  });

  it("passes a timeout signal to fetch by default", async () => {
    const f = makeFetch(200, okBody);
    await make(f).checkConsume(input);
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("times out without failOpen: throws request_timeout", async () => {
    await expect(
      make(hangingFetch(), { timeoutMs: 20 }).checkConsume(input),
    ).rejects.toMatchObject({ name: "CountrError", code: "request_timeout" });
  });

  it("times out with failOpen: resolves with failedOpen result", async () => {
    const result = await make(hangingFetch(), { timeoutMs: 20, failOpen: true }).checkConsume(input);
    expect(result).toMatchObject({
      allowed: true,
      remaining: null,
      reason: "fail_open",
      failedOpen: true,
    });
    expect(result.error?.code).toBe("request_timeout");
  });

  it("times out when the response body hangs", async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => new Promise(() => {}),
    }) as unknown as typeof globalThis.fetch;
    await expect(make(f, { timeoutMs: 20 }).checkConsume(input)).rejects.toMatchObject({
      code: "request_timeout",
    });
  });

  it("per-call timeoutMs overrides the client default", async () => {
    const client = make(hangingFetch(), { timeoutMs: 60_000 });
    await expect(client.checkConsume(input, { timeoutMs: 20 })).rejects.toMatchObject({
      code: "request_timeout",
    });
  });

  it("fails closed by default on network error", async () => {
    await expect(
      make(makeFailingFetch(new Error("ECONNRESET"))).checkConsume(input),
    ).rejects.toMatchObject({ code: "network_error" });
  });

  it("fails open on network error when enabled", async () => {
    const result = await make(makeFailingFetch(new Error("ECONNRESET")), {
      failOpen: true,
    }).checkConsume(input);
    expect(result.failedOpen).toBe(true);
    expect(result.error?.code).toBe("network_error");
  });

  it.each([500, 502, 503])("5xx (%i) without failOpen throws", async (status) => {
    await expect(
      make(makeFetch(status, { error: { code: "service_unavailable" } })).checkConsume(input),
    ).rejects.toMatchObject({ statusCode: status });
  });

  it.each([500, 502, 503])("5xx (%i) with failOpen resolves failedOpen", async (status) => {
    const result = await make(makeFetch(status, {}), { failOpen: true }).checkConsume(input);
    expect(result).toMatchObject({ allowed: true, failedOpen: true });
    expect(result.error?.statusCode).toBe(status);
  });

  it("5xx with non-JSON body still fails open", async () => {
    const f = makeFetch(503, "<html>", false, "text/html");
    const result = await make(f, { failOpen: true }).checkConsume(input);
    expect(result.failedOpen).toBe(true);
  });

  it("never fails open on 401", async () => {
    const f = makeFetch(401, { error: { code: "unauthorized" } });
    await expect(make(f, { failOpen: true }).checkConsume(input)).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      make(f).checkConsume(input, { failOpen: true }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it.each([400, 403, 404, 429])("never fails open on %i", async (status) => {
    await expect(
      make(makeFetch(status, {}), { failOpen: true }).checkConsume(input),
    ).rejects.toMatchObject({ statusCode: status });
  });

  it("never fails open on a malformed 2xx response", async () => {
    await expect(
      make(makeFetch(200, { nope: 1 }), { failOpen: true }).checkConsume(input),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("never fails open on invalid input", async () => {
    await expect(
      make(makeFetch(200, okBody), { failOpen: true }).checkConsume({ ...input, subject: "" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("never fails open when the caller aborts", async () => {
    const controller = new AbortController();
    const f = vi.fn().mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    ) as unknown as typeof globalThis.fetch;
    const p = make(f, { failOpen: true }).checkConsume(input, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ code: "request_aborted" });
  });

  it("per-call failOpen:true beats client failOpen:false", async () => {
    const result = await make(makeFetch(503, {}), { failOpen: false }).checkConsume(input, {
      failOpen: true,
    });
    expect(result.failedOpen).toBe(true);
  });

  it("per-call failOpen:false beats client failOpen:true", async () => {
    await expect(
      make(makeFetch(503, {}), { failOpen: true }).checkConsume(input, { failOpen: false }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("sends the same Idempotency-Key on a manual retry after fail-open", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: () => Promise.resolve(okBody),
    });
    const client = make(f as unknown as typeof globalThis.fetch, { failOpen: true });
    const first = await client.checkConsume(input, { idempotencyKey: "k-1" });
    expect(first.failedOpen).toBe(true);
    await client.checkConsume(input, { idempotencyKey: "k-1" });
    for (const call of f.mock.calls as [string, RequestInit][]) {
      expect((call[1].headers as Headers).get("Idempotency-Key")).toBe("k-1");
    }
  });

  it("rejects invalid timeoutMs and failOpen config values", () => {
    for (const timeoutMs of [0, -1, NaN, Infinity, "2000" as unknown as number]) {
      expect(() => make(makeFetch(200, okBody), { timeoutMs })).toThrow(CountrError);
    }
    expect(() => make(makeFetch(200, okBody), { failOpen: "yes" })).toThrow(CountrError);
  });

  it("rejects invalid per-call options", async () => {
    const c = make(makeFetch(200, okBody));
    await expect(c.checkConsume(input, { timeoutMs: 0 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      c.checkConsume(input, { failOpen: 1 as unknown as boolean }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(c.getUsage(input, { timeoutMs: -5 })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

// ---------------------------------------------------------------------------
// Error body parsing and cost validation
// ---------------------------------------------------------------------------

describe("error body parsing", () => {
  const input = { subject: "user_1", metric: "api_calls", cost: 1 };
  const make = (fetch: typeof globalThis.fetch, extra = {}) =>
    new CountrClient({ apiKey: "ck_test", fetch, ...extra });

  it("reads the API's nested { error: { code, message } } shape", async () => {
    const f = makeFetch(401, { error: { code: "unauthorized", message: "Invalid API key" } });
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      name: "CountrError",
      statusCode: 401,
      code: "unauthorized",
      message: "Invalid API key",
    });
  });

  it("ignores extra nested fields such as details", async () => {
    const f = makeFetch(400, {
      error: { code: "validation_error", message: "Invalid request body", details: { cost: "x" } },
    });
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      statusCode: 400,
      code: "validation_error",
      message: "Invalid request body",
    });
  });

  it("falls back to the legacy top-level { code, message } shape", async () => {
    const f = makeFetch(404, { code: "not_found", message: "Nope" });
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      statusCode: 404,
      code: "not_found",
      message: "Nope",
    });
  });

  it("prefers the nested shape when both are present", async () => {
    const f = makeFetch(400, {
      code: "old",
      message: "old message",
      error: { code: "new", message: "new message" },
    });
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      code: "new",
      message: "new message",
    });
  });

  it("falls back per field (nested code, default message)", async () => {
    const f = makeFetch(400, { error: { code: "validation_error" } });
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      code: "validation_error",
      message: "API request failed with status 400.",
    });
  });

  it("uses defaults for a non-JSON body", async () => {
    const f = makeFetch(502, "<html>Bad gateway</html>", false, "text/html");
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      statusCode: 502,
      code: "api_error",
      message: "API request failed with status 502.",
    });
  });

  it("uses defaults when `error` is not an object or fields are not strings", async () => {
    for (const body of [{ error: "boom" }, { error: { code: 5, message: null } }, [1, 2], null]) {
      await expect(make(makeFetch(400, body)).checkConsume(input)).rejects.toMatchObject({
        code: "api_error",
        message: "API request failed with status 400.",
      });
    }
  });

  it("parses nested errors from getUsage too (429)", async () => {
    const f = makeFetch(429, {
      error: { code: "owner_monthly_limit_exceeded", message: "Monthly request limit exceeded" },
    });
    await expect(make(f).getUsage({ subject: "u", metric: "m" })).rejects.toMatchObject({
      statusCode: 429,
      code: "owner_monthly_limit_exceeded",
    });
  });

  it("503 with the nested shape fails open and keeps the real code on `error`", async () => {
    const f = makeFetch(503, {
      error: { code: "service_unavailable", message: "Service temporarily unavailable" },
    });
    const result = await make(f, { failOpen: true }).checkConsume(input);
    expect(result).toMatchObject({ allowed: true, failedOpen: true, reason: "fail_open" });
    expect(result.error).toMatchObject({
      statusCode: 503,
      code: "service_unavailable",
      message: "Service temporarily unavailable",
    });
  });

  it("503 with the nested shape throws when failOpen is not set", async () => {
    const f = makeFetch(503, { error: { code: "service_unavailable", message: "x" } });
    await expect(make(f).checkConsume(input)).rejects.toMatchObject({
      statusCode: 503,
      code: "service_unavailable",
    });
  });

  it("401 with the nested shape never fails open", async () => {
    const f = makeFetch(401, { error: { code: "unauthorized", message: "Invalid API key" } });
    await expect(make(f, { failOpen: true }).checkConsume(input)).rejects.toMatchObject({
      statusCode: 401,
      code: "unauthorized",
    });
    await expect(make(f).checkConsume(input, { failOpen: true })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("does not fail open on a 4xx whose body claims an SDK-style code", async () => {
    for (const code of ["network_error", "request_timeout"]) {
      const f = makeFetch(400, { error: { code, message: "server controlled" } });
      await expect(make(f, { failOpen: true }).checkConsume(input)).rejects.toMatchObject({
        statusCode: 400,
        code,
      });
    }
  });

  it("does not fail open on message text that looks like an outage", async () => {
    const f = makeFetch(400, { error: { code: "validation_error", message: "Service temporarily unavailable" } });
    await expect(make(f, { failOpen: true }).checkConsume(input)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("fails open on 5xx regardless of the body's code or message", async () => {
    const f = makeFetch(500, { error: { code: "whatever", message: "anything" } });
    const result = await make(f, { failOpen: true }).checkConsume(input);
    expect(result.failedOpen).toBe(true);
    expect(result.error?.code).toBe("whatever");
  });
});

describe("cost validation", () => {
  const make = () => {
    const f = makeFetch(200, { allowed: true, remaining: 1, reason: null });
    return { f, client: new CountrClient({ apiKey: "ck_test", fetch: f, failOpen: true }) };
  };

  it.each([0, 1.5, -1, -0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined])(
    "rejects cost %s before any network call, even with failOpen",
    async (cost) => {
      const { f, client } = make();
      await expect(
        client.checkConsume({ subject: "u", metric: "m", cost: cost as number }),
      ).rejects.toMatchObject({ name: "CountrError", code: "invalid_input" });
      expect(f).not.toHaveBeenCalled();
    },
  );

  it("gives a clear message", async () => {
    const { client } = make();
    await expect(
      client.checkConsume({ subject: "u", metric: "m", cost: 0 }),
    ).rejects.toThrow("`cost` must be a positive integer.");
  });

  it("accepts cost 1 and larger integers", async () => {
    for (const cost of [1, 5, 1000]) {
      const { f, client } = make();
      const r = await client.checkConsume({ subject: "u", metric: "m", cost });
      expect(r.allowed).toBe(true);
      expect(f).toHaveBeenCalledOnce();
    }
  });
});
