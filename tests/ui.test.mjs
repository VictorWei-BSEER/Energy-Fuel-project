import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

/**
 * DOM wiring smoke tests, not browser rendering tests. These small shims supply
 * browser form/dialog/download primitives missing from linkedom; the imported
 * application, event handlers, source loading and optimizer are all real.
 */
async function mountApp(t) {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const snapshot = JSON.parse(await readFile(new URL('../dist/data/market.json', import.meta.url), 'utf8'));
  const { document, window } = parseHTML(html);
  const downloads = [];
  const blobs = new Map();
  const requests = [];
  const scrollTargets = [];
  const originalGlobals = new Map();
  const setGlobal = (key, value) => {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
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
      return { valid: !missing && !badInput && !underflow && !overflow, valueMissing: missing, badInput, rangeUnderflow: underflow, rangeOverflow: overflow };
    },
  });
  window.HTMLInputElement.prototype.reportValidity = function () { return this.validity.valid; };
  window.HTMLElement.prototype.scrollIntoView = function () { scrollTargets.push(this.id); };
  const dialog = document.querySelector('#method-dialog');
  dialog.showModal = function () { this.setAttribute('open', ''); };
  dialog.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  const originalNow = Date.now;
  URL.createObjectURL = blob => { const url = `blob:ui-test-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href) });
    else originalAnchorClick.call(this);
  };
  // Keep freshness assertions stable while retaining the real fixture's date.
  Date.now = () => Date.parse(`${snapshot.latest.date}T00:00:00Z`) + 2 * 86400000;
  setGlobal('window', window);
  setGlobal('document', document);
  setGlobal('Option', function Option(label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; });
  setGlobal('matchMedia', () => ({ matches: true }));
  setGlobal('fetch', async (url, options) => {
    requests.push({ url, options });
    assert.equal(url, './data/market.json', 'the app only requests its local saved market snapshot');
    return { ok: true, json: async () => structuredClone(snapshot) };
  });
  t.after(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.HTMLAnchorElement.prototype.click = originalAnchorClick;
    Date.now = originalNow;
  });
  await import(`../dist/app.js?dom-smoke=${Date.now()}`);
  await new Promise(resolve => setImmediate(resolve));
  const $ = selector => document.querySelector(selector);
  const emit = (selector, type) => $(selector).dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  const edit = (selector, value, type = 'input') => { $(selector).value = String(value); emit(selector, type); };
  const submit = () => emit('#model-form', 'submit');
  const click = selector => emit(selector, 'click');
  return { $, document, window, snapshot, downloads, requests, scrollTargets, edit, submit, click };
}

test('physical optimizer UI follows source, input, solve and export interactions', async t => {
  const ui = await mountApp(t);
  const { $, document, snapshot, downloads, requests, edit, submit, click } = ui;
  const supplyCapacity = '#supply-inputs input[data-index="0"][data-field="capacity"]';

  await t.test('saved observed benchmark initializes a feasible physical allocation', () => {
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.cache, 'no-store');
    assert.equal($('#source-value').textContent, `$${snapshot.latest.value.toFixed(3)} / gal`);
    assert.match($('#source-status').textContent, /OBSERVED.*SAVED SNAPSHOT/);
    assert.match($('#source-date').textContent, new RegExp(snapshot.latest.date));
    assert.equal($('#benchmark').valueAsNumber, snapshot.conversion.usdPerTonne);
    assert.match($('#benchmark-basis').textContent, /Observed USGC proxy/);
    assert.match($('#result-verdict').textContent, /^Feasible/);
    assert.equal($('#delivered-total').textContent, '20,100 / 20,100 t');
    assert.equal($('#unmet-total').textContent, '0 t');
    assert.notEqual($('#baseline-savings').textContent, 'Not comparable');
    assert.equal($('#export-button').disabled, false);
    assert.equal(document.querySelectorAll('#network-nodes [data-node]').length, 6);
    assert.ok(document.querySelectorAll('#active-route .route-line').length > 0);
    assert.ok($('#allocation-rows').textContent.includes('TYO'));
    assert.ok($('#allocation-rows').textContent.includes('ULS'));
  });

  await t.test('scenario edits hide stale results and block exports until another solve', () => {
    edit('#scenario', 'refinery-outage', 'change');
    assert.match($('#result-verdict').textContent, /Inputs changed/);
    assert.equal($('#total-cost').textContent, '—');
    assert.equal($('#export-button').disabled, true);
    assert.equal($('#export-json').disabled, true);
    assert.equal(document.querySelectorAll('#active-route .route-line').length, 0);
    click('#export-button');
    click('#export-json');
    assert.equal(downloads.length, 0, 'dirty results cannot be exported even if a click is dispatched');
  });

  await t.test('Singapore outage renders the unmet requirement and suppresses savings', () => {
    submit();
    assert.match($('#result-verdict').textContent, /^Infeasible/);
    assert.equal($('#unmet-total').textContent, '1,350 t');
    assert.equal($('#cost-heading').textContent, 'PARTIAL ALLOCATION COST');
    assert.equal($('#baseline-savings').textContent, 'Not comparable');
    assert.match($('#baseline-note').textContent, /Savings hidden/);
    assert.match($('#constraint-summary').textContent, /Unmet:/);
    assert.equal($('#export-button').disabled, false);
  });

  await t.test('partial-plan exports preserve infeasibility, unmet tonnes and source provenance', async () => {
    click('#export-button');
    click('#export-json');
    assert.equal(downloads.length, 2);
    assert.equal(downloads[0].filename, 'fuel-atlas-refinery-outage-allocation.csv');
    assert.match(downloads[0].blob.type, /^text\/csv/);
    const csv = await downloads[0].blob.text();
    assert.match(csv, /"data_status","scenario","feasible"/);
    assert.match(csv, /"ESTIMATED_NETWORK","refinery-outage","false"/);
    assert.match(csv, /"UNMET_DEMAND","refinery-outage","false"/);
    assert.ok(csv.includes(snapshot.latest.date));
    assert.equal(downloads[1].filename, 'fuel-atlas-refinery-outage-scenario.json');
    const exported = JSON.parse(await downloads[1].blob.text());
    assert.equal(exported.results.feasible, false);
    assert.equal(exported.results.unmetDemandTotal, 1350);
    assert.equal(exported.results.baseline.savings, null);
    assert.equal(exported.benchmarkKind, 'observed');
    assert.deepEqual(exported.marketSource.latest, snapshot.latest);
    assert.equal(exported.inputs.scenario, 'refinery-outage');
    assert.equal(exported.baseInputs.supplies[0].capacity, 11000);
    assert.equal(exported.inputs.supplies[0].capacity, 2750);
    assert.match(exported.dataStatus, /Estimated physical network/);
  });

  await t.test('invalid physical inputs expose an error and do not leave an exportable plan', () => {
    edit(supplyCapacity, -1);
    submit();
    assert.equal($('#model-error').hidden, false);
    assert.match($('#model-error').textContent, /Singapore supply capacity/);
    assert.match($('#result-verdict').textContent, /Please correct the inputs/);
    assert.equal($('#total-cost').textContent, '—');
    assert.equal($('#export-button').disabled, true);
    assert.equal($('#export-json').disabled, true);
  });

  await t.test('manual benchmark overrides keep their provenance and network reset restores edited fields', async () => {
    edit(supplyCapacity, 10000);
    edit('#benchmark', 900);
    edit('#scenario', 'baseline', 'change');
    assert.match($('#benchmark-basis').textContent, /Manual scenario input/);
    submit();
    assert.match($('#result-verdict').textContent, /^Feasible/);
    assert.equal($('#model-error').hidden, true);
    click('#export-json');
    const manual = JSON.parse(await downloads.at(-1).blob.text());
    assert.equal(manual.benchmarkKind, 'manual');
    assert.equal(manual.inputs.benchmarkUsdPerTonne, 900);
    assert.equal(manual.baseInputs.supplies[0].capacity, 10000);
    assert.deepEqual(manual.marketSource.latest, snapshot.latest, 'manual model price does not rewrite the source observation');
    click('#reset-assumptions');
    assert.equal($(supplyCapacity).valueAsNumber, 11000);
    assert.equal($('#benchmark').valueAsNumber, 900, 'Reset network only resets physical assumptions');
    assert.equal($('#export-json').disabled, true);
    submit();
    assert.match($('#result-verdict').textContent, /^Feasible/);
  });

  await t.test('demand controls, map layers, node inspection and methodology are wired', () => {
    edit('#demand-scale', 2);
    assert.equal($('#demand-scale-label').value, '2.0×');
    assert.equal($('#export-button').disabled, true);
    submit();
    assert.match($('#result-verdict').textContent, /^Infeasible/);
    edit('#demand-scale', 1);
    submit();
    click('#layer-lanes');
    assert.equal($('#layer-lanes').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelectorAll('#route-background .background-route').length, 9);
    click('#network-nodes [data-node="SIN"]');
    assert.match($('#map-status').textContent, /Singapore.*allocated/);
    click('[data-open-method]');
    assert.equal($('#method-dialog').hasAttribute('open'), true);
    click('#close-method');
    assert.equal($('#method-dialog').hasAttribute('open'), false);
    click('#nav-markets');
    assert.deepEqual(ui.scrollTargets, ['markets']);
  });
});
