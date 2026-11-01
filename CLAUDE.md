# countr-sdk-js

## Overview
Official JS/TS client (npm `countr-sdk`, v0.1.0) for the Countr usage-enforcement
API (rate limits, quotas, credits). Sibling repo: `robin-weller/countr` (the API;
its docs and `lib/plans/plans.ts` are the source of truth for behaviour and plans).

## Stack
- TypeScript (strict), ESM + CJS via `tsup`, tests with Vitest. No runtime deps.
- Uses built-in `fetch`; `engines.node >= 20.19.0`.
- Source: `src/` (`client.ts`, `http.ts`, `types.ts`, `errors.ts`, `index.ts`),
  tests: `test/client.test.ts`, example: `examples/quickstart.ts`.

## Commands (verified)
- `npm ci` install
- `npm test` (vitest run)
- `npm run typecheck` (`tsc --noEmit`); `npm run lint` is the same command
- `npm run build` (tsup -> `dist/`, gitignored)
- No eslint or prettier is configured.

## Behaviour to keep in mind
- `checkConsume` denial is HTTP 200 `{allowed:false}`, not an error.
- Fail-open (`failOpen`, default false) applies only to network errors,
  `request_timeout` and HTTP 5xx. Never 401/4xx/denial/abort/invalid input.
- `timeoutMs` default 2000. The SDK does not retry.
- Failed-open results carry `failedOpen: true` and `error`; real API responses never do.

## Rules
- Work on a branch, never main.
- Never publish to npm. Never bump the version. The owner releases.
- Additive public API changes only; breaking changes need owner approval.
- No secrets, real keys or customer data in code, docs, tests or logs.
  Use `ck_test_xxx` placeholders.
- Keep the README consistent with behaviour; update it in the same commit.
- Plan wording must match the API repo: no overages, denied at the monthly cap.
- Never change package metadata (other than scripts) without asking.

## Known gaps / TODO: ask owner
- TODO: ask owner: API error bodies are `{error:{code,message}}` but `http.ts`
  reads top-level `message`/`code`, so `CountrError.code` is `api_error` for real
  API errors. Fixing changes `err.code` values, so confirm first.
- TODO: ask owner: SDK allows `cost: 0`, but the API requires a positive integer.
- TODO: ask owner: `package.json` description and keywords wording; npm release steps and CI.
- TODO: ask owner: no CI config found in this repo.
- TODO: ask owner: measured latency (none claimed anywhere; add only once measured).
