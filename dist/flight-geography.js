/** Geographic presentation only: coordinates do not supply flight performance. */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const unit = (v) => { const length = Math.hypot(...v); return v.map(x => x / length); };
const vector = ({ lon, lat }) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const position = (v) => ({ lon: Math.atan2(v[1], v[0]) * DEG, lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) * DEG });
const unwrap = (lon, reference) => lon + 360 * Math.round((reference - lon) / 360);

/** Short great-circle arc, split at ±180° so SVG never draws across the world. */
export function greatCircleSegments(from, to, maxStepDegrees = 2) {
  for (const point of [from, to]) {
    if (!point || !Number.isFinite(point.lon) || !Number.isFinite(point.lat) || Math.abs(point.lon) > 180 || Math.abs(point.lat) > 90)
      throw new RangeError("Route coordinates must be finite longitude/latitude degrees.");
  }
  if (!Number.isFinite(maxStepDegrees) || maxStepDegrees <= 0 || maxStepDegrees > 10)
    throw new RangeError("Great-circle sampling step must be in (0, 10] degrees.");
  const a = vector(from), b = vector(to), cosine = clamp(dot(a, b), -1, 1);
  const angle = Math.acos(cosine);
  let tangent = b.map((value, i) => value - cosine * a[i]);
  if (Math.hypot(...tangent) < 1e-10) {
    // Antipodal arcs are not unique. Choose a stable orthogonal great circle.
    const axis = Math.abs(a[2]) < .8 ? [0, 0, 1] : [0, 1, 0];
    tangent = axis.map((value, i) => value - dot(axis, a) * a[i]);
  }
  tangent = unit(tangent);
  const pointAt = (t) => {
    if (t === 0) return { lon: from.lon, lat: from.lat };
    if (t === 1) return { lon: to.lon, lat: to.lat };
    return position(a.map((value, i) => value * Math.cos(angle * t) + tangent[i] * Math.sin(angle * t)));
  };
  const count = Math.max(1, Math.ceil(angle * DEG / maxStepDegrees));
  const segments = [[pointAt(0)]];
  let previous = pointAt(0);
  for (let i = 1; i <= count; i++) {
    const next = pointAt(i / count);
    if (Math.abs(next.lon - previous.lon) > 180) {
      const unwrapped = unwrap(next.lon, previous.lon);
      const edge = unwrapped > previous.lon ? 180 : -180;
      let low = (i - 1) / count, high = i / count;
      for (let iteration = 0; iteration < 45; iteration++) {
        const mid = (low + high) / 2;
        const lon = unwrap(pointAt(mid).lon, previous.lon);
        if ((lon < edge) === (unwrapped > previous.lon)) low = mid;
        else high = mid;
      }
      const latitude = pointAt((low + high) / 2).lat;
      segments.at(-1).push({ lon: edge, lat: latitude });
      segments.push([{ lon: -edge, lat: latitude }]);
    }
    segments.at(-1).push(next);
    previous = next;
  }
  return segments;
}

export function routePath(from, to, project) {
  return greatCircleSegments(from, to).map(segment => segment.map((point, i) => {
    const [x, y] = project(point.lon, point.lat);
    return `${i ? "L" : "M"} ${x.toFixed(4)} ${y.toFixed(4)}`;
  }).join(" ")).join(" ");
}

export const MAP_VIEWS = Object.freeze({
  global: Object.freeze({ x: 0, y: 0, width: 1440, height: 720 }),
  eastasia: Object.freeze({ x: 1080, y: 140, width: 260, height: 260 }),
});

export function fitRouteView(legs, airports, project) {
  const segments = legs.flatMap(leg => greatCircleSegments(airports[leg.from], airports[leg.to]));
  const points = segments.flat().map(point => project(point.lon, point.lat));
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const width = Math.min(1440, Math.max(360, Math.max(...xs) - Math.min(...xs) + 120));
  const height = Math.min(720, Math.max(220, Math.max(...ys) - Math.min(...ys) + 100, width / 2));
  return { x: clamp((Math.min(...xs) + Math.max(...xs) - width) / 2, 0, 1440 - width),
    y: clamp((Math.min(...ys) + Math.max(...ys) - height) / 2, 0, 720 - height), width, height };
}

/** Manual scenario only; neither observed prices nor calibrated aircraft data. */
export function globalRotation() {
  return {
    scenarioLabel: "跨洲手动示例 · 非实际航班 · 非实时机场报价 · 非真实机型性能",
    initialFuelT: 8,
    aircraft: { name: "跨洲宽体机手动示例", tankCapacityT: 110, maxTakeoffWeightT: 240, maxLandingWeightT: 190 },
    legs: [
      { from: "SIN", to: "DXB", priceUsdPerT: 950, baseBurnT: 37, taxiBurnT: .3, reserveT: 8, carryBurnRate: .15, zeroFuelWeightT: 150 },
      { from: "DXB", to: "LHR", priceUsdPerT: 850, baseBurnT: 38, taxiBurnT: .3, reserveT: 8, carryBurnRate: .16, zeroFuelWeightT: 148 },
      { from: "LHR", to: "JFK", priceUsdPerT: 1200, baseBurnT: 40, taxiBurnT: .3, reserveT: 8, carryBurnRate: .17, zeroFuelWeightT: 150 },
      { from: "JFK", to: "LAX", priceUsdPerT: 1050, baseBurnT: 27, taxiBurnT: .3, reserveT: 8, carryBurnRate: .11, zeroFuelWeightT: 149 },
    ],
  };
}
