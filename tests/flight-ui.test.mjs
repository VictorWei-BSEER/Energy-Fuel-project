import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { polyline } from "./svg-polyline-helper.mjs";

let mountId = 0;
async function mount(t, { preset = "eastasia" } = {}) {
  const [html, sourceText] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/data/fuel-sources.json", import.meta.url),
      "utf8",
    ),
  ]);
  const { document, window } = parseHTML(html);
  window.location = { hash: "", replace() {} };
  window.matchMedia = () => ({ matches: false });
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
  assert.match($('[data-uplift="2"]').textContent, /0\.00.*无需加油/);
  assert.match(
    $("#constraint-note").textContent,
    /终点燃油 8\.00 t.*两方案终点库存一致/,
  );
  assert.match($("#result-disclosure").textContent, /演示假设/);
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
  assert.match($("#recommendation").textContent, /重新计算/);
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
  assert.doesNotMatch($("#savings-percent").textContent, /不可行/);
  assert.match($("#savings-percent").textContent, /零采购/);
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
  assert.match($("#model-error").textContent, /PVG.*没有有效.*报价/);
  assert.equal($("#savings").textContent, "—");
  assert.equal($("#optimized-cost").textContent, "—");
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#play-route").disabled, true);
  for (const field of document.querySelectorAll('[data-key="priceUsdPerT"]')) {
    assert.equal(field.value, "");
    assert.equal(field.hasAttribute("readonly"), true);
  }
  assert.equal(airportRow("PVG").querySelector(".price").textContent, "—");
  assert.match(airportRow("PVG").textContent, /待报价/);
});

test("blank mandatory performance input shows a diagnostic and never exports a stale result", async (t) => {
  const { $, input, calculate } = await mount(t);
  input('[data-leg="0"][data-key="baseBurnT"]', "");
  calculate();
  assert.equal($("#model-error").hidden, false);
  assert.match($("#model-error").textContent, /基础航段耗油.*有限数值/);
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#savings").textContent, "—");
});

test("a supply-constrained feasible plan keeps the unavailable baseline and its playback disabled", async (t) => {
  const { $, input, click, calculate } = await mount(t);
  click('[data-strategy="baseline"]');
  input('[data-leg="1"][data-key="maxUpliftT"]', 0);
  calculate();
  assert.equal($("#model-error").hidden, true);
  assert.equal($("#baseline-cost").textContent, "不可执行");
  assert.equal($("#savings").textContent, "—");
  assert.equal($("#savings-percent").textContent, "基线不可行");
  assert.equal($("#play-route").disabled, true);
  assert.match($("#strategy-cards").textContent, /不可执行/);
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
  assert.match($("#result-disclosure").textContent, /跨洲手动示例.*非实际航班/);
  assert.ok($('[data-key="from"]').querySelector('option[value="SYD"]'));
  assert.equal(airportRow("SYD").querySelector(".price").textContent, "—");
  assert.match(airportRow("SYD").textContent, /未设示例价/);
});

test("choosing an unpriced global origin requires an explicit price before optimization", async (t) => {
  const { $, fire, calculate, input } = await mount(t, { preset: "global" });
  const field = $('[data-leg="0"][data-key="from"]');
  Object.defineProperty(field, "value", { value: "SYD", configurable: true });
  fire('[data-leg="0"][data-key="from"]', "change");
  assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value, "");
  calculate();
  assert.match($("#model-error").textContent, /SYD.*尚未设定示例价格/);
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
  assert.match($("#airport-rows").textContent, /未设示例价/);
});
