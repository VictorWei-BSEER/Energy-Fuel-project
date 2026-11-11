/**
 * Deterministic presentation clock for a solved aircraft rotation.
 * This is a playback of model results, not live flight tracking. Fuel is in
 * tonnes and procurement cost is USD; geometry comes from the rendered SVG.
 * Inject the clock and animation-frame functions to test without a browser.
 */
const REFUEL_END = 0.18;
const FLIGHT_END = 0.9;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from, to, progress) => from + (to - from) * progress;
const noop = () => {};

function geometry(path) {
  let length = 0;
  try {
    const measured = path.getTotalLength();
    if (Number.isFinite(measured) && measured > 0) length = measured;
  } catch {
    // Detached or zero-length SVGs can fail measurement during layout changes.
  }
  const sample = (distance, fallback = { x: 0, y: 0 }) => {
    try {
      const point = path.getPointAtLength(distance);
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
        return { x: point.x, y: point.y };
      }
    } catch {
      // A stationary safe point is preferable to a NaN SVG transform.
    }
    return fallback;
  };
  const start = sample(0);
  const end = sample(length, start);
  return (progress) => {
    const distance = length * clamp(progress);
    const fallback = {
      x: lerp(start.x, end.x, progress),
      y: lerp(start.y, end.y, progress),
    };
    const point = sample(distance, fallback);
    const delta = Math.min(1, length / 100);
    const before = sample(Math.max(0, distance - delta), point);
    const after = sample(Math.min(length, distance + delta), point);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    return {
      ...point,
      angle: dx || dy ? (Math.atan2(dy, dx) * 180) / Math.PI : 0,
    };
  };
}

/**
 * Returns play(), pause(), restart(), seek(0..1), destroy(), and getState().
 * Creation emits one static frame. restart() resets and plays; seek(1) stays
 * at the final landing until play() is called again. Reduced-motion playback
 * remains static and never schedules animation frames.
 */
export function createRotationMotion(options = {}) {
  const {
    paths,
    legs,
    onFrame = noop,
    onLegChange = noop,
    onStateChange = noop,
    requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    reducedMotion = false,
    legDurationMs = 5500,
    loop = true,
  } = options;

  if (
    !Array.isArray(legs) ||
    !legs.length ||
    !Array.isArray(paths) ||
    paths.length !== legs.length
  ) {
    throw new TypeError("Motion requires matching nonempty paths and legs.");
  }
  if (!Number.isFinite(legDurationMs) || legDurationMs <= 0) {
    throw new TypeError(
      "Motion leg duration must be a positive finite number.",
    );
  }
  for (const fn of [
    onFrame,
    onLegChange,
    onStateChange,
    requestFrame,
    cancelFrame,
    now,
  ]) {
    if (typeof fn !== "function") {
      throw new TypeError(
        "Motion callbacks and clock functions must be callable.",
      );
    }
  }
  const fields = [
    "arrivalFuelT",
    "upliftT",
    "departureFuelT",
    "takeoffFuelT",
    "airborneBurnT",
    "landingFuelT",
    "costUsd",
  ];
  const snapshots = legs.map((leg, index) => {
    if (
      !leg ||
      fields.some((field) => !Number.isFinite(leg[field]) || leg[field] < 0)
    ) {
      throw new TypeError(
        `Motion leg ${index + 1} has invalid solved quantities.`,
      );
    }
    const path = paths[index];
    if (
      !path ||
      typeof path.getTotalLength !== "function" ||
      typeof path.getPointAtLength !== "function"
    ) {
      throw new TypeError(
        `Motion path ${index + 1} must support SVG sampling.`,
      );
    }
    return Object.fromEntries(fields.map((field) => [field, leg[field]]));
  });
  const routes = paths.map(geometry);
  const previousCosts = [];
  let totalCost = 0;
  for (const leg of snapshots) {
    previousCosts.push(totalCost);
    totalCost += leg.costUsd;
  }
  const durationMs = legDurationMs * snapshots.length;
  if (!Number.isFinite(durationMs) || !Number.isFinite(totalCost)) {
    throw new TypeError("Motion duration or cost exceeds the supported range.");
  }

  let elapsedMs = 0;
  let anchorElapsedMs = 0;
  let anchorTime = 0;
  let frameId = null;
  let playing = false;
  let destroyed = false;
  let previousLeg = -1;
  let lastFrame = null;
  // Invalid clock samples do not move the playhead or poison future frames.
  let lastTime = 0;
  const clock = () => {
    const value = now();
    if (Number.isFinite(value)) lastTime = value;
    return lastTime;
  };
  const getState = () => ({ ...lastFrame, destroyed, reducedMotion });
  const emitState = (reason) => onStateChange({ ...getState(), reason });
  const cancelPending = () => {
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
  };
  const updateElapsed = () => {
    const advanced = anchorElapsedMs + Math.max(0, clock() - anchorTime);
    elapsedMs = loop ? advanced % durationMs : Math.min(durationMs, advanced);
    return !loop && advanced >= durationMs;
  };

  const emitFrame = () => {
    const totalProgress = clamp(elapsedMs / durationMs);
    const legIndex = Math.min(
      snapshots.length - 1,
      Math.floor(elapsedMs / legDurationMs),
    );
    const progress = clamp(elapsedMs / legDurationMs - legIndex);
    const leg = snapshots[legIndex];
    let phase, phaseProgress, routeProgress, fuelT, purchaseProgress;
    if (progress < REFUEL_END) {
      phase = "refuel";
      phaseProgress = clamp(progress / REFUEL_END);
      routeProgress = 0;
      fuelT = lerp(leg.arrivalFuelT, leg.departureFuelT, phaseProgress);
      purchaseProgress = phaseProgress;
    } else if (progress < FLIGHT_END) {
      phase = "flight";
      phaseProgress = clamp(
        (progress - REFUEL_END) / (FLIGHT_END - REFUEL_END),
      );
      routeProgress = phaseProgress;
      // Endpoints are authoritative solved balances. Interpolating them avoids
      // tiny display discontinuities caused by floating-point burn arithmetic.
      fuelT = lerp(leg.takeoffFuelT, leg.landingFuelT, phaseProgress);
      purchaseProgress = 1;
    } else {
      phase = "arrival";
      phaseProgress = clamp((progress - FLIGHT_END) / (1 - FLIGHT_END));
      routeProgress = 1;
      fuelT = leg.landingFuelT;
      purchaseProgress = 1;
    }
    lastFrame = {
      legIndex,
      phase,
      phaseProgress,
      progress,
      totalProgress,
      ...routes[legIndex](routeProgress),
      fuelT,
      cumulativeCostUsd:
        previousCosts[legIndex] + leg.costUsd * purchaseProgress,
      legCostUsd: leg.costUsd,
      activeUpliftT: leg.upliftT * purchaseProgress,
      playing,
    };
    if (legIndex !== previousLeg) {
      previousLeg = legIndex;
      onLegChange({ ...lastFrame });
    }
    onFrame({ ...lastFrame });
    return getState();
  };

  const schedule = () => {
    if (playing && !destroyed && frameId === null) {
      frameId = requestFrame(tick);
    }
  };
  const tick = () => {
    frameId = null;
    if (!playing || destroyed) return;
    const ended = updateElapsed();
    if (ended) playing = false;
    emitFrame();
    if (ended) emitState("end");
    schedule();
  };

  const play = () => {
    if (destroyed || playing) return getState();
    if (reducedMotion) {
      emitFrame();
      emitState("reduced-motion");
      return getState();
    }
    if (elapsedMs >= durationMs) elapsedMs = 0;
    anchorElapsedMs = elapsedMs;
    anchorTime = clock();
    playing = true;
    emitFrame();
    emitState("play");
    schedule();
    return getState();
  };
  const pause = () => {
    if (destroyed || !playing) return getState();
    const ended = updateElapsed();
    playing = false;
    cancelPending();
    emitFrame();
    emitState(ended ? "end" : "pause");
    return getState();
  };
  const seek = (progress) => {
    if (destroyed) return getState();
    if (!Number.isFinite(progress)) {
      throw new TypeError("Motion seek progress must be finite.");
    }
    elapsedMs = clamp(progress) * durationMs;
    anchorElapsedMs = elapsedMs;
    anchorTime = clock();
    if (elapsedMs >= durationMs) {
      playing = false;
      cancelPending();
    }
    emitFrame();
    emitState("seek");
    return getState();
  };
  const restart = () => {
    if (destroyed) return getState();
    cancelPending();
    playing = false;
    elapsedMs = 0;
    anchorElapsedMs = 0;
    anchorTime = clock();
    emitFrame();
    emitState("restart");
    return reducedMotion ? getState() : play();
  };
  const destroy = () => {
    if (destroyed) return getState();
    playing = false;
    destroyed = true;
    cancelPending();
    // Keep the last visual frame available without drawing into a detached map.
    if (lastFrame) lastFrame = { ...lastFrame, playing: false };
    emitState("destroy");
    return getState();
  };

  emitFrame();
  return { play, pause, restart, seek, destroy, getState };
}
