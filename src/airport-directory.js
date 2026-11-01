import directory from '../dist/data/airport-directory.json' with { type: 'json' };

export const AIRPORT_DIRECTORY = directory;

// Greedy labels prioritize traffic rank and always prioritize the selected airport.
// Every airport retains a visible marker even when there is no clear label position.
export function airportLabelLayout(airports, project, selected = null) {
  const ordered = [...airports].sort((a, b) => (b.iata === selected) - (a.iata === selected) || a.rank - b.rank);
  const boxes = [];
  const points = airports.map(a => project(a.lon, a.lat));
  const labels = new Map();
  for (const airport of ordered) {
    const [x, y] = project(airport.lon, airport.lat);
    for (const [dx, dy] of [[10, -5], [10, 14], [-35, -5], [-35, 14], [-12, -15], [-12, 24]]) {
      const box = { left: x + dx - 2, top: y + dy - 10, right: x + dx + 26, bottom: y + dy + 3 };
      if (box.left < 10 || box.right > 890 || box.top < 25 || box.bottom > 655) continue;
      if (boxes.some(b => box.left < b.right + 4 && box.right > b.left - 4 && box.top < b.bottom + 3 && box.bottom > b.top - 3)) continue;
      if (points.some(([px, py]) => px > box.left - 4 && px < box.right + 4 && py > box.top - 4 && py < box.bottom + 4)) continue;
      boxes.push(box);
      labels.set(airport.iata, { dx, dy, box });
      break;
    }
  }
  return labels;
}
