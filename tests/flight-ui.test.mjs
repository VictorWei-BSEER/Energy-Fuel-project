import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

let mountId = 0;
function localClock(instant, timeZone) {
  const RealDate = Date;
  let now = RealDate.parse(instant);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const part = (date, type) => Number(
    formatter.formatToParts(date).find((item) => item.type === type).value,
  );
  return class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
    static advance(instant) { now = RealDate.parse(instant); }
    getFullYear() { return part(this, "year"); }
    getMonth() { return part(this, "month") - 1; }
    getDate() { return part(this, "day"); }
  };
}

async function mount(t, {
  now = "2026-11-04T12:00:00Z",
  timeZone = "Asia/Shanghai",
  initialDate,
} = {}) {
  const [html, sourceText] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/data/fuel-sources.json", import.meta.url),
      "utf8",
    ),
  ]);
  const { document, window } = parseHTML(html);
  if (initialDate !== undefined)
    document.querySelector("#flight-date").value = initialDate;
  const Clock = localClock(now, timeZone);
  const downloads = [];
  const createObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: (blob) => {
      downloads.push(blob);
      return `blob:test-${downloads.length}`;
    },
  });
  window.location = { hash: "", replace() {} };
  window.matchMedia = () => ({ matches: false });
  // Linkedom has no SVG geometry. A straight endpoint adapter exercises the
  // controller integration; browser QA verifies the real curved SVG geometry.
  const geometryPrototypes = [
    window.SVGElement.prototype,
    window.HTMLElement.prototype,
  ];
  const geometryDescriptors = [];
  const endpoints = (path) => {
    const values = (path.getAttribute("d") || "")
      .match(/-?\d+(?:\.\d+)?/g)
      ?.map(Number) || [0, 0, 1, 1];
    return [values[0], values[1], ...values.slice(-2)];
  };
  for (const [name, value] of Object.entries({
    getTotalLength() {
      const [x1, y1, x2, y2] = endpoints(this);
      return Math.hypot(x2 - x1, y2 - y1);
    },
    getPointAtLength(distance) {
      const [x1, y1, x2, y2] = endpoints(this);
      const length = Math.hypot(x2 - x1, y2 - y1);
      const progress = length ? Math.max(0, Math.min(1, distance / length)) : 0;
      return { x: x1 + (x2 - x1) * progress, y: y1 + (y2 - y1) * progress };
    },
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
    Date: Clock,
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
    if (createObjectURL) Object.defineProperty(URL, "createObjectURL", createObjectURL);
    else delete URL.createObjectURL;
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
  const aircraft = document.querySelector("#aircraft");
  let selectedAircraft = "b787";
  Object.defineProperty(aircraft, "value", {
    get: () => selectedAircraft,
    set: (value) => {
      selectedAircraft = String(value);
    },
    configurable: true,
  });
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
    downloads,
    advanceClock: (instant) => Clock.advance(instant),
    importQuotes: async (text) => {
      Object.defineProperty($("#quote-file"), "files", {
        configurable: true,
        value: [{ size: new TextEncoder().encode(text).byteLength, text: async () => text }],
      });
      fire("#quote-file", "change");
      await new Promise((resolve) => setImmediate(resolve));
    },
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

const quoteHeader =
  "airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source";
const rotationQuotes = (from, until, prices = [860, 980, 1120]) =>
  ["PVG", "ICN", "HND"].map((airport, i) =>
    `${airport},TEST supplier,${prices[i]},${from},${until},into-plane,true,TEST fixture ${from}`,
  );
const quotationFile = (...rows) => [quoteHeader, ...rows].join("\n") + "\n";

for (const [timeZone, now, expected] of [
  ["Asia/Shanghai", "2026-11-04T16:05:00Z", "2026-11-05"],
  ["America/Los_Angeles", "2026-11-05T02:05:00Z", "2026-11-04"],
  ["Asia/Shanghai", "2026-12-31T16:05:00Z", "2027-01-01"],
]) {
  test(`first opening uses local calendar date in ${timeZone} at ${now}`, async (t) => {
    const { $ } = await mount(t, { now, timeZone });
    assert.equal($("#flight-date").value, expected);
    assert.equal($("#model-error").hidden, true);
    assert.equal($("#download-plan").disabled, false);
  });
}

test("an explicitly restored future plan survives initialization, CSV import, solving and export", async (t) => {
  const { $, click, importQuotes, downloads, advanceClock } = await mount(t, {
    initialDate: "2026-12-15",
    now: "2026-11-04T15:59:00Z",
  });
  assert.equal($("#flight-date").value, "2026-12-15");
  await importQuotes(quotationFile(...rotationQuotes("2026-12-01", "2026-12-31")));
  assert.equal($("#quote-count").textContent, "3");
  advanceClock("2026-11-04T16:01:00Z");
  click("#use-quotes");
  assert.equal($("#flight-date").value, "2026-12-15");
  assert.equal($("#model-error").hidden, true);
  assert.equal($("#download-plan").disabled, false);
  click("#download-plan");
  const exported = JSON.parse(await downloads.at(-1).text());
  assert.equal(exported.date, "2026-12-15");
  assert.equal(exported.priceMode, "quotes");
  assert.equal(exported.result.feasible, true);
  assert.deepEqual(exported.input.legs.map((leg) => leg.priceUsdPerT), [860, 980, 1120]);
  assert.deepEqual(exported.quotes.map((quote) => quote.airport), ["PVG", "ICN", "HND"]);
  assert.ok(exported.quotes.every((quote) =>
    quote.validFrom <= exported.date && exported.date <= quote.validUntil &&
    quote.applicability === "current" && quote.source.startsWith("TEST fixture"),
  ));
});

test("first opening after expiry cannot apply yesterday's quotations", async (t) => {
  const { $, click, importQuotes, downloads, calculate } = await mount(t, {
    now: "2026-11-04T16:01:00Z",
  });
  await importQuotes(quotationFile(...rotationQuotes("2026-11-01", "2026-11-04")));
  assert.equal($("#quote-count").textContent, "3");
  click("#use-quotes");
  calculate();
  assert.equal($("#model-error").hidden, false);
  assert.match($("#model-error").textContent, /PVG.*没有有效.*报价/);
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#optimized-cost").textContent, "—");
  click("#download-plan");
  assert.equal(downloads.length, 0);
});

test("changing only the date invalidates the solved plan and reselects retained future quotations", async (t) => {
  const { $, click, fire, calculate, importQuotes, downloads } = await mount(t);
  await importQuotes(quotationFile(
    ...rotationQuotes("2026-11-01", "2026-11-30"),
    ...rotationQuotes("2026-12-01", "2026-12-31", [900, 1050, 1200]),
  ));
  assert.equal($("#quote-count").textContent, "6");
  click("#use-quotes");
  assert.equal($("#download-plan").disabled, false);
  $("#flight-date").value = "2026-12-15";
  fire("#flight-date", "change");
  assert.equal($("#download-plan").disabled, true);
  assert.equal($("#savings").textContent, "—");
  click("#download-plan");
  assert.equal(downloads.length, 0);
  calculate();
  assert.equal($("#model-error").hidden, true);
  click("#download-plan");
  const exported = JSON.parse(await downloads.at(-1).text());
  assert.equal(exported.date, "2026-12-15");
  assert.deepEqual(exported.input.legs.map((leg) => leg.priceUsdPerT), [900, 1050, 1200]);
  assert.ok(exported.quotes.every((quote) =>
    quote.validFrom === "2026-12-01" && quote.applicability === "current",
  ));
});

test("clearing a selected date blocks calculation and export until a date is entered", async (t) => {
  const { $, input, calculate, click, downloads } = await mount(t);
  input("#flight-date", "");
  calculate();
  assert.equal($("#flight-date").value, "");
  assert.equal($("#model-error").hidden, false);
  assert.match($("#model-error").textContent, /有效.*日期/);
  assert.equal($("#download-plan").disabled, true);
  click("#download-plan");
  assert.equal(downloads.length, 0);
});

test("downloaded quotation template follows the selected future plan and leaves quote values blank", async (t) => {
  const { $, click, downloads } = await mount(t, { initialDate: "2027-01-03" });
  click("#download-template");
  const lines = (await downloads.at(-1).text()).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const row = Object.fromEntries(header.map((key, i) => [key, lines[1].split(",")[i]]));
  assert.equal(row.valid_from, $("#flight-date").value);
  assert.equal(row.supplier, "");
  assert.equal(row.price_usd_per_t, "");
  assert.equal(row.source, "");
});

test("export retains the solved plan date and quote snapshot if the DOM changes without events", async (t) => {
  const { $, click, importQuotes, downloads } = await mount(t);
  await importQuotes(quotationFile(
    ...rotationQuotes("2026-11-01", "2026-11-30"),
    ...rotationQuotes("2026-12-01", "2026-12-31", [900, 1050, 1200]),
  ));
  click("#use-quotes");
  $("#flight-date").value = "2026-12-15";
  click("#download-plan");
  const exported = JSON.parse(await downloads.at(-1).text());
  assert.equal(exported.date, "2026-11-04");
  assert.deepEqual(exported.input.legs.map((leg) => leg.priceUsdPerT), [860, 980, 1120]);
  assert.ok(exported.quotes.every((quote) => quote.validUntil === "2026-11-30"));
});
