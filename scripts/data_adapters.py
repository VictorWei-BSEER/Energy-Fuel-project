"""Validated, credential-free public-data adapters. Never invent missing values."""
from __future__ import annotations

import csv
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import math
import re
import xml.etree.ElementTree as ET
from urllib.request import Request, urlopen

from collect_market import DataError, make_snapshot, parse_eia_html

ECB_XML = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
ECB_PAGE = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
AIRPORTS_CSV = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv'
AIRPORT_CODES = ('SIN', 'HKG', 'ICN', 'NRT', 'PVG', 'PEK', 'TPE', 'BKK', 'MNL', 'KIX')
JODI_COUNTRIES = {'JP', 'KR', 'CN', 'SG', 'HK', 'TW'}
JODI_FLOWS = {'REFGROUT', 'TOTDEMO', 'TOTIMPSB', 'TOTEXPSB', 'CLOSTLV'}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def fetch_text(url: str, max_bytes: int = 4 * 1024 * 1024) -> tuple[str, dict]:
    request = Request(url, headers={
        'User-Agent': 'EnergyFuelResearch/0.2 (+https://github.com/VictorWei-BSEER/Energy-Fuel-project)',
        'Accept': 'text/html,text/csv,application/xml,text/xml,text/plain,application/octet-stream;q=0.8',
    })
    # urllib uses inherited proxy/CA settings. No network-policy workarounds.
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise DataError(f'Unexpected source HTTP status: {response.status}')
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise DataError(f'Source exceeds {max_bytes} byte limit')
        text = raw.decode(response.headers.get_content_charset() or 'utf-8-sig')
        return text, {'sha256': hashlib.sha256(raw).hexdigest(),
                      'httpLastModified': response.headers.get('Last-Modified')}


def positive_number(value: str, label: str, *, zero_allowed=False) -> float:
    try:
        number = Decimal(value)
    except (InvalidOperation, TypeError) as exc:
        raise DataError(f'Invalid numeric {label}') from exc
    if not number.is_finite() or number < 0 or (number == 0 and not zero_allowed):
        raise DataError(f'Non-finite or negative/zero {label}')
    if number > Decimal('1000000000000'):
        raise DataError(f'Implausibly large {label}')
    return float(number)


def parse_ecb_xml(text: str, *, as_of: date | None = None) -> list[dict]:
    as_of = as_of or datetime.now(timezone.utc).date()
    if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        raise DataError('XML entity/doctype declarations are not accepted')
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise DataError('Malformed ECB XML') from exc
    ns = '{http://www.ecb.int/vocabulary/2002-08-01/eurofxref}'
    observations = []
    seen_dates = set()
    for cube in root.iter(ns + 'Cube'):
        if 'time' not in cube.attrib:
            continue
        try:
            observed = date.fromisoformat(cube.attrib['time'])
        except ValueError as exc:
            raise DataError('Invalid ECB observation date') from exc
        if observed > as_of or observed.isoformat() in seen_dates:
            raise DataError('Future or duplicate ECB observation date')
        rates = {'EUR': 1.0}
        for rate in cube:
            code = rate.attrib.get('currency', '')
            if not re.fullmatch('[A-Z]{3}', code) or code in rates:
                raise DataError('Missing or duplicate ECB currency')
            rates[code] = positive_number(rate.attrib.get('rate'), f'{code} exchange rate')
        if not {'USD', 'JPY', 'CNY', 'HKD', 'KRW', 'SGD'} <= rates.keys():
            raise DataError('ECB feed is missing required USD or East Asian reference currencies')
        observations.append({'date': observed.isoformat(), 'base': 'EUR', 'rates': rates})
        seen_dates.add(observed.isoformat())
    if not observations:
        raise DataError('No official-namespace dated ECB reference rates found')
    return sorted(observations, key=lambda x: x['date'])


def parse_airports_csv(text: str, *, required_codes=AIRPORT_CODES) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    required = {'ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'iso_country', 'municipality', 'iata_code', 'elevation_ft'}
    if not reader.fieldnames or not required <= set(reader.fieldnames):
        raise DataError('OurAirports CSV header does not match its documented schema')
    airports = {}
    for row in reader:
        code = row.get('iata_code', '')
        if code not in required_codes:
            continue
        if row['type'] == 'closed' or code in airports:
            raise DataError(f'Closed or duplicated selected airport: {code}')
        try:
            lat, lon = float(row['latitude_deg']), float(row['longitude_deg'])
            elevation = float(row['elevation_ft']) if row['elevation_ft'] else None
        except (TypeError, ValueError) as exc:
            raise DataError(f'Invalid coordinates/elevation for {code}') from exc
        if not math.isfinite(lat) or not -90 <= lat <= 90 or not math.isfinite(lon) or not -180 <= lon <= 180:
            raise DataError(f'Coordinates outside valid range for {code}')
        if elevation is not None and not math.isfinite(elevation):
            raise DataError(f'Invalid elevation for {code}')
        if not row['name'] or not re.fullmatch('[A-Z]{2}', row['iso_country']):
            raise DataError(f'Invalid airport identity for {code}')
        airports[code] = {'iata': code, 'icao': row.get('icao_code') or row['ident'],
                          'name': row['name'], 'city': row['municipality'], 'country': row['iso_country'],
                          'lat': lat, 'lon': lon, 'elevationFt': elevation}
    missing = set(required_codes) - airports.keys()
    if missing:
        raise DataError('Selected airports missing: ' + ', '.join(sorted(missing)))
    return [airports[code] for code in required_codes]


def parse_jodi_csv(text: str, *, as_of: date | None = None) -> list[dict]:
    """Strict official dimension names; units/products are never inferred."""
    as_of = as_of or datetime.now(timezone.utc).date()
    reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    required = {'REF_AREA', 'TIME_PERIOD', 'ENERGY_PRODUCT', 'FLOW_BREAKDOWN', 'UNIT_MEASURE', 'OBS_VALUE', 'ASSESSMENT_CODE'}
    if not reader.fieldnames or not required <= set(reader.fieldnames):
        raise DataError('JODI CSV requires verified dimension columns; unrecognized download rejected')
    observations, seen = [], set()
    for row in reader:
        if row['REF_AREA'] not in JODI_COUNTRIES or row['ENERGY_PRODUCT'] != 'JETKERO' or row['FLOW_BREAKDOWN'] not in JODI_FLOWS or row['UNIT_MEASURE'] != 'KTONS':
            continue
        period = row['TIME_PERIOD']
        if not re.fullmatch(r'\d{4}-\d{2}', period):
            raise DataError('Invalid JODI monthly period')
        try:
            month = date.fromisoformat(period + '-01')
        except ValueError as exc:
            raise DataError('Invalid JODI calendar month') from exc
        if month > as_of:
            raise DataError('Future JODI observation')
        raw = row['OBS_VALUE'].strip()
        if raw in {'', '..', '...', '-', 'NA'}:
            continue
        value = positive_number(raw, 'JODI observation', zero_allowed=True)
        assessment = row['ASSESSMENT_CODE'].strip()
        if assessment not in {'1', '2', '3', '4'}:
            raise DataError('Unknown JODI assessment code')
        key = (period, row['REF_AREA'], row['FLOW_BREAKDOWN'])
        if key in seen:
            raise DataError('Duplicate JODI country/product/flow/month observation')
        seen.add(key)
        observations.append({'date': period, 'country': row['REF_AREA'], 'product': 'JETKERO',
                             'flow': row['FLOW_BREAKDOWN'], 'unit': 'KTONS', 'value': value,
                             'assessmentCode': assessment})
    if not observations:
        raise DataError('No matching JETKERO East Asian KTONS observations available')
    return sorted(observations, key=lambda x: (x['date'], x['country'], x['flow']))


def reference_snapshot(source: dict, observations: list[dict], *, fetched_at=None, method='https', detail=None) -> dict:
    if not observations:
        raise DataError('No reference observations supplied')
    return {'schemaVersion': 1, 'source': source, 'fetchedAt': fetched_at or utc_now(),
            'observedAt': observations[-1]['date'], 'observations': observations,
            'latest': observations[-1],
            'collection': {'method': method, 'status': 'ok', 'detail': detail or 'Public reference observation; not an executable quote.'},
            'staleAfterDays': 7}
