"""Build offline global land and airport assets from pinned public-data snapshots.

Run without arguments for a deterministic, network-free rebuild.
Use --refresh to fetch both upstream sources and replace their dated snapshots.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOTS = ROOT / "src/geography"
WIDTH, HEIGHT = 1440, 720
BOUNDS = {"west": -180, "east": 180, "south": -90, "north": 90}
LAND_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson"
AIRPORT_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"
LAND_FILE = "ne_110m_land.geojson.gz"
AIRPORT_FILE = "ourairports-selected.csv.gz"

# This is an editorial navigation sample, not a traffic or fuel-market ranking.
# The first 17 codes and Chinese labels preserve the existing route workspace.
EXISTING = {
    "PEK": ("北京首都", "北京"), "PKX": ("北京大兴", "北京"),
    "PVG": ("上海浦东", "上海"), "SHA": ("上海虹桥", "上海"),
    "CAN": ("广州白云", "广州"), "SZX": ("深圳宝安", "深圳"),
    "HKG": ("香港国际", "香港"), "TPE": ("台北桃园", "台北"),
    "ICN": ("首尔仁川", "首尔"), "GMP": ("首尔金浦", "首尔"),
    "PUS": ("釜山金海", "釜山"), "HND": ("东京羽田", "东京"),
    "NRT": ("东京成田", "东京"), "KIX": ("大阪关西", "大阪"),
    "NGO": ("名古屋中部", "名古屋"), "FUK": ("福冈", "福冈"),
    "CTS": ("札幌新千岁", "札幌"),
}
MORE_CITIES = {
    "SIN": "新加坡", "BKK": "曼谷", "KUL": "吉隆坡", "CGK": "雅加达",
    "DEL": "新德里", "BOM": "孟买", "DXB": "迪拜", "DOH": "多哈",
    "AUH": "阿布扎比", "IST": "伊斯坦布尔", "LHR": "伦敦", "CDG": "巴黎",
    "FRA": "法兰克福", "AMS": "阿姆斯特丹", "MAD": "马德里",
    "JFK": "纽约", "EWR": "纽瓦克", "ATL": "亚特兰大", "ORD": "芝加哥",
    "DFW": "达拉斯", "LAX": "洛杉矶", "SFO": "旧金山", "SEA": "西雅图",
    "YYZ": "多伦多", "YVR": "温哥华", "MEX": "墨西哥城", "GRU": "圣保罗",
    "SCL": "圣地亚哥", "JNB": "约翰内斯堡", "CPT": "开普敦",
    "ADD": "亚的斯亚贝巴", "NBO": "内罗毕", "CAI": "开罗",
    "SYD": "悉尼", "MEL": "墨尔本", "AKL": "奥克兰", "HNL": "檀香山",
    "MNL": "马尼拉", "HAN": "河内", "SGN": "胡志明市", "CMB": "科伦坡",
    "DAC": "达卡", "RUH": "利雅得", "DME": "莫斯科", "WAW": "华沙",
    "FCO": "罗马", "ZRH": "苏黎世", "EZE": "布宜诺斯艾利斯",
    "BOG": "波哥大", "LIM": "利马",
}
CODES = tuple(EXISTING) + tuple(MORE_CITIES)
CONTINENTS = {"AS", "EU", "AF", "NA", "SA", "OC"}


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def json_text(value, *, compact=False):
    return json.dumps(value, ensure_ascii=False, allow_nan=False,
                      **({"separators": (",", ":")} if compact else {"indent": 2}))


def select_rows(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    selected = {}
    for row in reader:
        code = row.get("iata_code")
        if code not in CODES or row.get("type") in {"closed", "heliport", "seaplane_base"}:
            continue
        if row.get("scheduled_service") != "yes":
            continue
        if code in selected:
            raise ValueError(f"Ambiguous scheduled-service IATA code: {code}")
        lon, lat = float(row["longitude_deg"]), float(row["latitude_deg"])
        if not math.isfinite(lon) or not math.isfinite(lat) or not -180 <= lon <= 180 or not -90 <= lat <= 90:
            raise ValueError(f"Invalid coordinates: {code}")
        if row["continent"] not in CONTINENTS:
            raise ValueError(f"Unsupported continent: {code}")
        selected[code] = row
    missing = set(CODES) - set(selected)
    if missing:
        raise ValueError(f"Source is missing selected airports: {sorted(missing)}")
    return reader.fieldnames, [selected[code] for code in CODES]


def compress(raw):
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as stream:
        stream.write(raw)
    return output.getvalue()


def fetch(url):
    request = Request(url, headers={"User-Agent": "FuelAtlas-reproducible-geography/1.0"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def refresh():
    land_raw, airport_raw = fetch(LAND_URL), fetch(AIRPORT_URL)
    land = json.loads(land_raw)
    if land.get("type") != "FeatureCollection" or not land.get("features"):
        raise ValueError("Expected nonempty Natural Earth FeatureCollection")
    columns, rows = select_rows(airport_raw)
    selected_csv = io.StringIO(newline="")
    writer = csv.DictWriter(selected_csv, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    selected_raw = selected_csv.getvalue().encode("utf-8")
    metadata = {
        "schemaVersion": 1,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "land": {"sourceUrl": LAND_URL, "snapshot": LAND_FILE, "sha256": sha256(land_raw),
                 "referenceUrl": "https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/",
                 "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/", "license": "Public Domain"},
        "airports": {"sourceUrl": AIRPORT_URL, "snapshot": AIRPORT_FILE,
                     "upstreamSha256": sha256(airport_raw), "snapshotSha256": sha256(selected_raw),
                     "referenceUrl": "https://ourairports.com/data/", "license": "Public Domain",
                     "snapshotMethod": "Unmodified CSV fields for the selected scheduled-service IATA records, in declared display order."},
    }
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    (SNAPSHOTS / LAND_FILE).write_bytes(compress(land_raw))
    (SNAPSHOTS / AIRPORT_FILE).write_bytes(compress(selected_raw))
    (SNAPSHOTS / "sources.json").write_text(json_text(metadata) + "\n")


def project(lon, lat):
    return (lon + 180) * WIDTH / 360, (90 - lat) * HEIGHT / 180


def number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def land_markup(land):
    paths, vertices = [], 0
    for lon in range(-150, 180, 30):
        x, _ = project(lon, 0)
        paths.append(f'<path class="graticule" d="M{number(x)},0V{HEIGHT}"/>')
    for lat in range(-60, 90, 30):
        _, y = project(0, lat)
        paths.append(f'<path class="graticule" d="M0,{number(y)}H{WIDTH}"/>')
    polygon_count = 0
    for feature in land["features"]:
        geometry = feature["geometry"]
        if geometry["type"] not in {"Polygon", "MultiPolygon"}:
            raise ValueError("Expected Natural Earth polygon geometry")
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        for polygon in polygons:
            rings = []
            for ring in polygon:
                points = []
                for lon, lat, *_ in ring:
                    if not math.isfinite(lon) or not math.isfinite(lat) or not -180.000001 <= lon <= 180.000001 or not -90.000001 <= lat <= 90.000001:
                        raise ValueError("Natural Earth coordinate outside geographic bounds")
                    # Limit only sub-microdegree source rounding beyond world bounds.
                    x, y = project(min(180, max(-180, lon)), min(90, max(-90, lat)))
                    points.append(f"{number(x)},{number(y)}")
                if points[0] == points[-1]:
                    points.pop()
                if len(points) < 3:
                    raise ValueError("Degenerate polygon ring")
                vertices += len(points)
                rings.append("M" + "L".join(points) + "Z")
            paths.append('<path class="land" fill-rule="evenodd" d="' + "".join(rings) + '"/>')
            polygon_count += 1
    return "\n".join(paths), polygon_count, vertices


def build():
    metadata = json.loads((SNAPSHOTS / "sources.json").read_text())
    land_raw = gzip.decompress((SNAPSHOTS / LAND_FILE).read_bytes())
    airport_raw = gzip.decompress((SNAPSHOTS / AIRPORT_FILE).read_bytes())
    if sha256(land_raw) != metadata["land"]["sha256"] or sha256(airport_raw) != metadata["airports"]["snapshotSha256"]:
        raise ValueError("Source snapshot digest mismatch")
    _, source_rows = select_rows(airport_raw)
    records = []
    for row in source_rows:
        code = row["iata_code"]
        name, city = EXISTING.get(code, (row["name"], MORE_CITIES.get(code) or row["municipality"]))
        records.append({"code": code, "name": name, "city": city, "region": row["iso_country"],
                        "continent": row["continent"], "lon": float(row["longitude_deg"]), "lat": float(row["latitude_deg"])})
    if not 50 <= len(records) <= 70 or set(row["continent"] for row in records) != CONTINENTS:
        raise ValueError("Expected 50–70 airports covering all six inhabited continents")
    markup, polygon_count, vertices = land_markup(json.loads(land_raw))
    world_js = f'''/** Generated by scripts/build_global_geography.py; Natural Earth public domain. */
export const WIDTH = {WIDTH};
export const HEIGHT = {HEIGHT};
export const BOUNDS = Object.freeze({json_text(BOUNDS, compact=True)});
export function project(lon, lat) {{
  return [(lon + 180) * WIDTH / 360, (90 - lat) * HEIGHT / 180];
}}
const LAND_AND_GRATICULE = {json_text(markup)};
export function mapMarkup() {{ return LAND_AND_GRATICULE; }}
'''
    (ROOT / "dist/world-map.js").write_text(world_js)
    (ROOT / "dist/global-airports.js").write_text(
        "/** Generated from OurAirports public-domain coordinates; see data/global-airports.json. */\n"
        + "export const airportData = " + json_text(records) + ";\n")
    directory = {
        "schemaVersion": 1, "fetchedAt": metadata["fetchedAt"], "observedAt": None,
        "coordinateReferenceSystem": "WGS84 longitude/latitude, decimal degrees",
        "source": metadata["airports"], "mapSource": metadata["land"],
        "selection": {"count": len(records), "rule": "Curated major-airport navigation sample across six inhabited continents, retaining the original 17 East Asian workspace airports.",
                      "trafficRanking": False, "originalCodes": list(EXISTING)},
        "labels": "Original 17 airport names retained in Chinese; additional airport names and country/continent codes from OurAirports; Chinese city display labels are editorial translations.",
        "map": {"width": WIDTH, "height": HEIGHT, "bounds": BOUNDS, "projection": "Equirectangular", "landPolygons": polygon_count, "vertices": vertices},
        "limitations": ["Community-maintained geography; no per-record observation timestamp is supplied.",
                        "No fuel prices, fuel availability, inventory, airport throughput or operational route certification are implied.",
                        "Natural Earth 1:110m coastlines are generalized; small islands may be omitted, and markers can appear offshore at this scale.",
                        "No political boundaries are drawn. The map projection is not suitable for distance or area measurement."],
        "records": records,
    }
    (ROOT / "dist/data/global-airports.json").write_text(json_text(directory) + "\n")
    print(f"Built {len(records)} sourced airports; {polygon_count} land polygons; {vertices} vertices. Snapshot {metadata['fetchedAt']}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Fetch upstream sources before rebuilding; changes the dated snapshot.")
    args = parser.parse_args()
    if args.refresh:
        refresh()
    build()
