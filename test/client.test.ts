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

  it("throws if fetch is unavailable and none is supplied", () => {
    const origFetch = globalThis.fetch;
    // @ts-expect-error intentionally removing fetch for test
    delete globalThis.fetch;
    expect(() => new CountrClient({ apiKey: "ck_test" })).toThrow(CountrError);
    globalThis.fetch = origFetch;
  });

  it("accepts a custom baseUrl", () => {
    const client = new CountrClient({
      apiKey: "ck_test",
      baseUrl: "http://localhost:3000/",
      fetch: makeFetch(200, {}),
    });
    expect(client).toBeInstanceOf(CountrClient);
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
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ck_test");
  });

  it("sends Idempotency-Key when provided", async () => {
    await client.checkConsume(
      { subject: "user_1", metric: "api_calls", cost: 1 },
      { idempotencyKey: "idem-123" },
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-123");
  });

  it("does not send Idempotency-Key when not provided", async () => {
    await client.checkConsume({
      subject: "user_1",
      metric: "api_calls",
      cost: 1,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("throws CountrError on invalid input – missing subject", async () => {
    await expect(
      client.checkConsume({ subject: "", metric: "api_calls", cost: 1 }),
    ).rejects.toThrow(CountrError);
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
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ck_test");
  });

  it("does not send Content-Type header on GET requests", async () => {
    await client.getUsage({ subject: "user_1", metric: "api_calls" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
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
