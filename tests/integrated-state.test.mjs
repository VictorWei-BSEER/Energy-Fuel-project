import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { deriveScenario } from '../dist/scenario-data.js';
import * as state from '../dist/integrated-state.js';

let viewId = 0;
async function mount(t, { view = false } = {}) {
  const html = view ? (await Promise.all(['panel', 'results'].map(name => readFile(new URL(`../dist/integrated-view/${name}.html`, import.meta.url), 'utf8')))).join('') : '';
  const { document, window } = parseHTML(`<!doctype html><html><body>${html}<button id="elsewhere">Elsewhere</button></body></html>`);
  const globals = new Map();
  for (const [key, value] of Object.entries({ document, window, CustomEvent: window.CustomEvent })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let focused = null;
  const oldFocus = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'focus');
  window.HTMLElement.prototype.focus = function () { focused = this; };
  t.after(() => {
    if (oldFocus) Object.defineProperty(window.HTMLElement.prototype, 'focus', oldFocus);
    else delete window.HTMLElement.prototype.focus;
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const changes = [];
  document.addEventListener('integratednetworkchange', event => changes.push(event.detail));
  state.getIntegratedNetwork(); // A new document owns an independent editing session.
  const controller = view ? await import(`../dist/integrated-view.js?state-test=${++viewId}`) : null;
  const $ = selector => document.querySelector(selector);
  const control = (group, id, key) => [...document.querySelectorAll('[data-chain-key]')].find(node => node.dataset.chainGroup === group && node.dataset.chainId === id && node.dataset.chainKey === key);
  const fire = (element, name) => element.dispatchEvent(new window.Event(name, { bubbles: true }));
  return { $, document, window, changes, controller, control, fire, focused: () => focused };
}

test('supply overrides are atomic, returned snapshots are isolated, and reset restores the current route', async t => {
  const ui = await mount(t);
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  state.syncIntegratedNetwork(input, { priceMode: 'scenario' });
  const edited = state.setIntegratedNetworkOverrides({ suppliers: { 'supplier:southeast_asia': { totalCapacityT: 60 } }, airports: { SIN: { initialInventoryT: 4 } } });
  assert.equal(edited.suppliers[0].totalCapacityT, 60);
  assert.equal(edited.airports[0].initialInventoryT, 4);
  assert.equal(edited.airports[0].terminalInventoryT, 4);
  const before = state.getIntegratedNetwork(), beforeOverrides = state.getIntegratedOverrides(), eventCount = ui.changes.length;
  assert.throws(() => state.setIntegratedNetworkOverrides({ suppliers: { 'supplier:southeast_asia': { totalCapacityT: 20 } }, airports: { SIN: { storageCapacityT: -1 } } }));
  assert.deepEqual(state.getIntegratedNetwork(), before, 'no partial valid supplier edit escapes a rejected patch');
  assert.deepEqual(state.getIntegratedOverrides(), beforeOverrides);
  assert.equal(ui.changes.length, eventCount);
  edited.airports[0].initialInventoryT = 999;
  beforeOverrides.airports.SIN.initialInventoryT = 888;
  assert.equal(state.getIntegratedNetwork().airports[0].initialInventoryT, 4);
  const reset = state.resetIntegratedNetwork();
  assert.equal(reset.suppliers[0].totalCapacityT, 240);
  assert.equal(reset.airports[0].initialInventoryT, 0);
  assert.deepEqual(state.getIntegratedOverrides(), {});
  assert.equal(ui.changes.at(-1).source, 'user-edit');
});

test('one stock edit applies to repeated visits; changing route prunes obsolete entities and preserves shared ones', async t => {
  await mount(t);
  state.syncIntegratedNetwork(deriveScenario(['SIN', 'BKK', 'SIN', 'NRT']));
  state.setIntegratedNetworkOverrides({ airports: { SIN: { initialInventoryT: 5 }, BKK: { storageCapacityT: 90 } }, suppliers: { 'supplier:southeast_asia': { totalCapacityT: 55 } } });
  assert.deepEqual(state.getIntegratedNetwork().airports.find(row => row.code === 'SIN').visitStages, [0, 2]);
  const changed = state.syncIntegratedNetwork(deriveScenario(['SIN', 'HKG', 'NRT']));
  assert.equal(changed.airports.filter(row => row.code === 'SIN').length, 1);
  assert.equal(changed.airports.find(row => row.code === 'SIN').initialInventoryT, 5);
  assert.equal(changed.airports.some(row => row.code === 'BKK'), false);
  assert.equal(state.getIntegratedOverrides().airports.BKK, undefined);
  assert.equal(changed.suppliers.find(row => row.id === 'supplier:southeast_asia').totalCapacityT, 55);
  state.syncIntegratedNetwork({ legs: [{ from: '', to: '' }] });
  assert.deepEqual(state.getIntegratedOverrides(), {});
  assert.deepEqual(state.getIntegratedNetwork().airports, []);
});

test('switching to imported prices preserves stock assumptions and removes all upstream and extra-fee edits', async t => {
  await mount(t);
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  state.syncIntegratedNetwork(input);
  state.setIntegratedNetworkOverrides({
    suppliers: { 'supplier:southeast_asia': { priceUsdPerT: 850 } },
    routes: { 'route:southeast_asia:SIN': { freightUsdPerT: 12 } },
    airports: { SIN: { initialInventoryT: 3, intoPlaneUsdPerT: 80, taxAdjustmentUsdPerT: -2, holdingUsdPerTPerStage: 4 } },
  });
  input.legs[0].priceUsdPerT = 1200; input.legs[1].priceUsdPerT = 1300;
  const quoted = state.syncIntegratedNetwork(input, { priceMode: 'quotes' });
  assert.equal(quoted.mode, 'delivered');
  assert.deepEqual(quoted.suppliers, []);
  assert.deepEqual(quoted.routes, []);
  assert.equal(quoted.airports[0].initialInventoryT, 3);
  assert.equal(quoted.airports[0].intoPlaneUsdPerT, 0);
  assert.equal(quoted.airports[0].taxAdjustmentUsdPerT, 0);
  assert.equal(quoted.airports[0].holdingUsdPerTPerStage, 0);
  assert.deepEqual(state.getIntegratedOverrides(), { airports: { SIN: { initialInventoryT: 3 } } });
  const missing = structuredClone(input); delete missing.legs[1].priceUsdPerT;
  assert.equal(state.syncIntegratedNetwork(missing, { priceMode: 'quotes' }), null);
  assert.equal(state.getIntegratedNetwork(), null, 'a missing quote cannot expose the prior price network to calculation');
});

test('invalid retained stock edits remain recoverable while the calculation network stays unavailable', async t => {
  await mount(t);
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  state.syncIntegratedNetwork(input);
  state.setIntegratedNetworkOverrides({ airports: { SIN: { initialInventoryT: 50 } } });
  input.legs[0].maxUpliftT = 20; // New generated storage is below the retained opening stock.
  assert.equal(state.syncIntegratedNetwork(input), null);
  const invalid = state.getIntegratedViewState();
  assert.equal(invalid.invalid, true);
  assert.equal(invalid.network, null);
  assert.equal(invalid.preview.airports.find(row => row.code === 'SIN').initialInventoryT, 50);
  assert.equal(invalid.preview.airports.find(row => row.code === 'SIN').storageCapacityT, 20);
  const repaired = state.setIntegratedNetworkOverrides({ airports: { SIN: { storageCapacityT: 60 } } });
  assert.equal(repaired.airports.find(row => row.code === 'SIN').initialInventoryT, 50);
  assert.equal(state.getIntegratedViewState().invalid, false);
  input.legs[0].maxUpliftT = 5;
  state.syncIntegratedNetwork(input);
  state.resetIntegratedNetwork();
  assert.equal(state.getIntegratedNetwork().airports[0].initialInventoryT, 0);
  assert.equal(state.getIntegratedNetwork().airports[0].storageCapacityT, 5);
  assert.deepEqual(state.getIntegratedOverrides(), {});
});

test('invalid pending values survive unrelated aircraft synchronization and continue to block commit', async t => {
  const ui = await mount(t, { view: true });
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  state.syncIntegratedNetwork(input);
  const field = ui.control('suppliers', 'supplier:southeast_asia', 'totalCapacityT');
  field.focus(); field.value = '';
  ui.fire(field, 'input');
  assert.equal(ui.control('suppliers', 'supplier:southeast_asia', 'totalCapacityT'), field, 'typing does not replace the focused control');
  assert.equal(ui.focused(), field);
  assert.equal(ui.controller.commitPendingIntegratedInputs(), false);
  input.aircraft.tankCapacityT += 1;
  state.syncIntegratedNetwork(input);
  assert.equal(ui.control('suppliers', 'supplier:southeast_asia', 'totalCapacityT').value, '', 'synchronizing an unrelated aircraft edit must not silently restore the old cap');
  assert.equal(ui.controller.commitPendingIntegratedInputs(), false);
  const repaired = ui.control('suppliers', 'supplier:southeast_asia', 'totalCapacityT');
  repaired.value = '50'; ui.fire(repaired, 'input');
  assert.equal(ui.controller.commitPendingIntegratedInputs(), true);
  assert.equal(state.getIntegratedNetwork().suppliers[0].totalCapacityT, 50);
});

test('invalid stored settings keep the editor and explicit reset available', async t => {
  const ui = await mount(t, { view: true });
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  state.syncIntegratedNetwork(input);
  state.setIntegratedNetworkOverrides({ airports: { SIN: { initialInventoryT: 50 } } });
  input.legs[0].maxUpliftT = 10;
  state.syncIntegratedNetwork(input);
  assert.equal(state.getIntegratedNetwork(), null);
  assert.equal(ui.$('#chain-inputs').hidden, false);
  assert.equal(ui.$('#chain-reset').disabled, false);
  assert.equal(ui.control('airports', 'SIN', 'initialInventoryT').value, '50');
  ui.fire(ui.$('#chain-reset'), 'click');
  assert.ok(state.getIntegratedNetwork());
  assert.equal(ui.control('airports', 'SIN', 'initialInventoryT').value, '0');
});

test('a temporarily incomplete flight price cannot discard an invalid pending supply input', async t => {
  const ui = await mount(t, { view: true });
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  state.syncIntegratedNetwork(input);
  const cap = ui.control('suppliers', 'supplier:southeast_asia', 'totalCapacityT');
  cap.value = ''; ui.fire(cap, 'input');
  assert.equal(ui.controller.commitPendingIntegratedInputs(), false);
  const originalPrice = input.legs[0].priceUsdPerT;
  input.legs[0].priceUsdPerT = NaN;
  assert.equal(state.syncIntegratedNetwork(input), null);
  input.legs[0].priceUsdPerT = originalPrice;
  state.syncIntegratedNetwork(input);
  assert.equal(ui.control('suppliers', 'supplier:southeast_asia', 'totalCapacityT').value, '');
  assert.equal(ui.controller.commitPendingIntegratedInputs(), false);
});

test('supply result panel switches to the baseline component costs and clears stale output', async t => {
  const ui = await mount(t, { view: true });
  state.syncIntegratedNetwork(deriveScenario(['SIN', 'BKK']));
  const plan = total => ({ feasible: true, supplyChain: { mode: 'modeled', costBreakdown: { procurementUsd: total - 12, freightUsd: 10, handlingUsd: 3, holdingUsd: 2, intoPlaneUsd: 4, basisAdjustmentUsd: -5, taxAdjustmentUsd: -2, deliveredQuoteUsd: 0, totalUsd: total }, shipments: [], airportInventory: [] } });
  const optimized = plan(100); optimized.baseline = plan(200);
  const notify = detail => ui.document.dispatchEvent(new ui.window.CustomEvent('integratedresultchange', { detail }));
  notify({ result: optimized, strategy: 'optimized' });
  assert.equal(ui.$('#chain-results').hidden, false);
  assert.match(ui.$('[data-chain-cost="totalCost"] strong').textContent, /100\.00/);
  assert.match(ui.$('[data-chain-cost="transportCost"] strong').textContent, /13\.00/);
  assert.match(ui.$('[data-chain-cost="adjustmentCost"] strong').textContent, /-7\.00/);
  notify({ result: optimized, strategy: 'baseline' });
  assert.match(ui.$('[data-chain-cost="totalCost"] strong').textContent, /200\.00/);
  assert.match(ui.$('[data-chain-cost="productCost"] strong').textContent, /188\.00/);
  notify({ result: null, strategy: 'optimized' });
  assert.equal(ui.$('#chain-results').hidden, true);
});
