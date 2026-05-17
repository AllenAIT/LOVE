// Shared auth utilities for /api/auth/* endpoints.
// Files in api/_lib/ are ignored by Vercel as serverless functions but can be
// imported by sibling files. Keeps endpoints small and consistent.

import { Redis } from '@upstash/redis';
import { webcrypto as crypto } from 'crypto';

const SUPER_ADMIN = 'ai.allen.task@gmail.com';
const PBKDF2_ITERATIONS = 100_000;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;  // 30 days

// ───────── Upstash client ─────────
let _redis = null;
export function redis() {
  if (_redis) return _redis;
  // Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from env automatically
  _redis = Redis.fromEnv();
  return _redis;
}

// ───────── Email handling ─────────
export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}
export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// ───────── License (env-var whitelist) ─────────
export function isLicensed(email) {
  if (email === SUPER_ADMIN) return { licensed: true, admin: true, displayName: 'Allen Hong' };
  const raw = process.env.LICENSED_EMAILS || '';
  for (const part of raw.split(/[,\n]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [eRaw, name] = trimmed.split(':');
    if (normalizeEmail(eRaw) === email) {
      return { licensed: true, admin: false, displayName: name ? name.trim() : null };
    }
  }
  return { licensed: false, admin: false, displayName: null };
}

// ───────── Password hashing (PBKDF2-SHA256) ─────────
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i*2, 2), 16);
  return out;
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey, 256
  );
  return {
    salt: saltHex || bytesToHex(salt),
    hash: bytesToHex(new Uint8Array(bits)),
  };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ───────── HMAC token (compact JWT-ish) ─────────
function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

async function hmac(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return bytesToBase64Url(new Uint8Array(sig));
}
function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return Buffer.from(bin, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function requireSecret() {
  const s = process.env.LICENSE_SECRET;
  if (!s || s.length < 16) {
    throw new Error('LICENSE_SECRET env var missing or too short — set 32+ random chars on Vercel');
  }
  return s;
}

export async function signToken(payload) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp, iat: Date.now() }));
  const sig = await hmac(requireSecret(), body);
  return `${body}.${sig}`;
}

export async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(requireSecret(), body);
  if (!timingSafeEqual(sig, expected)) return null;
  let payload;
  try { payload = JSON.parse(base64UrlDecode(body)); } catch (_) { return null; }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

// ───────── Request helpers ─────────
export async function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  return body || {};
}

export function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1];
  // Fallback: token in body
  return null;
}

// ───────── User CRUD ─────────
const USER_KEY = (email) => `user:${email}`;

export async function getUser(email) {
  return await redis().get(USER_KEY(email));
}

export async function setUser(email, data) {
  return await redis().set(USER_KEY(email), data);
}

export async function userExists(email) {
  return (await redis().exists(USER_KEY(email))) === 1;
}
