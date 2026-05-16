# Deploying Inner Weather on Vercel

`Inner Weather v2.html` is a single-file app that uses one optional AI feature (the **Imagine** text-to-mood translator at the top of the panel).

In the Claude artifact runtime, Imagine talks to Claude directly via `window.claude.complete()`. On Vercel that helper does not exist, so the app falls back to a serverless function at `POST /api/imagine`. The function lives in **`api/imagine.js`** and is auto-detected by Vercel.

---

## 1. Push the project to a Git repo

Make sure your repo contains at least:

```
Inner Weather v2.html
api/imagine.js
CUSTOM_EFFECTS.md
```

(Other HTML files in the project are optional sister versions — you can keep them or strip them.)

## 2. Import the repo in Vercel

- New Project → pick the repo → Framework: **Other** (no build step needed)
- Output directory: project root
- Vercel will detect `api/imagine.js` automatically as a serverless function

## 3. Set the API key

Vercel → your project → **Settings → Environment Variables**:

| Name                | Value                             | Environments |
|---------------------|-----------------------------------|--------------|
| `ANTHROPIC_API_KEY` | your Anthropic API key            | Production + Preview |

Redeploy after adding the var.

## 4. Map "/" to the HTML (optional)

Vercel serves files as-is, so you can hit `https://yourapp.vercel.app/Inner%20Weather%20v2.html`.

If you want `/` to load the app, add a `vercel.json` at the project root:

```json
{
  "rewrites": [
    { "source": "/", "destination": "/Inner Weather v2.html" }
  ]
}
```

…or rename the file to `index.html`.

---

## What works on Vercel vs. the artifact runtime

| Feature                    | Artifact (claude.ai) | Vercel |
|---------------------------|---------------------|--------|
| All visual modes / Camera / Typography / VJ | ✓ | ✓ |
| Recording (canvas → MP4/WebM)               | ✓ | ✓ |
| Presets / phrases / custom effects (per-user, localStorage) | ✓ | ✓ |
| Export / Import JSON                         | ✓ | ✓ |
| **Imagine** (text → mood)                    | ✓ (`window.claude`) | ✓ (via `/api/imagine`) |

Everything else is pure browser code — no backend needed.

---

## Troubleshooting

- **Imagine button does nothing on Vercel** → check `ANTHROPIC_API_KEY` is set; redeploy.
- **CORS or 404 on `/api/imagine`** → confirm the file is committed at the **exact** path `api/imagine.js` and the project is redeployed.
- **Camera doesn't start on Vercel** → modern browsers require HTTPS for `getUserMedia`. Vercel serves HTTPS by default, so this should just work; if not, check the site is opened via `https://`, not `http://`.
- **MediaPipe model load fails** → models are fetched from `cdn.jsdelivr.net` and `storage.googleapis.com`; if a corporate network blocks those, face/hand FX will silently no-op.
