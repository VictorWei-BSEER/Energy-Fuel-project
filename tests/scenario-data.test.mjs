import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { airportData } from '../dist/global-airports.js';
import { optimizeRotation } from '../dist/flight-optimizer.js';
import {
  SCENARIO_DEFAULTS, AIRCRAFT_PROFILES, ASSUMPTION_CATALOG,
  airportScenario, buildScenarioDataset, deriveLeg, deriveScenario, greatCircleDistanceKm,
} from '../dist/scenario-data.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('all 67 airports have complete reproducible synthetic components separate from source geography', async () => {
  const dataset = buildScenarioDataset();
  assert.equal(dataset.records.length, 67);
  assert.equal(dataset.observedAt, null);
  assert.equal(dataset.classification, 'synthetic_scenario');
  assert.deepEqual(dataset.records.map(row => row.code), airportData.map(row => row.code));
  for (const row of dataset.records) {
    const source = airportData.find(item => item.code === row.code);
    assert.equal(row.airport.lat, source.lat);
    assert.equal(row.airport.lon, source.lon);
    assert.equal(row.classification, 'synthetic_scenario');
    assert.equal(row.provenance.geography.classification, 'sourced_geography');
    assert.equal(row.components.length, 5);
    near(row.priceUsdPerT, row.components.reduce((total, entry) => total + entry.value, 0));
    assert.ok(row.priceUsdPerT > 0);
    assert.ok(row.design.defaultHypothesis.en && row.design.defaultHypothesis.zh);
    near(row.design.basisPctOfBase, 100 * row.components.find(part => part.key === 'basis').value / row.assumptions.baseJetUsdPerT);
    near(row.design.transportUsdPer1000Km, 1000 * row.assumptions.transportUsdPerTPerKm);
    assert.equal(row.maxUpliftT, 120);
    for (const entry of row.components) {
      assert.ok(entry.label.en && entry.label.zh && entry.formula);
      assert.equal(entry.unit, 'USD/t');
      assert.ok(Number.isFinite(entry.value));
      assert.ok(['analyst_scenario', 'derived_scenario'].includes(entry.classification));
    }
  }
  assert.deepEqual(dataset, buildScenarioDataset());
  const frozen = await readFile(new URL('../dist/data/scenario-dataset.json', import.meta.url), 'utf8');
  assert.equal(frozen, JSON.stringify(dataset, null, 2) + '\n');
  const result = execFileSync(process.execPath, ['scripts/build_scenario_data.mjs', '--check'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.match(result, /Verified 67 deterministic/);
});

test('airport prices respond additively to explicit base, regional, distance, service and fiscal assumptions', () => {
  near(airportScenario('SIN').priceUsdPerT, 845);
  const original = airportScenario('HKG');
  const changed = airportScenario('HKG', {
    pricing: { baseJetUsdPerT: 900, taxAdjustmentUsdPerT: 7 },
    regions: { east_asia: { basisUsdPerT: 105 } },
    airportOverrides: { HKG: { serviceUsdPerT: 63, maxUpliftT: 0 } },
  });
  near(changed.priceUsdPerT - original.priceUsdPerT, 100 + 7 + 20 + 3);
  assert.equal(changed.maxUpliftT, 0);
  const hub = airportScenario('HKG', { airportOverrides: { HKG: { referenceHub: 'HKG' } } });
  near(hub.distanceFromHubKm, 0);
  near(hub.components.find(part => part.key === 'transport').value, 0);
  assert.equal(SCENARIO_DEFAULTS.pricing.baseJetUsdPerT, 800);
  assert.equal(AIRCRAFT_PROFILES.widebody.payloadT, 22);
});

test('route geometry agrees with a separate spherical-law-of-cosines calculation and changes derived burn', () => {
  const a = airportData.find(item => item.code === 'SIN');
  const b = airportData.find(item => item.code === 'NRT');
  const radians = Math.PI / 180;
  const cosine = Math.sin(a.lat * radians) * Math.sin(b.lat * radians)
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.cos((b.lon - a.lon) * radians);
  near(greatCircleDistanceKm(a, b), 6371.0088 * Math.acos(Math.max(-1, Math.min(1, cosine))), 1e-7);
  near(greatCircleDistanceKm('SIN', 'NRT'), greatCircleDistanceKm('NRT', 'SIN'));
  const short = deriveLeg('SIN', 'BKK');
  const long = deriveLeg('SIN', 'NRT');
  assert.ok(short.valid && long.valid);
  assert.ok(long.durationH > short.durationH);
  assert.ok(long.baseBurnT > short.baseBurnT);
  assert.ok(long.carryBurnRate > short.carryBurnRate);
  assert.equal(short.priceUsdPerT, long.priceUsdPerT);
  near(long.derivation.cruiseTimeH, long.distanceKm * 1.05 / 850);
  near(long.baseBurnT, long.derivation.cruiseTimeH * 4.8 + 2);
  near(long.reserveT, Math.max(6, .05 * long.baseBurnT + .5 * 3 + 2));
  near(long.carryBurnRate, 1 - Math.exp(-.025 * long.durationH));
  near(long.zeroFuelWeightT, 128 + 22);
});

test('user aircraft assumptions propagate without changing the sourced geography or shared defaults', () => {
  const original = deriveLeg('SIN', 'NRT', 'narrowbody');
  const modified = deriveLeg('SIN', 'NRT', 'narrowbody', {
    aircraft: { payloadT: 10, routeFactor: 1.1, cruiseBurnTPerH: 2.6, carryModel: 'linear', carryCoefficientPerH: .03 },
  });
  near(modified.distanceKm, original.distanceKm);
  near(modified.zeroFuelWeightT, 52);
  near(modified.carryBurnRate, .03 * modified.durationH);
  assert.ok(modified.baseBurnT > original.baseBurnT);
  assert.equal(AIRCRAFT_PROFILES.narrowbody.payloadT, 12);
  assert.equal(AIRCRAFT_PROFILES.narrowbody.carryModel, 'exponential');
});

test('uncovered stage lengths and impossible minimum fuel remain visible without clipping or automatic repairs', () => {
  const far = deriveLeg('SIN', 'JFK', 'narrowbody');
  assert.equal(far.valid, false);
  assert.ok(far.issues.some(issue => issue.code === 'stage_above_envelope' && issue.scope === 'envelope'));
  assert.ok(far.issues.some(issue => issue.code === 'tank_minimum' && issue.scope === 'minimum-feasibility'));
  assert.ok(far.baseBurnT + far.reserveT + far.taxiBurnT > AIRCRAFT_PROFILES.narrowbody.tankCapacityT);
  const nearAirports = deriveLeg('PVG', 'SHA', 'widebody');
  assert.equal(nearAirports.valid, false);
  assert.ok(nearAirports.issues.some(issue => issue.code === 'stage_below_envelope'));
  const loss = deriveLeg('SIN', 'NRT', 'widebody', { aircraft: { carryModel: 'linear', carryCoefficientPerH: 1 } });
  assert.ok(loss.carryBurnRate >= 1);
  assert.ok(loss.issues.some(issue => issue.code === 'carriage_retention_nonpositive'));
});

test('user-chosen one-to-five-leg routes pass through the same optimizer and preserve mass and terminal stock', () => {
  const routes = [
    ['SIN', 'BKK'], ['HKG', 'SIN', 'NRT'], ['JFK', 'LHR', 'DXB', 'SIN'],
    ['SIN', 'DXB', 'LHR', 'JFK', 'LAX'], ['SIN', 'BKK', 'HKG', 'ICN', 'NRT', 'SIN'],
  ];
  for (const route of routes) {
    const input = deriveScenario(route);
    assert.equal(input.valid, true, input.errors.join(' '));
    const result = optimizeRotation(input);
    assert.equal(result.feasible, true, result.diagnostics.join(' '));
    near(input.initialFuelT + result.totalUpliftT - result.totalBurnT, result.finalFuelT, 1e-7);
    near(result.finalFuelT, result.baseline.finalFuelT, 1e-7);
    assert.ok(result.totalCostUsd <= result.baseline.totalCostUsd + 1e-6);
    if (route.length === 2) near(result.savingsUsd, 0);
  }
  const one = deriveScenario([{ from: 'SIN', to: 'BKK' }], 'narrowbody');
  assert.equal(one.legs.length, 1);
  assert.equal(one.aircraft.profileKey, 'narrowbody');
  const noSupply = deriveScenario(['SIN', 'BKK'], 'narrowbody', { initialFuelT: 0, airportOverrides: { SIN: { maxUpliftT: 0 } } });
  assert.equal(optimizeRotation(noSupply).feasible, false);
});

test('all airport pairs generate finite explanatory values or explicit envelope failures', () => {
  let inside = 0, outside = 0;
  for (const from of airportData) for (const to of airportData) {
    if (from.code === to.code) continue;
    for (const profile of ['widebody', 'narrowbody']) {
      const leg = deriveLeg(from.code, to.code, profile);
      for (const field of ['priceUsdPerT', 'baseBurnT', 'taxiBurnT', 'reserveT', 'carryBurnRate', 'zeroFuelWeightT', 'maxUpliftT', 'distanceKm', 'durationH']) assert.ok(Number.isFinite(leg[field]), `${from.code} ${to.code} ${profile} ${field}`);
      assert.ok(leg.carryBurnRate >= 0 && leg.carryBurnRate < 1);
      if (leg.valid) inside++; else { outside++; assert.ok(leg.errors.length); }
    }
  }
  assert.ok(inside > 0 && outside > 0);
  assert.equal(inside + outside, 67 * 66 * 2);
});

test('invalid routes, mismatched units, unknown overrides and overflowing formulas are rejected', () => {
  for (const route of [[], ['SIN'], ['SIN', 'SIN'], ['SIN', 'XXX'], ['SIN', 'BKK', 'HKG', 'ICN', 'NRT', 'SIN', 'DXB'], [{ from: 'SIN', to: 'BKK' }, { from: 'NRT', to: 'HKG' }]]) assert.throws(() => deriveScenario(route), RangeError);
  for (const options of [
    { pricing: { baseJetUsdPerT: '800' } }, { pricing: { baseJetUsdPerT: Number.MIN_VALUE } }, { pricing: { baseJetUsdPerT: -1 } },
    { pricing: { taxAdjustmentUsdPerT: -10000 } }, { pricing: { guessedPrice: 900 } },
    { airportOverrides: { XXX: { maxUpliftT: 1 } } }, { regions: { invented: {} } },
    { aircraft: { cruiseSpeedKph: 0 } }, { aircraft: { routeFactor: .5 } },
    { aircraft: { cruiseBurnTPerH: Infinity } }, { aircraft: { carryCoefficientPerH: 1e308 } },
    { aircraft: { carryModel: 'secret-rule' } }, { aircraft: { label: { en: 'Certified' } } },
    { aircraft: { minStageKm: 10000, maxStageKm: 100 } },
  ]) assert.throws(() => deriveLeg('SIN', 'NRT', 'widebody', options));
  assert.throws(() => deriveScenario(['SIN', 'NRT'], 'certified-aircraft'), RangeError);
  assert.throws(() => greatCircleDistanceKm({ lat: 91, lon: 0 }, { lat: 0, lon: 0 }), RangeError);
  assert.ok(ASSUMPTION_CATALOG.every(field => field.key && field.label.en && field.label.zh && field.unit && field.replacementSource));
});
