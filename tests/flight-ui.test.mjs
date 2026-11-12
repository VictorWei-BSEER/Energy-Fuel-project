import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { polyline } from "./svg-polyline-helper.mjs";

let mountId = 0;
async function mount(t, { preset = "eastasia", reducedMotion = false } = {}) {
  const [html, sourceText] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/data/fuel-sources.json", import.meta.url),
      "utf8",
    ),
  ]);
  const { document, window } = parseHTML(html);
  window.location = { hash: "", replace() {} };
  window.matchMedia = () => ({ matches: reducedMotion });
  // Linkedom has no SVG geometry. Measure the emitted M/L polylines;
  // browser QA additionally verifies native SVG sampling and rendering.
  const geometryPrototypes = [
    window.SVGElement.prototype,
    window.HTMLElement.prototype,
  ];
  const geometryDescriptors = [];

  for (const [name, value] of Object.entries({
    getTotalLength() { return polyline(this).length; },
    getPointAtLength(distance) { return polyline(this).at(distance); },
  })) {
    for (const prototype of geometryPrototypes) {
      geometryDescriptors.push([
        prototype,
        name,
        Object.getOwnPropertyDescriptor(prototype, name),
      ]);
      Object.defineProperty(prototype, name, { value, configurable: true });
    }
  }
  const originals = new Map();
  for (const [name, value] of Object.entries({
    document,
    window,
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    fetch: async (url) => {
      assert.equal(url, "./data/fuel-sources.json");
      return { ok: true, json: async () => JSON.parse(sourceText) };
    },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    for (const [prototype, name, descriptor] of geometryDescriptors) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else delete prototype[name];
    }
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  // Linkedom does not implement native form validity or select.value setters.
  // These tests drive app events; optimizer tests validate numeric constraints.
  Object.defineProperty(document.querySelector("#flight-date"), "validity", {
    value: { valid: true },
  });
  for (const [id, initial] of [["aircraft", "b787"], ["scenario-preset", "global"], ["map-scope", "global"]]) {
    let value = initial;
    Object.defineProperty(document.querySelector(`#${id}`), "value", {
      get: () => value, set: next => { value = String(next); }, configurable: true,
    });
  }
  const dialog = document.querySelector("#import-dialog");
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
  };
  await import(`../dist/flight-app.js?flight-ui-test=${++mountId}`);
  // Let the real source catalog finish rendering before restoring globals.
  await new Promise((resolve) => setImmediate(resolve));
  const $ = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing UI element ${selector}`);
    return element;
  };
  const fire = (selector, type) =>
    $(selector).dispatchEvent(
      new window.Event(type, { bubbles: true, cancelable: true }),
    );
  if (preset !== "global") {
    $("#scenario-preset").value = preset;
    fire("#scenario-preset", "change");
  }
  const input = (selector, value) => {
    $(selector).value = String(value);
    fire(selector, "input");
  };
  return {
    $,
    document,
    window,
    input,
    fire,
    click: (selector) => fire(selector, "click"),
    calculate: () => fire("#rotation-form", "submit"),
    airportRow: (code) =>
      [...document.querySelectorAll("#airport-rows tr")].find(
        (row) => row.querySelector(".code")?.textContent === code,
      ),
  };
}

test("default rotation renders costs, uplift, common terminal fuel, and actual research sources", async (t) => {
  const { $, document } = await mount(t);
  assert.equal($("#baseline-cost").textContent, "$31,270");
  assert.equal($("#optimized-cost").textContent, "$27,674");
  assert.equal($("#savings").textContent, "$3,596");
  assert.equal($("#savings-percent").textContent, "↓ 11.5%");
  assert.match($('[data-uplift="0"]').textContent, /27\.10/);
  assert.match($('[data-uplift="2"]').textContent, /0\.00.*No uplift/);
  assert.match(
    $("#constraint-note").textContent,
    /Terminal fuel 8\.00 t.*same terminal inventory/,
  );
  assert.match($("#result-disclosure").textContent, /Illustrative prices and performance/);
  assert.equal($("#download-plan").disabled, false);
  assert.equal(document.querySelectorAll(".strategy-card").length, 3);
  assert.equal(document.querySelectorAll(".source-card").length, 6);
  assert.match($("#source-cards").textContent, /台湾中油/);
});

test("editing parameters clears stale recommendations and prevents exporting or playing them", async (t) => {
  const { $, input, calculate } = await mount(t);
  input('[data-leg="0"][data-key="baseBurnT"]', 8.5);
  assert.equal($("#savings").textContent, "—");
  assert.equal($("#optimized-cost").textContent, "—");
  assert.equal($('[data-uplift="0"]').textContent, "—");
  assert.equal($("#strategy-cards").textContent, "");
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#play-route").disabled, true);
  assert.match($("#recommendation").textContent, /Recalculate/);
  calculate();
  assert.equal($("#model-error").hidden, true);
  assert.notEqual($("#optimized-cost").textContent, "$27,674");
  assert.equal($("#download-plan").disabled, false);
});

test("changing aircraft preserves an initial-fuel edit made before recalculation", async (t) => {
  const { $, input, fire, calculate } = await mount(t);
  input("#initial-fuel", 20);
  $("#aircraft").value = "a330";
  fire("#aircraft", "change");
  assert.equal($("#initial-fuel").value, "20");
  assert.equal($("#tank-capacity").value, "97");
  assert.equal($("#mlw").value, "187");
  calculate();
  assert.equal($("#model-error").hidden, true);
  assert.equal($("#download-plan").disabled, false);
});

test("a feasible zero-cost baseline is not described as infeasible or rendered as NaN", async (t) => {
  const { $, document, input, calculate } = await mount(t);
  for (const field of document.querySelectorAll('[data-key="priceUsdPerT"]')) {
    input(`[data-leg="${field.dataset.leg}"][data-key="priceUsdPerT"]`, 0);
  }
  calculate();
  assert.equal($("#baseline-cost").textContent, "$0");
  assert.equal($("#optimized-cost").textContent, "$0");
  assert.equal($("#savings").textContent, "$0");
  assert.doesNotMatch($("#savings-percent").textContent, /infeasible/i);
  assert.match($("#savings-percent").textContent, /Zero-purchase/);
  assert.doesNotMatch($("#cost-ratio").getAttribute("style"), /NaN|Infinity/);
  assert.equal($("#download-plan").disabled, false);
});

test("repeated departure airports share edited demo prices across legs, map, and airport table", async (t) => {
  const { $, input, fire, click, calculate, airportRow } = await mount(t);
  click("#add-leg");
  input('[data-leg="0"][data-key="priceUsdPerT"]', 900);
  fire('[data-leg="0"][data-key="priceUsdPerT"]', "change");
  assert.equal($('[data-leg="3"][data-key="priceUsdPerT"]').value, "900");
  assert.equal(airportRow("PVG").querySelector(".price").textContent, "$900");
  calculate();
  assert.equal($("#model-error").hidden, true);
  assert.equal(airportRow("PVG").querySelector(".price").textContent, "$900");
  assert.match($('[data-airport="PVG"]').textContent, /\$900/);
});

test("missing customer quotes block calculation instead of falling back to synthetic airport prices", async (t) => {
  const { $, document, click, airportRow } = await mount(t);
  click("#mode-quotes");
  assert.equal($("#model-error").hidden, false);
  assert.match($("#model-error").textContent, /PVG.*no valid.*quotation/);
  assert.equal($("#savings").textContent, "—");
  assert.equal($("#optimized-cost").textContent, "—");
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#play-route").disabled, true);
  for (const field of document.querySelectorAll('[data-key="priceUsdPerT"]')) {
    assert.equal(field.value, "");
    assert.equal(field.hasAttribute("readonly"), true);
  }
  assert.equal(airportRow("PVG").querySelector(".price").textContent, "—");
  assert.match(airportRow("PVG").textContent, /No quote/);
});

test("blank mandatory performance input shows a diagnostic and never exports a stale result", async (t) => {
  const { $, input, calculate } = await mount(t);
  input('[data-leg="0"][data-key="baseBurnT"]', "");
  calculate();
  assert.equal($("#model-error").hidden, false);
  assert.match($("#model-error").textContent, /base leg burn.*finite/);
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#savings").textContent, "—");
});

test("a supply-constrained feasible plan keeps the unavailable baseline and its playback disabled", async (t) => {
  const { $, input, click, calculate } = await mount(t);
  click('[data-strategy="baseline"]');
  input('[data-leg="1"][data-key="maxUpliftT"]', 0);
  calculate();
  assert.equal($("#model-error").hidden, true);
  assert.equal($("#baseline-cost").textContent, "Infeasible");
  assert.equal($("#savings").textContent, "—");
  assert.equal($("#savings-percent").textContent, "Baseline infeasible");
  assert.equal($("#play-route").disabled, true);
  assert.match($("#strategy-cards").textContent, /infeasible/i);
  click('[data-strategy="optimized"]');
  assert.equal($("#play-route").disabled, false);
  assert.match($("#strategy-cards").textContent, /LEG 01/);
});

test("global first load has a feasible intercontinental scenario and source-only airports remain unpriced", async (t) => {
  const { $, document, airportRow } = await mount(t, { preset: "global" });
  assert.equal($("#scenario-preset").value, "global");
  assert.equal($("#map-scope").value, "global");
  assert.equal($("#flight-map").getAttribute("viewBox"), "0 0 1440 720");
  assert.equal(document.querySelectorAll("#leg-rows tr").length, 4);
  assert.equal($("#baseline-cost").textContent, "$145,015");
  assert.equal($("#optimized-cost").textContent, "$138,620");
  assert.match($("#result-disclosure").textContent, /Intercontinental manual scenario.*not an actual flight/);
  assert.ok($('[data-key="from"]').querySelector('option[value="SYD"]'));
  assert.equal(airportRow("SYD").querySelector(".price").textContent, "—");
  assert.match(airportRow("SYD").textContent, /No scenario price/);
});

test("choosing an unpriced global origin requires an explicit price before optimization", async (t) => {
  const { $, fire, calculate, input } = await mount(t, { preset: "global" });
  const field = $('[data-leg="0"][data-key="from"]');
  Object.defineProperty(field, "value", { value: "SYD", configurable: true });
  fire('[data-leg="0"][data-key="from"]', "change");
  assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value, "");
  calculate();
  assert.match($("#model-error").textContent, /SYD.*no scenario price entered/);
  assert.equal($("#download-plan").disabled, true);
  input('[data-leg="0"][data-key="priceUsdPerT"]', 1000);
  calculate();
  assert.equal($("#model-error").hidden, true);
});

test("continent filtering searches sourced global airports without manufacturing quotations", async (t) => {
  const { $, document, click } = await mount(t, { preset: "global" });
  click('[data-continent="AF"]');
  const codes = [...document.querySelectorAll("#airport-rows .code")].map(el => el.textContent);
  assert.ok(codes.includes("JNB"));
  assert.ok(!codes.includes("PVG"));
  assert.equal($('[data-continent="AF"]').getAttribute("aria-pressed"), "true");
  assert.equal($('[data-continent="all"]').getAttribute("aria-pressed"), "false");
  assert.match($("#airport-rows").textContent, /No scenario price/);
});


// This adapter verifies application focus choices; native keyboard/select and
// screen-reader behavior still require the separate browser acceptance check.
function trackFocus(t, document, window) {
  const activeDescriptor = Object.getOwnPropertyDescriptor(document, "activeElement");
  let active = document.body;
  Object.defineProperty(document, "activeElement", { get: () => active, configurable: true });
  const descriptors = [];
  for (const prototype of [window.HTMLElement.prototype, window.SVGElement.prototype]) {
    descriptors.push([prototype, Object.getOwnPropertyDescriptor(prototype, "focus")]);
    Object.defineProperty(prototype, "focus", { configurable: true, value() {
      active = this;
      this.dispatchEvent(new window.Event("focus"));
    } });
  }
  t.after(() => {
    for (const [prototype, descriptor] of descriptors.reverse()) {
      if (descriptor) Object.defineProperty(prototype, "focus", descriptor);
      else delete prototype.focus;
    }
    if (activeDescriptor) Object.defineProperty(document, "activeElement", activeDescriptor);
    else delete document.activeElement;
  });
}

test("airport map has one keyboard entry and navigation excludes clipped airports", async t => {
  const { $, document, window, fire } = await mount(t, { preset: "global", reducedMotion: true });
  trackFocus(t, document, window);
  assert.equal(document.querySelectorAll('.map-airport[tabindex="0"]').length, 1);
  assert.equal(document.querySelector('.map-airport[tabindex="0"]').dataset.airport, "SIN");
  $("#map-scope").value = "eastasia";
  fire("#map-scope", "change");
  const [x,y,w,h] = $("#flight-map").getAttribute("viewBox").split(/\s+/).map(Number);
  const inView = node => Number(node.dataset.mapX) >= x && Number(node.dataset.mapX) <= x+w
    && Number(node.dataset.mapY) >= y && Number(node.dataset.mapY) <= y+h;
  const visible = [...document.querySelectorAll(".map-airport")].filter(inView);
  assert.ok(visible.length < 67);
  for (const node of document.querySelectorAll(".map-airport")) {
    if (!inView(node)) assert.equal(node.getAttribute("tabindex"), "-1");
  }
  const entry = document.querySelector('.map-airport[tabindex="0"]');
  assert.ok(inView(entry));
  entry.focus();
  for (let i = 0; i < visible.length + 2; i++) {
    const event = new window.Event("keydown", { bubbles: true, cancelable: true });
    event.key = "ArrowRight";
    document.activeElement.dispatchEvent(event);
    assert.ok(inView(document.activeElement));
    assert.equal(document.querySelectorAll('.map-airport[tabindex="0"]').length, 1);
  }
  const escape = new window.Event("keydown", { bubbles: true, cancelable: true });
  escape.key = "Escape";
  document.activeElement.dispatchEvent(escape);
  assert.equal($("#airport-tooltip").hidden, true);
});

test("route edits and deletion preserve a usable keyboard focus target", async t => {
  const { $, document, window, fire, click } = await mount(t);
  trackFocus(t, document, window);
  const selector = '[data-leg="1"][data-key="from"]';
  const old = $(selector);
  old.focus();
  Object.defineProperty(old, "value", { value: "KIX", configurable: true });
  fire(selector, "change");
  assert.notEqual($(selector), old);
  assert.equal(document.activeElement, $(selector));
  $('[data-remove="1"]').focus();
  click('[data-remove="1"]');
  assert.equal(document.activeElement, $('[data-leg="1"][data-key="from"]'));
  click("#add-leg");
  assert.equal(document.activeElement, $('[data-leg="2"][data-key="from"]'));
});

const quoteCsv = (supplier, price) =>
  `airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source\nPVG,${supplier},${price},2026-01-01,2027-12-31,into-plane,true,Supplier document`;
const flushImport = () => new Promise(resolve => setImmediate(resolve));
function selectFile($, fire, file) {
  Object.defineProperty($("#quote-file"), "files", { value: [file], configurable: true });
  fire("#quote-file", "change");
}

test("latest quotation selection wins when file reads complete out of order", async t => {
  const { $, fire, click, airportRow } = await mount(t);
  let finishFirst;
  selectFile($, fire, { size: 100, text: () => new Promise(resolve => { finishFirst = resolve; }) });
  selectFile($, fire, { size: 100, text: async () => quoteCsv("Latest supplier", 900) });
  await flushImport();
  finishFirst(quoteCsv("Older supplier", 700));
  await flushImport();
  click("#mode-quotes");
  assert.match(airportRow("PVG").textContent, /Latest supplier/);
  assert.doesNotMatch(airportRow("PVG").textContent, /Older supplier/);
  assert.equal(airportRow("PVG").querySelector(".price").textContent, "$900");
  assert.equal($("#import-feedback").getAttribute("aria-busy"), "false");
});

test("clearing quotations invalidates a pending file read", async t => {
  const { $, fire, click } = await mount(t);
  let finish;
  selectFile($, fire, { size: 100, text: () => new Promise(resolve => { finish = resolve; }) });
  click("#clear-quotes");
  finish(quoteCsv("Cancelled supplier", 700));
  await flushImport();
  assert.equal($("#quote-count").textContent, "0");
  assert.match($("#import-feedback").textContent, /Quotes cleared/);
  assert.equal($("#import-feedback").getAttribute("aria-busy"), "false");
});

test("decision diagnostics distinguish extra direct emissions from a carbon-optimized solution", async t => {
  const { $, input, calculate } = await mount(t, { preset: "global" });
  assert.equal($("#extra-co2").textContent, "20.46");
  assert.equal($("#carbon-threshold").textContent, "$313 /t CO₂");
  assert.match($("#carbon-note").textContent, /not a carbon-optimized result/);
  input('[data-leg="0"][data-key="priceUsdPerT"]', 951);
  assert.equal($("#extra-co2").textContent, "—");
  assert.equal($("#carbon-threshold").textContent, "—");
  input('[data-leg="1"][data-key="maxUpliftT"]', 0);
  calculate();
  assert.equal($("#extra-co2").textContent, "—");
  assert.equal($("#carbon-threshold").textContent, "—");
});
