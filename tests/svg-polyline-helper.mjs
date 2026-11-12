// Linkedom has no native SVG geometry. This test adapter measures the emitted
// M/L polylines and excludes discontinuous move commands from traveled length.
export function polyline(path) {
  const pieces = [];
  let previous = null;
  const source = path.getAttribute("d") || "";
  for (const match of source.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
    const point = { x: Number(match[2]), y: Number(match[3]) };
    if (match[1] === "L" && previous) {
      pieces.push({ from: previous, to: point, length: Math.hypot(point.x - previous.x, point.y - previous.y) });
    }
    previous = point;
  }
  const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
  return {
    length,
    at(distance) {
      let remaining = Math.max(0, Math.min(length, distance));
      for (const piece of pieces) {
        if (remaining <= piece.length) {
          const t = piece.length ? remaining / piece.length : 0;
          return { x: piece.from.x + (piece.to.x - piece.from.x) * t,
            y: piece.from.y + (piece.to.y - piece.from.y) * t };
        }
        remaining -= piece.length;
      }
      return previous || { x: 0, y: 0 };
    },
  };
}
