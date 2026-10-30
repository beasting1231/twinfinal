# Booking API

This integration is additive. Installation does not change existing bookings, rules, forms, email routes, or notification settings, and performs no data migration. Existing direct browser access is unchanged: API scopes protect this new API, not other existing access paths.

## API keys

The **API keys** menu and `/api-keys` screen are restricted to the verified `pccbasting@gmail.com` Firebase account. Server-side callable functions independently enforce that identity and check that the account is not disabled. Other admins cannot manage these keys.

Create a named key, choose permissions, optionally choose an expiry, and copy its secret once. It cannot be retrieved later. Keys can be revoked immediately; create a replacement to change permissions or rotate a key. The screen lists permissions, status and last use. Store the secret in a server-side secret store or a tool's secure connection settings, never in browser code or a URL.

All requests use:

```http
Authorization: Bearer YOUR_API_KEY
```

Every POST, PATCH and DELETE also requires an `Idempotency-Key` header (8–128 visible ASCII characters). Choose a unique value per operation and reuse it only when retrying that exact operation. Replays return the original result without repeating the write. Reusing a value for different input returns 409. Receipts are retained in a server-only collection.

## Endpoints and permissions

Base URL: `https://YOUR_APP_HOST/api/v1`

| Method and path | Permission | Result |
| --- | --- | --- |
| GET `/availability?date=YYYY-MM-DD` | `availability:read` | All scheduled departures and remaining spaces |
| GET `/availability?date=YYYY-MM-DD&time=14:00` | `availability:read` | Space count for the selected departure |
| GET `/bookings?date=YYYY-MM-DD` | `bookings:read` | Bookings for a day |
| GET `/bookings?name=Peter` | `bookings:read` | Search customer names across dates |
| GET `/bookings?name=Peter&date=YYYY-MM-DD` | `bookings:read` | Search within a day |
| GET `/bookings/{id}` | `bookings:read` | One booking |
| POST `/bookings` | `bookings:create` | Create directly in the daily plan |
| PATCH `/bookings/{id}` | `bookings:update` and/or `bookings:status` | Edit allowed details/status |
| DELETE `/bookings/{id}` | `bookings:delete` | Recoverable deletion with the existing assignment/payment cleanup |
| POST `/booking-requests` | `booking-requests:create` | Pending request for review |

Responses use `{bookings: [...], nextCursor: string|null}`, `{booking: {...}}`, or `{date, timezone: "Europe/Zurich", slots: [...]}`. Mutations return `{id, bookingStatus}` or `{id, status: "pending"}`. Booking results include the displayed departure `time` and `timezone`; a missing legacy departure is returned as null. Each availability slot contains `time`, `timeIndex`, `capacity`, `availableSpots`, and `bookable` (departure has not passed). Read-only capacity can be returned for past dates; direct creation/rescheduling requires a future departure.

### Name search and pagination

Provide a date, name, or both. Name matching is case/accent insensitive and matches the beginning of first/last names: `pete bast` matches `Péter Basting`. Use at least two characters. Results exclude deleted bookings; other statuses remain visible. `limit` defaults to 50 (maximum 100). Results are ordered by booking ID. Supply `cursor=NEXT_CURSOR` with the same search filters until `nextCursor` is null.

Search reads at most 500 lightweight booking projections per call, without a backfill or dependency on a potentially incomplete old index. **An empty page may still have a next cursor.** Continue paging to finish the search. This trades some search speed for immediate compatibility with all old records. Pagination is live, not a fixed snapshot; records can change between requests.

### Creating and changing bookings

Example creation body:

```json
{
  "customerName": "Peter Example",
  "date": "2026-10-01",
  "time": "14:00",
  "numberOfPeople": 2,
  "email": "customer@example.com",
  "phoneNumber": "+41000000000",
  "pickupLocation": "HW",
  "flightType": "sensational",
  "notes": "Customer notes"
}
```

`customerName`, `date`, `time`, and `numberOfPeople` are required for creation. New bookings default to `unconfirmed`, have empty pilot assignments, and record their creator as `API: <key name>` in existing booking history. Creating a booking does not enqueue a new customer confirmation email; existing booking-created push/search triggers continue normally after production release.

Editable fields: `customerName`, `email`, `phoneNumber`, `pickupLocation`, `notes`, `officeNotes`, `bookingSource`, `date`, `time`, `numberOfPeople`, `flightType`, `preferredContact`. Unknown fields are rejected. Optional text can be cleared with an empty string; customer name cannot. `flightType` accepts `sensational`, `classic`, or `early bird`; `preferredContact` accepts `phone`, `email`, or null.

Status-only change:

```json
{"bookingStatus": "confirmed"}
```

`bookings:status` allows `unconfirmed`, `confirmed`, `pending`, `cancelled`, and `no show`. A mixed detail/status patch requires both permissions and is rejected entirely if either is absent. Deleted bookings cannot be edited or restored through this API. Blocked spots, pilot/payment edits and permanent deletion remain app-only.

Dates and times refer to Switzerland, including daylight saving. Seasonal slots, time overrides, additional departures and missing legacy availability statuses follow the existing form. All non-deleted bookings consume space, **including cancelled and no-show bookings**, matching current app behavior. An available or on-request pilot is counted as in the current form. Status-only changes therefore do not change the capacity calculation.

Creation, rescheduling and passenger changes recheck capacity inside a transaction. Same-day API writes use a server-only coordination record to prevent simultaneous API requests from taking the same remaining spaces. Existing browser writers are unchanged and do not participate in that coordination; the API does not introduce a global reservation guarantee across all legacy writers. Assigned pilots must be available and unoccupied at a new departure. Reducing passenger count cannot discard assigned pilots; resolve that assignment in the app first. Audit entries and unrelated fields are retained.

### Booking requests

POST the creation fields above; `email` is additionally required and `officeNotes`/`bookingStatus` are not accepted. Contact fields map to the existing request schema. Requests do not reserve capacity and can be submitted for full departures. Existing pending-request email/Telegram notifications remain active in production; this API adds no new notification mechanism.

### Errors and limits

Errors have `{error: {code, message}}`. Status codes: 400 invalid input, 401 missing/invalid/expired/revoked key, 403 missing permission, 404 unavailable record/departure, 409 capacity/assignment/idempotency conflict, 413 body over 32 KB, 429 over 120 requests per key per minute, 500 unexpected server error. Retry transport errors with the same idempotency key. Authentication secrets and request bodies are not logged by this API.

## MCP connector

`POST /api/v1/mcp` serves the same API as an MCP server (Streamable HTTP, stateless, JSON responses) for AI tools and connectors. Use URL `https://YOUR_APP_HOST/api/v1/mcp` with the same Bearer API key. It adds no storage, collections or triggers.

Tools only appear when the key has their permission: `check_availability` (`availability:read`), `search_bookings` and `get_booking` (`bookings:read`), `create_booking`, `update_booking`, `set_booking_status`, `delete_booking` (matching `bookings:*`), and `create_booking_request` (`booking-requests:create`). Each tool calls the same service code as the REST endpoints, so validation, capacity checks, audit history, idempotency receipts and rate limits (each MCP message counts as one request) are identical. Write tools accept an optional `idempotencyKey`; without one, a unique key is generated, so a client retry is not deduplicated. Tool failures return `isError` results with the API error code. GET returns 405 (no server-initiated streams).

## Local validation

```sh
node --import ./tests/registerAvailabilityTs.mjs --test tests/*.test.mjs tests/*.test.cjs
node scripts/bookingApiLocal.mjs test
npx tsc -b
npx vite build --outDir /tmp/twin-api-build
```

The isolated API emulator fixture exports only the new four functions. No email, Telegram, push, booking-index or other existing production triggers run. It uses the demo project `demo-twin-history` and dedicated ports 8380/9399/5301/5305. Never point emulator tests at production. Java and Firebase CLI must be installed.

For browser checks start `node scripts/bookingApiLocal.mjs` and `npx vite --config vite.api-local.config.ts`, then open `http://localhost:5179`. The configuration explicitly replaces production credentials with demo values. Demo users must be seeded into this isolated auth emulator.

## Release boundaries

No deployment is performed by the implementation or tests. Existing Firestore rules are left untouched; the new `integrationApiKeys`, `integrationApiUsage`, `integrationApiRequests` and `integrationApiDays` collections inherit default client denial and are accessed only through server functions.

When a production release is authorized, deploy only `bookingApi` (includes `/api/v1/mcp`), `createIntegrationApiKey`, `listIntegrationApiKeys`, and `revokeIntegrationApiKey`, then the reviewed frontend/Hosting changes. Do not deploy unrelated pending Functions or rules changes. The new `/api/v1/**` rewrite must precede the existing `/api/**` email rewrite, which is preserved. Confirm owner access and read-only requests with a temporary key before enabling write permissions. Local emulator results do not establish production delivery or behavior.
