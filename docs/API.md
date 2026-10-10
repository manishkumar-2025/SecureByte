# CampusShield REST API

Base URL (local dev): `http://localhost:4000`

- All request and response bodies are **JSON**.
- Every response uses one envelope:

```json
// success
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": { "code": "MACHINE_CODE", "message": "human readable", "details": { "field": "message" } } }
```

- Protected endpoints require `Authorization: Bearer <jwt>`.
- Lists are paginated: `?page=1&limit=20` (max limit 50) and return
  `{ items, pagination: { page, limit, total, totalPages } }`.

## Error codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 401 | `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` / `USER_NOT_FOUND` | Authentication problem |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same message for both — no user enumeration) |
| 403 | `FORBIDDEN` | Role not permitted for this route |
| 403 | `NOT_YOUR_INCIDENT` | Student viewing someone else's incident |
| 404 | `NOT_FOUND` / `INCIDENT_NOT_FOUND` | Route or record doesn't exist |
| 409 | `EMAIL_IN_USE` / `DUPLICATE` | Duplicate registration/record |
| 409 | `DUPLICATE_SUBMISSION` | Same incident submitted within the duplicate window (30 s) |
| 409 | `INVALID_STATUS_TRANSITION` | Lifecycle rule violated |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 16 KB |
| 422 | `VALIDATION_ERROR` | Field-level validation failed (`details` has per-field messages) |
| 422 | `INVALID_CURRENT_PASSWORD` | Password change: current password did not match |
| 423 | `ACCOUNT_LOCKED` | Account temporarily locked after repeated failed logins |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error (details only in server logs) |
| 503 | `DB_UNAVAILABLE` | Database not reachable (health endpoint) |

## Rate limits (defaults, configurable via .env)

| Scope | Limit |
|-------|-------|
| All routes | 300 / 5 min / IP |
| `POST /api/auth/login` | 10 failed attempts / 15 min / IP (successful logins don't count) |
| `POST /api/auth/refresh` | 60 / 15 min / IP |
| `POST /api/auth/register`, `setup-responder` | 5 / hour / IP |
| `POST /api/incidents` | 6 / 10 min / user+IP |

---

## Authentication

### POST /api/auth/register — public
Creates a STUDENT account. The `role` field is ignored if sent — it is hardcoded server-side.

Request:
```json
{ "name": "Aarav Rao", "email": "aarav@campus.edu", "password": "Passw0rd1" }
```
Password policy: ≥ 8 chars, at least one letter and one number.

Response `201`:
```json
{ "success": true, "data": {
    "user": { "id": "…", "name": "Aarav Rao", "email": "aarav@campus.edu", "role": "STUDENT", "createdAt": "…" },
    "accessToken": "eyJhbGciOi…",
    "refreshToken": "73396d…" } }
```
Errors: `422 VALIDATION_ERROR`, `409 EMAIL_IN_USE`, `429 RATE_LIMITED`.

### POST /api/auth/login — public
Request: `{ "email": "…", "password": "…" }`
Response `200`: same shape as register (`user`, `accessToken`, `refreshToken`).
Errors: `401 INVALID_CREDENTIALS` (identical for unknown email and wrong password).

**Account lockout:** after `LOGIN_MAX_FAILED` (default 5) consecutive failed
logins the account returns `423 ACCOUNT_LOCKED` for `LOCKOUT_MINUTES`
(default 15) — even with the correct password. A successful login resets the
failed counter.

### POST /api/auth/refresh — public (the refresh token IS the credential)
Request: `{ "refreshToken": "…" }`
Response `200`: `{ "user", "accessToken", "refreshToken" }` — the OLD refresh
token is revoked and a NEW pair is issued (rotation). Reusing a rotated token
returns `401 INVALID_REFRESH_TOKEN`, which limits the blast radius of a
leaked token.

### POST /api/auth/logout — public, idempotent
Request: `{ "refreshToken": "…" }`. Revokes it server-side. Unknown tokens
still get `200` so the mobile app can always sign out cleanly.

### PATCH /api/auth/password — authenticated
Request: `{ "currentPassword": "…", "newPassword": "…" }` (same policy as register).
Response `200` on success. Errors: `422 INVALID_CURRENT_PASSWORD`,
`422 PASSWORD_UNCHANGED` (new == current), `422 VALIDATION_ERROR`.
Side effect: **all** of the user's refresh tokens are revoked — every other
device must sign in again. The caller's current access token keeps working
until it expires.

### GET /api/auth/me — authenticated
Response `200`: `{ "user": { … } }` — always the fresh DB record (role included).

### POST /api/auth/setup-responder — controlled, public route
Creates a RESPONDER account. **Disabled (403 `SETUP_DISABLED`) unless `RESPONDER_SETUP_CODE` is set in the backend `.env`.**
Request: `{ "name": "…", "email": "…", "password": "…", "setupCode": "…"`
(or send the code in the `x-responder-setup-code` header).
Errors: `403 INVALID_SETUP_CODE`, `403 SETUP_DISABLED`.

---

## Incidents (student)

### POST /api/incidents — authenticated, rate-limited

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes (except pure SOS) | 5–120 chars |
| `description` | yes | 10–2000 chars |
| `category` | yes (except pure SOS) | `MEDICAL_EMERGENCY`, `FIRE_HAZARD`, `SECURITY_THREAT`, `HARASSMENT`, `FACILITY_CONCERN`, `OTHER` |
| `priority` | no | `LOW`, `MEDIUM`, `HIGH` (default `MEDIUM`). **`CRITICAL` is rejected for non-SOS reports — it is reserved for SOS.** |
| `isSos` | no | `true` turns the payload into an SOS alert |
| `location` | no | `{ latitude, longitude, campusLandmark, buildingOrRoom }` — all optional; lat/lng must come together and be in range (±90 / ±180) |

**SOS behaviour (documented priority rule):** when `isSos: true`, the server forces
`category = SOS_ALERT`, `priority = CRITICAL`, `status = NEW`. Clients cannot
downgrade or spoof these values. A missing title/description gets sensible defaults.

SOS example:
```json
{ "isSos": true, "location": { "latitude": 23.8143, "longitude": 86.4407, "campusLandmark": "Hostel Gate 3" } }
```

Response `201`:
```json
{ "success": true, "data": { "incident": {
  "id": "c9b1…", "reporterId": "…", "title": "Emergency SOS Alert",
  "description": "Emergency SOS alert triggered from the CampusShield mobile app.",
  "category": "SOS_ALERT", "priority": "CRITICAL", "status": "NEW", "isSos": true,
  "createdAt": "…", "updatedAt": "…",
  "location": { "id": "…", "latitude": 23.8143, "longitude": 86.4407, "campusLandmark": "Hostel Gate 3", "buildingOrRoom": null, "createdAt": "…" }
} } }
```

The `reporterId` is ALWAYS taken from the authenticated user — any `reporterId`
in the request body is ignored. Duplicate protection: the same user sending the
same title + category + SOS flag within 30 seconds gets
`409 DUPLICATE_SUBMISSION` with `details.existingIncidentId`.

### GET /api/incidents/my — authenticated
Returns only the caller's incidents (with `location`), newest first.
Filters: `?status=NEW|ACKNOWLEDGED|IN_PROGRESS|RESOLVED` and free-text
`?q=` (matches title or description), plus pagination.

### GET /api/incidents/:id — authenticated
Students: only their own incident (`403 NOT_YOUR_INCIDENT` otherwise).
Responders: any incident. Includes `location`, `statusHistory` (with updater names) and `reporter { id, name }`.
Errors: `404 INCIDENT_NOT_FOUND`.

---

## Responder (RESPONDER role enforced by middleware)

### GET /api/responder/incidents
Full queue, sorted **SOS first, then newest**. Filters (combine freely):
`?status=…&category=…&priority=…&isSos=true|false&page=1&limit=50` and
free-text `?q=` — case-insensitive search across title, description,
campus landmark, room and reporter name.
Items include reporter `{ id, name }` and `location`. Never includes password hashes.

### PATCH /api/responder/incidents/:id/status
Request: `{ "newStatus": "ACKNOWLEDGED", "responderNotes": "Security team dispatched." }`
(`responderNotes` optional, ≤ 1000 chars.)

**Status lifecycle (strict):**

```
NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED   (no skipping, no reopening)
```

Violations get `409 INVALID_STATUS_TRANSITION` with
`details: { currentStatus, allowedNextStatuses }`.

The status update and the audit-history row are written in **one database
transaction** — both succeed or both fail.

Response `200`: updated incident including full `statusHistory`:
```json
{ "previousStatus": "NEW", "newStatus": "ACKNOWLEDGED", "responderNotes": "…",
  "updatedBy": "…", "updater": { "id": "…", "name": "Campus Safety Desk" }, "createdAt": "…" }
```

### POST /api/responder/announcements
Request: `{ "title": "…(5–140)", "message": "…(10–2000)", "severity": "INFO|WARNING|CRITICAL" }` (severity default `INFO`).
Response `201` with the announcement incl. `author { id, name }`.

---

## Announcements

### GET /api/announcements — authenticated
Paginated, newest first. Available to students and responders.

---

## Devices (push notifications)

### POST /api/devices/push-token — authenticated
Registers the calling device for Expo push notifications (upsert by token:
if a device was registered to another account, it follows the newest login).
Request: `{ "token": "ExponentPushToken[…]", "platform": "android|ios|web" }`
Response `201` (first registration) / `200` (re-registration).

### DELETE /api/devices/push-token — authenticated
Un-registers a device (mobile calls this on sign-out). Request: `{ "token": "…" }`. Always `200`.

**Push flows (server-initiated, best-effort — never blocks or fails the API call):**
| Event | Who is notified |
|---|---|
| New incident / SOS created | all RESPONDER + ADMIN accounts |
| Status updated (acknowledged / in progress / resolved) | the report's author |
| NEEDS HELP check-in | all RESPONDER + ADMIN accounts |
| New safety announcement | everyone except the author |

Every push is accompanied by an **in-app Notification row** (see Notification
center below) written inside the same pipeline — push failure never loses the
alert. Push delivery also honours per-user preferences (`/api/me/preferences`).

Requires the mobile app to have notification permission granted (asked from
the Profile screen) and a physical device (Expo Go on Android/iOS).

---

## Emergency contacts (v3)

### GET /api/contacts — authenticated
Returns the caller's OWN contacts (never anyone else's), oldest first.
`data: { items: [{ id, name, phone, relation, createdAt }], total }`

### POST /api/contacts — authenticated
Request: `{ "name": "Mom" (2–80 chars), "phone": "+91 98765 43210", "relation": "Family"? }`
Phone is normalized (spaces/dashes stripped) and must be 7–15 digits with an
optional leading `+`. Max **5 contacts** per user — the 6th returns
`422 CONTACT_LIMIT_REACHED`. Invalid phone → `422`.

### PATCH /api/contacts/:id — owner only
Partial update of name/phone/relation. Another user's contact → `404`
(deliberately — no existence leak).

### DELETE /api/contacts/:id — owner only
Always `200` for own contacts, `404` otherwise.

---

## Safety check-ins (v3)

### POST /api/checkins — authenticated
Request: `{ "status": "SAFE" | "NEEDS_HELP", "note"?: string ≤500, "latitude"?, "longitude"? }`
`NEEDS_HELP` alerts every RESPONDER + ADMIN through the notification center
(and push). Response `201` with the created check-in.

### GET /api/checkins/me — authenticated
Own history, newest first, paginated (`?page=&limit=`).

### GET /api/responder/checkins — RESPONDER/ADMIN
Staff monitor: latest check-ins with user names plus
`data.summary = { last24hSafe, last24hNeedsHelp }`.

---

## Safety points (campus map, v3)

### GET /api/safety-points — authenticated
Optional query params:
- `category=` — one of `EMERGENCY_EXIT, FIRE_EXTINGUISHER, AED, FIRST_AID, SHELTER, SECURITY_OFFICE`
- `lat=&lng=` (together) — annotate each point with `distanceMeters` (haversine)
- `radius=` — metres (default 2000, max 50000), filters the geo results

Geo results are sorted **nearest first**. Invalid category → `422`. Data is
read-only, seeded per campus (9 ISM-Dhanbad demo points).

---

## Notification center (v3)

### GET /api/notifications — authenticated
`?unread=true`, `?type=SOS_ALERT|NEW_INCIDENT|STATUS_UPDATE|CHECK_IN_ALERT|ANNOUNCEMENT|SYSTEM`, paginated.
Response: `data: { items, unreadCount, pagination }`.

### GET /api/notifications/unread-count — authenticated
`data: { count }` — the mobile app polls this every 30 s for the bell badge.

### PATCH /api/notifications/:id/read — authenticated, own rows only
### POST /api/notifications/read-all — authenticated
Marks all unread notifications read; returns `data: { updated }`.

---

## Notification preferences (v3)

### GET /api/me/preferences — authenticated
`data: { preferences: { push, sosAlerts, statusUpdates, announcements } }`
(merged with defaults, so new keys never break older clients).

### PUT /api/me/preferences — authenticated
Request: `{ "preferences": { "sosAlerts": false } }` — partial, booleans only.
Unknown keys or non-boolean values → `422`. Prefs also ride along on
`/api/auth/me`, login and register responses.

---

## Analytics & admin (v3)

### GET /api/responder/analytics — RESPONDER/ADMIN
Computed from real data (no mock numbers):
`totals { incidents, last24h, sosLast24h, openNow }`, `byStatus`, `byCategory`,
`series7d [{ date, total, sos }]` (UTC days), `avgResolutionMinutes`
(over incidents resolved in the last 30 days), `checkInsLast24h { safe, needsHelp }`.

### GET /api/admin/users — ADMIN only
Paginated user directory: `?role=STUDENT|RESPONDER|ADMIN`, `?q=` (name/email).
Fields: id, name, email, role, createdAt, lockedUntil, incidentsReported count.
**Password hashes and preferences are never returned.** RESPONDER → `403`.

---

## Photo evidence (v3)

### POST /api/incidents/:id/photo — reporter only
`multipart/form-data`, field **photo**. Limits: JPEG/PNG/WebP, ≤5 MB
(MIME validated server-side, not just by extension). Stored as
`uploads/<uuid>.<ext>`; the incident's `photoPath` is set to the public path
(`/uploads/…` — filenames are server-generated UUIDs, effectively unguessable).
Replacing a photo deletes the old file. Not your incident → `403`;
wrong type → `422 INVALID_PHOTO_TYPE`; >5 MB → `422 PHOTO_TOO_LARGE`.

### DELETE /api/incidents/:id/photo — reporter only
Removes the file (best-effort) and clears `photoPath`. No photo → `422 NO_PHOTO`.

> Production note: serving uploads from the API keeps the demo dependency-free.
> Real deployments should move to private object storage (S3/GCS) with signed
> URLs — documented in docs/ARCHITECTURE.md §6.

---

## Security notes for reviewers

- JWT signature **and** expiry are verified on every protected request; the user
  (and role) is re-read from the DB — a client can never assert a role.
- All Prisma queries are parameterized (Prisma is ORM-level safe against SQL injection).
- Error responses never include stack traces, password hashes or tokens.
- Coordinates, enums, string lengths and pagination are validated server-side.
- See `docs/ARCHITECTURE.md` for the full security model and honest limitations.
