import test from "node:test";
import assert from "node:assert/strict";
import { createRotationMotion } from "../dist/rotation-motion.js";

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );

function path(x1, y1, x2, y2) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return {
    getTotalLength: () => length,
    getPointAtLength: (distance) => {
      const progress = length ? Math.max(0, Math.min(1, distance / length)) : 0;
      return { x: x1 + (x2 - x1) * progress, y: y1 + (y2 - y1) * progress };
    },
  };
}

function legs() {
  return [
    {
      from: "PVG",
      to: "ICN",
      arrivalFuelT: 5,
      upliftT: 10,
      departureFuelT: 15,
      takeoffFuelT: 14,
      airborneBurnT: 8,
      landingFuelT: 6,
      costUsd: 9000,
    },
    {
      from: "ICN",
      to: "HND",
      arrivalFuelT: 6,
      upliftT: 7,
      departureFuelT: 13,
      takeoffFuelT: 12,
      airborneBurnT: 7,
      landingFuelT: 5,
      costUsd: 7700,
    },
  ];
}

function harness(options = {}) {
  let clock = 0;
  let nextId = 1;
  const pending = new Map();
  const frames = [],
    changes = [],
    states = [],
    cancelled = [];
  const controller = createRotationMotion({
    paths: [path(0, 0, 100, 0), path(100, 0, 100, 100)],
    legs: legs(),
    legDurationMs: 1000,
    loop: false,
    now: () => clock,
    requestFrame(callback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
      pending.delete(id);
    },
    onFrame: (frame) => frames.push({ ...frame }),
    onLegChange: (change) => changes.push(change),
    onStateChange: (state) => states.push({ ...state }),
    ...options,
  });
  return {
    controller,
    frames,
    changes,
    states,
    cancelled,
    pending,
    clock(value) {
      clock = value;
    },
    advance(value) {
      clock = value;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(value));
    },
  };
}

test("motion begins with an immediate, paused initial frame and one leg announcement", () => {
  const h = harness();
  assert.equal(h.frames.length, 1);
  assert.equal(h.changes.length, 1);
  assert.equal(h.pending.size, 0);
  const state = h.controller.getState();
  assert.equal(state.legIndex, 0);
  assert.equal(state.phase, "refuel");
  assert.equal(state.playing, false);
  near(state.totalProgress, 0);
  near(state.fuelT, 5);
  near(state.cumulativeCostUsd, 0);
  near(state.x, 0);
  near(state.y, 0);
});

test("fuel and paid cost rise during refuelling, then fuel burns along the exact SVG path", () => {
  const h = harness();
  h.controller.seek(0.045); // half of first leg's 18% refuelling phase
  let state = h.controller.getState();
  assert.equal(state.phase, "refuel");
  near(state.phaseProgress, 0.5);
  near(state.progress, 0.09);
  near(state.fuelT, 10);
  near(state.activeUpliftT, 5);
  near(state.cumulativeCostUsd, 4500);
  near(state.x, 0);

  h.controller.seek(0.27); // halfway through first airborne phase
  state = h.controller.getState();
  assert.equal(state.phase, "flight");
  near(state.phaseProgress, 0.5);
  near(state.fuelT, 10);
  near(state.cumulativeCostUsd, 9000);
  near(state.x, 50);
  near(state.y, 0);
  near(state.angle, 0);

  h.controller.seek(0.475);
  state = h.controller.getState();
  assert.equal(state.phase, "arrival");
  near(state.fuelT, 6);
  near(state.x, 100);
  near(state.cumulativeCostUsd, 9000);
});

test("next-leg purchases include earlier paid cost, and seeking the endpoint preserves exact landing fuel", () => {
  const h = harness();
  h.controller.seek(0.545);
  let state = h.controller.getState();
  assert.equal(state.legIndex, 1);
  assert.equal(state.phase, "refuel");
  near(state.fuelT, 9.5);
  near(state.cumulativeCostUsd, 12850);
  near(state.x, 100);
  near(state.y, 0);

  h.controller.seek(0.77);
  state = h.controller.getState();
  assert.equal(state.phase, "flight");
  near(state.fuelT, 8.5);
  near(state.cumulativeCostUsd, 16700);
  near(state.x, 100);
  near(state.y, 50);
  near(state.angle, 90);

  h.controller.seek(1);
  state = h.controller.getState();
  assert.equal(state.legIndex, 1);
  assert.equal(state.phase, "arrival");
  assert.equal(state.playing, false);
  near(state.totalProgress, 1);
  near(state.progress, 1);
  near(state.phaseProgress, 1);
  near(state.fuelT, 5);
  near(state.cumulativeCostUsd, 16700);
  near(state.x, 100);
  near(state.y, 100);
});

test("pause cancels the only queued frame and resume continues from the paused clock position", () => {
  const h = harness();
  h.controller.play();
  h.controller.play();
  assert.equal(h.pending.size, 1);
  h.advance(200);
  h.clock(250);
  h.controller.pause();
  near(h.controller.getState().totalProgress, 0.125);
  assert.equal(h.pending.size, 0);
  assert.equal(h.controller.getState().playing, false);
  const paused = h.controller.getState();
  h.advance(1000);
  near(h.controller.getState().totalProgress, paused.totalProgress);
  h.controller.play();
  h.advance(1250);
  near(h.controller.getState().totalProgress, 0.25);
  assert.equal(h.pending.size, 1);
  h.controller.destroy();
});

test("seeking during playback resets its time anchor and endpoint seeking stops pending work", () => {
  const h = harness({ loop: true });
  h.controller.play();
  h.advance(200);
  h.controller.seek(0.75);
  assert.equal(h.pending.size, 1);
  h.advance(300);
  near(h.controller.getState().totalProgress, 0.8);
  h.controller.seek(1);
  assert.equal(h.pending.size, 0);
  assert.equal(h.controller.getState().playing, false);
  near(h.controller.getState().fuelT, 5);
  h.controller.play();
  near(h.controller.getState().totalProgress, 0);
  assert.equal(h.pending.size, 1);
  h.controller.destroy();
});

test("nonlooping playback settles at the final landing, while a looping clock wraps without timers", () => {
  const once = harness();
  once.controller.play();
  once.advance(2200);
  assert.equal(once.pending.size, 0);
  assert.equal(once.controller.getState().playing, false);
  near(once.controller.getState().totalProgress, 1);
  near(once.controller.getState().fuelT, 5);
  assert.equal(once.states.at(-1).reason, "end");

  const loop = harness({ loop: true });
  loop.controller.play();
  loop.advance(2250);
  near(loop.controller.getState().totalProgress, 0.125);
  assert.equal(loop.controller.getState().playing, true);
  assert.equal(loop.pending.size, 1);
  loop.controller.restart();
  near(loop.controller.getState().totalProgress, 0);
  assert.equal(loop.pending.size, 1);
  loop.controller.destroy();
});

test("leg announcements occur only on a changed leg and reduced motion never schedules animation", () => {
  const h = harness({ reducedMotion: true });
  h.controller.play();
  assert.equal(h.controller.getState().playing, false);
  assert.equal(h.pending.size, 0);
  h.controller.seek(0.1);
  h.controller.seek(0.2);
  assert.equal(h.changes.length, 1);
  h.controller.seek(0.6);
  h.controller.seek(0.7);
  assert.equal(h.changes.length, 2);
  h.controller.seek(0.2);
  assert.equal(h.changes.length, 3);
  h.controller.restart();
  near(h.controller.getState().totalProgress, 0);
  assert.equal(h.controller.getState().playing, false);
  assert.equal(h.pending.size, 0);
  assert.equal(h.controller.getState().reducedMotion, true);
});

test("destroyed controllers ignore stale RAF callbacks and all later actions", () => {
  const h = harness();
  h.controller.play();
  const stale = [...h.pending.values()][0];
  h.controller.destroy();
  const frameCount = h.frames.length;
  const stateCount = h.states.length;
  assert.equal(h.pending.size, 0);
  stale(1000);
  h.controller.play();
  h.controller.pause();
  h.controller.restart();
  h.controller.seek(0.75);
  assert.equal(h.frames.length, frameCount);
  assert.equal(h.states.length, stateCount);
  assert.equal(h.controller.getState().destroyed, true);
  assert.equal(h.controller.getState().playing, false);
});

test("degenerate or failed SVG geometry is stationary and never leaks NaN into the frame", () => {
  const broken = {
    getTotalLength() {
      throw new Error("detached SVG");
    },
    getPointAtLength() {
      return { x: NaN, y: Infinity };
    },
  };
  const h = harness({ paths: [path(12, 18, 12, 18), broken] });
  h.controller.seek(0.27);
  near(h.controller.getState().x, 12);
  near(h.controller.getState().y, 18);
  h.controller.seek(0.77);
  for (const key of [
    "x",
    "y",
    "angle",
    "fuelT",
    "cumulativeCostUsd",
    "totalProgress",
  ]) {
    assert.equal(Number.isFinite(h.controller.getState()[key]), true, key);
  }
});

test("invalid rotation options and nonfinite seeks fail clearly instead of producing animation frames", () => {
  assert.throws(() => harness({ legs: [] }), TypeError);
  assert.throws(() => harness({ paths: [path(0, 0, 1, 1)] }), TypeError);
  assert.throws(() => harness({ legDurationMs: 0 }), TypeError);
  assert.throws(() => harness({ legDurationMs: NaN }), TypeError);
  const invalid = legs();
  invalid[0].departureFuelT = NaN;
  assert.throws(() => harness({ legs: invalid }), TypeError);
  const h = harness();
  assert.throws(() => h.controller.seek(NaN), TypeError);
  h.controller.seek(-10);
  near(h.controller.getState().totalProgress, 0);
  h.controller.seek(10);
  near(h.controller.getState().totalProgress, 1);
});
