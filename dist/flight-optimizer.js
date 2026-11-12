/**
 * Fixed-rotation fuel procurement model. All fuel / weights are tonnes;
 * prices are USD per tonne. This is a scenario model, not aircraft performance
 * data. No airport price or aircraft limit in defaultRotation is a live quote.
 *
 * Extra departure fuel e incurs k*e additional airborne burn and delivers
 * (1-k)*e to the next station. The final fuel stock is held equal to the
 * minimum-uplift reference so savings never come from emptying the final tank.
 */
// Fuel feasibility follows floating-point resolution at this problem’s mass
// scale. A fixed tonne tolerance can erase small quantities or admit unloading.
const RELATIVE_MASS_EPS = 64 * Number.EPSILON;
const COST_EPS = 1e-6;
const LABELS = {
  tank: "油箱容量",
  takeoff: "最大起飞重量",
  landing: "最大落地重量",
  supply: "本站供油上限",
  reserve: "到达保留油",
  noUplift: "本站无需加油",
};

const sum = (values) => values.reduce((total, value) => total + value, 0);
const clean = (value) => (value === 0 ? 0 : value);
const cleanCost = (value) => (Math.abs(value) <= COST_EPS ? 0 : value);
function massTolerance(input) {
  const scale = Math.max(
    input.aircraft.tankCapacityT,
    input.initialFuelT,
    ...input.legs.map(leg => leg.taxiBurnT + leg.baseBurnT + leg.reserveT),
  );
  return Math.max(Number.MIN_VALUE, RELATIVE_MASS_EPS * scale);
}
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function empty(status, errors = [], diagnostics = []) {
  return {
    feasible: false,
    status,
    errors,
    diagnostics,
    legs: [],
    totalCostUsd: null,
    totalUpliftT: null,
    totalBurnT: null,
    totalExtraBurnT: null,
    finalFuelT: null,
    terminalTargetFuelT: null,
  };
}

function normalize(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: ["请提供轮转参数对象。"] };
  }
  const check = (value, label, positive = false) => {
    if (!finite(value) || (positive ? value <= 0 : value < 0)) {
      errors.push(`${label}必须是${positive ? "大于零" : "非负"}的有限数值。`);
    }
  };
  check(input.initialFuelT, "初始油量");
  const aircraft = input.aircraft;
  if (!aircraft || typeof aircraft !== "object" || Array.isArray(aircraft)) {
    errors.push("请提供油箱容量、最大起飞重量和最大落地重量。");
  } else {
    check(aircraft.tankCapacityT, "油箱容量", true);
    check(aircraft.maxTakeoffWeightT, "最大起飞重量", true);
    check(aircraft.maxLandingWeightT, "最大落地重量", true);
  }
  if (
    !Array.isArray(input.legs) ||
    input.legs.length < 2 ||
    input.legs.length > 5
  ) {
    errors.push("轮转必须包含 2–5 个连续航段。");
    return { errors };
  }
  const legs = Array.from(input.legs, (raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`第 ${i + 1} 航段参数缺失。`);
      return {};
    }
    const leg = {
      ...raw,
      taxiBurnT: raw.taxiBurnT === undefined ? 0 : raw.taxiBurnT,
    };
    for (const [key, label] of Object.entries({
      priceUsdPerT: "供货价格",
      baseBurnT: "基础航段耗油",
      taxiBurnT: "滑行耗油",
      reserveT: "到达保留油",
      carryBurnRate: "携油损耗比例",
      zeroFuelWeightT: "无油重量",
    }))
      check(leg[key], `第 ${i + 1} 航段${label}`);
    if (finite(leg.carryBurnRate) && leg.carryBurnRate >= 1) {
      errors.push(`第 ${i + 1} 航段携油损耗比例必须小于 1。`);
    }
    if (leg.maxUpliftT !== undefined)
      check(leg.maxUpliftT, `第 ${i + 1} 航段供油上限`);
    for (const key of ["from", "to"]) {
      if (typeof leg[key] !== "string" || !leg[key].trim()) {
        errors.push(
          `第 ${i + 1} 航段${key === "from" ? "出发" : "到达"}机场缺失。`,
        );
      } else leg[key] = leg[key].trim().toUpperCase();
    }
    return leg;
  });
  for (let i = 1; i < legs.length; i++) {
    if (legs[i - 1].to && legs[i].from && legs[i - 1].to !== legs[i].from) {
      errors.push(
        `第 ${i + 1} 航段须从上一航段到达机场 ${legs[i - 1].to} 出发。`,
      );
    }
  }
  if (!errors.length) {
    const largestCosts = legs.map(
      (leg) => aircraft.tankCapacityT * leg.priceUsdPerT,
    );
    if (
      !Number.isFinite(sum(largestCosts)) ||
      legs.some(
        (leg) => !Number.isFinite(leg.taxiBurnT + leg.baseBurnT + leg.reserveT),
      )
    ) {
      errors.push("参数数值范围过大，请使用吨和 USD/吨作为单位。");
    }
  }
  return { errors, input: { ...input, aircraft: { ...aircraft }, legs } };
}

function limits(input, leg) {
  const { aircraft } = input;
  const eta = 1 - leg.carryBurnRate;
  return {
    tank: aircraft.tankCapacityT - leg.taxiBurnT - leg.baseBurnT - leg.reserveT,
    takeoff:
      aircraft.maxTakeoffWeightT -
      leg.zeroFuelWeightT -
      leg.baseBurnT -
      leg.reserveT,
    landing:
      (aircraft.maxLandingWeightT - leg.zeroFuelWeightT - leg.reserveT) / eta,
  };
}

function planFromExtra(input, extra, status = "feasible") {
  const diagnostics = [];
  const { aircraft } = input;
  const EPS = massTolerance(input);
  if (input.initialFuelT > aircraft.tankCapacityT + EPS) {
    diagnostics.push("初始油量超过油箱容量；当前模型不允许卸油。");
  }
  let arrivalFuelT = input.initialFuelT;
  const legs = input.legs.map((leg, i) => {
    const carryFuelT = extra[i] < 0 && extra[i] >= -EPS ? 0 : clean(extra[i]);
    const takeoffFuelT = leg.baseBurnT + leg.reserveT + carryFuelT;
    const departureFuelT = takeoffFuelT + leg.taxiBurnT;
    const rawUpliftT = departureFuelT - arrivalFuelT;
    const upliftT = rawUpliftT < 0 && rawUpliftT >= -EPS ? 0 : clean(rawUpliftT);
    const extraBurnT = leg.carryBurnRate * carryFuelT;
    const burnT = leg.taxiBurnT + leg.baseBurnT + extraBurnT;
    const landingFuelT = leg.reserveT + (1 - leg.carryBurnRate) * carryFuelT;
    const takeoffWeightT = leg.zeroFuelWeightT + takeoffFuelT;
    const landingWeightT = leg.zeroFuelWeightT + landingFuelT;
    const prefix = `${leg.from} → ${leg.to}：`;
    const bindingConstraints = [];
    const checkUpper = (value, upper, label) => {
      if (value > upper + EPS)
        diagnostics.push(
          `${prefix}${label}超限 ${(value - upper).toFixed(3)} 吨。`,
        );
      if (Math.abs(value - upper) <= EPS) bindingConstraints.push(label);
    };
    checkUpper(departureFuelT, aircraft.tankCapacityT, LABELS.tank);
    checkUpper(takeoffWeightT, aircraft.maxTakeoffWeightT, LABELS.takeoff);
    checkUpper(landingWeightT, aircraft.maxLandingWeightT, LABELS.landing);
    if (leg.maxUpliftT !== undefined)
      checkUpper(upliftT, leg.maxUpliftT, LABELS.supply);
    if (upliftT < -EPS)
      diagnostics.push(`${prefix}需要卸油，当前模型只允许非负加油。`);
    if (carryFuelT < -EPS || landingFuelT < leg.reserveT - EPS)
      diagnostics.push(`${prefix}无法满足到达保留油。`);
    if (Math.abs(carryFuelT) <= EPS) bindingConstraints.push(LABELS.reserve);
    if (Math.abs(upliftT) <= EPS) bindingConstraints.push(LABELS.noUplift);
    const row = {
      ...leg,
      arrivalFuelT: clean(arrivalFuelT),
      upliftT,
      departureFuelT,
      takeoffFuelT,
      carryFuelT,
      extraBurnT,
      burnT,
      airborneBurnT: leg.baseBurnT + extraBurnT,
      landingFuelT,
      takeoffWeightT,
      landingWeightT,
      costUsd: upliftT * leg.priceUsdPerT,
      bindingConstraints,
    };
    arrivalFuelT = landingFuelT;
    return row;
  });
  return {
    feasible: diagnostics.length === 0,
    status: diagnostics.length ? "infeasible" : status,
    errors: [],
    diagnostics,
    legs,
    totalCostUsd: sum(legs.map((leg) => leg.costUsd)),
    totalUpliftT: sum(legs.map((leg) => leg.upliftT)),
    totalBurnT: sum(legs.map((leg) => leg.burnT)),
    totalExtraBurnT: sum(legs.map((leg) => leg.extraBurnT)),
    finalFuelT: arrivalFuelT,
    terminalTargetFuelT: arrivalFuelT,
  };
}

function baselineFor(input) {
  let arrival = input.initialFuelT;
  const extra = input.legs.map((leg) => {
    const e = Math.max(
      0,
      arrival - leg.taxiBurnT - leg.baseBurnT - leg.reserveT,
    );
    arrival = leg.reserveT + (1 - leg.carryBurnRate) * e;
    return e;
  });
  return planFromExtra(input, extra);
}

/** Minimum-uplift reference. An infeasible result retains rows for diagnosis. */
export function baselineRotation(rawInput) {
  const parsed = normalize(rawInput);
  if (parsed.errors.length) return empty("invalid", parsed.errors);
  return baselineFor(parsed.input);
}

function solveLinear(rows, rhs) {
  const n = rhs.length;
  const matrix = rows.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col]))
        pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const factor = matrix[col][col];
    for (let j = col; j <= n; j++) matrix[col][j] /= factor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const multiple = matrix[row][col];
      for (let j = col; j <= n; j++)
        matrix[row][j] -= multiple * matrix[col][j];
    }
  }
  const result = matrix.map((row) => clean(row[n]));
  return result.every(Number.isFinite) ? result : null;
}

/**
 * Floating-point vertex enumeration for a bounded, at most five-variable linear model.
 * One equality fixes terminal fuel; enumerate n-1 active inequalities.
 */
export function optimizeRotation(rawInput) {
  const parsed = normalize(rawInput);
  if (parsed.errors.length)
    return {
      ...empty("invalid", parsed.errors),
      baseline: null,
      savingsUsd: null,
      savingsPercent: null,
      extraBurnVsBaselineT: null,
    };
  const input = parsed.input;
  const EPS = massTolerance(input);
  const baseline = baselineFor(input);
  const n = input.legs.length;
  const terminalExtra = baseline.legs[n - 1].carryFuelT;
  const terminalTargetFuelT = baseline.finalFuelT;
  const constraints = [];
  const structural = [];
  const row = () => Array(n).fill(0);
  if (input.initialFuelT > input.aircraft.tankCapacityT + EPS) {
    structural.push("初始油量超过油箱容量；请修正初始油量。");
  }
  input.legs.forEach((leg, i) => {
    const cap = limits(input, leg);
    const upper = Math.min(...Object.values(cap));
    for (const [name, value] of Object.entries(cap)) {
      if (value < -EPS)
        structural.push(
          `${leg.from} → ${leg.to}：最低必要燃油已超过${LABELS[name]}，请调整载荷、保留油或机型。`,
        );
    }
    const lowerRow = row();
    lowerRow[i] = -1;
    constraints.push({ a: lowerRow, b: 0 });
    const upperRow = row();
    upperRow[i] = 1;
    constraints.push({ a: upperRow, b: Math.max(0, upper) });
    const constant =
      leg.taxiBurnT +
      leg.baseBurnT +
      leg.reserveT -
      (i === 0 ? input.initialFuelT : input.legs[i - 1].reserveT);
    const nonnegativeUplift = row();
    nonnegativeUplift[i] = -1;
    if (i > 0) nonnegativeUplift[i - 1] = 1 - input.legs[i - 1].carryBurnRate;
    constraints.push({ a: nonnegativeUplift, b: constant });
    if (leg.maxUpliftT !== undefined) {
      constraints.push({
        a: nonnegativeUplift.map((value) => -value),
        b: leg.maxUpliftT - constant,
      });
    }
  });
  const failure = (diagnostics) => ({
    ...empty("infeasible", [], diagnostics),
    baseline,
    terminalTargetFuelT,
    savingsUsd: null,
    savingsPercent: null,
    extraBurnVsBaselineT: null,
  });
  if (structural.length) return failure(structural);
  const equality = row();
  equality[n - 1] = 1;
  let best = null;
  let bestExtra = null;
  let verticesChecked = 0;
  const consider = (candidate) => {
    if (!candidate || Math.abs(candidate[n - 1] - terminalExtra) > EPS) return;
    if (
      constraints.some(
        (c) =>
          sum(c.a.map((coefficient, i) => coefficient * candidate[i])) >
          c.b + EPS,
      )
    )
      return;
    const plan = planFromExtra(input, candidate, "optimal");
    if (!plan.feasible) return;
    const costDelta = best ? plan.totalCostUsd - best.totalCostUsd : -Infinity;
    const burnDelta = best
      ? plan.totalExtraBurnT - best.totalExtraBurnT
      : -Infinity;
    const carryDelta = best ? sum(candidate) - sum(bestExtra) : -Infinity;
    if (
      !best ||
      costDelta < -COST_EPS ||
      (Math.abs(costDelta) <= COST_EPS &&
        (burnDelta < -EPS || (Math.abs(burnDelta) <= EPS && carryDelta < -EPS)))
    ) {
      best = plan;
      bestExtra = candidate;
    }
  };
  if (baseline.feasible) consider(baseline.legs.map((leg) => leg.carryFuelT));
  const active = [];
  function enumerate(start) {
    if (active.length === n - 1) {
      verticesChecked++;
      consider(
        solveLinear(
          [equality, ...active.map((i) => constraints[i].a)],
          [terminalExtra, ...active.map((i) => constraints[i].b)],
        ),
      );
      return;
    }
    const remaining = n - 1 - active.length;
    for (let i = start; i <= constraints.length - remaining; i++) {
      active.push(i);
      enumerate(i + 1);
      active.pop();
    }
  }
  enumerate(0);
  if (!best)
    return failure([
      "无法在油箱、重量、供油上限和相同终点油量约束下完成该轮转。",
      ...baseline.diagnostics,
    ]);
  const comparable = baseline.feasible;
  best.terminalTargetFuelT = terminalTargetFuelT;
  if (!comparable)
    best.diagnostics.push(
      "逐站按需加油方案受供油上限限制；提前携油可执行，但不计算对不可行基线的节省比例。",
    );
  return {
    ...best,
    baseline,
    savingsUsd: comparable
      ? cleanCost(baseline.totalCostUsd - best.totalCostUsd)
      : null,
    savingsPercent:
      comparable && baseline.totalCostUsd > COST_EPS
        ? (100 * (baseline.totalCostUsd - best.totalCostUsd)) /
          baseline.totalCostUsd
        : null,
    extraBurnVsBaselineT: comparable
      ? clean(best.totalExtraBurnT - baseline.totalExtraBurnT)
      : null,
    solver: {
      method: "bounded-vertex-enumeration",
      verticesChecked,
      variables: n,
    },
  };
}

/** Fresh editable demonstration; all prices and performance values are synthetic. */
export function defaultRotation() {
  return {
    scenarioLabel: "演示情景 · 非实时合同报价 · 非真实机型性能",
    initialFuelT: 8,
    aircraft: {
      name: "宽体机示例参数",
      tankCapacityT: 110,
      maxTakeoffWeightT: 240,
      maxLandingWeightT: 190,
    },
    legs: [
      {
        from: "PVG",
        to: "ICN",
        priceUsdPerT: 860,
        baseBurnT: 7.5,
        taxiBurnT: 0.25,
        reserveT: 8,
        carryBurnRate: 0.018,
        zeroFuelWeightT: 163,
      },
      {
        from: "ICN",
        to: "HND",
        priceUsdPerT: 980,
        baseBurnT: 9.2,
        taxiBurnT: 0.25,
        reserveT: 8,
        carryBurnRate: 0.022,
        zeroFuelWeightT: 161,
      },
      {
        from: "HND",
        to: "PVG",
        priceUsdPerT: 1120,
        baseBurnT: 13.4,
        taxiBurnT: 0.3,
        reserveT: 8,
        carryBurnRate: 0.029,
        zeroFuelWeightT: 164,
      },
    ],
  };
}
