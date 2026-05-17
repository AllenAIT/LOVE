// Vercel serverless: POST /api/license-check
// Checks a user's email against the LICENSED_EMAILS env var whitelist.
// Returns a short-lived signed token if licensed (so frontend can skip watermarks).
//
// Env vars to set on Vercel:
//   LICENSED_EMAILS   — comma-separated allowed emails. Optional ":Name" suffix.
//                       e.g. "alice@x.com:Alice Studio, bob@y.com:Bob VJ"
//   LICENSE_SECRET    — HMAC secret for signing tokens (any random string, keep private)
//
// The super-admin email ai.allen.task@gmail.com is ALWAYS licensed (hardcoded).

import crypto from 'crypto';

const SUPER_ADMIN = 'ai.allen.task@gmail.com';

function normalize(email){
  return (email || '').trim().toLowerCase();
}

function parseWhitelist(raw){
  // "alice@x.com:Alice, bob@y.com" → { 'alice@x.com': 'Alice', 'bob@y.com': null }
  const out = {};
  if(!raw) return out;
  for(const part of raw.split(/[,\n]/)){
    const trimmed = part.trim();
    if(!trimmed) continue;
    const [emailRaw, name] = trimmed.split(':');
    const email = normalize(emailRaw);
    if(email) out[email] = name ? name.trim() : null;
  }
  return out;
}

function signToken(payload, secret){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.status(405).json({ error:'POST only' });
    return;
  }
  let body = req.body;
  if(typeof body === 'string'){ try { body = JSON.parse(body); } catch(_){ body = {}; } }
  const email = normalize(body && body.email);
  if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    res.status(400).json({ error:'invalid email' });
    return;
  }

  const whitelist = parseWhitelist(process.env.LICENSED_EMAILS);
  const isAdmin = email === SUPER_ADMIN;
  const licensed = isAdmin || (email in whitelist);

  if(!licensed){
    res.status(200).json({ licensed:false });
    return;
  }

  const secret = process.env.LICENSE_SECRET || 'change-me-please';
  const exp = Date.now() + 30 * 24 * 3600 * 1000;  // 30 days
  const token = signToken({ email, admin: isAdmin, exp }, secret);

  res.status(200).json({
    licensed: true,
    admin: isAdmin,
    name: isAdmin ? 'Allen Hong' : (whitelist[email] || null),
    expires: exp,
    token,
  });
}
