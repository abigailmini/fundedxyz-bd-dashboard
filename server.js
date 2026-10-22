'use strict';
const path = require('path');
const express = require('express');
const api = require('./src/routes');
const { getAdapter } = require('./src/adapter');

const app = express();
if (String(process.env.TRUST_PROXY).toLowerCase() === 'true') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// tiny cookie parser (avoids an extra dependency)
app.use((req, res, next) => {
  const h = req.headers.cookie;
  req.cookies = {};
  if (h) h.split(';').forEach(p => { const i = p.indexOf('='); if (i>0) req.cookies[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim()); });
  next();
});

// basic security headers + CSP (allows self + inline for the single-file dashboard + chart cdn)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; frame-ancestors 'none'");
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('FundedXYZ BD dashboard on :' + PORT + ' (adapter=' + (process.env.DATA_ADAPTER||'sample') + ')'));

// optional periodic import from the live CSV/Sheet source
const intervalMin = parseInt(process.env.IMPORT_INTERVAL_MIN || '0', 10);
if (intervalMin > 0 && (process.env.DATA_ADAPTER||'').toLowerCase() === 'sheet') {
  const run = () => getAdapter().importAll().then(r => console.log('[import]', JSON.stringify(r))).catch(e => console.error('[import] failed', e.message));
  run();
  setInterval(run, intervalMin * 60 * 1000);
}
