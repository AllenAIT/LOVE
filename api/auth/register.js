// POST /api/auth/register
// Body: { name, email, password, role }
// Creates the account in Redis, returns a signed session token.

import {
  parseJsonBody, normalizeEmail, isValidEmail,
  hashPassword, signToken,
  userExists, setUser, isLicensed,
} from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch (_) { res.status(400).json({ error: 'invalid JSON' }); return; }

  const name  = (body.name  || '').trim();
  const email = normalizeEmail(body.email);
  const role  = (body.role  || '').trim();
  const pw    = body.password || '';

  if (!name || !email || !role || !pw) {
    res.status(400).json({ error: 'missing field' }); return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'invalid email' }); return;
  }
  if (pw.length < 6) {
    res.status(400).json({ error: 'password must be at least 6 characters' }); return;
  }
  if (name.length > 80 || role.length > 80) {
    res.status(400).json({ error: 'field too long' }); return;
  }

  try {
    if (await userExists(email)) {
      res.status(409).json({ error: 'account already exists — please sign in instead', code: 'exists' });
      return;
    }

    const { hash, salt } = await hashPassword(pw);
    const lic = isLicensed(email);

    const user = {
      name, email, role,
      passHash: hash,
      passSalt: salt,
      createdAt: Date.now(),
      // Licensed flag is recomputed on every /me hit, so this is just a snapshot
      licensed: lic.licensed,
      admin: lic.admin,
    };
    await setUser(email, user);

    const token = await signToken({
      sub: email,
      name,
      role,
      licensed: lic.licensed,
      admin: lic.admin,
    });

    res.status(200).json({
      ok: true,
      token,
      user: { name, email, role, licensed: lic.licensed, admin: lic.admin },
    });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'server error', detail: String(err && err.message || err) });
  }
}
