import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLAN_NETWORK, buildDefaultPlan, solvePlan, runScenarios } from '../src/planner.js';

const small = ({ periods = 2, prices = [10, 10], supply = 10, demand = [0, 5], initial = 0, reserve = 0, storage = 20, holding = 0, lead = 1, routeCapacity = 10, freight = 0, handling = 0, basis = 0, financing = 0, budget = null, emissionsCap = null, emissions = 0 } = {}) => ({
  periods, priceCurve: prices,
  suppliers: [{ id: 'S', capacity: supply, basisUsdPerTonne: basis }],
  destinations: [{ id: 'D', demand, initialInventory: initial, reserve, storageCapacity: storage, storageUsdPerTonnePerPeriod: holding }],
  routes: [{ from: 'S', to: 'D', capacity: routeCapacity, leadTime: lead, freightUsdPerTonne: freight, handlingUsdPerTonne: handling, emissionsKgPerTonne: emissions }],
  financingRatePerPeriod: financing, budgetUsd: budget, emissionsCapKg: emissionsCap,
});
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-5, `${message ?? ''}: ${actual} != ${expected}`);

test('one-period shipping lead arrives next period and cannot fulfill earlier demand', () => {
  const result = solvePlan(small({ demand: [2, 5] }));
  assert.equal(result.status, 'shortage');
  assert.equal(result.feasible, false);
  assert.equal(result.unmetDemandTotal, 2);
  assert.deepEqual(result.unmet, [{ id: 'D', period: 1, quantity: 2 }]);
  assert.equal(result.fulfilledDemand, 5);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].departurePeriod, 1);
  assert.equal(result.routes[0].arrivalPeriod, 2);
  assert.equal(result.routes[0].quantity, 5);
  assert.equal(result.totalCost, 50);
});

test('late supply is never treated as a backorder and beyond-horizon departures are excluded', () => {
  const result = solvePlan(small({ demand: [2, 0] }));
  assert.equal(result.unmetDemandTotal, 2);
  assert.equal(result.fulfilledDemand, 0);
  assert.deepEqual(result.routes, []);
  assert.equal(result.totalCost, 0);
  const outside = solvePlan(small({ lead: 2, demand: [0, 5] }));
  assert.equal(outside.unmetDemandTotal, 5);
  assert.deepEqual(outside.routes, []);
});

test('initial stock covers period-one consumption without another purchase and closing reserve persists', () => {
  const result = solvePlan(small({ demand: [5, 5], initial: 7, reserve: 2 }));
  assert.equal(result.feasible, true);
  assert.equal(result.routes[0].quantity, 5);
  assert.equal(result.costBreakdown.procurement, 50);
  assert.deepEqual(result.inventory.map(row => [row.opening, row.arrivals, row.fulfilled, row.closing]), [[7, 0, 5, 2], [2, 5, 5, 2]]);
  assert.deepEqual(result.terminalStock, [{ id: 'D', quantity: 2 }]);
  for (const row of result.inventory) near(row.opening + row.arrivals - row.fulfilled, row.closing, 'stock balance');
});

test('a first-period mandatory reserve without available replenishment is structurally infeasible', () => {
  const result = solvePlan(small({ demand: [0, 0], initial: 0, reserve: 2 }));
  assert.equal(result.status, 'structural-infeasible');
  assert.equal(result.feasible, false);
  assert.equal(result.totalCost, null);
  assert.equal(result.unmetDemandTotal, null);
  assert.equal(result.routes.length, 0);
  assert.ok(result.diagnostics.some(message => /period 1 stock/.test(message)));
});

test('reserve above tank size cannot be manufactured from unlimited unmet variables', () => {
  const result = solvePlan(small({ lead: 0, demand: [0, 0], storage: 3, reserve: 4 }));
  assert.equal(result.status, 'structural-infeasible');
  assert.ok(result.diagnostics.some(message => /reserve exceeds/.test(message)));
});

test('buy early and store when later prices are higher, paying explicit inventory carry', () => {
  const result = solvePlan(small({ prices: [10, 30], demand: [0, 5], lead: 0, holding: 1 }));
  assert.equal(result.feasible, true);
  assert.equal(result.procurement.length, 1);
  assert.equal(result.procurement[0].period, 1);
  assert.equal(result.procurement[0].quantity, 5);
  assert.equal(result.costBreakdown.procurement, 50);
  assert.equal(result.costBreakdown.storage, 5);
  assert.equal(result.totalCost, 55);
  assert.equal(result.inventory[0].closing, 5);
  assert.equal(result.inventory[1].closing, 0);
});

test('high holding costs make just-in-time purchase cheaper', () => {
  const result = solvePlan(small({ prices: [10, 30], demand: [0, 5], lead: 0, holding: 25 }));
  assert.equal(result.feasible, true);
  assert.equal(result.procurement[0].period, 2);
  assert.equal(result.totalCost, 150);
});

test('supply and lane capacity cap dispatch each period, generating accurate shortage', () => {
  const result = solvePlan(small({ demand: [0, 8], supply: 6, routeCapacity: 4 }));
  assert.equal(result.unmetDemandTotal, 4);
  assert.equal(result.fulfilledDemand, 4);
  assert.equal(result.routes[0].quantity, 4);
  assert.ok(result.bindingConstraints.some(row => row.type === 'route'));
});

test('storage capacity is enforced on receipts before consumption, not only closing stock', () => {
  const result = solvePlan(small({ periods: 1, prices: [10], demand: [10], lead: 0, initial: 2, storage: 5 }));
  assert.equal(result.fulfilledDemand, 5);
  assert.equal(result.unmetDemandTotal, 5);
  assert.equal(result.routes[0].quantity, 3);
  assert.equal(result.totalCost, 30);
  assert.ok(result.bindingConstraints.some(row => row.type === 'storage'));
});

test('budget limits service first and the second pass spends only the necessary cost', () => {
  const result = solvePlan(small({ demand: [0, 8], budget: 35 }));
  near(result.fulfilledDemand, 3.5);
  near(result.unmetDemandTotal, 4.5);
  near(result.totalCost, 35);
  assert.equal(result.budgetUsage.remainingUsd, 0);
  assert.equal(result.budgetUsage.utilizationPct, 100);
  assert.ok(result.bindingConstraints.some(row => row.type === 'budget'));
});

test('budget includes freight, handling, storage and both financing components', () => {
  const result = solvePlan(small({ prices: [10, 10], demand: [0, 5], initial: 2, reserve: 2, freight: 3, handling: 1, holding: 2, financing: 0.1, budget: 87 }));
  assert.equal(result.feasible, true);
  assert.deepEqual(result.costBreakdown, { procurement: 50, shipping: 15, handling: 5, storage: 8, financing: 9, total: 87 });
  assert.equal(result.budgetUsage.usedUsd, 87);
});

test('a budget below unavoidable reserve holding cost is structural infeasibility', () => {
  const result = solvePlan(small({ demand: [0, 0], initial: 2, reserve: 2, holding: 2, budget: 7 }));
  assert.equal(result.status, 'structural-infeasible');
  assert.equal(result.totalCost, null);
});

test('transport emissions cap constrains tonnage and is not mislabeled as lifecycle emissions', () => {
  const result = solvePlan(small({ demand: [0, 8], emissions: 3, emissionsCap: 9 }));
  assert.equal(result.fulfilledDemand, 3);
  assert.equal(result.unmetDemandTotal, 5);
  assert.equal(result.emissionsKg, 9);
  assert.ok(result.bindingConstraints.some(row => row.type === 'emissions'));
});

test('repeating-fraction emissions limit preserves the service optimum through both LP passes', () => {
  const result = solvePlan(small({ demand: [0, 8], emissions: 3, emissionsCap: 5 }));
  assert.equal(result.status, 'shortage');
  near(result.fulfilledDemand, 5 / 3);
  near(result.unmetDemandTotal, 19 / 3);
  assert.equal(result.totalCost, 16.67);
  assert.ok(result.emissionsKg <= 5 + 1e-5);
  assert.equal(result.objective.serviceOptimumToleranceTonnes, 1e-7);
});

test('repeating-fraction budget limit does not create false structural or solver infeasibility', () => {
  const result = solvePlan(small({ prices: [3, 3], demand: [0, 8], budget: 5 }));
  assert.equal(result.status, 'shortage');
  near(result.fulfilledDemand, 5 / 3);
  near(result.unmetDemandTotal, 19 / 3);
  assert.equal(result.totalCost, 5);
  assert.ok(result.budgetUsage.usedUsd <= 5);
});

test('a redundant positive emissions cap with zero-emission routes does not cause false infeasibility', () => {
  const input = {
    periods: 2, priceCurve: [56, 50],
    suppliers: [{ id: 'S0', capacity: [2, 2], basisUsdPerTonne: 0 }, { id: 'S1', capacity: [3, 1], basisUsdPerTonne: 3 }],
    destinations: [
      { id: 'D0', demand: [1, 6], initialInventory: 3, reserve: [3, 1], storageCapacity: 10, storageUsdPerTonnePerPeriod: 0.5 },
      { id: 'D1', demand: [5, 8], initialInventory: 3, reserve: [2, 3], storageCapacity: 10, storageUsdPerTonnePerPeriod: 0 },
    ],
    routes: [{ from: 'S0', to: 'D1', capacity: [4, 8], leadTime: 1, freightUsdPerTonne: 3, handlingUsdPerTonne: 2, emissionsKgPerTonne: 0 }],
    financingRatePerPeriod: 0, budgetUsd: 300, emissionsCapKg: 15,
  };
  const result = solvePlan(input);
  assert.equal(result.status, 'shortage');
  assert.equal(result.unmetDemandTotal, 16);
  assert.equal(result.totalCost, 124);
  assert.equal(result.emissionsKg, 0);
  const withoutRedundantCap = solvePlan({ ...input, emissionsCapKg: null });
  assert.equal(result.unmetDemandTotal, withoutRedundantCap.unmetDemandTotal);
  assert.equal(result.totalCost, withoutRedundantCap.totalCost);
});

test('emissions-constrained optimizer selects a cleaner more expensive source to maximize service', () => {
  const input = small({ periods: 1, prices: [10], demand: [5], lead: 0, emissions: 10, emissionsCap: 5 });
  input.suppliers.push({ id: 'CLEAN', capacity: 5, basisUsdPerTonne: 10 });
  input.routes.push({ from: 'CLEAN', to: 'D', capacity: 5, leadTime: 0, freightUsdPerTonne: 0, handlingUsdPerTonne: 0, emissionsKgPerTonne: 1 });
  const result = solvePlan(input);
  assert.equal(result.feasible, true);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].from, 'CLEAN');
  assert.equal(result.totalCost, 100);
  assert.equal(result.emissionsKg, 5);
});

test('lexicographic objective never trades unmet demand for a cheaper feasible service level', () => {
  const input = small({ periods: 1, prices: [100000], demand: [2], lead: 0 });
  const result = solvePlan(input);
  assert.equal(result.feasible, true);
  assert.equal(result.unmetDemandTotal, 0);
  assert.equal(result.totalCost, 200000);
});

test('default four-period plan is feasible and every exported balance reconciles', () => {
  const result = solvePlan(buildDefaultPlan());
  assert.equal(result.status, 'optimal');
  assert.equal(result.totalDemand, 84000);
  assert.equal(result.fulfilledDemand, 84000);
  assert.equal(result.inventory.length, 12);
  assert.equal(result.terminalStock.length, 3);
  assert.equal(result.procurement.reduce((sum, row) => sum + row.quantity, 0), 63000);
  assert.ok(result.routes.every(row => row.arrivalPeriod === row.departurePeriod + 1 && row.arrivalPeriod <= 4));
  for (const row of result.inventory) {
    near(row.opening + row.arrivals - row.fulfilled, row.closing, `${row.destination} P${row.period}`);
    assert.ok(row.opening + row.arrivals <= row.capacity + 1e-5);
    assert.ok(row.closing >= row.reserve - 1e-5);
  }
});

test('one-period default uses owned opening stock and creates no beyond-horizon shipment', () => {
  const result = solvePlan(buildDefaultPlan({ periods: 1 }));
  assert.equal(result.feasible, true);
  assert.equal(result.fulfilledDemand, 21000);
  assert.equal(result.costBreakdown.procurement, 0);
  assert.deepEqual(result.routes, []);
});

test('scenario shocks are independent, retain base inputs and suppress incomplete-service comparisons', () => {
  const input = buildDefaultPlan();
  const before = JSON.stringify(input);
  const output = runScenarios(input);
  assert.equal(output.referenceScenario, 'baseline');
  assert.equal(output.scenarios.length, 3);
  const baseline = output.scenarios.find(item => item.id === 'baseline');
  const gulf = output.scenarios.find(item => item.id === 'gulf-disruption');
  const outage = output.scenarios.find(item => item.id === 'refinery-outage');
  assert.equal(baseline.comparison.comparable, true);
  assert.equal(baseline.comparison.costDifferenceUsd, 0);
  assert.equal(gulf.result.feasible, true);
  assert.ok(gulf.comparison.costDifferenceUsd > 0);
  assert.equal(outage.result.feasible, false);
  assert.equal(outage.comparison.comparable, false);
  assert.equal(outage.comparison.costDifferenceUsd, null);
  assert.ok(outage.comparison.fulfilledDifferenceTonnes < 0);
  assert.equal(JSON.stringify(input), before);
  assert.equal(DEFAULT_PLAN_NETWORK.suppliers[0].capacity, 11000);
});

test('custom period arrays and signed supplier basis are preserved without mutating edits', () => {
  const suppliers = [{ id: 'SIN', capacity: [100, 200], basisUsdPerTonne: -5 }];
  const input = buildDefaultPlan({ periods: 2, suppliers, priceCurve: [100, 120], destinations: [{ id: 'HKG', demand: [50, 60], reserve: [5, 6] }], routes: [{ from: 'SIN', to: 'HKG', capacity: [80, 90], leadTime: 0 }], demandScale: 2 });
  assert.deepEqual(input.suppliers[0].capacity, [100, 200]);
  assert.deepEqual(input.destinations[0].demand, [100, 120]);
  assert.deepEqual(input.destinations[0].reserve, [5, 6]);
  assert.deepEqual(input.priceCurve, [100, 120]);
  assert.equal(input.suppliers[0].basisUsdPerTonne, -5);
  assert.deepEqual(suppliers[0].capacity, [100, 200]);
});

test('invalid horizons, nonfinite inputs, inventory overflow and broken routes fail clearly', () => {
  for (const periods of [0, 13, 1.5, NaN]) assert.throws(() => solvePlan({ ...small(), periods }), RangeError);
  assert.throws(() => solvePlan(small({ prices: [10] })), RangeError);
  assert.throws(() => solvePlan(small({ initial: 21, storage: 20 })), RangeError);
  assert.throws(() => solvePlan(small({ supply: -1 })), RangeError);
  assert.throws(() => solvePlan(small({ emissions: NaN })), RangeError);
  assert.throws(() => solvePlan(small({ lead: 0.5 })), RangeError);
  assert.throws(() => solvePlan(small({ basis: -11 })), RangeError);
  assert.throws(() => solvePlan(small({ budget: -1 })), RangeError);
  const broken = small(); broken.routes[0].to = 'UNKNOWN';
  assert.throws(() => solvePlan(broken), RangeError);
  const duplicate = small(); duplicate.suppliers.push({ ...duplicate.suppliers[0] });
  assert.throws(() => solvePlan(duplicate), RangeError);
});
