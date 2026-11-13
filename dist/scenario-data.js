/** Deterministic synthetic inputs. Airport coordinates are sourced; prices,
 * capacity and generic aircraft parameters are explicitly analyst assumptions.
 * No random seed, current time, forecast, supplier quote or certified performance.
 */
import { airportData } from './global-airports.js';

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const labels = (en, zh) => ({ en, zh });
const airports = new Map(airportData.map(airport => [airport.code, airport]));
export const GEOGRAPHY_PROVENANCE = freeze({
  classification: 'sourced_geography', sourceName: 'OurAirports',
  sourceUrl: 'https://ourairports.com/data/',
  snapshotRetrievedAt: '2026-11-12T21:14:01Z', observedAt: null,
  snapshotSha256: '00adda91255bcaf34a55d0dc7a27fbb569a1e67f11517014d4d9811c7c625af5',
  boundary: 'Coordinates only. No fuel price, supply capacity or flight performance is observed.',
});

export const SCENARIO_DEFAULTS = freeze({
  schemaVersion: 1, revision: '2026-11-13-synthetic-v1',
  classification: 'synthetic_scenario', earthRadiusKm: 6371.0088,
  pricing: {
    baseJetUsdPerT: 800, transportUsdPerTPerKm: .015,
    taxAdjustmentUsdPerT: 0, defaultMaxUpliftT: 120,
  },
  regions: {
    east_asia: { label: labels('East Asia scenario', '东亚情景'), referenceHub: 'ICN', basisUsdPerT: 85, serviceUsdPerT: 60 },
    southeast_asia: { label: labels('Southeast Asia scenario', '东南亚情景'), referenceHub: 'SIN', basisUsdPerT: 0, serviceUsdPerT: 45 },
    south_asia: { label: labels('South Asia scenario', '南亚情景'), referenceHub: 'DEL', basisUsdPerT: 95, serviceUsdPerT: 65 },
    gulf: { label: labels('Gulf scenario', '海湾情景'), referenceHub: 'DXB', basisUsdPerT: -70, serviceUsdPerT: 40 },
    europe: { label: labels('Europe scenario', '欧洲情景'), referenceHub: 'AMS', basisUsdPerT: 110, serviceUsdPerT: 75 },
    north_america: { label: labels('North America scenario', '北美情景'), referenceHub: 'DFW', basisUsdPerT: 60, serviceUsdPerT: 65 },
    south_america: { label: labels('South America scenario', '南美情景'), referenceHub: 'GRU', basisUsdPerT: 120, serviceUsdPerT: 80 },
    africa: { label: labels('Africa scenario', '非洲情景'), referenceHub: 'JNB', basisUsdPerT: 150, serviceUsdPerT: 85 },
    oceania: { label: labels('Oceania scenario', '大洋洲情景'), referenceHub: 'SYD', basisUsdPerT: 140, serviceUsdPerT: 80 },
  },
});

/** Experimental-design rationale, not an empirical calibration of regions. */
export const SCENARIO_DESIGN = freeze({
  commonBase: labels(
    'USD 800/t is a normalization for experiments. The fuel-only optimizer responds to price ratios; multiplying all prices by the same positive factor scales cost without changing feasible fuel quantities. Changing only the common base keeps add-ons fixed, changes price ratios and can change the preferred plan.',
    '800 美元/吨是实验归一化基准。仅以燃油成本为目标时，决策取决于价格比；所有价格同乘一个正数会同比改变成本，不改变可行油量。仅调整基础价会保留其他差价，因而改变价格比和可能的最优方案。'),
  regionalSpread: labels(
    'Starting regional bases span −8.75% to +18.75% of the common base; service allowances span 5% to 10.625%. These deliberately exercise price spreads above and below carriage hurdles, rather than estimate observed regional price rankings.',
    '初始区域差价覆盖基础价的 −8.75% 至 +18.75%，服务费覆盖 5% 至 10.625%。这样可测试低于和高于携油成本门槛的价差，并非估计真实地区价格排名。'),
  transport: labels(
    'The starting coefficient 0.015 USD/t/km adds USD 15/t for each 1,000 km of reference distance: 1.875% of the default base. This linear sensitivity rule is replaced by actual routing and tariffs when available.',
    '初始系数 0.015 美元/吨/公里意味着参照距离每增加 1,000 公里，成本增加 15 美元/吨，即默认基础价的 1.875%。取得实际路径与运价后应替换这条线性敏感性规则。'),
  supply: labels(
    'The starting common 120 t/visit cap exceeds the generic widebody tank of 110 t, so unexplained airport bottlenecks do not drive the default result. Lower caps create explicit supply-stress experiments.',
    '初始统一的 120 吨/次供油上限高于通用宽体机的 110 吨油箱容量，使默认结果不受无依据的机场瓶颈主导。下调上限可构建明确的供应压力实验。'),
  profiles: labels(
    'Starting generic-profile masses deliberately leave different tank, takeoff and landing headroom. Widebody zero-fuel mass is 150 t, leaving 90 t at takeoff and 40 t at landing; narrowbody zero-fuel mass is 54 t, leaving 25 t and 13 t. These are coherent teaching assumptions, not aircraft calibration.',
    '初始通用机型质量参数保留不同的油箱、起飞与落地余量：宽体机无油重量 150 吨，起飞与落地余量为 90 吨和 40 吨；窄体机为 54 吨，余量为 25 吨和 13 吨。这是内部一致的实验假设，不是机型校准。'),
});
const REGIONAL_HYPOTHESES = freeze({
  southeast_asia: labels('Starting hypothesis: neutral supply basis for the reference comparison; the SIN anchor has zero transport distance. This is not an observed Singapore quotation.', '初始假设：采用零供给差价作为参照，SIN 自身的参照运输距离为零；这不是新加坡实盘报价。'),
  gulf: labels('Starting hypothesis: a discounted-origin case (−70 USD/t) tests whether an earlier purchase can overcome carriage burn. This is not evidence of current Gulf discounts.', '初始假设：设置低价出发地（−70 美元/吨），测试提前购买能否抵消携油耗油；这不代表当前海湾地区存在该折扣。'),
  east_asia: labels('Starting hypothesis: a moderate supply premium (+85 USD/t), paired with a mid-range service allowance, creates a comparison against neutral and discounted origins.', '初始假设：中等供给溢价（+85 美元/吨）与中档服务费配对，用于和中性、折扣出发地比较。'),
  south_asia: labels('Starting hypothesis: an intermediate premium case (+95 USD/t) adds a distinct comparison between the moderate and high-premium scenarios.', '初始假设：中间溢价情景（+95 美元/吨），在中等与较高溢价之间增加一个可比较条件。'),
  europe: labels('Starting hypothesis: a higher combined supply/service case (+110 USD/t basis, 75 USD/t service) tests expensive onward uplift. No observed European cost level is asserted.', '初始假设：较高供给和服务成本（差价 +110、服务费 75 美元/吨），测试后续站高成本加油；不代表欧洲真实成本水平。'),
  north_america: labels('Starting hypothesis: a modest premium (+60 USD/t) creates cases where carriage may cost more than the price difference. This is an assigned experiment, not a regional ranking.', '初始假设：较小溢价（+60 美元/吨），构建携油成本可能超过价差的情景；这是一组指定实验条件，不是地区排名。'),
  south_america: labels('Starting hypothesis: a high-premium comparison (+120 USD/t), with distance added separately, tests whether logistics and extra-weight burn change the preferred purchase location.', '初始假设：较高溢价比较（+120 美元/吨），运输距离另计，用于测试物流与额外携油耗油如何改变采购地点。'),
  africa: labels('Starting hypothesis: the highest supply/service stress case in this matrix (+150 USD/t basis, 85 USD/t service). This deliberately tests an upper cost condition, not African market evidence.', '初始假设：该矩阵中最高的供给和服务压力条件（差价 +150、服务费 85 美元/吨），用于测试成本上限情景，并非非洲市场证据。'),
  oceania: labels('Starting hypothesis: a high-premium case (+140 USD/t) combined with long reference distances tests sensitivity to geographically separated stops; it is not a measured island-supply cost.', '初始假设：较高溢价（+140 美元/吨）与较长参照距离配合，测试分散站点的敏感性；不是测得的岛屿供油成本。'),
});

const sharedProfile = {
  routeFactor: 1.05, holdingReserveH: .5, contingencyFraction: .05,
  carryModel: 'exponential', initialFuelT: 8,
};
export const AIRCRAFT_PROFILES = freeze({
  widebody: {
    ...sharedProfile, key: 'widebody', label: labels('Generic widebody scenario', '通用宽体机情景'),
    tankCapacityT: 110, maxTakeoffWeightT: 240, maxLandingWeightT: 190,
    emptyWeightT: 128, payloadT: 22, cruiseSpeedKph: 850, cruiseBurnTPerH: 4.8,
    climbTimeH: .3, climbBurnT: 2, taxiBurnT: .3,
    reserveMinimumT: 6, holdingBurnTPerH: 3, alternateFuelT: 2,
    carryCoefficientPerH: .025, minStageKm: 200, maxStageKm: 14000, maxAirborneHours: 17,
  },
  narrowbody: {
    ...sharedProfile, key: 'narrowbody', label: labels('Generic narrowbody scenario', '通用窄体机情景'),
    initialFuelT: 4, tankCapacityT: 26, maxTakeoffWeightT: 79, maxLandingWeightT: 67,
    emptyWeightT: 42, payloadT: 12, cruiseSpeedKph: 840, cruiseBurnTPerH: 2.4,
    climbTimeH: .25, climbBurnT: .8, taxiBurnT: .2,
    reserveMinimumT: 3, holdingBurnTPerH: 1.5, alternateFuelT: 1,
    carryCoefficientPerH: .035, minStageKm: 150, maxStageKm: 6500, maxAirborneHours: 8.5,
  },
});

const inputField = (key, en, zh, unit, replacementSource, extra = {}) => ({
  key, label: labels(en, zh), unit, classification: 'analyst_scenario', replacementSource, ...extra,
});
export const ASSUMPTION_CATALOG = freeze([
  inputField('pricing.baseJetUsdPerT', 'Common jet-fuel base', '共同航油基础价', 'USD/t', 'Dated licensed jet-fuel assessment; a public EIA wholesale series is context, not an airport offer.', { formula: 'Analyst normalization, default 800; not fitted to a current price.' }),
  inputField('region.basisUsdPerT', 'Regional supply adjustment', '区域供给差价', 'USD/t', 'Supplier contract differential for the same product, period, unit and delivery basis.'),
  inputField('region.referenceHub', 'Scenario reference hub', '情景参照枢纽', 'IATA code', 'Verified refinery/terminal supply chain and transport origin.', { formula: 'Editorial regional assignment, not an observed supply relationship.' }),
  inputField('pricing.transportUsdPerTPerKm', 'Distance transport coefficient', '距离运输系数', 'USD/t/km', 'Actual freight, pipeline or road tariff and delivered routing.', { formula: 'Transport proxy = great-circle hub distance × coefficient.' }),
  inputField('region.serviceUsdPerT', 'Into-plane service adjustment', '加注服务费', 'USD/t', 'Dated into-plane handling and delivery fee schedule.'),
  inputField('pricing.taxAdjustmentUsdPerT', 'Fiscal adjustment', '税费调整', 'USD/t', 'Applicable exemption/tax evidence for the operator and mission.', { formula: 'Default 0 is an assumption, not a tax-exemption claim.' }),
  inputField('pricing.defaultMaxUpliftT', 'Supply cap per visit', '每次到访供油上限', 't/visit', 'Confirmed supplier allocation for the specific uplift window.', { formula: 'Flat default 120 for every airport; not stock or daily throughput.' }),
  inputField('aircraft.routeFactor', 'Route-distance multiplier', '航路距离系数', 'ratio', 'Planned operational flight path or observed trajectory.'),
  inputField('aircraft.cruiseSpeedKph', 'Cruise groundspeed proxy', '巡航地速假设', 'km/h', 'Operator-approved performance with winds and routing.'),
  inputField('aircraft.cruiseBurnTPerH', 'Cruise burn rate', '巡航耗油率', 't/h', 'Operator performance/flight-planning fuel calculations.'),
  inputField('aircraft.climbTimeH', 'Non-cruise time allowance', '非巡航时间假设', 'h', 'Operator climb/descent profile and route-specific time.'),
  inputField('aircraft.climbBurnT', 'Non-cruise fuel allowance', '非巡航燃油假设', 't', 'Operator climb/descent fuel calculation.'),
  inputField('aircraft.taxiBurnT', 'Taxi fuel', '滑行燃油', 't', 'Departure airport and aircraft-specific taxi/APU plan.'),
  inputField('aircraft.contingencyFraction', 'Contingency on base burn', '基础耗油应急比例', 'ratio', 'Applicable operator fuel policy; this is not a regulatory minimum.'),
  inputField('aircraft.holdingReserveH', 'Holding-time allowance', '等待飞行时间', 'h', 'Applicable operator reserve policy and planned holding requirements.'),
  inputField('aircraft.holdingBurnTPerH', 'Holding burn rate', '等待飞行耗油率', 't/h', 'Aircraft performance at the planned holding conditions.'),
  inputField('aircraft.alternateFuelT', 'Alternate-fuel allowance', '备降燃油', 't', 'Actual alternate route and operator-approved fuel plan.'),
  inputField('aircraft.reserveMinimumT', 'Scenario reserve floor', '情景保留油下限', 't', 'Operator-approved required arrival fuel; no regulatory equivalence is claimed.'),
  inputField('aircraft.carryCoefficientPerH', 'Marginal carriage coefficient', '额外携油每小时系数', '1/h', 'Aircraft-specific marginal-weight fuel response.', { sourceUrl: 'https://www.icao.int/sites/default/files/environmental-protection/Documents/EnvironmentalReports/2022/ENVReport2022_Art38.pdf', note: 'ICAO discusses a 2.5–4.5%/h indicative range. The selected profile value and retention law are analyst assumptions, not aircraft calibration.' }),
  inputField('aircraft.carryModel', 'Carriage retention law', '携油留存近似', 'linear | exponential', 'Validated operator performance model.', { formula: 'Loss = k × time (linear) or 1 − exp(−k × time) (exponential).' }),
  inputField('aircraft.emptyWeightT', 'Operating-empty weight proxy', '使用空重假设', 't', 'Aircraft-specific operating-empty weight and crew/equipment definition.'),
  inputField('aircraft.payloadT', 'Fixed payload', '固定载荷', 't', 'Approved passenger/cargo/load plan.'),
  inputField('aircraft.tankCapacityT', 'Tank capacity', '油箱容量', 't', 'Aircraft usable fuel capacity using the applicable fuel density.'),
  inputField('aircraft.maxTakeoffWeightT', 'Maximum takeoff weight', '最大起飞重量', 't', 'Flight-specific certified and runway/performance-limited takeoff mass.'),
  inputField('aircraft.maxLandingWeightT', 'Maximum landing weight', '最大落地重量', 't', 'Flight-specific certified and operational landing mass.'),
  inputField('aircraft.initialFuelT', 'Initial onboard fuel', '初始机上燃油', 't', 'Measured departure inventory / previous-leg remaining fuel.'),
  inputField('aircraft.minStageKm', 'Lower scenario-distance envelope', '情景适用最短距离', 'km', 'Validated lower limit of the selected aircraft performance approximation.'),
  inputField('aircraft.maxStageKm', 'Upper scenario-distance envelope', '情景适用最长距离', 'km', 'Payload-dependent flight planning and validated model scope; not published aircraft range.'),
  inputField('aircraft.maxAirborneHours', 'Upper scenario-time envelope', '情景适用最长航时', 'h', 'Validated time envelope for the selected performance approximation.'),
]);

function number(value, name, { positive = false, negative = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!negative && (positive ? value <= 0 : value < 0)))
    throw new RangeError(`${name} must be ${negative ? 'a finite number' : positive ? 'a finite positive number' : 'a finite non-negative number'}.`);
  return value;
}
function airport(code) {
  if (typeof code !== 'string' || !airports.has(code.trim().toUpperCase()))
    throw new RangeError(`Unknown airport: ${String(code)}. Choose an airport in the 67-airport directory.`);
  return airports.get(code.trim().toUpperCase());
}
function plain(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object.`);
  return value;
}
function optionsOf(value) {
  const options = value === undefined ? {} : plain(value, 'Options');
  for (const key of Object.keys(options)) if (!['pricing', 'regions', 'airportOverrides', 'aircraft', 'initialFuelT'].includes(key)) throw new RangeError(`Unknown scenario option: ${key}.`);
  for (const key of ['pricing', 'regions', 'airportOverrides', 'aircraft']) if (options[key] !== undefined) plain(options[key], key);
  for (const [id, override] of Object.entries(options.regions || {})) {
    if (!Object.hasOwn(SCENARIO_DEFAULTS.regions, id)) throw new RangeError(`Unknown scenario region: ${id}.`);
    plain(override, `Region ${id}`);
    for (const key of Object.keys(override)) if (!['referenceHub', 'basisUsdPerT', 'serviceUsdPerT'].includes(key)) throw new RangeError(`Unknown editable region field: ${key}.`);
  }
  for (const [code, override] of Object.entries(options.airportOverrides || {})) {
    if (!airports.has(code)) throw new RangeError(`Airport override must use a known uppercase IATA code: ${code}.`);
    plain(override, `Airport ${code}`);
    for (const key of Object.keys(override)) if (!['referenceHub', 'basisUsdPerT', 'serviceUsdPerT', 'maxUpliftT'].includes(key)) throw new RangeError(`Unknown airport override field: ${key}.`);
  }
  return options;
}
function mergeKnown(defaults, overrides, name) {
  const copy = { ...defaults };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!Object.hasOwn(defaults, key)) throw new RangeError(`Unknown ${name} field: ${key}.`);
    copy[key] = value;
  }
  return copy;
}
function pricingFor(options) {
  const pricing = mergeKnown(SCENARIO_DEFAULTS.pricing, options.pricing, 'pricing');
  number(pricing.baseJetUsdPerT, 'Common jet-fuel base', { positive: true });
  number(pricing.transportUsdPerTPerKm, 'Transport coefficient');
  number(pricing.taxAdjustmentUsdPerT, 'Fiscal adjustment', { negative: true });
  number(pricing.defaultMaxUpliftT, 'Supply cap per visit');
  return pricing;
}
function regionFor(item) {
  if (['AE', 'QA', 'SA', 'OM', 'KW', 'BH'].includes(item.region)) return 'gulf';
  if (['SG', 'TH', 'MY', 'ID', 'PH', 'VN'].includes(item.region)) return 'southeast_asia';
  if (['IN', 'LK', 'BD'].includes(item.region)) return 'south_asia';
  return { AS: 'east_asia', EU: 'europe', NA: 'north_america', SA: 'south_america', AF: 'africa', OC: 'oceania' }[item.continent];
}
export function greatCircleDistanceKm(from, to) {
  const a = typeof from === 'string' ? airport(from) : from;
  const b = typeof to === 'string' ? airport(to) : to;
  for (const item of [a, b]) {
    if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lon) || Math.abs(item.lat) > 90 || Math.abs(item.lon) > 180)
      throw new RangeError('Coordinates must be bounded finite WGS84 degrees.');
  }
  const radians = Math.PI / 180;
  const latA = a.lat * radians, latB = b.lat * radians;
  const haversine = Math.sin((latB - latA) / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin((b.lon - a.lon) * radians / 2) ** 2;
  return 2 * SCENARIO_DEFAULTS.earthRadiusKm * Math.asin(Math.sqrt(Math.max(0, Math.min(1, haversine))));
}

export function airportScenario(code, rawOptions = {}) {
  const options = optionsOf(rawOptions), item = airport(code), pricing = pricingFor(options);
  const regionId = regionFor(item);
  for (const id of Object.keys(options.regions || {})) if (!Object.hasOwn(SCENARIO_DEFAULTS.regions, id)) throw new RangeError(`Unknown scenario region: ${id}.`);
  const region = mergeKnown(SCENARIO_DEFAULTS.regions[regionId], options.regions?.[regionId], 'region');
  const base = { referenceHub: region.referenceHub, basisUsdPerT: region.basisUsdPerT, serviceUsdPerT: region.serviceUsdPerT, maxUpliftT: pricing.defaultMaxUpliftT };
  const selected = mergeKnown(base, options.airportOverrides?.[item.code], 'airport override');
  number(selected.basisUsdPerT, 'Regional adjustment', { negative: true });
  number(selected.serviceUsdPerT, 'Into-plane service');
  number(selected.maxUpliftT, 'Supply cap per visit');
  const referenceHub = airport(selected.referenceHub).code;
  const distanceFromHubKm = greatCircleDistanceKm(item, airport(referenceHub));
  const component = (key, en, zh, value, formula, classification = 'analyst_scenario') => ({ key, label: labels(en, zh), value, unit: 'USD/t', classification, formula });
  const components = [
    component('base', 'Common jet-fuel base', '共同航油基础价', pricing.baseJetUsdPerT, 'pricing.baseJetUsdPerT'),
    component('basis', 'Regional supply adjustment', '区域供给差价', selected.basisUsdPerT, 'region.basisUsdPerT, or explicit airport override'),
    component('transport', 'Distance transport proxy', '距离运输代理成本', distanceFromHubKm * pricing.transportUsdPerTPerKm, 'distanceFromHubKm × pricing.transportUsdPerTPerKm', 'derived_scenario'),
    component('service', 'Into-plane service adjustment', '加注服务费', selected.serviceUsdPerT, 'region.serviceUsdPerT, or explicit airport override'),
    component('tax', 'Fiscal adjustment', '税费调整', pricing.taxAdjustmentUsdPerT, 'pricing.taxAdjustmentUsdPerT; zero is an assumption'),
  ];
  const priceUsdPerT = components.reduce((total, entry) => total + entry.value, 0);
  number(priceUsdPerT, 'Generated airport price', { positive: true });
  const basisPctOfBase = 100 * (selected.basisUsdPerT / pricing.baseJetUsdPerT);
  const servicePctOfBase = 100 * (selected.serviceUsdPerT / pricing.baseJetUsdPerT);
  const transportUsdPer1000Km = 1000 * pricing.transportUsdPerTPerKm;
  for (const [key, value] of Object.entries({ basisPctOfBase, servicePctOfBase, transportUsdPer1000Km }))
    number(value, `Derived ${key}`, { negative: true });
  return {
    code: item.code, airport: { ...item }, classification: 'synthetic_scenario',
    regionId, regionLabel: { ...region.label }, referenceHub, distanceFromHubKm,
    priceUsdPerT, maxUpliftT: selected.maxUpliftT, components,
    design: {
      defaultHypothesis: { ...REGIONAL_HYPOTHESES[regionId] },
      basisPctOfBase, servicePctOfBase, transportUsdPer1000Km,
      interpretation: 'Starting regional roles are an explicit sensitivity-design matrix, not empirical market rankings. Current percentages reflect any user overrides.',
    },
    assumptions: { ...pricing, ...selected, referenceHub },
    provenance: {
      geography: { ...GEOGRAPHY_PROVENANCE },
      price: 'Deterministic analyst scenario; no observed airport quote or supplier contract.',
      capacity: 'Assumed tonnes per visit, not observed inventory, allocation or daily throughput.',
      hub: 'Scenario reference airport used only as a distance proxy; no actual supply route is asserted.',
      revision: SCENARIO_DEFAULTS.revision,
    },
  };
}

function resolvedProfile(key, options) {
  if (!Object.hasOwn(AIRCRAFT_PROFILES, key)) throw new RangeError(`Unknown generic aircraft profile: ${key}.`);
  const profile = mergeKnown(AIRCRAFT_PROFILES[key], options.aircraft, 'aircraft');
  // Labels and profile identity are stable; only model assumptions may be overridden.
  for (const field of ['key', 'label']) if (options.aircraft && Object.hasOwn(options.aircraft, field)) throw new RangeError(`Aircraft ${field} is metadata, not an editable parameter.`);
  for (const [field, value] of Object.entries(profile)) {
    if (['key', 'label', 'carryModel'].includes(field)) continue;
    number(value, field, { positive: ['tankCapacityT', 'maxTakeoffWeightT', 'maxLandingWeightT', 'cruiseSpeedKph', 'maxStageKm', 'maxAirborneHours'].includes(field) });
  }
  if (profile.routeFactor < 1) throw new RangeError('Route-distance multiplier must be at least 1.');
  if (profile.minStageKm > profile.maxStageKm) throw new RangeError('Minimum scenario distance must not exceed maximum distance.');
  if (profile.contingencyFraction > 1) throw new RangeError('Contingency fraction must not exceed 1.');
  if (!['linear', 'exponential'].includes(profile.carryModel)) throw new RangeError('Carriage model must be linear or exponential.');
  return profile;
}

export function deriveLeg(from, to, aircraftKey = 'widebody', rawOptions = {}) {
  const options = optionsOf(rawOptions), origin = airport(from), destination = airport(to);
  if (origin.code === destination.code) throw new RangeError('Origin and destination must differ.');
  const profile = resolvedProfile(aircraftKey, options), price = airportScenario(origin.code, options);
  const distanceKm = greatCircleDistanceKm(origin, destination);
  const routedDistanceKm = distanceKm * profile.routeFactor;
  const cruiseTimeH = routedDistanceKm / profile.cruiseSpeedKph;
  const durationH = cruiseTimeH + profile.climbTimeH;
  const cruiseBurnT = cruiseTimeH * profile.cruiseBurnTPerH;
  const baseBurnT = cruiseBurnT + profile.climbBurnT;
  const reserveParts = {
    contingencyT: baseBurnT * profile.contingencyFraction,
    holdingT: profile.holdingReserveH * profile.holdingBurnTPerH,
    alternateT: profile.alternateFuelT,
    floorT: profile.reserveMinimumT,
  };
  const reserveT = Math.max(reserveParts.floorT, reserveParts.contingencyT + reserveParts.holdingT + reserveParts.alternateT);
  const zeroFuelWeightT = profile.emptyWeightT + profile.payloadT;
  const carriageExposure = profile.carryCoefficientPerH * durationH;
  const carryBurnRate = profile.carryModel === 'linear' ? carriageExposure : -Math.expm1(-carriageExposure);
  for (const [key, value] of Object.entries({ distanceKm, routedDistanceKm, cruiseTimeH, cruiseBurnT, durationH, baseBurnT, reserveT, zeroFuelWeightT, carriageExposure, carryBurnRate })) number(value, `Derived ${key}`);
  const issues = [], prefix = `${origin.code}–${destination.code}: `;
  const issue = (code, scope, message) => issues.push({ code, scope, message });
  if (distanceKm < profile.minStageKm) issue('stage_below_envelope', 'envelope', `${prefix}distance ${distanceKm.toFixed(0)} km is below this scenario's ${profile.minStageKm} km lower approximation limit.`);
  if (distanceKm > profile.maxStageKm) issue('stage_above_envelope', 'envelope', `${prefix}distance ${distanceKm.toFixed(0)} km exceeds this scenario's ${profile.maxStageKm} km upper approximation limit.`);
  if (durationH > profile.maxAirborneHours) issue('time_above_envelope', 'envelope', `${prefix}derived airborne time ${durationH.toFixed(2)} h exceeds this scenario's ${profile.maxAirborneHours} h time envelope.`);
  if (carryBurnRate >= 1) issue('carriage_retention_nonpositive', 'parameter-domain', `${prefix}carriage assumptions leave no positive retained fuel fraction; reduce the coefficient/time or revise the approximation.`);
  if (baseBurnT + reserveT + profile.taxiBurnT > profile.tankCapacityT) issue('tank_minimum', 'minimum-feasibility', `${prefix}minimum departure fuel exceeds the assumed tank capacity.`);
  if (zeroFuelWeightT + baseBurnT + reserveT > profile.maxTakeoffWeightT) issue('takeoff_minimum', 'minimum-feasibility', `${prefix}minimum takeoff mass exceeds the assumed takeoff limit.`);
  if (zeroFuelWeightT + reserveT > profile.maxLandingWeightT) issue('landing_minimum', 'minimum-feasibility', `${prefix}minimum landing mass exceeds the assumed landing limit.`);
  const errors = issues.map(entry => entry.message);
  const envelopeErrors = issues.filter(entry => entry.scope === 'envelope').map(entry => entry.message);
  const feasibilityErrors = issues.filter(entry => entry.scope === 'minimum-feasibility').map(entry => entry.message);
  return {
    from: origin.code, to: destination.code, priceUsdPerT: price.priceUsdPerT,
    baseBurnT, taxiBurnT: profile.taxiBurnT, reserveT, carryBurnRate, zeroFuelWeightT,
    maxUpliftT: price.maxUpliftT, distanceKm, routedDistanceKm, durationH,
    valid: errors.length === 0, errors, issues, envelopeErrors, feasibilityErrors,
    rangeStatus: envelopeErrors.length ? 'outside-scenario-envelope' : 'within-scenario-envelope',
    classification: 'derived_scenario',
    derivation: {
      profileKey: aircraftKey, profile: { ...profile, label: { ...profile.label } },
      cruiseTimeH, cruiseBurnT, reserveParts, carriageExposure,
      formulas: {
        distanceKm: 'Spherical haversine from sourced coordinates; radius 6371.0088 km.',
        durationH: 'greatCircleKm × routeFactor / cruiseSpeedKph + climbTimeH',
        baseBurnT: 'cruiseTimeH × cruiseBurnTPerH + climbBurnT',
        reserveT: 'max(reserveMinimumT, contingencyFraction × baseBurnT + holdingReserveH × holdingBurnTPerH + alternateFuelT)',
        carryBurnRate: profile.carryModel === 'linear' ? 'carryCoefficientPerH × durationH' : '1 − exp(−carryCoefficientPerH × durationH)',
        zeroFuelWeightT: 'emptyWeightT + payloadT',
      },
      airportPrice: price, geography: { ...GEOGRAPHY_PROVENANCE },
      performance: 'Generic analyst parameters, not a named aircraft or certified operational performance.',
      reserve: 'Scenario decomposition only; not a claim of regulatory or operator-policy compliance.',
    },
  };
}

export function deriveScenario(route, aircraftKey = 'widebody', rawOptions = {}) {
  const options = optionsOf(rawOptions), profile = resolvedProfile(aircraftKey, options);
  if (!Array.isArray(route) || !route.length) throw new RangeError('Choose a route with 1–5 legs.');
  let sequence;
  if (route.every(value => typeof value === 'string')) {
    if (route.length < 2 || route.length > 6) throw new RangeError('Choose 2–6 airports for 1–5 legs.');
    sequence = route.map(code => airport(code).code);
  } else {
    if (route.length > 5 || !route.every(value => value && typeof value === 'object' && !Array.isArray(value))) throw new RangeError('Provide 1–5 continuous route legs.');
    sequence = [airport(route[0].from).code];
    for (const leg of route) {
      if (airport(leg.from).code !== sequence.at(-1)) throw new RangeError('Route legs must be continuous.');
      sequence.push(airport(leg.to).code);
    }
  }
  const legs = sequence.slice(0, -1).map((from, index) => deriveLeg(from, sequence[index + 1], aircraftKey, options));
  const initialFuelT = options.initialFuelT === undefined ? profile.initialFuelT : number(options.initialFuelT, 'Initial fuel');
  const errors = legs.flatMap(leg => leg.errors);
  if (initialFuelT > profile.tankCapacityT) errors.push('Initial fuel exceeds the assumed tank capacity.');
  return {
    scenarioLabel: 'Generated synthetic scenario · editable assumptions · not observed prices or certified performance',
    classification: 'synthetic_scenario', revision: SCENARIO_DEFAULTS.revision,
    valid: errors.length === 0, errors, route: sequence,
    aircraft: { name: profile.label.en, profileKey: aircraftKey, tankCapacityT: profile.tankCapacityT, maxTakeoffWeightT: profile.maxTakeoffWeightT, maxLandingWeightT: profile.maxLandingWeightT },
    initialFuelT, legs,
    assumptions: { pricing: pricingFor(options), aircraft: { ...profile, label: { ...profile.label } }, regions: structuredClone(options.regions || {}), airportOverrides: structuredClone(options.airportOverrides || {}) },
    provenance: { geography: { ...GEOGRAPHY_PROVENANCE }, generatedInputs: 'Deterministic functions of explicit manual assumptions; no random values, price observations or automatic feasibility repair.', feasibility: 'Envelope checks precede optimization; visit supply caps, existing fuel and cross-leg constraints still require the rotation solver.' },
  };
}

export function buildScenarioDataset(rawOptions = {}) {
  const options = optionsOf(rawOptions);
  const records = airportData.map(item => airportScenario(item.code, options));
  return {
    schemaVersion: SCENARIO_DEFAULTS.schemaVersion, revision: SCENARIO_DEFAULTS.revision,
    classification: 'synthetic_scenario', observedAt: null,
    coverage: { count: records.length, description: 'All 67 selected airports have generated scenario inputs; this is not verified quotation coverage.' },
    geographySource: { ...GEOGRAPHY_PROVENANCE },
    assumptions: { pricing: pricingFor(options), regions: Object.fromEntries(Object.entries(SCENARIO_DEFAULTS.regions).map(([key, value]) => [key, mergeKnown(value, options.regions?.[key], 'region')])), airportOverrides: structuredClone(options.airportOverrides || {}) },
    designRationale: structuredClone(SCENARIO_DESIGN),
    assumptionCatalog: structuredClone(ASSUMPTION_CATALOG),
    aircraftProfiles: Object.fromEntries(Object.keys(AIRCRAFT_PROFILES).map(key => [key, resolvedProfile(key, options)])), records,
    boundary: 'All economic, supply and performance values are synthetic analyst scenarios. Coordinates are sourced separately. No current airport quote, stock, availability, actual flight or certified aircraft capability is inferred.',
  };
}
