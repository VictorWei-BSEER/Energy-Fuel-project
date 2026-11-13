import test from 'node:test';
import assert from 'node:assert/strict';
import { airportData } from '../dist/global-airports.js';
import { airportScenario, deriveScenario } from '../dist/scenario-data.js';
import { buildIntegratedNetwork, INTEGRATED_DEFAULTS, INTEGRATED_FIELD_CATALOG } from '../dist/integrated-data.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const at = (value, stage) => Array.isArray(value) ? value[stage] : value;
function directCost(network, code, stage = 0) {
  const route = network.routes.find(row => row.airport === code);
  const supplier = network.suppliers.find(row => row.id === route.supplierId);
  const airport = network.airports.find(row => row.code === code);
  return at(supplier.priceUsdPerT, stage) + route.freightUsdPerT + route.handlingUsdPerT
    + route.basisAdjustmentUsdPerT + airport.intoPlaneUsdPerT + airport.taxAdjustmentUsdPerT;
}

test('all 67 origins preserve delivered scenario price without charging it twice or inferring a supplier location', () => {
  for (const [i, sourceAirport] of airportData.entries()) {
    const destination = airportData[(i + 1) % airportData.length].code;
    const input = { legs: [{ from: sourceAirport.code, to: destination }] };
    const network = buildIntegratedNetwork(input);
    const expected = airportScenario(sourceAirport.code);
    assert.equal(network.stageCount, 1);
    assert.deepEqual(network.airports.map(row => row.code), [sourceAirport.code]);
    assert.equal(network.suppliers.length, 1);
    assert.equal(network.routes.length, 1);
    assert.equal(network.deliveredOffers.length, 0);
    near(directCost(network, sourceAirport.code), expected.priceUsdPerT);
    const route = network.routes[0], supplier = network.suppliers[0], airport = network.airports[0];
    assert.equal(route.supplierId, supplier.id);
    assert.equal(route.leadTimeStages, 0);
    near(route.freightUsdPerT, expected.distanceFromHubKm * expected.assumptions.transportUsdPerTPerKm);
    assert.deepEqual(airport.coordinates, { lat: sourceAirport.lat, lon: sourceAirport.lon });
    assert.equal(airport.initialInventoryT, 0);
    assert.equal(airport.terminalInventoryT, 0);
    assert.equal(network.geography.classification, 'sourced_geography');
    assert.equal(supplier.provenance.classification, 'analyst_scenario');
    assert.equal(supplier.coordinates, undefined);
    assert.match(network.provenance.time, /departure event/);
  }
});

test('one regional supplier pool and one airport stock serve repeated visits without multiplying capacity', () => {
  const input = deriveScenario(['SIN', 'BKK', 'SIN', 'NRT']);
  input.legs[0].maxUpliftT = 10;
  input.legs[1].maxUpliftT = 30;
  input.legs[2].maxUpliftT = 20;
  const network = buildIntegratedNetwork(input);
  assert.equal(network.suppliers.length, 1);
  assert.equal(network.suppliers[0].id, 'supplier:southeast_asia');
  assert.equal(network.suppliers[0].capacityT, 30);
  assert.equal(network.suppliers[0].totalCapacityT, 60);
  assert.equal(network.routes.length, 2);
  const sinRoute = network.routes.find(row => row.airport === 'SIN');
  assert.equal(sinRoute.capacityT, 20);
  assert.equal(sinRoute.totalCapacityT, 30);
  const stock = network.airports.find(row => row.code === 'SIN');
  assert.deepEqual(stock.visitStages, [0, 2]);
  assert.equal(stock.storageCapacityT, 20);
  assert.equal(network.airports.some(row => row.code === 'NRT'), false);
  assert.deepEqual(network.stages.map(row => [row.index, row.from, row.to]), [[0, 'SIN', 'BKK'], [1, 'BKK', 'SIN'], [2, 'SIN', 'NRT']]);
});

test('current pricing settings, airport basis override, signed fiscal adjustment and manual price retain exact accounting', () => {
  const scenarioOptions = {
    pricing: { baseJetUsdPerT: 910, transportUsdPerTPerKm: 0.04, taxAdjustmentUsdPerT: -6 },
    regions: { east_asia: { basisUsdPerT: 120, serviceUsdPerT: 71, referenceHub: 'ICN' } },
    airportOverrides: { HKG: { basisUsdPerT: 150, serviceUsdPerT: 66, referenceHub: 'SIN' } },
  };
  const input = deriveScenario(['HKG', 'NRT', 'HKG'], 'widebody', scenarioOptions);
  const hkgGenerated = input.legs[0].priceUsdPerT;
  input.legs[0].priceUsdPerT -= 23;
  const network = buildIntegratedNetwork(input, { scenarioOptions, priceMode: 'demo' });
  assert.equal(network.suppliers.length, 1);
  assert.equal(network.suppliers[0].priceUsdPerT, 1030);
  const route = network.routes.find(row => row.airport === 'HKG');
  assert.equal(route.basisAdjustmentUsdPerT, 7);
  assert.equal(route.costComponents.airportBasisAdjustmentUsdPerT, 30);
  assert.equal(route.costComponents.manualPriceAdjustmentUsdPerT, -23);
  assert.equal(route.referenceHub, 'SIN');
  const stock = network.airports.find(row => row.code === 'HKG');
  assert.equal(stock.intoPlaneUsdPerT, 66);
  assert.equal(stock.taxAdjustmentUsdPerT, -6);
  near(directCost(network, 'HKG'), hkgGenerated - 23);
  near(directCost(network, 'NRT'), input.legs[1].priceUsdPerT);
  assert.match(route.provenance.manualPrice, /user scenario/);
});

test('all-inclusive quotation mode never substitutes scenario prices, infers upstream costs, or adds fees', () => {
  const input = {
    legs: [
      { from: 'SIN', to: 'BKK', priceUsdPerT: 1100, maxUpliftT: 70 },
      { from: 'BKK', to: 'SIN', priceUsdPerT: 1200, maxUpliftT: 80 },
      { from: 'SIN', to: 'NRT', priceUsdPerT: 1300, maxUpliftT: 90 },
    ],
  };
  const network = buildIntegratedNetwork(input, { priceMode: 'quotes', scenarioOptions: { pricing: { baseJetUsdPerT: 999999 } } });
  assert.equal(network.mode, 'delivered');
  assert.deepEqual(network.suppliers, []);
  assert.deepEqual(network.routes, []);
  const offer = network.deliveredOffers.find(row => row.airport === 'SIN');
  assert.deepEqual(offer.priceUsdPerT, [1100, 0, 1300]);
  assert.deepEqual(offer.capacityT, [70, 0, 90]);
  assert.equal(offer.totalCapacityT, 160);
  assert.equal(offer.provenance.classification, 'user_supplied_price');
  assert.match(offer.provenance.allocation, /not a quantity guaranteed/);
  for (const airport of network.airports) {
    assert.equal(airport.intoPlaneUsdPerT, 0);
    assert.equal(airport.taxAdjustmentUsdPerT, 0);
    assert.equal(airport.holdingUsdPerTPerStage, 0);
    assert.equal(airport.initialInventoryT, 0);
  }
  const missing = structuredClone(input);
  delete missing.legs[1].priceUsdPerT;
  assert.throws(() => buildIntegratedNetwork(missing, { priceMode: 'quotes' }), /active all-inclusive price/);
  assert.throws(() => buildIntegratedNetwork(input, { priceMode: 'quotes', overrides: { deliveredOffers: { 'offer:SIN': { priceUsdPerT: 500 } } } }), /immutable/);
  for (const key of ['intoPlaneUsdPerT', 'taxAdjustmentUsdPerT', 'holdingUsdPerTPerStage'])
    assert.throws(() => buildIntegratedNetwork(input, { priceMode: 'quotes', overrides: { airports: { SIN: { [key]: 1 } } } }), /cannot add/);
});

test('quoted volume edits preserve event availability and never borrow a future visit quote', () => {
  const input = { legs: [{ from: 'SIN', to: 'BKK', priceUsdPerT: 1000 }, { from: 'BKK', to: 'NRT', priceUsdPerT: 1200 }] };
  const network = buildIntegratedNetwork(input, { priceMode: 'quotes', overrides: { deliveredOffers: { 'offer:BKK': { capacityT: 25, totalCapacityT: 30 } } } });
  assert.deepEqual(network.deliveredOffers[1].capacityT, [0, 25]);
  assert.deepEqual(network.deliveredOffers[1].priceUsdPerT, [0, 1200]);
  assert.throws(() => buildIntegratedNetwork(input, { priceMode: 'quotes', overrides: { deliveredOffers: { 'offer:BKK': { capacityT: [25, 25] } } } }), /outside its quoted visit stages/);
});

test('edits retain explicit delay, pooled caps and exact final stocks without repairing shortages', () => {
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  const options = { overrides: {
    suppliers: { 'supplier:southeast_asia': { capacityT: [0, 6], totalCapacityT: 6 } },
    routes: { 'route:southeast_asia:SIN': { capacityT: 0, leadTimeStages: 3 } },
    airports: { SIN: { initialInventoryT: 10, storageCapacityT: 15, reserveT: 2 } },
  } };
  const network = buildIntegratedNetwork(input, options);
  assert.deepEqual(network.suppliers[0].capacityT, [0, 6]);
  assert.equal(network.suppliers[0].totalCapacityT, 6);
  assert.equal(network.routes[0].capacityT, 0);
  assert.equal(network.routes[0].leadTimeStages, 3);
  assert.equal(network.airports[0].initialInventoryT, 10);
  assert.equal(network.airports[0].terminalInventoryT, 10);
  assert.deepEqual(network.airports[0].provenance.overriddenFields, ['initialInventoryT', 'storageCapacityT', 'reserveT']);
  const explicit = buildIntegratedNetwork(input, { overrides: { airports: { SIN: { initialInventoryT: 10, terminalInventoryT: 4 } } } });
  assert.equal(explicit.airports[0].terminalInventoryT, 4);
  assert.equal(input.initialFuelT, 8);
});

test('empty user routes create no phantom economic network; incomplete or discontinuous routes fail clearly', () => {
  for (const legs of [[], [{ from: '', to: '' }]]) {
    const network = buildIntegratedNetwork({ legs });
    assert.equal(network.stageCount, 0);
    for (const key of ['suppliers', 'routes', 'airports', 'deliveredOffers']) assert.deepEqual(network[key], []);
  }
  assert.throws(() => buildIntegratedNetwork({ legs: [{ from: 'SIN', to: '' }] }), /directory/);
  assert.throws(() => buildIntegratedNetwork({ legs: [{ from: 'SIN', to: 'SIN' }] }), /different/);
  assert.throws(() => buildIntegratedNetwork({ legs: [{ from: 'SIN', to: 'BKK' }, { from: 'HKG', to: 'NRT' }] }), /continuous/);
  assert.throws(() => buildIntegratedNetwork({ legs: Array(1) }), /object/);
  assert.throws(() => buildIntegratedNetwork({ legs: Array(6).fill({ from: '', to: '' }) }), /0–5/);
});

test('malformed overrides cannot silently change topology, erase constraints or coerce numeric input', () => {
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  const attempts = [
    { suppliers: { 'supplier:southeast_asia': { capacityT: '3' } } },
    { suppliers: { 'supplier:southeast_asia': { capacityT: [1] } } },
    { suppliers: { 'supplier:southeast_asia': { capacityT: [1, Infinity] } } },
    { suppliers: { 'supplier:southeast_asia': { totalCapacityT: -1 } } },
    { routes: { 'route:southeast_asia:SIN': { leadTimeStages: 0.5 } } },
    { routes: { 'route:southeast_asia:SIN': { supplierId: 'other' } } },
    { airports: { SIN: { storageCapacityT: NaN } } },
    { airports: { SIN: { initialInventoryT: 121 } } },
    { airports: { SIN: { reserveT: 5, terminalInventoryT: 0 } } },
    { airports: { NRT: { initialInventoryT: 1 } } },
    { suppliers: { unknown: { capacityT: 0 } } },
    { imaginaryNodes: {} },
  ];
  for (const overrides of attempts) assert.throws(() => buildIntegratedNetwork(input, { overrides }));
  assert.throws(() => buildIntegratedNetwork(input, { priceMode: 'live' }), /price mode/);
  const wrongCap = structuredClone(input); wrongCap.legs[0].maxUpliftT = null;
  assert.throws(() => buildIntegratedNetwork(wrongCap), /visit cap/);
  const conflict = deriveScenario(['SIN', 'BKK', 'SIN', 'NRT']); conflict.legs[2].priceUsdPerT += 1;
  assert.throws(() => buildIntegratedNetwork(conflict), /conflicting per-visit/);
});

test('builder output is deterministic, independent of mutation, and exposes bilingual field meanings', () => {
  const input = deriveScenario(['DXB', 'SIN', 'NRT']);
  const options = { priceMode: 'scenario', overrides: { airports: { DXB: { initialInventoryT: 2 } } } };
  const snapshot = structuredClone({ input, options });
  const first = buildIntegratedNetwork(input, options), second = buildIntegratedNetwork(input, options);
  assert.deepEqual(first, second);
  first.airports[0].coordinates.lat = 0;
  first.routes[0].provenance.price = 'modified';
  assert.deepEqual(buildIntegratedNetwork(input, options), second);
  assert.deepEqual({ input, options }, snapshot);
  assert.equal(INTEGRATED_DEFAULTS.holdingUsdPerTPerStage, 0.5);
  for (const item of INTEGRATED_FIELD_CATALOG) {
    assert.ok(item.label.en && item.label.zh && item.meaning.en && item.meaning.zh && item.unit);
    assert.equal(item.classification, 'analyst_scenario');
    assert.ok(Object.isFrozen(item));
  }
});

test('signed adjustments cannot pay for unused terminal stock through negative acquisition costs', () => {
  const input = deriveScenario(['SIN', 'BKK', 'NRT']);
  input.legs[0].priceUsdPerT = 10; // Positive delivered price, but below the separate USD 45/t service charge.
  assert.throws(() => buildIntegratedNetwork(input), /net acquisition cost must be non-negative/);
  const ordinary = deriveScenario(['SIN', 'BKK', 'NRT']);
  assert.throws(() => buildIntegratedNetwork(ordinary, { overrides: {
    routes: { 'route:southeast_asia:SIN': { basisAdjustmentUsdPerT: -801, capacityT: 0 } },
    airports: { SIN: { initialInventoryT: 0, terminalInventoryT: 10 } },
  } }), /net acquisition cost must be non-negative/);
  assert.throws(() => buildIntegratedNetwork(ordinary, { overrides: {
    suppliers: { 'supplier:southeast_asia': { priceUsdPerT: [800, 1] } },
    routes: { 'route:southeast_asia:SIN': { basisAdjustmentUsdPerT: -2 } },
  } }), /stage 2: net acquisition/);
  assert.throws(() => buildIntegratedNetwork(ordinary, { overrides: {
    airports: { SIN: { taxAdjustmentUsdPerT: -900 } },
  } }), /complete delivered cost/);
});
