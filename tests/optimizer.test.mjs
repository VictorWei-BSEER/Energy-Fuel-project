import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NETWORK, SCENARIOS, makeScenario, optimizeNetwork } from '../dist/optimizer.js';

const route = (from, to, shippingUsdPerTonne, capacity = 1) => ({ from, to, capacity, shippingUsdPerTonne });
const counterexample = () => ({
  benchmarkUsdPerTonne: 0,
  supplies: [{ id: 'A', capacity: 1 }, { id: 'B', capacity: 1 }],
  demands: [{ id: 'X', demand: 1 }, { id: 'Y', demand: 1 }],
  routes: [route('A', 'X', 1), route('A', 'Y', 2), route('B', 'X', 2), route('B', 'Y', 100)],
});

test('residual rerouting finds cost 4 where shipping-first greedy costs 101', () => {
  const result = optimizeNetwork(counterexample());
  assert.equal(result.feasible, true);
  assert.equal(result.totalCost, 4);
  assert.equal(result.delivered, 2);
  assert.deepEqual(result.routes.map(({ from, to, quantity }) => [from, to, quantity]), [['A', 'Y', 1], ['B', 'X', 1]]);
  assert.equal(result.baseline.feasible, true);
  assert.equal(result.baseline.totalCost, 101);
  assert.equal(result.baseline.savings, 97);
});

test('a feasible optimum is not compared to an infeasible greedy allocation', () => {
  const input = counterexample();
  input.routes = input.routes.filter(item => !(item.from === 'B' && item.to === 'Y'));
  const result = optimizeNetwork(input);
  assert.equal(result.feasible, true);
  assert.equal(result.totalCost, 4);
  assert.equal(result.baseline.feasible, false);
  assert.equal(result.baseline.totalCost, null);
  assert.equal(result.baseline.savings, null);
  assert.equal(result.baseline.comparable, false);
});

test('supply shortage produces maximum partial delivery and explicit unmet demand', () => {
  const result = optimizeNetwork({ benchmarkUsdPerTonne: 100, supplies: [{ id: 'A', capacity: 3 }], demands: [{ id: 'X', demand: 5 }], routes: [route('A', 'X', 10, 10)] });
  assert.equal(result.feasible, false);
  assert.equal(result.delivered, 3);
  assert.equal(result.unmetDemandTotal, 2);
  assert.deepEqual(result.unmetDemand, [{ id: 'X', quantity: 2 }]);
  assert.equal(result.totalCost, 330);
  assert.equal(result.baseline.savings, null);
  assert.ok(result.bindingConstraints.some(item => item.type === 'supply' && item.id === 'A'));
});

test('route capacity is enforced even when aggregate supply is sufficient', () => {
  const result = optimizeNetwork({ benchmarkUsdPerTonne: 100, supplies: [{ id: 'A', capacity: 10 }], demands: [{ id: 'X', demand: 6 }], routes: [route('A', 'X', 10, 4)] });
  assert.equal(result.feasible, false);
  assert.equal(result.delivered, 4);
  assert.equal(result.unmetDemandTotal, 2);
  assert.ok(result.bindingConstraints.some(item => item.type === 'route' && item.capacity === 4));
});

test('inventory offsets consumption only after maintaining the closing reserve', () => {
  const result = optimizeNetwork({ benchmarkUsdPerTonne: 100, supplies: [{ id: 'A', capacity: 5, basisUsdPerTonne: -10 }], demands: [{ id: 'X', demand: 10, inventory: 7, reserve: 2 }], routes: [{ ...route('A', 'X', 10, 5), handlingUsdPerTonne: 2, storageUsdPerTonne: 3 }] });
  assert.equal(result.feasible, true);
  assert.equal(result.requiredDemand, 5);
  assert.equal(result.delivered, 5);
  assert.equal(result.totalCost, 525);
  assert.deepEqual(result.costBreakdown, { benchmark: 500, basis: -50, shipping: 50, handling: 10, storage: 15, total: 525 });
  assert.equal(7 + result.delivered - 10, 2);
});

test('sufficient opening inventory needs no purchases, including for empty supply networks', () => {
  const result = optimizeNetwork({ benchmarkUsdPerTonne: 100, supplies: [], demands: [{ id: 'X', demand: 10, inventory: 15, reserve: 2 }], routes: [] });
  assert.equal(result.feasible, true);
  assert.equal(result.requiredDemand, 0);
  assert.equal(result.totalCost, 0);
  assert.equal(result.baseline.savings, 0);
  assert.equal(result.baseline.savingsPct, null);
});

test('fractional tonne flows respect supply, route and demand constraints', () => {
  const result = optimizeNetwork({ benchmarkUsdPerTonne: 10, supplies: [{ id: 'A', capacity: 1.5 }], demands: [{ id: 'X', demand: 0.75 }, { id: 'Y', demand: 0.75 }], routes: [route('A', 'X', 0, 1), route('A', 'Y', 0, 1)] });
  assert.equal(result.feasible, true);
  assert.equal(result.totalCost, 15);
  assert.equal(result.routes[0].quantity, 0.75);
  assert.equal(result.routes[1].quantity, 0.75);
});

test('default allocation is feasible and all reported route/supply capacities hold', () => {
  const input = makeScenario({ benchmarkUsdPerTonne: 850 });
  const result = optimizeNetwork(input);
  assert.equal(result.feasible, true);
  assert.equal(result.requiredDemand, 20100);
  assert.ok(input.supplies.some(item => item.id === 'ULS' && item.city === 'Ulsan'));
  assert.ok(input.demands.some(item => item.id === 'TYO' && item.city === 'Tokyo'));
  assert.ok(input.routes.every(item => !['ICN', 'NRT'].includes(item.from) && !['ICN', 'NRT'].includes(item.to)));
  assert.match(input.assumptions.hubIdentifiers, /not official port codes/);
  assert.equal(result.baseline.feasible, true);
  assert.ok(result.totalCost <= result.baseline.totalCost);
  for (const item of result.routes) assert.ok(item.quantity <= item.capacity);
  for (const item of result.supplyUsed) assert.ok(item.used <= item.capacity);
  assert.equal(result.costBreakdown.total, result.totalCost);
});

test('Singapore outage scales edited supply and exposes a real capacity shortfall', () => {
  const input = makeScenario({ scenario: 'refinery-outage' });
  const result = optimizeNetwork(input);
  assert.equal(input.supplies.find(item => item.id === 'SIN').capacity, 2750);
  assert.equal(result.feasible, false);
  assert.equal(result.unmetDemandTotal, 1350);
  assert.equal(result.baseline.savings, null);
});

test('Gulf stress applies disclosed basis, supply and shipping assumptions', () => {
  const baseline = makeScenario();
  const stressed = makeScenario({ scenario: 'gulf-disruption' });
  assert.equal(stressed.supplies[0].capacity, baseline.supplies[0].capacity * 0.8);
  assert.equal(stressed.supplies[1].capacity, baseline.supplies[1].capacity * 0.75);
  assert.equal(stressed.supplies[0].basisUsdPerTonne, baseline.supplies[0].basisUsdPerTonne + 80);
  assert.equal(stressed.routes[0].shippingUsdPerTonne, baseline.routes[0].shippingUsdPerTonne * 1.2);
  assert.ok(optimizeNetwork(stressed).totalCost > optimizeNetwork(baseline).totalCost);
});

test('edits and demand scaling compose without mutating defaults or caller records', () => {
  const before = JSON.stringify(DEFAULT_NETWORK);
  const edits = [{ id: 'HKG', demand: 7000, inventory: 1500, reserve: 1000 }];
  const input = makeScenario({ demands: edits, demandScale: 1.2, supplies: [{ id: 'SIN', capacity: 12000 }], routes: [{ from: 'SIN', to: 'HKG', capacity: 9000 }] });
  assert.equal(input.demands[0].demand, 8400);
  assert.equal(input.demands[0].inventory, 1500);
  assert.equal(input.supplies[0].basisUsdPerTonne, -12);
  assert.equal(optimizeNetwork(input).requiredDemand, 7900);
  assert.equal(edits[0].demand, 7000);
  assert.equal(JSON.stringify(DEFAULT_NETWORK), before);
});

test('invalid numeric data, duplicate IDs, broken routes and unknown scenarios are rejected', () => {
  assert.throws(() => optimizeNetwork({ ...counterexample(), benchmarkUsdPerTonne: NaN }), RangeError);
  assert.throws(() => optimizeNetwork({ ...counterexample(), supplies: [{ id: 'A', capacity: -1 }] }), RangeError);
  assert.throws(() => optimizeNetwork({ ...counterexample(), supplies: [{ id: 'A', capacity: 1 }, { id: 'A', capacity: 1 }] }), RangeError);
  assert.throws(() => optimizeNetwork({ ...counterexample(), routes: [route('unknown', 'X', 1)] }), RangeError);
  assert.throws(() => optimizeNetwork({ ...counterexample(), routes: [route('A', 'X', 1), route('A', 'X', 1)] }), RangeError);
  assert.throws(() => optimizeNetwork({ ...counterexample(), supplies: [{ id: 'A', capacity: 1, basisUsdPerTonne: -1 }] }), RangeError);
  assert.throws(() => makeScenario({ scenario: 'observed' }), RangeError);
  assert.throws(() => makeScenario({ demandScale: -1 }), RangeError);
  assert.ok(SCENARIOS.every(item => makeScenario({ scenario: item.id }).scenario === item.id));
});
