// POST /api/auth/login
// Body: { email, password }
// Verifies password, returns a signed session token if correct.

import {
  parseJsonBody, normalizeEmail, isValidEmail,
  verifyPassword, signToken,
  getUser, isLicensed,
} from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch (_) { res.status(400).json({ error: 'invalid JSON' }); return; }

  const email = normalizeEmail(body.email);
  const pw    = body.password || '';

  if (!email || !pw) {
    res.status(400).json({ error: 'missing email or password' }); return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'invalid email' }); return;
  }

  try {
    const user = await getUser(email);
    if (!user) {
      // 404 specifically so the frontend can offer to auto-register migrated users
      res.status(404).json({ error: 'no account for this email', code: 'no_user' });
      return;
    }
    const ok = await verifyPassword(pw, user.passHash, user.passSalt);
    if (!ok) {
      res.status(401).json({ error: 'wrong password' });
      return;
    }

    // Re-evaluate license on every login — admin may have updated the whitelist
    const lic = isLicensed(email);

    const token = await signToken({
      sub: email,
      name: user.name,
      role: user.role,
      licensed: lic.licensed,
      admin: lic.admin,
    });

    res.status(200).json({
      ok: true,
      token,
      user: {
        name: user.name, email, role: user.role,
        licensed: lic.licensed, admin: lic.admin,
      },
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'server error', detail: String(err && err.message || err) });
  }
}
