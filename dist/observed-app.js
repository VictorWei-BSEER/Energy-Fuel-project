import { mapMarkup, project } from './asia-map.js';

const REMOTE_BASES=[
 'https://raw.githubusercontent.com/VictorWei-BSEER/Energy-Fuel-project/main/dist/',
 'https://raw.githubusercontent.com/VictorWei-BSEER/Energy-Fuel-project/codex/complete-energy-model/dist/',
 './',
];
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=Number.isFinite;
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:6});
const state={loading:false,tab:'jet',selectedAirport:'SIN',catalog:null,records:[],lastCheck:null,origin:null};
const ids={jet:'eia-usgc-jet-fuel-daily',brent:'eia-brent-daily',fx:'ecb-reference-fx',jodi:'jodi-jet-kerosene-monthly',airports:'ourairports-coordinates'};
const flowNames={CLOSTLV:'Closing stocks',REFGROUT:'Refinery output',TOTDEMO:'Total demand',TOTEXPSB:'Exports',TOTIMPSB:'Imports'};
const countries={CN:'China',HK:'Hong Kong',JP:'Japan',KR:'South Korea',SG:'Singapore',TW:'Taiwan'};
const svg=$('#atlas-map');
const mapLabels=[[107,35,'CHINA','country-label'],[137.8,41.8,'JAPAN','country-label'],[129.7,40.5,'KOREA','country-label'],[108.7,13,'South China Sea','sea-label'],[140,22,'Philippine Sea','sea-label']];
svg.innerHTML=`<g aria-hidden="true">${mapMarkup}${mapLabels.map(([lon,lat,label,cls])=>{const[x,y]=project(lon,lat);return `<text class="${cls}" x="${x}" y="${y}">${label}</text>`;}).join('')}</g><g id="airport-nodes"></g>`;
const empty=(cols,message)=>`<tr><td colspan="${cols}" class="empty-table">${esc(message)}</td></tr>`;
function safeUrl(raw){try{const url=new URL(raw);return url.protocol==='https:'?url.href:null;}catch{return null;}}
function observationTime(date,dailyOnly=false){
 if(typeof date!=='string')return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const d=new Date(`${date}T00:00:00Z`);return finite(d.getTime())&&d.toISOString().slice(0,10)===date&&d.getTime()<=Date.now()?d.getTime():null;}
 if(!dailyOnly&&/^\d{4}-\d{2}$/.test(date)){const start=new Date(`${date}-01T00:00:00Z`);if(!finite(start.getTime())||start.toISOString().slice(0,7)!==date||start.getTime()>Date.now())return null;const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);return end.getTime();}
 return null;
}
const validDate=(date,dailyOnly=false)=>observationTime(date,dailyOnly)!==null;
function ageDays(date){const time=observationTime(date);return time===null?null:Math.max(0,Math.floor((Date.now()-time)/86400000));}
function record(key){return state.records.find(r=>r.feed.id===ids[key]);}
function dataset(key){const r=record(key);if(!r||r.feed.status!=='observed')return null;return r.data;}
function dailyRows(key){const d=dataset(key);return Array.isArray(d?.observations)?d.observations.filter(o=>validDate(o.date,true)&&finite(o.value)).sort((a,b)=>b.date.localeCompare(a.date)):[];}
function latestDaily(key){const d=dataset(key);return d?.latest&&validDate(d.latest.date,true)&&finite(d.latest.value)?d.latest:null;}
function airportRows(){const d=dataset('airports');return Array.isArray(d?.airports)?d.airports.filter(a=>typeof a.iata==='string'&&finite(a.lat)&&finite(a.lon)&&a.lat>=-90&&a.lat<=90&&a.lon>=-180&&a.lon<=180):[];}
function jodiRows(){const data=dataset('jodi');return Array.isArray(data?.observations)?data.observations.filter(r=>validDate(r.date)&&/^\d{4}-\d{2}$/.test(r.date)&&finite(r.value)&&r.product==='JETKERO'&&r.unit==='KTONS'):[];}
function selectedJodi(){const period=$('#jodi-period').value,country=$('#jodi-country').value;return jodiRows().filter(r=>r.date===period&&(country==='all'||r.country===country)).sort((a,b)=>a.country.localeCompare(b.country)||a.flow.localeCompare(b.flow));}
function renderSummary(){
 for(const key of ['jet','brent']){const latest=latestDaily(key);$(`#${key}-value`).textContent=latest?`$${latest.value.toFixed(key==='jet'?3:2)}`:'Unavailable';$(`#${key}-date`).textContent=latest?`Observed ${latest.date} · reporting lag`:'No valid published observation';}
 const fx=dataset('fx');const latestFx=fx?.latest;const validFx=latestFx&&validDate(latestFx.date,true)&&finite(latestFx.rates?.USD);
 $('#fx-value').textContent=validFx?latestFx.rates.USD.toFixed(4):'Unavailable';$('#fx-date').textContent=validFx?`Observed ${latestFx.date} · reference rate`:'No valid published observation';
 const jodi=jodiRows();const latestMonth=jodi.map(r=>r.date).sort().at(-1);const coverage=latestMonth?new Set(jodi.filter(r=>r.date===latestMonth).map(r=>r.country)):new Set();
 $('#jodi-value').textContent=latestMonth||'Unavailable';$('#jodi-date').textContent=latestMonth?`${coverage.size} reporting economies · monthly`:'No valid monthly records';
 $('#ticker-values').innerHTML=`<span class="ticker-item"><strong>EIA</strong><b>DAILY · REPORTING LAG</b></span><span class="ticker-item"><strong>ECB</strong><b>BUSINESS DAYS</b></span><span class="ticker-item"><strong>JODI</strong><b>MONTHLY</b></span>`;
}
function renderMap(){
 const airports=airportRows();if(!airports.some(a=>a.iata===state.selectedAirport))state.selectedAirport=airports[0]?.iata||null;
 $('#airport-select').replaceChildren(...airports.map(a=>new Option(`${a.iata} · ${a.city||a.name}`,a.iata)));if(state.selectedAirport)$('#airport-select').value=state.selectedAirport;
 const focused=document.activeElement?.closest('[data-airport]')?.dataset.airport;
 $('#airport-nodes').innerHTML=airports.map(a=>{const[x,y]=project(a.lon,a.lat);const left=['ICN','KIX','HKG','BKK'].includes(a.iata),dx=left?-15:15,anchor=left?'end':'start';return `<g class="airport-node${a.iata===state.selectedAirport?' selected':''}" transform="translate(${x},${y})" role="button" tabindex="0" data-airport="${esc(a.iata)}" aria-label="Inspect ${esc(a.name)} coordinates; no verified fuel quote" aria-pressed="${a.iata===state.selectedAirport}"><circle class="airport-hit" r="17"/><circle class="airport-ring" r="${a.iata===state.selectedAirport?10:7}"/><circle class="airport-core" r="4" fill="#20221e"/><text class="airport-code" x="${dx}" y="-2" text-anchor="${anchor}">${esc(a.iata)}</text><text class="airport-price" x="${dx}" y="12" text-anchor="${anchor}">${esc(a.city||'')}</text></g>`;}).join('');
 $('#map-count').innerHTML=`${airports.length} SOURCED AIRPORT LOCATIONS<br>NO INFERRED MARKET VALUES`;
 const selected=airports.find(a=>a.iata===state.selectedAirport);$('#airport-title').textContent=selected?selected.city||selected.iata:'No location data';$('#airport-name').textContent=selected?`${selected.name} · ${selected.iata} / ${selected.icao}`:'Unavailable';$('#airport-coordinates').textContent=selected?`${number.format(selected.lat)}°, ${number.format(selected.lon)}°`:'Unavailable';$('#map-status').textContent=selected?`${selected.iata} · coordinates from OurAirports · no price or stock observation`:'No valid airport coordinate snapshot';
 if(focused)svg.querySelector(`[data-airport="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
}
function renderChart(key){
 const rows=[...dailyRows(key)].reverse();const chart=$(`#${key}-chart`);if(!rows.length){chart.innerHTML='<text class="chart-axis" x="450" y="100" text-anchor="middle">No valid observations to plot.</text>';return;}
 const min=Math.min(...rows.map(r=>r.value)),max=Math.max(...rows.map(r=>r.value)),range=max-min||1;const low=min-range*.12,high=max+range*.12;
 const x=i=>70+(rows.length===1?385:i/(rows.length-1)*770),y=v=>155-(v-low)/(high-low)*125;
 const grid=Array.from({length:4},(_,i)=>{const v=low+(high-low)*i/3;return `<line class="chart-grid" x1="65" y1="${y(v)}" x2="850" y2="${y(v)}"/><text class="chart-axis" x="55" y="${y(v)+3}" text-anchor="end">${v.toFixed(key==='jet'?3:2)}</text>`;}).join('');
 chart.innerHTML=`${grid}<path class="chart-stock" d="${rows.map((r,i)=>`${i?'L':'M'}${x(i)},${y(r.value)}`).join('')}"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.value)}" r="2.7" fill="#d74329"><title>${r.date}: ${r.value} ${esc(key==='jet'?'USD/US gallon':'USD/barrel')}</title></circle>`).join('')}<text class="chart-axis" x="70" y="184">${rows[0].date}</text><text class="chart-axis" x="850" y="184" text-anchor="end">${rows.at(-1).date}</text>`;
}
function renderTables(){
 for(const key of ['jet','brent']){const rows=dailyRows(key),unit=key==='jet'?'USD/US gallon':'USD/barrel';$(`#${key}-rows`).innerHTML=rows.length?rows.map(r=>`<tr><td>${r.date}</td><td>${number.format(r.value)}</td><td>${unit}</td><td>EIA · published observation</td></tr>`).join(''):empty(4,'No valid observations available.');renderChart(key);}
 const fx=dataset('fx');const fxValid=fx?.latest&&validDate(fx.latest.date,true)&&fx.latest.rates&&typeof fx.latest.rates==='object';const rates=fxValid?Object.entries(fx.latest.rates).filter(([currency,value])=>/^[A-Z]{3}$/.test(currency)&&finite(value)):[];
 $('#fx-table-date').textContent=fxValid?`Observed ${fx.latest.date}. These are informational ECB reference rates; no currency conversion is applied to the energy data.`:'No valid reference-rate observation.';
 $('#fx-rows').innerHTML=rates.length?rates.map(([currency,value])=>`<tr><td>${esc(fx.latest.base||'EUR')}</td><td>${currency}</td><td>${number.format(value)}</td><td>${fx.latest.date}</td></tr>`).join(''):empty(4,'No valid currency observations.');
 const previous=$('#jodi-period').value;const months=[...new Set(jodiRows().map(r=>r.date))].sort().reverse();$('#jodi-period').replaceChildren(...months.map(month=>new Option(month,month)));if(months.includes(previous))$('#jodi-period').value=previous;renderJodi();
 const airports=airportRows();$('#airport-rows').innerHTML=airports.length?airports.map(a=>`<tr><td><button class="airport-table-button" data-airport="${esc(a.iata)}">${esc(a.iata)} / ${esc(a.icao)}</button></td><td>${esc(a.name)}</td><td>${esc(a.country)}</td><td>${number.format(a.lat)}</td><td>${number.format(a.lon)}</td><td class="unverified-cell">No verified quote</td></tr>`).join(''):empty(6,'No valid airport coordinates.');
 $('#export-csv').disabled=!tableExport().rows.length;$('#export-json').disabled=!state.records.some(r=>r.data&&r.feed.status==='observed');
}
function renderJodi(){
 const rows=selectedJodi();$('#jodi-rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(countries[r.country]||r.country)} · ${esc(r.country)}</td><td>${esc(flowNames[r.flow]||r.flow)} <span class="source-code">${esc(r.flow)}</span></td><td>${number.format(r.value)}</td><td>KTONS</td><td><span class="assessment-code${String(r.assessmentCode)==='3'?' unassessed':''}">${esc(r.assessmentCode)}${String(r.assessmentCode)==='3'?' · unassessed':''}</span></td></tr>`).join(''):empty(6,'No reported records for this selection. Missing is not zero.');
 const all=jodiRows().filter(r=>r.date===$('#jodi-period').value);const present=new Set(all.map(r=>r.country));const absent=Object.keys(countries).filter(code=>!present.has(code));$('#jodi-coverage').textContent=all.length?`Reporting period ${$('#jodi-period').value}. ${all.length} source records. Missing coverage: ${absent.length?absent.map(c=>countries[c]).join(', '):'none among selected economies'}. Reported zero values retain their source assessment flags.`:'No valid monthly dataset loaded.';
 if(state.tab==='jodi')$('#export-csv').disabled=!rows.length;
}
function sourceHealth({feed,data}){
 const date=data?.latest?.date||feed.observationDate;const invalid=!!date&&!validDate(date);const age=ageDays(date);const threshold=data?.staleAfterDays??(/monthly/i.test(feed.frequency||'')?90:/weekly/i.test(feed.frequency||'')?14:7);const stale=age!==null&&age>threshold;const failed=feed.lastAttemptStatus==='failed';
 if(invalid)return {label:'INVALID OBSERVATION DATE',warning:true,date};if(!data||feed.status!=='observed')return {label:feed.status==='restricted'?'ACCESS RESTRICTED':'NOT CONNECTED',warning:true,date};if(failed)return {label:'CACHED · COLLECTION FAILED',warning:true,date};if(stale)return {label:`STALE · ${age} DAYS`,warning:true,date};return {label:feed.role==='reference'?'SOURCED REFERENCE':'PUBLISHED · DELAYED',warning:false,date};
}
function renderSources(){
 $('#source-cards').innerHTML=state.records.map(r=>{const{feed,data,origin}=r;const health=sourceHealth(r);const url=safeUrl(feed.sourceUrl||data?.source?.url);const monthly=/^\d{4}-\d{2}$/.test(health.date||'');const limitations=feed.id===ids.jet?'Published U.S. Gulf Coast wholesale benchmark. No airport or Asian delivered-price inference is made here.':Array.isArray(feed.limitations)?feed.limitations.join(' '):feed.limitations||'';const type=feed.role==='reference'?'REFERENCE GEOGRAPHY':feed.id===ids.jet||feed.id===ids.brent?'REGIONAL BENCHMARK':'PUBLISHED CONTEXT';return `<article class="feed-card"><div class="feed-card-header"><span class="feed-role">${type}</span><span class="feed-health${health.warning?' warning':''}">${esc(health.label)}</span></div><h3>${esc(feed.title)}</h3><div class="feed-meta">Observation: <b>${esc(health.date||'No record-level date')}</b>${monthly?' · monthly period; age from month-end':''}<br>Collected: ${esc(data?.fetchedAt||feed.fetchedAt||'Not collected')}<br>Cadence: ${esc(feed.frequency||'Not specified')}<br>Original unit: ${esc(feed.unit||data?.source?.unit||'Not specified')}<br>Loaded from: ${esc(origin)}</div><p class="feed-note">${esc(limitations)}</p>${feed.lastAttemptStatus==='failed'?`<p class="source-use">Latest collection failed: ${esc(feed.error||'The previously collected observation is retained.')}</p>`:''}${url?`<a class="feed-source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Original source ↗</a>`:''}</article>`;}).join('');
}
const EXPECTED_UNITS={
 [ids.jet]:'USD/US gallon',[ids.brent]:'USD/barrel',[ids.fx]:'currency units per EUR',
 [ids.jodi]:'thousand metric tonnes',[ids.airports]:'WGS84 decimal degrees',
};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const timestamp=value=>typeof value==='string'&&finite(Date.parse(value))?Date.parse(value):null;
function validateCatalog(catalog){
 if(!object(catalog)||!Array.isArray(catalog.feeds)||!catalog.feeds.length||catalog.feeds.length>50)throw new Error('Invalid or empty source catalog.');
 const seen=new Set();
 for(const feed of catalog.feeds){
  if(!object(feed)||typeof feed.id!=='string'||seen.has(feed.id)||typeof feed.title!=='string'||!['observed','unavailable','restricted'].includes(feed.status))throw new Error('Malformed or duplicate source catalog entry.');
  seen.add(feed.id);
  if(EXPECTED_UNITS[feed.id]&&feed.unit!==EXPECTED_UNITS[feed.id])throw new Error(`${feed.id}: catalog unit does not match the source contract.`);
  if(feed.status==='observed'&&typeof feed.path!=='string')throw new Error(`${feed.id}: observed source has no snapshot path.`);
 }
 for(const id of Object.values(ids))if(!seen.has(id))throw new Error(`Catalog is missing expected source ${id}.`);
}
function validateRecord({feed,data}){
 if(feed.status!=='observed'){if(data!==null)throw new Error(`${feed.id}: unavailable source must not claim observed data.`);return;}
 const fail=detail=>{throw new Error(`${feed.id}: invalid snapshot (${detail}).`);};
 if(!object(data)||!object(data.source)||data.source.id!==feed.id)fail('source identity');
 if(data.source.unit!==feed.unit||EXPECTED_UNITS[feed.id]&&data.source.unit!==EXPECTED_UNITS[feed.id])fail('source unit');
 if(timestamp(data.fetchedAt)===null)fail('collection timestamp');
 const rows=data.observations;
 if(feed.id===ids.jet||feed.id===ids.brent){
  const valid=row=>object(row)&&validDate(row.date,true)&&finite(row.value);
  if(!Array.isArray(rows)||!rows.length||!rows.every(valid)||!valid(data.latest))fail('daily observation records');
 }else if(feed.id===ids.fx){
  const valid=row=>object(row)&&validDate(row.date,true)&&row.base==='EUR'&&object(row.rates)&&finite(row.rates.USD)&&Object.entries(row.rates).every(([currency,value])=>/^[A-Z]{3}$/.test(currency)&&finite(value)&&value>0);
  if(!valid(data.latest)||!Array.isArray(rows)||!rows.length||!rows.every(valid))fail('currency reference records');
 }else if(feed.id===ids.jodi){
  const valid=row=>object(row)&&typeof row.date==='string'&&/^\d{4}-\d{2}$/.test(row.date)&&validDate(row.date)&&Object.hasOwn(countries,row.country)&&row.product==='JETKERO'&&row.unit==='KTONS'&&typeof row.flow==='string'&&row.flow.length>0&&finite(row.value)&&['string','number'].includes(typeof row.assessmentCode);
  if(!Array.isArray(rows)||!rows.length||!rows.every(valid)||!object(data.latest)||!/^\d{4}-\d{2}$/.test(data.latest.date||'')||!validDate(data.latest.date))fail('monthly balance records');
 }else if(feed.id===ids.airports){
  const valid=row=>object(row)&&typeof row.iata==='string'&&/^[A-Z]{3}$/.test(row.iata)&&typeof row.icao==='string'&&typeof row.name==='string'&&typeof row.country==='string'&&finite(row.lat)&&finite(row.lon)&&row.lat>=-90&&row.lat<=90&&row.lon>=-180&&row.lon<=180&&(row.city===undefined||typeof row.city==='string');
  if(!Array.isArray(data.airports)||!data.airports.length||!data.airports.every(valid))fail('airport coordinate records');
 }
}
function rejectRegression(records){
 for(const previous of state.records){
  if(previous.feed.status!=='observed'||!previous.data)continue;
  const next=records.find(r=>r.feed.id===previous.feed.id);
  if(!next||next.feed.status!=='observed'||!next.data)throw new Error(`${previous.feed.id}: candidate loses previously verified data.`);
  const oldDate=previous.data.latest?.date||previous.feed.observationDate;
  const nextDate=next.data.latest?.date||next.feed.observationDate;
  if(oldDate&&(!nextDate||observationTime(nextDate)<observationTime(oldDate)))throw new Error(`${previous.feed.id}: observation date would regress.`);
  const oldCollected=timestamp(previous.data.fetchedAt),nextCollected=timestamp(next.data.fetchedAt);
  if(oldCollected!==null&&(nextCollected===null||nextCollected<oldCollected))throw new Error(`${previous.feed.id}: collection timestamp would regress.`);
 }
}
async function fetchJson(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),limit=2_000_000;
 try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok){controller.abort();throw new Error(`HTTP ${response.status}`);}const declared=Number(response.headers?.get?.('content-length'));if(finite(declared)&&declared>limit){controller.abort();throw new Error('Source exceeds 2 MB.');}let text='';if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0;try{while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){controller.abort();throw new Error('Source exceeds 2 MB.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}else{text=await response.text();if(new TextEncoder().encode(text).byteLength>limit)throw new Error('Source exceeds 2 MB.');}return JSON.parse(text);}catch(error){if(error.name==='AbortError'&&controller.signal.aborted)throw new Error('Request timed out after 8 seconds.');throw error;}finally{clearTimeout(timer);}
}
async function refreshSources(){
 if(state.loading)return;state.loading=true;$('#refresh-data').disabled=true;$('#refresh-status').classList.remove('error');$('#refresh-status').textContent='Checking collected source snapshots…';const failures=[];let loaded=null;
 try{
  for(const base of REMOTE_BASES){try{const catalog=await fetchJson(base+'data/catalog.json');validateCatalog(catalog);const origin=base==='./'?'Bundled fallback':base.includes('/main/')?'Remote main snapshots':'Remote data-branch snapshots';const records=await Promise.all(catalog.feeds.map(async feed=>{if(feed.status!=='observed')return {feed,data:null,origin};if(!/^data\/[a-zA-Z0-9_-]+\.json$/.test(feed.path))throw new Error('Invalid source path.');return {feed,data:await fetchJson(base+feed.path),origin};}));records.forEach(validateRecord);rejectRegression(records);loaded={catalog,records,origin,base};break;}catch(error){failures.push(`${base==='./'?'bundled':base.includes('/main/')?'main':'data branch'}: ${error.message}`);}}
  if(!loaded)throw new Error(failures.join('; '));state.catalog=loaded.catalog;state.records=loaded.records;state.origin=loaded.origin;state.lastCheck=new Date().toISOString();renderSummary();renderMap();renderTables();renderSources();
  const failedCollections=state.records.filter(r=>r.feed.lastAttemptStatus==='failed').length;$('#refresh-status').textContent=loaded.base==='./'?`Remote snapshots unavailable; bundled data retained (${failures.join('; ')}). Observation and collection dates have not been replaced by page time.`:`${failures.length?'Earlier source checks failed ('+failures.join('; ')+'). ':''}${loaded.origin} checked from the same source branch/location${failedCollections?`; ${failedCollections} source collection(s) failed and retain cache`:''}. These remain delayed published observations, not live quotes.`;
 }catch(error){$('#refresh-status').textContent=`Update check failed: ${error.message}. ${state.records.length?'Previously loaded dated observations are retained.':'No verified source values are available.'}`;$('#refresh-status').classList.add('error');if(!state.records.length){$('#source-cards').innerHTML='<article class="feed-card"><h3>No source snapshots available</h3><p class="feed-note">No invented prices or operational values are substituted.</p></article>';renderSummary();renderMap();renderTables();}}
 finally{state.loading=false;$('#refresh-data').disabled=false;$('#last-check').textContent=`Page checked: ${new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Singapore'}).format(new Date())} UTC+8`;}
}
function tableExport(){
 const key=state.tab;
 if(key==='jet'||key==='brent')return {headers:['source','observation_date','value','original_unit'],rows:dailyRows(key).map(r=>['EIA',r.date,r.value,key==='jet'?'USD/US gallon':'USD/barrel'])};
 if(key==='fx'){const fx=dataset('fx');const good=fx?.latest&&validDate(fx.latest.date,true);return {headers:['source','observation_date','base_currency','quote_currency','units_per_base'],rows:good?Object.entries(fx.latest.rates||{}).filter(([c,v])=>/^[A-Z]{3}$/.test(c)&&finite(v)).map(([c,v])=>['ECB',fx.latest.date,fx.latest.base||'EUR',c,v]):[]};}
 if(key==='jodi')return {headers:['source','reporting_month','country','product','flow','value','original_unit','assessment_code'],rows:selectedJodi().map(r=>['JODI',r.date,r.country,r.product,r.flow,r.value,r.unit,r.assessmentCode])};
 return {headers:['source','iata','icao','name','country','latitude','longitude','fuel_quote_status'],rows:airportRows().map(a=>['OurAirports',a.iata,a.icao,a.name,a.country,a.lat,a.lon,'NO_VERIFIED_QUOTE'])};
}
function csvCell(value){const safe=typeof value==='string'&&/^[=+\-@\t\r]/.test(value)?"'"+value:value;return `"${String(safe??'').replaceAll('"','""')}"`;}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function selectTab(name){state.tab=name;for(const tab of document.querySelectorAll('[data-tab]')){const active=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(`#view-${tab.dataset.tab}`).hidden=!active;}$('#export-csv').disabled=!tableExport().rows.length;}
for(const tab of document.querySelectorAll('[data-tab]')){tab.addEventListener('click',()=>selectTab(tab.dataset.tab));tab.addEventListener('keydown',event=>{const tabs=[...document.querySelectorAll('[data-tab]')];let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();selectTab(tabs[index].dataset.tab);tabs[index].focus();});}
$('#refresh-data').addEventListener('click',refreshSources);$('#airport-select').addEventListener('change',()=>{state.selectedAirport=$('#airport-select').value;renderMap();});
const chooseAirport=target=>{if(!target)return;state.selectedAirport=target.dataset.airport;renderMap();};svg.addEventListener('click',event=>chooseAirport(event.target.closest('[data-airport]')));svg.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const target=event.target.closest('[data-airport]');if(target){event.preventDefault();chooseAirport(target);}}});$('#airport-rows').addEventListener('click',event=>chooseAirport(event.target.closest('[data-airport]')));
$('#jodi-period').addEventListener('change',renderJodi);$('#jodi-country').addEventListener('change',renderJodi);
$('#export-csv').addEventListener('click',()=>{const table=tableExport();if(!table.rows.length)return;download('\uFEFF'+[table.headers,...table.rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),`fuel-atlas-observed-${state.tab}.csv`,'text/csv;charset=utf-8');});
$('#export-json').addEventListener('click',()=>{const snapshots=state.records.filter(r=>r.data&&r.feed.status==='observed').map(({feed,data,origin})=>{const{conversion,...raw}=data;return {sourceId:feed.id,loadOrigin:origin,snapshot:raw};});if(!snapshots.length)return;download(JSON.stringify({type:'fuel-atlas-observed-data',version:1,exportedAt:new Date().toISOString(),note:'Published raw source units. No density conversion, airport-price inference or optimization inputs included.',catalog:state.catalog,snapshots},null,2),'fuel-atlas-observed-data.json','application/json');});
const scrollTo=selector=>$(selector).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});$('#nav-map').addEventListener('click',()=>scrollTo('#main'));$('#nav-data').addEventListener('click',()=>scrollTo('#observations'));$('#nav-sources').addEventListener('click',()=>scrollTo('#data-sources'));
// This timer checks for collected snapshots; it never advances or invents prices.
setInterval(()=>{if(!document.hidden)refreshSources();},60_000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSources();});
renderSummary();renderMap();renderTables();refreshSources();
