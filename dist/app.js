import { DEFAULT_NETWORK, SCENARIOS, makeScenario, optimizeNetwork } from './optimizer.js';
import { mapMarkup, project } from './asia-map.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const number = new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const price = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const state = {scenario:'baseline',demandScale:1,layer:'plan',selected:null,dirty:true,benchmarkKind:'assumed'};
let currentInput = null;
let result = null;
let market = null;
let network = structuredClone(DEFAULT_NETWORK);
const svg = $('#atlas-map');
const dialog = $('#method-dialog');

for (const scenario of SCENARIOS) $('#scenario').add(new Option(scenario.name || scenario.label || scenario.id,scenario.id));
const labels = [[107,35,'CHINA','country-label'],[137.8,41.8,'JAPAN','country-label'],[129.7,40.5,'KOREA','country-label'],[108.7,13,'South China Sea','sea-label'],[140,22,'Philippine Sea','sea-label']];
svg.innerHTML=`<defs><marker id="route-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#d74329" stroke-width="1"/></marker></defs><g aria-hidden="true">${mapMarkup}${labels.map(([lon,lat,text,cls])=>{const[x,y]=project(lon,lat);return `<text class="${cls}" x="${x}" y="${y}">${text}</text>`;}).join('')}</g><g id="route-background" aria-hidden="true"></g><g id="active-route" aria-hidden="true"></g><g id="network-nodes"></g>`;

function inputCell(value,group,index,field,label,{min=0,max=1000000}={}) {
  return `<input type="number" value="${esc(value)}" min="${min}" max="${max}" step="any" inputmode="decimal" data-group="${group}" data-index="${index}" data-field="${field}" aria-label="${esc(label)}" required>`;
}
function renderAssumptions() {
  $('#supply-inputs').innerHTML=network.supplies.map((s,i)=>`<tr><td>${esc(s.id)}<small>${esc(s.city)}</small></td><td>${inputCell(s.capacity,'supplies',i,'capacity',`${s.city} supply capacity tonnes`)}</td><td>${inputCell(s.basisUsdPerTonne,'supplies',i,'basisUsdPerTonne',`${s.city} supplier basis USD per tonne`,{min:-5000,max:5000})}</td></tr>`).join('');
  $('#demand-inputs').innerHTML=network.demands.map((d,i)=>`<tr><td>${esc(d.id)}<small>${esc(d.city)}</small></td><td>${inputCell(d.demand,'demands',i,'demand',`${d.city} base demand tonnes`)}</td><td>${inputCell(d.inventory,'demands',i,'inventory',`${d.city} starting inventory tonnes`)}</td><td>${inputCell(d.reserve,'demands',i,'reserve',`${d.city} required reserve tonnes`)}</td></tr>`).join('');
  $('#lane-inputs').innerHTML=network.routes.map((r,i)=>`<tr><td>${esc(r.from)} → ${esc(r.to)}</td><td>${inputCell(r.capacity,'routes',i,'capacity',`${r.from} to ${r.to} lane capacity tonnes`)}</td><td>${inputCell(r.shippingUsdPerTonne,'routes',i,'shippingUsdPerTonne',`${r.from} to ${r.to} shipping USD per tonne`,{min:0,max:10000})}</td><td>${inputCell(r.handlingUsdPerTonne,'routes',i,'handlingUsdPerTonne',`${r.from} to ${r.to} handling USD per tonne`,{min:0,max:10000})}</td><td>${inputCell(r.storageUsdPerTonne??0,'routes',i,'storageUsdPerTonne',`${r.from} to ${r.to} storage USD per tonne`,{min:0,max:10000})}</td></tr>`).join('');
}
function nodes() {return [...(currentInput?.supplies || network.supplies).map(n=>({...n,type:'supply'})),...(currentInput?.demands || network.demands).map(n=>({...n,type:'demand'}))];}
function node(id) {return nodes().find(n=>n.id===id);}
function pathBetween(a,b) {const[ax,ay]=project(a.lon,a.lat);const[bx,by]=project(b.lon,b.lat);return `M${ax},${ay} Q${(ax+bx)/2+(by-ay)*.13},${(ay+by)/2-(bx-ax)*.13} ${bx},${by}`;}
function renderMap() {
  const focused=document.activeElement?.closest('[data-node]')?.dataset.node;
  const nodeList=nodes();
  const input=currentInput || network;
  $('#route-background').innerHTML=state.layer==='lanes'||!result ? input.routes.map(r=>{const a=nodeList.find(n=>n.id===r.from);const b=nodeList.find(n=>n.id===r.to);return a&&b?`<path class="background-route" d="${pathBetween(a,b)}"/>`:'';}).join(''):'';
  $('#active-route').innerHTML=result&&!state.dirty ? result.routes.filter(r=>r.quantity>0.0001).map(r=>{const a=node(r.from),b=node(r.to);if(!a||!b)return '';const route=pathBetween(a,b);const selected=!state.selected||state.selected===r.from||state.selected===r.to;return `<path class="route-line${selected?' highlighted':''}" d="${route}" marker-end="url(#route-arrow)" opacity="${selected?1:.22}"/><path class="route-flow" d="${route}" opacity="${selected?.8:.15}"/>`;}).join(''):'';
  $('#network-nodes').innerHTML=nodeList.map(n=>{
    const[x,y]=project(n.lon,n.lat);const left=['ULS','HKG'].includes(n.id);const dx=left?-17:17;const anchor=left?'end':'start';
    const required=result?.demandRequirements?.find(d=>d.id===n.id)?.requiredDelivery;
    const quantity=state.dirty?(n.type==='supply'?'SUPPLY':'DEMAND'):n.type==='supply'?`${number.format(n.capacity)} t AVAILABLE`:`${number.format(required??Math.max(0,n.demand+n.reserve-n.inventory))} t REQUIRED`;
    const shape=n.type==='supply'?'<rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="#20221e"/>':'<circle r="5" fill="#efece1" stroke="#d74329" stroke-width="2.5"/>';
    return `<g class="airport-node${state.selected===n.id?' selected':''}" transform="translate(${x},${y})" role="button" tabindex="0" data-node="${esc(n.id)}" aria-label="Inspect ${esc(n.city)} ${n.type} center" aria-pressed="${state.selected===n.id}"><circle class="airport-hit" r="18"/><circle class="airport-ring" r="12" stroke-opacity="${state.selected===n.id?1:.35}"/>${shape}<text class="airport-code" x="${dx}" y="-2" text-anchor="${anchor}">${esc(n.city.toUpperCase())}</text><text class="network-quantity" x="${dx}" y="12" text-anchor="${anchor}">${quantity}</text></g>`;
  }).join('');
  if(focused)svg.querySelector(`[data-node="${focused}"]`)?.focus({preventScroll:true});
}
function showNode(id) {
  state.selected=state.selected===id?null:id;renderMap();
  if(!state.selected){updateMapStatus();return;}
  const n=node(id);if(!n)return;
  const used=result?.supplyUsed?.find(s=>s.id===id)?.used||0;
  const incoming=result?.routes?.filter(r=>r.to===id).reduce((a,r)=>a+r.quantity,0)||0;
  $('#map-status').textContent=state.dirty?`${n.city} · ${n.type} center · inputs pending` : n.type==='supply'?`${n.city} · ${number.format(used)} / ${number.format(n.capacity)} t allocated`:`${n.city} · ${number.format(incoming)} t inbound`;
}
function updateMapStatus(){ $('#map-status').textContent=state.dirty?'Inputs changed · optimize to refresh the plan':result?.feasible?'Feasible allocation · all required demand covered':'Supply shortfall · partial allocation shown'; }
function clearResults() {
  $('#total-cost').textContent='—';$('#delivered-total').textContent='—';$('#unmet-total').textContent='—';$('#baseline-savings').textContent='—';$('#active-lanes').textContent='—';$('#unit-cost').textContent='—';
  $('#result-verdict').textContent='Inputs changed · optimize to refresh';$('#result-verdict').classList.remove('warning');$('#result-indicator').textContent='';
  $('#allocation-rows').innerHTML='<tr><td colspan="4" class="empty-table">Choose “Optimize allocation” to calculate a plan.</td></tr>';
  $('#cost-breakdown').innerHTML='';$('#constraint-summary').textContent='';$('#baseline-note').textContent='A baseline comparison requires a fresh feasible result.';
  $('#export-button').disabled=true;$('#export-json').disabled=true;updateMapStatus();renderMap();
}
function markDirty() { state.dirty=true;state.selected=null;clearResults(); }
function readInputs() {
  const invalid=[...document.querySelectorAll('#model-form input, .assumptions-section input')].find(el=>!el.validity.valid||el.value==='');
  if(invalid){invalid.reportValidity();throw new Error(`Check ${invalid.getAttribute('aria-label')||invalid.id}: enter a valid value within its bounds.`);}
  for(const input of document.querySelectorAll('.assumptions-section input'))network[input.dataset.group][Number(input.dataset.index)][input.dataset.field]=input.valueAsNumber;
  return makeScenario({benchmarkUsdPerTonne:$('#benchmark').valueAsNumber,scenario:state.scenario,demandScale:state.demandScale,supplies:network.supplies,demands:network.demands,routes:network.routes});
}
function renderResults() {
  const unmet=result.unmetDemand.reduce((a,d)=>a+d.quantity,0);
  $('#cost-heading').textContent=result.feasible?'TOTAL DELIVERED COST':'PARTIAL ALLOCATION COST';
  $('#total-cost').textContent=usd.format(result.totalCost);
  $('#result-verdict').textContent=result.feasible?'Feasible · all required demand covered':`Infeasible · ${number.format(unmet)} t still unmet`;
  $('#result-verdict').classList.toggle('warning',!result.feasible);$('#result-indicator').textContent=result.feasible?'↗':'!';
  $('#delivered-total').textContent=`${number.format(result.delivered)} / ${number.format(result.requiredDemand)} t`;
  $('#unmet-total').textContent=`${number.format(unmet)} t`;
  const comparable=result.feasible&&result.baseline?.feasible&&Number.isFinite(result.baseline.savings);
  $('#baseline-savings').textContent=comparable?`${usd.format(result.baseline.savings)}${Number.isFinite(result.baseline.savingsPct)?' ('+number.format(result.baseline.savingsPct)+'%)':''}`:'Not comparable';
  $('#baseline-note').textContent=comparable?`Shipping-cost-first baseline: ${usd.format(result.baseline.totalCost)}. Same inputs and delivered demand.`:'Savings hidden: a complete feasible baseline and optimized plan are both required.';
  const active=result.routes.filter(r=>r.quantity>0.0001);
  $('#active-lanes').textContent=String(active.length);$('#unit-cost').textContent=result.delivered>0?`${usd.format(result.totalCost/result.delivered)}/t`:'No delivery';
  $('#allocation-rows').innerHTML=active.length?active.map(r=>`<tr><td>${esc(r.from)}<span>→</span>${esc(r.to)}</td><td>${number.format(r.quantity)}</td><td>${price.format(r.unitCost)}</td><td>${usd.format(r.cost)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-table">No shipments allocated for these constraints.</td></tr>';
  const breakdown=result.costBreakdown;
  const categories=[['Procurement',(breakdown.benchmark||0)+(breakdown.basis||0)],['Shipping',breakdown.shipping||0],['Handling',breakdown.handling||0],['Storage',breakdown.storage||0]].filter(([,v],i)=>i<3||v>0);
  $('#cost-breakdown').innerHTML=categories.map(([label,value])=>`<div class="cost-row"><div><span>${label}</span><strong>${usd.format(value)}</strong></div><b><i style="width:${Math.max(0,Math.min(100,result.totalCost>0?value/result.totalCost*100:0))}%"></i></b></div>`).join('');
  const shortages=result.unmetDemand.filter(d=>d.quantity>0.001);
  const limits=result.bindingConstraints?.filter(c=>c.type!=='demand')||[];
  $('#constraint-summary').textContent=shortages.length?`Unmet: ${shortages.map(d=>`${d.id} ${number.format(d.quantity)} t`).join(' · ')}. ${limits.length} supply/lane constraints are binding.`:limits.length?`Binding: ${limits.slice(0,3).map(c=>c.label||c.id).join(' · ')}${limits.length>3?' …':''}`:'No supply or lane capacity is fully used.';
  const selected=SCENARIOS.find(s=>s.id===state.scenario);$('#scenario-description').textContent=selected?.description||'Scenario parameters are estimated inputs, not a forecast.';
  $('#export-button').disabled=false;$('#export-json').disabled=false;updateMapStatus();renderMap();
}
function optimize() {
  const error=$('#model-error');
  try {currentInput=readInputs();result=optimizeNetwork(currentInput);state.dirty=false;state.selected=null;error.hidden=true;renderResults();}
  catch(e){result=null;state.dirty=true;error.hidden=false;error.textContent=e.message;clearResults();$('#result-verdict').textContent='Please correct the inputs';}
}
function safeUrl(raw) {try{const url=new URL(raw);return url.protocol==='https:'?url.href:null;}catch{return null;}}
function renderMarketUnavailable(message) {
  $('#source-status').textContent='SOURCE UNAVAILABLE';$('#source-status').classList.add('stale');$('#source-value').textContent='No observation';$('#source-date').textContent='An estimated benchmark is used instead.';$('#source-conversion').textContent='Model benchmark is a visible assumption; no observed price is being claimed.';$('#source-collected').textContent=message;
  $('#ticker-values').innerHTML='<span class="ticker-item"><strong>ESTIMATED INPUT</strong><b>Enter benchmark in the model</b></span>';
}
async function loadMarket() {
  try {
    const response=await fetch('./data/market.json',{cache:'no-store'});if(!response.ok)throw new Error('Saved market snapshot is unavailable.');
    const data=await response.json();const latest=data.latest;const converted=Number(data.conversion?.usdPerTonne);
    if(!latest||!/^\d{4}-\d{2}-\d{2}$/.test(latest.date)||!Number.isFinite(latest.value)||latest.value<=0||!Number.isFinite(converted)||converted<=0)throw new Error('Saved snapshot has no valid observation or conversion.');
    const observedAt=new Date(`${latest.date}T00:00:00Z`);if(!Number.isFinite(observedAt.getTime())||observedAt.toISOString().slice(0,10)!==latest.date)throw new Error('Saved observation date is invalid.');
    if(observedAt.getTime()>Date.now())throw new Error('Saved observation date is in the future.');
    market=data;const age=Math.max(0,Math.floor((Date.now()-observedAt.getTime())/86400000));const stale=age>(data.staleAfterDays??7);
    $('#source-status').textContent=stale?`OBSERVED · STALE (${age} DAYS)`:'OBSERVED · SAVED SNAPSHOT';$('#source-status').classList.toggle('stale',stale);
    $('#source-value').textContent=`$${latest.value.toFixed(3)} / gal`;$('#source-date').textContent=`Observation: ${latest.date} · ${data.source?.region||'U.S. Gulf Coast'}`;
    const link=safeUrl(data.source?.url);if(link)$('#source-link').href=link;$('#source-link').textContent=`${data.source?.title||'EIA · U.S. Gulf Coast jet fuel'} ↗`;
    $('#source-conversion').textContent=`${usd.format(converted)}/t at assumed density ${data.conversion.densityKgPerLitre} kg/L; ${data.conversion.litresPerUsGallon} L/US gallon. Not an Asian delivered quote.`;
    const fetched=new Date(data.fetchedAt);const collected=Number.isFinite(fetched.getTime())?fetched.toISOString().slice(0,16).replace('T',' ')+' UTC':'time unavailable';
    $('#source-collected').textContent=`Collected: ${collected}. Snapshot ${stale?'is older than the '+(data.staleAfterDays??7)+'-day freshness threshold':'is within the '+(data.staleAfterDays??7)+'-day freshness threshold'}. No continuous live feed.`;
    $('#ticker-values').innerHTML=`<span class="ticker-item"><strong>USGC</strong><b>$${latest.value.toFixed(3)}/gal</b></span><span class="ticker-item"><strong>PROXY</strong><b>${usd.format(converted)}/t</b></span><span class="ticker-item"><strong>${esc(latest.date)}</strong><i>${stale?'STALE SNAPSHOT':'OBSERVATION DATE'}</i></span>`;
    if(state.benchmarkKind==='assumed'){$('#benchmark').value=converted.toFixed(2);state.benchmarkKind='observed';$('#benchmark-basis').textContent=`Observed USGC proxy, ${latest.date}${stale?' · stale snapshot':''}. Editable; Asian basis and logistics are estimated.`;}
  } catch(e) {renderMarketUnavailable(e.message);}
  optimize();
}

$('#model-form').addEventListener('submit',event=>{event.preventDefault();optimize();});
$('#scenario').addEventListener('change',()=>{state.scenario=$('#scenario').value;markDirty();});
$('#benchmark').addEventListener('input',()=>{state.benchmarkKind='manual';$('#benchmark-basis').textContent='Manual scenario input · this overrides the saved benchmark for the model.';markDirty();});
$('#demand-scale').addEventListener('input',()=>{state.demandScale=Number($('#demand-scale').value);$('#demand-scale-label').value=`${state.demandScale.toFixed(1)}×`;markDirty();});
$('.assumptions-section').addEventListener('input',event=>{if(event.target.matches('input[data-group]'))markDirty();});
$('#reset-assumptions').addEventListener('click',()=>{network=structuredClone(DEFAULT_NETWORK);renderAssumptions();markDirty();});
for(const layer of ['plan','lanes']) $(`#layer-${layer}`).addEventListener('click',()=>{state.layer=layer;for(const other of ['plan','lanes']){$(`#layer-${other}`).classList.toggle('selected',other===layer);$(`#layer-${other}`).setAttribute('aria-pressed',String(other===layer));}renderMap();});
svg.addEventListener('click',event=>{const target=event.target.closest('[data-node]');if(target)showNode(target.dataset.node);});
svg.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const target=event.target.closest('[data-node]');if(target){event.preventDefault();showNode(target.dataset.node);}}});
let dialogOpener=null;
for(const button of document.querySelectorAll('[data-open-method]'))button.addEventListener('click',()=>{dialogOpener=button;dialog.showModal();});
$('#close-method').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialogOpener?.focus());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
const scrollToSection=selector=>$(selector).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
$('#nav-map').addEventListener('click',()=>scrollToSection('#main'));$('#nav-markets').addEventListener('click',()=>scrollToSection('#markets'));
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-button').addEventListener('click',()=>{
  if(state.dirty||!result)return;
  const rows=[['data_status','scenario','feasible','origin','destination','quantity_t','unit_cost_usd_per_t','total_cost_usd','benchmark_usd_per_t','benchmark_kind','source_observation_date'],...result.routes.map(r=>['ESTIMATED_NETWORK',state.scenario,result.feasible,r.from,r.to,r.quantity,r.unitCost,r.cost,currentInput.benchmarkUsdPerTonne,state.benchmarkKind,market?.latest?.date||'unavailable'])];
  for(const d of result.unmetDemand.filter(d=>d.quantity>0))rows.push(['UNMET_DEMAND',state.scenario,result.feasible,'',d.id,d.quantity,'','',currentInput.benchmarkUsdPerTonne,state.benchmarkKind,market?.latest?.date||'unavailable']);
  const csv=rows.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');download('\uFEFF'+csv,`fuel-atlas-${state.scenario}-allocation.csv`,'text/csv;charset=utf-8');
});
$('#export-json').addEventListener('click',()=>{if(state.dirty||!result)return;download(JSON.stringify({exportedAt:new Date().toISOString(),dataStatus:'Estimated physical network; USGC reference proxy only',benchmarkKind:state.benchmarkKind,marketSource:market,baseInputs:network,inputs:currentInput,results:result},null,2),`fuel-atlas-${state.scenario}-scenario.json`,'application/json');});
renderAssumptions();renderMap();loadMarket();
