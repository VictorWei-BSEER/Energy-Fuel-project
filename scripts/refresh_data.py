#!/usr/bin/env python3
"""Refresh independent public feeds and publish truthful per-source health.

Exit 0 if at least one selected feed refreshes; exit 1 if all selected feeds fail.
A catalog-only run is offline and exits 0. Never fabricates an unavailable feed.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile

from collect_market import DataError, SOURCE_TITLE, SOURCE_URL, make_snapshot, parse_eia_html
from data_adapters import (AIRPORTS_CSV, ECB_PAGE, ECB_XML, fetch_text, parse_airports_csv,
                           parse_ecb_xml, parse_jodi_csv, reference_snapshot, utc_now)

SOURCES = {
    'eia-jet': {'id': 'eia-usgc-jet-fuel-daily', 'title': SOURCE_TITLE, 'path': 'market.json', 'role': 'model', 'url': SOURCE_URL,
                'unit': 'USD/US gallon', 'frequency': 'daily observations; reporting lag', 'region': 'US Gulf Coast',
                'limitations': 'US wholesale benchmark used only as an explicit proxy. Asian delivered differentials, logistics costs, capacities and demand remain model assumptions.'},
    'eia-brent': {'id': 'eia-brent-daily', 'title': 'Europe Brent Spot Price FOB', 'path': 'brent.json', 'role': 'context',
                  'url': 'https://www.eia.gov/dnav/pet/hist/RBRTED.htm', 'unit': 'USD/barrel', 'frequency': 'daily observations; reporting lag', 'region': 'Europe / North Sea',
                  'limitations': 'Different commodity and geography from USGC jet. Any jet-minus-Brent comparison is a cross-market indicative spread, not a refinery margin or executable arbitrage.'},
    'ecb-fx': {'id': 'ecb-reference-fx', 'title': 'ECB euro foreign exchange reference rates', 'path': 'fx.json', 'role': 'context',
               'url': ECB_XML, 'unit': 'currency units per EUR', 'frequency': 'ECB business days', 'region': 'International currencies',
               'limitations': 'Reference rates for information only, not transaction rates. Cross conversion through EUR is indicative; quotes and benchmark dates may differ.'},
    'ourairports': {'id': 'ourairports-coordinates', 'title': 'OurAirports selected airport coordinates', 'path': 'airports.json', 'role': 'reference',
                    'url': AIRPORTS_CSV, 'unit': 'WGS84 decimal degrees', 'frequency': 'nightly upstream dataset', 'region': 'East and Southeast Asia',
                    'limitations': 'Community-maintained airport geometry only; does not establish inventory, fuel availability, demand, storage capacity, or airport contract prices.'},
    'jodi': {'id': 'jodi-jet-kerosene-monthly', 'title': 'JODI East Asian jet kerosene balances', 'path': 'jodi.json', 'role': 'context',
             'url': 'https://www.jodidata.org/_resources/files/downloads/oil-data/annual-csv/secondary/secondaryyear{year}.csv',
             'unit': 'thousand metric tonnes', 'frequency': 'monthly; country reporting lag', 'region': 'JP, KR, CN, SG, HK, TW when reported',
             'limitations': 'Strict JETKERO and KTONS selection with assessment codes retained. Country totals do not establish airport demand or available terminal inventories. Monthly country reports can be delayed or revised; assessment codes and missing coverage must be retained.'},
}
PLANNED = [
    {'id': 'iata-regional-jet', 'title': 'IATA / Platts regional jet-fuel monitor', 'status': 'restricted', 'role': 'context',
     'sourceUrl': 'https://www.iata.org/en/publications/economics/fuel-monitor/', 'frequency': 'weekly', 'unit': 'regional refinery-price assessment', 'region': 'Global regions',
     'limitations': 'Underlying Platts data is proprietary. No automated extraction or redistribution activated; permission/license scope must be established.'},
    {'id': 'comtrade-flows', 'title': 'UN Comtrade fuel trade flows', 'status': 'unavailable', 'role': 'context',
     'sourceUrl': 'https://uncomtrade.org/docs/un-comtrade-api/', 'frequency': 'monthly or annual', 'unit': 'trade value and quantity', 'region': 'Selected Asian economies',
     'limitations': 'No API account/key or verified country/product taxonomy configured. Six-digit HS coverage may not isolate jet fuel. Not a spot-price feed.'},
    {'id': 'executable-offers', 'title': 'Supplier offers, freight and terminal capacity', 'status': 'unavailable', 'role': 'model',
     'sourceUrl': None, 'frequency': 'contract / counterparty dependent', 'unit': 'USD/tonne, tonnes, days', 'region': 'Selected modeled network',
     'limitations': 'No counterparty offers, nominated volumes, freight contracts or terminal inventories connected. These remain explicitly editable assumptions, not observed market facts.'},
]


def source_metadata(config: dict, year: int) -> dict:
    return {key: config[key] for key in ('id', 'title', 'unit', 'frequency', 'region')} | {'url': config['url'].format(year=year)}


def collect_one(key: str, *, fetcher=fetch_text, now: str | None = None) -> dict:
    now = now or utc_now()
    today = datetime.fromisoformat(now.replace('Z', '+00:00')).date()
    config = SOURCES[key]
    source = source_metadata(config, today.year)
    text, transport = fetcher(source['url'], 20 * 1024 * 1024 if key in {'ourairports', 'jodi'} else 4 * 1024 * 1024)
    if key == 'eia-jet':
        snapshot = make_snapshot(parse_eia_html(text, as_of=today), fetched_at=now)
    elif key == 'eia-brent':
        observations = parse_eia_html(text, as_of=today, expected_title=config['title'], expected_units='Dollars per Barrel')
        snapshot = reference_snapshot(source, observations[-90:], fetched_at=now)
    elif key == 'ecb-fx':
        snapshot = reference_snapshot(source | {'referencePage': ECB_PAGE}, parse_ecb_xml(text, as_of=today), fetched_at=now)
    elif key == 'ourairports':
        snapshot = {'schemaVersion': 1, 'source': source | {'license': 'Public Domain', 'referencePage': 'https://ourairports.com/data/'},
                    'fetchedAt': now, 'observedAt': None, 'airports': parse_airports_csv(text),
                    'collection': {'method': 'https', 'status': 'ok', 'detail': 'Actual coordinates from the official OurAirports GitHub dataset. No per-record observation timestamp is provided.'}}
    elif key == 'jodi':
        observations = parse_jodi_csv(text, as_of=today)
        # Keep all dimensions for the last 12 observed months without aggregating.
        periods = sorted({x['date'] for x in observations})[-12:]
        observations = [x for x in observations if x['date'] in periods]
        snapshot = reference_snapshot(source, observations, fetched_at=now)
        snapshot['latest'] = {'date': observations[-1]['date']}
        snapshot['staleAfterDays'] = 90
    else:
        raise DataError('Unknown adapter')
    snapshot['collection']['limitations'] = config['limitations']
    snapshot['collection']['transport'] = transport
    return snapshot


def atomic_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, prefix='.' + path.name + '.', suffix='.tmp', delete=False) as handle:
            temp = Path(handle.name)
            json.dump(data, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if temp and temp.exists():
            temp.unlink()


def cached_snapshot(path: Path, source_id: str) -> dict | None:
    if not path.exists():
        return None
    try:
        cached = json.loads(path.read_text(encoding='utf-8'))
        if cached['source']['id'] != source_id or not cached.get('fetchedAt') or cached.get('collection', {}).get('status') != 'ok':
            raise DataError('Cached snapshot identity/collection status is invalid')
        if not (cached.get('observations') or cached.get('airports')):
            raise DataError('Cached snapshot contains no records')
        return cached
    except (ValueError, KeyError, TypeError) as exc:
        raise DataError(f'Invalid cached {path.name}; preserved for investigation') from exc


def merge_and_store(snapshot: dict, path: Path) -> dict:
    previous = cached_snapshot(path, snapshot['source']['id'])
    old_date = (previous or {}).get('latest', {}).get('date')
    new_date = snapshot.get('latest', {}).get('date')
    if old_date and new_date and new_date < old_date:
        raise DataError(f'Source observation regressed from {old_date} to {new_date}')
    if previous and snapshot['source']['id'] == 'ecb-reference-fx':
        # Build a true daily FX history across successful refreshes; revisions replace dates.
        history = {x['date']: x for x in previous['observations']}
        history.update({x['date']: x for x in snapshot['observations']})
        snapshot['observations'] = [history[x] for x in sorted(history)[-90:]]
    atomic_json(snapshot, path)
    return snapshot


def refresh_sources(output_dir: Path, *, selected=None, fetcher=fetch_text, now=None, catalog_only=False) -> tuple[dict, int]:
    now = now or utc_now()
    year = datetime.fromisoformat(now.replace('Z', '+00:00')).year
    selected = set(SOURCES) if selected is None else set(selected)
    unknown = selected - SOURCES.keys()
    if unknown:
        raise DataError('Unknown feed selection: ' + ', '.join(sorted(unknown)))
    prior_catalog = {}
    catalog_path = output_dir / 'catalog.json'
    if catalog_path.exists():
        prior_catalog = {x['id']: x for x in json.loads(catalog_path.read_text())['feeds']}
    entries, successes = [], 0
    for key, config in SOURCES.items():
        source = source_metadata(config, year)
        path = output_dir / config['path']
        error, attempt_status = None, 'not_attempted'
        attempted = key in selected and not catalog_only
        snapshot = None
        try:
            snapshot = cached_snapshot(path, config['id'])
            if attempted:
                new_snapshot = collect_one(key, fetcher=fetcher, now=now)
                snapshot = merge_and_store(new_snapshot, path)
                successes += 1
                attempt_status = 'success'
        except Exception as exc:
            error = str(exc)[:400]
            attempt_status = 'failed' if attempted else 'not_attempted'
        previous = prior_catalog.get(config['id'], {})
        if not attempted and not error:
            attempt_status = previous.get('lastAttemptStatus', 'not_attempted')
            error = previous.get('error')
        entries.append({
            'id': config['id'], 'title': config['title'], 'path': 'data/' + config['path'] if snapshot else None,
            'status': 'observed' if snapshot else 'unavailable', 'role': config['role'], 'sourceUrl': source['url'],
            'observationDate': snapshot.get('observedAt') if snapshot else None,
            'fetchedAt': snapshot.get('fetchedAt') if snapshot else None,
            'frequency': config['frequency'], 'unit': config['unit'], 'region': config['region'],
            'limitations': config['limitations'], 'collectionMethod': snapshot.get('collection', {}).get('method') if snapshot else None,
            'lastAttemptAt': now if attempted else previous.get('lastAttemptAt'), 'lastAttemptStatus': attempt_status,
            'error': error,
        })
    for unavailable in PLANNED:
        entries.append(unavailable | {'path': None, 'observationDate': None, 'fetchedAt': None, 'collectionMethod': None,
                                     'lastAttemptAt': None, 'lastAttemptStatus': 'not_attempted', 'error': None})
    catalog = {'schemaVersion': 1, 'generatedAt': now, 'feeds': entries,
               'refreshSummary': {'attempted': 0 if catalog_only else len(selected), 'succeeded': successes,
                                  'failed': 0 if catalog_only else len(selected) - successes}}
    atomic_json(catalog, catalog_path)
    return catalog, 0 if catalog_only or successes else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('dist/data'))
    parser.add_argument('--only', nargs='+', choices=tuple(SOURCES), help='Run only selected adapters; other snapshots remain intact')
    parser.add_argument('--catalog-only', action='store_true', help='Build source catalog from existing snapshots without network access')
    args = parser.parse_args(argv)
    try:
        catalog, code = refresh_sources(args.output_dir, selected=args.only, catalog_only=args.catalog_only)
    except Exception as exc:
        print(f'Data pipeline failed: {exc}', file=sys.stderr)
        return 1
    for feed in catalog['feeds']:
        print(f"{feed['id']}: {feed['status']} | refresh={feed['lastAttemptStatus']} | observation={feed['observationDate'] or 'n/a'}")
    print(json.dumps(catalog['refreshSummary']))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
