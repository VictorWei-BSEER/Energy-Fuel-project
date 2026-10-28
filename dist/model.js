/**
 * Educational tankering model. Every price and risk score below is synthetic.
 * Coordinates identify real airports; this is not a dispatch or trading feed.
 * Prices are USD per metric tonne; quantities are metric tonnes.
 */

const airport = (code, city, country, name, lat, lon, price, risk, region = 'East Asia') =>
  Object.freeze({ id: code, code, city, country, name, lat, lon, price, risk, region, synthetic: true });

export const AIRPORTS = Object.freeze([
  airport('HKG', 'Hong Kong', 'China', 'Hong Kong International', 22.308, 113.9185, 856, 32),
  airport('PVG', 'Shanghai', 'China', 'Shanghai Pudong International', 31.1443, 121.8083, 824, 24),
  airport('PEK', 'Beijing', 'China', 'Beijing Capital International', 40.0799, 116.6031, 848, 28),
  airport('ICN', 'Seoul', 'South Korea', 'Incheon International', 37.4602, 126.4407, 801, 22),
  airport('NRT', 'Tokyo', 'Japan', 'Narita International', 35.7647, 140.3864, 934, 36),
  airport('TPE', 'Taipei', 'Taiwan', 'Taiwan Taoyuan International', 25.0797, 121.2342, 877, 39),
  airport('SIN', 'Singapore', 'Singapore', 'Singapore Changi', 1.3644, 103.9915, 782, 20, 'Southeast Asia'),
  airport('BKK', 'Bangkok', 'Thailand', 'Suvarnabhumi', 13.69, 100.7501, 831, 31, 'Southeast Asia'),
  airport('MNL', 'Manila', 'Philippines', 'Ninoy Aquino International', 14.5086, 121.0198, 904, 44, 'Southeast Asia'),
  airport('KIX', 'Osaka', 'Japan', 'Kansai International', 34.4347, 135.244, 912, 34),
]);

export const SCENARIOS = Object.freeze([
  Object.freeze({ id: 'baseline', name: 'Base case', label: 'Base case', description: 'Illustrative regional prices with a small, deterministic market simulation.' }),
  Object.freeze({ id: 'gulf-disruption', name: 'Gulf supply shock', label: 'Gulf supply shock', description: 'A hypothetical Gulf supply disruption raises regional prices and illustrative supply-risk scores. Multipliers are assumptions, not measured import exposures.' }),
  Object.freeze({ id: 'refinery-outage', name: 'Singapore outage', label: 'Singapore outage', description: 'A hypothetical Singapore refinery outage raises prices most at Singapore and nearby hubs. This is a stress-test assumption, not a forecast.' }),
]);

const SHOCKS = Object.freeze({
  baseline: { price: {}, risk: {} },
  'gulf-disruption': {
    price: { HKG: 1.14, PVG: 1.1, PEK: 1.1, ICN: 1.18, NRT: 1.21, TPE: 1.17, SIN: 1.15, BKK: 1.14, MNL: 1.16, KIX: 1.2 },
    risk: { HKG: 20, PVG: 15, PEK: 15, ICN: 25, NRT: 28, TPE: 25, SIN: 22, BKK: 20, MNL: 24, KIX: 28 },
  },
  'refinery-outage': {
    price: { HKG: 1.06, PVG: 1.025, PEK: 1.02, ICN: 1.02, NRT: 1.03, TPE: 1.04, SIN: 1.23, BKK: 1.13, MNL: 1.11, KIX: 1.03 },
    risk: { HKG: 10, PVG: 3, PEK: 3, ICN: 3, NRT: 4, TPE: 6, SIN: 42, BKK: 23, MNL: 20, KIX: 4 },
  },
});

const round = (value, digits = 2) => Number(value.toFixed(digits));

function nonnegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number.`);
  }
}

/**
 * Compare buying additional fuel at origin with buying delivered fuel at the
 * destination. The simplified penalty burns a fraction of the extra uplift.
 * Reserve, payload, tank-capacity, emissions and airport limits are not modeled.
 * A zero uplift represents no tankering and incurs no handling charge.
 */
export function calculateTankering({
  originPrice,
  destinationPrice,
  extraTonnes = 10,
  burnPenaltyPct = 4,
  handlingCost = 0,
} = {}) {
  for (const [name, value] of Object.entries({ originPrice, destinationPrice, extraTonnes, burnPenaltyPct, handlingCost })) {
    nonnegative(value, name);
  }
  if (burnPenaltyPct >= 100) throw new RangeError('burnPenaltyPct must be less than 100.');

  const burnTonnes = extraTonnes * burnPenaltyPct / 100;
  const deliveredTonnes = extraTonnes - burnTonnes;
  const originCost = extraTonnes * originPrice;
  const appliedHandlingCost = extraTonnes > 0 ? handlingCost : 0;
  const avoidedDestinationCost = deliveredTonnes * destinationPrice;
  const netSavings = avoidedDestinationCost - originCost - appliedHandlingCost;

  if (![burnTonnes, deliveredTonnes, originCost, avoidedDestinationCost, netSavings].every(Number.isFinite)) {
    throw new RangeError('Inputs exceed the supported numerical range.');
  }

  return {
    extraTonnes,
    burnTonnes: round(burnTonnes, 4),
    deliveredTonnes: round(deliveredTonnes, 4),
    originCost: round(originCost),
    avoidedDestinationCost: round(avoidedDestinationCost),
    handlingCost: round(appliedHandlingCost),
    netSavings: round(netSavings),
    breakEvenPrice: deliveredTonnes > 0 ? round((originCost + appliedHandlingCost) / deliveredTonnes) : null,
    profitable: round(netSavings) > 0,
  };
}

/**
 * A repeatable simulation, not a live source. `tick` advances the simulation;
 * price changes compare to the synthetic base dataset, not yesterday's market.
 */
export function getMarketSnapshot({ tick = 0, scenario = 'baseline' } = {}) {
  nonnegative(tick, 'tick');
  if (!Number.isSafeInteger(tick)) throw new RangeError('tick must be a non-negative safe integer.');
  if (!Object.hasOwn(SHOCKS, scenario)) throw new RangeError(`Unknown scenario: ${scenario}`);

  const shock = SHOCKS[scenario];
  const airports = AIRPORTS.map((item, index) => {
    // Tick zero exactly reproduces the baseline or scenario-adjusted dataset.
    const movement = 1 + 0.008 * (Math.sin(tick * 0.31 + index * 0.79) - Math.sin(index * 0.79));
    const price = round(item.price * (shock.price[item.code] || 1) * movement);
    return {
      ...item,
      basePrice: item.price,
      price,
      change: round(price - item.price),
      changePct: round((price / item.price - 1) * 100),
      risk: Math.min(100, item.risk + (shock.risk[item.code] || 0)),
    };
  });

  return {
    tick,
    scenario,
    synthetic: true,
    source: 'Synthetic scenario assumptions; no live price feed connected',
    changeBasis: 'synthetic base price',
    airports,
    averagePrice: round(airports.reduce((sum, item) => sum + item.price, 0) / airports.length),
    minPrice: Math.min(...airports.map(item => item.price)),
    maxPrice: Math.max(...airports.map(item => item.price)),
  };
}
