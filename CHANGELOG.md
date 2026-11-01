# Changelog

## 0.2.0 (unreleased)

Not yet published. Version in `package.json` is still 0.1.0.

### Added
- `timeoutMs` option (client and per call). Default **2000** ms. A timeout
  throws `CountrError` with code `request_timeout`.
- `failOpen` option (client and per `checkConsume` call, default `false`).
  When enabled, network errors, timeouts and HTTP 5xx resolve instead of throwing.
- Fail-open results: `{ allowed: true, remaining: null, reason: "fail_open",
  failedOpen: true, error }`. Never set by the API.

### Changed
- **Error parsing:** `CountrError.code` and `message` now come from the API's
  `{ "error": { "code", "message" } }` body (for example `unauthorized`,
  `service_unavailable`). The legacy top-level shape and non-JSON bodies still
  work. Previously real API errors always had code `api_error` and a generic
  message, so code that matched `api_error` on API errors should be updated.
- **Cost validation:** `checkConsume` now rejects `cost` values that are not
  positive safe integers (0, negatives, fractions, NaN, Infinity) with
  `invalid_input`, before any network call. Previously 0 and fractions were sent
  and rejected by the API with a 400.
- The 2000 ms default timeout also applies to `getUsage`. Earlier versions had
  no timeout.
- Docs: examples use `ck_test_xxx`; denial and plan-cap wording aligned with the API.
