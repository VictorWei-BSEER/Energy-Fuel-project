import { SCENARIO_DEFAULTS, buildScenarioDataset } from './scenario-data.js';

function defaults() {
  return {
    pricing: { ...SCENARIO_DEFAULTS.pricing },
    regions: Object.fromEntries(Object.entries(SCENARIO_DEFAULTS.regions).map(([id, region]) => [id, {
      referenceHub: region.referenceHub,
      basisUsdPerT: region.basisUsdPerT,
      serviceUsdPerT: region.serviceUsdPerT,
    }])),
  };
}
let options = defaults();
export const getScenarioOptions = () => structuredClone(options);
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
};

// One set of assumptions feeds both the airport ledger and the route model.
// They live only in this page session; only the interface language is persisted.
export function setScenarioOptions(next) {
  object(next, 'Scenario settings');
  for (const key of Object.keys(next)) if (!['pricing', 'regions'].includes(key)) throw new RangeError(`Unknown setting ${key}.`);
  for (const key of ['pricing', 'regions']) if (Object.hasOwn(next, key)) object(next[key], key);
  const candidate = { pricing: { ...options.pricing, ...next.pricing }, regions: structuredClone(options.regions) };
  for (const [id, update] of Object.entries(next.regions || {})) {
    object(update, `Region ${id}`);
    candidate.regions[id] = { ...candidate.regions[id], ...update };
  }
  buildScenarioDataset(candidate); // Validate the whole dataset before changing either view.
  if (JSON.stringify(candidate) === JSON.stringify(options)) return getScenarioOptions();
  options = candidate;
  if (globalThis.document) document.dispatchEvent(new CustomEvent('scenarioassumptionschange', { detail: { options: getScenarioOptions() } }));
  return getScenarioOptions();
}

export const resetScenarioOptions = () => setScenarioOptions(defaults());
