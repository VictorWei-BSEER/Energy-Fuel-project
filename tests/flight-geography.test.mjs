import test from "node:test";
import assert from "node:assert/strict";
import { greatCircleSegments, routePath, fitRouteView, globalRotation } from "../dist/flight-geography.js";
import { airportData } from "../dist/global-airports.js";
import { project } from "../dist/world-map.js";
import { optimizeRotation, defaultRotation } from "../dist/flight-optimizer.js";

const airports = Object.fromEntries(airportData.map(airport => [airport.code, airport]));
const distance = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin((a.lat - b.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((a.lon - b.lon) * r / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};

test("great-circle paths reach source airports and follow the short spherical arc", () => {
  for (const [from, to] of [["SIN", "DXB"], ["LHR", "JFK"], ["NRT", "LAX"], ["SYD", "HNL"], ["LAX", "NRT"]]) {
    const segments = greatCircleSegments(airports[from], airports[to]);
    const first = segments[0][0], last = segments.at(-1).at(-1);
    assert.ok(distance(first, airports[from]) < 1e-10);
    assert.ok(distance(last, airports[to]) < 1e-10);
    const total = segments.reduce((sum, segment) => sum + segment.slice(1).reduce((part, point, i) => part + distance(segment[i], point), 0), 0);
    assert.ok(Math.abs(total - distance(airports[from], airports[to])) < 1e-9, `${from}-${to}: ${total}`);
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        assert.ok(Math.abs(segment[i].lon - segment[i - 1].lon) <= 180, "No world-spanning interior chord");
        assert.ok(distance(segment[i - 1], segment[i]) <= 2.000001 * Math.PI / 180);
      }
    }
  }
});

test("antimeridian crossings use disconnected SVG subpaths with matching seam latitudes", () => {
  for (const [from, to] of [["NRT", "LAX"], ["LAX", "NRT"], ["SYD", "HNL"]]) {
    const segments = greatCircleSegments(airports[from], airports[to]);
    assert.equal(segments.length, 2);
    assert.equal(segments[0].at(-1).lat, segments[1][0].lat);
    assert.equal(Math.abs(segments[0].at(-1).lon), 180);
    assert.equal(segments[0].at(-1).lon, -segments[1][0].lon);
    const path = routePath(airports[from], airports[to], project);
    assert.equal((path.match(/M /g) || []).length, 2);
    assert.doesNotMatch(path, /NaN|Infinity/);
    assert.equal(fitRouteView([{ from, to }], airports, project).width, 1440);
  }
});

test("degenerate, antipodal, and pole-adjacent arcs stay finite; invalid coordinates fail", () => {
  for (const pair of [[{ lon: 0, lat: 0 }, { lon: 0, lat: 0 }], [{ lon: 0, lat: 0 }, { lon: 180, lat: 0 }], [{ lon: 179, lat: 89 }, { lon: -179, lat: 89 }]]) {
    const path = routePath(...pair, project);
    assert.doesNotMatch(path, /NaN|Infinity/);
  }
  assert.throws(() => greatCircleSegments({ lon: NaN, lat: 0 }, airports.SIN), RangeError);
  assert.throws(() => greatCircleSegments({ lon: 181, lat: 0 }, airports.SIN), RangeError);
});

test("global manual scenario is feasible with identical terminal stock; original East Asia preset is unchanged", () => {
  const input = globalRotation(), result = optimizeRotation(input);
  assert.match(input.scenarioLabel, /手动示例.*非实际航班.*非实时机场报价/);
  assert.deepEqual(input.legs.map(leg => leg.from), ["SIN", "DXB", "LHR", "JFK"]);
  assert.equal(result.feasible, true);
  assert.equal(result.baseline.feasible, true);
  assert.equal(result.finalFuelT, result.baseline.finalFuelT);
  assert.ok(result.totalCostUsd < result.baseline.totalCostUsd);
  assert.ok(Math.abs(input.initialFuelT + result.totalUpliftT - result.totalBurnT - result.finalFuelT) < 1e-8);
  input.legs[0].priceUsdPerT = 1;
  assert.equal(globalRotation().legs[0].priceUsdPerT, 950, "Preset does not share mutable scenario state");
  const original = optimizeRotation(defaultRotation());
  assert.equal(original.baseline.totalCostUsd, 31270);
  assert.ok(Math.abs(original.totalCostUsd - 27673.527561547526) < 1e-7);
});
