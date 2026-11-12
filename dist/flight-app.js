import { mapMarkup, project } from "./world-map.js";
import { airportData } from "./global-airports.js";
import { airportLabel } from "./airport-labels.js";
import { MAP_VIEWS, routePath, fitRouteView } from "./flight-geography.js";
import { createRotationMotion } from "./rotation-motion.js?v=20261113-global";
import { optimizeRotation } from "./flight-optimizer.js?v=20261113-model";
import {
  parseQuoteCsv,
  quoteForAirport,
  QUOTE_CSV_TEMPLATE,
} from "./fuel-quotes.js?v=20261113-global";

import { AIRCRAFT_PROFILES, airportScenario, deriveLeg } from "./scenario-data.js?v=20261113-model";
import { t, getLanguage, translateTree, initI18n } from "./i18n.js?v=20261113-bilingual";

import { getScenarioOptions } from "./scenario-settings.js";

initI18n(document);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  Number.isFinite(value)
    ? "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "—";
const tonnes = (value) => (Number.isFinite(value) ? value.toFixed(2) : "—");
// The numerical and CSV engines retain stable diagnostic strings. Translate
// only the presentation layer so exported input/result contracts stay intact.
function englishDiagnostic(value) {
  if (getLanguage() === "zh") return String(value);
  let message = String(value);
  const exact = {
    "请提供轮转参数对象。": "Provide rotation parameters.",
    "请提供油箱容量、最大起飞重量和最大落地重量。": "Provide tank, maximum takeoff and maximum landing capacities.",
    "轮转必须包含 1–5 个连续航段。": "A route must contain 1–5 continuous legs.",
    "参数数值范围过大，请使用吨和 USD/吨作为单位。": "Input magnitudes exceed the supported range. Use tonnes and USD per tonne.",
    "初始油量超过油箱容量；当前模型不允许卸油。": "Initial fuel exceeds tank capacity; defuelling is not supported.",
    "初始油量超过油箱容量；请修正初始油量。": "Initial fuel exceeds tank capacity. Correct the initial fuel input.",
    "无法在油箱、重量、供油上限和相同终点油量约束下完成该轮转。": "No solution satisfies tank, weight, supply and common terminal-fuel constraints.",
    "逐站按需加油方案受供油上限限制；提前携油可执行，但不计算对不可行基线的节省比例。": "The just-in-time baseline violates supply limits. Tankering is feasible; savings against an infeasible baseline are not reported.",
    "比较日期须为有效的 YYYY-MM-DD 日期。": "The comparison date must be a valid YYYY-MM-DD date.",
    "请提供 UTF-8 CSV 文本。": "Provide UTF-8 CSV text.",
    "报价文件不可超过 256 KiB。": "The quotation file must not exceed 256 KiB.",
    "报价文件为空。": "The quotation file is empty.",
    "报价文件未包含记录。": "The quotation file has no records.",
  };
  if (exact[message]) return exact[message];
  message = message
    .replace(/报价文件最多允许 (\d+) 条记录。/g, "The quotation file allows at most $1 records.")
    .replace(/第 (\d+) 行：/g, "Row $1: ")
    .replace(/第 (\d+) 航段/g, "Leg $1: ")
    .replace(/([^ ]+) 第 (\d+)、(\d+) 行有效期重叠，请先选定适用合同；这两行未导入。/g,
      "$1: rows $2 and $3 overlap. Select the applicable contract; both records were excluded.")
    .replace(/另有 (\d+) 组有效期重叠；所有冲突记录均未导入。/g,
      "$1 further overlapping pairs; all conflicting records were excluded.")
    .replace(/CSV 表头须且仅含：(.+)。仅接受已统一的 USD\/t 报价。/g,
      "CSV headers must contain exactly: $1. Prices must already be normalized to USD/t.");
  const phrases = [
    ["最低必要燃油已超过", "minimum required fuel exceeds "],
    ["，请调整载荷、保留油或机型。", "; adjust payload, reserve or aircraft limits."],
    ["必须是大于零的有限数值。", " must be finite and positive."],
    ["必须是非负的有限数值。", " must be finite and non-negative."],
    ["必须小于 1。", " must be less than 1."],
    ["参数缺失。", "parameters are missing."],
    ["须从上一航段到达机场 ", "must depart from the preceding destination "],
    [" 出发。", "."], ["出发机场缺失。", "origin airport is missing."], ["到达机场缺失。", "destination airport is missing."],
    ["需要卸油，当前模型只允许非负加油。", "would require defuelling; uplift must be non-negative."],
    ["无法满足到达保留油。", "cannot meet the arrival reserve."],
    ["本站供油上限", "uplift limit"], ["本站无需加油", "zero uplift"],
    ["最大起飞重量", "maximum takeoff weight"], ["最大落地重量", "maximum landing weight"],
    ["基础航段耗油", "base leg burn"], ["滑行耗油", "taxi burn"],
    ["到达保留油", "arrival reserve"], ["携油损耗比例", "extra-weight burn fraction"],
    ["初始油量", "initial fuel"], ["油箱容量", "tank capacity"], ["无油重量", "zero-fuel weight"],
    ["供货价格", "fuel price"], ["供油上限", "uplift limit"],
    ["超限 ", " exceeds the limit by "], [" 吨。", " tonnes."],
    ["引号结束后出现非分隔内容。", "unexpected text follows a closing quote."],
    ["字段内的双引号必须转义。", "escape embedded double quotes."],
    ["CSV 引号没有闭合。", "CSV quote is not closed."],
    ["字段数量与表头不符。", "field count does not match the header."],
    ["机场须为全球机场目录支持的大写 IATA 三字码。", "use a supported uppercase three-letter IATA code."],
    ["供应商不可为空、过长或以公式字符开头。", "supplier must be non-empty, within the length limit and not start with a formula character."],
    ["price_usd_per_t 须为大于零的有限 USD/t 数字。", "price_usd_per_t must be a finite positive USD/t number."],
    ["有效期须为真实的 YYYY-MM-DD 日期，且开始日期不晚于结束日期。", "use valid YYYY-MM-DD dates with start no later than end."],
    ["仅接受交付到机的 into-plane 报价。", "only into-plane quotations are accepted."],
    ["请确认价格包含适用税费及加注费用，并将 fees_included 设为 true。", "confirm all applicable taxes and delivery fees are included; set fees_included to true."],
    ["来源须为非空文档名称或无登录凭据的 HTTP(S) 链接，不可为公式。", "source must be a document name or credential-free HTTP(S) URL, not a formula."],
    ["：", ": "],
  ];
  for (const [from, to] of phrases) message = message.replaceAll(from, to);
  return message;
}
function decisionDiagnostics(plan) {
  const comparable = !!plan?.baseline?.feasible && Number.isFinite(plan.extraBurnVsBaselineT);
  const extraDirectCo2T = comparable ? plan.extraBurnVsBaselineT * 3.16 : null;
  const carbonBreakEvenUsdPerTCo2 = comparable && extraDirectCo2T > 1e-9 && plan.savingsUsd > 0
    ? plan.savingsUsd / extraDirectCo2T : null;
  return { classification: "scenario-posthoc-comparison", comparableBaseline: comparable,
    extraDirectCo2T, carbonBreakEvenUsdPerTCo2,
    co2FactorTPerTFuel: 3.16,
    boundary: "Direct combustion CO2 only; excludes lifecycle and non-CO2 effects. Carbon break-even compares these two fuel-cost plans and does not re-optimize for carbon." };
}

const airportCity = a => airportLabel(a, getLanguage()).city;
function errorText(value) { return typeof value === "object" ? t(value.key,value.params) : t(englishDiagnostic(value)); }
const airports = Object.fromEntries(airportData.map((a) => [a.code, a]));
let aircraftKey = "widebody";
let scenarioOptions = getScenarioOptions();
let airportPriceOverrides = {};
let preset = "global";
const emptyLeg = (from = "", to = "") => ({ from, to, overrides: {}, derivation: null });
const profileAircraft = () => {
  const profile = AIRCRAFT_PROFILES[aircraftKey];
  return { name: aircraftKey, tankCapacityT: profile.tankCapacityT,
    maxTakeoffWeightT: profile.maxTakeoffWeightT, maxLandingWeightT: profile.maxLandingWeightT };
};
let input = { aircraft: profileAircraft(), initialFuelT: 0, legs: [emptyLeg()] };
let mode = "demo", quotes = [], result = null, dirty = true,
  strategy = "optimized";
let currentMessage = "Choose your origin and destination.";
let currentErrors = [];
let loadedExample = null;
function routeCodes() { return [input.legs[0]?.from || "", ...input.legs.map(leg => leg.to || "")]; }
function emitScenario() {
  document.dispatchEvent(new CustomEvent("scenariodatachange", { detail: {
    aircraftKey, input: structuredClone(input), priceMode: mode,
    airportPriceOverrides: { ...airportPriceOverrides }, options: structuredClone(scenarioOptions), source: "flight-model",
  } }));
}
function rebuildRoute(stops, { resetOverrides = true } = {}) {
  if (resetOverrides) airportPriceOverrides = {};
  input.legs = stops.slice(1).map((to, index) => {
    const from = stops[index];
    if (!airports[from] || !airports[to] || from === to) return emptyLeg(from, to);
    try {
      const generated = deriveLeg(from, to, aircraftKey, scenarioOptions);
      return { ...generated, priceUsdPerT: mode === "quotes" ? activeQuote(from)?.priceUsdPerT
        : airportPriceOverrides[from] ?? generated.priceUsdPerT, overrides: {} };
    } catch (error) {
      return {...emptyLeg(from,to), derivationError:error.message};
    }
  });
  emitScenario();
}
let quoteImportGeneration = 0;
let quoteFeedback = null;
function renderQuoteFeedback() {
  if (!quoteFeedback) return;
  const { key, params, errors = [] } = quoteFeedback;
  const rejected = errors.length ? t("Rejected records: {{errors}}", { errors: errors.map(errorText).join(" ") }) : "";
  $("#import-feedback").textContent = [t(key, params), rejected].filter(Boolean).join(" ");
}
function setQuoteFeedback(key, params = {}, errors = []) {
  quoteFeedback = { key, params, errors };
  renderQuoteFeedback();
}
let mapFocusCode = "SIN";
let motion = null;
let motionGeneration = 0;
let userPausedMotion = false;
let motionFrame = null;
let motionHudTime = -Infinity;
let lastMotionPhase = "";
let cameraFrame = null;
let hasPresentedMap = false;
const reducedMotionPreference = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);
let mapScope = "global";
const mapView = { ...MAP_VIEWS.global };
let mapUiScale = 1;
let mapResizeObserver = null;
const motionLabels = { refuel: "Refuelling", flight: "In flight", arrival: "Arrived" };
const dialog = $("#import-dialog");

function activeQuote(code) {
  return quoteForAirport(quotes, code, $("#flight-date").value);
}
function priceFor(code) {
  return mode === "demo"
    ? (airportPriceOverrides[code] ?? (airports[code] ? airportScenario(code, scenarioOptions).priceUsdPerT : undefined))
    : activeQuote(code)?.priceUsdPerT;
}
function airportOptions(selected) {
  return `<option value="">${escape(t("Choose airport"))}</option>` + airportData
    .map(
      (a) =>
        `<option value="${a.code}" ${a.code === selected ? "selected" : ""}>${a.code} · ${escape(airportLabel(a, getLanguage()).name)}</option>`,
    )
    .join("");
}
function syncAircraftInputs() {
  $("#tank-capacity").value = input.aircraft.tankCapacityT;
  $("#mtow").value = input.aircraft.maxTakeoffWeightT;
  $("#mlw").value = input.aircraft.maxLandingWeightT;
  $("#initial-fuel").value = input.initialFuelT;
}
function legDerivationLabel(leg) {
  if (!Number.isFinite(leg.distanceKm)) return t("Choose airports to generate inputs");
  const distance = t("{{distance}} km · {{duration}} h", { distance: Math.round(leg.distanceKm).toLocaleString(), duration: leg.durationH.toFixed(2) });
  const provenance = t(Object.keys(leg.overrides || {}).length ? "Edited inputs" : "Generated inputs");
  return `${distance} · ${provenance}`;
}
function renderForm({ focusLeg, focusKey } = {}) {
  const active = document.activeElement;
  const keepFocus = focusLeg !== undefined ? { leg: focusLeg, key: focusKey || "to" }
    : active?.dataset?.leg !== undefined && active.dataset.key ? { leg: Number(active.dataset.leg), key: active.dataset.key }
      : active?.dataset?.remove !== undefined ? { leg: Math.min(Number(active.dataset.remove), input.legs.length - 1), key: "to" } : null;
  const value = number => Number.isFinite(number) ? number : "";
  $("#leg-rows").innerHTML = input.legs.map((leg, i) => {
    return `<tr><td>${String(i + 1).padStart(2, "0")}</td><td><div class="leg-route"><select data-leg="${i}" data-key="from" aria-label="${escape(t("Leg {{leg}} origin airport", {leg:i+1}))}" ${i > 0 ? "disabled" : ""}>${airportOptions(leg.from)}</select><span aria-hidden="true">→</span><select data-leg="${i}" data-key="to" aria-label="${escape(t("Leg {{leg}} destination airport", {leg:i+1}))}">${airportOptions(leg.to)}</select></div><small class="leg-derivation">${escape(legDerivationLabel(leg))}</small></td><td><input data-leg="${i}" data-key="priceUsdPerT" aria-label="${escape(t("Leg {{leg}} price, USD per tonne",{leg:i+1}))}" type="number" min="0" step="any" value="${value(leg.priceUsdPerT)}" ${mode === "quotes" ? "readonly" : ""} placeholder="—"></td><td><input data-leg="${i}" data-key="baseBurnT" aria-label="${escape(t("Leg {{leg}} base burn, tonnes",{leg:i+1}))}" type="number" min="0" step="any" value="${value(leg.baseBurnT)}" required></td><td class="uplift-result" data-uplift="${i}">—</td><td class="landing-result" data-landing="${i}">—</td><td><div class="route-row-actions"><button type="button" data-move-stop="${i}" data-direction="up" aria-label="${escape(t("Move stop {{stop}} earlier",{stop:i+1}))}" ${i===0 ? "disabled" : ""}><span aria-hidden="true">↑</span></button><button type="button" data-move-stop="${i}" data-direction="down" aria-label="${escape(t("Move stop {{stop}} later",{stop:i+1}))}" ${i===input.legs.length-1 ? "disabled" : ""}><span aria-hidden="true">↓</span></button><button type="button" class="remove-leg" data-remove="${i}" aria-label="${escape(t("Remove stop {{stop}}",{stop:i+1}))}" ${input.legs.length<=1 ? "disabled" : ""}><span aria-hidden="true">×</span></button></div></td></tr>`;
  }).join("");
  const fields = [["taxiBurnT","Taxi burn, tonnes"],["reserveT","Arrival reserve, tonnes"],["carryBurnRate","Extra-weight burn, percent"],["zeroFuelWeightT","Zero-fuel weight, tonnes"],["maxUpliftT","Uplift limit, tonnes"]];
  $("#performance-rows").innerHTML = input.legs.map((leg,i) => `<tr><td>${leg.from || "—"} → ${leg.to || "—"}</td>${fields.map(([key,label])=>`<td><input type="number" data-leg="${i}" data-key="${key}" aria-label="${escape(t("Leg {{leg}} {{field}}",{leg:i+1,field:t(label)}))}" min="0" ${key==="carryBurnRate"?'max="99.99"':""} step="any" value="${value(key==="carryBurnRate"?leg[key]*100:leg[key])}" ${key==="maxUpliftT"?'placeholder="—"':"required"}></td>`).join("")}</tr>`).join("");
  $("#add-leg").disabled = input.legs.length >= 5;
  const codes = routeCodes().filter(Boolean);
  $("#route-caption").textContent = codes.length ? codes.join(" → ") : t("Build your route");
  if (keepFocus) [...$("#rotation-form").querySelectorAll("[data-leg][data-key]")]
    .find(node => Number(node.dataset.leg)===keepFocus.leg && node.dataset.key===keepFocus.key)?.focus({preventScroll:true});
  translateTree($("#rotation-form"));
}
function canShowMotion() {
  const panel = $("#workspace-calculations");
  return !document.hidden && !dialog.open && (!panel || !panel.hidden);
}
function currentMotionPlan() {
  return strategy === "optimized" ? result : result?.baseline;
}
function setMotionControls(state = "unavailable") {
  const active = state === "playing";
  const unavailable = state === "unavailable";
  const reduced = state === "reduced";
  const toggle = $("#motion-toggle");
  if (toggle) {
    toggle.disabled = unavailable || reduced;
    toggle.dataset.state = state;
    toggle.setAttribute("aria-pressed", String(active));
    toggle.setAttribute(
      "aria-label",
      active ? "Pause rotation playback" : reduced ? "Static view — reduced motion" : "Resume rotation playback",
    );
    toggle.innerHTML = active
      ? "Ⅱ <span>Pause</span>"
      : reduced
        ? "<span>Static view</span>"
        : "▶ <span>Resume</span>";
  }
  if ($("#motion-restart")) $("#motion-restart").disabled = unavailable;
  if ($("#motion-progress")) $("#motion-progress").disabled = unavailable;
  $("#play-route").disabled = unavailable;
  $("#play-route").setAttribute("aria-label", reduced ? "Next leg" : "Replay rotation");
  $("#play-route").innerHTML = reduced
    ? "→ <span>Next leg</span>"
    : "↺ <span>Replay</span>";
  $("#map-stage").classList.toggle("is-playing", active);
  const autoLabel = $(".motion-auto-label");
  if (autoLabel)
    autoLabel.innerHTML = `<i aria-hidden="true"></i>${t(active ? "Autoplay · scenario" : reduced ? "Reduced motion · inspect legs" : unavailable ? "Awaiting feasible plan" : "Paused · scenario")}`;
  translateTree($("#map-stage"));
  if ($(".motion-controls")) translateTree($(".motion-controls"));
}
function stopPlayback() {
  motionGeneration++;
  const previous = motion;
  motion = null;
  previous?.destroy();
  if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
  cameraFrame = null;
  motionFrame = null;
  lastMotionPhase = "";
  $("#animated-plane")?.remove();
  $("#plane-position-halo")?.remove();
  $("#flight-playback").hidden = true;
  $("#flight-map").dataset.phase = "idle";
  $("#flight-map").dataset.activeLeg = "";
  $("#map-stage").classList.remove("is-refueling", "is-flying", "is-arriving");
  $$(".route-path").forEach((p) => p.classList.remove("inactive"));
  $$(".map-airport").forEach((p) =>
    p.classList.remove("motion-active", "is-refueling"),
  );
  $$(".motion-active,.active-leg").forEach((p) =>
    p.classList.remove("motion-active", "active-leg"),
  );
  if ($("#motion-fuel")) $("#motion-fuel").textContent = "— t";
  if ($("#motion-cost")) $("#motion-cost").textContent = "—";
  if ($("#motion-phase")) $("#motion-phase").textContent = "Awaiting calculation";
  if ($("#motion-summary"))
    $("#motion-summary").textContent =
      "Calculate a feasible plan to show refuelling and burn at each leg.";
  if ($("#motion-leg-buttons")) $("#motion-leg-buttons").innerHTML = "";
  if ($("#motion-progress")) $("#motion-progress").value = "0";
  setMotionControls();
}
function setViewport(view) {
  const svg = $("#flight-map");
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  const rect = svg.getBoundingClientRect?.();
  const width = Number.isFinite(rect?.width) && rect.width > 0 ? rect.width : 1440;
  const height = Number.isFinite(rect?.height) && rect.height > 0 ? rect.height : 720;
  // SVG's default xMidYMid meet preserves aspect ratio. Invert that exact
  // scale so symbols retain their CSS-pixel size in wide and square views.
  mapUiScale = 1 / Math.min(width / view.width, height / view.height);
  svg.style.setProperty("--map-ui-scale", String(mapUiScale));
  svg.querySelectorAll("[data-label-x]").forEach(label => {
    label.setAttribute("x", String(Number(label.dataset.labelX) * mapUiScale));
    label.setAttribute("y", String(Number(label.dataset.labelY) * mapUiScale));
  });
  svg.querySelectorAll("[data-base-radius]").forEach(circle => {
    circle.setAttribute("r", String(Number(circle.dataset.baseRadius) * mapUiScale));
  });
  svg.querySelectorAll("[data-label-dx]").forEach(span => {
    span.setAttribute("dx", String(Number(span.dataset.labelDx) * mapUiScale));
  });
  syncMapKeyboardFocus();
  if (motionFrame) renderPlanePosition(motionFrame);
}
function visibleMapAirports() {
  const [x, y, width, height] = $("#flight-map").getAttribute("viewBox").split(/\s+/).map(Number);
  return $$(".map-airport").filter(node => {
    const px = Number(node.dataset.mapX), py = Number(node.dataset.mapY);
    return px >= x && px <= x + width && py >= y && py <= y + height;
  });
}
function syncMapKeyboardFocus() {
  const visible = visibleMapAirports();
  const chosen = visible.find(node => node.dataset.airport === mapFocusCode)
    || visible.find(node => node.classList.contains("selected")) || visible[0];
  if (chosen) mapFocusCode = chosen.dataset.airport;
  for (const node of $$(".map-airport")) node.setAttribute("tabindex", node === chosen ? "0" : "-1");
}
function resizeMapSymbols() {
  const [x, y, width, height] = $("#flight-map").getAttribute("viewBox").split(/\s+/).map(Number);
  setViewport({ x, y, width, height });
}
function animateViewport(target = mapView, entrance = false) {
  const svg = $("#flight-map");
  if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
  const finish = () => setViewport(target);
  if (reducedMotionPreference.matches) {
    finish();
    return;
  }
  const raw = (svg.getAttribute("viewBox") || "0 0 1440 720")
    .split(/\s+/)
    .map(Number);
  const start = raw;
  const goal = [target.x, target.y, target.width, target.height];
  const began = performance.now();
  const frame = (time) => {
    const fraction = Math.min(
      1,
      Math.max(0, (time - began) / (entrance ? 1200 : 600)),
    );
    const eased = 1 - Math.pow(1 - fraction, 3);
    const [x, y, width, height] = start.map((v, i) => v + (goal[i] - v) * eased);
    setViewport({ x, y, width, height });
    cameraFrame = fraction < 1 ? requestAnimationFrame(frame) : null;
  };
  svg.setAttribute("viewBox", start.join(" "));
  cameraFrame = requestAnimationFrame(frame);
}
function focusMotionLeg(index) {
  const leg = currentMotionPlan()?.legs[index];
  if (!leg) return;
  animateViewport(fitRouteView([leg], airports, project));
}
function renderPlanePosition(frame) {
  const plane = $("#animated-plane");
  plane?.setAttribute(
    "transform",
    `translate(${frame.x},${frame.y}) rotate(${frame.angle}) scale(${.58 * mapUiScale})`,
  );
  if (plane) plane.dataset.phase = frame.phase;
  $("#plane-position-halo")?.setAttribute(
    "transform",
    `translate(${frame.x},${frame.y}) scale(${mapUiScale})`,
  );
}
function renderMotionFrame(frame, plan, lengths) {
  motionFrame = frame;
  const leg = plan.legs[frame.legIndex];
  const svg = $("#flight-map");
  svg.dataset.phase = frame.phase;
  svg.dataset.activeLeg = String(frame.legIndex);
  renderPlanePosition(frame);
  const routeProgress =
    frame.phase === "refuel"
      ? 0
      : frame.phase === "arrival"
        ? 1
        : frame.phaseProgress;
  $$(".route-trail").forEach((path) => {
    const index = Number(path.dataset.trail);
    const progress =
      index < frame.legIndex ? 1 : index === frame.legIndex ? routeProgress : 0;
    const length = Number(path.dataset.segmentLength) || lengths[index];
    const offset = Number(path.dataset.segmentStart) || 0;
    const traveled = Math.max(0, Math.min(length, lengths[index] * progress - offset));
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length - traveled);
    path.classList.toggle("completed", index < frame.legIndex);
  });
  const key = `${frame.legIndex}:${frame.phase}`;
  if (key !== lastMotionPhase) {
    lastMotionPhase = key;
    $("#map-stage").classList.toggle("is-refueling", frame.phase === "refuel");
    $("#map-stage").classList.toggle("is-flying", frame.phase === "flight");
    $("#map-stage").classList.toggle("is-arriving", frame.phase === "arrival");
    $$(".route-path").forEach((path, index) =>
      path.classList.toggle("inactive", index !== frame.legIndex),
    );
    $$(".map-airport").forEach((node) => {
      node.classList.toggle(
        "motion-active",
        node.dataset.airport ===
          (frame.phase === "arrival" ? leg.to : leg.from),
      );
      node.classList.toggle(
        "is-refueling",
        frame.phase === "refuel" &&
          node.dataset.airport === leg.from &&
          leg.upliftT > 0.001,
      );
    });
    $$("#leg-rows tr,.strategy-card").forEach((row) =>
      row.classList.remove("motion-active", "active-leg"),
    );
    $$("#leg-rows tr")[frame.legIndex]?.classList.add(
      "motion-active",
      "active-leg",
    );
    $$(".strategy-card")[frame.legIndex]?.classList.add(
      "motion-active",
      "active-leg",
    );
    $$("[data-motion-leg]").forEach((button, index) => {
      button.setAttribute("aria-current", String(index === frame.legIndex));
      button.classList.toggle("completed", index < frame.legIndex);
    });
    if ($("#motion-current-leg"))
      $("#motion-current-leg").textContent = `${leg.from} → ${leg.to}`;
    if ($("#motion-phase"))
      $("#motion-phase").textContent =
        t(frame.phase === "refuel" && leg.upliftT < 0.001 ? "No uplift" : motionLabels[frame.phase]);
    if ($("#motion-summary"))
      $("#motion-summary").textContent = frame.phase === "refuel"
        ? (leg.upliftT < 0.001 ? t("{{airport}} uses carried fuel; no uplift required.",{airport:leg.from})
          : t("{{airport}}: uplift {{fuel}} t; purchase {{cost}}.",{airport:leg.from,fuel:tonnes(leg.upliftT),cost:money(leg.costUsd)}))
        : frame.phase === "flight" ? t("{{from}} to {{to}}: arrival fuel {{fuel}} t.",{from:leg.from,to:leg.to,fuel:tonnes(leg.landingFuelT)})
          : t("Arrived at {{airport}} with {{fuel}} t of fuel.",{airport:leg.to,fuel:tonnes(leg.landingFuelT)});
  }
  const now = performance.now();
  if (now - motionHudTime > 55 || !frame.playing || frame.phaseProgress === 0) {
    motionHudTime = now;
    if ($("#motion-fuel"))
      $("#motion-fuel").textContent = `${tonnes(frame.fuelT)} t`;
    if ($("#motion-cost"))
      $("#motion-cost").textContent = money(frame.cumulativeCostUsd);
    if ($("#motion-progress"))
      $("#motion-progress").value = String(frame.totalProgress * 100);
    $("#motion-detail")?.style.setProperty(
      "--fuel-level",
      `${Math.min(100, (frame.fuelT / input.aircraft.tankCapacityT) * 100)}%`,
    );
  }
}
function setupMotion(progress = 0, autoplay = true) {
  const plan = currentMotionPlan();
  if (
    !plan?.feasible ||
    dirty ||
    plan.legs.length !== input.legs.length ||
    plan.legs.some(
      (l, i) => l.from !== input.legs[i].from || l.to !== input.legs[i].to,
    )
  )
    return;
  const paths = plan.legs.map((_, i) => $(`#route-${i}`));
  if (paths.some((path) => typeof path?.getTotalLength !== "function")) return;
  const svg = $("#flight-map"),
    ns = "http://www.w3.org/2000/svg";
  const halo = document.createElementNS(ns, "g");
  halo.id = "plane-position-halo";
  halo.innerHTML = '<circle r="17" fill="url(#plane-aura)"/>';
  const plane = document.createElementNS(ns, "g");
  plane.id = "animated-plane";
  plane.setAttribute("class", "motion-plane plane-shape");
  plane.innerHTML =
    '<path class="plane-shadow" d="M22 0C22-1 9-2 4-2L-7-15H-11L-5-3L-17-2L-21-7H-24L-21 0L-24 7H-21L-17 2L-5 3L-11 15H-7L4 2C9 2 22 1 22 0Z"/><path d="M22 0C22-1 9-2 4-2L-7-15H-11L-5-3L-17-2L-21-7H-24L-21 0L-24 7H-21L-17 2L-5 3L-11 15H-7L4 2C9 2 22 1 22 0Z"/>';
  svg.append(halo, plane);
  if ($("#motion-leg-buttons"))
    $("#motion-leg-buttons").innerHTML = plan.legs
      .map(
        (leg, index) =>
          `<button type="button" data-motion-leg="${index}" aria-current="${index === 0}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${leg.from} → ${leg.to}</strong><small>${leg.upliftT < 0.001 ? "No uplift" : `+${tonnes(leg.upliftT)} t`}</small></button>`,
      )
      .join("");
  const lengths = paths.map((path) => Math.max(0.001, path.getTotalLength()));
  const segmentOffsets = new Map();
  $$(".route-trail").forEach(path => {
    const leg = Number(path.dataset.trail);
    const length = path.getTotalLength();
    path.dataset.segmentStart = String(segmentOffsets.get(leg) || 0);
    path.dataset.segmentLength = String(length);
    segmentOffsets.set(leg, (segmentOffsets.get(leg) || 0) + length);
  });
  const generation = motionGeneration;
  motionHudTime = -Infinity;
  motion = createRotationMotion({
    paths,
    legs: plan.legs,
    reducedMotion: reducedMotionPreference.matches,
    legDurationMs: 5800,
    loop: true,
    onFrame: (frame) => {
      if (generation === motionGeneration)
        renderMotionFrame(frame, plan, lengths);
    },
    onStateChange: (state) => {
      if (generation === motionGeneration)
        setMotionControls(
          state.reducedMotion
            ? "reduced"
            : state.playing
              ? "playing"
              : "paused",
        );
    },
  });
  motion.seek(progress);
  setMotionControls(reducedMotionPreference.matches ? "reduced" : "paused");
  if (autoplay && !userPausedMotion && canShowMotion()) motion.play();
  if (!hasPresentedMap && canShowMotion()) {
    hasPresentedMap = true;
    animateViewport(mapView, true);
  }
}
function toggleMotion() {
  if (!motion || dirty) return;
  if (reducedMotionPreference.matches) {
    userPausedMotion = true;
    const next =
      (Math.min(input.legs.length - 1, (motionFrame?.legIndex ?? 0) + 1) +
        0.2) /
      input.legs.length;
    motion.seek(next);
    return;
  }
  if (motion.getState().playing) {
    userPausedMotion = true;
    motion.pause();
  } else {
    userPausedMotion = false;
    if (canShowMotion()) motion.play();
  }
}
function setDirty(message = "Inputs changed. Recalculate to update the plan.") {
  currentMessage = message;
  currentErrors = [];
  stopPlayback();
  dirty = true;
  result = null;
  $("#plan-status").textContent = t(message);
  $("#savings").textContent = "—";
  $("#baseline-cost").textContent = "—";
  $("#optimized-cost").textContent = "—";
  $("#extra-burn").textContent = "—";
  if ($("#extra-co2")) $("#extra-co2").textContent = "—";
  if ($("#carbon-threshold")) $("#carbon-threshold").textContent = "—";
  if ($("#carbon-note")) $("#carbon-note").textContent = "Recalculate a comparable feasible plan to evaluate the direct-emissions trade-off.";
  $("#download-plan").disabled = true;
  $("#play-route").disabled = true;
  $$(".uplift-result,.landing-result").forEach((x) => (x.textContent = "—"));
  $("#strategy-cards").innerHTML = "";
  $("#constraint-note").textContent = "";
  $("#model-error").hidden = true;
  $("#result-state").textContent = t("Ready when you are");
  if ($("#motion-detail")) $("#motion-detail").hidden = true;
  if ($("#route-empty-state")) $("#route-empty-state").hidden = routeCodes().some(Boolean);
  $("#recommendation").innerHTML = `<p>${escape(t(message))}</p>`;
  $("#savings-percent").textContent = t("Awaiting calculation");
  translateTree($("#workspace-calculations"));
}
function collectInputs() {
  input.initialFuelT = Number($("#initial-fuel").value || NaN);
  input.aircraft.tankCapacityT = Number($("#tank-capacity").value || NaN);
  input.aircraft.maxTakeoffWeightT = Number($("#mtow").value || NaN);
  input.aircraft.maxLandingWeightT = Number($("#mlw").value || NaN);
}
function calculate() {
  stopPlayback();
  collectInputs();
  const errors = [];
  if (!$("#flight-date").value || !$("#flight-date").validity.valid)
    errors.push("Select a valid planned date.");
  for (const [i, leg] of input.legs.entries()) {
    if (!airports[leg.from] || !airports[leg.to]) {
      errors.push({key:"Choose both airports for leg {{leg}}.",params:{leg:i+1}});
      continue;
    }
    if (leg.from === leg.to) {
      errors.push({key:"Leg {{leg}}: origin and destination must differ.",params:{leg:i+1}});
      continue;
    }
    if (leg.derivationError) {
      errors.push({key:"Unable to generate inputs for leg {{leg}}. Check the aircraft and price assumptions.",params:{leg:i+1}});
      continue;
    }
    if (leg.issues?.some(issue => issue.scope === "envelope"))
      errors.push({key:"Leg {{leg}} is outside this aircraft profile. Choose another profile or adjust the route.",params:{leg:i+1}});
    if (mode === "quotes") {
      const quote = activeQuote(leg.from);
      if (!quote)
        errors.push({key:"{{airport}} has no valid quotation for this date.",params:{airport:leg.from||t("Origin")}});
      else leg.priceUsdPerT = quote.priceUsdPerT;
    } else if (!Number.isFinite(leg.priceUsdPerT)) {
      errors.push({key:"Enter a price for {{airport}}.",params:{airport:leg.from||t("Origin")}});
    }
  }
  if (errors.length) return showError(errors);
  result = optimizeRotation(input);
  if (!result.feasible)
    return showError([...result.errors, ...result.diagnostics]);
  dirty = false; currentErrors = [];
  renderResult();
}
function renderResult({ rebuildMap = true } = {}) {
  if (!result?.feasible) return;
  $("#model-error").hidden = true;
  $("#savings-label").textContent =
    mode === "demo" ? "Fuel-cost savings · scenario" : "Fuel-cost savings · user quotes";
  $("#savings").textContent = money(result.savingsUsd);
  $("#savings-percent").textContent = Number.isFinite(result.savingsPercent)
    ? `↓ ${result.savingsPercent.toFixed(1)}%`
    : result.baseline?.feasible
      ? "Zero-purchase baseline"
      : "Baseline infeasible";
  $("#baseline-cost").textContent = result.baseline?.feasible
    ? money(result.baseline.totalCostUsd)
    : "Infeasible";
  $("#optimized-cost").textContent = money(result.totalCostUsd);
  $("#extra-burn").textContent = Number.isFinite(result.extraBurnVsBaselineT)
    ? `+${tonnes(result.extraBurnVsBaselineT)} t`
    : "No comparable baseline";
  const diagnostic = decisionDiagnostics(result);
  if ($("#extra-co2")) $("#extra-co2").textContent = diagnostic.extraDirectCo2T === null ? "—" : tonnes(diagnostic.extraDirectCo2T);
  if ($("#carbon-threshold")) $("#carbon-threshold").textContent = diagnostic.carbonBreakEvenUsdPerTCo2 === null ? "—" : `${money(diagnostic.carbonBreakEvenUsdPerTCo2)} /t CO₂`;
  if ($("#carbon-note")) $("#carbon-note").textContent = diagnostic.carbonBreakEvenUsdPerTCo2 !== null
    ? "Carbon cost at this level offsets the fuel saving. Direct combustion CO₂ only; the route is optimized for fuel purchase cost."
    : diagnostic.comparableBaseline
      ? "No additional-emissions break-even for these plans."
      : "A feasible baseline is needed for this comparison.";
  $("#result-state").textContent = "Same rotation · same terminal fuel";
  $("#cost-ratio").style.width =
    result.baseline?.feasible && result.baseline.totalCostUsd > 0
      ? `${Math.min(100, (result.totalCostUsd / result.baseline.totalCostUsd) * 100)}%`
      : "100%";
  $("#download-plan").disabled = false;
  $("#play-route").disabled =
    strategy === "baseline" && !result.baseline?.feasible;
  $("#plan-status").textContent = t("Calculated");
  $("#result-disclosure").textContent = t(mode === "demo" ? "Scenario data · editable assumptions" : "Imported prices · modeled performance");
  let candidate = result.legs.findIndex(
    (l, i) =>
      result.baseline?.feasible &&
      l.upliftT > result.baseline.legs[i].upliftT + 0.01,
  );
  if (candidate >= 0) {
    const leg = result.legs[candidate],
      additional = leg.upliftT - result.baseline.legs[candidate].upliftT;
    $("#recommendation").innerHTML =
      `<svg class='action-icon' aria-hidden='true' focusable='false' viewBox='0 0 16 16'><path d='M4 12L12 4M4 4h8v8' fill='none' stroke='currentColor' stroke-width='1.5'/></svg><p>${escape(t("At {{airport}}, buy {{fuel}} t more to cover later legs.",{airport:leg.from,fuel:tonnes(additional)}))}</p>`;
  } else
    $("#recommendation").innerHTML =
      `<svg class='action-icon' aria-hidden='true' focusable='false' viewBox='0 0 16 16'><path d='M4 12L12 4M4 4h8v8' fill='none' stroke='currentColor' stroke-width='1.5'/></svg><p>${result.baseline?.feasible ? "Under these inputs, just-in-time uplift is already optimal; no additional tankering is recommended." : "Carrying fuel forward meets the supply constraint; the just-in-time baseline is infeasible."}</p>`;
  result.legs.forEach((leg, i) => {
    $(`[data-uplift="${i}"]`).innerHTML =
      `${tonnes(leg.upliftT)}<small>${leg.upliftT < 0.001 ? "No uplift" : "Uplift"}</small>`;
    $(`[data-landing="${i}"]`).textContent = tonnes(leg.landingFuelT);
  });
  renderStrategies();
  if (rebuildMap) renderMap();

  if ($("#motion-detail")) $("#motion-detail").hidden = false;
  translateTree($("#workspace-calculations"));
}
function showError(errors) {
  setDirty("No feasible plan. Check the input guidance below.");
  currentErrors = errors;
  $("#model-error").hidden = false;
  $("#model-error").textContent = errors.length
    ? errors.map(errorText).join(" ")
    : "No feasible uplift plan for these inputs.";
  $("#result-state").textContent = "No feasible plan";
  $("#recommendation").innerHTML =
    "<span>!</span><p>Check quotation validity, route continuity and fuel/weight constraints, then recalculate.</p>";
}
function renderStrategies() {
  const plan = strategy === "optimized" ? result : result?.baseline;
  if (!result) { $("#strategy-cards").innerHTML = ""; return; }
  if (!plan?.feasible) {
    $("#strategy-cards").innerHTML =
      '<p class="micro">This plan is infeasible under the current inputs. Review the calculation guidance.</p>';
    return;
  }
  $("#strategy-cards").style.gridTemplateColumns =
    input.legs.length <= 3 ? "" : "repeat(auto-fit,minmax(240px,1fr))";
  $("#strategy-cards").innerHTML = plan.legs
    .map(
      (leg, i) =>
        `<article class="strategy-card"><header><span class="step">${t("Leg {{leg}} / {{count}}",{leg:String(i+1).padStart(2,"0"),count:input.legs.length})}</span><span class="strategy-tag">${leg.upliftT < 0.001 ? "No uplift" : leg.carryFuelT > 0.01 ? "Tankering" : "Just in time"}</span></header><h3>${leg.from} <span>→</span> ${leg.to}<span>${escape(airportCity(airports[leg.from]))} → ${escape(airportCity(airports[leg.to]))}</span></h3><div class="fuel-bar"><i style="width:${Math.min(100, (leg.takeoffFuelT / input.aircraft.tankCapacityT) * 100)}%"></i></div><div class="fuel-bar-label"><span>${t("Takeoff {{fuel}} t",{fuel:tonnes(leg.takeoffFuelT)})}</span><span>${t("Arrival {{fuel}} t",{fuel:tonnes(leg.landingFuelT)})}</span></div><div class="strategy-figures"><div><span>Uplift</span><b>${tonnes(leg.upliftT)}</b><small>t</small></div><div><span>Fuel purchase</span><b>${money(leg.costUsd)}</b></div></div><p>${t("Leg burn {{burn}} t · extra-weight burn {{extra}} t",{burn:tonnes(leg.burnT),extra:tonnes(leg.extraBurnT)})}</p></article>`,
    )
    .join("");
  const binding = plan.legs.flatMap((l) =>
    l.bindingConstraints
      .filter((c) => !["到达保留油", "本站无需加油"].includes(c))
      .map((c) => `${l.from} → ${l.to}: ${englishDiagnostic(c)}`),
  );
  $("#constraint-note").textContent =
    t("Terminal fuel {{fuel}} t. Both plans retain the same final inventory.",{fuel:tonnes(plan.finalFuelT)}) + (binding.length ? " " + t("Binding constraints: {{constraints}}.",{constraints:binding.join("; ")}) : "");
}
const labelOffsets = {
  PEK: [-37, -12],
  PKX: [-35, 13],
  PVG: [-56, -3],
  SHA: [-55, -18],
  CAN: [-44, -11],
  SZX: [-40, 16],
  HKG: [-35, 18],
  TPE: [13, 10],
  ICN: [-32, -17],
  GMP: [8, -24],
  PUS: [12, 8],
  HND: [13, 11],
  NRT: [13, -17],
  KIX: [-29, 20],
  NGO: [10, -12],
  FUK: [-32, 17],
  CTS: [12, -3],
};
const major = new Set(["SIN", "DXB", "LHR", "JFK", "LAX", "SYD", "JNB", "GRU"]);
const eastAsiaMajor = new Set(["PEK", "PVG", "HKG", "TPE", "ICN", "HND", "KIX", "CTS"]);
function airportLabels(a, active) {
  const show = active || (mapScope === "eastasia" ? eastAsiaMajor : major).has(a.code);
  if (!show) return "";
  const [dx, dy] = mapScope === "eastasia" ? (labelOffsets[a.code] || [10, -8]) : [10, -8];
  const price = priceFor(a.code);
  return `<text x="${dx * mapUiScale}" y="${dy * mapUiScale}" data-label-x="${dx}" data-label-y="${dy}" class="airport-code">${a.code} <tspan class="airport-city" data-label-dx="4" dx="${4 * mapUiScale}">${airportCity(a)}</tspan></text>${active ? `<text x="${dx * mapUiScale}" y="${(dy + 19) * mapUiScale}" data-label-x="${dx}" data-label-y="${dy + 19}" class="airport-price">${Number.isFinite(price) ? "$" + Math.round(price).toLocaleString("en-US") + `<tspan class="airport-city"> /t</tspan>` : mode === "demo" ? t("Price not entered") : t("Quote unavailable")}</text>` : ""}`;
}
function refreshMapLabels() {
  $$(".map-airport").forEach(node => {
    const airport = airports[node.dataset.airport];
    const label = airportLabels(airport, node.classList.contains("selected"));
    node.querySelector(".airport-labels").innerHTML = label;
    if (label) {
      node.setAttribute("aria-labelledby", `map-label-${airport.code}`);
      node.setAttribute("aria-description", `${airportLabel(airport, getLanguage()).name}; ${t(mode === "demo" ? "Scenario data" : "User quote")}`);
    } else node.removeAttribute("aria-labelledby");
  });
}
function routeCurve(from, to) {
  return routePath(airports[from], airports[to], project);
}
function renderMap({ progress = 0, autoplay = true } = {}) {
  stopPlayback();
  $("#airport-tooltip").hidden = true;
  const selected = new Set(input.legs.flatMap((l) => [l.from, l.to]));
  const routes = input.legs
    .map((l, i) => {
      if (!airports[l.from] || !airports[l.to] || l.from === l.to) return "";
      const d = routeCurve(l.from, l.to, i);
      const trails = d.split(/(?=M )/).filter(Boolean).map(segment =>
        `<path class="route-trail" data-trail="${i}" d="${segment}"/>`).join("");
      return `<path class="route-halo route-shadow" d="${d}"/><path id="route-${i}" class="route-path" d="${d}"/>${trails}`;
    })
    .join("");
  const nodes = airportData
    .map((a) => {
      const [x, y] = project(a.lon, a.lat),
        active = selected.has(a.code),
        price = priceFor(a.code);
      const label = airportLabels(a, active);
      return `<g class="map-airport ${active ? "selected" : ""}" data-airport="${a.code}" data-map-x="${x}" data-map-y="${y}" transform="translate(${x},${y})" tabindex="-1" role="button" ${label ? `aria-labelledby="map-label-${a.code}" aria-description="${escape(airportLabel(a, getLanguage()).name)}; ${t(mode === "demo" ? "Scenario data" : "User quote")}"` : ""} aria-label="${escape(Number.isFinite(price) ? t("{{airport}}; {{price}} USD per tonne",{airport:a.code+" "+airportCity(a),price:Math.round(price)}) : t("{{airport}}; quote unavailable",{airport:a.code+" "+airportCity(a)}))}"><circle class="ring" data-base-radius="${active ? 7 : 4}" r="${(active ? 7 : 4) * mapUiScale}"/><circle class="marker" data-base-radius="${active ? 3 : 1.7}" r="${(active ? 3 : 1.7) * mapUiScale}"/>${active ? `<circle class="airport-pulse" data-base-radius="7" r="${7 * mapUiScale}"/>` : ""}<g class="airport-labels" id="map-label-${a.code}">${label}</g></g>`;
    })
    .join("");
  $("#flight-map").innerHTML =
    `<defs><radialGradient id="plane-aura"><stop stop-color="#1769aa" stop-opacity=".18"/><stop offset="1" stop-color="#1769aa" stop-opacity="0"/></radialGradient></defs><g class="map-terrain">${mapMarkup()}</g><g class="rotation-routes">${routes}</g><g>${nodes}</g>`;
  $("#flight-map").dataset.scope = mapScope;
  $("#flight-map").setAttribute("aria-label", t("Airport map. Use arrow keys to inspect airports; Escape closes details."));
  $("#map-mode").textContent =
    t(mode === "demo" ? "Scenario data" : "Imported quotations");
  const showAirport = (code) => {
    const a = airports[code],
      quote = activeQuote(code),
      price = priceFor(code);
    $("#airport-tooltip").innerHTML = `<b>${a.code} · ${escape(airportCity(a))}</b><p><strong>${Number.isFinite(price) ? money(price) + " /t" : t("Quote unavailable")}</strong> ${t(mode === "demo" ? "Model price" : "User quote")}</p><p>${mode === "demo" ? t("Base jet + local basis + delivery + fees") : quote ? escape(quote.supplier) + " · " + t("Quote dates: {{from}} to {{to}}",{from:quote.validFrom,to:quote.validUntil}) : t("Import a valid quote")}</p>${mode === "demo" ? `<a href="#fuel-data">${t("Price components")}</a>` : ""}`;
    $("#airport-tooltip").hidden = false;
  };
  $$(".map-airport").forEach((node) => {
    node.addEventListener("pointerenter", () =>
      showAirport(node.dataset.airport),
    );
    node.addEventListener("focus", () => {
      mapFocusCode = node.dataset.airport;
      syncMapKeyboardFocus();
      showAirport(node.dataset.airport);
    });
    node.addEventListener("click", () => showAirport(node.dataset.airport));
    node.addEventListener("keydown", (e) => {
      const navigation = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
      if (navigation.includes(e.key)) {
        e.preventDefault();
        const visible = visibleMapAirports();
        if (!visible.length) return;
        let index = Math.max(0, visible.indexOf(node));
        if (e.key === "Home") index = 0;
        else if (e.key === "End") index = visible.length - 1;
        else index = (index + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + visible.length) % visible.length;
        mapFocusCode = visible[index].dataset.airport;
        syncMapKeyboardFocus();
        visible[index].focus({ preventScroll: true });
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showAirport(node.dataset.airport);
      }
      if (e.key === "Escape") $("#airport-tooltip").hidden = true;
    });
  });
  syncMapKeyboardFocus();
  $("#map-stage").addEventListener(
    "pointerleave",
    () => {
      $("#airport-tooltip").hidden = true;
    },
    { once: true },
  );
  setupMotion(progress, autoplay);
  translateTree($("#map-stage"));
}
function playRotation() {
  if (!motion || dirty) return;
  if (reducedMotionPreference.matches) {
    toggleMotion();
    return;
  }
  userPausedMotion = false;
  animateViewport(mapView);
  motion.restart();
}
function changeMode(next) {
  stopPlayback();
  result = null;
  dirty = true;
  mode = next;
  $("#mode-demo").classList.toggle("selected", mode === "demo");
  $("#mode-quotes").classList.toggle("selected", mode === "quotes");
  $("#mode-demo").setAttribute("aria-pressed", String(mode === "demo"));
  $("#mode-quotes").setAttribute("aria-pressed", String(mode === "quotes"));
  for (const leg of input.legs) leg.priceUsdPerT = priceFor(leg.from);
  renderForm();

  renderMap();
  setDirty(mode === "quotes" ? "Review imported quotations, then calculate." : "Inputs ready. Calculate your route.");
  emitScenario();
}
function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#rotation-form").addEventListener("submit", (e) => {
  e.preventDefault();
  calculate();
});
$("#rotation-form").addEventListener("input", (e) => {
  const field = e.target;
  if (field.dataset.leg !== undefined && field.dataset.key) {
    const leg = input.legs[Number(field.dataset.leg)],
      key = field.dataset.key;
    if (!["from", "to"].includes(key)) {
      leg.overrides ||= {};
      leg.overrides[key] = true;
      if (key === "maxUpliftT" && field.value === "") delete leg.maxUpliftT;
      else
        leg[key] =
          field.value === ""
            ? NaN
            : Number(field.value) / (key === "carryBurnRate" ? 100 : 1);
      if (key === "priceUsdPerT" && mode === "demo") {
        airportPriceOverrides[leg.from] = leg[key];
        input.legs.forEach((other, index) => {
          if (other.from === leg.from) {
            other.priceUsdPerT = leg[key];
            other.overrides ||= {}; other.overrides[key] = true;
            if (index !== Number(field.dataset.leg))
              $(`[data-leg="${index}"][data-key="priceUsdPerT"]`).value =
                field.value;
          }
        });
      }
    }
  }
  collectInputs();
  $$("#leg-rows .leg-derivation").forEach((node, index) => { node.textContent = legDerivationLabel(input.legs[index]); });
  setDirty();
  emitScenario();
});
$("#rotation-form").addEventListener("change", (event) => {
  const field = event.target;
  if (field.dataset.key === "from" || field.dataset.key === "to") {
    const index = Number(field.dataset.leg), stops = routeCodes();
    stops[field.dataset.key === "from" ? index : index + 1] = field.value;
    loadedExample = null;
    rebuildRoute(stops);
    renderForm(); renderMap();
    setDirty("Route inputs updated. Calculate when ready.");
  } else if (field.id === "flight-date") {
    for (const leg of input.legs) leg.priceUsdPerT = priceFor(leg.from);
    renderForm(); renderMap(); setDirty("Date updated. Calculate when ready."); emitScenario();
  } else if (field.dataset.key === "priceUsdPerT") { renderMap();  emitScenario(); }
});
$("#aircraft").addEventListener("change", () => {
  aircraftKey = Object.hasOwn(AIRCRAFT_PROFILES, $("#aircraft").value) ? $("#aircraft").value : "widebody";
  input.aircraft = profileAircraft();
  rebuildRoute(routeCodes()); syncAircraftInputs(); renderForm(); renderMap();
  setDirty("Aircraft inputs regenerated. Calculate when ready.");
});
$("#rotation-form").addEventListener("click", event => {
  const remove = event.target.closest("[data-remove]");
  const move = event.target.closest("[data-move-stop]");
  if (!remove && !move) return;
  const stops = routeCodes();
  loadedExample = null;
  let index;
  if (remove) {
    if (input.legs.length <= 1) return;
    index = Number(remove.dataset.remove);
    stops.splice(index+1,1);
    index = Math.min(index,stops.length-2);
  } else {
    index = Number(move.dataset.moveStop);
    const other = index + (move.dataset.direction === "up" ? -1 : 1);
    if (other < 0 || other >= input.legs.length) return;
    [stops[index+1],stops[other+1]] = [stops[other+1],stops[index+1]];
    index = other;
  }
  rebuildRoute(stops); renderForm({focusLeg:index,focusKey:"to"}); renderMap();
  setDirty("Route inputs updated. Calculate when ready.");
});
$("#add-leg").addEventListener("click", () => {
  if (input.legs.length >= 5) return;
  loadedExample = null;
  input.legs.push(emptyLeg(input.legs.at(-1).to,""));
  renderForm({focusLeg:input.legs.length-1,focusKey:"to"}); renderMap();
  setDirty("Choose the next destination."); emitScenario();
});
function loadExample(next) {
  preset = next === "eastasia" ? "eastasia" : "global";
  loadedExample = preset;
  userPausedMotion = false;
  aircraftKey = "widebody";
  input.aircraft = profileAircraft(); input.initialFuelT = 0;
  $("#aircraft").value = aircraftKey;
  rebuildRoute(preset === "eastasia" ? ["PVG","ICN","HND","PVG"] : ["SIN","DXB","LHR","JFK","LAX"]);
  mapScope = preset === "eastasia" ? "eastasia" : "global";
  Object.assign(mapView,MAP_VIEWS[mapScope]);
  if ($("#map-scope")) $("#map-scope").value = mapScope;
  setViewport(mapView); syncAircraftInputs(); renderForm(); renderMap();
  setDirty("Example loaded. Change any input, then calculate.");
}
function clearRoute() {
  userPausedMotion = false; airportPriceOverrides = {}; loadedExample = null;
  input = {aircraft:profileAircraft(),initialFuelT:0,legs:[emptyLeg()]};
  syncAircraftInputs(); renderForm(); renderMap();
  setDirty("Choose your origin and destination."); emitScenario();
}
$("#reset-plan").addEventListener("click", clearRoute);
$("#scenario-preset")?.addEventListener("change", event => { preset = event.target.value; });
$("#load-example")?.addEventListener("click", () => loadExample($("#scenario-preset")?.value));
$("#map-scope")?.addEventListener("change", (event) => {
  mapScope = event.target.value === "eastasia" ? "eastasia" : "global";
  Object.assign(mapView, MAP_VIEWS[mapScope]);
  $("#flight-map").dataset.scope = mapScope;
  refreshMapLabels();
  animateViewport(mapView);
});
$("#fit-route")?.addEventListener("click", () => {
  const completeLegs = input.legs.filter(leg => airports[leg.from] && airports[leg.to] && leg.from !== leg.to);
  animateViewport(completeLegs.length ? fitRouteView(completeLegs, airports, project) : MAP_VIEWS.global);
});
$("#mode-demo").addEventListener("click", () => changeMode("demo"));
$("#mode-quotes").addEventListener("click", () => changeMode("quotes"));
$("#play-route").addEventListener("click", playRotation);
$$("[data-strategy]").forEach((button) =>
  button.addEventListener("click", () => {
    strategy = button.dataset.strategy;
    $$("[data-strategy]").forEach((b) => {
      b.classList.toggle("selected", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    const progress = motion?.getState().totalProgress ?? 0;
    stopPlayback();
    renderStrategies();
    renderMap({ progress });
    $("#play-route").disabled =
      !result || (strategy === "baseline" && !result.baseline?.feasible);
  }),
);
$$("[data-import]").forEach((button) =>
  button.addEventListener("click", () => {
    dialog.showModal();
    syncMotionVisibility();
  }),
);
$("#close-import").addEventListener("click", () => dialog.close());
$("#use-quotes").addEventListener("click", () => {
  dialog.close();
  changeMode("quotes");
});
$("#clear-quotes").addEventListener("click", () => {
  quoteImportGeneration++;
  $("#import-feedback").setAttribute("aria-busy", "false");
  quotes = [];
  $("#quote-count").textContent = "0";
  $("#quote-file").value = "";
  setQuoteFeedback("Quotations cleared.");
  if (mode === "quotes") changeMode("quotes");
});
$("#download-template").addEventListener("click", () =>
  downloadFile(
    "fuel-atlas-quotes-template.csv",
    "\ufeff" + QUOTE_CSV_TEMPLATE,
    "text/csv;charset=utf-8",
  ),
);
$("#quote-file").addEventListener("change", async (e) => {
  const generation = ++quoteImportGeneration;
  $("#import-feedback").setAttribute("aria-busy", "false");
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 256 * 1024) {
    setQuoteFeedback("Choose a CSV under 256 KiB. Existing quotations are kept.");
    return;
  }
  setQuoteFeedback("Reading selected quotation file…");
  $("#import-feedback").setAttribute("aria-busy", "true");
  try {
    const text = await file.text();
    if (generation !== quoteImportGeneration) return;
    const parsed = parseQuoteCsv(text, {
      today: $("#flight-date").value,
    });
    quotes = parsed.quotes;
    $("#quote-count").textContent = String(quotes.length);
    setQuoteFeedback("Imported {{count}} quotations. Select My quotes to use them.", {count:quotes.length}, parsed.errors);
    if (mode === "quotes") changeMode("quotes");
  } catch {
    if (generation !== quoteImportGeneration) return;
    setQuoteFeedback("Unable to read this file. Choose a UTF-8 CSV. Existing quotations are kept.");
  } finally {
    if (generation === quoteImportGeneration) $("#import-feedback").setAttribute("aria-busy", "false");
  }
});
$("#download-plan").addEventListener("click", () => {
  if (!result?.feasible || dirty) return;
  const provenance =
    mode === "quotes" ? input.legs.map((l) => activeQuote(l.from)) : [];
  downloadFile(
    "fuel-atlas-rotation.json",
    JSON.stringify(
      {
        schemaVersion: 2,
        date: $("#flight-date").value,
        priceMode: mode,
        routeSelection: "user-defined",
        exampleSeed: loadedExample,
        assumptions: scenarioOptions,
        aircraftProfile: aircraftKey,
        geographyStatus: "sourced-coordinates-great-circle-illustration",
        performanceStatus: "generated-with-explicit-overrides",
        priceStatus: mode === "demo" ? "modeled-synthetic" : "user-supplied",
        input,
        quotes: provenance,
        result,
        decisionDiagnostics: decisionDiagnostics(result),
        limitations: "Fixed-route uplift scenario. Replace illustrative performance with airline-approved data; no order execution.",
      },
      null,
      2,
    ),
    "application/json",
  );
});
$("#motion-toggle")?.addEventListener("click", toggleMotion);
$("#motion-restart")?.addEventListener("click", playRotation);
$("#motion-progress")?.addEventListener("input", (event) => {
  if (!motion) return;
  const progress = Number(event.target.value) / 100;
  userPausedMotion = true;
  motion.pause();
  motion.seek(progress);
});
$("#motion-leg-buttons")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-motion-leg]");
  if (!button || !motion) return;
  const index = Number(button.dataset.motionLeg);
  userPausedMotion = true;
  motion.pause();
  motion.seek((index + 0.2) / input.legs.length);
  focusMotionLeg(index);
});
function syncMotionVisibility() {
  if (!motion) return;
  if (!canShowMotion()) {
    motion.pause();
    if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
  } else if (!userPausedMotion && !reducedMotionPreference.matches)
    motion.play();
}
dialog.addEventListener("close", syncMotionVisibility);
document.addEventListener("visibilitychange", syncMotionVisibility);
document.addEventListener("workspacechange", syncMotionVisibility);
reducedMotionPreference.addEventListener?.("change", () => {
  const progress = motion?.getState().totalProgress ?? 0;
  stopPlayback();
  renderMap({ progress });
});

document.addEventListener("languagechange", () => {
  renderQuoteFeedback();
  const progress = motion?.getState().totalProgress ?? 0;
  const playing = motion?.getState().playing ?? false;
  const errors = [...currentErrors];
  renderForm();
  if (result?.feasible && !dirty) {
    renderResult({rebuildMap:false});
    renderMap({progress,autoplay:playing});
  } else {
    renderMap({autoplay:false});
    setDirty(currentMessage);
    if (errors.length) { currentErrors=errors; $("#model-error").hidden=false; $("#model-error").textContent=errors.map(errorText).join(" "); }
  }

});
document.addEventListener("scenarioassumptionschange", event => {
  const overrides = input.legs.map(leg => ({ ...(leg.overrides || {}) }));
  const previous = input.legs.map(leg => ({ ...leg }));
  scenarioOptions = event.detail?.options || getScenarioOptions();
  rebuildRoute(routeCodes(),{resetOverrides:false});
  input.legs.forEach((leg,index) => {
    for (const key of Object.keys(overrides[index] || {})) leg[key]=previous[index][key];
    leg.overrides=overrides[index] || {};
  });
  renderForm(); renderMap(); setDirty("Assumptions updated. Your edited inputs are kept."); emitScenario();
});

window.addEventListener("pagehide", () => {
  stopPlayback();
  mapResizeObserver?.disconnect();
  window.removeEventListener("resize", resizeMapSymbols);
});
setViewport(MAP_VIEWS.global);
if ($("#scenario-preset")) $("#scenario-preset").value = preset;
if ($("#map-scope")) $("#map-scope").value = mapScope;
syncAircraftInputs();
renderForm();

renderMap();
setDirty("Choose your origin and destination.");

emitScenario();
if (typeof ResizeObserver === "function") {
  mapResizeObserver = new ResizeObserver(resizeMapSymbols);
  mapResizeObserver.observe($("#flight-map"));
} else window.addEventListener("resize", resizeMapSymbols);
