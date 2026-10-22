'use strict';
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const q = require('./queries');
const { getAdapter } = require('./adapter');

const router = express.Router();

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v; };
  return cols.join(',') + '\n' + rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
}

// ---- auth ----
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing credentials' });
  const u = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(email).toLowerCase().trim());
  if (!u || !auth.verifyPassword(password, u.password_hash)) return res.status(401).json({ error: 'invalid email or password' });
  auth.issueCookie(res, u);
  res.json({ ok: true, user: { email: u.email, name: u.name, role: u.role, must_change_pw: !!u.must_change_pw } });
});

router.post('/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }); });

router.get('/me', auth.requireAuth, (req, res) => {
  const u = req.user;
  res.json({ email: u.email, name: u.name, role: u.role, must_change_pw: !!u.must_change_pw });
});

router.post('/change-password', auth.requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 8) return res.status(400).json({ error: 'new password must be 8+ chars' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!auth.verifyPassword(current || '', u.password_hash)) return res.status(401).json({ error: 'current password incorrect' });
  db.prepare('UPDATE users SET password_hash=?, must_change_pw=0 WHERE id=?').run(auth.hashPassword(next), u.id);
  res.json({ ok: true });
});

// ---- scoped data (role enforced server-side inside queries) ----
const range = req => (['today','7d','mtd','all'].includes(req.query.range) ? req.query.range : 'all');

router.get('/summary', auth.requireAuth, (req, res) => res.json(q.summary(req.user, range(req))));
router.get('/timeseries', auth.requireAuth, (req, res) => res.json(q.timeseries(req.user, range(req))));
router.get('/affiliates', auth.requireAuth, (req, res) => res.json(q.affiliateTable(req.user, range(req))));
router.get('/leaderboard/bd', auth.requireAuth, (req, res) => res.json(q.leaderboardBD(req.user, range(req))));
router.get('/leaderboard/affiliate', auth.requireAuth, (req, res) => res.json(q.affiliateTable(req.user, range(req)).slice(0, 25)));
router.get('/products', auth.requireAuth, (req, res) => res.json(q.products(req.user, range(req))));
router.get('/export.csv', auth.requireAuth, (req, res) => {
  const rows = q.exportRows(req.user, range(req));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fundedxyz-sales-' + range(req) + '.csv"');
  res.send(toCsv(rows));
});

// ---- admin ----
router.get('/admin/overview', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json({
    bds: db.prepare('SELECT * FROM bds ORDER BY name').all(),
    affiliates: db.prepare('SELECT a.*, b.name AS bd_name FROM affiliates a LEFT JOIN bds b ON b.id=a.bd_id ORDER BY a.name').all(),
    users: db.prepare('SELECT id,email,name,role,bd_id,affiliate_id,active FROM users ORDER BY role,email').all(),
    adapter: (process.env.DATA_ADAPTER || 'sample')
  });
});

router.post('/admin/bds', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { name, commission_pct } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO bds (name, commission_pct) VALUES (?,?)').run(name, +commission_pct || 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.post('/admin/affiliates', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { code, name, referral_id, bd_id, commission_pct } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code and name required' });
  try {
    const info = db.prepare('INSERT INTO affiliates (code, referral_id, name, bd_id, commission_pct) VALUES (?,?,?,?,?)')
      .run(code, referral_id || null, name, bd_id || null, +commission_pct || 0);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

router.post('/admin/assign', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { affiliate_id, bd_id } = req.body || {};
  db.prepare('UPDATE affiliates SET bd_id=? WHERE id=?').run(bd_id || null, affiliate_id);
  res.json({ ok: true });
});

router.post('/admin/commission', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { entity, id, commission_pct } = req.body || {};
  if (entity === 'affiliate') db.prepare('UPDATE affiliates SET commission_pct=? WHERE id=?').run(+commission_pct || 0, id);
  else if (entity === 'bd') db.prepare('UPDATE bds SET commission_pct=? WHERE id=?').run(+commission_pct || 0, id);
  else return res.status(400).json({ error: 'entity must be affiliate|bd' });
  res.json({ ok: true });
});

router.post('/admin/users', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { email, name, role, bd_id, affiliate_id, password } = req.body || {};
  if (!email || !name || !role) return res.status(400).json({ error: 'email, name, role required' });
  if (!['admin','bd','affiliate'].includes(role)) return res.status(400).json({ error: 'bad role' });
  const pw = password && String(password).length >= 8 ? password : require('crypto').randomBytes(9).toString('base64url');
  try {
    const info = db.prepare('INSERT INTO users (email,name,password_hash,role,bd_id,affiliate_id,must_change_pw) VALUES (?,?,?,?,?,?,1)')
      .run(String(email).toLowerCase().trim(), name, auth.hashPassword(pw), role, bd_id || null, affiliate_id || null);
    res.json({ ok: true, id: info.lastInsertRowid, temp_password: pw });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

router.post('/admin/import', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try { const r = await getAdapter().importAll(); res.json({ ok: true, result: r }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

module.exports = router;
