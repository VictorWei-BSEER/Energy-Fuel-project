#!/usr/bin/env python3
"""Collect the public EIA daily US Gulf Coast jet-fuel benchmark, without a key.

Only source observations are stored. This is not an Asian or airport quote.
On HTTP, parsing, validation, or stale-regression failures the previous output
is preserved. The density conversion is a disclosed model assumption.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.request import Request, urlopen

SOURCE_URL = "https://www.eia.gov/dnav/pet/hist/eer_epjk_pf4_rgc_dpgD.htm"
SOURCE_TITLE = "U.S. Gulf Coast Kerosene-Type Jet Fuel Spot Price FOB"
DENSITY_KG_PER_LITRE = 0.8
LITRES_PER_US_GALLON = 3.785411784
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
MONTHS = {name: i for i, name in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1)}
WEEK_PATTERN = re.compile(r"^(\d{4})\s+([A-Za-z]{3})\s*-\s*(\d{1,2})\s+to\s+([A-Za-z]{3})\s*-\s*(\d{1,2})$")
MISSING = {"", "-", "--", "NA", "N/A", "W"}


class DataError(ValueError):
    """The source cannot be interpreted without inventing or dropping data."""


class TableParser(HTMLParser):
    """Read physical HTML cells without collapsing blank weekday columns."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.row_stack = []
        self.cell_stack = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self.row_stack.append([])
        elif tag in {"td", "th"} and self.row_stack:
            self.cell_stack.append((self.row_stack[-1], []))
        elif tag == "br" and self.cell_stack:
            self.cell_stack[-1][1].append(" ")

    def handle_data(self, data):
        self.text.append(data)
        if self.cell_stack:
            self.cell_stack[-1][1].append(data)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"td", "th"} and self.cell_stack:
            row, chunks = self.cell_stack.pop()
            row.append(" ".join("".join(chunks).split()))
        elif tag == "tr" and self.row_stack:
            self.rows.append(self.row_stack.pop())


def parse_eia_html(html: str, *, as_of: date | None = None,
                   expected_title: str = SOURCE_TITLE,
                   expected_units: str = "Dollars per Gallon") -> list[dict]:
    """Parse Monday–Friday EIA historical rows, retaining actual observations.

    EIA labels each row with the Monday year; December/January rollover is
    derived from that start date. Blank/withheld cells are skipped in place.
    Malformed weekly rows and unknown nonnumeric values fail the entire run.
    """
    as_of = as_of or datetime.now(timezone.utc).date()
    parser = TableParser()
    parser.feed(html)
    parser.close()
    if parser.row_stack or parser.cell_stack:
        raise DataError("Unclosed table rows or cells; response may be truncated")
    text = " ".join(parser.text)
    if expected_title.casefold() not in text.casefold() or expected_units.casefold() not in text.casefold():
        raise DataError("Response does not identify the expected EIA series and units")
    observations = {}
    weekly_rows = 0
    for row in parser.rows:
        if not row:
            continue
        match = WEEK_PATTERN.fullmatch(row[0])
        if not match:
            if re.match(r"^\d{4}\s+[A-Za-z]{3}\s*-", row[0]):
                raise DataError(f"Malformed EIA week label: {row[0]!r}")
            continue
        weekly_rows += 1
        if len(row) != 6:
            raise DataError(f"Expected five weekday cells for {row[0]!r}, received {len(row) - 1}")
        year, start_month, start_day, end_month, end_day = match.groups()
        try:
            start = date(int(year), MONTHS[start_month.title()], int(start_day))
            end_year = int(year) + (MONTHS[end_month.title()] < start.month)
            end = date(end_year, MONTHS[end_month.title()], int(end_day))
        except (ValueError, KeyError) as exc:
            raise DataError(f"Invalid EIA date range: {row[0]!r}") from exc
        if start.weekday() != 0 or end != start + timedelta(days=4):
            raise DataError(f"EIA row is not a Monday–Friday week: {row[0]!r}")
        for weekday, cell in enumerate(row[1:]):
            if cell.upper() in MISSING:
                continue
            if not re.fullmatch(r"\d+(?:\.\d+)?", cell):
                raise DataError(f"Unknown price value {cell!r} in {row[0]!r}")
            try:
                value = Decimal(cell)
            except InvalidOperation as exc:
                raise DataError(f"Invalid price: {cell!r}") from exc
            if not value.is_finite() or value <= 0 or value > 1000:
                raise DataError(f"Price outside validation range (0, 1000] source units: {cell!r}")
            observed = start + timedelta(days=weekday)
            if observed > as_of:
                raise DataError(f"Future-dated observation: {observed.isoformat()}")
            key = observed.isoformat()
            if key in observations and observations[key] != float(value):
                raise DataError(f"Conflicting duplicate observation for {key}")
            observations[key] = float(value)
    if not weekly_rows or not observations:
        raise DataError("No valid daily observations found; existing snapshot was not replaced")
    return [{"date": day, "value": observations[day]} for day in sorted(observations)]


def usd_per_tonne(value: float, density: float = DENSITY_KG_PER_LITRE) -> float:
    if not math.isfinite(value) or value <= 0 or not math.isfinite(density) or density <= 0:
        raise DataError("Price and assumed density must be positive finite numbers")
    return round(value * 1000 / (density * LITRES_PER_US_GALLON), 2)


def make_snapshot(observations: list[dict], *, fetched_at: str | None = None,
                  method: str = "https", detail: str | None = None, keep: int = 90) -> dict:
    if not observations or keep < 1:
        raise DataError("A snapshot requires observations and a positive retention count")
    latest = observations[-1]
    return {
        "schemaVersion": 1,
        "source": {
            "id": "eia-usgc-jet-fuel-daily",
            "title": SOURCE_TITLE,
            "url": SOURCE_URL,
            "region": "US Gulf Coast",
            "unit": "USD/US gallon",
            "frequency": "daily observations; published with a reporting lag",
        },
        "fetchedAt": fetched_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "observedAt": latest["date"],
        "observations": observations[-keep:],
        "latest": dict(latest),
        "conversion": {
            "densityKgPerLitre": DENSITY_KG_PER_LITRE,
            "litresPerUsGallon": LITRES_PER_US_GALLON,
            "usdPerTonne": usd_per_tonne(latest["value"]),
            "assumption": "Density of 0.8 kg/L is a model assumption, not a measured cargo specification.",
        },
        "collection": {
            "method": method,
            "status": "ok",
            "detail": detail or "Observed EIA public benchmark. Not a live, Asian, or airport executable quote.",
        },
        "staleAfterDays": 7,
    }


def fetch_html() -> str:
    request = Request(SOURCE_URL, headers={
        "User-Agent": "EnergyFuelResearch/0.1 (+https://github.com/VictorWei-BSEER/Energy-Fuel-project)",
        "Accept": "text/html",
    })
    # urllib honors configured HTTPS_PROXY and CA trust; never bypass them.
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise DataError(f"Unexpected HTTP status: {response.status}")
        content_type = response.headers.get_content_type()
        if content_type not in {"text/html", "application/xhtml+xml"}:
            raise DataError(f"Unexpected response content type: {content_type}")
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise DataError("Source response exceeds the 4 MiB limit")
        return raw.decode(response.headers.get_content_charset() or "utf-8")


def write_atomic(snapshot: dict, output: Path) -> None:
    """Do not overwrite a newer snapshot with an older, possibly cached page."""
    if output.exists():
        previous = json.loads(output.read_text(encoding="utf-8"))
        old_date = date.fromisoformat(previous["latest"]["date"])
        new_date = date.fromisoformat(snapshot["latest"]["date"])
        if new_date < old_date:
            raise DataError(f"Source regressed from {old_date} to {new_date}; previous snapshot preserved")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=f".{output.name}.", suffix=".tmp", delete=False) as handle:
            temp_path = Path(handle.name)
            json.dump(snapshot, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, output)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()


def main(argv=None) -> int:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--input-html", type=Path, help="Parse a saved EIA HTML page instead of making a request")
    cli.add_argument("--output", type=Path, default=Path("dist/data/market.json"))
    cli.add_argument("--keep", type=int, default=90, help="Number of most recent actual observations to retain")
    args = cli.parse_args(argv)
    try:
        if args.keep < 1:
            raise DataError("--keep must be positive")
        html = args.input_html.read_text(encoding="utf-8") if args.input_html else fetch_html()
        observations = parse_eia_html(html)
        snapshot = make_snapshot(observations, method="local_html" if args.input_html else "https", keep=args.keep)
        write_atomic(snapshot, args.output)
    except Exception as exc:
        print(f"Market collection failed; previous output preserved: {exc}", file=sys.stderr)
        return 1
    print(f"Saved {len(snapshot['observations'])} observations; latest {snapshot['latest']['date']} = "
          f"{snapshot['latest']['value']:.3f} USD/US gallon")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
