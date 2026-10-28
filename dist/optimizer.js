/**
 * Small physical procurement / shipping optimizer for an educational MVP.
 * Quantities: metric tonnes. Unit costs: USD / metric tonne. Totals: USD.
 * Hub IDs are illustrative internal labels, not official port codes.
 * All capacity, demand, stock, reserve, basis and shipping values are assumptions.
 * A benchmark supplied by a public feed is a proxy, not an Asian port quote.
 */

const EPS = 1e-8;
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const quantity = value => Number(value.toFixed(6));
const frozen = records => Object.freeze(records.map(record => Object.freeze(record)));

export const DEFAULT_NETWORK = Object.freeze({
  supplies: frozen([
    { id: 'SIN', city: 'Singapore', name: 'Singapore supply hub', lat: 1.264, lon: 103.84, capacity: 11000, basisUsdPerTonne: -12 },
    { id: 'ULS', city: 'Ulsan', name: 'Ulsan / Korea supply hub', lat: 35.502, lon: 129.387, capacity: 9000, basisUsdPerTonne: 14 },
    { id: 'PVG', city: 'Shanghai', name: 'Shanghai supply hub', lat: 31.25, lon: 121.6, capacity: 7000, basisUsdPerTonne: 24 },
  ]),
  demands: frozen([
    { id: 'HKG', city: 'Hong Kong', name: 'Hong Kong demand port', lat: 22.30, lon: 114.16, demand: 6000, inventory: 1000, reserve: 700 },
    { id: 'TYO', city: 'Tokyo', name: 'Tokyo Bay demand port', lat: 35.60, lon: 139.80, demand: 10000, inventory: 1500, reserve: 1200 },
    { id: 'MNL', city: 'Manila', name: 'Manila demand port', lat: 14.58, lon: 120.97, demand: 5000, inventory: 800, reserve: 500 },
  ]),
  routes: frozen([
    { from: 'SIN', to: 'HKG', capacity: 6500, shippingUsdPerTonne: 28, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'SIN', to: 'TYO', capacity: 7000, shippingUsdPerTonne: 48, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'SIN', to: 'MNL', capacity: 5500, shippingUsdPerTonne: 23, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'ULS', to: 'HKG', capacity: 4000, shippingUsdPerTonne: 32, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'ULS', to: 'TYO', capacity: 9000, shippingUsdPerTonne: 16, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'ULS', to: 'MNL', capacity: 4000, shippingUsdPerTonne: 35, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'PVG', to: 'HKG', capacity: 6000, shippingUsdPerTonne: 18, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'PVG', to: 'TYO', capacity: 5000, shippingUsdPerTonne: 27, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
    { from: 'PVG', to: 'MNL', capacity: 4000, shippingUsdPerTonne: 30, handlingUsdPerTonne: 6, storageUsdPerTonne: 3 },
  ]),
});

export const SCENARIOS = frozen([
  { id: 'baseline', name: 'Base case', label: 'Base case', description: 'Editable assumed capacity, demand and delivery costs; no disruption applied.' },
  { id: 'gulf-disruption', name: 'Gulf supply shock', label: 'Gulf supply shock', description: 'Assumption: basis +$80/t; Singapore capacity −20%, Korea −25%, Shanghai −10%; shipping +20%.' },
  { id: 'refinery-outage', name: 'Singapore outage', label: 'Singapore outage', description: 'Assumption: Singapore capacity −75% and its basis +$65/t. Other supply hubs remain at their edited base values.' },
]);

function number(value, name, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && value < 0)) {
    throw new RangeError(`${name} must be a finite ${signed ? '' : 'non-negative '}number.`);
  }
  return value;
}

function records(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  return value;
}

/**
 * Build an editable scenario. Override arrays replace a collection; known IDs
 * inherit omitted fields from defaults. Demand scaling affects gross demand,
 * not inventory or reserve. Scenario factors apply after the user's edits.
 */
export function makeScenario({
  benchmarkUsdPerTonne = 850,
  scenario = 'baseline',
  demandScale = 1,
  shippingMultiplier = 1,
  supplyCapacityScale = 1,
  supplies = DEFAULT_NETWORK.supplies,
  demands = DEFAULT_NETWORK.demands,
  routes = DEFAULT_NETWORK.routes,
} = {}) {
  number(benchmarkUsdPerTonne, 'benchmarkUsdPerTonne');
  number(demandScale, 'demandScale');
  number(shippingMultiplier, 'shippingMultiplier');
  number(supplyCapacityScale, 'supplyCapacityScale');
  const selected = SCENARIOS.find(item => item.id === scenario);
  if (!selected) throw new RangeError(`Unknown scenario: ${scenario}`);

  const mergedSupplies = records(supplies, 'supplies').map(item => ({ ...DEFAULT_NETWORK.supplies.find(base => base.id === item.id), ...item }));
  const mergedDemands = records(demands, 'demands').map(item => ({ ...DEFAULT_NETWORK.demands.find(base => base.id === item.id), ...item }));
  const mergedRoutes = records(routes, 'routes').map(item => ({ ...DEFAULT_NETWORK.routes.find(base => base.from === item.from && base.to === item.to), ...item }));

  return {
    benchmarkUsdPerTonne,
    scenario,
    assumptions: {
      physicalParameters: 'Illustrative assumptions, not observed port capacities, stocks, demand or freight quotes.',
      hubIdentifiers: 'Illustrative internal hub IDs; these are not official port codes.',
      benchmark: 'User-supplied benchmark proxy; a US observation is not an Asian delivered jet-fuel quote.',
      period: 'One common planning period; no scheduling, vessel lots, lead times or inter-period inventory.',
      scenario: selected.description,
      optimization: 'Continuous-volume, single-product, minimum-cost maximum flow; no integer vessel, credit, quality or regulatory constraints.',
      baseline: 'Shipping-cost-first greedy allocation using exactly the same capacities and inventory-adjusted requirements.',
    },
    supplies: mergedSupplies.map(item => {
      let capacityFactor = 1;
      let basisShock = 0;
      if (scenario === 'gulf-disruption') {
        capacityFactor = ({ SIN: 0.8, ULS: 0.75, PVG: 0.9 })[item.id] ?? 0.85;
        basisShock = 80;
      } else if (scenario === 'refinery-outage' && item.id === 'SIN') {
        capacityFactor = 0.25;
        basisShock = 65;
      }
      return { ...item, capacity: item.capacity * supplyCapacityScale * capacityFactor, basisUsdPerTonne: (item.basisUsdPerTonne ?? 0) + basisShock, assumed: true };
    }),
    demands: mergedDemands.map(item => ({ ...item, demand: item.demand * demandScale, assumed: true })),
    routes: mergedRoutes.map(item => ({ ...item, shippingUsdPerTonne: (item.shippingUsdPerTonne ?? 0) * shippingMultiplier * (scenario === 'gulf-disruption' ? 1.2 : 1), assumed: true })),
  };
}

function normalize(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Optimizer input is required.');
  const benchmark = number(input.benchmarkUsdPerTonne, 'benchmarkUsdPerTonne');
  const ids = new Set();
  function identifier(id, type) {
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new RangeError(`${type} IDs must be nonempty and unique across the network.`);
    ids.add(id);
    return id;
  }
  const supplies = records(input.supplies, 'supplies').map(item => {
    const id = identifier(item.id, 'Supply');
    const capacity = number(item.capacity, `${id}.capacity`);
    const basis = number(item.basisUsdPerTonne ?? 0, `${id}.basisUsdPerTonne`, true);
    if (benchmark + basis < 0) throw new RangeError(`${id} benchmark plus basis must not be negative.`);
    return { ...item, id, capacity, basisUsdPerTonne: basis };
  });
  const demands = records(input.demands, 'demands').map(item => {
    const id = identifier(item.id, 'Demand');
    const demand = number(item.demand, `${id}.demand`);
    const inventory = number(item.inventory ?? 0, `${id}.inventory`);
    const reserve = number(item.reserve ?? 0, `${id}.reserve`);
    const requiredDelivery = Math.max(0, demand + reserve - inventory);
    number(requiredDelivery, `${id}.requiredDelivery`);
    return { ...item, id, demand, inventory, reserve, requiredDelivery };
  });
  const supplyMap = new Map(supplies.map(item => [item.id, item]));
  const demandMap = new Map(demands.map(item => [item.id, item]));
  const routeIds = new Set();
  const routes = records(input.routes, 'routes').map(item => {
    const id = `${item.from}→${item.to}`;
    if (!supplyMap.has(item.from) || !demandMap.has(item.to)) throw new RangeError(`Route ${id} references an unknown endpoint.`);
    if (routeIds.has(id)) throw new RangeError(`Duplicate route: ${id}`);
    routeIds.add(id);
    const capacity = number(item.capacity, `${id}.capacity`);
    const shipping = number(item.shippingUsdPerTonne ?? 0, `${id}.shippingUsdPerTonne`);
    const handling = number(item.handlingUsdPerTonne ?? 0, `${id}.handlingUsdPerTonne`);
    const storage = number(item.storageUsdPerTonne ?? 0, `${id}.storageUsdPerTonne`);
    const basis = supplyMap.get(item.from).basisUsdPerTonne;
    const unitCost = benchmark + basis + shipping + handling + storage;
    number(unitCost, `${id}.unitCost`);
    return { ...item, id, capacity, shippingUsdPerTonne: shipping, handlingUsdPerTonne: handling, storageUsdPerTonne: storage, basisUsdPerTonne: basis, unitCost };
  });
  const requiredDemand = demands.reduce((total, item) => total + item.requiredDelivery, 0);
  number(requiredDemand, 'requiredDemand');
  return { benchmark, supplies, demands, routes, requiredDemand };
}

function summarizeFlows(network, amounts) {
  const breakdown = { benchmark: 0, basis: 0, shipping: 0, handling: 0, storage: 0, total: 0 };
  const routes = network.routes.flatMap((route, index) => {
    const amount = amounts[index];
    if (amount <= EPS) return [];
    breakdown.benchmark += amount * network.benchmark;
    breakdown.basis += amount * route.basisUsdPerTonne;
    breakdown.shipping += amount * route.shippingUsdPerTonne;
    breakdown.handling += amount * route.handlingUsdPerTonne;
    breakdown.storage += amount * route.storageUsdPerTonne;
    breakdown.total += amount * route.unitCost;
    return [{ from: route.from, to: route.to, quantity: quantity(amount), unitCost: money(route.unitCost), cost: money(amount * route.unitCost), capacity: route.capacity }];
  });
  for (const key of Object.keys(breakdown)) {
    if (!Number.isFinite(breakdown[key])) throw new RangeError('Computed cost exceeds the supported numerical range.');
    breakdown[key] = money(breakdown[key]);
  }
  return { routes, costBreakdown: breakdown, totalCost: breakdown.total };
}

/** Deterministic heuristic comparator; it is never used as the optimal solver. */
function baselineAllocation(network, optimizedCost) {
  const supplyRemaining = new Map(network.supplies.map(item => [item.id, item.capacity]));
  const demandRemaining = new Map(network.demands.map(item => [item.id, item.requiredDelivery]));
  const amounts = network.routes.map(() => 0);
  const order = network.routes.map((route, index) => ({ route, index })).sort((a, b) => a.route.shippingUsdPerTonne - b.route.shippingUsdPerTonne || a.index - b.index);
  for (const { route, index } of order) {
    const amount = Math.min(route.capacity, supplyRemaining.get(route.from), demandRemaining.get(route.to));
    amounts[index] = amount;
    supplyRemaining.set(route.from, supplyRemaining.get(route.from) - amount);
    demandRemaining.set(route.to, demandRemaining.get(route.to) - amount);
  }
  const unmet = [...demandRemaining.values()].reduce((sum, value) => sum + value, 0);
  const feasible = unmet <= EPS;
  const summary = summarizeFlows(network, amounts);
  return {
    method: 'Shipping-cost-first greedy allocation',
    feasible,
    totalCost: feasible ? summary.totalCost : null,
    partialCost: summary.totalCost,
    savings: feasible ? money(summary.totalCost - optimizedCost) : null,
    savingsPct: feasible && summary.totalCost > 0 ? money((summary.totalCost - optimizedCost) / summary.totalCost * 100) : null,
    delivered: quantity(amounts.reduce((sum, value) => sum + value, 0)),
    unmetDemand: quantity(unmet),
    routes: summary.routes,
    costBreakdown: summary.costBreakdown,
    comparable: feasible,
  };
}

/**
 * Exact minimum-cost maximum-flow for this continuous transportation model.
 * Bellman–Ford finds each residual shortest augmenting path, including reverse
 * arcs that undo earlier choices. A greedy route sorter cannot do that.
 * If infeasible, totalCost covers the partial maximum delivery only; savings
 * against the baseline are suppressed unless both allocations are feasible.
 */
export function optimizeNetwork(input) {
  const network = normalize(input);
  const source = 0;
  const supplyOffset = 1;
  const demandOffset = supplyOffset + network.supplies.length;
  const sink = demandOffset + network.demands.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const supplyIndex = new Map(network.supplies.map((item, i) => [item.id, supplyOffset + i]));
  const demandIndex = new Map(network.demands.map((item, i) => [item.id, demandOffset + i]));

  function edge(from, to, capacity, cost) {
    const forward = { to, reverse: graph[to].length, capacity, cost, originalCapacity: capacity };
    const reverse = { to: from, reverse: graph[from].length, capacity: 0, cost: -cost, originalCapacity: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  }
  network.supplies.forEach(item => edge(source, supplyIndex.get(item.id), item.capacity, 0));
  const routeEdges = network.routes.map(route => edge(supplyIndex.get(route.from), demandIndex.get(route.to), route.capacity, route.unitCost));
  const demandEdges = network.demands.map(item => edge(demandIndex.get(item.id), sink, item.requiredDelivery, 0));
  let delivered = 0;

  while (delivered + EPS < network.requiredDemand) {
    const distances = graph.map(() => Infinity);
    const previous = graph.map(() => null);
    distances[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let from = 0; from < graph.length; from++) {
        if (!Number.isFinite(distances[from])) continue;
        graph[from].forEach((arc, index) => {
          if (arc.capacity > EPS && distances[from] + arc.cost < distances[arc.to] - EPS) {
            distances[arc.to] = distances[from] + arc.cost;
            previous[arc.to] = { from, index };
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (!previous[sink]) break;
    let amount = network.requiredDemand - delivered;
    let cursor = sink;
    let hops = 0;
    while (cursor !== source) {
      const step = previous[cursor];
      if (!step || ++hops > graph.length) throw new Error('Invalid residual augmenting path.');
      amount = Math.min(amount, graph[step.from][step.index].capacity);
      cursor = step.from;
    }
    cursor = sink;
    while (cursor !== source) {
      const step = previous[cursor];
      const arc = graph[step.from][step.index];
      arc.capacity -= amount;
      graph[arc.to][arc.reverse].capacity += amount;
      cursor = step.from;
    }
    delivered += amount;
  }

  const amounts = routeEdges.map(arc => Math.max(0, arc.originalCapacity - arc.capacity));
  const summary = summarizeFlows(network, amounts);
  const feasible = network.requiredDemand - delivered <= EPS;
  const unmetDemand = network.demands.flatMap((item, index) => demandEdges[index].capacity > EPS ? [{ id: item.id, quantity: quantity(demandEdges[index].capacity) }] : []);
  const supplyUsed = network.supplies.map(item => ({ id: item.id, capacity: item.capacity, used: quantity(network.routes.reduce((sum, route, index) => sum + (route.from === item.id ? amounts[index] : 0), 0)) }));
  const bindingConstraints = [
    ...supplyUsed.filter(item => item.capacity - item.used <= EPS).map(item => ({ type: 'supply', id: item.id, label: `${item.id} supply capacity`, used: item.used, capacity: item.capacity })),
    ...network.routes.flatMap((route, index) => route.capacity - amounts[index] <= EPS ? [{ type: 'route', id: route.id, label: `${route.from} → ${route.to} route capacity`, used: quantity(amounts[index]), capacity: route.capacity }] : []),
    ...network.demands.flatMap((item, index) => item.requiredDelivery > EPS && demandEdges[index].capacity <= EPS ? [{ type: 'demand', id: item.id, label: `${item.id} delivery requirement`, used: quantity(item.requiredDelivery), capacity: item.requiredDelivery }] : []),
  ];
  const baseline = baselineAllocation(network, summary.totalCost);
  if (!feasible) {
    baseline.comparable = false;
    baseline.savings = null;
    baseline.savingsPct = null;
  }

  return {
    feasible,
    status: feasible ? 'optimal' : 'infeasible',
    ...summary,
    delivered: quantity(delivered),
    requiredDemand: quantity(network.requiredDemand),
    grossDemand: quantity(network.demands.reduce((sum, item) => sum + item.demand, 0)),
    unmetDemand,
    unmetDemandTotal: quantity(Math.max(0, network.requiredDemand - delivered)),
    demandRequirements: network.demands.map(({ id, demand, inventory, reserve, requiredDelivery }) => ({ id, demand, inventory, reserve, requiredDelivery })),
    supplyUsed,
    baseline,
    bindingConstraints,
    scenario: input.scenario ?? 'custom',
    assumptions: input.assumptions ?? { physicalParameters: 'User-supplied physical assumptions; verify before use.' },
    costScope: feasible ? 'Full required delivery' : 'Partial maximum delivery only; unmet requirements remain',
  };
}
