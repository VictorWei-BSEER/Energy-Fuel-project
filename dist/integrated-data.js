/**
 * A small, deterministic supply network for the selected flight rotation.
 * Only geography is sourced. Capacity, stocks, costs and event timing are
 * explicit assumptions; an imported into-plane price does not reveal them.
 */
import { airportData } from './global-airports.js';
import { airportScenario, SCENARIO_DEFAULTS, GEOGRAPHY_PROVENANCE } from './scenario-data.js';

const labels = (en, zh) => ({ en, zh });
const airportsByCode = new Map(airportData.map(row => [row.code, row]));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sum = rows => rows.reduce((total, value) => total + value, 0);
const clone = value => structuredClone(value);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const field = (entity, key, en, zh, unit, meaningEn, meaningZh, extra = {}) => ({
  entity, key, label: labels(en, zh), unit, meaning: labels(meaningEn, meaningZh),
  classification: 'analyst_scenario', ...extra,
});

/** Units and labels for the network editor. A stage is an event, never a day. */
export const INTEGRATED_FIELD_CATALOG = freeze([
  field('suppliers', 'priceUsdPerT', 'Ex-source purchase price', '出库采购价', 'USD/t', 'Common fuel base plus regional supply adjustment, charged on procurement only.', '共同基础价加区域供给差价，仅对采购量计费。', { acceptsStageArray: true }),
  field('suppliers', 'capacityT', 'Shared dispatch per stage', '每阶段共享发运上限', 't/stage', 'One supplier allocation shared by every outbound route in a departure-event stage.', '同一出发事件阶段内，该供应商所有出库线路共同使用的上限。', { acceptsStageArray: true }),
  field('suppliers', 'totalCapacityT', 'Shared horizon allocation', '全行程共享供给配额', 't/horizon', 'Total procurement from this supplier across all airports and all stages.', '整个行程中，所有机场与阶段累计向该供应商采购的上限。'),
  field('routes', 'capacityT', 'Route dispatch per stage', '每阶段线路发运上限', 't/stage', 'Maximum dispatch on this inbound ground-supply link in one event stage.', '一条机场地面补给线路在单个事件阶段的最大发运量。', { acceptsStageArray: true }),
  field('routes', 'totalCapacityT', 'Route horizon allocation', '全行程线路配额', 't/horizon', 'Total dispatch on this route across the horizon; not an airport visit cap.', '整个行程经该线路发运的总量上限，不是每次到访的加油上限。'),
  field('routes', 'leadTimeStages', 'Delivery lead time', '交付提前期', 'departure events', 'Dispatch at event t arrives before uplift at event t + lead time. Zero assumes same-event pre-positioned availability, not instantaneous physical shipping.', '阶段 t 发运，在 t 加提前期阶段的加油前到货。零表示假设当阶段已有预置可供油量，不代表实体运输瞬时完成。', { integer: true }),
  field('routes', 'freightUsdPerT', 'Transport charge', '运输成本', 'USD/t', 'Reference-hub great-circle distance times the scenario transport coefficient; not an observed freight tariff.', '参照枢纽大圆距离乘情景运输系数，不是观测运价。'),
  field('routes', 'handlingUsdPerT', 'Additional ground handling', '额外地面装卸费', 'USD/t', 'An explicit optional ground-supply fee; default zero because into-plane service is charged separately.', '显式可选地面补给费用；默认零，加注服务在机场另行计费。'),
  field('routes', 'basisAdjustmentUsdPerT', 'Airport/manual basis adjustment', '机场与手动差价调整', 'USD/t', 'Airport-specific basis difference plus an explicit manual delivered-price adjustment. May be negative; not a second full fuel price.', '机场相对区域的供给差价加手动到机价调整，可为负；不重复收取全额油价。', { signed: true }),
  field('airports', 'initialInventoryT', 'Opening ground stock', '期初地面库存', 't', 'Fuel already owned before the first event. It is separate from initial onboard fuel and is not purchased again.', '首个事件前已拥有的地面燃油，与初始机上燃油不同，不再次计采购费。'),
  field('airports', 'terminalInventoryT', 'Exact final ground stock', '期末地面库存目标', 't', 'Exact end-of-horizon ground stock, identical in reference and optimized plans. Defaults to opening stock when opening stock is edited alone.', '参考方案和优化方案共同使用的精确期末地面库存；仅修改期初库存时，默认期末与期初相同。'),
  field('airports', 'storageCapacityT', 'Airport tank capacity', '机场储罐容量', 't', 'Ground-storage capacity shared by repeated visits; not aircraft tank capacity.', '同一机场多次到访共用的地面储罐容量，不是飞机油箱容量。'),
  field('airports', 'reserveT', 'Minimum ground reserve', '最低地面保留库存', 't', 'Required ground stock after each event, independent of the aircraft arrival reserve.', '每个阶段结束后的地面库存下限，与飞机到达保留油不同。'),
  field('airports', 'intoPlaneUsdPerT', 'Into-plane service', '加注服务费', 'USD/t', 'Scenario service charged once on fuel actually uplifted to the aircraft. Zero in the all-inclusive quote mode.', '情景服务费仅对实际加注入飞机的燃油计收一次；全包报价模式为零。'),
  field('airports', 'taxAdjustmentUsdPerT', 'Fiscal adjustment', '税费调整', 'USD/t', 'Explicit signed adjustment on uplift. Zero in quote mode because applicable fees are included.', '按加注量收取的可正可负税费调整；报价模式已含适用费用，设为零。', { signed: true }),
  field('airports', 'holdingUsdPerTPerStage', 'Ground holding cost', '地面库存持有费', 'USD/t/stage', 'Scenario cost on closing ground inventory per departure event, not per hour or day. Quote mode adds no holding charge.', '按每个出发事件期末地面库存计收的情景费用，不是小时或日费率；报价模式不另加库存费。'),
  field('deliveredOffers', 'capacityT', 'Local offer per stage', '每阶段本地交付上限', 't/stage', 'Assumed delivery volume only at the corresponding airport visit; an imported price does not verify allocation.', '仅在对应机场到访阶段可交付的假设量；导入价格并不能核实该配额。', { acceptsStageArray: true }),
  field('deliveredOffers', 'totalCapacityT', 'Local offer horizon allocation', '全行程本地交付配额', 't/horizon', 'Assumed cumulative volume of this all-inclusive contract, shared by repeated visits.', '全包合同在全行程内的累计假设配额，多次到访共享。'),
]);

export const INTEGRATED_DEFAULTS = Object.freeze({
  schemaVersion: 1, revision: '2026-11-13-event-network-v1',
  initialInventoryT: 0, terminalInventoryT: 0, reserveT: 0,
  leadTimeStages: 0, holdingUsdPerTPerStage: 0.5,
});

function plain(value, name) {
  if (!object(value)) throw new TypeError(`${name} must be an object.`);
  return value;
}
function numeric(value, name, { signed = false, positive = false, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && (positive ? value <= 0 : value < 0)) || (integer && !Number.isInteger(value)))
    throw new RangeError(`${name} must be a finite ${integer ? 'integer ' : ''}${signed ? 'number' : positive ? 'positive number' : 'non-negative number'}.`);
  return value;
}
function stageValue(value, name, count, options) {
  if (!Array.isArray(value)) return numeric(value, name, options);
  if (value.length !== count) throw new RangeError(`${name} requires exactly ${count} stage values.`);
  return Array.from(value, (entry, i) => numeric(entry, `${name}[${i}]`, options));
}
function knownCode(value, name) {
  if (typeof value !== 'string' || !airportsByCode.has(value.trim().toUpperCase()))
    throw new RangeError(`${name} must identify an airport in the 67-airport directory.`);
  return value.trim().toUpperCase();
}
function normalizedLegs(input) {
  plain(input, 'Flight input');
  if (!Array.isArray(input.legs) || input.legs.length > 5) throw new RangeError('Flight input must contain 0–5 route legs.');
  for (let i = 0; i < input.legs.length; i++) plain(input.legs[i], `Leg ${i + 1}`);
  if (!input.legs.length || input.legs.every(leg => object(leg) && !leg.from && !leg.to)) return [];
  const legs = input.legs.map((leg, i) => {
    plain(leg, `Leg ${i + 1}`);
    const from = knownCode(leg.from, `Leg ${i + 1} origin`), to = knownCode(leg.to, `Leg ${i + 1} destination`);
    if (from === to) throw new RangeError(`Leg ${i + 1} must connect different airports.`);
    return { ...leg, from, to };
  });
  for (let i = 1; i < legs.length; i++) if (legs[i - 1].to !== legs[i].from) throw new RangeError('Flight route must be continuous.');
  return legs;
}
const editable = Object.fromEntries(['suppliers', 'routes', 'airports', 'deliveredOffers'].map(entity => [entity, new Set(INTEGRATED_FIELD_CATALOG.filter(row => row.entity === entity).map(row => row.key))]));
function applyOverrides(network, overrides, count) {
  plain(overrides, 'Network overrides');
  for (const entity of Object.keys(overrides)) if (!Object.hasOwn(editable, entity)) throw new RangeError(`Unknown network override group: ${entity}.`);
  for (const [entity, entries] of Object.entries(overrides)) {
    plain(entries, `${entity} overrides`);
    for (const [id, values] of Object.entries(entries)) {
      const row = network[entity].find(item => (entity === 'airports' ? item.code : item.id) === id);
      if (!row) throw new RangeError(`Unknown ${entity} override in this route: ${id}.`);
      plain(values, `${entity} ${id}`);
      for (const [key, value] of Object.entries(values)) {
        if (!editable[entity].has(key)) throw new RangeError(`Unknown or immutable ${entity} field: ${key}.`);
        const catalog = INTEGRATED_FIELD_CATALOG.find(item => item.entity === entity && item.key === key);
        if (network.mode === 'delivered' && entity === 'airports' && ['intoPlaneUsdPerT', 'taxAdjustmentUsdPerT', 'holdingUsdPerTPerStage'].includes(key) && value !== 0)
          throw new RangeError('All-inclusive quote mode cannot add service, tax or holding charges.');
        row[key] = catalog.acceptsStageArray || (entity === 'suppliers' && key === 'priceUsdPerT')
          ? stageValue(value, `${id}.${key}`, count, catalog)
          : numeric(value, `${id}.${key}`, catalog);
        if (entity === 'deliveredOffers' && key === 'capacityT' && !Array.isArray(row[key]))
          row[key] = Array.from({ length: count }, (_, index) => row.visitStages.includes(index) ? row[key] : 0);
      }
      if (entity === 'airports' && Object.hasOwn(values, 'initialInventoryT') && !Object.hasOwn(values, 'terminalInventoryT')) row.terminalInventoryT = row.initialInventoryT;
      row.provenance.overriddenFields = Object.keys(values);
    }
  }
}

/**
 * Return flightInput.supplyChain. Price modes demo/scenario/modeled are aliases;
 * quotes/delivered use only caller-selected all-inclusive leg prices. The caller
 * must resolve quotation identity/validity for the planned date before solving.
 * Override maps use supplier:REGION, route:REGION:IATA, offer:IATA and airport IATA.
 */
export function buildIntegratedNetwork(flightInput, { scenarioOptions = {}, priceMode = 'scenario', overrides = {} } = {}) {
  if (!['scenario', 'demo', 'modeled', 'quotes', 'delivered'].includes(priceMode)) throw new RangeError(`Unknown price mode: ${priceMode}.`);
  plain(scenarioOptions, 'Scenario options');
  const legs = normalizedLegs(flightInput), delivered = ['quotes', 'delivered'].includes(priceMode), count = legs.length;
  const network = {
    schemaVersion: INTEGRATED_DEFAULTS.schemaVersion, revision: INTEGRATED_DEFAULTS.revision,
    mode: delivered ? 'delivered' : 'modeled',
    stageCount: count, stageUnit: 'flight-departure-event',
    stages: legs.map((leg, i) => ({ index: i, from: leg.from, to: leg.to, label: labels(`Departure ${i + 1}: ${leg.from} → ${leg.to}`, `出发阶段 ${i + 1}：${leg.from} → ${leg.to}`) })),
    suppliers: [], routes: [], airports: [], deliveredOffers: [],
    classification: delivered ? 'user_price_with_assumed_network' : 'synthetic_scenario',
    geography: clone(GEOGRAPHY_PROVENANCE),
    provenance: {
      geography: 'OurAirports coordinates only; a reference airport is not an observed refinery or terminal.',
      economics: delivered ? 'Caller-selected, all-inclusive user price inputs; not independently verified and not decomposed into refinery, freight or service prices.' : 'Deterministic economic assumptions from airportScenario, with separately identified manual delivered-price adjustments.',
      physicalNetwork: 'All allocations, opening/terminal stocks, storage and lead times are editable analyst assumptions in both data modes. Imported prices establish none of these quantities.',
      time: 'One stage per selected departure event; all receipts precede that event’s uplift. No clock-duration claim, opening cargo or post-horizon replenishment stage.',
      initialInventory: 'Opening ground fuel is already owned. Exact terminal ground stocks are identical in both comparison plans; aircraft initial and terminal fuel are separate.',
    },
    design: {
      capacity: labels('Default stage allocations equal the largest visit cap; horizon allocations equal the sum of visit caps. Regional supplier caps are shared, never copied for every destination. These normalizations avoid an unexplained default shortage.', '默认阶段配额等于最大到访上限，全行程配额等于各次上限之和。区域供应商配额共同使用，不为每个目的地复制；这些归一化设置避免无依据的初始短缺。'),
      inventory: labels('Opening and final ground stocks default to zero; ground tank size equals the largest local visit cap. Changing opening stock alone preserves it as the final target.', '期初与期末地面库存默认零，储罐容量等于本机场最大到访上限；单独修改期初库存会同时保留同等期末目标。'),
      timing: labels('Zero lead time assumes fuel available within the same event. Set a positive event lead time and pre-position stock explicitly when testing supply delays; no automatic feasibility repair occurs.', '零提前期假设同事件内有油可供。测试延迟时应显式设置正的事件提前期和预置库存，系统不自动修复不可行条件。'),
      holding: labels('Scenario holding charge is USD 0.50/t per closing event as a transparent sensitivity input, not a calibrated daily tariff. All-inclusive quote mode adds zero holding fees.', '情景持有费为每事件期末每吨 0.50 美元，是显式敏感性输入，不是校准日费率；全包报价模式不附加库存费。'),
    },
  };
  const visits = new Map();
  for (const [index, leg] of legs.entries()) {
    if (!visits.has(leg.from)) visits.set(leg.from, []);
    visits.get(leg.from).push({ leg, index });
  }
  const scenarioRows = new Map(), regionalVisits = new Map();
  for (const [code, entries] of visits) {
    const scenario = delivered ? null : airportScenario(code, scenarioOptions);
    if (scenario) scenarioRows.set(code, scenario);
    const fallbackCap = delivered ? scenarioOptions.pricing?.defaultMaxUpliftT ?? SCENARIO_DEFAULTS.pricing.defaultMaxUpliftT : scenario.maxUpliftT;
    const caps = entries.map(({ leg }) => numeric(leg.maxUpliftT === undefined ? fallbackCap : leg.maxUpliftT, `${code} visit cap`));
    const stageCap = Math.max(...caps), horizonCap = numeric(sum(caps), `${code} cumulative allocation`);
    const rawAirport = airportsByCode.get(code);
    const components = Object.fromEntries((scenario?.components || []).map(part => [part.key, part.value]));
    const stock = {
      code, label: labels(`${code} ground fuel stock`, `${code} 地面燃油库存`),
      initialInventoryT: 0, terminalInventoryT: 0, storageCapacityT: stageCap, reserveT: 0,
      intoPlaneUsdPerT: delivered ? 0 : components.service,
      taxAdjustmentUsdPerT: delivered ? 0 : components.tax,
      holdingUsdPerTPerStage: delivered ? 0 : INTEGRATED_DEFAULTS.holdingUsdPerTPerStage,
      coordinates: { lat: rawAirport.lat, lon: rawAirport.lon },
      visitStages: entries.map(entry => entry.index),
      provenance: { classification: 'analyst_scenario', capacity: 'Largest explicit or default local visit cap; no observed airport tank or inventory.', stock: 'Opening and exact final stock default to zero; shared across repeated visits.', fees: delivered ? 'All included in the imported price; no additional fees.' : 'Service and fiscal adjustments from the current scenario settings.' },
    };
    network.airports.push(stock);
    if (delivered) {
      const prices = Array(count).fill(0), stageCaps = Array(count).fill(0);
      for (const [i, { leg, index }] of entries.entries()) {
        prices[index] = numeric(leg.priceUsdPerT, `${code} active all-inclusive price at stage ${index + 1}`, { positive: true });
        stageCaps[index] = caps[i];
      }
      network.deliveredOffers.push({
        id: `offer:${code}`, airport: code, label: labels(`${code} all-inclusive offer`, `${code} 全包报价`),
        priceUsdPerT: prices, capacityT: stageCaps, totalCapacityT: horizonCap,
        visitStages: entries.map(entry => entry.index),
        provenance: { classification: 'user_supplied_price', price: 'Caller-resolved active into-plane price in USD/t, all applicable fees included. No independent supplier verification.', allocation: 'Scenario visit-cap allocation only; not a quantity guaranteed by the price record.', validity: 'Offer available only at its corresponding visit stage; resolve date validity before calling the model.' },
      });
      continue;
    }
    const regionId = scenario.regionId;
    if (!regionalVisits.has(regionId)) regionalVisits.set(regionId, []);
    regionalVisits.get(regionId).push(...caps);
    const regionBasis = scenarioOptions.regions?.[regionId]?.basisUsdPerT ?? SCENARIO_DEFAULTS.regions[regionId].basisUsdPerT;
    const prices = entries.map(({ leg }) => leg.priceUsdPerT === undefined ? scenario.priceUsdPerT : numeric(leg.priceUsdPerT, `${code} delivered scenario price`));
    if (prices.some(price => Math.abs(price - prices[0]) > 1e-9)) throw new RangeError(`${code} has conflicting per-visit scenario prices. Use one shared airport scenario price; quote mode supports stage-specific offers.`);
    const manualPriceAdjustmentUsdPerT = prices[0] - scenario.priceUsdPerT;
    network.routes.push({
      id: `route:${regionId}:${code}`, supplierId: `supplier:${regionId}`, airport: code,
      label: labels(`${scenario.referenceHub} reference → ${code}`, `${scenario.referenceHub} 参照点 → ${code}`),
      capacityT: stageCap, totalCapacityT: horizonCap, leadTimeStages: 0,
      freightUsdPerT: components.transport, handlingUsdPerT: 0,
      basisAdjustmentUsdPerT: numeric(components.basis - regionBasis + manualPriceAdjustmentUsdPerT, `${code} basis adjustment`, { signed: true }),
      referenceHub: scenario.referenceHub, distanceKm: scenario.distanceFromHubKm,
      costComponents: { commonBaseUsdPerT: components.base, regionalBasisUsdPerT: regionBasis, airportBasisAdjustmentUsdPerT: components.basis - regionBasis, manualPriceAdjustmentUsdPerT, originalScenarioDeliveredUsdPerT: scenario.priceUsdPerT, legDisplayPriceUsdPerT: prices[0] },
      provenance: { classification: 'synthetic_scenario', route: 'Reference-hub distance proxy only, not an observed shipment or supply relationship.', price: 'Base + regional basis is charged upstream; freight and airport-basis/manual adjustment here; service + tax only on uplift. Leg display price is not charged again.', manualPrice: manualPriceAdjustmentUsdPerT === 0 ? 'No manual delivered-price difference.' : 'Explicit user scenario adjustment, not a market observation.' },
    });
  }
  for (const [regionId, caps] of regionalVisits) {
    const sample = [...scenarioRows.values()].find(row => row.regionId === regionId);
    const regionalBasis = scenarioOptions.regions?.[regionId]?.basisUsdPerT ?? SCENARIO_DEFAULTS.regions[regionId].basisUsdPerT;
    const base = sample.components.find(part => part.key === 'base').value;
    network.suppliers.push({
      id: `supplier:${regionId}`, regionId,
      label: labels(`${sample.regionLabel.en} supply pool`, `${sample.regionLabel.zh}共享供给池`),
      priceUsdPerT: numeric(base + regionalBasis, `${regionId} ex-source purchase price`),
      capacityT: Math.max(...caps), totalCapacityT: numeric(sum(caps), `${regionId} horizon allocation`),
      provenance: { classification: 'analyst_scenario', capacity: 'One shared stage and horizon pool for all served airports; both allocations are derived from the explicit visit-cap assumptions.', identity: 'Editorial regional supply pool, not a named refinery, observed contract or physical hub.' },
    });
  }
  applyOverrides(network, overrides, count);
  for (const stock of network.airports) {
    if (stock.initialInventoryT > stock.storageCapacityT || stock.terminalInventoryT > stock.storageCapacityT || stock.reserveT > stock.storageCapacityT)
      throw new RangeError(`${stock.code} opening, terminal and minimum stocks must fit the airport storage capacity.`);
    if (stock.terminalInventoryT < stock.reserveT) throw new RangeError(`${stock.code} final stock must meet the ground reserve.`);
  }
  if (delivered) {
    for (const offer of network.deliveredOffers) {
      const values = Array.isArray(offer.capacityT) ? offer.capacityT : Array(count).fill(offer.capacityT);
      if (values.some((value, i) => value > 0 && !offer.visitStages.includes(i))) throw new RangeError(`${offer.id} cannot acquire availability outside its quoted visit stages.`);
    }
  } else {
    for (const route of network.routes) {
      const supplier = network.suppliers.find(row => row.id === route.supplierId);
      const stock = network.airports.find(row => row.code === route.airport);
      for (let stage = 0; stage + route.leadTimeStages < count; stage++) {
        const purchasePrice = Array.isArray(supplier.priceUsdPerT) ? supplier.priceUsdPerT[stage] : supplier.priceUsdPerT;
        const acquisition = purchasePrice + route.freightUsdPerT + route.handlingUsdPerT + route.basisAdjustmentUsdPerT;
        if (!Number.isFinite(acquisition) || acquisition < 0)
          throw new RangeError(`${route.id} stage ${stage + 1}: net acquisition cost must be non-negative before airport service and tax. A manual all-inclusive price cannot create an upstream credit on unused inventory.`);
        const deliveredCost = acquisition + stock.intoPlaneUsdPerT + stock.taxAdjustmentUsdPerT;
        if (!Number.isFinite(deliveredCost) || deliveredCost < 0)
          throw new RangeError(`${route.id} stage ${stage + 1}: complete delivered cost including service and tax must be non-negative.`);
      }
    }
  }
  return network;
}
