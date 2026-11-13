import { t, getLanguage } from './i18n.js?v=20261113-integrated';
import { getIntegratedNetwork, getIntegratedViewState, setIntegratedNetworkOverrides, resetIntegratedNetwork } from './integrated-state.js';
import { INTEGRATED_FIELD_CATALOG } from './integrated-data.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = value => typeof value === 'object' ? value?.[getLanguage()] || value?.en || '' : value;
const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString(getLanguage() === 'zh' ? 'zh-CN' : 'en-GB',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
const money = value => Number.isFinite(value) ? '$' + number(value,2) : '—';
let network = null, result = null, strategy = 'optimized', error = false, changed = false, currentDocument = null;
const pending = new Map();
const idFor = (group,row) => group === 'airports' ? row.code : row.id;
const displayValue = value => Array.isArray(value) ? Math.max(...value) : value;
function field(group,row,key,{disabled=false}={}) {
  const description=INTEGRATED_FIELD_CATALOG.find(item=>item.entity===group&&item.key===key);
  const pendingKey=JSON.stringify([group,idFor(group,row),key]);
  const value=pending.has(pendingKey)?pending.get(pendingKey):displayValue(row[key]);
  return `<input type="number" data-chain-group="${group}" data-chain-id="${esc(idFor(group,row))}" data-chain-key="${key}" value="${esc(value ?? '')}" ${description?.signed?'':'min="0"'} step="${description?.integer?'1':'any'}" ${disabled?'disabled':''} aria-label="${esc(label(row.label)||idFor(group,row))} · ${esc(label(description?.label)||key)}" title="${esc(label(description?.meaning)||'')}">`;
}
function rowTitle(row) { return `<strong>${esc(label(row.label) || row.code || row.id)}</strong>`; }
function renderInputs() {
  if (!$('#chain-inputs')) return;
  const ready=network && network.airports.length>0;
  $('#chain-inputs').hidden=!ready; $('#chain-empty').hidden=ready;
  $('#chain-reset').disabled=!ready;
  if (!ready) { $('#chain-empty').textContent=t(error?'chain.notReady':'chain.empty'); return; }
  const delivered=network.mode==='delivered';
  $('#chain-mode-description').textContent=t(delivered?'chain.delivered':'chain.modeled');
  $('#chain-supplier-editor').hidden=delivered; $('#chain-route-editor').hidden=delivered; $('#chain-offer-editor').hidden=!delivered;
  $('#chain-supplier-rows').innerHTML=network.suppliers.map(row=>`<tr><td>${rowTitle(row)}</td>${['priceUsdPerT','capacityT','totalCapacityT'].map(key=>`<td>${field('suppliers',row,key)}</td>`).join('')}</tr>`).join('');
  $('#chain-route-rows').innerHTML=network.routes.map(row=>`<tr><td>${rowTitle(row)}</td>${['freightUsdPerT','handlingUsdPerT','basisAdjustmentUsdPerT','capacityT','totalCapacityT','leadTimeStages'].map(key=>`<td>${field('routes',row,key)}</td>`).join('')}</tr>`).join('');
  $('#chain-offer-rows').innerHTML=network.deliveredOffers.map(row=>`<tr><td>${rowTitle(row)}</td><td>${[...new Set(row.priceUsdPerT.filter((value,i)=>row.visitStages.includes(i)))].map(value=>number(value)).join(' / ')}</td>${['capacityT','totalCapacityT'].map(key=>`<td>${field('deliveredOffers',row,key)}</td>`).join('')}</tr>`).join('');
  $('#chain-stock-rows').innerHTML=network.airports.map(row=>`<tr><td>${rowTitle(row)}</td>${['initialInventoryT','terminalInventoryT','storageCapacityT','reserveT','intoPlaneUsdPerT','taxAdjustmentUsdPerT','holdingUsdPerTPerStage'].map(key=>`<td>${field('airports',row,key,{disabled:delivered&&['intoPlaneUsdPerT','taxAdjustmentUsdPerT','holdingUsdPerTPerStage'].includes(key)})}</td>`).join('')}</tr>`).join('');
  renderStatus();
}
function refreshControlValues() {
  for (const control of document.querySelectorAll('[data-chain-key]')) {
    const {chainGroup:group,chainId:id,chainKey:key}=control.dataset;
    const row=network?.[group]?.find(item=>idFor(group,item)===id);
    if(!row)continue;
    const token=JSON.stringify([group,id,key]);
    const value=pending.has(token)?pending.get(token):displayValue(row[key]);
    control.value=value ?? '';
  }
}
function renderStatus() { const el=$('#chain-edit-status'); if(el){el.dataset.error=String(error);el.textContent=error?t('chain.invalid'):changed?t('chain.updated'):'';} }
function renderResult() {
  if (!$('#chain-results')) return;
  const plan=strategy==='baseline'?result?.baseline:result;
  const data=plan?.supplyChain;
  $('#chain-results').hidden=!plan?.feasible||!data;
  if (!data||!plan.feasible) return;
  $('#chain-result-strategy').textContent=t(strategy==='baseline'?'chain.baseline':'chain.optimized');
  const c=data.costBreakdown;
  const items=[['productCost',c.procurementUsd],['transportCost',(c.freightUsd||0)+(c.handlingUsd||0)],['stockCost',c.holdingUsd],['intoPlaneCost',c.intoPlaneUsd],['adjustmentCost',(c.basisAdjustmentUsd||0)+(c.taxAdjustmentUsd||0)],['deliveredCost',c.deliveredQuoteUsd],['totalCost',c.totalUsd]];
  $('#chain-cost-breakdown').innerHTML=items.filter(([key,value])=>key==='totalCost'||Math.abs(value||0)>1e-8||key===(data.mode==='delivered'?'deliveredCost':'productCost')).map(([key,value])=>`<div class="${key==='totalCost'?'chain-cost-total':''}" data-chain-cost="${key}"><span>${t('chain.'+key)}</span><strong>${money(value||0)}</strong></div>`).join('');
  $('#chain-flow-rows').innerHTML=data.shipments.length?data.shipments.map(row=>`<tr><td>${esc(label([...(network?.suppliers||[]),...(network?.deliveredOffers||[])].find(s=>s.id===row.supplierId)?.label)||row.supplierId||t('chain.quoteSupplier'))}</td><td>${esc(row.airport)}</td><td>${row.departureStage}</td><td>${row.arrivalStage}</td><td>${number(row.quantityT)}</td><td>${money(row.costUsd)}</td></tr>`).join(''):`<tr><td colspan="6">${t('chain.noFlow')}</td></tr>`;
  $('#chain-inventory-rows').innerHTML=data.airportInventory.map(row=>`<tr data-stock-airport="${esc(row.airport)}" data-stock-stage="${row.stage}"><th>${esc(row.airport)}</th><td>${row.stage}</td><td>${number(row.openingT)}</td><td>${number(row.arrivalsT)}</td><td>${number(row.upliftT)}</td><td>${number(row.closingT)}</td></tr>`).join('');
}
export function commitPendingIntegratedInputs() {
  if (!pending.size) return true;
  const patch = {};
  for (const [token, raw] of pending) {
    const [group,id,key] = JSON.parse(token);
    ((patch[group] ||= {})[id] ||= {})[key] = String(raw).trim() === '' ? NaN : Number(raw);
  }
  try { setIntegratedNetworkOverrides(patch); pending.clear(); error=false; changed=true; refreshControlValues(); renderStatus(); return true; }
  catch { error=true; renderStatus(); return false; }
}
export function initIntegratedView(doc = document) {
  if (doc === currentDocument || !doc.querySelector('#chain-inputs')) return;
  currentDocument=doc; pending.clear(); network=null; result=null; strategy='optimized'; error=false; changed=false;
  const initial = getIntegratedViewState(); network=initial.network||initial.preview; error=initial.invalid; renderInputs();
  $('#chain-inputs').addEventListener('input',event=>{
    const control=event.target.closest('[data-chain-key]'); if(!control)return;
    pending.set(JSON.stringify([control.dataset.chainGroup,control.dataset.chainId,control.dataset.chainKey]),control.value);
    document.dispatchEvent(new CustomEvent('integratedinputpending'));
  });
  $('#chain-inputs').addEventListener('change',event=>{
    const control=event.target.closest('[data-chain-key]'); if(!control)return;
    const {chainGroup:group,chainId:id,chainKey:key}=control.dataset;
    pending.set(JSON.stringify([group,id,key]),control.value);
    commitPendingIntegratedInputs();
  });
  $('#chain-reset').addEventListener('click',()=>{try{pending.clear();resetIntegratedNetwork();error=false;changed=true;}catch{error=true;} renderStatus();});
  document.addEventListener('integratednetworkchange',event=>{
    network=event.detail.network||event.detail.preview; error=!!event.detail.invalid;
    if(event.detail.source==='model-sync') {
      changed=false;
      for(const token of network ? pending.keys() : []) {
        const [group,id,key]=JSON.parse(token);
        const exists=(network?.[group]||[]).some(row=>idFor(group,row)===id);
        if(!exists || (network?.mode==='delivered'&&group==='airports'&&['intoPlaneUsdPerT','taxAdjustmentUsdPerT','holdingUsdPerTPerStage'].includes(key))) pending.delete(token);
      }
    }
    if(event.detail.source==='user-edit')refreshControlValues(); else renderInputs();
  });
  document.addEventListener('integratedresultchange',event=>{result=event.detail.result;strategy=event.detail.strategy||'optimized';renderResult();});
  document.addEventListener('languagechange',()=>{renderInputs();renderResult();});
}

if (typeof document !== "undefined") initIntegratedView(document);
