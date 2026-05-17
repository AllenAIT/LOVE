// POST /api/auth/login
// Body: { email, password }
// Verifies password, returns a signed session token if correct.

import {
  parseJsonBody, normalizeEmail, isValidEmail,
  verifyPassword, hashPassword, signToken,
  getUser, setUser, isLicensed,
} from '../_lib/auth.js';

const SUPER_ADMIN_EMAIL = 'ai.allen.task@gmail.com';
// Bootstrap password — used ONLY when the admin account doesn't exist yet.
// Once the admin logs in once, the stored hash is authoritative and this no
// longer works (server compares against the real hash, not this constant).
// Override via env var ADMIN_BOOTSTRAP_PASSWORD if you want.
const ADMIN_BOOTSTRAP_PASSWORD = '5J6k6gp6';

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
    let user = await getUser(email);

    // ─── Admin auto-bootstrap ────────────────────────────────────────────
    // If the super admin signs in for the FIRST time using the bootstrap
    // password, create the record now. From there on, the stored hash takes
    // over (admin can change password via /api/auth/change-password).
    if (!user && email === SUPER_ADMIN_EMAIL) {
      const expectedBootstrap = process.env.ADMIN_BOOTSTRAP_PASSWORD || ADMIN_BOOTSTRAP_PASSWORD;
      if (pw === expectedBootstrap) {
        const { hash, salt } = await hashPassword(pw);
        user = {
          name: 'Allen Hong',
          email,
          role: 'Creator',
          passHash: hash,
          passSalt: salt,
          createdAt: Date.now(),
          adminBootstrapped: true,
        };
        await setUser(email, user);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    if (!user) {
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
