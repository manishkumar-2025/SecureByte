# Testing Guide

CampusShield is tested on three levels. **All results shown here were produced by actually running the tests against a real PostgreSQL database** — nothing in this document is aspirational.

---

## 1. Automated backend tests (Jest + Supertest)

```bash
cd backend
npm test
```

Latest run (against PostgreSQL 17):

```
Test Suites: 6 passed, 6 total
Tests:       80 passed, 80 total
Time:        ~5 s
```

What each suite covers:

| Suite | Coverage |
|-------|----------|
| `tests/auth.test.js` | registration (role forced to STUDENT, hash not plaintext, hash never in responses), duplicate email 409, invalid email/weak password 422, login success, wrong password vs unknown email → identical generic 401 (no user enumeration), `/me`, missing/garbage token 401, expired token 401 `TOKEN_EXPIRED`, responder setup code (wrong 403 / correct 201 + RESPONDER role), client `role` field ignored |
| `tests/incidents.test.js` | creation defaults (NEW/MEDIUM), SOS forced to CRITICAL + SOS_ALERT, client CRITICAL rejected for non-SOS, invalid category/short title/short description 422, location stored + coordinate range checks (+ lat without lng), duplicate within window 409 with existing id, `/my` isolation between students, get-by-id: owner 200 / other student 403 / responder 200 / unknown 404 |
| `tests/access.test.js` | unauthenticated 401s, student blocked from responder queue / status patch / announcement creation (403), role header & body ignored (server-verified role), responder queue returns reporter name, filters (status/priority/isSos) + invalid filter 422, announcements RBAC |
| `tests/status.test.js` | full lifecycle NEW→ACKNOWLEDGED→IN_PROGRESS→RESOLVED with 3 history rows incl. notes + updater names, skipping steps 409, same-status 409, no reopening after RESOLVED, student cannot change status (403 + status unchanged), invalid value 422, unknown incident 404, transactional history written, student sees updated status via `/my` |
| `tests/security.test.js` | login returns access + refresh pair; refresh rotation issues a NEW pair; **replaying a rotated refresh token → 401**; garbage refresh token 401; logout revokes (idempotent 200); **account lockout: 5 failed logins → 423 even with the correct password, resets after expiry**; password change: wrong current 422, weak new 422, success → old password 401 / new password 200; push-token register requires auth, upserts (no duplicate rows), invalid platform 422, delete removes only caller's token; responder queue search `?q=` (title + reporter name) and pagination meta; student cannot use the responder queue (403) |
| `tests/v3.test.js` | **contacts**: CRUD + phone normalization, invalid phone 422, 5-contact cap, cross-user access → 404 (no existence leak), 401 unauthenticated; **check-ins**: SAFE history, NEEDS_HELP writes CHECK_IN_ALERT notifications for staff, invalid status/coords 422, staff view has 24 h summary + student 403; **safety points**: list/filter/geo-sort nearest-first/radius cut-off/invalid category 422; **notification center**: SOS writes staff rows, unread-count → mark-one → mark-all flow, cross-user read → 404, status change writes STATUS_UPDATE for reporter; **preferences**: defaults for new users, partial update persists, unknown key/non-boolean 422, muted sosAlerts still writes rows (only push is gated); **analytics**: responder+admin 200 / student 403, real byStatus/series7d data, avg resolution computed from a resolved incident; **admin directory**: sanitized fields (no passwordHash/notificationPrefs), responder/student 403, role filter + search; **photo upload**: owner attaches (file lands on disk, UUID path), non-owner 403, text file → 422 INVALID_PHOTO_TYPE, missing file 422, delete clears photoPath + second delete 422 |

### Test database

Tests read `TEST_DATABASE_URL` (falls back to
`postgresql://campusshield:campusshield_dev@localhost:5432/campusshield_test?schema=public`)
and wipe all tables between tests. Create it once (see docs/SETUP.md step 3) and apply migrations:

```bash
DATABASE_URL="postgresql://campusshield:campusshield_dev@localhost:5432/campusshield_test?schema=public" npx prisma migrate deploy
```

> ⚠ Tests point `DATABASE_URL` at the **test** database only. Your dev data is safe, but never aim tests at a production database.

---

## 2. Postman collection

Import `postman/CampusShield.postman_collection.json` into Postman
(File → Import), then:

1. Set the `baseUrl` collection variable (default `http://localhost:4000`).
2. Set `setupCode` if you configured `RESPONDER_SETUP_CODE`.
3. Run **Login Student** and **Login Responder** — the test scripts save
   `studentToken` / `responderToken` automatically.
4. Run requests in order. "Trigger SOS" and "Create Incident" save
   `incidentId` automatically for the responder requests.

The collection includes deliberate negative tests (401/403/409/422) so you can
demonstrate the security behaviour live during judging.

To verify rate limiting manually: send **Login** with a wrong password 11 times
in a row — the 11th returns `429 RATE_LIMITED` (limit: 10 failed / 15 min).

---

## 3. Simulated end-to-end demo (two devices / two sessions)

**Never use real emergency services to test. All alerts below are simulated data in your own database.**

1. Sign in as the student on device A (`student@campusshield.dev` / `Student@123`).
2. Press **EMERGENCY SOS** → watch the 3-2-1 countdown → let it complete (or cancel once to demo the false-alarm path, then repeat).
3. Confirm the "Alert sent" screen shows the incident ID and status **NEW**.
4. On device B (or Expo web: press `w`), sign in as the responder (`responder@campusshield.dev` / `Responder@123`).
5. The SOS appears at the top of the Responder Console with the red SOS tag. Tap it.
6. Add a note ("Security team dispatched") and tap **✓ Acknowledge**.
7. On device A, open **My Reports** — status now shows **Acknowledged**; open the incident to see the timeline entry with the responder's note.
8. Complete **In Progress → Resolved** and re-check device A.

This is exactly the 8-step "Definition of a Successful MVP" from the project brief — steps 1–8 are all demonstrated by this flow.

### New in v2: push + silent refresh demo ideas

- **Push notifications:** on device A (student), open Profile → *Enable push alerts* → allow. On device B (responder), acknowledge the SOS → device A shows a system notification ("Your report was seen"). Reverse direction works too: with the responder's push enabled, a new SOS on device A pops a notification on device B. Requires physical phones (not emulators) on the same backend.
- **Silent session renewal:** set `JWT_EXPIRES_IN=60s` in `.env`, restart the backend, sign in, wait a minute, then tap around — the app quietly refreshes its session instead of kicking you out (no re-login prompt).
- **Search:** in the Responder Console type "hostel" or a reporter name and press search on the keyboard — the queue filters server-side.
- **Offline banner:** turn off Wi-Fi on the phone → a red banner appears at the top of the app.
- **Account lockout:** type a wrong password 5 times on the login screen → the 6th attempt (even with the correct password) shows the lock message for 15 minutes (demo tip: restart the backend to reset faster, or wait it out).

### Security demonstration checklist (for judges)

| Attempt | Expected result |
|---------|----------------|
| Call responder queue with a student token | `403 FORBIDDEN` |
| Student tries to change status in the app | No such button + API `403` |
| Send `role: RESPONDER` inside the register body | Account is still STUDENT |
| Submit the same SOS twice quickly | Second call → `409 DUPLICATE_SUBMISSION` |
| Responder tries `NEW → RESOLVED` | `409 INVALID_STATUS_TRANSITION` |
| Use a token signed with a wrong secret | `401 TOKEN_INVALID` |
| Reuse a >12h old token | `401 TOKEN_EXPIRED` → app silently refreshes and retries |
| Replay an already-used refresh token | `401 INVALID_REFRESH_TOKEN` (rotation) |
| 5 wrong passwords, then the correct one | `423 ACCOUNT_LOCKED` |
| latitude = 999 in a report | `422 VALIDATION_ERROR` |

---

## 4. Mobile app testing notes

- The app cannot be "unit tested" in this repo yet — test it on a device via the simulated demo above (documented as a planned improvement).
- Test the **denied-location path**: deny the location permission in Android settings → SOS still submits, the landmark field appears.
- Test **offline**: stop the backend (or turn off Wi-Fi) → red connection banner appears; friendly network error on submit (no crash).
- Test **expired session**: set `JWT_EXPIRES_IN=60s` in `.env`, restart backend, sign in, wait → next request silently refreshes instead of logging you out; disable the refresh endpoint (`PUSH_DISABLED`-style isn't available for refresh) or wait 30 days to see the full sign-out path.
- Test **haptics**: with the phone on silent, the SOS countdown still vibrates — useful in a real emergency.
- Push notes: notifications work in Expo Go on physical devices; emulators cannot receive push. Expo Go push support is deprecated for future SDKs — production apps should build with EAS and configure FCM/APNs (documented in ARCHITECTURE.md).

---

## 5. Screenshots (to capture during your device test)

Take screenshots of each screen while testing and drop them into `docs/screenshots/`:

1. `login.png` 2. `register.png` 3. `student-home.png` 4. `sos-countdown.png`
5. `sos-sent.png` 6. `report-form.png` 7. `my-reports.png` 8. `incident-details.png`
9. `responder-dashboard.png` 10. `responder-incident.png` 11. `announcements.png` 12. `profile.png`

Then embed them in the README (`![Student Home](docs/screenshots/student-home.png)`).
Do **not** add screenshots you haven't actually captured.
