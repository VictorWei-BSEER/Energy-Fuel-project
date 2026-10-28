import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRPORTS, SCENARIOS, calculateTankering, getMarketSnapshot } from '../dist/model.js';

test('a profitable purchase accounts for fuel burned while carrying extra fuel', () => {
  const result = calculateTankering({ originPrice: 800, destinationPrice: 1000, extraTonnes: 10, burnPenaltyPct: 4, handlingCost: 100 });
  assert.equal(result.burnTonnes, 0.4);
  assert.equal(result.deliveredTonnes, 9.6);
  assert.equal(result.originCost, 8000);
  assert.equal(result.avoidedDestinationCost, 9600);
  assert.equal(result.netSavings, 1500);
  assert.equal(result.breakEvenPrice, 843.75);
  assert.equal(result.profitable, true);
});

test('equal prices lose money because carrying fuel consumes additional fuel', () => {
  const result = calculateTankering({ originPrice: 800, destinationPrice: 800, extraTonnes: 10, burnPenaltyPct: 4 });
  assert.equal(result.netSavings, -320);
  assert.equal(result.profitable, false);
});

test('handling fees can eliminate an otherwise profitable price spread', () => {
  const result = calculateTankering({ originPrice: 800, destinationPrice: 850, extraTonnes: 10, burnPenaltyPct: 4, handlingCost: 200 });
  assert.equal(result.netSavings, -40);
  assert.equal(result.profitable, false);
});

test('zero uplift is a no-action choice, without handling costs', () => {
  const result = calculateTankering({ originPrice: 800, destinationPrice: 1000, extraTonnes: 0, handlingCost: 100 });
  assert.equal(result.netSavings, 0);
  assert.equal(result.handlingCost, 0);
  assert.equal(result.breakEvenPrice, null);
  assert.equal(result.profitable, false);
});

test('no carrying penalty at equal prices produces exactly zero savings', () => {
  assert.equal(calculateTankering({ originPrice: 800, destinationPrice: 800, burnPenaltyPct: 0 }).netSavings, 0);
});

test('invalid prices, quantities, penalties and nonfinite values are rejected', () => {
  const valid = { originPrice: 800, destinationPrice: 1000, extraTonnes: 10, burnPenaltyPct: 4, handlingCost: 0 };
  for (const field of Object.keys(valid)) {
    for (const value of [-1, NaN, Infinity, '100', null]) {
      assert.throws(() => calculateTankering({ ...valid, [field]: value }), RangeError, `${field}=${value}`);
    }
  }
  assert.throws(() => calculateTankering({ ...valid, burnPenaltyPct: 100 }), RangeError);
  assert.throws(() => calculateTankering({ ...valid, extraTonnes: Number.MAX_VALUE }), RangeError);
  assert.throws(() => calculateTankering(), RangeError);
});

test('simulation is deterministic and does not mutate the base data', () => {
  const original = JSON.stringify(AIRPORTS);
  assert.deepEqual(getMarketSnapshot({ tick: 20 }), getMarketSnapshot({ tick: 20 }));
  assert.notDeepEqual(getMarketSnapshot({ tick: 20 }).airports, getMarketSnapshot({ tick: 21 }).airports);
  assert.equal(JSON.stringify(AIRPORTS), original);
  const snapshot = getMarketSnapshot();
  assert.equal(snapshot.synthetic, true);
  assert.ok(snapshot.airports.every(item => item.synthetic && item.price === item.basePrice));
  assert.equal(snapshot.minPrice, 782);
  assert.equal(snapshot.maxPrice, 934);
});

test('Gulf shock raises assumed prices and risk for every represented airport', () => {
  const base = getMarketSnapshot({ tick: 3 });
  const stressed = getMarketSnapshot({ tick: 3, scenario: 'gulf-disruption' });
  for (let i = 0; i < base.airports.length; i++) {
    assert.ok(stressed.airports[i].price > base.airports[i].price);
    assert.ok(stressed.airports[i].risk > base.airports[i].risk);
  }
});

test('Singapore outage has the largest relative price impact at Singapore', () => {
  const snapshot = getMarketSnapshot({ scenario: 'refinery-outage' });
  const mostAffected = [...snapshot.airports].sort((a, b) => b.changePct - a.changePct)[0];
  assert.equal(mostAffected.code, 'SIN');
  assert.equal(mostAffected.changePct, 23);
});

test('all scenarios are supported and unknown scenarios or invalid ticks fail', () => {
  for (const scenario of SCENARIOS) assert.equal(getMarketSnapshot({ scenario: scenario.id }).scenario, scenario.id);
  assert.throws(() => getMarketSnapshot({ scenario: 'live' }), RangeError);
  assert.throws(() => getMarketSnapshot({ scenario: '__proto__' }), RangeError);
  for (const tick of [-1, 0.5, NaN, Infinity]) assert.throws(() => getMarketSnapshot({ tick }), RangeError);
});
