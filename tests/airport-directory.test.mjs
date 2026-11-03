import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { AIRPORT_DIRECTORY, airportLabelLayout } from '../src/airport-directory.js';
import { BOUNDS, project } from '../dist/asia-map.js';

test('the directory contains the 50 largest eligible airports with an auditable cutoff', () => {
  const { airports, nextExcluded, minimumAnnualPassengers, sources } = AIRPORT_DIRECTORY;
  assert.equal(airports.length, 50);
  assert.equal(new Set(airports.map(a => a.iata)).size, 50);
  assert.equal(airports[0].iata, 'HND');
  assert.equal(airports.at(-1).iata, 'ITM');
  assert.equal(minimumAnnualPassengers, 15_157_501);
  assert.ok(nextExcluded.every(a => a.annualPassengers < minimumAnnualPassengers));
  for (const [index, airport] of airports.entries()) {
    assert.equal(airport.rank, index + 1);
    assert.equal(airport.trafficYear, 2024);
    assert.ok(airport.lon >= BOUNDS.west && airport.lon <= BOUNDS.east);
    assert.ok(airport.lat >= BOUNDS.south && airport.lat <= BOUNDS.north);
    assert.ok(sources[airport.trafficSource]?.url.startsWith('https://'));
    assert.ok(index === 0 || airport.annualPassengers <= airports[index - 1].annualPassengers);
    assert.equal(Object.hasOwn(airport, 'fuelPrice'), false);
    assert.equal(Object.hasOwn(airport, 'demand'), false);
  }
  assert.equal(airports.some(a => ['URC', 'CGK', 'DPS', 'DEL'].includes(a.iata)), false, 'airports outside this frame are excluded');
});

test('airport labels avoid each other and retain a label for a selected dense-city airport', () => {
  for (const selected of [null, 'SHA', 'ITM', 'GMP']) {
    const layout = airportLabelLayout(AIRPORT_DIRECTORY.airports, project, selected);
    if (selected) assert.ok(layout.has(selected));
    const boxes = [...layout.values()].map(label => label.box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.equal(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, false);
    }
  }
});

test('airport selection, zoom, and keyboard inspection preserve calculation inputs', async t => {
  const { document, window } = parseHTML(await readFile(new URL('../dist/network.html', import.meta.url), 'utf8'));
  const originals = new Map();
  for (const [name, value] of Object.entries({ document, window, Option: function Option(text, value) { const option = document.createElement('option'); option.textContent = text; option.value = value; return option; } })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === value); },
  });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  t.after(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const $ = selector => document.querySelector(selector);
  $('#horizon').value = '7';
  $('#benchmark').value = '920';
  await import('../dist/airport-map.js?directory-dom-test');
  assert.equal(document.querySelectorAll('[data-directory-airport]').length, 50);
  assert.equal(document.querySelectorAll('#directory-rows tr').length, 50);
  const emit = (target, type, key) => { const event = new window.Event(type, { bubbles: true, cancelable: true }); if (key) event.key = key; target.dispatchEvent(event); };
  $('#planning-airport-select').value = 'HND';
  emit($('#planning-airport-select'), 'change');
  assert.equal($('#planning-airport-detail').hidden, false);
  assert.match($('#planning-airport-name').textContent, /HND.*Haneda/);
  assert.match($('#planning-airport-meta').textContent, /85.9M.*2024/);
  emit($('#airport-zoom-in'), 'click');
  assert.notEqual($('#atlas-map').getAttribute('viewBox'), '0 0 900 680');
  emit($('#airport-zoom-reset'), 'click');
  assert.equal($('#atlas-map').getAttribute('viewBox'), '0 0 900 680');
  emit($('[data-directory-airport="HND"]'), 'keydown', 'End');
  assert.equal($('#planning-airport-select').value, 'ITM');
  assert.equal($('#horizon').value, '7');
  assert.equal($('#benchmark').value, '920');
});
