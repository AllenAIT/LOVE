// POST /api/auth/change-password
// User-driven password change (themselves only).
// Header: Authorization: Bearer <token>
// Body:   { currentPassword, newPassword }
// Returns a new token (so the session continues even though the hash rotated).

import {
  parseJsonBody, getBearerToken, verifyToken,
  hashPassword, verifyPassword, signToken,
  getUser, setUser, isLicensed,
} from '../_lib/auth.js';

export default async function handler(req, res){
  if(req.method !== 'POST'){ res.status(405).json({ error:'POST only' }); return; }

  const token = getBearerToken(req);
  if(!token){ res.status(401).json({ error:'missing token' }); return; }
  const payload = await verifyToken(token);
  if(!payload){ res.status(401).json({ error:'invalid or expired token' }); return; }

  let body;
  try { body = await parseJsonBody(req); }
  catch(_){ res.status(400).json({ error:'invalid JSON' }); return; }

  const currentPw = body.currentPassword || '';
  const newPw     = body.newPassword || '';
  if(!currentPw || !newPw){
    res.status(400).json({ error:'missing currentPassword or newPassword' }); return;
  }
  if(newPw.length < 6){
    res.status(400).json({ error:'new password must be at least 6 characters' }); return;
  }
  if(currentPw === newPw){
    res.status(400).json({ error:'new password must differ from current' }); return;
  }

  try {
    const user = await getUser(payload.sub);
    if(!user){ res.status(404).json({ error:'account no longer exists' }); return; }

    const ok = await verifyPassword(currentPw, user.passHash, user.passSalt);
    if(!ok){ res.status(401).json({ error:'current password is incorrect' }); return; }

    const { hash, salt } = await hashPassword(newPw);
    user.passHash = hash;
    user.passSalt = salt;
    user.passwordChangedAt = Date.now();
    delete user.adminBootstrapped;  // clear the bootstrap flag once admin changed pw
    await setUser(payload.sub, user);

    const lic = isLicensed(payload.sub);
    const newToken = await signToken({
      sub: payload.sub,
      name: user.name, role: user.role,
      licensed: lic.licensed, admin: lic.admin,
    });

    res.status(200).json({ ok:true, token: newToken });
  } catch(err){
    console.error('change-password error', err);
    res.status(500).json({ error:'server error', detail: String(err && err.message || err) });
  }
}
