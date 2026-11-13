import solver from 'javascript-lp-solver';
import {
  normalizeRotationInput, rotationExtraLimits, evaluateRotationExtras,
  rotationMassTolerance, baselineRotation,
} from '../dist/flight-optimizer.js';

/** One LP: supplier → transport → pooled airport inventory → aircraft uplift.
 * Quantities are tonnes, prices USD/t. Each stage is one flight departure event,
 * not a day. Arrival receipts precede that event's uplift. No shortage slack.
 */
const LP_PRECISION = 1e-14;
const COST_EPS = 1e-6;
const sum = values => values.reduce((total, value) => total + value, 0);
const clone = value => structuredClone(value);
const cleanCost = value => Math.abs(value) <= COST_EPS ? 0 : value;
const costKeys = ['procurementUsd', 'freightUsd', 'handlingUsd', 'basisAdjustmentUsd', 'holdingUsd', 'intoPlaneUsd', 'taxAdjustmentUsd', 'deliveredQuoteUsd'];
const emptyCosts = () => Object.fromEntries([...costKeys, 'totalUsd'].map(key => [key, 0]));

function invalid(message, code = 'INVALID_SUPPLY_CHAIN') { const error = new RangeError(message); error.code = code; throw error; }
function finite(value, label, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && value < 0)) invalid(`${label} must be a finite ${signed ? '' : 'non-negative '}number.`);
  return value;
}
function array(value, label) { if (!Array.isArray(value)) invalid(`${label} must be an array.`); return value; }
function series(value, stages, label) {
  const values = Array.isArray(value) ? [...value] : Array(stages).fill(value);
  if (values.length !== stages) invalid(`${label} must have ${stages} stage values.`);
  return values.map((item, i) => finite(item, `${label}[${i + 1}]`));
}
function identifier(value, label, used) {
  if (typeof value !== 'string' || !value.trim() || used.has(value.trim())) invalid(`${label} must be nonempty and unique.`);
  used.add(value.trim()); return value.trim();
}

/** Normalized public contract; useful for validating imported scenario files. */
export function normalizeIntegratedSupplyChain(raw, flight) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('supplyChain is required: choose modeled inputs or delivered offers.');
  if (!['modeled', 'delivered'].includes(raw.mode)) invalid('supplyChain.mode must be modeled or delivered.');
  const stages = flight.legs.length;
  const origins = new Set(flight.legs.map(leg => leg.from));
  const airportIds = new Set();
  const airports = array(raw.airports, 'airports').map(item => {
    const code = identifier(item.code, 'Airport code', airportIds);
    if (!origins.has(code)) invalid(`${code} is not a departure airport in this rotation.`);
    const initialInventoryT = finite(item.initialInventoryT, `${code}.initialInventoryT`);
    const storageCapacityT = finite(item.storageCapacityT, `${code}.storageCapacityT`);
    const terminalInventoryT = finite(item.terminalInventoryT ?? initialInventoryT, `${code}.terminalInventoryT`);
    const reserveT = finite(item.reserveT ?? 0, `${code}.reserveT`);
    if (initialInventoryT > storageCapacityT || terminalInventoryT > storageCapacityT || terminalInventoryT < reserveT || reserveT > storageCapacityT) invalid(`${code}: opening stock, terminal target and reserve must fit storage capacity; terminal target must cover reserve.`);
    const intoPlaneUsdPerT = finite(item.intoPlaneUsdPerT ?? 0, `${code}.intoPlaneUsdPerT`);
    const holdingUsdPerTPerStage = finite(item.holdingUsdPerTPerStage ?? 0, `${code}.holdingUsdPerTPerStage`);
    const taxAdjustmentUsdPerT = finite(item.taxAdjustmentUsdPerT ?? 0, `${code}.taxAdjustmentUsdPerT`, true);
    if (raw.mode === 'delivered' && (intoPlaneUsdPerT !== 0 || holdingUsdPerTPerStage !== 0 || taxAdjustmentUsdPerT !== 0)) invalid('Delivered all-in quotation mode must not add modeled into-plane, tax or holding charges.');
    return { ...clone(item), code, initialInventoryT, terminalInventoryT, storageCapacityT, reserveT, intoPlaneUsdPerT, holdingUsdPerTPerStage, taxAdjustmentUsdPerT };
  });
  for (const code of origins) if (!airportIds.has(code)) invalid(`Missing pooled airport inventory for ${code}.`);
  const supplierIds = new Set();
  const suppliers = array(raw.suppliers ?? [], 'suppliers').map(item => {
    const id = identifier(item.id, 'Supplier id', supplierIds);
    return { ...clone(item), id, priceUsdPerT: series(item.priceUsdPerT, stages, `${id}.priceUsdPerT`), capacityT: series(item.capacityT, stages, `${id}.capacityT`), totalCapacityT: finite(item.totalCapacityT, `${id}.totalCapacityT`) };
  });
  const routeIds = new Set();
  const routes = array(raw.routes ?? [], 'routes').map((item, i) => {
    const id = identifier(item.id ?? `route-${i + 1}`, 'Route id', routeIds);
    if (!supplierIds.has(item.supplierId) || !airportIds.has(item.airport)) invalid(`${id}: unknown supplier or airport.`);
    if (!Number.isInteger(item.leadTimeStages) || item.leadTimeStages < 0) invalid(`${id}.leadTimeStages must be a non-negative integer.`);
    const capacityT = series(item.capacityT, stages, `${id}.capacityT`);
    return { ...clone(item), id, capacityT, totalCapacityT: finite(item.totalCapacityT ?? sum(capacityT), `${id}.totalCapacityT`), freightUsdPerT: finite(item.freightUsdPerT ?? 0, `${id}.freightUsdPerT`), handlingUsdPerT: finite(item.handlingUsdPerT ?? 0, `${id}.handlingUsdPerT`), basisAdjustmentUsdPerT: finite(item.basisAdjustmentUsdPerT ?? 0, `${id}.basisAdjustmentUsdPerT`, true) };
  });
  const offerIds = new Set();
  const deliveredOffers = array(raw.deliveredOffers ?? [], 'deliveredOffers').map((item, i) => {
    const id = identifier(item.id ?? `offer-${i + 1}`, 'Offer id', offerIds);
    if (!airportIds.has(item.airport)) invalid(`${id}: unknown airport.`);
    const capacityT = series(item.capacityT, stages, `${id}.capacityT`);
    return { ...clone(item), id, capacityT, totalCapacityT: finite(item.totalCapacityT ?? sum(capacityT), `${id}.totalCapacityT`), priceUsdPerT: series(item.priceUsdPerT, stages, `${id}.priceUsdPerT`) };
  });
  if (raw.mode === 'delivered' && (suppliers.length || routes.length)) invalid('Delivered all-in quotation mode uses direct offers, not additional upstream supplier/transport charges.');
  if (raw.mode === 'modeled' && deliveredOffers.length) invalid('Modeled mode must not add delivered quotations on top of its upstream network.');
  for (const route of routes) {
    const supplier = suppliers.find(item => item.id === route.supplierId);
    const airport = airports.find(item => item.code === route.airport);
    supplier.priceUsdPerT.forEach((price, stage) => {
      const acquisition = price + route.freightUsdPerT + route.handlingUsdPerT + route.basisAdjustmentUsdPerT;
      if (stage + route.leadTimeStages < stages && (!Number.isFinite(acquisition) || acquisition < 0)) invalid(`${route.id}: net acquisition before into-plane service cannot be negative. Revise the supplier/basis/service decomposition or use an all-in delivered quotation.`, 'NEGATIVE_ACQUISITION_COST');
      const effective = acquisition + airport.intoPlaneUsdPerT + airport.taxAdjustmentUsdPerT;
      if (stage + route.leadTimeStages < stages && (!Number.isFinite(effective) || effective < 0)) invalid(`${route.id}: effective supplied-and-uplifted unit cost cannot be negative or nonfinite.`);
    });
  }
  return { ...clone(raw), mode: raw.mode, stages, airports, suppliers, routes, deliveredOffers };
}

function failure(status, code, message, errors = []) {
  return { feasible: false, status, errors, diagnostics: errors.length ? [] : [message], errorDetails: errors.map(item => ({ code, message: item })), diagnosticDetails: errors.length ? [] : [{ code, message }], legs: [], totalCostUsd: null, totalUpliftT: null, totalBurnT: null, totalExtraBurnT: null, finalFuelT: null, terminalTargetFuelT: null, supplyChain: null };
}

function buildModel(input, network, terminalExtra, fixedExtras = null) {
  const n = input.legs.length;
  const constraints = {};
  const variables = {};
  const metadata = {};
  const airports = new Map(network.airports.map((airport, i) => [airport.code, i]));
  const suppliers = new Map(network.suppliers.map((supplier, i) => [supplier.id, i]));
  const EPS = rotationMassTolerance(input);
  input.legs.forEach((leg, i) => {
    const upper = Math.min(...Object.values(rotationExtraLimits(input, leg)));
    constraints[`carry_${i}`] = fixedExtras ? { equal: fixedExtras[i] } : { max: Math.max(0, upper) };
    // Baseline fixed extras still face the very same physical upper limit.
    if (fixedExtras) constraints[`carry_upper_${i}`] = { max: Math.max(0, upper) };
    constraints[`flight_${i}`] = { equal: leg.taxiBurnT + leg.baseBurnT + leg.reserveT - (i === 0 ? input.initialFuelT : input.legs[i - 1].reserveT) };
    constraints[`uplift_${i}`] = { max: leg.maxUpliftT ?? input.aircraft.tankCapacityT };
    const extra = { cost: 0, carry: 1, [`carry_${i}`]: 1, [`flight_${i}`]: -1 };
    if (fixedExtras) extra[`carry_upper_${i}`] = 1;
    if (i + 1 < n) extra[`flight_${i + 1}`] = 1 - leg.carryBurnRate;
    if (i === n - 1) { constraints.final_aircraft = { equal: terminalExtra }; extra.final_aircraft = 1; }
    variables[`e_${i}`] = extra;
    const airportIndex = airports.get(leg.from);
    const airport = network.airports[airportIndex];
    variables[`u_${i}`] = { cost: airport.intoPlaneUsdPerT + airport.taxAdjustmentUsdPerT, carry: 0, [`flight_${i}`]: 1, [`uplift_${i}`]: 1, [`balance_${airportIndex}_${i}`]: 1 };
    metadata[`u_${i}`] = { kind: 'uplift', leg: i, airportIndex };
    if (upper < -EPS) invalid(`${leg.from} → ${leg.to}: minimum aircraft fuel exceeds a tank or weight limit.`);
  });
  network.airports.forEach((airport, a) => {
    for (let t = 0; t < n; t++) {
      constraints[`balance_${a}_${t}`] = { equal: t === 0 ? airport.initialInventoryT : 0 };
      constraints[`stock_${a}_${t}`] = { min: airport.reserveT, max: airport.storageCapacityT };
      constraints[`receipt_${a}_${t}`] = { max: airport.storageCapacityT - (t === 0 ? airport.initialInventoryT : 0) };
      const stock = { cost: airport.holdingUsdPerTPerStage, carry: 0, [`balance_${a}_${t}`]: 1, [`stock_${a}_${t}`]: 1 };
      if (t + 1 < n) { stock[`balance_${a}_${t + 1}`] = -1; stock[`receipt_${a}_${t + 1}`] = 1; }
      if (t === n - 1) { constraints[`terminal_${a}`] = { equal: airport.terminalInventoryT }; stock[`terminal_${a}`] = 1; }
      variables[`g_${a}_${t}`] = stock;
      metadata[`g_${a}_${t}`] = { kind: 'stock', airportIndex: a, stage: t };
    }
  });
  network.suppliers.forEach((supplier, s) => {
    constraints[`supplier_total_${s}`] = { max: supplier.totalCapacityT };
    supplier.capacityT.forEach((cap, t) => { constraints[`supplier_${s}_${t}`] = { max: cap }; });
  });
  const addDelivery = (name, info, coefficients) => {
    coefficients[`balance_${info.airportIndex}_${info.arrival}`] = -1;
    coefficients[`receipt_${info.airportIndex}_${info.arrival}`] = 1;
    coefficients.carry = 0;
    variables[name] = coefficients;
    metadata[name] = info;
  };
  network.routes.forEach((route, r) => {
    const s = suppliers.get(route.supplierId);
    const airportIndex = airports.get(route.airport);
    constraints[`route_total_${r}`] = { max: route.totalCapacityT };
    for (let t = 0; t + route.leadTimeStages < n; t++) {
      const procurement = network.suppliers[s].priceUsdPerT[t];
      constraints[`route_${r}_${t}`] = { max: route.capacityT[t] };
      addDelivery(`x_${r}_${t}`, { kind: 'shipment', routeIndex: r, supplierIndex: s, airportIndex, stage: t, arrival: t + route.leadTimeStages, procurement }, {
        cost: procurement + route.freightUsdPerT + route.handlingUsdPerT + route.basisAdjustmentUsdPerT,
        [`supplier_${s}_${t}`]: 1, [`supplier_total_${s}`]: 1, [`route_${r}_${t}`]: 1, [`route_total_${r}`]: 1,
      });
    }
  });
  network.deliveredOffers.forEach((offer, o) => {
    const airportIndex = airports.get(offer.airport);
    constraints[`offer_total_${o}`] = { max: offer.totalCapacityT };
    for (let t = 0; t < n; t++) {
      constraints[`offer_${o}_${t}`] = { max: offer.capacityT[t] };
      addDelivery(`q_${o}_${t}`, { kind: 'offer', offerIndex: o, airportIndex, stage: t, arrival: t }, { cost: offer.priceUsdPerT[t], [`offer_${o}_${t}`]: 1, [`offer_total_${o}`]: 1 });
    }
  });
  return { model: { optimize: 'cost', opType: 'min', variables, constraints, options: { presolve: false } }, metadata };
}

function validateResiduals(model, solution, scale) {
  const values = Object.fromEntries(Object.keys(model.constraints).map(key => [key, 0]));
  const errors = [];
  // An absolute tonne floor can erase tiny, high-value quantities. Keep mass
  // checks relative to the aircraft's mass scale, just as the shared core does.
  const tolerance = Math.max(Number.MIN_VALUE, 256 * Number.EPSILON * scale);
  for (const [name, coefficients] of Object.entries(model.variables)) {
    const value = solution[name] ?? 0;
    if (!Number.isFinite(value) || value < -tolerance) errors.push(`Invalid variable ${name}.`);
    for (const [key, coefficient] of Object.entries(coefficients)) if (Object.hasOwn(values, key)) values[key] += value * coefficient;
  }
  for (const [key, limits] of Object.entries(model.constraints)) for (const [type, bound] of Object.entries(limits)) {
    const eps = key === 'cost_ceiling' ? Math.max(COST_EPS, Math.abs(bound) * 1e-10) : tolerance;
    if (!Number.isFinite(values[key]) || (type === 'equal' && Math.abs(values[key] - bound) > eps) || (type === 'min' && values[key] < bound - eps) || (type === 'max' && values[key] > bound + eps)) errors.push(`Constraint ${key} failed independent validation.`);
  }
  return errors;
}

function solveScaled(model, massScale) {
  const scaled = clone(model);
  const priceScale = Math.max(...Object.values(model.variables).map(variable => Math.abs(variable.cost))) || 1;
  for (const [key, bounds] of Object.entries(scaled.constraints)) {
    for (const type of Object.keys(bounds)) bounds[type] = key === 'cost_ceiling' ? bounds[type] / massScale / priceScale : bounds[type] / massScale;
  }
  for (const variable of Object.values(scaled.variables)) {
    variable.cost /= priceScale;
    if (Object.hasOwn(variable, 'cost_ceiling')) variable.cost_ceiling /= priceScale;
  }
  const normalized = solver.Solve(scaled, LP_PRECISION);
  const solution = { feasible: normalized.feasible, bounded: normalized.bounded };
  for (const key of Object.keys(model.variables)) solution[key] = (normalized[key] ?? 0) * massScale;
  return solution;
}

function solveOne(input, network, terminalExtra, fixedExtras = null) {
  let built;
  try { built = buildModel(input, network, terminalExtra, fixedExtras); }
  catch (error) { return failure('infeasible', 'JOINT_NETWORK_INFEASIBLE', error.message); }
  const { model, metadata } = built;
  let solution;
  try { solution = solveScaled(model, input.aircraft.tankCapacityT); }
  catch (error) { return failure('numerical-error', 'NUMERICAL_VALIDATION_FAILED', `Joint LP failed: ${error.message}`); }
  if (!solution.feasible || !solution.bounded) return failure('infeasible', fixedExtras ? 'BASELINE_NETWORK_INFEASIBLE' : 'JOINT_NETWORK_INFEASIBLE', fixedExtras ? 'The minimum-uplift reference cannot be supplied under the same supplier, transport, stock and aircraft constraints.' : 'No joint supplier-to-aircraft allocation can complete this rotation while meeting capacities, reserves and equal terminal stocks.');
  // Among practically equal-cost plans, avoid unnecessary aircraft carry. The
  // primary objective remains the complete supplier-to-aircraft cost.
  if (!fixedExtras) {
    const cost = sum(Object.entries(model.variables).map(([name, variable]) => (solution[name] ?? 0) * variable.cost));
    const tied = clone(model);
    tied.optimize = 'carry'; tied.constraints.cost_ceiling = { max: cost + Math.max(1e-8, Math.abs(cost) * 1e-13) };
    for (const variable of Object.values(tied.variables)) variable.cost_ceiling = variable.cost;
    try {
      const second = solveScaled(tied, input.aircraft.tankCapacityT);
      const secondExtras = input.legs.map((_, i) => Math.max(0, second[`e_${i}`] ?? 0));
      if (second.feasible && second.bounded && !validateResiduals(tied, second, input.aircraft.tankCapacityT).length && evaluateRotationExtras(input, secondExtras).feasible) solution = second;
    } catch { /* Retain the independently validated primary solution. */ }
  }
  const residuals = validateResiduals(model, solution, input.aircraft.tankCapacityT);
  if (residuals.length) return failure('numerical-error', 'NUMERICAL_VALIDATION_FAILED', residuals.join(' '));
  const extra = input.legs.map((_, i) => Math.max(0, solution[`e_${i}`] ?? 0));
  const flight = evaluateRotationExtras(input, extra, fixedExtras ? 'feasible' : 'optimal');
  if (!flight.feasible) return failure('numerical-error', 'NUMERICAL_VALIDATION_FAILED', `Aircraft validation rejected the LP solution: ${flight.diagnostics.join(' ')}`);
  const fuelEPS = rotationMassTolerance(input);
  const target = input.legs.at(-1).reserveT + (1 - input.legs.at(-1).carryBurnRate) * terminalExtra;
  if (Math.abs(flight.finalFuelT - target) > fuelEPS) return failure('numerical-error', 'NUMERICAL_VALIDATION_FAILED', 'Aircraft terminal stock differs from the reference.');
  const value = name => Math.max(0, solution[name] ?? 0);
  const costs = emptyCosts();
  const airportCosts = network.airports.map(() => emptyCosts());
  const arrivals = network.airports.map(() => Array(network.stages).fill(0));
  const shipments = [];
  const purchases = network.suppliers.map(supplier => ({ id: supplier.id, purchasedT: 0, totalCapacityT: supplier.totalCapacityT, costUsd: 0 }));
  for (const [name, info] of Object.entries(metadata)) {
    if (!['shipment', 'offer'].includes(info.kind)) continue;
    const amount = value(name);
    arrivals[info.airportIndex][info.arrival] += amount;
    if (info.kind === 'shipment') {
      const route = network.routes[info.routeIndex];
      const item = { supplierId: route.supplierId, routeId: route.id, airport: route.airport, departureStage: info.stage + 1, arrivalStage: info.arrival + 1, quantityT: amount, procurementUsd: amount * info.procurement, freightUsd: amount * route.freightUsdPerT, handlingUsd: amount * route.handlingUsdPerT, basisAdjustmentUsd: amount * route.basisAdjustmentUsdPerT, deliveredQuoteUsd: 0 };
      item.costUsd = item.procurementUsd + item.freightUsd + item.handlingUsd + item.basisAdjustmentUsd;
      if (amount > 0) shipments.push(item);
      purchases[info.supplierIndex].purchasedT += amount; purchases[info.supplierIndex].costUsd += item.procurementUsd;
      for (const key of ['procurementUsd', 'freightUsd', 'handlingUsd', 'basisAdjustmentUsd']) airportCosts[info.airportIndex][key] += item[key];
    } else {
      const offer = network.deliveredOffers[info.offerIndex];
      const deliveredQuoteUsd = amount * offer.priceUsdPerT[info.stage];
      if (amount > 0) shipments.push({ supplierId: offer.id, offerId: offer.id, airport: offer.airport, departureStage: info.stage + 1, arrivalStage: info.stage + 1, quantityT: amount, procurementUsd: 0, freightUsd: 0, handlingUsd: 0, basisAdjustmentUsd: 0, deliveredQuoteUsd, costUsd: deliveredQuoteUsd });
      airportCosts[info.airportIndex].deliveredQuoteUsd += deliveredQuoteUsd;
    }
  }
  const airportInventory = [];
  const terminalTargets = [];
  network.airports.forEach((airport, a) => {
    let openingT = airport.initialInventoryT;
    for (let stage = 0; stage < network.stages; stage++) {
      const upliftT = input.legs[stage].from === airport.code ? flight.legs[stage].upliftT : 0;
      const closingT = value(`g_${a}_${stage}`);
      airportInventory.push({ airport: airport.code, stage: stage + 1, openingT, arrivalsT: arrivals[a][stage], upliftT, closingT, reserveT: airport.reserveT, storageCapacityT: airport.storageCapacityT });
      airportCosts[a].holdingUsd += closingT * airport.holdingUsdPerTPerStage;
      airportCosts[a].intoPlaneUsd += upliftT * airport.intoPlaneUsdPerT;
      airportCosts[a].taxAdjustmentUsd += upliftT * airport.taxAdjustmentUsdPerT;
      openingT = closingT;
    }
    terminalTargets.push({ airport: airport.code, initialT: airport.initialInventoryT, targetT: airport.terminalInventoryT, finalT: openingT });
    const visits = flight.legs.map((leg, index) => ({ leg, index })).filter(item => item.leg.from === airport.code);
    const totalUplift = sum(visits.map(item => item.leg.upliftT));
    airportCosts[a].totalUsd = sum(costKeys.map(key => airportCosts[a][key]));
    for (const [visitIndex, { leg }] of visits.entries()) {
      leg.costUsd = totalUplift > 0 ? airportCosts[a].totalUsd * leg.upliftT / totalUplift : visitIndex === 0 ? airportCosts[a].totalUsd : 0;
      leg.costAllocation = 'Airport-horizon supply cost allocated pro rata by uplift; any zero-uplift holding overhead assigned to the first visit. Not an executable marginal quote.';
    }
    for (const key of costKeys) costs[key] += airportCosts[a][key];
  });
  costs.totalUsd = sum(costKeys.map(key => costs[key]));
  const groundTolerance = Math.max(Number.MIN_VALUE, 256 * Number.EPSILON * input.aircraft.tankCapacityT);
  const badGround = airportInventory.some(row => Math.abs(row.openingT + row.arrivalsT - row.upliftT - row.closingT) > groundTolerance || row.closingT < row.reserveT - groundTolerance || row.openingT + row.arrivalsT > row.storageCapacityT + groundTolerance);
  const badPoolTotal = network.airports.some(airport => {
    const received = sum(shipments.filter(row => row.airport === airport.code).map(row => row.quantityT));
    const uplift = sum(flight.legs.filter(leg => leg.from === airport.code).map(leg => leg.upliftT));
    return Math.abs(received - uplift - (airport.terminalInventoryT - airport.initialInventoryT)) > groundTolerance;
  });
  if (badGround || badPoolTotal || terminalTargets.some(row => Math.abs(row.targetT - row.finalT) > groundTolerance) || !Number.isFinite(costs.totalUsd)) return failure('numerical-error', 'NUMERICAL_VALIDATION_FAILED', 'Airport mass balance, terminal inventory or cost failed independent validation.');
  flight.totalCostUsd = costs.totalUsd;
  flight.terminalTargetFuelT = target;
  flight.supplyChain = { mode: network.mode, stages: network.stages, suppliers: purchases, shipments, airportInventory, costBreakdown: costs, terminalTargets, airportCosts: network.airports.map((airport, a) => ({ airport: airport.code, ...airportCosts[a] })), diagnostics: [] };
  flight.errorDetails = []; flight.diagnosticDetails = [];
  return flight;
}

/** Drop-in flight result shape, backed by a genuinely joint supply-chain LP. */
export function optimizeIntegratedRotation(rawInput) {
  const parsed = normalizeRotationInput(rawInput);
  const wrapFailure = result => ({ ...result, optimized: null, baseline: null, savingsUsd: null, savingsPercent: null, extraBurnVsBaselineT: null });
  if (parsed.errors.length) return wrapFailure(failure('invalid', 'INVALID_FLIGHT_INPUT', '', parsed.errors));
  const input = parsed.input;
  let network;
  try { network = normalizeIntegratedSupplyChain(input.supplyChain, input); }
  catch (error) { return wrapFailure(failure('invalid', error.code ?? 'INVALID_SUPPLY_CHAIN', '', [error.message])); }
  if (input.initialFuelT > input.aircraft.tankCapacityT + rotationMassTolerance(input)) return wrapFailure(failure('infeasible', 'JOINT_NETWORK_INFEASIBLE', 'Initial aircraft stock exceeds the fuel tank; unloading is not allowed.'));
  const physicalBaseline = baselineRotation(input);
  const extras = physicalBaseline.legs.map(leg => leg.carryFuelT);
  const terminalExtra = extras.at(-1);
  const baseline = solveOne(input, network, terminalExtra, extras);
  let optimized = solveOne(input, network, terminalExtra);
  if (!optimized.feasible) return { ...wrapFailure(optimized), baseline, terminalTargetFuelT: physicalBaseline.finalFuelT };
  // The fixed-flight baseline is also a feasible candidate for the joint LP.
  // Never report numerical "negative savings" when that candidate is cheaper.
  if (baseline.feasible && optimized.totalCostUsd > baseline.totalCostUsd) {
    const tolerance = Math.max(COST_EPS, Math.abs(baseline.totalCostUsd) * 1e-12);
    if (optimized.totalCostUsd - baseline.totalCostUsd > tolerance) return { ...wrapFailure(failure('numerical-error', 'NUMERICAL_VALIDATION_FAILED', 'The joint objective exceeds a feasible reference beyond numerical cost tolerance; optimality is not claimed.')), baseline };
    optimized = { ...clone(baseline), status: 'optimal' };
  }
  if (!baseline.feasible) {
    const numerical = baseline.status === 'numerical-error';
    optimized.diagnostics.push(numerical ? 'The minimum-uplift reference could not be numerically validated; savings are not reported.' : 'The minimum-uplift reference is infeasible under the same upstream network; savings are not reported.');
    optimized.diagnosticDetails.push({ code: numerical ? 'NUMERICAL_VALIDATION_FAILED' : 'BASELINE_NETWORK_INFEASIBLE', message: optimized.diagnostics.at(-1) });
  }
  const comparable = baseline.feasible;
  return { ...optimized, optimized: clone(optimized), baseline,
    savingsUsd: comparable ? cleanCost(baseline.totalCostUsd - optimized.totalCostUsd) : null,
    savingsPercent: comparable && baseline.totalCostUsd > COST_EPS ? 100 * (baseline.totalCostUsd - optimized.totalCostUsd) / baseline.totalCostUsd : null,
    extraBurnVsBaselineT: comparable ? optimized.totalExtraBurnT - baseline.totalExtraBurnT : null,
    solver: { method: 'joint-continuous-supplier-airport-aircraft-lp', stages: network.stages, aircraftVariables: input.legs.length, flightPhysics: 'shared-flight-optimizer-core', precision: LP_PRECISION, nondimensionalized: true },
  };
}

export const optimizeRotation = optimizeIntegratedRotation;
