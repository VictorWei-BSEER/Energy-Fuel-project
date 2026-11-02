"""Build the versioned planning-map directory from reported traffic and OurAirports."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = {'west': 92, 'east': 151, 'south': -6, 'north': 51}
COORDINATE_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv'


def select_airports(traffic, coordinates, limit=50):
    """Traffic determines size; bounds and scheduled service determine eligibility."""
    if limit < 1:
        raise ValueError('Airport limit must be positive')
    indexed = {}
    for row in coordinates:
        code = row.get('iata_code')
        if not code or row.get('type') in {'closed', 'heliport', 'seaplane_base'} or row.get('scheduled_service') != 'yes':
            continue
        if code in indexed:
            raise ValueError(f'Duplicate scheduled airport code: {code}')
        indexed[code] = row
    candidates = []
    seen = set()
    for record in traffic['candidates']:
        code = record['iata']
        count = record['passengers']
        if code in seen or not isinstance(count, int) or count <= 0 or record['source'] not in traffic['sources']:
            raise ValueError(f'Invalid traffic record: {code}')
        seen.add(code)
        row = indexed.get(code)
        if not row:
            continue
        lat, lon = float(row['latitude_deg']), float(row['longitude_deg'])
        if not math.isfinite(lat) or not math.isfinite(lon):
            raise ValueError(f'Invalid coordinates: {code}')
        if not BOUNDS['west'] <= lon <= BOUNDS['east'] or not BOUNDS['south'] <= lat <= BOUNDS['north']:
            continue
        candidates.append({'iata': code, 'icao': row.get('icao_code') or row['ident'],
                           'name': row['name'], 'city': row.get('municipality') or row['name'],
                           'country': row['iso_country'], 'lat': lat, 'lon': lon,
                           'annualPassengers': count, 'trafficYear': traffic['year'], 'trafficSource': record['source']})
    candidates.sort(key=lambda row: (-row['annualPassengers'], row['iata']))
    if len(candidates) < limit:
        raise ValueError('Not enough eligible, sourced airports to satisfy the requested limit')
    for rank, row in enumerate(candidates[:limit], 1):
        row['rank'] = rank
    return candidates[:limit], candidates[limit:]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-csv', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/data/airport-directory.json')
    args = parser.parse_args()
    raw = args.input_csv.read_bytes()
    traffic = json.loads((ROOT / 'src/airport-traffic-2024.json').read_text())
    selected, remaining = select_airports(traffic, list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))))
    directory = {'schemaVersion': 1, 'year': traffic['year'], 'metric': traffic['metric'], 'bounds': BOUNDS,
                 'limit': 50, 'minimumAnnualPassengers': selected[-1]['annualPassengers'],
                 'selectionRule': 'Top 50 scheduled-service airports within the map bounds, sorted by 2024 total passengers; IATA code breaks ties.',
                 'geography': {'sourceUrl': COORDINATE_URL, 'license': 'Public Domain',
                               'fetchedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                               'sha256': hashlib.sha256(raw).hexdigest()},
                 'sources': traffic['sources'], 'airports': selected,
                 'nextExcluded': remaining[:5],
                 'limitations': 'Fixed 2024 traffic baseline; some operator totals are rounded. Selection traffic is not demand, fuel price, capacity or inventory for the planning model.'}
    args.output.write_text(json.dumps(directory, ensure_ascii=False, indent=2) + '\n')
    print(f"Selected {len(selected)} airports; cutoff {selected[-1]['iata']} at {selected[-1]['annualPassengers']:,} passengers in {traffic['year']}.")


if __name__ == '__main__':
    main()
