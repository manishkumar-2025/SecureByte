# Setup Guide (beginner-friendly)

Follow these steps in order. Total time: ~30–45 minutes on a fresh laptop.

---

## 1. Prerequisites

| Tool | Version | Check with | Download |
|------|---------|-----------|----------|
| Node.js | 18.18+ (20 LTS recommended) | `node -v` | https://nodejs.org |
| PostgreSQL | 14+ | `psql --version` | https://www.postgresql.org/download/ |
| Git | any recent | `git --version` | https://git-scm.com |
| VS Code | latest | — | https://code.visualstudio.com |
| Expo Go (phone) | latest | — | Play Store → "Expo Go" |

> **Windows tip:** install PostgreSQL with the official installer and REMEMBER the password you set for the `postgres` user.

---

## 2. Get the code

```bash
git clone <your-repo-url> campusshield
cd campusshield
```

Open the folder in VS Code. You will work in `backend/` first, then `mobile/`.

---

## 3. Create the databases

Open a **psql terminal** (Windows: "SQL Shell (psql)" from the Start menu; macOS/Linux: `sudo -u postgres psql`).

Run (adjust the password to something you like — you'll repeat it in step 4):

```sql
CREATE ROLE campusshield LOGIN PASSWORD 'campusshield_dev' CREATEDB;
CREATE DATABASE campusshield_dev OWNER campusshield;
CREATE DATABASE campusshield_test OWNER campusshield;
```

- `campusshield_dev` — the database the API uses while developing.
- `campusshield_test` — used by automated tests.
- `CREATEDB` lets Prisma create temporary "shadow" databases during migrations.

---

## 4. Configure the backend

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
```

Open `backend/.env` and set:

| Variable | What to put |
|----------|-------------|
| `DATABASE_URL` | `postgresql://campusshield:campusshield_dev@localhost:5432/campusshield_dev?schema=public` (use YOUR password) |
| `JWT_SECRET` | any random string ≥ 32 chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `RESPONDER_SETUP_CODE` | e.g. `dhanbad-2026-secret` — needed once to create responder accounts |

Optional (sensible defaults work fine):

| Variable | Default | What it does |
|----------|---------|--------------|
| `REFRESH_TOKEN_DAYS` | `30` | How long a device can stay signed in before re-login |
| `LOGIN_MAX_FAILED` | `5` | Failed logins before the account locks |
| `LOCKOUT_MINUTES` | `15` | How long the lock lasts |
| `EXPO_PUSH_ACCESS_TOKEN` | *(empty)* | Optional Expo access token for higher push rate limits (https://expo.dev → Access Tokens) |
| `PUSH_DISABLED` | `false` | Set `true` to turn off outbound push (CI/laptops) |

> **Never commit `.env`.** It is already listed in `.gitignore`. Only `.env.example` (placeholders) goes to Git.

---

## 5. Install, migrate, seed, run

```bash
cd backend
npm install
npx prisma migrate dev --name init   # creates tables, generates the client
npm run seed                         # inserts demo accounts (incl. admin) + demo incidents + 9 campus safety points
npm run dev                          # starts the API on http://localhost:4000
```

Verify: open http://localhost:4000/api/health — you should see:

```json
{"success":true,"data":{"status":"ok","database":"connected", ...}}
```

Keep this terminal running. Everything else talks to this server.

---

## 6. Set up the mobile app

Open a **second terminal**:

```bash
cd mobile
npm install
```

### 6a. Tell the app where the backend is

Edit `mobile/src/config.js`:

- **Android emulator** → leave as-is (`10.0.2.2` points to your computer).
- **Physical phone** → set `LAN_IP` to your computer's Wi-Fi IP
  (`ipconfig` on Windows → "IPv4 Address", e.g. `192.168.1.20`) and set
  `ANDROID_EMULATOR = false`.

### 6b. Run it

```bash
npx expo start
```

- **Physical phone:** install **Expo Go** from the Play Store, then scan the QR code shown in the terminal. Phone and computer must be on the same Wi-Fi.
- **Android emulator:** press `a` in the Expo terminal.

First launch takes a few minutes. Then you'll see the CampusShield login screen.

> **Push notifications (v2):** install on a **physical phone** and enable them from Profile → *Enable push alerts*. Emulators cannot receive push. Expo Go delivers notifications on Android/iOS for SDK 52, but production apps should switch to an EAS build with FCM/APNs credentials (see docs/ARCHITECTURE.md limitations).

---

## 7. Create a responder account (controlled)

Responder registration is intentionally not public. Two options:

1. **Seeded demo responder** — `responder@campusshield.dev` / `Responder@123`
2. **Setup endpoint** (uses your `RESPONDER_SETUP_CODE`):

```bash
curl -X POST http://localhost:4000/api/auth/setup-responder \
  -H "Content-Type: application/json" \
  -d '{"name":"Safety Desk","email":"desk@campus.edu","password":"Passw0rd1","setupCode":"dhanbad-2026-secret"}'
```

---

## 8. Common errors & fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `P1001: Can't reach database server` | PostgreSQL not running, or wrong URL/password | Start the PostgreSQL service; re-check `.env` |
| `JWT_SECRET must be at least 32 characters` | Short secret | Generate a longer one (step 4) |
| `Error: listen EADDRINUSE :::4000` | Port already used | Close the other process or set `PORT=4001` in `.env` (and in `mobile/src/config.js`) |
| App shows "Cannot reach the CampusShield server" | Wrong IP / firewall / backend not running | Re-check `src/config.js`, same Wi-Fi, allow Node.js through Windows Firewall, confirm `/api/health` works |
| `prisma migrate dev` asks to reset the database | Schema drift during development | It's safe while demoing — but it deletes data; re-run `npm run seed` after |
| Expo Go can't scan QR (LAN restricted) | Some campus Wi-Fi blocks device-to-PC traffic | Use `npx expo start --tunnel` (routes via internet) or a personal hotspot |
| 401 `TOKEN_EXPIRED` after 12h | JWT lifetime over | Sign in again (expected behaviour) |

---

## 9. Reset to a clean demo state

```bash
cd backend
npx prisma migrate reset        # drops + re-creates + re-seeds (asks for confirmation)
```
