'use strict';
const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const fmt = n => '$' + (Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
const fmt2 = n => '$' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const api = (p,opt)=>fetch('/api'+p,Object.assign({headers:{'Content-Type':'application/json'}},opt)).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j;});

let ME=null, RANGE='all', VIEW='overview', chart=null;

// ---------- auth ----------
$('#loginForm').addEventListener('submit', async e=>{
  e.preventDefault(); $('#loginErr').textContent='';
  try{
    const u=await api('/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})});
    ME=u.user; if(ME.must_change_pw){showChangePw();}else{boot();}
  }catch(err){$('#loginErr').textContent=err.message;}
});
$('#changePwForm').addEventListener('submit', async e=>{
  e.preventDefault(); $('#cpErr').textContent='';
  try{ await api('/change-password',{method:'POST',body:JSON.stringify({current:$('#curPw').value,next:$('#newPw').value})});
    ME.must_change_pw=false; boot();
  }catch(err){$('#cpErr').textContent=err.message;}
});
function showChangePw(){$('#login').classList.add('hidden');$('#changePw').classList.remove('hidden');}
['#logout','#logout2'].forEach(s=>$(s).addEventListener('click',async e=>{e.preventDefault();await api('/logout',{method:'POST'});location.reload();}));

// ---------- shell ----------
function boot(){
  $('#login').classList.add('hidden');$('#changePw').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#whoName').textContent=ME.name; $('#whoRole').textContent=ME.email;
  $('#roleChip').textContent=ME.role;
  if(ME.role!=='admin'){$('#navAdmin').classList.add('hidden');}
  if(ME.role==='affiliate'){$('#navAffiliates').textContent='My Sales';}
  document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',e=>{e.preventDefault();go(n.dataset.view);}));
  document.querySelectorAll('#ranges button').forEach(b=>b.addEventListener('click',()=>{
    RANGE=b.dataset.r;document.querySelectorAll('#ranges button').forEach(x=>x.classList.toggle('active',x===b));render();
  }));
  $('#exportBtn').addEventListener('click',()=>{window.location='/api/export.csv?range='+RANGE;});
  go('overview');
}
function go(v){VIEW=v;document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===v));
  $('#viewTitle').textContent={overview:'Overview',affiliates:ME.role==='affiliate'?'My Sales':'Affiliates',leaderboard:'Leaderboard',products:'Products',admin:'Admin'}[v];
  render();}

async function render(){
  const c=$('#content'); c.innerHTML='<div class="muted">Loading…</div>';
  try{
    if(VIEW==='overview')return renderOverview(c);
    if(VIEW==='affiliates')return renderAffiliates(c);
    if(VIEW==='leaderboard')return renderLeaderboard(c);
    if(VIEW==='products')return renderProducts(c);
    if(VIEW==='admin')return renderAdmin(c);
  }catch(e){c.innerHTML='<div class="notice">'+e.message+'</div>';}
}

// ---------- overview ----------
async function renderOverview(c){
  const [s,ts]=await Promise.all([api('/summary?range='+RANGE),api('/timeseries?range='+RANGE)]);
  c.innerHTML='';
  const kp=el('div','kpis');
  const cards=[['Revenue',fmt(s.revenue),'cy',s.orders+' paid orders'],
    ['Orders',s.orders,'',''],
    ['Sign-ups',s.signups,'',''],
    [ME.role==='bd'?'Team commission':'Commission',fmt2(ME.role==='bd'&&s.bd_commission!=null?s.bd_commission:s.affiliate_commission),'lm',ME.role==='bd'?'your BD %':'affiliate %']];
  cards.forEach(([l,v,cl,sub])=>{const k=el('div','card kpi');k.innerHTML='<div class="lbl">'+l+'</div><div class="val '+cl+'">'+v+'</div><div class="sub">'+(sub||'')+'</div>';kp.appendChild(k);});
  c.appendChild(kp);
  const chartCard=el('div','card');chartCard.innerHTML='<div class="section-head"><h2>Sales over time</h2><span class="hint">'+RANGE.toUpperCase()+'</span></div><canvas id="tsChart" height="90"></canvas>';
  c.appendChild(chartCard);
  drawChart(ts);
}
function drawChart(ts){
  if(chart){chart.destroy();chart=null;}
  const ctx=document.getElementById('tsChart');if(!ctx)return;
  const g=ctx.getContext('2d').createLinearGradient(0,0,0,220);g.addColorStop(0,'#22d3ee66');g.addColorStop(1,'#22d3ee00');
  chart=new Chart(ctx,{type:'line',data:{labels:ts.map(r=>r.day),datasets:[{label:'Revenue',data:ts.map(r=>r.revenue),borderColor:'#22d3ee',backgroundColor:g,fill:true,tension:.33,pointRadius:0,borderWidth:2}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#5f768a',maxTicksLimit:8}},y:{grid:{color:'#1b2836'},ticks:{color:'#5f768a',callback:v=>'$'+v}}}}});
}

// ---------- affiliates / my sales ----------
async function renderAffiliates(c){
  const rows=await api('/affiliates?range='+RANGE);
  c.innerHTML='';
  const card=el('div','card');
  const max=Math.max(1,...rows.map(r=>r.revenue));
  let body=rows.map(r=>'<tr><td><span class="code">'+r.code+'</span></td><td>'+r.name+'</td>'+
    (ME.role==='admin'?'<td class="muted">'+(r.bd_name||'—')+'</td>':'')+
    '<td>'+r.signups+'</td><td>'+r.sales_count+'</td>'+
    '<td><div style="display:flex;align-items:center;gap:8px"><span>'+fmt(r.revenue)+'</span><div class="bar" style="width:70px"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></div></td>'+
    '<td class="pos">'+fmt2(r.commission)+'</td><td class="muted">'+(r.commission_pct||0)+'%</td><td class="muted">'+(r.last_sale||'—')+'</td></tr>').join('');
  if(!rows.length)body='<tr><td colspan="9" class="muted">No data for this range.</td></tr>';
  card.innerHTML='<div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th>'+(ME.role==='admin'?'<th>BD</th>':'')+'<th>Sign-ups</th><th>Sales</th><th>Revenue</th><th>Commission</th><th>Rate</th><th>Last sale</th></tr></thead><tbody>'+body+'</tbody></table></div>';
  c.appendChild(card);
}

// ---------- leaderboard ----------
async function renderLeaderboard(c){
  c.innerHTML='';
  if(ME.role==='admin'){
    const bd=await api('/leaderboard/bd?range='+RANGE);
    const card=el('div','card');const max=Math.max(1,...bd.map(r=>r.revenue));
    card.innerHTML='<div class="section-head"><h2>BD Leaderboard</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>BD</th><th>Affiliates</th><th>Revenue</th><th>Commission</th><th></th></tr></thead><tbody>'+
      bd.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+r.name+'</td><td>'+r.affiliates+'</td><td>'+fmt(r.revenue)+'</td><td class="pos">'+fmt2(r.commission)+'</td><td style="width:120px"><div class="bar"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></td></tr>').join('')+
      '</tbody></table></div>';
    c.appendChild(card);
  }
  const aff=await api('/leaderboard/affiliate?range='+RANGE);
  const card2=el('div','card');const max2=Math.max(1,...aff.map(r=>r.revenue));
  card2.innerHTML='<div class="section-head"><h2>Affiliate Leaderboard</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Affiliate</th><th>Code</th><th>Sales</th><th>Revenue</th><th></th></tr></thead><tbody>'+
    (aff.length?aff.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+r.name+'</td><td><span class="code">'+r.code+'</span></td><td>'+r.sales_count+'</td><td>'+fmt(r.revenue)+'</td><td style="width:120px"><div class="bar"><i style="width:'+Math.round(r.revenue/max2*100)+'%"></i></div></td></tr>').join(''):'<tr><td colspan="6" class="muted">No data.</td></tr>')+
    '</tbody></table></div>';
  c.appendChild(card2);
}

// ---------- products ----------
async function renderProducts(c){
  const rows=await api('/products?range='+RANGE);c.innerHTML='';
  const card=el('div','card');const max=Math.max(1,...rows.map(r=>r.revenue));
  card.innerHTML='<div class="section-head"><h2>Product breakdown</h2></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Orders</th><th>Revenue</th><th></th></tr></thead><tbody>'+
    (rows.length?rows.map(r=>'<tr><td>'+r.product+'</td><td>'+r.orders+'</td><td>'+fmt(r.revenue)+'</td><td style="width:160px"><div class="bar"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></td></tr>').join(''):'<tr><td colspan="4" class="muted">No data.</td></tr>')+
    '</tbody></table></div>';
  c.appendChild(card);
}

// ---------- admin ----------
async function renderAdmin(c){
  if(ME.role!=='admin'){c.innerHTML='<div class="notice">Admins only.</div>';return;}
  const o=await api('/admin/overview');c.innerHTML='';
  c.appendChild(el('div','notice','Data source adapter: <b>'+o.adapter+'</b>. '+(o.adapter==='sample'?'Showing seeded sample data. Set DATA_ADAPTER=sheet + SALES_CSV_URL for live import, or connect the FundedXYZ API adapter (see BACKEND_REQUIREMENTS.md).':'Live import active.')));
  const impBtn=el('button','btn lime sm','Run import now');impBtn.onclick=async()=>{impBtn.textContent='Importing…';try{const r=await api('/admin/import',{method:'POST'});impBtn.textContent='Imported '+(r.result.sales||0)+' sales';setTimeout(()=>render(),1200);}catch(e){impBtn.textContent='Error: '+e.message;}};
  c.appendChild(impBtn);

  const grid=el('div','admin-grid');
  // create user
  grid.appendChild(formCard('Create user',[
    ['email','Email','email'],['name','Name','text'],
    ['role','Role','select',['admin','bd','affiliate']],
    ['bd_id','BD (for bd/affiliate)','select-bd'],
    ['affiliate_id','Affiliate (for affiliate user)','select-aff']
  ],async v=>{const r=await api('/admin/users',{method:'POST',body:JSON.stringify(v)});return 'Created. Temp password: '+r.temp_password;},o));
  // create BD
  grid.appendChild(formCard('Create BD',[['name','BD name','text'],['commission_pct','Commission %','number']],
    async v=>{await api('/admin/bds',{method:'POST',body:JSON.stringify(v)});return 'BD created.';},o));
  // create affiliate
  grid.appendChild(formCard('Create affiliate',[['code','Promo/referral code','text'],['name','Name','text'],['referral_id','Platform referral id','text'],['bd_id','Assign to BD','select-bd'],['commission_pct','Commission %','number']],
    async v=>{await api('/admin/affiliates',{method:'POST',body:JSON.stringify(v)});return 'Affiliate created.';},o));
  // assign / commission
  grid.appendChild(formCard('Assign affiliate to BD',[['affiliate_id','Affiliate','select-aff'],['bd_id','BD','select-bd']],
    async v=>{await api('/admin/assign',{method:'POST',body:JSON.stringify(v)});return 'Assigned.';},o));
  grid.appendChild(formCard('Set affiliate commission %',[['id','Affiliate','select-aff'],['commission_pct','Commission %','number']],
    async v=>{await api('/admin/commission',{method:'POST',body:JSON.stringify({entity:'affiliate',id:v.id,commission_pct:v.commission_pct})});return 'Updated.';},o));
  grid.appendChild(formCard('Set BD commission %',[['id','BD','select-bd'],['commission_pct','Commission %','number']],
    async v=>{await api('/admin/commission',{method:'POST',body:JSON.stringify({entity:'bd',id:v.id,commission_pct:v.commission_pct})});return 'Updated.';},o));
  c.appendChild(grid);

  // current users table
  const ut=el('div','card');
  ut.innerHTML='<div class="section-head"><h2>Users</h2></div><div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Scope</th></tr></thead><tbody>'+
    o.users.map(u=>'<tr><td>'+u.email+'</td><td>'+u.name+'</td><td><span class="chip role">'+u.role+'</span></td><td class="muted">'+(u.bd_id?('bd#'+u.bd_id):'')+(u.affiliate_id?(' aff#'+u.affiliate_id):'')+(u.role==='admin'?'all':'')+'</td></tr>').join('')+
    '</tbody></table></div>';
  c.appendChild(ut);
}
function formCard(title,fields,onSubmit,o){
  const card=el('div','card');card.innerHTML='<div class="section-head"><h2>'+title+'</h2></div>';
  const form=el('form');const inputs={};
  fields.forEach(([key,label,type,opts])=>{
    const l=el('label',null,label);form.appendChild(l);let inp;
    if(type==='select'){inp=el('select');opts.forEach(op=>inp.appendChild(el('option',null,op)));}
    else if(type==='select-bd'){inp=el('select');inp.appendChild(el('option',null,'—'));(o.bds||[]).forEach(b=>{const op=el('option',null,b.name);op.value=b.id;inp.appendChild(op);});}
    else if(type==='select-aff'){inp=el('select');inp.appendChild(el('option',null,'—'));(o.affiliates||[]).forEach(a=>{const op=el('option',null,a.code+' — '+a.name);op.value=a.id;inp.appendChild(op);});}
    else{inp=el('input');inp.type=type;}
    inputs[key]=inp;form.appendChild(inp);
  });
  const msg=el('div','err');const btn=el('button','btn sm','Save');btn.style.marginTop='14px';btn.type='submit';
  form.appendChild(btn);form.appendChild(msg);
  form.addEventListener('submit',async e=>{e.preventDefault();msg.style.color='';msg.textContent='';
    const v={};Object.keys(inputs).forEach(k=>{const val=inputs[k].value;v[k]=(val==='—'||val==='')?null:val;});
    try{const r=await onSubmit(v);msg.style.color='var(--lime)';msg.textContent=r||'Done.';}catch(err){msg.textContent=err.message;}});
  card.appendChild(form);return card;
}

// ---------- init ----------
(async()=>{try{const me=await api('/me');ME=me;if(me.must_change_pw)showChangePw();else boot();}catch(e){/* show login */}})();
