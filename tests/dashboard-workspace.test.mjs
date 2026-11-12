import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { polyline } from "./svg-polyline-helper.mjs";

let mountId = 0;
async function mount(t, { hash = "", reducedMotion = false, preset = "eastasia" } = {}) {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  const { document, window } = parseHTML(html);
  const originals = new Map();
  const geometryDescriptors = [];
  const frames = new Map();
  const mediaListeners = new Set();
  let frameId = 0,
    time = 10_000,
    pageHidden = false;
  const media = {
    matches: reducedMotion,
    addEventListener: (_name, callback) => mediaListeners.add(callback),
  };
  window.matchMedia = () => media;
  window.localStorage = { getItem: () => "en", setItem() {} };
  window.location = {
    hash,
    replace() {
      throw new Error(
        "Original workspaces must not redirect to a separate page.",
      );
    },
  };
  const history = [];
  window.history = {
    pushState: (_state, _unused, url) => {
      history.push(url);
      window.location.hash = url;
    },
  };
  window.scrollTo = () => {};
  Object.defineProperty(document, "hidden", {
    get: () => pageHidden,
    configurable: true,
  });
  // Linkedom supplies DOM state and a test adapter measures M/L paths.
  // Linkedom parses dynamically inserted SVG children as HTML,
  // so both element prototypes need the adapter. Chromium checks real SVG paths.

  const geometryPrototypes = [
    window.SVGElement.prototype,
    window.HTMLElement.prototype,
  ];
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
  for (const [name, value] of Object.entries({
    document,
    window,
    CustomEvent: window.CustomEvent,
    performance: { now: () => time },
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    fetch: async (url) => { throw new Error(`The route model must not fetch an unrelated live feed: ${url}`); },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const $ = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing dashboard control ${selector}`);
    return element;
  };
  Object.defineProperty($("#flight-date"), "validity", {
    value: { valid: true },
  });
  for (const [id, initial] of [["aircraft", "widebody"], ["scenario-preset", "global"], ["map-scope", "global"]]) {
    let value = initial;
    Object.defineProperty($(`#${id}`), "value", {
      get: () => value, set: next => { value = String(next); }, configurable: true,
    });
  }
  $("#import-dialog").showModal = () => {
    $("#import-dialog").open = true;
  };
  $("#import-dialog").close = () => {
    $("#import-dialog").open = false;
  };
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
  const id = ++mountId;
  // Match the script order in the actual document: workspace initializes first.
  await import(`../dist/workspace.js?dashboard-workspace-test=${id}`);
  await import(`../dist/flight-app.js?dashboard-motion-test=${id}`);
  await new Promise((resolve) => setImmediate(resolve));
  const fire = (selector, type) =>
    $(selector).dispatchEvent(
      new window.Event(type, { bubbles: true, cancelable: true }),
    );
  if (preset) {
    $("#scenario-preset").value = preset;
    fire("#scenario-preset", "change");
    fire("#load-example", "click");
    fire("#rotation-form", "submit");
  }
  const click = (selector) => fire(selector, "click");
  const input = (selector, value) => {
    $(selector).value = String(value);
    fire(selector, "input");
  };
  const advance = (milliseconds) => {
    time += milliseconds;
    const ready = [...frames.values()];
    frames.clear();
    for (const callback of ready) callback(time);
  };
  return {
    $,
    document,
    window,
    history,
    click,
    fire,
    input,
    advance,
    visible: () =>
      [...document.querySelectorAll(".workspace-panel")]
        .filter((panel) => !panel.hidden)
        .map((panel) => panel.id),
    pendingFrames: () => frames.size,
    setHidden(value) {
      pageHidden = value;
      document.dispatchEvent(new window.Event("visibilitychange"));
    },
    setReducedMotion(value) {
      media.matches = value;
      for (const callback of mediaListeners) callback({ matches: value });
    },
  };
}

test("homepage uses one five-tab workspace with isolated source controls", async (t) => {
  const ui = await mount(t, { preset: null });
  const { $, document, click, visible } = ui;
  assert.ok(document.querySelector(".topbar .wordmark"));
  assert.equal(
    document.querySelector("#workspace-calculations .hero"),
    null,
    "the large marketing hero no longer replaces the workbench",
  );
  assert.deepEqual(
    [...document.querySelectorAll("[data-workspace]")].map(
      (tab) => tab.dataset.workspace,
    ),
    ["calculations", "oil-markets", "research", "briefing", "sources"],
  );
  assert.deepEqual(visible(), ["workspace-calculations"]);
  const ids = [...document.querySelectorAll("[id]")].map(
    (element) => element.id,
  );
  assert.equal(
    new Set(ids).size,
    ids.length,
    "legacy source tables and flight quotes have distinct IDs",
  );
  assert.equal(
    $("#flight-map").closest(".workspace-panel").id,
    "workspace-calculations",
  );
  assert.equal(
    $("#rotation-form").closest(".workspace-panel").id,
    "workspace-calculations",
  );
  assert.equal($("#data-airport-rows").closest(".workspace-panel").id, "workspace-oil-markets");
  assert.equal($("#data-assumption-form").closest(".workspace-panel").id, "workspace-oil-markets");
  assert.ok(document.querySelector("#workspace-sources .data-source-table"));
  assert.equal(document.querySelector("#public-market"), null);
  assert.equal(document.querySelector("#animated-plane"), null, "first visit has no preloaded or playing route");
  assert.equal($("#motion-toggle").dataset.state, "unavailable");
  assert.equal($("#savings").textContent, "—");
  const scriptSources = [...document.querySelectorAll("script[src]")].map(
    (script) => script.getAttribute("src").split("?")[0],
  );
  assert.ok(!scriptSources.includes("./public-market.js"));
  assert.ok(!scriptSources.includes("./observed-app.js"));
  assert.ok(!scriptSources.includes("./workspace-directory.js"));
  assert.ok(scriptSources.includes("./data-view.js"));
  assert.ok(scriptSources.includes("./i18n.js"));
  assert.ok(!scriptSources.includes("./planner-app.js"));
  assert.ok(!scriptSources.includes("./airport-map.js"));
  ui.input("#initial-fuel", 20);
  click("#workspace-tab-oil-markets");
  assert.deepEqual(visible(), ["workspace-oil-markets"]);
  click("#workspace-tab-sources");
  assert.deepEqual(visible(), ["workspace-sources"]);
  click("#workspace-tab-calculations");
  assert.equal($("#initial-fuel").value, "20", "tab changes preserve edits");
  assert.deepEqual(ui.history, ["#fuel-data", "#sources", "#calculations"]);
});

test("explicit global example calculates a playable route and scope changes preserve the solved plan", async (t) => {
  const { $, document, fire, click, advance } = await mount(t, { preset: "global" });
  assert.equal($("#motion-toggle").dataset.state, "playing");
  assert.equal($("#motion-current-leg").textContent, "SIN → DXB");
  assert.equal($("#flight-map").getAttribute("viewBox"), "0 0 1440 720");
  const cost = $("#optimized-cost").textContent;
  advance(2500);
  assert.equal($("#flight-map").dataset.phase, "flight");
  assert.ok(Number($("#motion-progress").value) > 0);
  $("#map-scope").value = "eastasia";
  fire("#map-scope", "change");
  advance(600);
  assert.equal($("#flight-map").getAttribute("viewBox"), "1080 140 260 260");
  assert.ok(Math.abs(Number($('[data-airport="SIN"] .ring').getAttribute("r")) - 7 * 260 / 720) < 1e-8);
  assert.equal($('[data-airport="PVG"] .airport-code').dataset.labelX, "-56");
  assert.equal($('[data-airport="HND"] .airport-code').dataset.labelY, "11");
  assert.equal($("#optimized-cost").textContent, cost);
  assert.equal($("#motion-toggle").dataset.state, "playing");
  click("#fit-route");
  advance(600);
  assert.ok(Number($("#flight-map").getAttribute("viewBox").split(" ")[2]) > 800);
  assert.equal($("#optimized-cost").textContent, cost);
  $("#scenario-preset").value = "eastasia";
  fire("#scenario-preset", "change");
  assert.equal($("#optimized-cost").textContent, cost, "choosing an example does not replace a plan before it is loaded");
  click("#load-example");
  assert.equal($("#optimized-cost").textContent, "—");
  fire("#rotation-form", "submit");
  assert.equal($("#model-error").hidden, true);
  assert.notEqual($("#optimized-cost").textContent, "—");
  assert.equal($("#motion-current-leg").textContent, "PVG → ICN");
  click("#reset-plan");
  assert.equal(document.querySelectorAll("#leg-rows tr").length, 1);
  assert.equal($("#motion-toggle").dataset.state, "unavailable");
});

test("a dateline route reveals only the traveled trail on either map edge", async (t) => {
  const { $, document, fire, input, click } = await mount(t, { preset: "global" });
  for (const [key, value] of [["from", "NRT"], ["to", "LAX"]]) {
    const selector = `[data-leg="0"][data-key="${key}"]`;
    Object.defineProperty($(selector), "value", { value, configurable: true });
    fire(selector, "change");
  }
  input('[data-leg="1"][data-key="priceUsdPerT"]', 1050);
  fire("#rotation-form", "submit");
  assert.equal($("#model-error").hidden, true);
  click("#motion-toggle");
  const trails = [...document.querySelectorAll('[data-trail="0"]')];
  assert.equal(trails.length, 2);
  input("#motion-progress", 100 * (.18 + .72 * .1) / 4);
  assert.ok(Number(trails[0].style.strokeDashoffset) < Number(trails[0].style.strokeDasharray));
  assert.equal(Number(trails[1].style.strokeDashoffset), Number(trails[1].style.strokeDasharray));
  input("#motion-progress", 100 * (.18 + .72 * .9) / 4);
  assert.equal(Number(trails[0].style.strokeDashoffset), 0);
  assert.ok(Number(trails[1].style.strokeDashoffset) < Number(trails[1].style.strokeDasharray));
  assert.ok(Number(trails[1].style.strokeDashoffset) > 0);
  assert.doesNotMatch($("#animated-plane").getAttribute("transform"), /NaN|Infinity/);
});

test("symbol scale follows SVG meet geometry and resize preserves a paused camera and progress", async (t) => {
  const { $, window, click, fire, advance } = await mount(t, { preset: "global" });
  const svg = $("#flight-map");
  let rect = { width: 960, height: 400 };
  svg.getBoundingClientRect = () => rect;
  window.dispatchEvent(new window.Event("resize"));
  assert.ok(Math.abs(Number(svg.style.getPropertyValue("--map-ui-scale")) - 1.8) < 1e-9);
  advance(2500);
  click("#motion-toggle");
  $("#map-scope").value = "eastasia";
  fire("#map-scope", "change");
  advance(600);
  assert.ok(Math.abs(Number(svg.style.getPropertyValue("--map-ui-scale")) - .65) < 1e-9);
  const camera = svg.getAttribute("viewBox"), progress = $("#motion-progress").value;
  rect = { width: 360, height: 300 };
  window.dispatchEvent(new window.Event("resize"));
  assert.ok(Math.abs(Number(svg.style.getPropertyValue("--map-ui-scale")) - 260 / 300) < 1e-9);
  assert.equal(svg.getAttribute("viewBox"), camera);
  assert.equal($("#motion-progress").value, progress);
  assert.equal($("#motion-toggle").dataset.state, "paused");
  assert.ok(Math.abs(Number($('[data-airport="SIN"] .ring').getAttribute("r")) - 7 * 260 / 300) < 1e-8);
});

test("an explicitly calculated route visibly refuels, moves the plane, consumes fuel and updates the cost and route trail", async (t) => {
  const { $, document, advance } = await mount(t);
  assert.equal($("#motion-toggle").dataset.state, "playing");
  assert.equal($("#motion-toggle").getAttribute("aria-pressed"), "true");
  assert.equal($("#flight-map").dataset.phase, "refuel");
  assert.equal($("#motion-current-leg").textContent, "PVG → ICN");
  assert.equal($("#motion-fuel").textContent, "0.00 t");
  assert.equal(document.querySelectorAll("[data-motion-leg]").length, 3);
  const initialPlanePosition = $("#animated-plane").getAttribute("transform");
  advance(500);
  assert.ok(
    Number.parseFloat($("#motion-fuel").textContent) > 0,
    "fuel rises while the first uplift is added",
  );
  assert.notEqual(
    $("#motion-cost").textContent,
    "$0",
    "procurement cost rises during refueling",
  );
  advance(2500);
  assert.equal($("#flight-map").dataset.phase, "flight");
  assert.notEqual(
    $("#animated-plane").getAttribute("transform"),
    initialPlanePosition,
    "position advances along the SVG path",
  );
  const inFlightFuel = Number.parseFloat($("#motion-fuel").textContent);
  advance(700);
  assert.ok(
    Number.parseFloat($("#motion-fuel").textContent) < inFlightFuel,
    "fuel decreases in flight",
  );
  assert.match($("#motion-summary").textContent, /to .*fuel/);
  assert.ok(Number($("#motion-progress").value) > 0);
  assert.notEqual(
    document.querySelector(".route-trail").style.strokeDashoffset,
    "0",
  );
  assert.ok($("#leg-rows tr").classList.contains("active-leg"));
});

test("pause, seek, per-leg selection and restart expose the same solved fuel balances", async (t) => {
  const { $, click, input, advance } = await mount(t);
  advance(1600);
  click("#motion-toggle");
  assert.equal($("#motion-toggle").dataset.state, "paused");
  const pausedProgress = $("#motion-progress").value;
  const pausedPosition = $("#animated-plane").getAttribute("transform");
  advance(2000);
  assert.equal($("#motion-progress").value, pausedProgress);
  assert.equal($("#animated-plane").getAttribute("transform"), pausedPosition);
  input("#motion-progress", 50);
  assert.equal($("#motion-current-leg").textContent, "ICN → HND");
  assert.equal($("#flight-map").dataset.activeLeg, "1");
  assert.equal($("#motion-toggle").dataset.state, "paused");
  click('[data-motion-leg="2"]');
  assert.equal($("#motion-current-leg").textContent, "HND → PVG");
  assert.equal($("#motion-phase").textContent, "In flight");
  assert.equal($("#motion-toggle").dataset.state, "paused");
  advance(1000); // Camera transition may run while playback remains paused.
  assert.equal($("#flight-map").dataset.activeLeg, "2");
  click("#motion-restart");
  assert.equal($("#motion-current-leg").textContent, "PVG → ICN");
  assert.equal($("#motion-toggle").dataset.state, "playing");
  assert.equal($("#motion-progress").value, "0");
});

test("switching strategies rebuilds the motion plan while respecting pause and progress; edits cancel stale playback", async (t) => {
  const { $, document, click, input, advance, fire } = await mount(t);
  input('[data-leg="0"][data-key="priceUsdPerT"]', 650);
  input('[data-leg="1"][data-key="priceUsdPerT"]', 1300);
  input('[data-leg="2"][data-key="priceUsdPerT"]', 1700);
  fire("#rotation-form", "submit");
  input("#motion-progress", 50);
  const previousPlane = $("#animated-plane");
  const optimizedCost = $("#motion-cost").textContent;
  click('[data-strategy="baseline"]');
  assert.equal($("#motion-toggle").dataset.state, "paused");
  assert.equal($("#flight-map").dataset.activeLeg, "1");
  assert.notEqual(
    $("#animated-plane"),
    previousPlane,
    "previous solved-plan animation is replaced",
  );
  assert.equal(document.querySelectorAll("#animated-plane").length, 1);
  assert.notEqual(
    $("#motion-cost").textContent,
    optimizedCost,
    "baseline and optimized procurement follow their own plan",
  );
  input('[data-leg="0"][data-key="baseBurnT"]', 9);
  assert.equal(document.querySelector("#animated-plane"), null);
  assert.equal($("#motion-toggle").dataset.state, "unavailable");
  assert.equal($("#motion-progress").disabled, true);
  advance(8000);
  assert.equal($("#motion-fuel").textContent, "— t");
  assert.equal($("#motion-cost").textContent, "—");
  assert.equal($("#savings").textContent, "—");
  fire("#rotation-form", "submit");
  assert.equal(
    $("#motion-toggle").dataset.state,
    "paused",
    "recalculation preserves an intentional pause",
  );
  click("#reset-plan");
  assert.equal($("#motion-toggle").dataset.state, "unavailable", "clearing a route removes the previous plan");
  assert.equal(document.querySelector("#animated-plane"), null);
  click("#load-example");
  assert.equal($("#motion-toggle").dataset.state, "unavailable", "loading an example waits for an explicit calculation");
  fire("#rotation-form", "submit");
  assert.equal($("#motion-toggle").dataset.state, "playing");
});

test("workspace and document visibility pause autoplay and resume only when the user has not paused it", async (t) => {
  const { $, click, advance, setHidden } = await mount(t);
  advance(1800);
  click("#workspace-tab-oil-markets");
  assert.equal($("#motion-toggle").dataset.state, "paused");
  const hiddenProgress = $("#motion-progress").value;
  advance(3000);
  assert.equal($("#motion-progress").value, hiddenProgress);
  click("#workspace-tab-calculations");
  assert.equal($("#motion-toggle").dataset.state, "playing");
  advance(500);
  assert.notEqual($("#motion-progress").value, hiddenProgress);
  setHidden(true);
  assert.equal($("#motion-toggle").dataset.state, "paused");
  const backgroundProgress = $("#motion-progress").value;
  advance(3000);
  assert.equal($("#motion-progress").value, backgroundProgress);
  setHidden(false);
  assert.equal($("#motion-toggle").dataset.state, "playing");
  click("#motion-toggle");
  click("#workspace-tab-sources");
  click("#workspace-tab-calculations");
  assert.equal($("#motion-toggle").dataset.state, "paused");
  setHidden(true);
  setHidden(false);
  assert.equal($("#motion-toggle").dataset.state, "paused");
});

test("opening a Sources deep link does not animate the hidden calculation workspace", async (t) => {
  const { $, click, pendingFrames, visible } = await mount(t, {
    hash: "#sources",
  });
  assert.deepEqual(visible(), ["workspace-sources"]);
  assert.equal($("#motion-toggle").dataset.state, "paused");
  assert.equal(pendingFrames(), 0);
  click("#workspace-tab-calculations");
  assert.equal($("#motion-toggle").dataset.state, "playing");
  assert.ok(pendingFrames() > 0);
});

test("reduced-motion preference provides static leg inspection without scheduling animation", async (t) => {
  const { $, click, pendingFrames, setReducedMotion, advance } = await mount(
    t,
    { reducedMotion: true },
  );
  assert.equal($("#motion-toggle").dataset.state, "reduced");
  assert.equal($("#motion-toggle").disabled, true);
  assert.equal(pendingFrames(), 0);
  click("#play-route");
  assert.equal($("#motion-current-leg").textContent, "ICN → HND");
  assert.equal(pendingFrames(), 0);
  advance(5000);
  assert.equal($("#motion-current-leg").textContent, "ICN → HND");
  setReducedMotion(false);
  assert.equal(
    $("#motion-toggle").dataset.state,
    "paused",
    "manual static navigation remains intentional pause",
  );
  click("#motion-toggle");
  assert.equal($("#motion-toggle").dataset.state, "playing");
  setReducedMotion(true);
  assert.equal($("#motion-toggle").dataset.state, "reduced");
  assert.equal(pendingFrames(), 0);
});
