'use strict';
// Seeds: admin logins (David + Khong Ming) always; sample BDs/affiliates/sales only in sample mode.
// Generated temp passwords are written ONLY to ../secrets/bd-dashboard-admin.txt (chmod 600),
// never printed to stdout.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { hashPassword } = require('./auth');

function tempPw() { return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g,'').slice(0,16); }
function upsertUser(email, name, role, pw, extra) {
  extra = extra || {};
  email = email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET name=?, role=?, bd_id=?, affiliate_id=? WHERE id=?')
      .run(name, role, extra.bd_id||null, extra.affiliate_id||null, existing.id);
    return { id: existing.id, created: false };
  }
  const info = db.prepare('INSERT INTO users (email,name,password_hash,role,bd_id,affiliate_id,must_change_pw) VALUES (?,?,?,?,?,?,?)')
    .run(email, name, hashPassword(pw), role, extra.bd_id||null, extra.affiliate_id||null, extra.must_change_pw?1:0);
  return { id: info.lastInsertRowid, created: true };
}

const creds = [];
const SAMPLE = (process.env.DATA_ADAPTER || 'sample').toLowerCase() === 'sample';

// ---- Admins ----
const davidPw = tempPw();
const davidUser = upsertUser('davidyangmini@gmail.com', 'David Yang', 'admin', davidPw, { must_change_pw: true });
if (davidUser.created) creds.push(['ADMIN', 'davidyangmini@gmail.com', davidPw]);

const kmPw = tempPw();
const kmUser = upsertUser('khongming@unitycrypto.com', 'Khong Ming Kok', 'admin', kmPw, { must_change_pw: true });
if (kmUser.created) creds.push(['ADMIN', 'khongming@unitycrypto.com', kmPw]);

if (SAMPLE) {
  const haveSales = db.prepare('SELECT COUNT(*) n FROM sales').get().n;
  if (!haveSales) {
    // BDs
    const bdDefs = [
      { name: 'BD — Jason Lim', pct: 5 },
      { name: 'BD — Aisha Rahman', pct: 5 },
      { name: 'BD — Marcus Tan', pct: 4 }
    ];
    const bdIds = bdDefs.map(b => db.prepare('INSERT INTO bds (name,commission_pct) VALUES (?,?)').run(b.name,b.pct).lastInsertRowid);

    // Affiliates (incl. the known FundedXYZ promo codes)
    const affDefs = [
      { code:'XYZCUPB1F1', name:'CupWinner (IG)', bd:0, pct:12, ref:'9799611' },
      { code:'XMODEB1F1',  name:'ZModeMaster',    bd:0, pct:10, ref:'9801122' },
      { code:'ALPHAFX',    name:'AlphaSignals',    bd:0, pct:10, ref:'9803344' },
      { code:'WHALEMY',    name:'WhaleCatcher MY', bd:1, pct:12, ref:'9805566' },
      { code:'SGDIAMOND',  name:'DiamondHands SG', bd:1, pct:10, ref:'9807788' },
      { code:'THNIGHTOWL', name:'NightOwl TH',     bd:1, pct:8,  ref:'9809900' },
      { code:'IDRISING',   name:'RisingStar ID',   bd:2, pct:10, ref:'9811111' },
      { code:'VNALPHA',    name:'AlphaSeeker VN',  bd:2, pct:8,  ref:'9813333' }
    ];
    const affIds = affDefs.map(a => db.prepare('INSERT INTO affiliates (code,referral_id,name,bd_id,commission_pct) VALUES (?,?,?,?,?)')
      .run(a.code, a.ref, a.name, bdIds[a.bd], a.pct).lastInsertRowid);

    // Products (FundedXYZ challenge SKUs)
    const products = [
      { product:'100K Account — 1 Step', size:'100,000', mode:'Standard', price:[299,349] },
      { product:'100K Account — Z Mode Hard', size:'100,000', mode:'Z Mode - Hard', price:[399,449] },
      { product:'50K Account — 1 Step', size:'50,000', mode:'Standard', price:[179,199] },
      { product:'50K Account — Z Mode', size:'50,000', mode:'Z Mode', price:[229,249] },
      { product:'200K Account — 2 Step', size:'200,000', mode:'Standard', price:[549,599] }
    ];
    const insSale = db.prepare('INSERT INTO sales (ext_id,affiliate_id,referral_code,amount,product,account_size,mode,status,customer_email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insSignup = db.prepare('INSERT INTO signups (ext_id,affiliate_id,referral_code,email,created_at) VALUES (?,?,?,?,?)');
    const rand = (a,b) => a + Math.floor(Math.random()*(b-a+1));
    let oid = 1000, sid = 5000;
    const today = new Date();
    for (let d = 90; d >= 0; d--) {
      const day = new Date(today.getTime() - d*86400000);
      const iso = day.toISOString().slice(0,10);
      const nOrders = rand(2, 10);
      for (let k = 0; k < nOrders; k++) {
        const ai = rand(0, affIds.length-1);
        const pr = products[rand(0, products.length-1)];
        const amount = pr.price[rand(0, pr.price.length-1)];
        const status = Math.random() < 0.04 ? 'refunded' : 'paid';
        insSale.run('ORD'+(oid++), affIds[ai], affDefs[ai].code, amount, pr.product, pr.size, pr.mode, status, 'cust'+rand(1,9999)+'@example.com', iso);
      }
      const nSign = rand(3, 14);
      for (let s = 0; s < nSign; s++) {
        const ai = rand(0, affIds.length-1);
        insSignup.run('SGN'+(sid++), affIds[ai], affDefs[ai].code, 'lead'+rand(1,99999)+'@example.com', iso);
      }
    }

    // Sample login users for BD + affiliate (for role verification / demo)
    const bdPw = tempPw();
    const bdU = upsertUser('jason.bd@fundedxyz.test', 'Jason Lim', 'bd', bdPw, { bd_id: bdIds[0] });
    if (bdU.created) creds.push(['BD (sample)', 'jason.bd@fundedxyz.test', bdPw]);

    const bd2Pw = tempPw();
    const bd2U = upsertUser('aisha.bd@fundedxyz.test', 'Aisha Rahman', 'bd', bd2Pw, { bd_id: bdIds[1] });
    if (bd2U.created) creds.push(['BD (sample)', 'aisha.bd@fundedxyz.test', bd2Pw]);

    const affPw = tempPw();
    const affU = upsertUser('cupwinner.aff@fundedxyz.test', 'CupWinner', 'affiliate', affPw, { affiliate_id: affIds[0] });
    if (affU.created) creds.push(['AFFILIATE (sample)', 'cupwinner.aff@fundedxyz.test', affPw]);
  }
}

// Write secrets file (chmod 600). Only append newly-created creds.
if (creds.length) {
  const secretsDir = path.join(__dirname, '..', '..', 'secrets');
  try { fs.mkdirSync(secretsDir, { recursive: true }); } catch {}
  const file = path.join(secretsDir, 'bd-dashboard-admin.txt');
  const lines = creds.map(c => c[0].padEnd(20) + '  ' + c[1].padEnd(34) + '  ' + c[2]);
  const header = '# FundedXYZ BD Dashboard — generated credentials (' + new Date().toISOString() + ')\n' +
                 '# All marked must_change_pw where applicable. Keep this file private.\n';
  fs.writeFileSync(file, header + lines.join('\n') + '\n', { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
  console.log('Seed complete. ' + creds.length + ' credential(s) written to secrets/bd-dashboard-admin.txt (not shown).');
} else {
  console.log('Seed complete. No new credentials (users already existed).');
}
