# Global geography and airport provenance

The global workspace uses **Natural Earth 1:110 million land polygons** and **OurAirports airport coordinates**, both published as public-domain data. These are real geographic datasets. No fuel prices, fuel availability, traffic ranking or airport inventory are inferred from geography.

## Sources and snapshots

- [Natural Earth 1:110m land](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/) — [GeoJSON source](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson), [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/).
- [OurAirports data](https://ourairports.com/data/) — [airport CSV](https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv).
- `src/geography/sources.json` records the exact retrieval timestamp, upstream URLs and SHA-256 digests. The coordinate dataset does not provide an observation timestamp per airport; `observedAt` is therefore null.
- The small compressed `src/geography/ne_110m_land.geojson.gz` retains the complete downloaded low-resolution land file. `src/geography/ourairports-selected.csv.gz` retains unmodified source fields only for the selected airport records. The full upstream CSV digest and the retained subset digest are recorded separately.

The 67-airport directory is an editorial navigation sample covering the six inhabited continents, not a claim to rank the world's largest airports. It retains the original 17 East Asian airport codes and Chinese names; their coordinates now come from the retrieved source. Additional airport names, ISO country codes and continent codes are sourced from OurAirports. Chinese city labels are display translations. OurAirports' continent classification is retained, including when it differs from a purely geographic convention.

## Rebuild

Run from the repository root:

```sh
python3 scripts/build_global_geography.py
```

This default reads only the checked-in snapshots, verifies their digests and regenerates byte-identical JavaScript and JSON assets without network access. To deliberately update both source snapshots and their retrieval timestamp:

```sh
python3 scripts/build_global_geography.py --refresh
```

Refresh validates selected IATA uniqueness, scheduled service, finite bounded coordinates and continent coverage before writing snapshots. The generated output contains no random values or current build timestamp; all metadata dates refer to source retrieval. A change in the selected airport list requires a matching refreshed snapshot.

## Display interface

`dist/world-map.js` exports `WIDTH = 1440`, `HEIGHT = 720`, `BOUNDS = { west: -180, east: 180, south: -90, north: 90 }`, `project(lon, lat)` and the **function** `mapMarkup()`.

`mapMarkup()` returns SVG `<path>` children with only `.land` and `.graticule` classes, no outer SVG, labels, routes or airport dots. Rings retain the source topology and use even-odd filling. Coordinates are projected and rounded to 0.01 display pixels. No political boundaries are drawn. Embed in `viewBox="0 0 1440 720"`; the app owns colors and interactions.

The equirectangular projection maps longitude −180…180 to x=0…1440 and latitude 90…−90 to y=0…720. Longitude and latitude are in degrees. High-latitude shapes are distorted; compute route distances on the sphere, never from display pixels. The antimeridian is the left/right edge, so route overlays must split wrapping paths at that edge. Natural Earth's generalized coastline omits some small islands; an airport dot can appear offshore at this display scale without implying a wrong airport coordinate.

`dist/global-airports.js` exports `airportData`, an ordered array of `{ code, name, city, region, continent, lon, lat }`. `region` is OurAirports' two-letter ISO country/territory field. `continent` uses `AS`, `EU`, `AF`, `NA`, `SA` or `OC`. `dist/data/global-airports.json` supplies the same `records` plus source provenance, bounds and limitations.

The quotation parser derives its supported IATA-code set from this directory. This expands which airport labels it recognizes; it does not verify user-supplied prices or relax quotation-date, delivery-basis, fee, overlap or file-size validation.
