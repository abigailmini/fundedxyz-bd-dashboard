/* FundedXYZ BD Dashboard — SAMPLE DATA (static demo).
 * Shape mirrors a future API response so it can be swapped for fetch('/api/...') later:
 *   DATA = { bds, affiliates, products, users, sales, signups }
 * Sales/signups are generated deterministically (seeded RNG) so totals are stable across loads.
 * Replace generateSales()/generateSignups() with a real fetch() when the backend is ready.
 */
(function(){
  // ---- deterministic RNG ----
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  const rnd = mulberry32(20260815);
  const ri = (a,b)=>a+Math.floor(rnd()*(b-a+1));
  const pick = arr => arr[Math.floor(rnd()*arr.length)];

  const bds = [
    { id:1, name:'Kate Tan',      commission_pct:8 },
    { id:2, name:'Marcus Lee',    commission_pct:6 },
    { id:3, name:'Aisha Rahman',  commission_pct:6 }
  ];

  const affiliates = [
    // Kate (BD 1) — 7 affiliates
    { id:1, code:'XYZCUPB1F1', referral_id:'9799611', name:'CupWinner (IG)',   bd_id:1, commission_pct:12 },
    { id:2, code:'XMODEB1F1',  referral_id:'9801122', name:'X Mode Master',    bd_id:1, commission_pct:12 },
    { id:3, code:'ALPHAFX',    referral_id:'9803344', name:'AlphaSignals',     bd_id:1, commission_pct:10 },
    { id:4, code:'WHALEMY',    referral_id:'9805566', name:'WhaleCatcher MY',  bd_id:1, commission_pct:10 },
    { id:5, code:'SGDIAMOND',  referral_id:'9807788', name:'DiamondHands SG',  bd_id:1, commission_pct:10 },
    { id:6, code:'THNIGHTOWL', referral_id:'9809900', name:'NightOwl TH',      bd_id:1, commission_pct:8 },
    { id:7, code:'IDRISING',   referral_id:'9811111', name:'RisingStar ID',    bd_id:1, commission_pct:8 },
    // Marcus (BD 2)
    { id:8, code:'VNALPHA',    referral_id:'9813333', name:'AlphaSeeker VN',   bd_id:2, commission_pct:8 },
    { id:9, code:'PHSNIPER',   referral_id:'9815555', name:'SniperEntry PH',   bd_id:2, commission_pct:8 },
    { id:10,code:'MYKING',     referral_id:'9817777', name:'CryptoKing MY',    bd_id:2, commission_pct:10 },
    // Aisha (BD 3)
    { id:11,code:'SGACE',      referral_id:'9819999', name:'AceTrader SG',     bd_id:3, commission_pct:10 },
    { id:12,code:'IDBULL',     referral_id:'9821010', name:'BullRunBro ID',    bd_id:3, commission_pct:10 },
    { id:13,code:'THSURF',     referral_id:'9823030', name:'MomentumSurf TH',  bd_id:3, commission_pct:8 }
  ];

  // Realistic FundedXYZ SKUs. X Mode = premium/high-ticket, lower volume.
  const products = [
    { product:'X Mode $25K',   account_size:'25,000',  mode:'X Mode', price:1500, weight:3 },
    { product:'X Mode $50K',   account_size:'50,000',  mode:'X Mode', price:2500, weight:2 },
    { product:'X Mode $100K',  account_size:'100,000', mode:'X Mode', price:4500, weight:1 },
    { product:'Z Mode $50K',   account_size:'50,000',  mode:'Z Mode', price:300,  weight:8 },
    { product:'Z Mode $100K',  account_size:'100,000', mode:'Z Mode', price:450,  weight:7 },
    { product:'1-Step $50K',   account_size:'50,000',  mode:'1-Step', price:199,  weight:9 },
    { product:'1-Step $100K',  account_size:'100,000', mode:'1-Step', price:349,  weight:8 },
    { product:'2-Step $200K',  account_size:'200,000', mode:'2-Step', price:599,  weight:4 }
  ];
  const weighted = [];
  products.forEach((p,i)=>{ for(let k=0;k<p.weight;k++) weighted.push(i); });

  // Demo logins (CLIENT-SIDE ONLY — this is a prototype, not real security).
  const DEMO_PW = 'demo2026';
  const users = [
    { email:'davidyangmini@gmail.com',    name:'David Yang',    role:'admin' },
    { email:'khongming@unitycrypto.com',  name:'Khong Ming Kok',role:'admin' },
    { email:'kate@fundedxyz.com',         name:'Kate Tan',      role:'bd', bd_id:1 },
    { email:'cupwinner@fundedxyz.com',    name:'CupWinner',     role:'affiliate', affiliate_id:1 },
    { email:'xmode@fundedxyz.com',        name:'X Mode Master', role:'affiliate', affiliate_id:2 }
  ];

  // ---- generate ~3 months of sales + signups ----
  function daysAgoISO(d){ const t=new Date(); t.setDate(t.getDate()-d); return t.toISOString().slice(0,10); }
  const sales=[]; let oid=100000;
  for(let d=92; d>=0; d--){
    const iso = daysAgoISO(d);
    const dow = new Date(iso).getDay();
    const base = (dow===0||dow===6)? ri(4,9) : ri(7,16); // fewer on weekends
    for(let k=0;k<base;k++){
      const aff = pick(affiliates);
      const p = products[pick(weighted)];
      const status = rnd()<0.035 ? 'refunded' : 'paid';
      sales.push({
        order_id:'ORD'+(oid++), date:iso, affiliate_id:aff.id, referral_code:aff.code,
        amount:p.price, product:p.product, account_size:p.account_size, mode:p.mode,
        status, customer_email:'cust'+ri(1000,99999)+'@example.com'
      });
    }
  }
  const signups=[]; let sid=500000;
  for(let d=92; d>=0; d--){
    const iso=daysAgoISO(d);
    const n=ri(8,26);
    for(let k=0;k<n;k++){ const aff=pick(affiliates); signups.push({ id:'SGN'+(sid++), date:iso, affiliate_id:aff.id, referral_code:aff.code, email:'lead'+ri(1,999999)+'@example.com' }); }
  }

  window.DATA = { bds, affiliates, products, users, sales, signups, DEMO_PW };
})();
