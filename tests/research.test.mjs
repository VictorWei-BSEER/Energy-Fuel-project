import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const exhibit = new URL('../dist/research/', import.meta.url);
const [html, script, css, inputText, resultText] = await Promise.all([
  readFile(new URL('index.html', exhibit), 'utf8'),
  readFile(new URL('research.js', exhibit), 'utf8'),
  readFile(new URL('research.css', exhibit), 'utf8'),
  readFile(new URL('../research/inputs.json', import.meta.url), 'utf8'),
  readFile(new URL('../research/results.json', import.meta.url), 'utf8'),
]);
const inputs = JSON.parse(inputText), results = JSON.parse(resultText);
const cases = [...results.durationCases, ...results.routeCases];

function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual), `${label} is finite`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} matches ${expected}`);
}

function pureModel() {
  const sandbox = {};
  vm.runInNewContext(script, sandbox, { filename: 'research.js' });
  return sandbox.FuelResearch;
}

function mount() {
  const { document, window } = parseHTML(html);
  const form = document.querySelector('#scenario-form');
  const defaults = new Map([...form.querySelectorAll('input')].map(input => [input, {
    value: input.getAttribute('value'), checked: input.hasAttribute('checked'),
  }]));

  // Linkedom has no native form validation/reset. Simulate the constraints used
  // here, retaining initial values because Linkedom also reflects .value writes
  // into attributes. These tests exercise app events, not a rendering engine.
  form.checkValidity = () => [...form.querySelectorAll('input[type="number"]')].every(input => {
    if (input.value === '' && input.required) return false;
    const value = Number(input.value);
    if (input.value === '' || !Number.isFinite(value)) return false;
    for (const [attribute, compare] of [['min', (a, b) => a < b], ['max', (a, b) => a > b]]) {
      if (input.hasAttribute(attribute) && compare(value, Number(input.getAttribute(attribute)))) return false;
    }
    const step = Number(input.getAttribute('step') || 1);
    const base = Number(input.getAttribute('min') || 0);
    return Math.abs((value - base) / step - Math.round((value - base) / step)) < 1e-9;
  });
  form.reset = () => {
    for (const [input, initial] of defaults) {
      input.value = initial.value;
      if (initial.checked) input.setAttribute('checked', '');
      else input.removeAttribute('checked');
    }
  };
  const blobs = [], downloads = [], revoked = [], timers = [];
  let networkCalls = 0;
  const blockedNetwork = () => { networkCalls++; throw new Error('Offline research must not request network data'); };
  window.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ href: this.getAttribute('href'), filename: this.getAttribute('download') });
  };
  const sandbox = {
    document, window, Blob, console,
    fetch: blockedNetwork, WebSocket: blockedNetwork, XMLHttpRequest: blockedNetwork,
    setTimeout: callback => { timers.push(callback); return timers.length; },
    URL: {
      createObjectURL: blob => { blobs.push(blob); return `blob:research-test-${blobs.length}`; },
      revokeObjectURL: url => revoked.push(url),
    },
  };
  vm.runInNewContext(script, sandbox, { filename: 'research.js' });
  const $ = selector => document.querySelector(selector);
  const emit = (selector, type) => $(selector).dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  const setValue = (selector, value) => { $(selector).value = String(value); emit(selector, 'input'); };
  const chooseModel = model => {
    for (const input of form.querySelectorAll('input[name="model"]')) {
      if (input.value === model) input.setAttribute('checked', '');
      else input.removeAttribute('checked');
    }
    emit(`input[name="model"][value="${model}"]`, 'change');
  };
  return { $, document, window, setValue, chooseModel, emit, blobs, downloads, revoked, timers, networkCalls: () => networkCalls };
}

test('research browser model reproduces all 36 frozen Python cases and both quantity bases', () => {
  const { compute } = pureModel();
  assert.equal(cases.length, 36);
  const numericKeys = ['retentionFraction', 'extraOriginUpliftT', 'additionalBurnT', 'additionalCo2T', 'breakEvenPriceRatio', 'breakEvenPremiumPct'];
  for (const expected of cases) {
    // Supply only independent inputs: passing output fields could conceal a
    // missing calculation if an implementation copied its argument object.
    const actual = compute({
      durationH: expected.durationH, kPerHour: expected.kPerHour, model: expected.model,
      originPriceScenarioUsdPerT: expected.originPriceScenarioUsdPerT,
      carbonUsdPerTCo2: expected.carbonUsdPerTCo2,
      extraCostUsdPerDeliveredT: expected.extraCostUsdPerDeliveredT,
      requiredDeliveryT: expected.requiredDeliveryT,
      extraOriginHeadroomT: expected.localInterruption.extraOriginHeadroomT,
    });
    for (const key of numericKeys) close(actual[key], expected[key], `${expected.id}.${key}`);
    for (const group of ['localInterruption', 'sharedQuota']) {
      for (const [key, value] of Object.entries(expected[group])) close(actual[group][key], value, `${expected.id}.${group}.${key}`);
    }
  }
  const central = compute();
  close(central.extraOriginUpliftT, 50 / 43, '4h net delivery requires 50/43 t extra origin fuel');
  close(central.additionalBurnT, 7 / 43, '4h net-delivery burn');
  close(central.additionalCo2T, 3.16 * 7 / 43, '4h net-delivery CO2');
  close(central.localInterruption.destinationUpliftDisplacedT, .86, '1t gross-origin displacement');
  close(central.localInterruption.additionalBurnT, .14, '1t gross-origin burn');
  close(central.localInterruption.additionalCo2T, .4424, '1t gross-origin CO2');
});

test('research model rejects invalid domains without manufacturing useful fuel', () => {
  const { compute } = pureModel();
  for (const input of [
    { durationH: -1 }, { durationH: '4' }, { durationH: true }, { kPerHour: NaN },
    { originPriceScenarioUsdPerT: 0 }, { carbonUsdPerTCo2: -1 },
    { extraCostUsdPerDeliveredT: Infinity }, { durationH: 40 },
    { model: 'unsupported' }, { requiredDeliveryT: 0 }, { extraOriginHeadroomT: -1 },
  ]) assert.throws(() => compute(input), { name: 'RangeError' });
  for (const model of ['linear', 'exponential']) {
    const zero = compute({ model, durationH: 0 });
    assert.equal(zero.additionalBurnT, 0);
    assert.equal(zero.additionalCo2T, 0);
    assert.equal(zero.breakEvenPremiumPct, 0);
    const bounded = compute({ model, requiredDeliveryT: .5, extraOriginHeadroomT: 10 });
    close(bounded.localInterruption.destinationUpliftDisplacedT, .5, 'ample headroom cannot overfill the gap');
    close(bounded.localInterruption.gapRemainingT, 0, 'ample headroom closes exactly the required gap');
    const unavailable = compute({ model, extraOriginHeadroomT: 0 });
    assert.equal(unavailable.localInterruption.destinationUpliftDisplacedT, 0);
    assert.equal(unavailable.localInterruption.additionalBurnT, 0);
  }
});

test('research default display keeps net delivery and gross-origin interruption accounting separate', () => {
  const ui = mount(), { $, document } = ui;
  assert.equal($('#duration').value, '4');
  assert.equal($('#carry-rate').value, '3.5');
  assert.equal($('#premium-value').textContent, '16.3');
  assert.equal($('#origin-uplift-value').textContent, '1.163');
  assert.equal($('#burn-value').textContent, '0.163');
  assert.equal($('#co2-value').textContent, '0.514');
  assert.equal($('#displacement-value').textContent, '0.860');
  assert.equal($('#local-burn-value').textContent, '0.140');
  assert.equal($('#local-co2-value').textContent, '0.442');
  assert.equal($('#local-case-delivery').textContent, '0.860');
  assert.match($('.result-boundary').textContent, /both purchase options are available/);
  assert.match($('#alternative-result').textContent, /15\.0%/);
  assert.match($('#balance-chart').getAttribute('aria-label'), /1\.163.*1\.000.*0\.163/);
  assert.equal(document.querySelectorAll('#study-airports circle').length, inputs.airports.length);
  assert.equal(document.querySelectorAll('#study-routes path').length, inputs.routes.length);
  assert.equal(document.querySelectorAll('#route-table-rows tr').length, inputs.routes.length);
  for (const row of results.routeCases.filter(row => row.model === 'linear' && row.carbonUsdPerTCo2 === 0)) {
    assert.match($('#route-table-rows').textContent, new RegExp(`${row.breakEvenPremiumPct.toFixed(1).replace('.', '\\.')}%`));
  }
  assert.equal(ui.networkCalls(), 0);
});

test('research controls update price thresholds, carbon costs and formulation then reset to 4h', () => {
  const { $, setValue, chooseModel, emit } = mount();
  setValue('#duration', 8);
  assert.equal($('#duration-value').textContent, '8.0 hours');
  assert.equal($('#premium-value').textContent, '38.9');
  assert.equal($('#displacement-value').textContent, '0.720');
  setValue('#carbon-price', 100);
  assert.equal($('#premium-value').textContent, '51.2');
  assert.match($('#premium-explanation').textContent, /illustrative input/);
  setValue('#extra-cost', 100);
  assert.equal($('#premium-value').textContent, '61.2');
  chooseModel('exponential');
  assert.match($('#alternative-result').textContent, /Linear sensitivity: 61\.2%/);
  assert.notEqual($('#premium-value').textContent, '61.2');
  emit('#reset-scenario', 'click');
  assert.equal($('#duration').value, '4');
  assert.equal($('#carbon-price').value, '0');
  assert.equal($('#extra-cost').value, '0');
  assert.equal($('#premium-value').textContent, '16.3');
  assert.equal($('input[name="model"]:checked').value, 'linear');
  chooseModel('exponential');
  assert.equal($('#premium-value').textContent, '15.0');
  setValue('#carry-rate', 4.5);
  assert.equal($('#carry-rate-value').textContent, '4.5% / hour');
  assert.equal($('#premium-value').textContent, '19.7');
});

test('invalid numeric controls hide stale results and disable export until corrected', () => {
  const { $, setValue, emit, downloads } = mount();
  for (const [control, value] of [['#origin-price', ''], ['#origin-price', '0'], ['#carbon-price', '-10'], ['#carbon-price', '15'], ['#extra-cost', '10001']]) {
    emit('#reset-scenario', 'click');
    setValue(control, value);
    assert.equal($('#scenario-results').hidden, true);
    assert.equal($('#scenario-error').hidden, false);
    assert.equal($('#export-scenario').disabled, true);
    assert.equal($('#local-case-delivery').textContent, '—');
    emit('#export-scenario', 'click');
    assert.equal(downloads.length, 0, 'invalid results cannot be exported through programmatic clicks');
  }
  emit('#reset-scenario', 'click');
  assert.equal($('#scenario-results').hidden, false);
  assert.equal($('#scenario-error').hidden, true);
  assert.equal($('#export-scenario').disabled, false);
  assert.equal($('#premium-value').textContent, '16.3');
});

test('scenario download records frozen provenance and limitations without presenting a quote', async () => {
  const { $, emit, blobs, downloads, timers, revoked, networkCalls } = mount();
  emit('#export-scenario', 'click');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, 'fuel-atlas-tankering-scenario.json');
  const data = JSON.parse(await blobs[0].text());
  assert.equal(data.inputsSha256, results.meta.inputsSha256);
  assert.equal(data.result.durationH, 4);
  assert.equal(data.result.model, 'linear');
  assert.equal(data.result.originPriceScenarioUsdPerT, 1000);
  assert.equal(data.interpretation.aircraftFeasibilityEstablished, false);
  assert.equal(data.interpretation.flightContinuationEstablished, false);
  assert.match(data.interpretation.prices, /not observed airport quotes/);
  assert.equal(data.interpretation.directCO2Only, true);
  assert.equal($('a[download]'), null, 'temporary export link is removed');
  for (const expire of timers) expire();
  assert.deepEqual(revoked, ['blob:research-test-1']);
  assert.equal(networkCalls(), 0);
});

test('offline exhibit embeds exact frozen data, accessible controls and local runtime assets', async () => {
  const { document } = parseHTML(html);
  const embedded = JSON.parse(document.querySelector('#research-data').textContent);
  assert.deepEqual(embedded.inputs, inputs);
  assert.deepEqual(embedded.results, results);
  assert.equal(createHash('sha256').update(inputText).digest('hex'), results.meta.inputsSha256);
  assert.equal(document.querySelector('script[type="module"]'), null, 'classic script runs under file://');
  assert.ok(document.querySelector('#map-base path'), 'base map is embedded, not requested');
  const assets = [...document.querySelectorAll('script[src],link[rel="stylesheet"],img[src]')];
  assert.ok(assets.length >= 2);
  for (const asset of assets) {
    const href = asset.getAttribute('src') || asset.getAttribute('href');
    assert.match(href, /^\.\//, `${href} is packaged locally`);
    await access(new URL(href, exhibit));
  }
  assert.doesNotMatch(css, /@import\b|url\(\s*['"]?(?:https?:|\/\/)/i, 'no externally loaded stylesheet/font');
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(new Set(ids).size, ids.length, 'IDs are unique');
  for (const element of document.querySelectorAll('label[for],[aria-labelledby],[aria-describedby],a[href^="#"]')) {
    const references = [element.getAttribute('for'), element.getAttribute('aria-labelledby'), element.getAttribute('aria-describedby'), element.getAttribute('href')?.slice(1)].filter(Boolean).join(' ').split(/\s+/);
    for (const id of references) assert.ok(document.getElementById(id), `reference target ${id} exists`);
  }
  for (const control of document.querySelectorAll('#scenario-form input')) {
    assert.ok(control.closest('label') || document.querySelector(`label[for="${control.id}"]`), `${control.name} has a label`);
  }
  assert.match(css, /@media\s+print/);
  assert.match(css, /prefers-reduced-motion/);
});
