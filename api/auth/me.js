// POST /api/auth/me
// Header: Authorization: Bearer <token>  OR  body: { token }
// Verifies signature + expiry, re-checks license against the env whitelist,
// returns current user state.

import { parseJsonBody, verifyToken, getBearerToken, getUser, isLicensed } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch (_) { body = {}; }

  const token = getBearerToken(req) || body.token;
  if (!token) {
    res.status(401).json({ error: 'missing token', code: 'no_token' });
    return;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'invalid or expired token', code: 'bad_token' });
    return;
  }

  try {
    const user = await getUser(payload.sub);
    if (!user) {
      res.status(404).json({ error: 'account no longer exists', code: 'no_user' });
      return;
    }
    const lic = isLicensed(payload.sub);
    res.status(200).json({
      ok: true,
      user: {
        name: user.name,
        email: payload.sub,
        role: user.role,
        licensed: lic.licensed,
        admin: lic.admin,
      },
    });
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: 'server error' });
  }
}
