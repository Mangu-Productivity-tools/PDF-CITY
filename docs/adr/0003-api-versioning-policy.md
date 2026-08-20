# ADR 0003: URL-based API versioning (`/v1`) with a 6-month deprecation notice policy

## Status

Accepted. Implemented in `packages/api/src/app.js`; documented in
`docs/API_CONTRACT.md`.

## Context

The API needs a way to evolve without breaking existing integrations
out from under callers like EdTech LMS integrations or CI pipelines (PRD
personas Bob and Carol). The source spec is explicit on this point ("Rate
Limiting & Versioning": *"API versioning: /v1, deprecation policy: 6 months
notice for breaking changes"*), and the PRD's Governance section (§17 via spec
§"Governance & Documentation") calls for the same.

Common approaches to API versioning include a URL path prefix (`/v1/...`), an
HTTP header (e.g. `Accept: application/vnd.epub2pdf.v1+json` or a custom
`API-Version` header), or query-string versioning. Each has trade-offs around
visibility, cacheability, and routing complexity.

## Decision

Version the API via a **URL path prefix**: every endpoint lives under
`/api/v1/...`, mounted as its own Express router in
`packages/api/src/app.js` (`app.use('/api/v1', v1)`), with `API_VERSION` held
as a named constant (`packages/shared/src/constants.js`).

The accompanying policy — carried forward from the source spec as documented
intent — is: **breaking changes get a new version prefix (`/v2`, etc.), and a
previously-shipped version is supported for at least 6 months after a
successor version ships and after deprecation is announced**, before that
older version can be removed.

## Consequences

**Positive:**

- URL versioning is immediately visible in every request, every log line, and
  every piece of client code — there's no ambiguity about which contract a
  given request was made against, unlike a header-based scheme that's easy to
  omit or get wrong.
- It plays well with standard HTTP infrastructure: reverse proxies, API
  gateways, and caches can route or cache by path with no special
  configuration for version-awareness.
- It matches `docs/API_CONTRACT.md`'s framing directly (`Base URL:
  https://<host>/api/v1`), so there's one consistent source of truth for the
  contract's shape.
- Clients can pin to a version trivially (it's just part of the base URL they
  already configure) rather than needing to manage a header on every request.

**Negative / accepted trade-offs:**

- When a `/v2` eventually exists, the API has to run both versions'
  routing (and potentially both versions' business logic, if the versions
  diverge in behavior, not just shape) side by side for the entire deprecation
  window. URL versioning makes this coexistence explicit and simple to route,
  but doesn't make it free — someone still has to maintain two contracts at
  once.
- **The 6-month deprecation policy is a documented intention, not something
  enforced in code today.** There is no `/v2` yet, so there is nothing to
  test this against; there is also no deprecation-notice mechanism at all yet
  (e.g. a `Sunset`/`Deprecation` response header, a changelog entry, or an
  automated reminder tied to a announced sunset date) for whenever `/v1`
  eventually needs one. This ADR should be revisited — and the policy turned
  into an actual enforced mechanism — once a `/v2` is scoped, rather than
  assuming the documented policy alone is sufficient notice in practice.
- Path-based versioning means the version is baked into every URL a client
  stores (e.g. a `status_url` returned by `POST /convert`,
  `packages/api/src/routes/convert.js`). If those URLs are persisted
  long-term by a caller, a version migration means those stored URLs need to
  be updated too, not just the client's request-building code.
