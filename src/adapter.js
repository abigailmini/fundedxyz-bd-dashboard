'use strict';
// Clean data-source adapter interface. Swap implementations without touching routes/UI.
//
//   adapter.importAll() -> { affiliates, sales, signups }   (counts upserted)
//
// Live source (FundedXYZ platform backend) is NOT reachable read-only from here yet,
// so we ship two working adapters today:
//   - SampleAdapter : demo data lives in the DB (seeded by src/seed.js). importAll is a no-op.
//   - CsvSheetAdapter: pulls a Google-Sheet / CSV export (SALES_CSV_URL) and upserts.
// When the backend exposes the fields in BACKEND_REQUIREMENTS.md, add an ApiAdapter here
// with the same importAll() signature and set DATA_ADAPTER=api.
const db = require('./db');

function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); field=''; row=[]; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  return rows.slice(1).filter(r => r.some(v => v && v.trim() !== '')).map(r => {
    const o = {}; header.forEach((h, idx) => o[h] = (r[idx] != null ? r[idx].trim() : '')); return o;
  });
}

function upsertAffiliateByCode(code, referralId, name) {
  if (!code) return null;
  let a = db.prepare('SELECT id FROM affiliates WHERE code=?').get(code);
  if (a) return a.id;
  const info = db.prepare('INSERT INTO affiliates (code, referral_id, name, commission_pct) VALUES (?,?,?,0)')
    .run(code, referralId || null, name || code);
  return info.lastInsertRowid;
}

function normDate(s) {
  if (!s) return new Date().toISOString().slice(0,10);
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return String(s).slice(0,10);
}

const SampleAdapter = {
  name: 'sample',
  async importAll() { return { affiliates: 0, sales: 0, signups: 0, note: 'sample data is seeded in DB' }; }
};

const CsvSheetAdapter = {
  name: 'sheet',
  async importAll() {
    const url = process.env.SALES_CSV_URL;
    if (!url) throw new Error('SALES_CSV_URL not set');
    const res = await fetch(url);
    if (!res.ok) throw new Error('CSV fetch failed: ' + res.status);
    const text = await res.text();
    const rows = parseCsv(text);
    let nSales = 0, nAff = 0;
    const seen = new Set();
    const ins = db.prepare(
      "INSERT INTO sales (ext_id, affiliate_id, referral_code, amount, product, account_size, mode, status, customer_email, created_at) " +
      "VALUES (@ext_id,@affiliate_id,@referral_code,@amount,@product,@account_size,@mode,@status,@customer_email,@created_at) " +
      "ON CONFLICT(ext_id) DO UPDATE SET amount=excluded.amount, status=excluded.status, product=excluded.product"
    );
    for (const r of rows) {
      const code = r.referral_code || r.promo_code || r.code || '';
      const aff = code ? upsertAffiliateByCode(code, r.referral_id, r.affiliate_name) : null;
      if (aff && !seen.has(aff)) { seen.add(aff); nAff++; }
      ins.run({
        ext_id: r.order_id || r.id || (code + '-' + (r.date||'') + '-' + (r.customer_email||'') + '-' + nSales),
        affiliate_id: aff,
        referral_code: code || null,
        amount: parseFloat(String(r.amount||'0').replace(/[^0-9.\-]/g,'')) || 0,
        product: r.product || null,
        account_size: r.account_size || null,
        mode: r.mode || null,
        status: (r.status || 'paid').toLowerCase(),
        customer_email: r.customer_email || null,
        created_at: normDate(r.date || r.created_at)
      });
      nSales++;
    }
    return { affiliates: nAff, sales: nSales, signups: 0 };
  }
};

function getAdapter() {
  const kind = (process.env.DATA_ADAPTER || 'sample').toLowerCase();
  if (kind === 'sheet') return CsvSheetAdapter;
  return SampleAdapter;
}

module.exports = { getAdapter, parseCsv, SampleAdapter, CsvSheetAdapter };
