// POST /api/license-check
// Legacy endpoint kept for backwards compatibility with old frontend builds.
// Prefers /api/auth/me — this just re-uses the token if present.
// Body: { email }  (deprecated path, no auth required, used for read-only license probe)

import {
  parseJsonBody, normalizeEmail, isValidEmail,
  isLicensed, verifyToken, getBearerToken,
} from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch (_) { body = {}; }

  // Prefer token-based check
  const token = getBearerToken(req) || body.token;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      const lic = isLicensed(payload.sub);
      res.status(200).json({
        licensed: lic.licensed,
        admin: lic.admin,
        name: lic.displayName || payload.name,
        email: payload.sub,
      });
      return;
    }
  }

  // Fallback: read-only probe by email (no password). Useful for the old gate
  // that doesn't yet have the token flow.
  const email = normalizeEmail(body.email);
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'invalid email' });
    return;
  }
  const lic = isLicensed(email);
  res.status(200).json({
    licensed: lic.licensed,
    admin: lic.admin,
    name: lic.displayName,
    email,
  });
}
