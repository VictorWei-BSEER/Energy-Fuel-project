import solver from 'javascript-lp-solver';

/**
 * Continuous, single-product, multi-period procurement and distribution LP.
 * All physical network parameters are assumptions unless replaced by audited
 * user inputs. Hub IDs are illustrative internal IDs, not official port codes.
 * Quantities: metric tonnes; prices: USD/t; emissions: kg CO2e of transport.
 */
const EPS = 1e-5;
// The library rounds returned variables to 1e-9. A tiny service band avoids
// making the second solve infeasible for repeating-fraction first-pass optima.
const SERVICE_TOLERANCE = 1e-7;
const clean = value => Math.abs(value) < 1e-8 ? 0 : value;
const qty = value => Number(clean(value).toFixed(6));
const money = value => Number(clean(value).toFixed(2));
const clone = value => structuredClone(value);
const frozen = rows => Object.freeze(rows.map(row => Object.freeze(row)));

export const DEFAULT_PLAN_NETWORK = Object.freeze({
  suppliers: frozen([
    { id: 'SIN', name: 'Singapore', city: 'Singapore', lat: 1.264, lon: 103.84, capacity: 11000, basisUsdPerTonne: -12 },
    { id: 'ULS', name: 'Ulsan', city: 'Ulsan', lat: 35.502, lon: 129.387, capacity: 9000, basisUsdPerTonne: 14 },
    { id: 'PVG', name: 'Shanghai', city: 'Shanghai', lat: 31.25, lon: 121.6, capacity: 7000, basisUsdPerTonne: 24 },
  ]),
  destinations: frozen([
    { id: 'HKG', name: 'Hong Kong', city: 'Hong Kong', lat: 22.30, lon: 114.16, demand: 6000, initialInventory: 6700, reserve: 700, storageCapacity: 18000, storageUsdPerTonnePerPeriod: 3 },
    { id: 'TYO', name: 'Tokyo Bay', city: 'Tokyo', lat: 35.60, lon: 139.80, demand: 10000, initialInventory: 11200, reserve: 1200, storageCapacity: 26000, storageUsdPerTonnePerPeriod: 3 },
    { id: 'MNL', name: 'Manila', city: 'Manila', lat: 14.58, lon: 120.97, demand: 5000, initialInventory: 5500, reserve: 500, storageCapacity: 15000, storageUsdPerTonnePerPeriod: 3 },
  ]),
  routes: frozen([
    { from: 'SIN', to: 'HKG', capacity: 6500, leadTime: 1, freightUsdPerTonne: 28, handlingUsdPerTonne: 6, emissionsKgPerTonne: 18 },
    { from: 'SIN', to: 'TYO', capacity: 7000, leadTime: 1, freightUsdPerTonne: 48, handlingUsdPerTonne: 6, emissionsKgPerTonne: 33 },
    { from: 'SIN', to: 'MNL', capacity: 5500, leadTime: 1, freightUsdPerTonne: 23, handlingUsdPerTonne: 6, emissionsKgPerTonne: 16 },
    { from: 'ULS', to: 'HKG', capacity: 4000, leadTime: 1, freightUsdPerTonne: 32, handlingUsdPerTonne: 6, emissionsKgPerTonne: 19 },
    { from: 'ULS', to: 'TYO', capacity: 9000, leadTime: 1, freightUsdPerTonne: 16, handlingUsdPerTonne: 6, emissionsKgPerTonne: 8 },
    { from: 'ULS', to: 'MNL', capacity: 4000, leadTime: 1, freightUsdPerTonne: 35, handlingUsdPerTonne: 6, emissionsKgPerTonne: 22 },
    { from: 'PVG', to: 'HKG', capacity: 6000, leadTime: 1, freightUsdPerTonne: 18, handlingUsdPerTonne: 6, emissionsKgPerTonne: 12 },
    { from: 'PVG', to: 'TYO', capacity: 5000, leadTime: 1, freightUsdPerTonne: 27, handlingUsdPerTonne: 6, emissionsKgPerTonne: 15 },
    { from: 'PVG', to: 'MNL', capacity: 4000, leadTime: 1, freightUsdPerTonne: 30, handlingUsdPerTonne: 6, emissionsKgPerTonne: 18 },
  ]),
  financingRatePerPeriod: 0.004,
});

export const PLAN_SCENARIOS = frozen([
  { id: 'baseline', name: 'Base case', description: 'Current editable network assumptions and selected benchmark price curve.' },
  { id: 'gulf-disruption', name: 'Gulf supply shock', description: 'Assumption: basis +$80/t, Singapore capacity −20%, Ulsan −25%, Shanghai −10%, freight +20% throughout the horizon.' },
  { id: 'refinery-outage', name: 'Singapore outage', description: 'Assumption: Singapore capacity −75% and its basis +$65/t throughout the horizon.' },
]);
export const SCENARIOS = PLAN_SCENARIOS;

function numeric(value, name, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && value < 0)) throw new RangeError(`${name} must be a finite ${signed ? '' : 'non-negative '}number.`);
  return value;
}
function list(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  return value;
}
function series(value, periods, name, fallback = undefined) {
  const chosen = value ?? fallback;
  const result = Array.isArray(chosen) ? [...chosen] : Array(periods).fill(chosen);
  if (result.length !== periods) throw new RangeError(`${name} must contain exactly ${periods} period values.`);
  return result.map((item, i) => numeric(item, `${name}[${i + 1}]`));
}
function horizon(value) {
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new RangeError('periods must be an integer from 1 to 12.');
  return value;
}
function optionalLimit(value, name) { return value === null || value === undefined ? null : numeric(value, name); }

function applyScenario(base, scenario) {
  const selected = PLAN_SCENARIOS.find(item => item.id === scenario);
  if (!selected) throw new RangeError(`Unknown scenario: ${scenario}`);
  const result = clone(base);
  result.scenario = scenario;
  result.suppliers = result.suppliers.map(item => {
    const multiplier = scenario === 'gulf-disruption' ? ({ SIN: 0.8, ULS: 0.75, PVG: 0.9 })[item.id] ?? 0.85 : scenario === 'refinery-outage' && item.id === 'SIN' ? 0.25 : 1;
    const basisChange = scenario === 'gulf-disruption' ? 80 : scenario === 'refinery-outage' && item.id === 'SIN' ? 65 : 0;
    return { ...item, capacity: item.capacity.map(value => value * multiplier), basisUsdPerTonne: item.basisUsdPerTonne + basisChange };
  });
  result.routes = result.routes.map(item => ({ ...item, freightUsdPerTonne: item.freightUsdPerTonne * (scenario === 'gulf-disruption' ? 1.2 : 1) }));
  result.assumptions = { ...result.assumptions, scenario: selected.description };
  return result;
}

/** Build fresh period arrays; edits are base inputs, so scenario shocks do not compound. */
export function buildDefaultPlan({
  periods = 4,
  benchmarkUsdPerTonne = 850,
  priceCurve,
  suppliers = DEFAULT_PLAN_NETWORK.suppliers,
  destinations = DEFAULT_PLAN_NETWORK.destinations,
  routes = DEFAULT_PLAN_NETWORK.routes,
  financingRatePerPeriod = DEFAULT_PLAN_NETWORK.financingRatePerPeriod,
  budgetUsd = null,
  emissionsCapKg = null,
  demandScale = 1,
  scenario = 'baseline',
} = {}) {
  horizon(periods);
  numeric(benchmarkUsdPerTonne, 'benchmarkUsdPerTonne');
  numeric(demandScale, 'demandScale');
  const base = {
    periods,
    priceCurve: series(priceCurve ?? benchmarkUsdPerTonne, periods, 'priceCurve'),
    suppliers: list(suppliers, 'suppliers').map(item => {
      const merged = { ...DEFAULT_PLAN_NETWORK.suppliers.find(row => row.id === item.id), ...item };
      return { ...merged, capacity: series(merged.capacity, periods, `${item.id}.capacity`), basisUsdPerTonne: merged.basisUsdPerTonne ?? 0 };
    }),
    destinations: list(destinations, 'destinations').map(item => {
      const merged = { ...DEFAULT_PLAN_NETWORK.destinations.find(row => row.id === item.id), ...item };
      return { ...merged, demand: series(merged.demand, periods, `${item.id}.demand`).map(value => value * demandScale), reserve: series(merged.reserve, periods, `${item.id}.reserve`, 0) };
    }),
    routes: list(routes, 'routes').map(item => {
      const merged = { ...DEFAULT_PLAN_NETWORK.routes.find(row => row.from === item.from && row.to === item.to), ...item };
      return { ...merged, capacity: series(merged.capacity, periods, `${item.from}→${item.to}.capacity`) };
    }),
    financingRatePerPeriod,
    budgetUsd,
    emissionsCapKg,
    assumptions: {
      data: 'Physical quantities, basis, freight, lead times, storage, finance and emissions factors are estimates. A public benchmark remains a geographic proxy, not a delivered Asian quote.',
      hubIdentifiers: 'Illustrative internal hub IDs, not official port codes.',
      periods: 'Equal user-defined planning periods. Departures at period start; integer lead time; arrivals before consumption. No starting cargo in transit.',
      priceCurve: priceCurve ? 'User-specified future benchmark curve; a scenario assumption, not observed forward quotes.' : 'Flat future benchmark curve; a scenario assumption, not a forecast or observed forward market.',
      inventory: 'Initial inventory is already owned and is not repurchased. Opening inventory plus arrivals cannot exceed storage capacity; every closing balance meets its reserve. Demand not fulfilled in its own period is lost demand, not a backorder.',
      cost: 'Procurement is paid on dispatch. Freight/handling charged per dispatched tonne. Storage charged on closing inventory, including terminal reserves. No terminal salvage credit.',
      financing: 'Simple financing on procurement value for transit periods, plus closing inventory valued at that period benchmark. Existing initial stock incurs holding/financing, but no purchase charge.',
      emissions: 'Estimated transport emissions only: dispatched tonnes × route factor. No production, storage or upstream lifecycle emissions.',
      objective: 'Lexicographic continuous LP: first minimize total unmet tonnes under every cap; preserve that optimum within 0.0000001 t numerical tolerance and then minimize full cost. No penalty big-M.',
      limits: 'Single product; divisible cargo. No vessel lots, quality blending, source inventories, contract take-or-pay, taxes, hedging, credit or intra-period scheduling.',
    },
  };
  return applyScenario(normalize(base), scenario);
}

function normalize(input) {
  if (!input || typeof input !== 'object') throw new TypeError('A planner input object is required.');
  const periods = horizon(input.periods);
  const priceCurve = series(input.priceCurve, periods, 'priceCurve');
  const ids = new Set();
  function id(value) {
    if (typeof value !== 'string' || !value.trim() || ids.has(value)) throw new RangeError('Supplier and destination IDs must be nonempty and unique.');
    ids.add(value);
    return value;
  }
  const suppliers = list(input.suppliers, 'suppliers').map(item => {
    const identifier = id(item.id);
    const basis = numeric(item.basisUsdPerTonne ?? 0, `${identifier}.basisUsdPerTonne`, true);
    if (priceCurve.some(value => value + basis < 0 || !Number.isFinite(value + basis))) throw new RangeError(`${identifier}: benchmark plus basis must be finite and non-negative in every period.`);
    return { ...clone(item), capacity: series(item.capacity, periods, `${identifier}.capacity`), basisUsdPerTonne: basis };
  });
  const destinations = list(input.destinations, 'destinations').map(item => {
    const identifier = id(item.id);
    const initialInventory = numeric(item.initialInventory ?? 0, `${identifier}.initialInventory`);
    const storageCapacity = numeric(item.storageCapacity, `${identifier}.storageCapacity`);
    if (initialInventory > storageCapacity) throw new RangeError(`${identifier}: initial inventory exceeds storage capacity.`);
    return { ...clone(item), demand: series(item.demand, periods, `${identifier}.demand`), reserve: series(item.reserve, periods, `${identifier}.reserve`, 0), initialInventory, storageCapacity, storageUsdPerTonnePerPeriod: numeric(item.storageUsdPerTonnePerPeriod ?? 0, `${identifier}.storageUsdPerTonnePerPeriod`) };
  });
  const supplierIds = new Set(suppliers.map(item => item.id));
  const destinationIds = new Set(destinations.map(item => item.id));
  const laneIds = new Set();
  const routes = list(input.routes, 'routes').map(item => {
    const identifier = `${item.from}→${item.to}`;
    if (!supplierIds.has(item.from) || !destinationIds.has(item.to)) throw new RangeError(`${identifier}: unknown supplier or destination.`);
    if (laneIds.has(identifier)) throw new RangeError(`Duplicate route ${identifier}.`);
    laneIds.add(identifier);
    if (!Number.isInteger(item.leadTime) || item.leadTime < 0) throw new RangeError(`${identifier}.leadTime must be a non-negative integer number of periods.`);
    return { ...clone(item), capacity: series(item.capacity, periods, `${identifier}.capacity`), freightUsdPerTonne: numeric(item.freightUsdPerTonne ?? 0, `${identifier}.freightUsdPerTonne`), handlingUsdPerTonne: numeric(item.handlingUsdPerTonne ?? 0, `${identifier}.handlingUsdPerTonne`), emissionsKgPerTonne: numeric(item.emissionsKgPerTonne ?? 0, `${identifier}.emissionsKgPerTonne`) };
  });
  return { ...clone(input), periods, priceCurve, suppliers, destinations, routes, financingRatePerPeriod: numeric(input.financingRatePerPeriod ?? 0, 'financingRatePerPeriod'), budgetUsd: optionalLimit(input.budgetUsd, 'budgetUsd'), emissionsCapKg: optionalLimit(input.emissionsCapKg, 'emissionsCapKg') };
}

function buildLP(plan) {
  const constraints = {};
  const variables = {};
  const meta = {};
  const supplierIndex = new Map(plan.suppliers.map((item, i) => [item.id, i]));
  const destinationIndex = new Map(plan.destinations.map((item, i) => [item.id, i]));
  if (plan.budgetUsd !== null) constraints.budget = { max: plan.budgetUsd };
  if (plan.emissionsCapKg !== null) constraints.emissions = { max: plan.emissionsCapKg };
  plan.suppliers.forEach((item, i) => item.capacity.forEach((capacity, t) => { constraints[`s_${i}_${t}`] = { max: capacity }; }));

  plan.destinations.forEach((item, i) => {
    for (let t = 0; t < plan.periods; t++) {
      constraints[`bal_${i}_${t}`] = { equal: t === 0 ? item.initialInventory - item.demand[t] : -item.demand[t] };
      constraints[`stock_${i}_${t}`] = { min: item.reserve[t], max: item.storageCapacity };
      constraints[`peak_${i}_${t}`] = { max: item.storageCapacity - (t === 0 ? item.initialInventory : 0) };
      constraints[`unmet_${i}_${t}`] = { max: item.demand[t] };
      const stockCost = item.storageUsdPerTonnePerPeriod + plan.priceCurve[t] * plan.financingRatePerPeriod;
      numeric(stockCost, `${item.id} stock carrying cost`);
      const stock = { cost: stockCost, shortage: 0, [`bal_${i}_${t}`]: 1, [`stock_${i}_${t}`]: 1 };
      if (t + 1 < plan.periods) { stock[`bal_${i}_${t + 1}`] = -1; stock[`peak_${i}_${t + 1}`] = 1; }
      if (plan.budgetUsd !== null) stock.budget = stockCost;
      variables[`i_${i}_${t}`] = stock;
      meta[`i_${i}_${t}`] = { type: 'inventory', destinationIndex: i, period: t };
      variables[`u_${i}_${t}`] = { cost: 0, shortage: 1, [`bal_${i}_${t}`]: -1, [`unmet_${i}_${t}`]: 1 };
      meta[`u_${i}_${t}`] = { type: 'unmet', destinationIndex: i, period: t };
    }
  });

  plan.routes.forEach((route, r) => {
    const s = supplierIndex.get(route.from);
    const d = destinationIndex.get(route.to);
    for (let t = 0; t + route.leadTime < plan.periods; t++) {
      const arrival = t + route.leadTime;
      const purchase = plan.priceCurve[t] + plan.suppliers[s].basisUsdPerTonne;
      const financing = purchase * plan.financingRatePerPeriod * route.leadTime;
      const unitCost = purchase + route.freightUsdPerTonne + route.handlingUsdPerTonne + financing;
      numeric(unitCost, `${route.from}→${route.to} unit cost`);
      constraints[`r_${r}_${t}`] = { max: route.capacity[t] };
      const value = { cost: unitCost, shortage: 0, [`s_${s}_${t}`]: 1, [`r_${r}_${t}`]: 1, [`bal_${d}_${arrival}`]: -1, [`peak_${d}_${arrival}`]: 1 };
      if (plan.budgetUsd !== null) value.budget = unitCost;
      if (plan.emissionsCapKg !== null) value.emissions = route.emissionsKgPerTonne;
      variables[`x_${r}_${t}`] = value;
      meta[`x_${r}_${t}`] = { type: 'shipment', routeIndex: r, supplierIndex: s, destinationIndex: d, period: t, arrival, purchase, financing, unitCost };
    }
  });
  // The package's optional presolver incorrectly rejects some inventory models
  // with a redundant all-zero emissions row. These bounded LPs are small enough
  // to solve directly; keep every original constraint for residual validation.
  return { model: { optimize: 'shortage', opType: 'min', constraints, variables, options: { presolve: false } }, meta };
}

function validateSolution(model, solution) {
  const totals = Object.fromEntries(Object.keys(model.constraints).map(key => [key, 0]));
  const violations = [];
  for (const [name, coefficients] of Object.entries(model.variables)) {
    const value = solution[name] ?? 0;
    if (!Number.isFinite(value) || value < -EPS) { violations.push(`Invalid value for ${name}.`); continue; }
    for (const [key, coefficient] of Object.entries(coefficients)) if (Object.hasOwn(totals, key)) totals[key] += coefficient * value;
  }
  for (const [name, bounds] of Object.entries(model.constraints)) {
    for (const [type, bound] of Object.entries(bounds)) {
      const tolerance = EPS + Math.abs(bound) * 1e-9;
      if (!Number.isFinite(totals[name]) || (type === 'equal' && Math.abs(totals[name] - bound) > tolerance) || (type === 'min' && totals[name] < bound - tolerance) || (type === 'max' && totals[name] > bound + tolerance)) violations.push(`Constraint ${name} failed validation.`);
    }
  }
  return violations;
}

const unavailableBaseline = () => ({ available: false, comparable: false, reason: 'No independent operational baseline supplied; compare stress scenarios separately.' });
function unavailable(plan, status, diagnostics) {
  return { status, feasible: false, totalCost: null, totalDemand: qty(plan.destinations.reduce((sum, item) => sum + item.demand.reduce((a, b) => a + b, 0), 0)), fulfilledDemand: null, unmetDemandTotal: null, unmet: [], routes: [], procurement: [], inventory: [], terminalStock: [], costBreakdown: null, emissionsKg: null, budgetUsage: { limitUsd: plan.budgetUsd, usedUsd: null, remainingUsd: null, utilizationPct: null }, bindingConstraints: [], baseline: unavailableBaseline(), diagnostics, scenario: plan.scenario ?? 'custom', assumptions: plan.assumptions ?? {} };
}

function structuralDiagnostics(plan) {
  const diagnostics = ['No plan can satisfy mandatory reserve, storage and financial/emissions constraints, even when demand may remain unmet. No allocation or cost is claimed.'];
  for (const destination of plan.destinations) {
    if (destination.reserve.some(value => value > destination.storageCapacity)) diagnostics.push(`${destination.id}: at least one closing reserve exceeds storage capacity.`);
    if (destination.initialInventory < destination.reserve[0] && !plan.routes.some(route => route.to === destination.id && route.leadTime === 0 && route.capacity[0] > 0)) diagnostics.push(`${destination.id}: period 1 stock is below reserve and no same-period replenishment route is available.`);
  }
  if (plan.budgetUsd !== null) diagnostics.push('The budget also covers unavoidable storage and financing costs of required reserves; increase it or review the reserve policy.');
  if (plan.emissionsCapKg !== null) diagnostics.push('The transport-emissions cap may prevent mandatory reserve replenishment.');
  return diagnostics;
}

/** Solve unmet tonnes first, then minimum cost at that same service optimum. */
export function solvePlan(input) {
  const plan = normalize(input);
  const { model, meta } = buildLP(plan);
  let first;
  let solution;
  let minimumUnmet;
  try {
    first = solver.Solve(clone(model), 1e-9);
    if (!first.feasible) return unavailable(plan, 'structural-infeasible', structuralDiagnostics(plan));
    const firstViolations = validateSolution(model, first);
    if (firstViolations.length) return unavailable(plan, 'solver-error', firstViolations);
    minimumUnmet = Object.entries(meta).reduce((sum, [name, info]) => sum + (info.type === 'unmet' ? Math.max(0, first[name] ?? 0) : 0), 0);
    model.optimize = 'cost';
    // Every feasible point already has unmet >= the first-stage minimum. Use
    // a tolerance-aware upper bound rather than equality to rounded values.
    model.constraints.minimum_unmet = minimumUnmet < 1e-8 ? { equal: 0 } : { max: minimumUnmet + SERVICE_TOLERANCE };
    for (const [name, info] of Object.entries(meta)) if (info.type === 'unmet') model.variables[name].minimum_unmet = 1;
    solution = solver.Solve(clone(model), 1e-9);
    if (!solution.feasible) return unavailable(plan, 'solver-error', ['The second LP could not reproduce the first-pass service optimum. No cost or allocation is claimed.']);
    const violations = validateSolution(model, solution);
    if (violations.length) return unavailable(plan, 'solver-error', violations);
    const secondUnmet = Object.entries(meta).reduce((sum, [name, info]) => sum + (info.type === 'unmet' ? Math.max(0, solution[name] ?? 0) : 0), 0);
    if (Math.abs(secondUnmet - minimumUnmet) > SERVICE_TOLERANCE + 1e-8) return unavailable(plan, 'solver-error', ['The second LP did not preserve the first-pass service optimum within its numerical tolerance.']);
  } catch (error) {
    return unavailable(plan, 'solver-error', [`LP solver failed: ${error.message}`]);
  }

  const value = name => Math.max(0, solution[name] ?? 0);
  const routes = [];
  const procurementMap = new Map();
  const arrivals = plan.destinations.map(() => Array(plan.periods).fill(0));
  const supplierUsed = plan.suppliers.map(() => Array(plan.periods).fill(0));
  const costBreakdown = { procurement: 0, shipping: 0, handling: 0, storage: 0, financing: 0, total: 0 };
  let emissionsKg = 0;
  const bindingConstraints = [];
  for (const [name, info] of Object.entries(meta)) {
    if (info.type !== 'shipment') continue;
    const amount = value(name);
    const route = plan.routes[info.routeIndex];
    if (amount > EPS) {
      routes.push({ from: route.from, to: route.to, departurePeriod: info.period + 1, arrivalPeriod: info.arrival + 1, quantity: qty(amount), unitCost: money(info.unitCost), cost: money(amount * info.unitCost), emissionsKg: qty(amount * route.emissionsKgPerTonne) });
      const key = `${info.supplierIndex}_${info.period}`;
      const purchase = procurementMap.get(key) ?? { supplier: route.from, period: info.period + 1, quantity: 0, cost: 0, unitCost: info.purchase };
      purchase.quantity += amount; purchase.cost += amount * info.purchase; procurementMap.set(key, purchase);
    }
    arrivals[info.destinationIndex][info.arrival] += amount;
    supplierUsed[info.supplierIndex][info.period] += amount;
    costBreakdown.procurement += amount * info.purchase;
    costBreakdown.shipping += amount * route.freightUsdPerTonne;
    costBreakdown.handling += amount * route.handlingUsdPerTonne;
    costBreakdown.financing += amount * info.financing;
    emissionsKg += amount * route.emissionsKgPerTonne;
    if (route.capacity[info.period] > 0 && Math.abs(amount - route.capacity[info.period]) <= EPS) bindingConstraints.push({ type: 'route', id: `${route.from}→${route.to}`, period: info.period + 1, used: qty(amount), capacity: route.capacity[info.period], label: `${route.from} → ${route.to}, departure P${info.period + 1}` });
  }
  const inventory = [];
  const unmet = [];
  const terminalStock = [];
  let totalDemand = 0;
  let unmetDemandTotal = 0;
  plan.destinations.forEach((destination, i) => {
    let opening = destination.initialInventory;
    for (let t = 0; t < plan.periods; t++) {
      const closing = value(`i_${i}_${t}`);
      const shortage = value(`u_${i}_${t}`);
      totalDemand += destination.demand[t]; unmetDemandTotal += shortage;
      if (shortage > EPS) unmet.push({ id: destination.id, period: t + 1, quantity: qty(shortage) });
      inventory.push({ destination: destination.id, period: t + 1, opening: qty(opening), arrivals: qty(arrivals[i][t]), demand: destination.demand[t], fulfilled: qty(destination.demand[t] - shortage), unmet: qty(shortage), closing: qty(closing), reserve: destination.reserve[t], capacity: destination.storageCapacity });
      costBreakdown.storage += closing * destination.storageUsdPerTonnePerPeriod;
      costBreakdown.financing += closing * plan.priceCurve[t] * plan.financingRatePerPeriod;
      if (Math.abs(opening + arrivals[i][t] - destination.storageCapacity) <= EPS) bindingConstraints.push({ type: 'storage', id: destination.id, period: t + 1, used: qty(opening + arrivals[i][t]), capacity: destination.storageCapacity, label: `${destination.id} receipt storage, P${t + 1}` });
      if (destination.reserve[t] > 0 && Math.abs(closing - destination.reserve[t]) <= EPS) bindingConstraints.push({ type: 'reserve', id: destination.id, period: t + 1, used: qty(closing), capacity: destination.reserve[t], label: `${destination.id} closing reserve, P${t + 1}` });
      opening = closing;
    }
    terminalStock.push({ id: destination.id, quantity: qty(opening) });
  });
  plan.suppliers.forEach((supplier, i) => supplier.capacity.forEach((capacity, t) => {
    if (capacity > 0 && Math.abs(supplierUsed[i][t] - capacity) <= EPS) bindingConstraints.push({ type: 'supply', id: supplier.id, period: t + 1, used: qty(supplierUsed[i][t]), capacity, label: `${supplier.id} supply, P${t + 1}` });
  }));
  const totalCostRaw = costBreakdown.procurement + costBreakdown.shipping + costBreakdown.handling + costBreakdown.storage + costBreakdown.financing;
  numeric(totalCostRaw, 'computed total cost');
  costBreakdown.total = totalCostRaw;
  for (const key of Object.keys(costBreakdown)) costBreakdown[key] = money(costBreakdown[key]);
  if (plan.budgetUsd !== null && Math.abs(totalCostRaw - plan.budgetUsd) <= EPS + plan.budgetUsd * 1e-9) bindingConstraints.push({ type: 'budget', id: 'budget', used: money(totalCostRaw), capacity: plan.budgetUsd, label: 'Total planning budget' });
  if (plan.emissionsCapKg !== null && Math.abs(emissionsKg - plan.emissionsCapKg) <= EPS + plan.emissionsCapKg * 1e-9) bindingConstraints.push({ type: 'emissions', id: 'emissions', used: qty(emissionsKg), capacity: plan.emissionsCapKg, label: 'Transport-emissions cap' });
  const feasible = unmetDemandTotal <= EPS;
  return {
    status: feasible ? 'optimal' : 'shortage', feasible,
    totalCost: money(totalCostRaw), totalDemand: qty(totalDemand), fulfilledDemand: qty(totalDemand - unmetDemandTotal), unmetDemandTotal: qty(unmetDemandTotal),
    unmet, routes, procurement: [...procurementMap.values()].map(item => ({ ...item, quantity: qty(item.quantity), cost: money(item.cost), unitCost: money(item.unitCost) })).sort((a, b) => a.period - b.period || a.supplier.localeCompare(b.supplier)),
    inventory, terminalStock, costBreakdown, emissionsKg: qty(emissionsKg),
    budgetUsage: { limitUsd: plan.budgetUsd, usedUsd: money(totalCostRaw), remainingUsd: plan.budgetUsd === null ? null : money(plan.budgetUsd - totalCostRaw), utilizationPct: plan.budgetUsd > 0 ? money(totalCostRaw / plan.budgetUsd * 100) : null },
    bindingConstraints, baseline: unavailableBaseline(),
    diagnostics: feasible ? ['All demand is fulfilled on time within the stated numerical tolerance; every reserve, receipt-storage, supply, route, budget and emissions constraint passed validation.'] : ['Minimum possible unmet demand is shown by node and period. Late supply is not counted as fulfillment of earlier demand. Cost is minimized only after fixing this service optimum.'],
    scenario: plan.scenario ?? 'custom', assumptions: plan.assumptions ?? {},
    objective: { first: 'minimum unmet tonnes', second: 'minimum full cost at the first-stage optimum', minimumUnmetTonnes: qty(minimumUnmet), serviceOptimumToleranceTonnes: SERVICE_TOLERANCE, feasibilityToleranceTonnes: EPS },
  };
}

/**
 * Treat input as the current base case and apply each scenario independently.
 * Comparisons are stress impacts, not claimed trading/optimization savings.
 * Suppress cost comparisons unless both cases fulfill the same demand vector.
 */
export function runScenarios(input, scenarioIds = PLAN_SCENARIOS.map(item => item.id)) {
  const base = normalize(input);
  const ids = [...new Set(['baseline', ...list(scenarioIds, 'scenarioIds')])];
  const solved = ids.map(id => {
    const definition = PLAN_SCENARIOS.find(item => item.id === id);
    if (!definition) throw new RangeError(`Unknown scenario: ${id}`);
    const scenarioInput = applyScenario(base, id);
    return { id, name: definition.name, result: solvePlan(scenarioInput), demandVector: scenarioInput.destinations.map(item => [item.id, ...item.demand]) };
  });
  const reference = solved.find(item => item.id === 'baseline');
  return {
    referenceScenario: 'baseline',
    scenarios: solved.map(({ demandVector, ...item }) => {
      const comparable = reference.result.feasible && item.result.feasible && JSON.stringify(demandVector) === JSON.stringify(reference.demandVector);
      return { ...item, comparison: {
        comparable,
        reason: comparable ? 'Stress-case cost difference at identical on-time fulfilled demand, using the same cost definition; not trading profit.' : 'Cost comparison suppressed: both cases must fully meet the identical node-period demand vector.',
        costDifferenceUsd: comparable ? money(item.result.totalCost - reference.result.totalCost) : null,
        fulfilledDifferenceTonnes: item.result.fulfilledDemand === null || reference.result.fulfilledDemand === null ? null : qty(item.result.fulfilledDemand - reference.result.fulfilledDemand),
      } };
    }),
  };
}
