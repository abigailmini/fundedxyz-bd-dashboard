'use strict';
/* Static client-side demo. Role "scoping" is computed in-browser from sample DATA.
 * NOTE: this is a PROTOTYPE — real access control is enforced server-side in the Node version. */
const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const fmt = n => '$' + Math.round(Number(n)||0).toLocaleString();
const fmt2 = n => '$' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const D = window.DATA;
const affById = id => D.affiliates.find(a=>a.id===id);
const bdById = id => D.bds.find(b=>b.id===id);

let ME=null, RANGE='all', VIEW='overview', chart=null;

// ---------- demo login ----------
function renderDemoUsers(){
  const box=$('#demoUsers');
  D.users.forEach(u=>{
    const row=el('div','demo-user');
    row.innerHTML='<div><div class="du-name">'+u.name+'</div><div class="du-mail">'+u.email+'</div></div>'+
      '<span class="du-role '+(u.role==='admin'?'admin':'')+'">'+u.role+'</span>';
    row.onclick=()=>{$('#email').value=u.email;$('#password').value=D.DEMO_PW;};
    box.appendChild(row);
  });
}
$('#loginForm').addEventListener('submit',e=>{
  e.preventDefault();$('#loginErr').textContent='';
  const email=$('#email').value.trim().toLowerCase();const pw=$('#password').value;
  const u=D.users.find(x=>x.email.toLowerCase()===email);
  if(!u||pw!==D.DEMO_PW){$('#loginErr').textContent='Invalid email or demo password (use demo2026).';return;}
  ME=u;try{sessionStorage.setItem('fxbd_me',email);}catch(e){}
  boot();
});
['#logout','#logout2'].forEach(s=>$(s).addEventListener('click',e=>{e.preventDefault();try{sessionStorage.removeItem('fxbd_me');}catch(e){}location.reload();}));

// ---------- scoping ----------
function allowedAffIds(){
  if(ME.role==='admin') return D.affiliates.map(a=>a.id);
  if(ME.role==='bd') return D.affiliates.filter(a=>a.bd_id===ME.bd_id).map(a=>a.id);
  if(ME.role==='affiliate') return [ME.affiliate_id];
  return [];
}
function inRange(iso){
  const d=new Date(iso), now=new Date();
  if(RANGE==='today') return iso===now.toISOString().slice(0,10);
  if(RANGE==='7d'){ const c=new Date();c.setDate(c.getDate()-6); return d>=new Date(c.toISOString().slice(0,10)); }
  if(RANGE==='mtd') return iso.slice(0,7)===now.toISOString().slice(0,7);
  return true;
}
function scopedSales(){ const ids=new Set(allowedAffIds()); return D.sales.filter(s=>ids.has(s.affiliate_id)&&inRange(s.date)); }
function scopedSignups(){ const ids=new Set(allowedAffIds()); return D.signups.filter(s=>ids.has(s.affiliate_id)&&inRange(s.date)); }

// ---------- shell ----------
function boot(){
  $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#whoName').textContent=ME.name;$('#whoRole').textContent=ME.email;$('#roleChip').textContent=ME.role;
  $('#navAdmin').classList.toggle('hidden',ME.role!=='admin');
  $('#navAffiliates').textContent=ME.role==='affiliate'?'My Sales':'Affiliates';
  document.querySelectorAll('.nav-item').forEach(n=>n.onclick=e=>{e.preventDefault();go(n.dataset.view);});
  document.querySelectorAll('#ranges button').forEach(b=>b.onclick=()=>{RANGE=b.dataset.r;document.querySelectorAll('#ranges button').forEach(x=>x.classList.toggle('active',x===b));render();});
  $('#exportBtn').onclick=exportCsv;
  go('overview');
}
function go(v){VIEW=v;document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===v));
  $('#viewTitle').textContent={overview:'Overview',affiliates:ME.role==='affiliate'?'My Sales':'Affiliates',leaderboard:'Leaderboard',products:'Products',admin:'Admin'}[v];render();}
function render(){const c=$('#content');c.innerHTML='';
  if(VIEW==='overview')return renderOverview(c);
  if(VIEW==='affiliates')return renderAffiliates(c);
  if(VIEW==='leaderboard')return renderLeaderboard(c);
  if(VIEW==='products')return renderProducts(c);
  if(VIEW==='admin')return renderAdmin(c);}

// ---------- overview ----------
function renderOverview(c){
  const sales=scopedSales().filter(s=>s.status==='paid');
  const revenue=sales.reduce((a,s)=>a+s.amount,0);
  const affComm=sales.reduce((a,s)=>{const af=affById(s.affiliate_id);return a+s.amount*(af?af.commission_pct:0)/100;},0);
  const signups=scopedSignups().length;
  let commLabel='Commission',commVal=affComm,sub='affiliate %';
  if(ME.role==='bd'){const bd=bdById(ME.bd_id);commLabel='Team commission';commVal=revenue*(bd?bd.commission_pct:0)/100;sub='your BD %';}
  const kp=el('div','kpis');
  [['Revenue',fmt(revenue),'cy',sales.length+' paid orders'],
   ['Orders',sales.length,'',''],
   ['Sign-ups',signups,'',''],
   [commLabel,fmt2(commVal),'lm',sub]].forEach(([l,v,cl,s])=>{
    const k=el('div','card kpi');k.innerHTML='<div class="lbl">'+l+'</div><div class="val '+cl+'">'+v+'</div><div class="sub">'+(s||'')+'</div>';kp.appendChild(k);});
  c.appendChild(kp);
  // timeseries
  const byDay={};sales.forEach(s=>{byDay[s.date]=(byDay[s.date]||0)+s.amount;});
  const days=Object.keys(byDay).sort();
  const card=el('div','card');card.innerHTML='<div class="section-head"><h2>Sales over time</h2><span class="hint">'+RANGE.toUpperCase()+'</span></div><canvas id="tsChart" height="90"></canvas>';
  c.appendChild(card);
  if(chart){chart.destroy();chart=null;}
  const ctx=document.getElementById('tsChart');
  const g=ctx.getContext('2d').createLinearGradient(0,0,0,220);g.addColorStop(0,'#22d3ee66');g.addColorStop(1,'#22d3ee00');
  chart=new Chart(ctx,{type:'line',data:{labels:days,datasets:[{data:days.map(d=>byDay[d]),borderColor:'#22d3ee',backgroundColor:g,fill:true,tension:.33,pointRadius:0,borderWidth:2}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#5f768a',maxTicksLimit:8}},y:{grid:{color:'#1b2836'},ticks:{color:'#5f768a',callback:v=>'$'+v}}}}});
}

// ---------- affiliate aggregation ----------
function affAgg(){
  const ids=allowedAffIds();
  return ids.map(id=>{
    const af=affById(id);
    const paid=D.sales.filter(s=>s.affiliate_id===id&&s.status==='paid'&&inRange(s.date));
    const revenue=paid.reduce((a,s)=>a+s.amount,0);
    const signs=D.signups.filter(s=>s.affiliate_id===id&&inRange(s.date)).length;
    const last=paid.map(s=>s.date).sort().slice(-1)[0]||null;
    const bd=bdById(af.bd_id);
    return {id,code:af.code,name:af.name,bd_name:bd?bd.name:'—',commission_pct:af.commission_pct,
      signups:signs,sales_count:paid.length,revenue,commission:revenue*af.commission_pct/100,last_sale:last};
  }).sort((a,b)=>b.revenue-a.revenue);
}
function renderAffiliates(c){
  const rows=affAgg();const max=Math.max(1,...rows.map(r=>r.revenue));
  const card=el('div','card');
  let body=rows.map(r=>'<tr><td><span class="code">'+r.code+'</span></td><td>'+r.name+'</td>'+
    (ME.role==='admin'?'<td class="muted">'+r.bd_name+'</td>':'')+
    '<td>'+r.signups+'</td><td>'+r.sales_count+'</td>'+
    '<td><div style="display:flex;align-items:center;gap:8px"><span>'+fmt(r.revenue)+'</span><div class="bar" style="width:70px"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></div></td>'+
    '<td class="pos">'+fmt2(r.commission)+'</td><td class="muted">'+r.commission_pct+'%</td><td class="muted">'+(r.last_sale||'—')+'</td></tr>').join('');
  if(!rows.length)body='<tr><td colspan="9" class="muted">No data for this range.</td></tr>';
  card.innerHTML='<div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th>'+(ME.role==='admin'?'<th>BD</th>':'')+'<th>Sign-ups</th><th>Sales</th><th>Revenue</th><th>Commission</th><th>Rate</th><th>Last sale</th></tr></thead><tbody>'+body+'</tbody></table></div>';
  c.appendChild(card);
}

// ---------- leaderboard ----------
function renderLeaderboard(c){
  if(ME.role==='admin'){
    const bd=D.bds.map(b=>{
      const affs=D.affiliates.filter(a=>a.bd_id===b.id);
      const paid=D.sales.filter(s=>affs.some(a=>a.id===s.affiliate_id)&&s.status==='paid'&&inRange(s.date));
      const revenue=paid.reduce((a,s)=>a+s.amount,0);
      return {name:b.name,affiliates:affs.length,revenue,commission:revenue*b.commission_pct/100};
    }).sort((a,b)=>b.revenue-a.revenue);
    const max=Math.max(1,...bd.map(r=>r.revenue));
    const card=el('div','card');
    card.innerHTML='<div class="section-head"><h2>BD Leaderboard</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>BD</th><th>Affiliates</th><th>Revenue</th><th>Commission</th><th></th></tr></thead><tbody>'+
      bd.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+r.name+'</td><td>'+r.affiliates+'</td><td>'+fmt(r.revenue)+'</td><td class="pos">'+fmt2(r.commission)+'</td><td style="width:120px"><div class="bar"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></td></tr>').join('')+'</tbody></table></div>';
    c.appendChild(card);
  }
  const aff=affAgg().slice(0,25);const max2=Math.max(1,...aff.map(r=>r.revenue));
  const card2=el('div','card');
  card2.innerHTML='<div class="section-head"><h2>Affiliate Leaderboard</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Affiliate</th><th>Code</th><th>Sales</th><th>Revenue</th><th></th></tr></thead><tbody>'+
    (aff.length?aff.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+r.name+'</td><td><span class="code">'+r.code+'</span></td><td>'+r.sales_count+'</td><td>'+fmt(r.revenue)+'</td><td style="width:120px"><div class="bar"><i style="width:'+Math.round(r.revenue/max2*100)+'%"></i></div></td></tr>').join(''):'<tr><td colspan="6" class="muted">No data.</td></tr>')+'</tbody></table></div>';
  c.appendChild(card2);
}

// ---------- products ----------
function renderProducts(c){
  const sales=scopedSales().filter(s=>s.status==='paid');
  const map={};sales.forEach(s=>{const m=map[s.product]||(map[s.product]={orders:0,revenue:0});m.orders++;m.revenue+=s.amount;});
  const rows=Object.entries(map).map(([product,v])=>({product,...v})).sort((a,b)=>b.revenue-a.revenue);
  const max=Math.max(1,...rows.map(r=>r.revenue));
  const card=el('div','card');
  card.innerHTML='<div class="section-head"><h2>Product breakdown</h2></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Orders</th><th>Revenue</th><th></th></tr></thead><tbody>'+
    (rows.length?rows.map(r=>'<tr><td>'+r.product+'</td><td>'+r.orders+'</td><td>'+fmt(r.revenue)+'</td><td style="width:160px"><div class="bar"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></td></tr>').join(''):'<tr><td colspan="4" class="muted">No data.</td></tr>')+'</tbody></table></div>';
  c.appendChild(card);
}

// ---------- admin (UI demo) ----------
function renderAdmin(c){
  if(ME.role!=='admin'){c.innerHTML='<div class="notice">Admins only.</div>';return;}
  c.appendChild(el('div','notice','Demo mode: this Admin panel shows the management UI. In the server version these actions persist (create users with hashed passwords, assign affiliates to BDs, set commission %, import live data). Here they are read-only previews.'));
  const grid=el('div','admin-grid');
  grid.appendChild(demoForm('Create user',[['Email','email'],['Name','text'],['Role (admin/bd/affiliate)','text'],['Assign BD / Affiliate','text']]));
  grid.appendChild(demoForm('Create BD',[['BD name','text'],['Commission %','number']]));
  grid.appendChild(demoForm('Create affiliate',[['Promo/referral code','text'],['Name','text'],['Platform referral id','text'],['Commission %','number']]));
  grid.appendChild(demoForm('Assign affiliate to BD',[['Affiliate code','text'],['BD name','text']]));
  c.appendChild(grid);
  // users + affiliates tables
  const ut=el('div','card');
  ut.innerHTML='<div class="section-head"><h2>Users</h2></div><div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Scope</th></tr></thead><tbody>'+
    D.users.map(u=>'<tr><td>'+u.email+'</td><td>'+u.name+'</td><td><span class="chip role">'+u.role+'</span></td><td class="muted">'+(u.bd_id?('BD: '+bdById(u.bd_id).name):u.affiliate_id?('Affiliate: '+affById(u.affiliate_id).code):'All')+'</td></tr>').join('')+'</tbody></table></div>';
  c.appendChild(ut);
  const at=el('div','card');
  at.innerHTML='<div class="section-head"><h2>Affiliates &amp; commission</h2></div><div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>BD</th><th>Commission %</th></tr></thead><tbody>'+
    D.affiliates.map(a=>'<tr><td><span class="code">'+a.code+'</span></td><td>'+a.name+'</td><td class="muted">'+(bdById(a.bd_id)?bdById(a.bd_id).name:'—')+'</td><td>'+a.commission_pct+'%</td></tr>').join('')+'</tbody></table></div>';
  c.appendChild(at);
}
function demoForm(title,fields){
  const card=el('div','card');card.innerHTML='<div class="section-head"><h2>'+title+'</h2></div>';
  const f=el('form');fields.forEach(([l,t])=>{f.appendChild(el('label',null,l));const i=el('input');i.type=t;f.appendChild(i);});
  const msg=el('div','err');const btn=el('button','btn sm','Save');btn.type='submit';btn.style.marginTop='14px';
  f.appendChild(btn);f.appendChild(msg);
  f.onsubmit=e=>{e.preventDefault();msg.style.color='var(--lime)';msg.textContent='Demo only — not persisted. Server version saves this.';};
  card.appendChild(f);return card;
}

// ---------- CSV export ----------
function exportCsv(){
  const ids=new Set(allowedAffIds());
  const rows=D.sales.filter(s=>ids.has(s.affiliate_id)&&inRange(s.date)).map(s=>{
    const af=affById(s.affiliate_id);const bd=bdById(af.bd_id);
    return {date:s.date,affiliate_code:af.code,affiliate_name:af.name,bd_name:bd?bd.name:'',product:s.product,amount:s.amount,status:s.status,customer_email:s.customer_email};
  });
  if(!rows.length){alert('No data to export for this range.');return;}
  const cols=Object.keys(rows[0]);
  const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const csv=cols.join(',')+'\n'+rows.map(r=>cols.map(c=>esc(r[c])).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='fundedxyz-sales-'+RANGE+'.csv';a.click();
}

// ---------- init ----------
renderDemoUsers();
try{const saved=sessionStorage.getItem('fxbd_me');if(saved){const u=D.users.find(x=>x.email===saved);if(u){ME=u;boot();}}}catch(e){}
