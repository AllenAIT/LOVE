// ════════════════════════════════════════════════════════════════════════════
// Inner Weather build pipeline
// Source: index.html (single file, all inline) → Output: dist/index.html
// Steps per <script> block:
//   1. esbuild minify   — safe, ~50% size reduction, mangles local vars
//   2. javascript-obfuscator (conservative)
//        — string array extraction + mangled identifier names
//        — NO controlFlowFlattening (breaks event handlers)
//        — NO renameGlobals (breaks HTML→JS bridges via getElementById names)
//        — NO selfDefending / debugProtection (false sense of security)
//
// Run:
//   npm install
//   npm run build         # full minify + obfuscate
//   npm run build:safe    # minify only (for debugging if obfuscation breaks something)
//
// Vercel will run `npm run build` automatically (see vercel.json).
// ════════════════════════════════════════════════════════════════════════════

import { promises as fs } from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import Obfuscator from 'javascript-obfuscator';

const ROOT      = process.cwd();
const SRC_HTML  = path.join(ROOT, 'index.html');
const OUT_DIR   = path.join(ROOT, 'dist');
const OUT_HTML  = path.join(OUT_DIR, 'index.html');
const SRC_API   = path.join(ROOT, 'api');
const OUT_API   = path.join(OUT_DIR, 'api');

// CLI: --safe / --no-obfuscate, or env OBFUSCATE=false
const OBFUSCATE = !(
  process.env.OBFUSCATE === 'false'
  || process.argv.includes('--safe')
  || process.argv.includes('--no-obfuscate')
);

const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,       // can break event callbacks + perf
  deadCodeInjection: false,
  identifierNamesGenerator: 'mangled',
  renameGlobals: false,                // CRITICAL: must keep so DOM refs (getElementById names) work
  stringArray: true,
  stringArrayThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  splitStrings: false,
  transformObjectKeys: false,          // keep object keys readable so HTML interop survives
  unicodeEscapeSequence: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  log: false,
  target: 'browser',
};

const COPYRIGHT_BANNER =
`/*! Inner Weather © 2026 Allen Hong · IG @a.i.a.l.l.e.n · ai.allen.task@gmail.com
   Proprietary. Unauthorised copying / modification / removal of watermark prohibited.
   See LICENSE.md for terms. */
`;

async function processScript(content, idx) {
  // 1. esbuild minify
  const { code: minified } = await esbuild.transform(content, {
    minify: true,
    target: 'es2020',
    loader: 'js',
    legalComments: 'none',
  });

  // 2. javascript-obfuscator (optional). Each script gets a UNIQUE seed so the
  // generated string-array variable names don't collide across blocks (the
  // exact bug that broke FAB buttons when two obfuscated scripts shared the
  // page).
  let final = minified;
  if (OBFUSCATE) {
    try {
      const opts = { ...OBF_OPTIONS, seed: Math.floor(Math.random() * 0x7fffffff) + idx * 7919 };
      final = Obfuscator.obfuscate(minified, opts).getObfuscatedCode();
    } catch (err) {
      console.warn(`Obfuscation failed for script ${idx}, using minified version. Reason:`, err.message);
      final = minified;
    }
  }
  return final;
}

async function build() {
  const t0 = Date.now();
  console.log(`▶ Reading ${path.relative(ROOT, SRC_HTML)}`);
  const html = await fs.readFile(SRC_HTML, 'utf8');
  const origSize = html.length;

  // Walk through <script>…</script> blocks. We must NOT match escaped occurrences
  // (e.g. <\/script> inside string templates). Plain string match is enough since
  // those escaped versions are not real tags.
  const segments = [];
  let cursor = 0;
  let blockCount = 0;
  const openRe = /<script>/g;
  let openMatch;
  while ((openMatch = openRe.exec(html)) !== null) {
    const openIdx = openMatch.index;
    const contentStart = openIdx + '<script>'.length;
    // find the next </script> (not the escaped form)
    const closeIdx = html.indexOf('</script>', contentStart);
    if (closeIdx < 0) {
      throw new Error(`<script> opened at ${openIdx} but no </script> found`);
    }
    segments.push({ type: 'html', text: html.slice(cursor, contentStart) });
    segments.push({ type: 'js',   text: html.slice(contentStart, closeIdx) });
    segments.push({ type: 'html', text: '</script>' });
    cursor = closeIdx + '</script>'.length;
    blockCount++;
    openRe.lastIndex = cursor;
  }
  segments.push({ type: 'html', text: html.slice(cursor) });

  console.log(`▶ Found ${blockCount} inline <script> block(s)`);

  // Process JS blocks in parallel
  let savedBytes = 0;
  await Promise.all(
    segments.map(async (seg, i) => {
      if (seg.type === 'js') {
        const before = seg.text.length;
        const processed = await processScript(seg.text, i);
        savedBytes += before - processed.length;
        seg.text = '\n' + COPYRIGHT_BANNER + processed + '\n';
        console.log(`  · script ${i}: ${before} → ${processed.length} bytes (-${((1 - processed.length/before)*100).toFixed(0)}%)`);
      }
    })
  );

  let outHtml = segments.map(s => s.text).join('');

  // Ensure output dir exists, write
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_HTML, outHtml);

  // Copy api/ into dist/api/ so Vercel functions deploy
  await copyDir(SRC_API, OUT_API);

  // Optionally copy any markdown / static the user wants exposed (skip by default)

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Build complete in ${elapsed}s`);
  console.log(`  in:  ${formatKB(origSize)}  →  out: ${formatKB(outHtml.length)}  (script body saved ~${formatKB(savedBytes)})`);
  console.log(`  obfuscate: ${OBFUSCATE ? 'on' : 'off (safe mode)'}`);
  console.log(`  output:    ${path.relative(ROOT, OUT_HTML)}`);
}

function formatKB(n) {
  return (n / 1024).toFixed(1) + ' KB';
}

async function copyDir(src, dst) {
  try {
    await fs.access(src);
  } catch {
    console.log(`▶ ${path.relative(ROOT, src)} not present, skipping copy`);
    return;
  }
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const sp = path.join(src, e.name);
    const dp = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(sp, dp);
    else await fs.copyFile(sp, dp);
  }
  console.log(`▶ Copied ${path.relative(ROOT, src)}/ → ${path.relative(ROOT, dst)}/`);
}

build().catch(err => {
  console.error('\n✗ Build failed:', err);
  process.exit(1);
});
