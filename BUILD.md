# Build & deployment

This project keeps a single-file dev source (`index.html`) and produces a
**minified + obfuscated** `dist/index.html` for deployment. Original source is
never published.

## One-time setup

```bash
npm install
```

This pulls in `esbuild` and `javascript-obfuscator` (both dev-only).

## Day-to-day development

Just open `index.html` directly in a browser — no build needed for local work.
The dev source stays unobfuscated so you can debug it.

For the AI / license features to work locally, run with the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

## Production build

```bash
npm run build
```

Output goes to `dist/`:

```
dist/
├── index.html      ← minified + obfuscated, ~50% smaller
└── api/            ← serverless functions copied verbatim
    ├── imagine.js
    └── license-check.js
```

### Safer "no-obfuscation" build

If obfuscation breaks something (rare with current settings), bypass it:

```bash
npm run build:safe
```

Only minification is applied. Useful for debugging suspected breakage.

## Deploying to Vercel

`vercel.json` already configures:

- `buildCommand: npm run build`
- `outputDirectory: dist`
- `/` rewrites to `/index.html`

Push to GitHub → Vercel auto-detects + runs the build.

### Required environment variables

| Variable           | Required for | Notes |
|--------------------|--------------|-------|
| `GROQ_API_KEY`     | AI sketch (free) | Recommended. https://console.groq.com |
| `GEMINI_API_KEY`   | AI sketch alt    | Alternative free option |
| `ANTHROPIC_API_KEY`| AI sketch (paid) | Highest quality |
| `OPENAI_API_KEY`   | AI sketch (paid) | |
| `LICENSED_EMAILS`  | Whitelist users  | Format: `alice@x.com:Alice Studio, bob@y.com:Bob VJ` |
| `LICENSE_SECRET`   | License tokens   | Any random string ≥ 32 chars |

After changing any env var, redeploy (Vercel does this automatically when env
vars change on the dashboard).

## How obfuscation works

Each inline `<script>` block in `index.html` is processed independently:

1. **esbuild minify** — mangles local variable names, strips comments,
   collapses whitespace. Safe.
2. **javascript-obfuscator** with conservative settings:
   - `stringArray: true` — string literals moved into an indexed array
   - `identifierNamesGenerator: mangled` — variables become `a`, `b`, `c`…
   - `renameGlobals: false` — globals stay readable so HTML/JS bridges work
   - `controlFlowFlattening: false` — would break event listeners + add perf cost
   - `transformObjectKeys: false` — keeps object property access predictable

The result is **significantly harder to read** but a determined reader with
DevTools can still reverse it. Obfuscation is a deterrent, not a vault. The
real protections are the **LICENSE.md** legal terms + the **watermark**
+ **registration gate** + **license email whitelist** which all stack.

## Verifying the build

After `npm run build`, open `dist/index.html` directly in a browser. The app
should work identically to the source `index.html`. If anything breaks:

1. Try `npm run build:safe` — confirms obfuscation is the culprit
2. If safe build also broke, the issue is in `esbuild` minify (rare)
3. Check the console for errors; report which feature fails

— Allen Hong · IG @a.i.a.l.l.e.n · ai.allen.task@gmail.com
