import { buildIntegratedNetwork } from './integrated-data.js';

let owner = null, flight = null, config = {}, overrides = {}, network = null, preview = null, invalid = false;
const groups = ['suppliers','routes','airports','deliveredOffers'];
const copy = value => value === null ? null : structuredClone(value);
function context() {
  if (owner !== globalThis.document) {
    owner = globalThis.document; flight = null; config = {}; overrides = {}; network = null; preview = null; invalid = false;
  }
}
function notify(source) {
  if (globalThis.document) document.dispatchEvent(new CustomEvent('integratednetworkchange', { detail: { network:copy(network), preview:copy(preview), source, invalid } }));
}
function retainedOverrides(base) {
  const kept = {};
  for (const group of groups) {
    const ids = new Set((base[group] || []).map(row => group === 'airports' ? row.code : row.id));
    for (const [id, fields] of Object.entries(overrides[group] || {})) {
      if (!ids.has(id)) continue;
      const values = { ...fields };
      if (base.mode === 'delivered' && group === 'airports') for (const key of ['intoPlaneUsdPerT','taxAdjustmentUsdPerT','holdingUsdPerTPerStage']) delete values[key];
      if (Object.keys(values).length) (kept[group] ||= {})[id] = values;
    }
  }
  return kept;
}
export function syncIntegratedNetwork(input, options = {}) {
  context(); flight = copy(input); config = copy(options); invalid = false;
  preview = null;
  try {
    const base = buildIntegratedNetwork(flight, config);
    overrides = retainedOverrides(base);
    preview = copy(base);
    for (const group of groups) for (const row of preview[group] || []) Object.assign(row, overrides[group]?.[group === 'airports' ? row.code : row.id] || {});
    network = buildIntegratedNetwork(flight, { ...config, overrides });
    preview = copy(network);
  } catch { network = null; invalid = true; }
  notify('model-sync');
  return copy(network);
}
export function getIntegratedNetwork() { context(); return copy(network); }
export function getIntegratedViewState() { context(); return {network:copy(network),preview:copy(preview),invalid}; }
export function getIntegratedOverrides() { context(); return copy(overrides); }
export function setIntegratedNetworkOverrides(patch) {
  context();
  if (!flight || !preview) throw new Error('Choose a complete route first.');
  const candidate = copy(overrides);
  for (const [group, rows] of Object.entries(patch)) {
    if (!groups.includes(group)) throw new RangeError('Unknown supply input group.');
    for (const [id, fields] of Object.entries(rows)) (candidate[group] ||= {})[id] = { ...candidate[group]?.[id], ...fields };
  }
  const next = buildIntegratedNetwork(flight, { ...config, overrides:candidate });
  overrides = candidate; network = next; preview = copy(next); invalid = false; notify('user-edit');
  return copy(network);
}
export function resetIntegratedNetwork() {
  context(); overrides = {};
  try { network = flight ? buildIntegratedNetwork(flight, config) : null; preview = copy(network); invalid = false; }
  catch { network = null; preview = null; invalid = true; } notify('user-edit'); return copy(network);
}
