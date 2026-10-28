import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

// DOM/event integration, not a visual browser test. The application and LP are
// real; shims supply only form, dialog, file and download primitives absent in
// linkedom. Feed responses come from checked-in source fixtures.
let mountId = 0;
const clone = value => structuredClone(value);
async function until(predicate, message = 'asynchronous UI settled') {
  for (let turn = 0; turn < 40; turn++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(predicate(), message);
}

async function mountApp(t, { noCatalog = false, remoteMode = 'unavailable' } = {}) {
  const html = await readFile(new URL('../dist/planner.html', import.meta.url), 'utf8');
  const sourceCatalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8'));
  const fixture = new Map([['data/catalog.json', sourceCatalog]]);
  for (const feed of sourceCatalog.feeds) {
    if (feed.path) fixture.set(feed.path, JSON.parse(await readFile(new URL(`../dist/${feed.path}`, import.meta.url), 'utf8')));
  }
  const snapshot = fixture.get('data/market.json');
  const { document, window } = parseHTML(html);
  const requests = [], downloads = [], blobs = new Map(), scrollTargets = [];
  const remote = { mode: remoteMode, fixture: new Map([...fixture].map(([key, value]) => [key, clone(value)])) };
  const originals = new Map();
  const setGlobal = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === String(value)); },
  });
  window.HTMLSelectElement.prototype.add = function (option) { this.append(option); };
  Object.defineProperty(window.HTMLInputElement.prototype, 'valueAsNumber', {
    configurable: true,
    get() { return this.value.trim() === '' ? NaN : Number(this.value); },
    set(value) { this.value = String(value); },
  });
  Object.defineProperty(window.HTMLInputElement.prototype, 'validity', {
    configurable: true,
    get() {
      const empty = this.value.trim() === '';
      const missing = empty && this.hasAttribute('required');
      const numeric = !empty && ['number', 'range'].includes(this.type);
      const value = this.valueAsNumber;
      const badInput = numeric && !Number.isFinite(value);
      const underflow = numeric && this.hasAttribute('min') && value < Number(this.getAttribute('min'));
      const overflow = numeric && this.hasAttribute('max') && value > Number(this.getAttribute('max'));
      const step = Number(this.getAttribute('step') || '1');
      const stepMismatch = numeric && Number.isFinite(step) && step > 0 && Math.abs((value - Number(this.getAttribute('min') || 0)) / step - Math.round((value - Number(this.getAttribute('min') || 0)) / step)) > 1e-7;
      return { valid: !missing && !badInput && !underflow && !overflow && !stepMismatch, valueMissing: missing, badInput, rangeUnderflow: underflow, rangeOverflow: overflow, stepMismatch };
    },
  });
  window.HTMLInputElement.prototype.reportValidity = function () { return this.validity.valid; };
  window.HTMLElement.prototype.scrollIntoView = function () { scrollTargets.push(this.id); };
  const dialog = document.querySelector('#method-dialog');
  dialog.showModal = function () { this.setAttribute('open', ''); };
  dialog.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const originalClick = window.HTMLAnchorElement.prototype.click, originalNow = Date.now;
  URL.createObjectURL = blob => { const url = `blob:ui-test-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href) });
    else originalClick.call(this);
  };
  Date.now = () => Date.parse(`${snapshot.latest.date}T00:00:00Z`) + 3 * 86400000;
  setGlobal('window', window);
  setGlobal('document', document);
  setGlobal('Option', function Option(label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; });
  setGlobal('matchMedia', () => ({ matches: true }));
  setGlobal('fetch', async (url, options) => {
    url = String(url); requests.push({ url, options });
    assert.equal(options?.cache, 'no-store');
    const isRemote = url.startsWith('https:');
    const path = isRemote ? url.split('/dist/')[1] : url.replace(/^\.\//, '');
    if (isRemote && remote.mode === 'timeout') {
      const error = new Error('Simulated source request timeout'); error.name = 'AbortError'; throw error;
    }
    if (noCatalog || isRemote && (remote.mode === 'unavailable' || remote.mode === 'feature' && url.includes('/main/'))) return { ok: false, status: 404 };
    const data = (isRemote ? remote.fixture : fixture).get(path);
    return data === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(data), json: async () => clone(data) };
  });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    window.HTMLAnchorElement.prototype.click = originalClick; Date.now = originalNow;
  });
  await import(`../dist/planner-app.js?dom-integration=${++mountId}`);
  const $ = selector => document.querySelector(selector);
  await until(() => !$('#optimize-button').disabled && !/Inputs changed/.test($('#result-verdict').textContent), 'initial source loading and optimization complete');
  const emit = (selector, type) => {
    const target = $(selector), event = new window.Event(type, { bubbles: true, cancelable: true });
    const accepted = target.dispatchEvent(event);
    // Browsers retain event.target after dispatch; linkedom deletes it.
    event.target = target;
    return accepted;
  };
  const edit = (selector, value, type = 'input') => { $(selector).value = String(value); emit(selector, type); };
  const click = selector => emit(selector, 'click');
  const submit = async () => { emit('#model-form', 'submit'); await until(() => !$('#optimize-button').disabled); };
  const refresh = async () => { click('#refresh-data'); await until(() => !$('#refresh-data').disabled); };
  const exportJSON = async () => {
    const before = downloads.length; click('#export-json');
    assert.equal(downloads.length, before + 1, 'JSON export should produce one download');
    return JSON.parse(await downloads.at(-1).blob.text());
  };
  const importJSON = async (value, name = 'scenario.json') => {
    const contents = typeof value === 'string' ? value : JSON.stringify(value);
    Object.defineProperty($('#import-scenario'), 'files', { configurable: true, value: [{ name, size: contents.length, text: async () => contents }] });
    $('#import-status').textContent = '';
    emit('#import-scenario', 'change');
    await until(() => /^(Imported|Import failed:)/.test($('#import-status').textContent), 'scenario import completes');
  };
  return { $, document, snapshot, fixture, remote, requests, downloads, scrollTargets, edit, click, submit, refresh, exportJSON, importJSON };
}

const input = (group, index, field) => `input[data-group="${group}"][data-index="${index}"][data-field="${field}"]`;

test('multi-period planner UI validates source, scheduling, constraints, exports and refresh', async t => {
  const ui = await mountApp(t);
  const { $, document, snapshot, remote, requests, downloads, edit, click, submit, refresh, exportJSON, importJSON } = ui;
  let saved;

  await t.test('bundled observed catalog initializes a full four-period plan and inventory trajectory', async () => {
    assert.ok(requests.some(r => r.url === './data/catalog.json'));
    const initialCatalogs = requests.filter(r => r.url.endsWith('/data/catalog.json'));
    assert.equal(initialCatalogs.length, 3);
    assert.match(initialCatalogs[0].url, /\/main\/dist\//);
    assert.match(initialCatalogs[1].url, /\/codex\/complete-energy-model\/dist\//);
    assert.equal(initialCatalogs[2].url, './data/catalog.json');
    assert.match($('#data-refresh-status').textContent, /bundled fallback/);
    assert.equal($('#benchmark').valueAsNumber, snapshot.conversion.usdPerTonne);
    assert.match($('#benchmark-basis').textContent, /USGC proxy/);
    assert.match($('#source-cards').textContent, /ACTIVE MODEL INPUT/);
    assert.match($('#source-cards').textContent, /CONTEXT ONLY/);
    assert.match($('#result-verdict').textContent, /^Feasible/);
    assert.equal($('#fulfilled-total').textContent, '84,000 / 84,000 t');
    assert.equal($('#unmet-total').textContent, '0 t');
    assert.equal($('#export-json').disabled, false);
    assert.equal(document.querySelectorAll('#network-nodes [data-node]').length, 6);
    assert.ok(document.querySelectorAll('#active-route .route-line').length > 0);
    assert.equal(document.querySelectorAll('#inventory-rows tr').length, 4);
    assert.ok($('#inventory-chart').querySelector('.chart-stock'));
    assert.match($('#allocation-rows').textContent, /P1 → P2/);
    saved = await exportJSON();
    assert.equal(saved.result.feasible, true);
    assert.equal(saved.baseInputs.periods, 4);
    assert.deepEqual(saved.sources.market.latest, snapshot.latest);
    assert.equal(saved.result.procurement.reduce((sum, r) => sum + r.quantity, 0), 63000);
    assert.ok(saved.result.routes.every(r => r.arrivalPeriod > r.departurePeriod));
  });

  await t.test('horizon edits invalidate exports and rebuild shorter schedules', async () => {
    const before = downloads.length;
    edit('#horizon', 3);
    assert.equal($('#export-json').disabled, true);
    assert.equal($('#total-cost').textContent, '—');
    click('#export-json'); assert.equal(downloads.length, before);
    await submit();
    assert.match($('#result-verdict').textContent, /^Feasible/);
    assert.equal($('#fulfilled-total').textContent, '63,000 / 63,000 t');
    const shorter = await exportJSON();
    assert.equal(shorter.baseInputs.periods, 3);
    assert.ok(shorter.result.routes.every(r => r.arrivalPeriod <= 3));
    assert.equal(document.querySelectorAll('#map-period option').length, 3);
    await importJSON(saved);
    assert.match($('#import-status').textContent, /^Imported/);
    assert.equal($('#fulfilled-total').textContent, '84,000 / 84,000 t');
  });

  await t.test('lead-time changes create dated shortages rather than late fulfillment', async () => {
    for (let index = 0; index < 9; index++) edit(input('routes', index, 'leadTime'), 4);
    await submit();
    assert.match($('#result-verdict').textContent, /^Partial service/);
    const late = await exportJSON();
    assert.equal(late.result.fulfilledDemand, 21000);
    assert.equal(late.result.unmetDemandTotal, 63000);
    assert.equal(late.result.routes.length, 0);
    assert.ok(late.result.unmet.every(r => r.period >= 2));
    await importJSON(saved);
  });

  await t.test('budget cap constrains service and comparisons suppress incomparable cost differences', async () => {
    edit('#budget', 1000000);
    await submit();
    assert.match($('#result-verdict').textContent, /^Partial service/);
    const capped = await exportJSON();
    assert.ok(capped.result.totalCost <= 1000000.01);
    assert.ok(capped.result.unmetDemandTotal > 0);
    assert.ok(capped.result.bindingConstraints.some(c => c.type === 'budget'));
    click('#compare-scenarios');
    await until(() => !$('#compare-scenarios').disabled);
    assert.match($('#scenario-rows').textContent, /Not comparable/);
    assert.doesNotMatch($('#scenario-rows').textContent, /savings/i);
    click('#export-button');
    const csv = await downloads.at(-1).blob.text();
    assert.match(csv, /"departure_period","arrival_period"/);
    assert.match(csv, /"unmet_demand","baseline","shortage"/);
    const compared = await exportJSON();
    assert.ok(compared.comparison.scenarios.filter(s => s.id !== 'baseline').every(s => !s.comparison.comparable));
    await importJSON(saved);
  });

  await t.test('scenario JSON roundtrip restores inputs and recomputes instead of trusting saved output', async () => {
    const tampered = clone(saved);
    tampered.result.totalCost = -123456;
    edit('#benchmark', 900);
    await submit();
    await importJSON(tampered);
    const restored = await exportJSON();
    assert.deepEqual(restored.baseInputs.priceCurve, saved.baseInputs.priceCurve);
    assert.deepEqual(restored.baseInputs.destinations.map(d => d.demand), saved.baseInputs.destinations.map(d => d.demand));
    assert.equal(restored.result.totalCost, saved.result.totalCost);
    assert.equal(restored.controls.benchmarkKind, 'imported');
    assert.notEqual(restored.result.totalCost, tampered.result.totalCost);
  });

  await t.test('malformed imports and invalid profile inputs cannot become exportable solutions', async () => {
    const before = await exportJSON();
    for (const bad of [
      { type: 'other', version: 1 },
      { ...clone(saved), baseInputs: { ...clone(saved.baseInputs), routes: [] } },
      { ...clone(saved), baseInputs: { ...clone(saved.baseInputs), suppliers: 'invalid' } },
      { ...clone(saved), baseInputs: { ...clone(saved.baseInputs), priceCurve: [1, 2] } },
      { ...clone(saved), controls: { ...saved.controls, benchmark: -1 } },
    ]) {
      await importJSON(bad);
      assert.match($('#import-status').textContent, /^Import failed:/);
      assert.equal($('#export-json').disabled, false, 'rejected import preserves the valid prior plan');
      const after = await exportJSON();
      assert.deepEqual(after.baseInputs, before.baseInputs);
      assert.equal(after.result.totalCost, before.result.totalCost);
    }
    edit(input('suppliers', 0, 'capacity'), '1000, 2000');
    await submit();
    assert.equal($('#model-error').hidden, false);
    assert.match($('#model-error').textContent, /exactly 4 period values/);
    assert.equal($('#export-json').disabled, true);
    await importJSON(saved);
  });

  await t.test('remote refresh tries main then feature then one bundled fallback', async () => {
    const start = requests.length;
    remote.mode = 'unavailable';
    await refresh();
    const catalogRequests = requests.slice(start).filter(r => r.url.endsWith('/data/catalog.json'));
    assert.equal(catalogRequests.length, 3);
    assert.match(catalogRequests[0].url, /\/main\/dist\//);
    assert.match(catalogRequests[1].url, /\/codex\/complete-energy-model\/dist\//);
    assert.equal(catalogRequests[2].url, './data/catalog.json');
    assert.match($('#data-refresh-status').textContent, /bundled fallback/);
    assert.ok([...document.querySelectorAll('.feed-meta')].every(el => el.textContent.includes('Bundled fallback')));
  });

  await t.test('aborted remote requests fall back immediately and re-enable refresh controls', async () => {
    remote.mode = 'timeout';
    const requestStart = requests.length;
    const before = await exportJSON();
    await refresh();
    const attempts = requests.slice(requestStart);
    assert.equal(attempts.filter(r => r.url.startsWith('https:')).length, 2);
    assert.ok(attempts.every(r => r.options.signal instanceof AbortSignal), 'each fetch is cancellable');
    assert.match($('#data-refresh-status').textContent, /bundled fallback/);
    assert.match($('#data-refresh-status').textContent, /timeout|timed out|abort/i);
    assert.equal($('#refresh-data').disabled, false);
    assert.equal($('#refresh-data').classList.contains('source-refresh-busy'), false);
    assert.equal($('#optimize-button').disabled, false);
    const after = await exportJSON();
    assert.equal(after.result.totalCost, before.result.totalCost);
    remote.mode = 'unavailable';
  });

  await t.test('manual curve and imported prices survive successful new source refresh', async () => {
    edit('#benchmark', 900);
    edit('#price-curve', '900, 910, 920, 930');
    await submit();
    const before = await exportJSON();
    remote.mode = 'feature';
    const updatedMarket = remote.fixture.get('data/market.json');
    updatedMarket.latest.value += 0.1;
    updatedMarket.conversion.usdPerTonne += 33.02;
    await refresh();
    assert.match($('#data-refresh-status').textContent, /Remote feature-branch snapshot/);
    assert.equal($('#benchmark').valueAsNumber, 900);
    assert.equal($('#price-curve').value, '900, 910, 920, 930');
    assert.equal($('#export-json').disabled, false);
    const after = await exportJSON();
    assert.deepEqual(after.baseInputs.priceCurve, before.baseInputs.priceCurve);
    assert.equal(after.result.totalCost, before.result.totalCost);
    assert.equal(after.sources.market.latest.value, updatedMarket.latest.value);
    await importJSON(saved);
    await refresh();
    assert.deepEqual((await exportJSON()).baseInputs.priceCurve, saved.baseInputs.priceCurve);
  });

  await t.test('monthly context observations are accepted and preserve their source role', async () => {
    const monthly = remote.fixture.get('data/catalog.json').feeds.find(feed => feed.id === 'jodi-jet-kerosene-monthly');
    monthly.status = 'observed'; monthly.path = 'data/jodi.json'; monthly.observationDate = '2026-08';
    remote.fixture.set('data/jodi.json', { source: { id: monthly.id, unit: 'KTONS' }, fetchedAt: '2026-10-28T00:00:00Z', latest: { date: '2026-08' }, observations: [{ date: '2026-08', country: 'JP', value: 100 }], staleAfterDays: 90 });
    await refresh();
    const card = [...document.querySelectorAll('.feed-card')].find(el => el.textContent.includes(monthly.title));
    assert.ok(card);
    assert.doesNotMatch(card.textContent, /INVALID OBSERVATION DATE/);
    assert.match(card.textContent, /CONTEXT ONLY/);
    assert.match(card.textContent, /OBSERVED SNAPSHOT/);
  });

  await t.test('a missing remote feed falls back as a complete set without mixing origins', async () => {
    const fx = remote.fixture.get('data/fx.json');
    remote.fixture.delete('data/fx.json');
    await refresh();
    assert.match($('#data-refresh-status').textContent, /bundled fallback/);
    assert.ok([...document.querySelectorAll('.feed-meta')].every(el => el.textContent.includes('Bundled fallback')));
    remote.fixture.set('data/fx.json', fx);
  });

  await t.test('untrusted imported hub labels cannot create spreadsheet formulas in CSV export', async () => {
    const custom = clone(saved);
    custom.baseInputs.suppliers[0].id = '=1+1';
    for (const lane of custom.baseInputs.routes) if (lane.from === 'SIN') lane.from = '=1+1';
    await importJSON(custom);
    assert.match($('#import-status').textContent, /^Imported/);
    click('#export-button');
    const csv = await downloads.at(-1).blob.text();
    assert.ok(csv.includes('"\'=1+1"'), 'formula-like labels are neutralized when opened in a spreadsheet');
    assert.ok(!csv.includes(',"=1+1",'));
    await importJSON(saved);
  });

  await t.test('map periods, inventory tabs, source details and dialog remain interactive', async () => {
    click('#period-next');
    assert.equal($('#map-period').value, '2');
    click('#network-nodes [data-node="SIN"]');
    assert.match($('#map-status').textContent, /Singapore.*P2 departure/);
    edit('#map-period', 4, 'change');
    assert.equal(document.querySelectorAll('#active-route .route-line').length, 0, 'last-period departures with positive lead time are excluded');
    click('#tab-inventory');
    assert.equal($('#view-inventory').hidden, false);
    assert.equal($('#view-movements').hidden, true);
    edit('#inventory-node', 'TYO', 'change');
    assert.equal(document.querySelectorAll('#inventory-rows tr').length, 4);
    assert.ok($('#inventory-chart').querySelector('.chart-stock'));
    click('[data-open-method]'); assert.equal($('#method-dialog').hasAttribute('open'), true);
    click('#close-method'); assert.equal($('#method-dialog').hasAttribute('open'), false);
    click('#nav-markets'); assert.deepEqual(ui.scrollTargets, ['markets']);
  });
});

test('missing source catalog is visibly unavailable while estimated input remains usable', async t => {
  const ui = await mountApp(t, { noCatalog: true });
  assert.match(ui.$('#source-cards').textContent, /No source catalog available/);
  assert.match(ui.$('#ticker-values').textContent, /ESTIMATED BENCHMARK/);
  assert.match(ui.$('#result-verdict').textContent, /^Feasible/);
  const exported = await ui.exportJSON();
  assert.equal(exported.controls.benchmarkKind, 'assumed');
  assert.equal(exported.sources.market, null);
});


test('initial page opening loads the newest available remote feature snapshot before bundled data', async t => {
  const ui = await mountApp(t, { remoteMode: 'feature' });
  assert.match(ui.$('#data-refresh-status').textContent, /Remote feature-branch snapshot/);
  assert.ok(ui.requests.some(r => r.url.includes('/main/dist/data/catalog.json')));
  assert.ok(ui.requests.some(r => r.url.includes('/codex/complete-energy-model/dist/data/catalog.json')));
  assert.ok(ui.requests.every(r => r.url.startsWith('https:')), 'successful remote snapshot does not silently mix bundled files');
  assert.match(ui.$('#result-verdict').textContent, /^Feasible/);
  assert.equal(ui.$('#refresh-data').disabled, false);
  const data = await ui.exportJSON();
  assert.ok(data.sources.loadStatus.every(record => record.origin === 'Remote feature-branch snapshot'));
});
