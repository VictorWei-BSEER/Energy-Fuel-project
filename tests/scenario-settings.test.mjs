import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { SCENARIO_DEFAULTS, airportScenario, deriveLeg } from '../dist/scenario-data.js';

let moduleId = 0;
async function isolated(t) {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  const originals = new Map();
  for (const [key, value] of Object.entries({ document, CustomEvent: window.CustomEvent })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const api = await import(`../dist/scenario-settings.js?test=${++moduleId}`);
  return { ...api, document };
}

test('shared settings update the ledger and route atomically with nested regional merges', async t => {
  const { document, setScenarioOptions, getScenarioOptions } = await isolated(t);
  const before = getScenarioOptions(), events = [];
  document.addEventListener('scenarioassumptionschange', event => {
    const current = getScenarioOptions();
    const airport = airportScenario('DXB', current);
    const leg = deriveLeg('DXB', 'LHR', 'widebody', current);
    assert.equal(airport.priceUsdPerT, leg.priceUsdPerT);
    assert.deepEqual(event.detail.options, current);
    events.push(current);
    event.detail.options.pricing.baseJetUsdPerT = -100; // Cannot mutate shared state.
  });
  setScenarioOptions({ pricing: { baseJetUsdPerT: 900 }, regions: { gulf: { basisUsdPerT: -20 } } });
  assert.equal(events.length, 1);
  const after = getScenarioOptions();
  assert.equal(after.pricing.baseJetUsdPerT, 900);
  assert.equal(after.regions.gulf.basisUsdPerT, -20);
  assert.equal(after.regions.gulf.referenceHub, 'DXB');
  assert.equal(after.regions.gulf.serviceUsdPerT, 40);
  assert.deepEqual(after.regions.europe, before.regions.europe);
  assert.equal(airportScenario('DXB', after).priceUsdPerT, 920);
  setScenarioOptions({ regions: { gulf: { basisUsdPerT: -20 } } });
  assert.equal(events.length, 1, 'a no-op must not reset or invalidate the route');
  after.regions.gulf.serviceUsdPerT = 1000;
  assert.equal(getScenarioOptions().regions.gulf.serviceUsdPerT, 40);
});

test('invalid or malformed settings leave both state and change-event stream untouched', async t => {
  const { document, setScenarioOptions, getScenarioOptions } = await isolated(t);
  const before = getScenarioOptions();
  let events = 0;
  document.addEventListener('scenarioassumptionschange', () => events++);
  for (const invalid of [
    null, [], false, { pricing: null }, { pricing: 5 }, { pricing: [] }, { pricing: false },
    { pricing: { baseJetUsdPerT: NaN } }, { pricing: { transportUsdPerTPerKm: -1 } },
    { pricing: { unknown: 5 } }, { regions: null }, { regions: { gulf: null } },
    { regions: { gulf: { referenceHub: 'XYZ' } } }, { regions: { gulf: { basisUsdPerT: '20' } } },
    { regions: { gulf: { serviceUsdPerT: -5 } } }, { regions: { gulf: { basisUsdPerT: -2000 } } },
    { regions: { gulf: { unknown: 0 } } }, { regions: { made_up_region: {} } },
    { airportOverrides: { SIN: { maxUpliftT: 0 } } },
  ]) {
    assert.throws(() => setScenarioOptions(invalid));
    assert.deepEqual(getScenarioOptions(), before);
  }
  assert.equal(events, 0);
});

test('reset restores every global and regional assumption without retaining modified hub or fee', async t => {
  const { setScenarioOptions, getScenarioOptions, resetScenarioOptions } = await isolated(t);
  const original = getScenarioOptions();
  assert.equal(Object.keys(original.regions).length, 9);
  setScenarioOptions({ pricing: { baseJetUsdPerT: 950, defaultMaxUpliftT: 40 }, regions: {
    gulf: { referenceHub: 'DOH', basisUsdPerT: 60, serviceUsdPerT: 90 },
    east_asia: { referenceHub: 'NRT', basisUsdPerT: 120 },
  } });
  assert.equal(getScenarioOptions().regions.gulf.referenceHub, 'DOH');
  resetScenarioOptions();
  assert.deepEqual(getScenarioOptions(), original);
  assert.equal(getScenarioOptions().pricing.baseJetUsdPerT, SCENARIO_DEFAULTS.pricing.baseJetUsdPerT);
});
