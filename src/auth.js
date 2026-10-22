'use strict';
const crypto = require('crypto');
const db = require('./db');

const SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';

// ---- password hashing (scrypt, built-in, no native deps) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(pw), salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + dk.toString('hex');
}
function verifyPassword(pw, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const dk = crypto.scryptSync(String(pw), salt, expected.length);
    return crypto.timingSafeEqual(dk, expected);
  } catch { return false; }
}

// ---- stateless signed session cookie ----
function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function unsign(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [payload, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch { return null; }
}

const COOKIE = 'fxbd_sess';
const MAXAGE_MS = 1000 * 60 * 60 * 12; // 12h

function issueCookie(res, user) {
  const token = sign({ uid: user.id, role: user.role, exp: Date.now() + MAXAGE_MS });
  const secure = String(process.env.TRUST_PROXY).toLowerCase() === 'true';
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure, maxAge: MAXAGE_MS, path: '/'
  });
}
function clearCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Load the full, trusted user row from DB (never trust client-supplied role).
function currentUser(req) {
  const raw = req.cookies ? req.cookies[COOKIE] : null;
  const data = unsign(raw);
  if (!data) return null;
  const u = db.prepare('SELECT id,email,name,role,bd_id,affiliate_id,must_change_pw,active FROM users WHERE id=?').get(data.uid);
  if (!u || !u.active) return null;
  return u;
}

function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

module.exports = {
  hashPassword, verifyPassword, issueCookie, clearCookie,
  currentUser, requireAuth, requireAdmin, COOKIE
};
