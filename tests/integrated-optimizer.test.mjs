import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeIntegratedRotation } from '../src/integrated-optimizer.js';
import { defaultRotation, optimizeRotation as flightOnly } from '../dist/flight-optimizer.js';
import { buildIntegratedNetwork } from '../dist/integrated-data.js';
import { deriveScenario } from '../dist/scenario-data.js';

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);
const sum = values => values.reduce((a, b) => a + b, 0);
function toy({ stops = ['PVG', 'ICN', 'NRT'], prices = [900, 1100], burn = 8, carry = 0.02 } = {}) {
  const origins = [...new Set(stops.slice(0, -1))];
  const input = {
    initialFuelT: 5, aircraft: { tankCapacityT: 60, maxTakeoffWeightT: 250, maxLandingWeightT: 220 },
    legs: stops.slice(1).map((to, i) => ({ from: stops[i], to, priceUsdPerT: prices[i] ?? 1000, taxiBurnT: 0, baseBurnT: burn, reserveT: 5, carryBurnRate: carry, zeroFuelWeightT: 150, maxUpliftT: 60 })),
  };
  input.supplyChain = {
    mode: 'modeled',
    suppliers: [{ id: 'shared', priceUsdPerT: 800, capacityT: 100, totalCapacityT: 200 }],
    airports: origins.map(code => ({ code, initialInventoryT: 0, terminalInventoryT: 0, storageCapacityT: 100, reserveT: 0, intoPlaneUsdPerT: 0, holdingUsdPerTPerStage: 0 })),
    routes: origins.map((airport, i) => ({ id: airport, supplierId: 'shared', airport, capacityT: 100, totalCapacityT: 200, leadTimeStages: 0, freightUsdPerT: (prices[i] ?? 1000) - 800 })),
    deliveredOffers: [],
  };
  return input;
}
function balances(input, result) {
  assert.equal(result.feasible, true, result.diagnostics?.join(' '));
  near(input.initialFuelT + result.totalUpliftT - result.totalBurnT, result.finalFuelT);
  for (const leg of result.legs) {
    near(leg.arrivalFuelT + leg.upliftT, leg.departureFuelT);
    near(leg.departureFuelT - leg.burnT, leg.landingFuelT);
    assert.ok(leg.upliftT >= 0);
  }
  for (const row of result.supplyChain.airportInventory) {
    near(row.openingT + row.arrivalsT - row.upliftT, row.closingT);
    assert.ok(row.openingT + row.arrivalsT <= row.storageCapacityT + 1e-6);
    assert.ok(row.closingT >= row.reserveT - 1e-6);
  }
  for (const row of result.supplyChain.terminalTargets) near(row.targetT, row.finalT);
  const breakdown = result.supplyChain.costBreakdown;
  near(sum(Object.entries(breakdown).filter(([key]) => key !== 'totalUsd').map(([, value]) => value)), result.totalCostUsd);
  near(sum(result.legs.map(leg => leg.costUsd)), result.totalCostUsd);
  if (result.baseline?.feasible) {
    near(result.finalFuelT, result.baseline.finalFuelT);
    assert.deepEqual(result.supplyChain.terminalTargets.map(row => [row.airport, row.initialT, row.targetT]), result.baseline.supplyChain.terminalTargets.map(row => [row.airport, row.initialT, row.targetT]));
  }
}

test('joint LP reproduces the shared aircraft physics when upstream constraints are loose', () => {
  const input = toy();
  const legacy = flightOnly(input);
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(result.totalCostUsd, legacy.totalCostUsd);
  near(result.baseline.totalCostUsd, 16000);
  near(result.legs[0].upliftT, 8 + 8 / 0.98);
  near(result.legs[1].upliftT, 0);
  near(result.savingsUsd, 1453.061224489796);
  assert.equal(result.solver.flightPhysics, 'shared-flight-optimizer-core');
});

test('upstream outage causally moves aircraft uplift while an infeasible reference gets no savings', () => {
  const input = toy({ prices: [900, 800] });
  const normal = optimizeIntegratedRotation(input);
  balances(input, normal);
  near(normal.legs[0].upliftT, 8); near(normal.legs[1].upliftT, 8);
  input.supplyChain.routes[1].totalCapacityT = 0;
  const outage = optimizeIntegratedRotation(input);
  balances(input, outage);
  near(outage.legs[0].upliftT, 8 + 8 / 0.98);
  near(outage.legs[1].upliftT, 0);
  assert.equal(outage.baseline.feasible, false);
  assert.equal(outage.savingsUsd, null);
  assert.equal(outage.savingsPercent, null);
  assert.equal(outage.diagnosticDetails[0].code, 'BASELINE_NETWORK_INFEASIBLE');
});

test('a shared supplier horizon cap cannot be reused independently by each airport', () => {
  const input = toy();
  input.supplyChain.suppliers[0].totalCapacityT = 16;
  const constrained = optimizeIntegratedRotation(input);
  balances(input, constrained);
  near(constrained.supplyChain.suppliers[0].purchasedT, 16);
  near(constrained.legs[0].upliftT, 8); near(constrained.legs[1].upliftT, 8);
  near(constrained.savingsUsd, 0);
  input.supplyChain.suppliers[0].totalCapacityT = 15;
  assert.equal(optimizeIntegratedRotation(input).feasible, false);
});

test('supplier stage caps are shared by all simultaneous transport dispatches', () => {
  const input = toy({ prices: [800, 800], carry: 0 });
  input.supplyChain.suppliers[0].priceUsdPerT = [800, 1200];
  input.supplyChain.suppliers[0].capacityT = [8, 100];
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(sum(result.supplyChain.shipments.filter(row => row.departureStage === 1).map(row => row.quantityT)), 8);
  near(result.totalCostUsd, 8 * 800 + 8 * 1200);
});

test('a repeated airport uses one continuing inventory pool and one route horizon cap', () => {
  const input = toy({ stops: ['PVG', 'ICN', 'PVG', 'NRT'], prices: [900, 900, 900] });
  input.supplyChain.routes[0].capacityT = [16, 0, 0];
  input.supplyChain.routes[0].totalCapacityT = 16;
  input.supplyChain.airports[0].storageCapacityT = 16;
  input.supplyChain.airports[0].holdingUsdPerTPerStage = 1;
  input.supplyChain.routes[1].totalCapacityT = 8;
  input.supplyChain.suppliers[0].totalCapacityT = 24;
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  const rows = result.supplyChain.airportInventory.filter(row => row.airport === 'PVG');
  near(rows[0].arrivalsT, 16); near(rows[0].closingT, 8);
  near(rows[1].openingT, 8); near(rows[1].closingT, 8);
  near(rows[2].openingT, 8); near(rows[2].closingT, 0);
  near(result.supplyChain.costBreakdown.holdingUsd, 16);
  input.supplyChain.routes[0].totalCapacityT = 8;
  assert.equal(optimizeIntegratedRotation(input).feasible, false);
});

test('opening airport stock is not free savings because both plans must restore identical terminal stock', () => {
  const input = toy();
  input.supplyChain.airports[0].initialInventoryT = 20;
  delete input.supplyChain.airports[0].terminalInventoryT;
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  const terminal = result.supplyChain.terminalTargets.find(row => row.airport === 'PVG');
  near(terminal.initialT, 20); near(terminal.targetT, 20); near(terminal.finalT, 20);
  near(sum(result.supplyChain.shipments.map(row => row.quantityT)), result.totalUpliftT);
  input.supplyChain.suppliers[0].totalCapacityT = 0;
  assert.equal(optimizeIntegratedRotation(input).feasible, false);
});

test('transport lead time is causal and late receipts never backfill earlier uplift', () => {
  const input = toy();
  input.supplyChain.routes[0].leadTimeStages = 1;
  assert.equal(optimizeIntegratedRotation(input).feasible, false);
  input.supplyChain.airports[0].initialInventoryT = 20;
  input.supplyChain.airports[0].terminalInventoryT = 20;
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  const replenishment = result.supplyChain.shipments.filter(row => row.airport === 'PVG');
  assert.ok(replenishment.every(row => row.departureStage === 1 && row.arrivalStage === 2));
  assert.ok(result.supplyChain.shipments.every(row => row.arrivalStage <= input.legs.length));
});

test('storage peak, minimum stock and into-plane visit capacity all constrain the aircraft', () => {
  const input = toy();
  input.supplyChain.airports[0].storageCapacityT = 10;
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(result.legs[0].upliftT, 10);
  input.legs[0].maxUpliftT = 9;
  const visit = optimizeIntegratedRotation(input);
  balances(input, visit); near(visit.legs[0].upliftT, 9);
  input.supplyChain.airports[0].reserveT = 3;
  input.supplyChain.airports[0].terminalInventoryT = 3;
  assert.equal(optimizeIntegratedRotation(input).feasible, false, 'receipt tank can only release 7 t with a 3 t reserve');
});

test('all-in quotation mode pays the quotation once and retains joint inventory/capacity constraints', () => {
  const input = toy();
  input.supplyChain = {
    mode: 'delivered', airports: input.supplyChain.airports, suppliers: [], routes: [],
    deliveredOffers: input.legs.map((leg, index) => ({ id: leg.from, airport: leg.from, priceUsdPerT: leg.priceUsdPerT, capacityT: input.legs.map((_, stage) => stage === index ? 100 : 0), totalCapacityT: 100 })),
  };
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(result.totalCostUsd, flightOnly(input).totalCostUsd);
  const cost = result.supplyChain.costBreakdown;
  near(cost.deliveredQuoteUsd, result.totalCostUsd);
  for (const key of ['procurementUsd', 'freightUsd', 'handlingUsd', 'holdingUsd', 'intoPlaneUsd', 'taxAdjustmentUsd', 'basisAdjustmentUsd']) near(cost[key], 0);
  input.supplyChain.deliveredOffers[1].totalCapacityT = 0;
  const outage = optimizeIntegratedRotation(input);
  balances(input, outage); near(outage.legs[1].upliftT, 0);
  assert.equal(outage.baseline.feasible, false);
});

test('delivered offers cannot be bought before their explicit availability stage', () => {
  const input = toy({ stops: ['PVG', 'NRT'], prices: [900] });
  input.supplyChain = { mode: 'delivered', airports: input.supplyChain.airports, suppliers: [], routes: [], deliveredOffers: [{ airport: 'PVG', priceUsdPerT: 900, capacityT: [0] }] };
  assert.equal(optimizeIntegratedRotation(input).feasible, false);
});

test('signed basis and fiscal adjustments stay itemized and never create a negative delivered unit cost', () => {
  const input = toy({ stops: ['PVG', 'NRT'], prices: [900] });
  input.supplyChain.routes[0].basisAdjustmentUsdPerT = -20;
  input.supplyChain.routes[0].handlingUsdPerT = 3;
  input.supplyChain.airports[0].intoPlaneUsdPerT = 10;
  input.supplyChain.airports[0].taxAdjustmentUsdPerT = -4;
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(result.totalCostUsd, 8 * (800 + 100 - 20 + 3 + 10 - 4));
  near(result.supplyChain.costBreakdown.basisAdjustmentUsd, -160);
  near(result.supplyChain.costBreakdown.taxAdjustmentUsd, -32);
  input.supplyChain.routes[0].basisAdjustmentUsdPerT = -10000;
  assert.equal(optimizeIntegratedRotation(input).status, 'invalid');
});

test('one flight has no invented tankering savings because both plans optimize the same upstream network', () => {
  const input = toy({ stops: ['PVG', 'NRT'], prices: [900] });
  input.supplyChain.suppliers.push({ id: 'cheaper', priceUsdPerT: 700, capacityT: 10, totalCapacityT: 10 });
  input.supplyChain.routes.push({ supplierId: 'cheaper', airport: 'PVG', capacityT: 10, leadTimeStages: 0, freightUsdPerT: 0 });
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(result.totalCostUsd, 5600); near(result.baseline.totalCostUsd, 5600);
  near(result.savingsUsd, 0);
});

test('generated regional network preserves prior delivered-price economics without inventing observations', () => {
  for (const input of [defaultRotation(), deriveScenario(['SIN', 'BKK', 'NRT'])]) {
    const expected = flightOnly(input);
    input.supplyChain = buildIntegratedNetwork(input, { priceMode: 'demo' });
    const before = JSON.stringify(input);
    const result = optimizeIntegratedRotation(input);
    balances(input, result);
    near(result.totalCostUsd, expected.totalCostUsd, 1e-5);
    near(result.baseline.totalCostUsd, expected.baseline.totalCostUsd, 1e-5);
    assert.equal(JSON.stringify(input), before);
  }
});

test('invalid network values are explicit errors, not unlimited defaults or implicit mode switches', () => {
  const variations = [
    input => { input.supplyChain.suppliers[0].totalCapacityT = Infinity; },
    input => { delete input.supplyChain.suppliers[0].totalCapacityT; },
    input => { input.supplyChain.routes[0].leadTimeStages = 0.5; },
    input => { input.supplyChain.routes[0].capacityT = -1; },
    input => { input.supplyChain.routes[0].airport = 'MISSING'; },
    input => { input.supplyChain.airports[0].initialInventoryT = 101; },
    input => { input.supplyChain.airports[0].terminalInventoryT = 101; },
    input => { input.supplyChain.airports.push({ ...input.supplyChain.airports[0] }); },
    input => { input.supplyChain.suppliers[0].priceUsdPerT = [800]; },
    input => { input.supplyChain.mode = 'delivered'; },
  ];
  for (const change of variations) {
    const input = toy(); change(input);
    const result = optimizeIntegratedRotation(input);
    assert.equal(result.status, 'invalid');
    assert.equal(result.errorDetails[0].code, 'INVALID_SUPPLY_CHAIN');
    assert.equal(result.totalCostUsd, null);
  }
});

test('all-in mode rejects added modeled fees rather than double charging a delivered offer', () => {
  const input = toy();
  input.supplyChain = buildIntegratedNetwork(input, { priceMode: 'quotes' });
  for (const key of ['intoPlaneUsdPerT', 'holdingUsdPerTPerStage', 'taxAdjustmentUsdPerT']) {
    const changed = structuredClone(input); changed.supplyChain.airports[0][key] = 1;
    assert.equal(optimizeIntegratedRotation(changed).status, 'invalid');
  }
});

test('nondimensionalized masses and inverse unit prices cannot erase high-value tiny procurement', () => {
  const unscaled = toy();
  const reference = optimizeIntegratedRotation(unscaled);
  for (const scale of [1e-12, 1e-9, 1e6, 1e12]) {
    const input = structuredClone(unscaled);
    input.initialFuelT *= scale;
    for (const key of ['tankCapacityT', 'maxTakeoffWeightT', 'maxLandingWeightT']) input.aircraft[key] *= scale;
    for (const leg of input.legs) {
      for (const key of ['baseBurnT', 'taxiBurnT', 'reserveT', 'zeroFuelWeightT', 'maxUpliftT']) leg[key] *= scale;
      leg.priceUsdPerT /= scale;
    }
    for (const supplier of input.supplyChain.suppliers) { supplier.capacityT *= scale; supplier.totalCapacityT *= scale; supplier.priceUsdPerT /= scale; }
    for (const airport of input.supplyChain.airports) {
      for (const key of ['initialInventoryT', 'terminalInventoryT', 'storageCapacityT', 'reserveT']) airport[key] *= scale;
      airport.intoPlaneUsdPerT /= scale; airport.holdingUsdPerTPerStage /= scale;
    }
    for (const route of input.supplyChain.routes) { route.capacityT *= scale; route.totalCapacityT *= scale; route.freightUsdPerT /= scale; }
    const result = optimizeIntegratedRotation(input);
    assert.equal(result.feasible, true, `${scale}: ${result.diagnostics.join(' ')}`);
    near(result.totalCostUsd, reference.totalCostUsd);
    near(result.baseline.totalCostUsd, reference.baseline.totalCostUsd);
    near(result.totalUpliftT / scale, reference.totalUpliftT);
    near(sum(result.supplyChain.shipments.map(row => row.quantityT)) / scale, reference.totalUpliftT);
    for (const row of result.supplyChain.airportInventory) near((row.openingT + row.arrivalsT - row.upliftT - row.closingT) / scale, 0, 1e-9);
  }
});

test('a positive all-in price cannot hide negative acquisition credits on unused terminal fuel', () => {
  const input = toy({ stops: ['PVG', 'NRT'], prices: [900] });
  input.supplyChain.suppliers[0].priceUsdPerT = 100;
  input.supplyChain.routes[0].freightUsdPerT = 0;
  input.supplyChain.routes[0].basisAdjustmentUsdPerT = -200;
  input.supplyChain.airports[0].intoPlaneUsdPerT = 110;
  input.supplyChain.airports[0].terminalInventoryT = 20;
  const result = optimizeIntegratedRotation(input);
  assert.equal(result.status, 'invalid');
  assert.equal(result.errorDetails[0].code, 'NEGATIVE_ACQUISITION_COST');
  assert.equal(result.totalCostUsd, null);
});

test('zero-price bounded scenarios do not create nonfinite scaling or an unbounded tie-break', () => {
  const input = toy();
  input.supplyChain.suppliers[0].priceUsdPerT = 0;
  input.supplyChain.routes.forEach(route => { route.freightUsdPerT = 0; });
  const result = optimizeIntegratedRotation(input);
  balances(input, result);
  near(result.totalCostUsd, 0);
  near(result.legs[0].carryFuelT, 0);
  assert.equal(result.savingsPercent, null);
});
