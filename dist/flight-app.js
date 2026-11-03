import { mapMarkup, project } from "./asia-map.js";
import { createRotationMotion } from "./rotation-motion.js";
import { optimizeRotation, defaultRotation } from "./flight-optimizer.js";
import {
  parseQuoteCsv,
  quoteForAirport,
  QUOTE_CSV_TEMPLATE,
} from "./fuel-quotes.js";

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
const airportData = [
  ["PEK", "北京首都", "北京", "CN", 116.5975, 40.0801],
  ["PKX", "北京大兴", "北京", "CN", 116.4105, 39.5098],
  ["PVG", "上海浦东", "上海", "CN", 121.8052, 31.1434],
  ["SHA", "上海虹桥", "上海", "CN", 121.3363, 31.1979],
  ["CAN", "广州白云", "广州", "CN", 113.2988, 23.3924],
  ["SZX", "深圳宝安", "深圳", "CN", 113.8107, 22.6393],
  ["HKG", "香港国际", "香港", "HK", 113.9146, 22.3089],
  ["TPE", "台北桃园", "台北", "TW", 121.233, 25.0777],
  ["ICN", "首尔仁川", "首尔", "KR", 126.4407, 37.4691],
  ["GMP", "首尔金浦", "首尔", "KR", 126.7906, 37.5583],
  ["PUS", "釜山金海", "釜山", "KR", 128.9382, 35.1795],
  ["HND", "东京羽田", "东京", "JP", 139.7798, 35.5523],
  ["NRT", "东京成田", "东京", "JP", 140.3864, 35.7647],
  ["KIX", "大阪关西", "大阪", "JP", 135.244, 34.4273],
  ["NGO", "名古屋中部", "名古屋", "JP", 136.8054, 34.8584],
  ["FUK", "福冈", "福冈", "JP", 130.451, 33.5859],
  ["CTS", "札幌新千岁", "札幌", "JP", 141.6923, 42.7752],
].map(([code, name, city, region, lon, lat]) => ({
  code,
  name,
  city,
  region,
  lon,
  lat,
}));
const airports = Object.fromEntries(airportData.map((a) => [a.code, a]));
const illustrativePrices = {
  PEK: 925,
  PKX: 930,
  PVG: 860,
  SHA: 895,
  CAN: 905,
  SZX: 915,
  HKG: 1030,
  TPE: 955,
  ICN: 980,
  GMP: 1010,
  PUS: 995,
  HND: 1120,
  NRT: 1090,
  KIX: 1060,
  NGO: 1075,
  FUK: 1055,
  CTS: 1110,
};
let input = defaultRotation();
let mode = "demo",
  quotes = [],
  result = null,
  dirty = false,
  strategy = "optimized",
  region = "all";
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
const mapView = { x: 300, y: 35, width: 510, height: 390 };
const motionLabels = { refuel: "加油中", flight: "飞行中", arrival: "已抵达" };
const dialog = $("#import-dialog");

function activeQuote(code) {
  return quoteForAirport(quotes, code, $("#flight-date").value);
}
function priceFor(code) {
  return mode === "demo"
    ? illustrativePrices[code]
    : activeQuote(code)?.priceUsdPerT;
}
function airportOptions(selected) {
  return airportData
    .map(
      (a) =>
        `<option value="${a.code}" ${a.code === selected ? "selected" : ""}>${a.code} · ${a.city}</option>`,
    )
    .join("");
}
function syncAircraftInputs() {
  $("#tank-capacity").value = input.aircraft.tankCapacityT;
  $("#mtow").value = input.aircraft.maxTakeoffWeightT;
  $("#mlw").value = input.aircraft.maxLandingWeightT;
  $("#initial-fuel").value = input.initialFuelT;
}
function renderForm() {
  $("#leg-rows").innerHTML = input.legs
    .map(
      (leg, i) =>
        `<tr><td>${String(i + 1).padStart(2, "0")}</td><td><div class="leg-route"><select data-leg="${i}" data-key="from" aria-label="航段${i + 1}出发机场">${airportOptions(leg.from)}</select><span>↗</span><select data-leg="${i}" data-key="to" aria-label="航段${i + 1}到达机场">${airportOptions(leg.to)}</select></div></td><td><input data-leg="${i}" data-key="priceUsdPerT" aria-label="${leg.from}出发油价 USD每吨" type="number" min="0" step="any" value="${Number.isFinite(leg.priceUsdPerT) ? leg.priceUsdPerT : ""}" ${mode === "quotes" ? "readonly" : ""} placeholder="待报价"></td><td><input data-leg="${i}" data-key="baseBurnT" aria-label="航段${i + 1}基础耗油 吨" type="number" min="0" step="any" value="${leg.baseBurnT}" required></td><td class="uplift-result" data-uplift="${i}">—</td><td class="landing-result" data-landing="${i}">—</td><td><button type="button" class="remove-leg" data-remove="${i}" aria-label="删除航段${i + 1}" ${input.legs.length <= 2 ? "disabled" : ""}>×</button></td></tr>`,
    )
    .join("");
  $("#performance-rows").innerHTML = input.legs
    .map(
      (leg, i) =>
        `<tr><td>${leg.from} → ${leg.to}</td>${[
          ["taxiBurnT", "滑行耗油", leg.taxiBurnT],
          ["reserveT", "到达保留油", leg.reserveT],
          ["carryBurnRate", "额外携油损耗百分比", leg.carryBurnRate * 100],
          ["zeroFuelWeightT", "无油重量", leg.zeroFuelWeightT],
          ["maxUpliftT", "供油上限", leg.maxUpliftT ?? ""],
        ]
          .map(
            ([key, label, value]) =>
              `<td><input type="number" data-leg="${i}" data-key="${key}" aria-label="航段${i + 1}${label}" min="0" ${key === "carryBurnRate" ? 'max="99.99"' : ""} step="any" value="${value}" ${key === "maxUpliftT" ? 'placeholder="不限"' : "required"}></td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  $("#add-leg").disabled = input.legs.length >= 5;
  $("#route-caption").textContent = [
    input.legs[0].from,
    ...input.legs.map((l) => l.to),
  ]
    .map((c) => airports[c]?.city ?? c)
    .join(" → ");
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
      active ? "暂停轮转动画" : reduced ? "已减少动态效果" : "继续轮转动画",
    );
    toggle.innerHTML = active
      ? "Ⅱ <span>暂停</span>"
      : reduced
        ? "<span>静态查看</span>"
        : "▶ <span>继续</span>";
  }
  if ($("#motion-restart")) $("#motion-restart").disabled = unavailable;
  if ($("#motion-progress")) $("#motion-progress").disabled = unavailable;
  $("#play-route").disabled = unavailable;
  $("#play-route").innerHTML = reduced
    ? "→ <span>下一航段</span>"
    : "↺ <span>重播轮转</span>";
  $("#map-stage").classList.toggle("is-playing", active);
  const autoLabel = $(".motion-auto-label");
  if (autoLabel)
    autoLabel.innerHTML = `<i aria-hidden="true"></i>${active ? "自动播放 · 航班模拟" : reduced ? "减少动态 · 逐段查看" : unavailable ? "等待可行方案" : "已暂停 · 航班模拟"}`;
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
  if ($("#motion-phase")) $("#motion-phase").textContent = "等待计算";
  if ($("#motion-summary"))
    $("#motion-summary").textContent =
      "计算可行方案后，自动演示每站加油和飞行耗油。";
  if ($("#motion-leg-buttons")) $("#motion-leg-buttons").innerHTML = "";
  if ($("#motion-progress")) $("#motion-progress").value = "0";
  setMotionControls();
}
function animateViewport(target = mapView, entrance = false) {
  const svg = $("#flight-map");
  if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
  const finish = () =>
    svg.setAttribute(
      "viewBox",
      `${target.x} ${target.y} ${target.width} ${target.height}`,
    );
  if (reducedMotionPreference.matches) {
    finish();
    return;
  }
  const raw = (svg.getAttribute("viewBox") || "300 35 510 390")
    .split(/\s+/)
    .map(Number);
  const start = entrance ? [270, 15, 570, 430] : raw;
  const goal = [target.x, target.y, target.width, target.height];
  const began = performance.now();
  const frame = (time) => {
    const fraction = Math.min(
      1,
      Math.max(0, (time - began) / (entrance ? 1200 : 600)),
    );
    const eased = 1 - Math.pow(1 - fraction, 3);
    svg.setAttribute(
      "viewBox",
      start.map((v, i) => v + (goal[i] - v) * eased).join(" "),
    );
    cameraFrame = fraction < 1 ? requestAnimationFrame(frame) : null;
  };
  svg.setAttribute("viewBox", start.join(" "));
  cameraFrame = requestAnimationFrame(frame);
}
function focusMotionLeg(index) {
  const leg = currentMotionPlan()?.legs[index];
  if (!leg) return;
  const [x1, y1] = project(airports[leg.from].lon, airports[leg.from].lat);
  const [x2, y2] = project(airports[leg.to].lon, airports[leg.to].lat);
  const width = Math.max(285, Math.abs(x2 - x1) + 170);
  const height = Math.max(230, (width * mapView.height) / mapView.width);
  animateViewport({
    x: (x1 + x2) / 2 - width / 2,
    y: (y1 + y2) / 2 - height / 2,
    width,
    height,
  });
}
function renderMotionFrame(frame, plan, lengths) {
  motionFrame = frame;
  const leg = plan.legs[frame.legIndex];
  const svg = $("#flight-map");
  svg.dataset.phase = frame.phase;
  svg.dataset.activeLeg = String(frame.legIndex);
  const plane = $("#animated-plane");
  plane?.setAttribute(
    "transform",
    `translate(${frame.x},${frame.y}) rotate(${frame.angle}) scale(.58)`,
  );
  if (plane) plane.dataset.phase = frame.phase;
  $("#plane-position-halo")?.setAttribute(
    "transform",
    `translate(${frame.x},${frame.y})`,
  );
  const routeProgress =
    frame.phase === "refuel"
      ? 0
      : frame.phase === "arrival"
        ? 1
        : frame.phaseProgress;
  $$(".route-trail").forEach((path, index) => {
    const progress =
      index < frame.legIndex ? 1 : index === frame.legIndex ? routeProgress : 0;
    path.style.strokeDasharray = String(lengths[index]);
    path.style.strokeDashoffset = String(lengths[index] * (1 - progress));
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
        frame.phase === "refuel" && leg.upliftT < 0.001
          ? "无需加油"
          : motionLabels[frame.phase];
    if ($("#motion-summary"))
      $("#motion-summary").textContent =
        frame.phase === "refuel"
          ? `${leg.from} ${leg.upliftT < 0.001 ? "利用已携带燃油，本次无需补油。" : `计划加油 ${tonnes(leg.upliftT)} t，采购 ${money(leg.costUsd)}。`}`
          : frame.phase === "flight"
            ? `${leg.from} 飞往 ${leg.to}，燃油随航段消耗；本段落地目标 ${tonnes(leg.landingFuelT)} t。`
            : `已抵达 ${leg.to}，落地燃油 ${tonnes(leg.landingFuelT)} t。`;
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
          `<button type="button" data-motion-leg="${index}" aria-current="${index === 0}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${leg.from} → ${leg.to}</strong><small>${leg.upliftT < 0.001 ? "无需加油" : `+${tonnes(leg.upliftT)} t`}</small></button>`,
      )
      .join("");
  const lengths = paths.map((path) => Math.max(0.001, path.getTotalLength()));
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
function setDirty(message = "参数已修改，重新计算以更新方案") {
  stopPlayback();
  dirty = true;
  result = null;
  $("#plan-status").textContent = message;
  $("#savings").textContent = "—";
  $("#savings-percent").textContent = "待计算";
  $("#baseline-cost").textContent = "—";
  $("#optimized-cost").textContent = "—";
  $("#extra-burn").textContent = "—";
  $("#download-plan").disabled = true;
  $("#play-route").disabled = true;
  $("#recommendation").innerHTML =
    "<span>↗</span><p>参数已更新，点击「重新计算方案」查看新的加油建议。</p>";
  $$(".uplift-result,.landing-result").forEach((x) => (x.textContent = "—"));
  $("#strategy-cards").innerHTML = "";
  $("#constraint-note").textContent = "";
  $("#model-error").hidden = true;
  $("#result-state").textContent = "等待计算 · 结果将在计算后更新";
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
    errors.push("请选择有效的计划日期。");
  for (const [i, leg] of input.legs.entries()) {
    if (leg.from === leg.to)
      errors.push(`第 ${i + 1} 航段的出发和到达机场不能相同。`);
    if (mode === "quotes") {
      const quote = activeQuote(leg.from);
      if (!quote)
        errors.push(`${leg.from} 在计划日期没有有效、含费用的到机报价。`);
      else leg.priceUsdPerT = quote.priceUsdPerT;
    }
  }
  if (errors.length) return showError(errors);
  result = optimizeRotation(input);
  if (!result.feasible)
    return showError([...result.errors, ...result.diagnostics]);
  dirty = false;
  $("#model-error").hidden = true;
  $("#savings-label").textContent =
    mode === "demo" ? "本次轮转预计节省 · 示例" : "本次轮转预计节省 · 用户报价";
  $("#savings").textContent = money(result.savingsUsd);
  $("#savings-percent").textContent = Number.isFinite(result.savingsPercent)
    ? `↓ ${result.savingsPercent.toFixed(1)}%`
    : result.baseline?.feasible
      ? "零采购基线"
      : "基线不可行";
  $("#baseline-cost").textContent = result.baseline?.feasible
    ? money(result.baseline.totalCostUsd)
    : "不可执行";
  $("#optimized-cost").textContent = money(result.totalCostUsd);
  $("#extra-burn").textContent = Number.isFinite(result.extraBurnVsBaselineT)
    ? `+${tonnes(result.extraBurnVsBaselineT)} t`
    : "无可比基线";
  $("#result-state").textContent = "同一轮转 · 同一终点油量";
  $("#cost-ratio").style.width =
    result.baseline?.feasible && result.baseline.totalCostUsd > 0
      ? `${Math.min(100, (result.totalCostUsd / result.baseline.totalCostUsd) * 100)}%`
      : "100%";
  $("#download-plan").disabled = false;
  $("#play-route").disabled =
    strategy === "baseline" && !result.baseline?.feasible;
  $("#plan-status").innerHTML =
    '<span class="live-dot"></span> 已计算 · ' +
    (mode === "demo" ? "使用示例价格与性能" : "使用用户报价与示例性能");
  $("#result-disclosure").textContent =
    mode === "demo"
      ? "价格与性能为演示假设，仅作方案比较。"
      : "报价由用户提供；性能仍为可编辑示例。";
  let candidate = result.legs.findIndex(
    (l, i) =>
      result.baseline?.feasible &&
      l.upliftT > result.baseline.legs[i].upliftT + 0.01,
  );
  if (candidate >= 0) {
    const leg = result.legs[candidate],
      additional = leg.upliftT - result.baseline.legs[candidate].upliftT;
    $("#recommendation").innerHTML =
      `<span>↗</span><p>在 <b>${leg.from}</b> 比按需方案多加 <b>${tonnes(additional)} t</b>，提前携油覆盖后续航段。${leg.bindingConstraints.includes("最大落地重量") ? "本段携油受落地重量限制。" : ""}</p>`;
  } else
    $("#recommendation").innerHTML =
      `<span>↗</span><p>${result.baseline?.feasible ? "当前价差不足以覆盖携油成本，逐站按需加油已是最优方案。" : "通过提前携油满足供油限制；逐站按需方案不可执行。"}</p>`;
  result.legs.forEach((leg, i) => {
    $(`[data-uplift="${i}"]`).innerHTML =
      `${tonnes(leg.upliftT)}<small>${leg.upliftT < 0.001 ? "无需加油" : "本站加油"}</small>`;
    $(`[data-landing="${i}"]`).textContent = tonnes(leg.landingFuelT);
  });
  renderStrategies();
  renderMap();
  renderAirports();
}
function showError(errors) {
  setDirty("当前条件无法生成方案，请检查下方提示");
  $("#model-error").hidden = false;
  $("#model-error").textContent = errors.length
    ? errors.join(" ")
    : "当前输入没有可行加油方案。";
  $("#result-state").textContent = "当前无可行方案";
  $("#recommendation").innerHTML =
    "<span>!</span><p>请检查有效报价、航段连续性和重量约束后重新计算。</p>";
}
function renderStrategies() {
  const plan = strategy === "optimized" ? result : result?.baseline;
  if (!result || !plan?.feasible) {
    $("#strategy-cards").innerHTML =
      '<p class="micro">此方案在当前条件下不可执行。请查看计算提示。</p>';
    return;
  }
  $("#strategy-cards").style.gridTemplateColumns =
    input.legs.length <= 3 ? "" : "repeat(auto-fit,minmax(240px,1fr))";
  $("#strategy-cards").innerHTML = plan.legs
    .map(
      (leg, i) =>
        `<article class="strategy-card"><header><span class="step">LEG ${String(i + 1).padStart(2, "0")} / ${input.legs.length}</span><span class="strategy-tag">${leg.upliftT < 0.001 ? "无需加油" : leg.carryFuelT > 0.01 ? "提前携油" : "按需加油"}</span></header><h3>${leg.from} <span>→</span> ${leg.to}<span>${escape(airports[leg.from].city)} → ${escape(airports[leg.to].city)}</span></h3><div class="fuel-bar"><i style="width:${Math.min(100, (leg.takeoffFuelT / input.aircraft.tankCapacityT) * 100)}%"></i></div><div class="fuel-bar-label"><span>起飞 ${tonnes(leg.takeoffFuelT)} t</span><span>落地 ${tonnes(leg.landingFuelT)} t</span></div><div class="strategy-figures"><div><span>本站加油</span><b>${tonnes(leg.upliftT)}</b><small>t</small></div><div><span>采购成本</span><b>${money(leg.costUsd)}</b></div></div><p>航段耗油 ${tonnes(leg.burnT)} t · 其中额外携油耗油 ${tonnes(leg.extraBurnT)} t</p></article>`,
    )
    .join("");
  const binding = plan.legs.flatMap((l) =>
    l.bindingConstraints
      .filter((c) => !["到达保留油", "本站无需加油"].includes(c))
      .map((c) => `${l.from} → ${l.to}：${c}`),
  );
  $("#constraint-note").textContent =
    `终点燃油 ${tonnes(plan.finalFuelT)} t · 两方案终点库存一致。${binding.length ? "约束生效：" + binding.join("；") + "。" : ""}基础耗油由用户设定，修改航线后请同步更新性能参数。`;
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
const major = new Set(["PEK", "PVG", "HKG", "TPE", "ICN", "HND", "KIX", "CTS"]);
function routeCurve(from, to, i) {
  const [x1, y1] = project(airports[from].lon, airports[from].lat),
    [x2, y2] = project(airports[to].lon, airports[to].lat);
  const dx = x2 - x1,
    dy = y2 - y1,
    len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(40, len * 0.15) * (i % 2 ? 1 : -1);
  return `M ${x1} ${y1} Q ${(x1 + x2) / 2 - (dy / len) * bend} ${(y1 + y2) / 2 + (dx / len) * bend} ${x2} ${y2}`;
}
function renderMap({ progress = 0, autoplay = true } = {}) {
  stopPlayback();
  $("#airport-tooltip").hidden = true;
  const selected = new Set(input.legs.flatMap((l) => [l.from, l.to]));
  const routes = input.legs
    .map((l, i) => {
      const d = routeCurve(l.from, l.to, i);
      return `<path class="route-halo route-shadow" d="${d}"/><path id="route-${i}" class="route-path" d="${d}"/><path class="route-trail" data-trail="${i}" d="${d}"/>`;
    })
    .join("");
  const nodes = airportData
    .map((a) => {
      const [x, y] = project(a.lon, a.lat),
        [dx, dy] = labelOffsets[a.code],
        active = selected.has(a.code),
        show = active || major.has(a.code),
        price = priceFor(a.code);
      const label = show
        ? `<text x="${dx}" y="${dy}" class="airport-code">${a.code}<tspan class="airport-city" dx="4">${a.city}</tspan></text>${active ? `<text x="${dx}" y="${dy + 11}" class="airport-price">${Number.isFinite(price) ? "$" + Math.round(price).toLocaleString("en-US") : "待报价"}<tspan class="airport-city"> /t${mode === "demo" ? " · 示例" : ""}</tspan></text>` : ""}`
        : "";
      return `<g class="map-airport ${active ? "selected" : ""}" data-airport="${a.code}" transform="translate(${x},${y})" tabindex="0" role="button" aria-label="${a.name} ${a.code}，${mode === "demo" ? "示例价格" : "用户报价"}${Number.isFinite(price) ? Math.round(price) + "美元每吨" : "缺失"}"><circle class="ring" r="${active ? 7 : 4}"/><circle class="marker" r="${active ? 3 : 1.7}"/>${active ? '<circle class="airport-pulse" r="7"/>' : ""}${label}</g>`;
    })
    .join("");
  $("#flight-map").innerHTML =
    `<defs><radialGradient id="plane-aura"><stop stop-color="#a4edff" stop-opacity=".55"/><stop offset="1" stop-color="#a4edff" stop-opacity="0"/></radialGradient><radialGradient id="map-glow"><stop stop-color="#c5efab" stop-opacity=".13"/><stop offset="1" stop-color="#c5efab" stop-opacity="0"/></radialGradient></defs><circle cx="550" cy="220" r="210" fill="url(#map-glow)"/><g class="map-terrain">${mapMarkup}</g><g class="rotation-routes">${routes}</g><g>${nodes}</g>`;
  $("#map-mode").textContent =
    mode === "demo" ? "DEMO / 示例价格" : "QUOTES / 用户报价";
  const showAirport = (code) => {
    const a = airports[code],
      quote = activeQuote(code),
      price = priceFor(code);
    $("#airport-tooltip").innerHTML =
      `<b>${a.code} · ${a.name}</b><p><strong>${Number.isFinite(price) ? money(price) + " /t" : "暂无可用报价"}</strong> ${mode === "demo" ? "示例假设" : quote ? "用户提供 · into-plane" : "需导入有效报价"}</p><p>${mode === "demo" ? "演示用价格，不代表实际供货价。" : quote ? escape(quote.supplier) + " · " + escape(quote.validFrom) + " 至 " + escape(quote.validUntil) : "缺失数据不会自动补为示例价格。"}</p>`;
    $("#airport-tooltip").hidden = false;
  };
  $$(".map-airport").forEach((node) => {
    node.addEventListener("pointerenter", () =>
      showAirport(node.dataset.airport),
    );
    node.addEventListener("focus", () => showAirport(node.dataset.airport));
    node.addEventListener("click", () => showAirport(node.dataset.airport));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showAirport(node.dataset.airport);
      }
      if (e.key === "Escape") $("#airport-tooltip").hidden = true;
    });
  });
  $("#map-stage").addEventListener(
    "pointerleave",
    () => {
      $("#airport-tooltip").hidden = true;
    },
    { once: true },
  );
  setupMotion(progress, autoplay);
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
function renderAirports() {
  const query = $("#airport-search").value.trim().toLowerCase();
  const filtered = airportData.filter(
    (a) =>
      (region === "all" || a.region === region) &&
      (!query || `${a.code} ${a.name} ${a.city}`.toLowerCase().includes(query)),
  );
  $("#airport-count").textContent = `${filtered.length} 个机场`;
  $("#airport-rows").innerHTML =
    filtered
      .map((a) => {
        const price = priceFor(a.code),
          quote = activeQuote(a.code);
        return `<tr><td><span class="code">${a.code}</span>${a.name}<small> / ${a.city}</small></td><td><span class="price ${Number.isFinite(price) ? "" : "missing"}">${Number.isFinite(price) ? money(price) : "—"}</span></td><td><span class="quote-status ${mode === "demo" ? "demo" : quote ? "supplied" : ""}">${mode === "demo" ? "示例假设" : quote ? "用户报价" : "待报价"}</span></td><td>${mode === "demo" ? '<span class="missing">演示情景 · 非供应商报价</span>' : quote ? escape(quote.supplier) + " / into-plane" : '<span class="missing">需供应商报价</span>'}</td><td>${mode === "demo" ? '<span class="missing">无真实报价有效期</span>' : quote ? `${escape(quote.validFrom)} — ${escape(quote.validUntil)}<br>${quote.sourceUrl ? `<a href="${escape(quote.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>` : escape(quote.source)}` : '<span class="missing">尚未接入</span>'}</td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="5" class="missing">没有匹配的机场。</td></tr>';
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
  renderAirports();
  renderMap();
  calculate();
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
      if (key === "maxUpliftT" && field.value === "") delete leg.maxUpliftT;
      else
        leg[key] =
          field.value === ""
            ? NaN
            : Number(field.value) / (key === "carryBurnRate" ? 100 : 1);
      if (key === "priceUsdPerT" && mode === "demo") {
        illustrativePrices[leg.from] = leg[key];
        input.legs.forEach((other, index) => {
          if (other.from === leg.from) {
            other.priceUsdPerT = leg[key];
            if (index !== Number(field.dataset.leg))
              $(`[data-leg="${index}"][data-key="priceUsdPerT"]`).value =
                field.value;
          }
        });
      }
    }
  }
  collectInputs();
  setDirty();
});
$("#rotation-form").addEventListener("change", (e) => {
  const field = e.target;
  if (field.dataset.key === "from" || field.dataset.key === "to") {
    const index = Number(field.dataset.leg),
      leg = input.legs[index];
    leg[field.dataset.key] = field.value;
    if (field.dataset.key === "from") {
      if (index > 0) input.legs[index - 1].to = field.value;
      leg.priceUsdPerT = priceFor(field.value);
    }
    if (field.dataset.key === "to" && index < input.legs.length - 1) {
      input.legs[index + 1].from = field.value;
      input.legs[index + 1].priceUsdPerT = priceFor(field.value);
    }
    renderForm();
    renderMap();
    setDirty("航线已修改；请同步核对耗油参数后重新计算");
  }
  if (field.id === "flight-date") {
    for (const leg of input.legs) leg.priceUsdPerT = priceFor(leg.from);
    renderForm();
    renderMap();
    renderAirports();
  }
  if (field.dataset.key === "priceUsdPerT") {
    renderMap();
    renderAirports();
  }
});
$("#aircraft").addEventListener("change", () => {
  const preset = $("#aircraft").value === "a330";
  input.aircraft = {
    name: preset ? "Airbus A330-300 · 示例" : "Boeing 787-9 · 示例",
    tankCapacityT: preset ? 97 : 110,
    maxTakeoffWeightT: preset ? 235 : 240,
    maxLandingWeightT: preset ? 187 : 190,
  };
  syncAircraftInputs();
  setDirty("机型示例已切换，请核对性能参数后重新计算");
});
$("#rotation-form").addEventListener("click", (e) => {
  const button = e.target.closest("[data-remove]");
  if (!button) return;
  const index = Number(button.dataset.remove);
  if (input.legs.length <= 2) return;
  input.legs.splice(index, 1);
  for (let i = 1; i < input.legs.length; i++)
    input.legs[i].from = input.legs[i - 1].to;
  for (const l of input.legs) l.priceUsdPerT = priceFor(l.from);
  renderForm();
  renderMap();
  setDirty("航段已删除，请核对耗油参数后重新计算");
});
$("#add-leg").addEventListener("click", () => {
  if (input.legs.length >= 5) return;
  const from = input.legs.at(-1).to,
    to = from === "PVG" ? "ICN" : "PVG";
  input.legs.push({
    ...defaultRotation().legs[0],
    from,
    to,
    priceUsdPerT: priceFor(from),
  });
  renderForm();
  renderMap();
  setDirty("已添加示例航段，请设定本段耗油与约束");
});
$("#reset-plan").addEventListener("click", () => {
  userPausedMotion = false;
  input = defaultRotation();
  $("#aircraft").value = "b787";
  Object.assign(illustrativePrices, { PVG: 860, ICN: 980, HND: 1120 });
  syncAircraftInputs();
  changeMode("demo");
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
$("#airport-search").addEventListener("input", renderAirports);
$$("[data-region]").forEach((button) =>
  button.addEventListener("click", () => {
    region = button.dataset.region;
    $$("[data-region]").forEach((b) =>
      b.classList.toggle("selected", b === button),
    );
    renderAirports();
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
  quotes = [];
  $("#quote-count").textContent = "0";
  $("#quote-file").value = "";
  $("#import-feedback").textContent = "已清除本次页面中的报价。";
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
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 256 * 1024) {
    $("#import-feedback").textContent = "文件超过256 KiB，请缩小后重试。";
    return;
  }
  try {
    const parsed = parseQuoteCsv(await file.text(), {
      today: $("#flight-date").value,
    });
    quotes = parsed.quotes;
    $("#quote-count").textContent = String(quotes.length);
    $("#import-feedback").textContent =
      `已接受 ${quotes.length} 条用户报价。${parsed.errors.length ? "以下记录未导入：" + parsed.errors.join(" ") : "可切换「我的报价」计算。"}`;
    if (mode === "quotes") changeMode("quotes");
  } catch {
    $("#import-feedback").textContent = "无法读取此文件，请使用UTF-8 CSV重试。";
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
        schemaVersion: 1,
        date: $("#flight-date").value,
        priceMode: mode,
        performanceStatus: "illustrative-user-editable",
        priceStatus: mode === "demo" ? "illustrative" : "user-supplied",
        input,
        quotes: provenance,
        result,
        limitations: "固定航线轮转；示例性能需由航司认可数据替换；不执行订单。",
      },
      null,
      2,
    ),
    "application/json",
  );
});
const kindLabels = {
  "public-posting": "公开挂牌 / REFERENCE",
  "customer-quote": "客户报价 / CONTRACT",
  "licensed-api": "商业接口 / API",
  "supplier-directory": "供应商寻源 / DIRECTORY",
  "supplier-rfq": "定向询价 / RFQ",
  "market-benchmark": "市场基准 / CONTEXT",
};
async function renderSources() {
  try {
    const response = await fetch("./data/fuel-sources.json");
    if (!response.ok) throw new Error("source");
    const all = await response.json();
    const preferred = [
      "cpc-posting",
      "world-fuel",
      "airportdata",
      "iata-directory",
      "opis",
      "sk-incheon",
    ];
    const selected = preferred
      .map((id) => all.find((s) => s.id === id))
      .filter(Boolean);
    // Keep diverse primary-source channels if a catalog uses a different id.
    for (const item of all)
      if (selected.length < 6 && !selected.includes(item)) selected.push(item);
    $("#source-cards").innerHTML = selected
      .map(
        (s) =>
          `<a class="source-card" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer"><span class="source-kind">${escape(kindLabels[s.type] ?? s.type)}</span><h3>${escape(s.name)}</h3><p>${escape(s.coverage)}<br>${escape(s.limitation)}</p><div class="source-access"><span>${escape(s.access)}</span><span>↗</span></div></a>`,
      )
      .join("");
  } catch {
    $("#source-cards").innerHTML =
      '<p class="micro">来源目录暂时无法加载。可先查看台湾中油官方价格表和项目研究文档。</p>';
  }
}
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
window.addEventListener("pagehide", () => stopPlayback());
syncAircraftInputs();
renderForm();
renderAirports();
renderMap();
calculate();
renderSources();
