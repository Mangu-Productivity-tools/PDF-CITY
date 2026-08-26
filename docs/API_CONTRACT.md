# API Contract (v1)

This is the single source of truth for the REST API shape. `packages/api` implements
it, `packages/web` consumes it, and `packages/shared` holds the validation
schemas/constants both depend on. If you change a route, update this file in the
same commit.

Base URL: `https://<host>/api/v1`
Auth: `Authorization: Bearer <API_KEY>` on every endpoint except `/health`, `/ready`, and `GET /status/{job_id}`.

## Job object

```json
{
  "job_id": "b3b3c2b0-...-uuid",
  "status": "queued | processing | completed | failed | cancelled",
  "progress": 0,
  "engine": "chrome | calibre",
  "metadata": { "title": "...", "creator": "...", "page_count": 123 },
  "download_url": "https://.../signed-url (present once completed)",
  "expires_at": "2026-08-20T00:00:00.000Z",
  "error": { "error_code": "RENDER_CHROME_FAILED", "message": "..." },
  "created_at": "2026-08-19T00:00:00.000Z",
  "updated_at": "2026-08-19T00:00:05.000Z"
}
```

## Endpoints

### `POST /convert`
Two content types:
- `application/json`: `{ file_url, callback_url?, options? }`
- `multipart/form-data`: file field `file`, plus optional `callback_url` and
  `options` (JSON-encoded string) fields.

`options`: `{ engine, page_size, margin_top_in, margin_bottom_in, margin_left_in,
margin_right_in, include_header, include_footer, header_template, footer_template }`
— all optional, see `packages/shared/src/jobSchema.js` for defaults.

Response `201 Created` (+ `Location: /api/v1/status/{job_id}` header):
```json
{ "job_id": "...", "status": "queued", "estimated_time_seconds": 45, "status_url": "/api/v1/status/..." }
```

### `GET /status/{job_id}`
**Public endpoint — no `Authorization` header required.** The UUID acts as a
capability token. Response `200`: the Job object above, including `download_url`
(signed URL) when `status` is `completed`.

### `GET /jobs`
Query: `status`, `from`, `to` (ISO 8601), `page` (default 1), `page_size` (default 20, max 100).
Response `200`: `{ "jobs": [Job, ...], "page": 1, "page_size": 20, "total": 42 }`

### `GET /jobs/{job_id}`
Single job lookup. `404` if not found or owned by a different API key.

### `GET /jobs/{job_id}/download`
`302` redirect to the signed storage URL, or `200` with `{ "download_url": "..." }`
if `Accept: application/json`.

### `DELETE /jobs/{job_id}`
Cancels a queued/processing job or deletes a completed one's record + storage
object. Response `204`.

### `PATCH /jobs/{job_id}`
Update `options` before processing has started (i.e. job still `queued`).
`400 VALIDATION_ERROR` if the job has already started. Response `200` with
the updated Job.

### `GET /health`, `GET /ready`
Liveness / readiness. `200` if the process is up / if Redis+DB(+S3) are reachable.

## Errors

Standard body:
```json
{ "error_code": "INVALID_URL", "message": "file_url is not a valid URL" }
```
Full code list + HTTP status mapping: `packages/shared/src/errorCodes.js`.
`429` responses include a `Retry-After` header (seconds).

## Webhooks

If `callback_url` is set, the API POSTs the Job object to it on every terminal
status change (`completed`, `failed`, `cancelled`), with header
`X-Hub-Signature: sha256=<hmac>` computed via `packages/shared/src/hmac.js`
over the raw JSON body using the account's webhook secret. Retries: up to 5
attempts, exponential backoff (5s base, 5min cap).

## Rate limits

60 requests/min/API-key, 10 concurrent (non-terminal) jobs/API-key by default
(`packages/shared/src/constants.js:RATE_LIMIT`). Exceeding either returns `429`.

## Auth

`Authorization: Bearer <key>`. Keys are generated/revoked via the (future)
`/api/v1/api-keys` admin endpoints — see `docs/ROADMAP.md` Phase 2. For Phase 1,
keys are seeded directly in the `api_keys` table (see `db/migrations`).
