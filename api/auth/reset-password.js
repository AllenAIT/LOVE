// POST /api/auth/reset-password
// Two modes, both gated by admin token:
//
// Mode 1 (admin self-reset / change own password):
//   Header: Authorization: Bearer <admin-token>
//   Body:   { newPassword }
//
// Mode 2 (admin resets another user's password):
//   Header: Authorization: Bearer <admin-token>
//   Body:   { email, newPassword }
//
// Without an admin token this endpoint refuses everything. The user flow for
// "forgot password" is: user emails the admin → admin uses this endpoint
// (or the admin UI in the app) to issue a new password → admin passes it back.

import {
  parseJsonBody, getBearerToken, verifyToken,
  hashPassword, signToken, normalizeEmail,
  getUser, setUser, isLicensed,
} from '../_lib/auth.js';

export default async function handler(req, res){
  if(req.method !== 'POST'){ res.status(405).json({ error:'POST only' }); return; }

  const token = getBearerToken(req);
  if(!token){ res.status(401).json({ error:'missing token' }); return; }
  const payload = await verifyToken(token);
  if(!payload || !payload.admin){
    res.status(403).json({ error:'admin only' }); return;
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch(_){ res.status(400).json({ error:'invalid JSON' }); return; }

  const newPw = body.newPassword || '';
  if(!newPw || newPw.length < 6){
    res.status(400).json({ error:'newPassword must be at least 6 characters' }); return;
  }

  // Target user — defaults to the admin themself if no email is passed
  const targetEmail = normalizeEmail(body.email || payload.sub);
  try {
    const user = await getUser(targetEmail);
    if(!user){ res.status(404).json({ error:'no such user' }); return; }

    const { hash, salt } = await hashPassword(newPw);
    user.passHash = hash;
    user.passSalt = salt;
    user.passwordResetAt = Date.now();
    await setUser(targetEmail, user);

    // If admin reset their own password, mint a new token so they don't get
    // logged out on the next /me call (old hash invalid). For other users, the
    // admin just communicates the new password offline.
    let newToken = null;
    if(targetEmail === payload.sub){
      const lic = isLicensed(targetEmail);
      newToken = await signToken({
        sub: targetEmail,
        name: user.name, role: user.role,
        licensed: lic.licensed, admin: lic.admin,
      });
    }

    res.status(200).json({
      ok: true,
      email: targetEmail,
      token: newToken,
      message: targetEmail === payload.sub
        ? 'your password has been changed'
        : `password for ${targetEmail} has been reset · share it with them out-of-band`,
    });
  } catch(err){
    console.error('reset-password error', err);
    res.status(500).json({ error:'server error', detail: String(err && err.message || err) });
  }
}
