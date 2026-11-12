/* Fuel Atlas research exhibit. Classic script so the offline package needs no server.
 * The inputs are normalized scenarios. No airport quote, stock or flight forecast is inferred.
 */
(function (root) {
  'use strict';
  const CO2_FACTOR = 3.16;
  const DEFAULTS = Object.freeze({ durationH: 4, kPerHour: .035, model: 'linear', originPriceScenarioUsdPerT: 1000, carbonUsdPerTCo2: 0, extraCostUsdPerDeliveredT: 0, requiredDeliveryT: 1, extraOriginHeadroomT: 1 });
  function number(value, name, minimum = 0, exclusive = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (exclusive ? value <= minimum : value < minimum)) throw new RangeError(`${name} must be a finite ${exclusive ? 'positive' : 'non-negative'} number.`);
    return value;
  }
  function compute(parameters = {}) {
    const p = { ...DEFAULTS, ...parameters };
    if (Object.hasOwn(parameters, 'originPriceUsdPerT') && !Object.hasOwn(parameters, 'originPriceScenarioUsdPerT')) p.originPriceScenarioUsdPerT = parameters.originPriceUsdPerT;
    const t = number(p.durationH, 'Duration'), k = number(p.kPerHour, 'Carriage coefficient');
    const price = number(p.originPriceScenarioUsdPerT, 'Assumed origin price', 0, true);
    const carbon = number(p.carbonUsdPerTCo2, 'Carbon charge'), fee = number(p.extraCostUsdPerDeliveredT, 'Additional cost');
    const q = number(p.requiredDeliveryT, 'Useful delivery', 0, true), headroom = number(p.extraOriginHeadroomT, 'Extra origin headroom');
    if (!['linear', 'exponential'].includes(p.model)) throw new RangeError('Choose linear or exponential carriage.');
    const a = p.model === 'linear' ? 1 - k * t : Math.exp(-k * t);
    if (!Number.isFinite(a) || a <= 0 || a > 1) throw new RangeError('These assumptions leave no positive delivered fuel fraction.');
    const uplift = q / a, burn = uplift - q, co2 = CO2_FACTOR * burn;
    const ratio = 1 / a + CO2_FACTOR * carbon / price * (1 - a) / a + fee / price;
    const used = Math.min(headroom, uplift), displaced = a * used;
    const result = {
      ...p, resultClassification: 'conditional_scenario', retentionFraction: a,
      extraOriginUpliftT: uplift, additionalBurnT: burn, additionalCo2T: co2,
      breakEvenPriceRatio: ratio, breakEvenPremiumPct: (ratio - 1) * 100,
      localInterruption: { requiredGapT: q, extraOriginHeadroomT: headroom, extraOriginUsedT: used, destinationUpliftDisplacedT: displaced, gapRemainingT: Math.max(0, q - displaced), additionalBurnT: used - displaced, additionalCo2T: CO2_FACTOR * (used - displaced) },
      sharedQuota: { baselineRegionalUseT: q, tankeringRegionalUseT: uplift, additionalRegionalUseT: burn },
    };
    if (![uplift, burn, co2, ratio, used, displaced].every(Number.isFinite)) throw new RangeError('The inputs exceed the supported numerical range.');
    return result;
  }
  root.FuelResearch = Object.freeze({ compute, defaults: DEFAULTS, co2Factor: CO2_FACTOR });
  if (typeof document === 'undefined') return;
  const $ = selector => document.querySelector(selector);
  if (!$('#scenario-form')) return;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const format = (value, digits = 1) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  let frozen = { inputs: {}, results: {} }, current = null;
  try { frozen = JSON.parse($('#research-data')?.textContent || '{}'); } catch { /* Empty data is rendered as unavailable, never invented. */ }
  const modelName = model => model === 'linear' ? 'Linear' : 'Exponential';
  function getInputs() {
    const form = $('#scenario-form');
    if (!form.checkValidity()) throw new RangeError('Enter valid values within the displayed input limits.');
    return {
      durationH: Number($('#duration').value), kPerHour: Number($('#carry-rate').value) / 100,
      model: document.querySelector('input[name="model"]:checked')?.value,
      originPriceScenarioUsdPerT: Number($('#origin-price').value), carbonUsdPerTCo2: Number($('#carbon-price').value),
      extraCostUsdPerDeliveredT: Number($('#extra-cost').value), requiredDeliveryT: 1, extraOriginHeadroomT: 1,
    };
  }
  function renderBalance(result) {
    const chart = $('#balance-chart'), width = 680, x = 20, usefulWidth = width * result.retentionFraction;
    chart.setAttribute('aria-label', `${format(result.extraOriginUpliftT, 3)} tonnes extra origin uplift: ${format(result.requiredDeliveryT, 3)} useful tonnes delivered and ${format(result.additionalBurnT, 3)} additional tonnes burned.`);
    chart.innerHTML = `<text x="${x}" y="20" class="svg-value" font-size="16">${format(result.extraOriginUpliftT, 3)} t extra origin uplift</text><rect x="${x}" y="36" width="${usefulWidth}" height="28" fill="#59634c"/><rect x="${x + usefulWidth}" y="36" width="${width - usefulWidth}" height="28" fill="#bd3c29"/><text x="${x}" y="91" class="svg-label" font-size="15">1.000 t delivered</text><text x="${x + width}" y="91" class="svg-label" text-anchor="end" font-size="15">${format(result.additionalBurnT, 3)} t burned</text>`;
  }
  function update() {
    $('#duration-value').textContent = `${format(Number($('#duration').value))} hours`;
    $('#carry-rate-value').textContent = `${format(Number($('#carry-rate').value))}% / hour`;
    try {
      const inputs = getInputs(), result = compute(inputs); current = result;
      $('#scenario-error').hidden = true; $('#scenario-results').hidden = false; $('#export-scenario').disabled = false;
      $('#premium-value').textContent = format(result.breakEvenPremiumPct);
      $('#origin-uplift-value').textContent = format(result.extraOriginUpliftT, 3);
      $('#burn-value').textContent = format(result.additionalBurnT, 3);
      $('#co2-value').textContent = format(result.additionalCo2T, 3);
      $('#displacement-value').textContent = format(result.localInterruption.destinationUpliftDisplacedT, 3);
      $('#local-burn-value').textContent = format(result.localInterruption.additionalBurnT, 3);
      $('#local-co2-value').textContent = format(result.localInterruption.additionalCo2T, 3);
      $('#local-case-delivery').textContent = format(result.localInterruption.destinationUpliftDisplacedT, 3);
      $('#premium-explanation').textContent = result.carbonUsdPerTCo2 || result.extraCostUsdPerDeliveredT
        ? `The destination price must exceed the assumed origin price by this premium to cover carriage and the selected additional charges. Origin price ${format(result.originPriceScenarioUsdPerT, 0)} USD/t is an illustrative input.`
        : 'The destination price must exceed the origin price by this premium to cover carriage fuel. With no additional charges, this ratio does not depend on an assumed price level.';
      const alternative = compute({ ...inputs, model: inputs.model === 'linear' ? 'exponential' : 'linear' });
      $('#alternative-result').textContent = `${modelName(alternative.model)} sensitivity: ${format(alternative.breakEvenPremiumPct)}% premium. The difference is model-form uncertainty, not a measured confidence interval.`;
      renderBalance(result);
    } catch (error) {
      current = null; $('#scenario-error').textContent = error.message; $('#scenario-error').hidden = false;
      $('#scenario-results').hidden = true; $('#export-scenario').disabled = true; $('#local-case-delivery').textContent = '—';
    }
  }
  function renderGeography() {
    const airports = frozen.inputs?.airports, routes = frozen.inputs?.routes;
    const cases = frozen.results?.routeCases, ranges = frozen.results?.routeRanges;
    if (!Array.isArray(airports) || !Array.isArray(routes) || !Array.isArray(cases) || !Array.isArray(ranges)) {
      $('#route-table-rows').innerHTML = '<tr><td colspan="4">Frozen research results unavailable.</td></tr>';
      $('#coordinate-provenance').textContent = 'No coordinate or model result substitutes have been generated.';
      return;
    }
    const project = point => [(point.lon - 92) / 59 * 900, (51 - point.lat) / 57 * 680];
    const byCode = new Map(airports.map(airport => [airport.iata, airport]));
    const city = { SIN: 'Singapore', HKG: 'Hong Kong', NRT: 'Narita' };
    $('#study-routes').innerHTML = routes.map(route => {
      const origin = byCode.get(route.origin), destination = byCode.get(route.destination);
      if (!origin || !destination) return '';
      const [x1, y1] = project(origin), [x2, y2] = project(destination);
      return `<path class="study-line" d="M${x1},${y1}Q${(x1 + x2) / 2 + 38},${(y1 + y2) / 2 + 12} ${x2},${y2}"><title>${esc(route.id)}: schematic study connection</title></path>`;
    }).join('');
    $('#study-airports').innerHTML = '<text x="230" y="230" class="map-label">CHINA</text><text x="675" y="125" class="map-label">JAPAN</text>' + airports.map(airport => {
      const [x, y] = project(airport), left = airport.iata === 'HKG', dx = left ? -18 : 18, anchor = left ? 'end' : 'start';
      return `<g transform="translate(${x},${y})"><title>${esc(airport.name)}: ${airport.lat}°, ${airport.lon}°; source coordinates only</title><circle class="airport-dot" r="8"/><text class="airport-label" x="${dx}" y="-2" text-anchor="${anchor}">${esc(airport.iata)}</text><text class="airport-city" x="${dx}" y="19" text-anchor="${anchor}">${esc(city[airport.iata] || airport.name)}</text></g>`;
    }).join('');
    const central = routes.map(route => cases.find(item => item.routeId === route.id && item.model === 'linear' && item.carbonUsdPerTCo2 === 0));
    if (central.some(row => !row)) { $('#route-table-rows').innerHTML = '<tr><td colspan="4">Incomplete frozen route results.</td></tr>'; return; }
    const plotted = central.map(row => ({ row, range: ranges.find(item => item.routeId === row.routeId)?.linear }));
    if (plotted.some(item => !item.range)) { $('#route-table-rows').innerHTML = '<tr><td colspan="4">Incomplete frozen sensitivity ranges.</td></tr>'; return; }
    const max = Math.max(10, Math.ceil(Math.max(...plotted.map(item => item.range.premiumPctMax)) / 10) * 10);
    const x = value => 130 + value / max * 470, ticks = Array.from({ length: 7 }, (_, i) => max * i / 6);
    const grid = ticks.map(value => `<line x1="${x(value)}" y1="26" x2="${x(value)}" y2="248" stroke="#d2d3c7"/><text x="${x(value)}" y="277" class="svg-label" font-size="13" text-anchor="middle">${format(value, 0)}%</text>`).join('');
    const bars = plotted.map(({ row, range }, index) => {
      const y = 65 + index * 75;
      return `<text x="0" y="${y + 5}" class="svg-value" font-size="17">${esc(row.routeId.replace('-', '–'))}</text><line x1="${x(range.premiumPctMin)}" y1="${y}" x2="${x(range.premiumPctMax)}" y2="${y}" stroke="#59634c" stroke-width="3"/><line x1="${x(range.premiumPctMin)}" y1="${y - 7}" x2="${x(range.premiumPctMin)}" y2="${y + 7}" stroke="#59634c"/><line x1="${x(range.premiumPctMax)}" y1="${y - 7}" x2="${x(range.premiumPctMax)}" y2="${y + 7}" stroke="#59634c"/><circle cx="${x(row.breakEvenPremiumPct)}" cy="${y}" r="7" fill="#bd3c29"/><text x="${x(row.breakEvenPremiumPct)}" y="${y - 16}" class="svg-value" font-size="16" text-anchor="middle">${format(row.breakEvenPremiumPct)}%</text>`;
    }).join('');
    $('#route-chart').innerHTML = grid + bars;
    $('#route-table-rows').innerHTML = plotted.map(({ row, range }) => `<tr><th scope="row">${esc(row.routeId.replace('-', '–'))}</th><td>${format(row.distanceKm, 0)} km</td><td>${format(row.durationH)} h</td><td><strong>${format(row.breakEvenPremiumPct)}%</strong><small>${format(range.premiumPctMin)}–${format(range.premiumPctMax)}%</small></td></tr>`).join('');
    const source = frozen.inputs.airportSnapshot || {};
    $('#coordinate-provenance').textContent = `Coordinates: ${source.sourceName || 'OurAirports'}; collected ${source.originalFetchedAt || 'date unavailable'}. Record-level observation dates are not supplied. Coordinate snapshot SHA-256: ${source.snapshotSha256 || 'not supplied'}.`;
    if (frozen.results.headline && Number.isFinite(frozen.results.headline.breakEvenPremiumPct)) $('#cover-premium').textContent = format(frozen.results.headline.breakEvenPremiumPct);
  }
  $('#scenario-form').addEventListener('input', update);
  $('#scenario-form').addEventListener('change', update);
  $('#scenario-form').addEventListener('submit', event => event.preventDefault());
  $('#reset-scenario').addEventListener('click', () => { $('#scenario-form').reset(); update(); });
  $('#export-scenario').addEventListener('click', () => {
    if (!current) return;
    const data = { type: 'fuel-atlas-tankering-research-scenario', schemaVersion: 1, exportedAt: new Date().toISOString(), inputsSha256: frozen.results?.meta?.inputsSha256 || null, result: current, interpretation: { prices: 'Illustrative inputs, not observed airport quotes', quantityBasis: 'Economic result per useful tonne delivered; local interruption separately bounded by extra origin headroom', directCO2Only: true, aircraftFeasibilityEstablished: false, flightContinuationEstablished: false } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'fuel-atlas-tankering-scenario.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  renderGeography(); update();
})(globalThis);
