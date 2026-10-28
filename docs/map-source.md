# Map source and projection

The offline map uses real **Natural Earth 1:50 million land polygons**, a generalized cartographic dataset. It does not use hand-drawn geography or a tile service, and it has no API-key requirement.

- Dataset: [Natural Earth 1:50m physical land](https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/)
- Downloaded GeoJSON: [nvkelso/natural-earth-vector / ne_50m_land.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson)
- Retrieved: 29 October 2026 (UTC+08)
- Original file SHA-256: `e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b`
- License: [Natural Earth public domain terms](https://www.naturalearthdata.com/about/terms-of-use/). Natural Earth data are public domain; attribution is retained for provenance.

## Display contract

`dist/asia-map.js` exports `WIDTH = 900`, `HEIGHT = 680`, `BOUNDS`, `project(lon, lat)`, and `mapMarkup`.

The fixed equirectangular display maps longitude 92–151° E to x=0–900 and latitude 51° N–6° S to y=0–680. Coordinates are in decimal degrees, longitude first. Horizontal and vertical scales are independently fitted to this display; the map is not suitable for distance or area measurement. Route positions must use the exported `project` function. Distances, if needed, should be calculated on spherical coordinates, not SVG pixels.

Land rings were clipped to those geographic bounds with the Sutherland–Hodgman polygon clipping algorithm, projected, and rounded to 0.01 display pixels. Sub-pixel rings below 0.08 square pixels were omitted. The resulting asset contains 288 land paths and 7889 coastline vertices. The source includes generalized coastlines and lake holes; no political boundaries are drawn.

`mapMarkup` contains only SVG `<path>` children with `.land` or `.graticule` classes, and no labels or outer `<svg>`. The app owns color, labeling, airport markers, and route overlays. The graticule is 10 degrees. To embed it, use a parent SVG with `viewBox="0 0 900 680"`.
