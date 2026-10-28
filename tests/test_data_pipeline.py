"""Source adapter and end-to-end refresh tests; no live HTTP requests."""
import importlib.util
import json
from datetime import date
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
import data_adapters as adapters
import refresh_data as pipeline
from collect_market import DataError

NOW = '2026-10-28T20:00:00Z'


def eia(title, units, value='4.444'):
    return f'<html><title>{title} ({units})</title><table><tr><td>2026 Oct-26 to Oct-30</td><td>4.585</td><td>{value}</td><td></td><td></td><td></td></tr></table></html>'


def ecb(period='2026-10-28', usd='1.1133'):
    rates = {'USD': usd, 'JPY': '175.86', 'CNY': '7.4217', 'HKD': '8.7339', 'KRW': '1492.35', 'SGD': '1.4274'}
    return '<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="' + period + '">' + ''.join(f'<Cube currency="{code}" rate="{rate}"/>' for code, rate in rates.items()) + '</Cube></Cube></gesmes:Envelope>'


def airports():
    return 'ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,iata_code,elevation_ft\n' + ''.join(f'TEST{code},large_airport,{code} Airport,22.3,113.9,HK,City,{code},22\n' for code in adapters.AIRPORT_CODES)


def jodi():
    return ('REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE\n'
            'JP,2026-08,JETKERO,TOTDEMO,KTONS,500,1\n'
            'KR,2026-08,JETKERO,TOTIMPSB,KTONS,0,2\n'
            'JP,2026-08,KEROSENE,TOTDEMO,KTONS,999,1\n'
            'JP,2026-08,JETKERO,TOTDEMO,KBD,100,1\n'
            'JP,2026-08,JETKERO,CLOSTLV,KTONS,,3\n')


def success_fetcher(url, limit):
    if 'eer_epjk' in url:
        return eia(pipeline.SOURCES['eia-jet']['title'], 'Dollars per Gallon'), {'fixture': True}
    if 'RBRTED' in url:
        return eia(pipeline.SOURCES['eia-brent']['title'], 'Dollars per Barrel', '123.10'), {'fixture': True}
    if 'ecb.europa' in url:
        return ecb(), {'fixture': True}
    if 'airports.csv' in url:
        return airports(), {'fixture': True}
    if 'jodidata' in url:
        return jodi(), {'fixture': True}
    raise AssertionError('Unexpected URL')


class AdapterTests(unittest.TestCase):
    def test_brent_has_correct_units_and_no_jet_density_conversion(self):
        snapshot = pipeline.collect_one('eia-brent', fetcher=success_fetcher, now=NOW)
        self.assertEqual(snapshot['latest'], {'date': '2026-10-27', 'value': 123.10})
        self.assertEqual(snapshot['source']['unit'], 'USD/barrel')
        self.assertNotIn('conversion', snapshot)
        self.assertIn('Different commodity and geography', snapshot['collection']['limitations'])

    def test_ecb_base_direction_and_values(self):
        observation = adapters.parse_ecb_xml(ecb(), as_of=date(2026,10,28))[0]
        self.assertEqual(observation['date'], '2026-10-28')
        self.assertEqual(observation['base'], 'EUR')
        self.assertEqual(observation['rates']['USD'], 1.1133)
        self.assertEqual(observation['rates']['EUR'], 1.0)

    def test_ecb_rejects_bad_xml_missing_currency_and_nonpositive_rates(self):
        for text in ('<html>error</html>', ecb().replace('currency="SGD"', 'currency="USD"'), ecb(usd='NaN'), ecb(usd='0'), ecb('2026-10-29'), '<!DOCTYPE x [<!ENTITY a "x">]>' + ecb()):
            with self.subTest(text=text[:80]), self.assertRaises(DataError):
                adapters.parse_ecb_xml(text, as_of=date(2026,10,28))

    def test_airports_selects_exact_required_nodes(self):
        rows = adapters.parse_airports_csv(airports())
        self.assertEqual([x['iata'] for x in rows], list(adapters.AIRPORT_CODES))
        self.assertEqual(rows[0]['lat'],22.3)
        self.assertNotIn('capacity', rows[0])
        self.assertNotIn('demand', rows[0])

    def test_airports_rejects_missing_or_invalid_coordinates(self):
        for text in ('<html>bad</html>', airports().replace('22.3','NaN'), airports().replace('113.9','181'), airports().replace('SIN,22','XXX,22')):
            with self.subTest(text=text[:80]), self.assertRaises(DataError):
                adapters.parse_airports_csv(text)

    def test_jodi_preserves_zero_product_unit_assessment(self):
        observations = adapters.parse_jodi_csv(jodi(), as_of=date(2026,10,28))
        self.assertEqual(len(observations),2)
        self.assertEqual({x['product'] for x in observations},{'JETKERO'})
        self.assertEqual({x['unit'] for x in observations},{'KTONS'})
        self.assertEqual(observations[1]['value'],0)
        self.assertEqual(observations[1]['assessmentCode'],'2')

    def test_jodi_unknown_schema_values_periods_fail(self):
        for text in (jodi().replace('OBS_VALUE','value'),jodi().replace(',500,',',nan,'),jodi().replace('2026-08','2026-13'),jodi().replace(',500,1',',500,9')):
            with self.subTest(text=text[:80]), self.assertRaises(DataError):
                adapters.parse_jodi_csv(text,as_of=date(2026,10,28))


class PipelineTests(unittest.TestCase):
    def test_all_sources_collect_with_separate_roles_and_limits(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            catalog,code=pipeline.refresh_sources(out,fetcher=success_fetcher,now=NOW)
            self.assertEqual(code,0)
            self.assertEqual(catalog['refreshSummary'],{'attempted':5,'succeeded':5,'failed':0})
            feeds={x['id']:x for x in catalog['feeds']}
            self.assertEqual(feeds['eia-usgc-jet-fuel-daily']['role'],'model')
            self.assertEqual(feeds['eia-brent-daily']['role'],'context')
            self.assertEqual(feeds['ourairports-coordinates']['role'],'reference')
            self.assertIsNone(feeds['ourairports-coordinates']['observationDate'])
            self.assertEqual(feeds['iata-regional-jet']['status'],'restricted')
            self.assertIsNone(feeds['comtrade-flows']['path'])

    def test_failure_preserves_snapshot_and_reports_failed_attempt(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            pipeline.refresh_sources(out,fetcher=success_fetcher,now=NOW)
            before=(out/'market.json').read_bytes()
            def fails(url,limit): raise TimeoutError('test source timeout')
            catalog,code=pipeline.refresh_sources(out,selected=['eia-jet'],fetcher=fails,now='2026-10-29T20:00:00Z')
            self.assertEqual(code,1)
            self.assertEqual((out/'market.json').read_bytes(),before)
            feed=catalog['feeds'][0]
            self.assertEqual(feed['status'],'observed')
            self.assertEqual(feed['lastAttemptStatus'],'failed')
            self.assertEqual(feed['fetchedAt'],NOW)
            self.assertEqual(feed['lastAttemptAt'],'2026-10-29T20:00:00Z')

    def test_failure_without_cache_is_unavailable(self):
        with tempfile.TemporaryDirectory() as folder:
            def fails(url,limit): raise TimeoutError('test')
            catalog,code=pipeline.refresh_sources(Path(folder),selected=['jodi'],fetcher=fails,now=NOW)
            feed=next(x for x in catalog['feeds'] if x['id']=='jodi-jet-kerosene-monthly')
            self.assertEqual(code,1)
            self.assertEqual(feed['status'],'unavailable')
            self.assertEqual(feed['lastAttemptStatus'],'failed')
            self.assertIsNone(feed['path'])
            self.assertIsNone(feed['fetchedAt'])

    def test_partial_success_exit_zero_and_accurate_summary(self):
        with tempfile.TemporaryDirectory() as folder:
            def partial(url,limit):
                if 'jodidata' in url: raise DataError('CSV schema unavailable')
                return success_fetcher(url,limit)
            catalog,code=pipeline.refresh_sources(Path(folder),fetcher=partial,now=NOW)
            self.assertEqual(code,0)
            self.assertEqual(catalog['refreshSummary'],{'attempted':5,'succeeded':4,'failed':1})

    def test_regressed_date_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            pipeline.refresh_sources(out,selected=['ecb-fx'],fetcher=success_fetcher,now=NOW)
            before=(out/'fx.json').read_bytes()
            def older(url,limit): return ecb('2026-10-27'),{}
            catalog,code=pipeline.refresh_sources(out,selected=['ecb-fx'],fetcher=older,now=NOW)
            self.assertEqual(code,1)
            self.assertEqual((out/'fx.json').read_bytes(),before)

    def test_fx_history_merges_actual_dates(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            pipeline.refresh_sources(out,selected=['ecb-fx'],fetcher=success_fetcher,now=NOW)
            def newer(url,limit): return ecb('2026-10-29',usd='1.12'),{}
            pipeline.refresh_sources(out,selected=['ecb-fx'],fetcher=newer,now='2026-10-29T20:00:00Z')
            fx=json.loads((out/'fx.json').read_text())
            self.assertEqual([x['date'] for x in fx['observations']],['2026-10-28','2026-10-29'])
            self.assertEqual(fx['latest']['rates']['USD'],1.12)

    def test_catalog_only_does_not_fetch_or_refresh_source_time(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            pipeline.refresh_sources(out,selected=['eia-jet'],fetcher=success_fetcher,now=NOW)
            def forbidden(url,limit): raise AssertionError('No network in catalog-only mode')
            catalog,code=pipeline.refresh_sources(out,fetcher=forbidden,now='2026-10-29T20:00:00Z',catalog_only=True)
            self.assertEqual(code,0)
            self.assertEqual(catalog['refreshSummary']['attempted'],0)
            self.assertEqual(catalog['feeds'][0]['fetchedAt'],NOW)

    def test_atomic_encoding_failure_keeps_old_output(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'data.json'
            target.write_text('{"old":true}\n')
            with self.assertRaises(ValueError):
                pipeline.atomic_json({'invalid':float('nan')},target)
            self.assertEqual(target.read_text(),'{"old":true}\n')
            self.assertEqual(list(Path(folder).glob('*.tmp')),[])


if __name__ == '__main__':
    unittest.main()
