# Server-side auth setup

This app now has real user accounts stored in **Upstash Redis** (not localStorage).
Passwords are hashed server-side with PBKDF2-SHA256 (100k iterations). Sessions
are HMAC-signed tokens valid for 30 days.

## What changed

| Before | Now |
|---|---|
| Account in `localStorage` only | Account in Redis, durable across devices |
| Password hashed locally (SHA-256, theatre) | Password hashed server-side (PBKDF2 100k rounds) |
| `/api/license-check` was the only endpoint | `/api/auth/register`, `/api/auth/login`, `/api/auth/me` + legacy `/api/license-check` |
| Token = none, watermark gated by email match | Token = HMAC-signed JWT-ish, watermark gated by server-verified license claim |

## One-time setup

### 1 · Create an Upstash Redis database (free)

1. Sign up at <https://console.upstash.com> (Google / GitHub login OK)
2. **Create Database** → name `inner-weather` → pick the region nearest your Vercel
   region (usually `iad1` / `fra1` / `sin1`)
3. After creation, scroll to **REST API** section. Copy two values:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Free tier: **10,000 commands / day · 256 MB**. More than enough for hundreds of users.

### 2 · Set environment variables on Vercel

Vercel Dashboard → your project → **Settings → Environment Variables**.
Add ALL of these (Production + Preview + Development for each):

| Key | Value | What for |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | from step 1 | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | from step 1 | Upstash REST token |
| `LICENSE_SECRET` | random 32+ char string | Signs session tokens (HMAC). **Don't change after launch — would invalidate all sessions.** |
| `LICENSED_EMAILS` | `alice@x.com:Alice Studio, bob@y.com:Bob VJ` | Comma-separated whitelist. Whoever's email matches gets watermark-free. |
| `GROQ_API_KEY` | from console.groq.com | AI sketch generator (free) |

**Optional (only if you use them):**

| Key | What for |
|---|---|
| `GEMINI_API_KEY` | Alt free AI provider |
| `ANTHROPIC_API_KEY` | Paid Claude |
| `OPENAI_API_KEY` | Paid GPT-4o |

### 3 · Generate `LICENSE_SECRET` if you haven't yet

In your local terminal:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Copy the output, paste into Vercel env var. Keep this private.

### 4 · Redeploy

After adding env vars, trigger a redeploy:

- **Easiest**: in Vercel dashboard → Deployments → latest → ⋯ → **Redeploy**
- **Or**: push any commit to GitHub

## Local development

Add the env vars to a local `.env.local` file (gitignored):

```
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
LICENSE_SECRET=<your secret>
LICENSED_EMAILS=ai.allen.task@gmail.com:Allen Hong
GROQ_API_KEY=gsk_...
```

Then:

```bash
npm install
vercel dev      # runs serverless functions locally too
```

Open `http://localhost:3000` — the gate will hit `/api/auth/*` against your real Upstash.

## What each endpoint does

### `POST /api/auth/register`
Body: `{ name, email, password, role }`
Creates a user record in Redis (`user:<email>`). Returns `{ token, user }`.
Errors: `409 exists` if email already registered.

### `POST /api/auth/login`
Body: `{ email, password }`
Verifies PBKDF2 hash. Returns `{ token, user }`.
Errors: `404 no_user`, `401 wrong password`.

### `POST /api/auth/me`
Header: `Authorization: Bearer <token>` (or token in body)
Verifies HMAC signature + expiry. Returns current user + fresh license state.
Errors: `401 no_token / bad_token`, `404 no_user`.

### `POST /api/license-check` (legacy)
Kept for backwards compatibility. Token-aware: prefers Bearer auth, falls back to
read-only email probe (no password required). The new gate uses `/api/auth/me`
instead.

## Migration for existing users

Users who registered under the old localStorage-only system are auto-migrated on
their next login attempt:

1. They open the app → gate shows login pre-filled with their email
2. They enter their password (the one they originally set locally)
3. Frontend calls `/api/auth/login` → 404 `no_user`
4. Frontend auto-calls `/api/auth/register` with the same email + the
   typed password + name/role from localStorage
5. Server creates the account; token returned; user is in.

No user-facing prompt — the migration is transparent. They'd see "creating
account…" for a moment, then they're in.

## Token storage

Tokens live in `localStorage` under key `iw-token-v1`. **Not HttpOnly cookies**
(simpler, but XSS-vulnerable). For a SaaS launch later, swap to cookies. Token
expires after 30 days; expired tokens are silently rejected by `/api/auth/me`
and the gate re-prompts for login.

## Resetting a forgotten password

There's no email-based password reset yet (would need a transactional email
provider). For now:

1. User contacts you (`ai.allen.task@gmail.com`)
2. You log into the Upstash console → Data Browser → find `user:<email>` → delete it
3. User can now register again with a new password

Or write a small admin endpoint later — let me know.

## Security model — honest assessment

- **Real protection**: PBKDF2 100k rounds, HMAC-signed tokens, server-side license
  check. Attacker can't forge tokens without `LICENSE_SECRET`.
- **Soft spots**:
  - `localStorage` token is readable by any script on your domain (XSS risk)
  - No rate limit on login (brute force possible — Redis-based rate limit is
    a future addition)
  - No email verification (anyone can register any email)
  - No password reset by email
- **What this protects against**: casual scraping, basic impersonation,
  unauthenticated API access. Enough for a beta. Add rate limiting + cookies +
  email verification before commercial launch.

— Allen Hong · IG @a.i.a.l.l.e.n · ai.allen.task@gmail.com
