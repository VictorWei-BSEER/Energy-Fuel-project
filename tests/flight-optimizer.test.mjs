import test from "node:test";
import assert from "node:assert/strict";
import {
  baselineRotation,
  optimizeRotation,
  defaultRotation,
} from "../dist/flight-optimizer.js";

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );
function small(prices = [900, 1100], carryBurnRate = 0.02) {
  return {
    initialFuelT: 5,
    aircraft: {
      tankCapacityT: 60,
      maxTakeoffWeightT: 250,
      maxLandingWeightT: 220,
    },
    legs: prices.map((priceUsdPerT, i) => ({
      from: ["PVG", "ICN", "NRT", "HKG", "PEK"][i],
      to: ["ICN", "NRT", "HKG", "PEK", "PVG"][i],
      priceUsdPerT,
      baseBurnT: 8,
      taxiBurnT: 0,
      reserveT: 5,
      carryBurnRate,
      zeroFuelWeightT: 150,
    })),
  };
}

function balances(input, result) {
  assert.equal(result.feasible, true);
  let arrival = input.initialFuelT;
  for (const leg of result.legs) {
    near(leg.arrivalFuelT, arrival);
    near(arrival + leg.upliftT, leg.departureFuelT);
    near(leg.departureFuelT - leg.taxiBurnT, leg.takeoffFuelT);
    near(leg.departureFuelT - leg.burnT, leg.landingFuelT);
    assert.ok(leg.upliftT >= -1e-7);
    assert.ok(leg.departureFuelT <= input.aircraft.tankCapacityT + 1e-7);
    assert.ok(leg.takeoffWeightT <= input.aircraft.maxTakeoffWeightT + 1e-7);
    assert.ok(leg.landingWeightT <= input.aircraft.maxLandingWeightT + 1e-7);
    assert.ok(leg.landingFuelT >= leg.reserveT - 1e-7);
    if (leg.maxUpliftT !== undefined)
      assert.ok(leg.upliftT <= leg.maxUpliftT + 1e-7);
    arrival = leg.landingFuelT;
  }
  near(
    input.initialFuelT + result.totalUpliftT - result.totalBurnT,
    result.finalFuelT,
  );
  if (result.baseline) near(result.finalFuelT, result.baseline.finalFuelT);
}

test("two-leg analytical solution pays for additional carry burn and holds terminal stock equal", () => {
  const input = small();
  const result = optimizeRotation(input);
  balances(input, result);
  near(result.baseline.totalCostUsd, 16000);
  near(result.legs[0].carryFuelT, 8 / 0.98);
  near(result.legs[0].upliftT, 8 + 8 / 0.98);
  near(result.legs[1].upliftT, 0);
  near(result.totalCostUsd, 14546.938775510204);
  near(result.savingsUsd, 1453.061224489796);
  near(result.extraBurnVsBaselineT, 0.163265306122449);
});

test("equal prices or a discount smaller than carry loss produce no discretionary tankering", () => {
  for (const prices of [
    [1000, 1000],
    [990, 1000],
    [1200, 900],
  ]) {
    const input = small(prices);
    const result = optimizeRotation(input);
    balances(input, result);
    near(result.savingsUsd, 0);
    near(result.legs[0].carryFuelT, 0);
  }
});

test("zero carry loss, free prices, and equal-cost ties are deterministic", () => {
  const input = small([1000, 1000], 0);
  near(optimizeRotation(input).legs[0].carryFuelT, 0);
  const free = small([0, 0], 0);
  const result = optimizeRotation(free);
  balances(free, result);
  near(result.totalCostUsd, 0);
  near(result.legs[0].carryFuelT, 0);
  assert.equal(result.savingsPercent, null);
});

test("taxi burn is purchased and tank capacity applies before taxi", () => {
  const input = small();
  input.legs.forEach((leg) => {
    leg.taxiBurnT = 0.3;
  });
  input.aircraft.tankCapacityT = 15;
  const result = optimizeRotation(input);
  balances(input, result);
  near(result.legs[0].departureFuelT, 15);
  assert.ok(result.legs[0].bindingConstraints.includes("油箱容量"));
  near(result.baseline.totalUpliftT, 16.6);
});

test("takeoff and landing weight each independently cap cheap-station carry", () => {
  const takeoff = small();
  takeoff.aircraft.maxTakeoffWeightT = 165;
  const takeoffResult = optimizeRotation(takeoff);
  balances(takeoff, takeoffResult);
  near(takeoffResult.legs[0].carryFuelT, 2);
  assert.ok(takeoffResult.legs[0].bindingConstraints.includes("最大起飞重量"));
  const landing = small();
  landing.aircraft.maxLandingWeightT = 157;
  const landingResult = optimizeRotation(landing);
  balances(landing, landingResult);
  near(landingResult.legs[0].carryFuelT, 2 / 0.98);
  assert.ok(landingResult.legs[0].bindingConstraints.includes("最大落地重量"));
});

test("initial surplus is carried without negative uplift and terminal excess cannot become fictitious savings", () => {
  const input = small([900, 1100]);
  input.initialFuelT = 40;
  const result = optimizeRotation(input);
  balances(input, result);
  near(result.totalUpliftT, 0);
  near(result.savingsUsd, 0);
  assert.ok(result.finalFuelT > 5);
  near(result.finalFuelT, result.baseline.finalFuelT);
});

test("supply limits can require tankering while making the minimum-uplift reference infeasible", () => {
  const input = small();
  input.legs[1].maxUpliftT = 0;
  const result = optimizeRotation(input);
  balances(input, result);
  assert.equal(result.baseline.feasible, false);
  near(result.legs[1].upliftT, 0);
  assert.equal(result.savingsUsd, null);
  assert.match(result.diagnostics.join(" "), /供油上限/);
});

test("insufficient supply or reserve exceeding weight limits returns readable infeasibility", () => {
  const supply = small();
  supply.legs[0].maxUpliftT = 0;
  const unavailable = optimizeRotation(supply);
  assert.equal(unavailable.feasible, false);
  assert.equal(unavailable.status, "infeasible");
  assert.equal(unavailable.totalCostUsd, null);
  assert.match(unavailable.diagnostics.join(" "), /供油/);
  const weight = small();
  weight.aircraft.maxLandingWeightT = 154;
  const overweight = optimizeRotation(weight);
  assert.equal(overweight.status, "infeasible");
  assert.match(overweight.diagnostics.join(" "), /最大落地重量/);
});

test("invalid numeric values are rejected instead of being coerced or silently defaulted", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, null, "900", undefined]) {
    const input = small();
    input.legs[0].priceUsdPerT = value;
    const result = optimizeRotation(input);
    assert.equal(result.status, "invalid");
    assert.ok(result.errors.length);
    assert.equal(result.totalCostUsd, null);
  }
  const rate = small();
  rate.legs[0].carryBurnRate = 1;
  assert.equal(optimizeRotation(rate).status, "invalid");
  const capacity = small();
  capacity.aircraft.tankCapacityT = 0;
  assert.equal(optimizeRotation(capacity).status, "invalid");
  assert.equal(optimizeRotation(null).status, "invalid");
  const gap = small();
  gap.legs[1].from = "HKG";
  assert.equal(optimizeRotation(gap).status, "invalid");
  const sparse = small();
  sparse.legs = Array(2);
  assert.equal(optimizeRotation(sparse).status, "invalid");
});

test("two-to-five legs preserve changing reserves, payloads, and complete fuel balance", () => {
  for (let count = 2; count <= 5; count++) {
    const input = small([900, 1100, 950, 1200, 1000].slice(0, count));
    input.legs.forEach((leg, i) => {
      leg.reserveT = 5 + i * 0.5;
      leg.zeroFuelWeightT = 150 + i;
      leg.taxiBurnT = i * 0.1;
    });
    const result = optimizeRotation(input);
    balances(input, result);
    assert.ok(result.totalCostUsd <= result.baseline.totalCostUsd + 1e-6);
  }
  const tooMany = small();
  tooMany.legs = Array(6).fill(tooMany.legs[0]);
  assert.equal(optimizeRotation(tooMany).status, "invalid");
});

test("default scenario is editable, explicitly synthetic, and does not mutate input", () => {
  const input = defaultRotation();
  const before = JSON.stringify(input);
  const result = optimizeRotation(input);
  balances(input, result);
  assert.equal(JSON.stringify(input), before);
  assert.match(input.scenarioLabel, /演示/);
  assert.equal(baselineRotation(input).feasible, true);
  input.legs[0].priceUsdPerT = 1;
  assert.notEqual(defaultRotation().legs[0].priceUsdPerT, 1);
});


test("fuel units retain numerical resolution and cannot turn tiny negative uplift into savings", () => {
  const reference = optimizeRotation(small());
  for (const scale of [1e-12, 1e-9, 1, 1e6, 1e12]) {
    const input = small();
    input.initialFuelT *= scale;
    for (const key of ["tankCapacityT", "maxTakeoffWeightT", "maxLandingWeightT"]) input.aircraft[key] *= scale;
    for (const leg of input.legs) {
      leg.priceUsdPerT /= scale;
      for (const key of ["baseBurnT", "taxiBurnT", "reserveT", "zeroFuelWeightT"]) leg[key] *= scale;
    }
    const result = optimizeRotation(input);
    assert.equal(result.feasible, true, `scale ${scale}`);
    near(result.totalCostUsd, reference.totalCostUsd);
    for (let i = 0; i < input.legs.length; i++) {
      assert.ok(result.legs[i].upliftT >= 0, `negative uplift at scale ${scale}`);
      near(result.legs[i].upliftT / scale, reference.legs[i].upliftT);
      near(result.legs[i].landingFuelT / scale, reference.legs[i].landingFuelT);
    }
    near((input.initialFuelT + result.totalUpliftT - result.totalBurnT) / scale, result.finalFuelT / scale);
  }
});

test("the unconstrained two-leg decision agrees with the research marginal-delivery threshold", () => {
  const hourlyCoefficient = 0.035;
  const durationHours = 4;
  const retained = 1 - hourlyCoefficient * durationHours;
  const originPrice = 1000;
  const input = small([originPrice, originPrice / retained], hourlyCoefficient * durationHours);
  input.legs.forEach(leg => { leg.baseBurnT = 1; });
  const tied = optimizeRotation(input);
  balances(input, tied);
  near(tied.savingsUsd, 0);
  near(tied.extraBurnVsBaselineT, 0);
  input.legs[1].priceUsdPerT += 10;
  const profitable = optimizeRotation(input);
  balances(input, profitable);
  near(profitable.savingsUsd, 10);
  near(profitable.extraBurnVsBaselineT, 1 / retained - 1);
  near(3.16 * profitable.extraBurnVsBaselineT, 0.5144186046511628);
});
