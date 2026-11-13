import { airportLabel } from './airport-labels.js';
import { t, getLanguage } from './i18n.js?v=20261113-integrated';
import { buildScenarioDataset, AIRCRAFT_PROFILES } from './scenario-data.js';
import { getScenarioOptions, setScenarioOptions, resetScenarioOptions } from './scenario-settings.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const n = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString(getLanguage() === 'zh' ? 'zh-CN' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';
const label = value => typeof value === 'object' ? value[getLanguage()] || value.en : value;
let dataset = buildScenarioDataset(getScenarioOptions());
let selected = 'SIN';
let routeState = null;
let statusKey = '';
let statusError = false;
const fields = { baseJetUsdPerT:'data-base', transportUsdPerTPerKm:'data-transport', taxAdjustmentUsdPerT:'data-tax', defaultMaxUpliftT:'data-supply' };

function status(key, error = false) {
  statusKey = key; statusError = error;
  const el = $('#data-assumption-status');
  if (!el) return;
  el.textContent = key ? t(key) : '';
  el.dataset.error = String(error);
}
function syncInputs() {
  const options = getScenarioOptions();
  for (const [key, id] of Object.entries(fields)) $(`#${id}`).value = String(options.pricing[key]);
}
function renderDetail() {
  const record = dataset.records.find(item => item.code === selected);
  if (!record) return;
  $('#data-airport-detail').innerHTML = `<h3>${record.code} <span>${escape(airportLabel(record.airport, getLanguage()).city)}</span></h3>
    <p>${escape(t('data.hub', { region:label(record.regionLabel), hub:record.referenceHub }))}</p>
    <dl>${record.components.map(item => `<div><dt>${escape(label(item.label))}</dt><dd>${n(item.value)}</dd></div>`).join('')}
    <div class="data-total"><dt>${t('data.total')}</dt><dd>${n(record.priceUsdPerT)} <small>USD/t</small></dd></div></dl>
    <p class="data-equation">${escape(t('data.distance', { distance:n(record.distanceFromHubKm, 0), coefficient:n(record.assumptions.transportUsdPerTPerKm, 3) }))}</p>
    <p>${t('data.hubReason')}</p>${record.design?.defaultHypothesis ? `<p>${escape(label(record.design.defaultHypothesis))}</p>` : ''}<p>${escape(t('data.airportSupply', { cap:n(record.maxUpliftT, 0) }))}</p>
    <p><a href="https://ourairports.com/data/" target="_blank" rel="noopener noreferrer">${t('data.coords')}</a></p>`;
}
function renderLedger() {
  const search = $('#data-airport-search').value.toLowerCase().trim();
  const records = dataset.records.filter(item => [item.code, item.airport.name, item.airport.city, airportLabel(item.airport, 'en').name, airportLabel(item.airport, 'en').city, airportLabel(item.airport, 'zh').name, item.airport.region, label(item.regionLabel)].join(' ').toLowerCase().includes(search));
  $('#data-airport-count').textContent = t('data.count', { visible:records.length, total:dataset.records.length });
  $('#data-airport-search').placeholder = t('data.searchPlaceholder');
  $('#data-airport-rows').innerHTML = records.length ? records.map(record => `<tr data-selected="${record.code === selected}"><td><button type="button" data-airport-detail="${record.code}" aria-pressed="${record.code === selected}">${record.code} · ${escape(airportLabel(record.airport, getLanguage()).city)}</button><small>${escape(airportLabel(record.airport, getLanguage()).name)}</small></td><td>${n(record.priceUsdPerT)}</td><td>${n(record.maxUpliftT, 0)}</td></tr>`).join('') : `<tr><td colspan="3">${t('data.noMatches')}</td></tr>`;
  renderDetail();
}
function renderRoute() {
  const legs = routeState?.input?.legs?.filter(leg => leg.from && leg.to && leg.derivation) || [];
  if (!legs.length) { $('#data-route-summary').innerHTML = `<p class="data-route-empty">${t('data.emptyRoute')}</p>`; return; }
  const profile = AIRCRAFT_PROFILES[routeState.aircraftKey];
  const headers = ['leg','distanceLabel','duration','burn','reserveLabel','carry','currentPrice'];
  $('#data-route-summary').innerHTML = `<p>${escape(t('data.routeIntro', { profile:label(profile.label), count:legs.length }))}</p>
    <p class="data-copy">${t(routeState.priceMode === 'quotes' ? 'data.routeQuotes' : 'data.routeScenario')}</p>
    <div class="data-table-scroll"><table class="data-table data-route-table"><thead><tr>${headers.map(key => `<th>${t('data.' + key)}</th>`).join('')}</tr></thead><tbody>${legs.map(leg => `<tr><th>${leg.from} → ${leg.to}</th><td>${n(leg.distanceKm, 0)}</td><td>${n(leg.durationH)}</td><td>${n(leg.baseBurnT)}</td><td>${n(leg.reserveT)}</td><td>${n(100*leg.carryBurnRate, 1)}%</td><td>${Number.isFinite(leg.priceUsdPerT) ? n(leg.priceUsdPerT) : t('data.missingPrice')}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderMethod() {
  $('#data-performance-method').innerHTML = ['formulaTime','formulaBurn','formulaReserve','formulaCarry','calibrate'].map(key => `<p>${t('data.' + key)}</p>`).join('') +
    (dataset.designRationale ? Object.values(dataset.designRationale).map(value => `<p>${escape(label(value))}</p>`).join('') : '') +
    `<div class="data-table-scroll"><table class="data-table"><thead><tr>${['profile','speed','burnRate','coefficient','routeFactor'].map(key => `<th>${t('data.' + key)}</th>`).join('')}</tr></thead><tbody>${Object.values(AIRCRAFT_PROFILES).map(profile => `<tr><th>${escape(label(profile.label))}</th><td>${n(profile.cruiseSpeedKph, 0)}</td><td>${n(profile.cruiseBurnTPerH, 1)}</td><td>${n(profile.carryCoefficientPerH, 3)}</td><td>${n(profile.routeFactor)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderRegions() {
  const prior = Object.fromEntries([...document.querySelectorAll('#data-region-rows input, #data-region-rows select')].map(input => [input.name, input.value]));
  $('#data-region-rows').innerHTML = Object.entries(dataset.assumptions.regions).map(([id, region]) => {
    const field = (key, value) => prior[`${id}.${key}`] ?? value;
    const regionName = label(region.label);
    return `<tr><th>${escape(regionName)}</th><td><select name="${id}.referenceHub" aria-label="${escape(regionName + ' · ' + t('data.reference'))}">${dataset.records.map(record => `<option value="${record.code}" ${record.code === field('referenceHub', region.referenceHub) ? 'selected' : ''}>${record.code} · ${escape(airportLabel(record.airport,getLanguage()).city)}</option>`).join('')}</select></td><td><input name="${id}.basisUsdPerT" type="number" step="1" value="${escape(field('basisUsdPerT',region.basisUsdPerT))}" aria-label="${escape(regionName + ' · ' + t('data.basis'))}" required></td><td><input name="${id}.serviceUsdPerT" type="number" min="0" step="1" value="${escape(field('serviceUsdPerT',region.serviceUsdPerT))}" aria-label="${escape(regionName + ' · ' + t('data.service'))}" required></td></tr>`;
  }).join('');
}
function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('data.exported');
}

if ($('#data-assumption-form')) {
  syncInputs(); renderLedger(); renderRoute(); renderMethod(); renderRegions();
  $('#data-assumption-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try {
      const pricing = Object.fromEntries(Object.entries(fields).map(([key,id]) => [key, $(`#${id}`).valueAsNumber]));
      setScenarioOptions({ pricing }); status('data.applied');
    } catch { status('data.invalid', true); }
  });
  $('#data-reset').addEventListener('click', () => { resetScenarioOptions(); syncInputs(); status('data.applied'); });
  $('#data-region-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try {
      const regions = {};
      for (const input of event.currentTarget.querySelectorAll('input, select')) {
        const [id, key] = input.name.split('.');
        (regions[id] ||= {})[key] = key === 'referenceHub' ? input.value : input.valueAsNumber;
      }
      setScenarioOptions({ regions }); status('data.applied');
    } catch { status('data.regionalInvalid', true); }
  });
  $('#data-airport-search').addEventListener('input', renderLedger);
  $('#data-airport-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-airport-detail]');
    if (!button) return;
    selected = button.dataset.airportDetail;
    // Keep the selected control and keyboard focus in place.
    for (const candidate of $('#data-airport-rows').querySelectorAll('button')) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
      candidate.closest('tr').dataset.selected = String(candidate === button);
    }
    renderDetail();
  });
  $('#data-export-json').addEventListener('click', () => download(JSON.stringify(dataset, null, 2) + '\n', 'fuel-atlas-scenario-dataset.json', 'application/json'));
  $('#data-export-csv').addEventListener('click', () => {
    const cell = value => `"${String(value).replace(/"/g, '""')}"`;
    const header = ['airport','classification','price_usd_per_t','max_uplift_t_per_visit','common_base_usd_per_t','regional_basis_usd_per_t','transport_usd_per_t','service_usd_per_t','tax_usd_per_t','reference_airport','distance_from_reference_km','revision'];
    const rows = dataset.records.map(record => [record.code,record.classification,record.priceUsdPerT,record.maxUpliftT,...record.components.map(component => component.value),record.referenceHub,record.distanceFromHubKm,dataset.revision]);
    download([header,...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n', 'fuel-atlas-scenario-airports.csv', 'text/csv;charset=utf-8');
  });
  document.addEventListener('scenariodatachange', event => { routeState = event.detail; renderRoute(); });
  document.addEventListener('scenarioassumptionschange', () => { dataset = buildScenarioDataset(getScenarioOptions()); syncInputs(); renderLedger(); $('#data-region-rows').replaceChildren(); renderRegions(); });
  document.addEventListener('languagechange', () => { renderLedger(); renderRoute(); renderMethod(); renderRegions(); status(statusKey,statusError); });
}
