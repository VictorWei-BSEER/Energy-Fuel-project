"""Offline collector tests: date/column integrity and preserve-on-failure behavior."""
import importlib.util
import json
from datetime import date
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("collect_market", Path(__file__).parents[1] / "scripts/collect_market.py")
market = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(market)


def page(*rows):
    return '<html><title>' + market.SOURCE_TITLE + ' (Dollars per Gallon)</title><table><tr><th>Week Of</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th></tr>' + ''.join('<tr>' + ''.join('<td>' + cell + '</td>' for cell in row) + '</tr>' for row in rows) + '</table></html>'


class CollectorTests(unittest.TestCase):
    def parse(self, html):
        return market.parse_eia_html(html, as_of=date(2026, 10, 29))

    def test_missing_holiday_keeps_weekday_alignment(self):
        data = self.parse(page(('2026 Sep- 7 to Sep-11', '&nbsp;', '4.126', '4.341', '4.682', '4.521')))
        self.assertEqual(data[0], {'date': '2026-09-08', 'value': 4.126})
        self.assertEqual(data[-1]['date'], '2026-09-11')
        self.assertEqual(len(data), 4)

    def test_incomplete_current_week_does_not_fill_missing_values(self):
        data = self.parse(page(('2026 Oct-26 to Oct-30', '<span>4.585</span>', '4.444', '', '', '')))
        self.assertEqual(data, [{'date': '2026-10-26', 'value': 4.585}, {'date': '2026-10-27', 'value': 4.444}])

    def test_cross_year_dates(self):
        data = self.parse(page(('2024 Dec-30 to Jan- 3', '2.189', '2.228', '-', '2.266', '2.272')))
        self.assertEqual(data[-1], {'date': '2025-01-03', 'value': 2.272})

    def test_documented_missing_markers_are_skipped(self):
        data = self.parse(page(('2026 Oct-19 to Oct-23', 'NA', 'W', '--', '4.680', '4.686')))
        self.assertEqual([x['date'] for x in data], ['2026-10-22', '2026-10-23'])

    def test_malformed_response_or_table_rejected(self):
        for html in ('<html>Access denied</html>', page(('2026 Oct-26 to Oct-30', '4.585')), page(('2026 Oct-25 to Oct-29', '1', '1', '1', '1', '1')), page(('2026 Bad-26 to Oct-30', '1', '1', '1', '1', '1')), page(('2026 Oct-19 to Oct-23', '4.567', '4.632', '4.548', '4.680', '4.686')).replace('</tr></table>', '</table>')):
            with self.subTest(html=html), self.assertRaises(market.DataError):
                self.parse(html)

    def test_invalid_price_fails_entire_run(self):
        for price in ('NaN', 'Infinity', '-2.1', '0', '1001', '4.44 USD', 'unknown'):
            with self.subTest(price=price), self.assertRaises(market.DataError):
                self.parse(page(('2026 Oct-19 to Oct-23', '4.567', '4.632', price, '4.680', '4.686')))

    def test_future_nonblank_observation_rejected(self):
        with self.assertRaises(market.DataError):
            self.parse(page(('2026 Oct-26 to Oct-30', '4.585', '4.444', '', '', '4.5')))

    def test_duplicate_conflicts_rejected(self):
        a = ('2026 Oct-19 to Oct-23', '4.567', '', '', '', '')
        self.assertEqual(len(self.parse(page(a, a))), 1)
        with self.assertRaises(market.DataError):
            self.parse(page(a, ('2026 Oct-19 to Oct-23', '9.999', '', '', '', '')))

    def test_unit_conversion_and_observation_metadata(self):
        self.assertAlmostEqual(market.usd_per_tonne(4.444), 1467.48, places=2)
        observations = [{'date': '2026-10-26', 'value': 4.585}, {'date': '2026-10-27', 'value': 4.444}]
        snapshot = market.make_snapshot(observations, fetched_at='2026-10-28T20:00:00Z', keep=1)
        self.assertEqual(snapshot['observedAt'], '2026-10-27')
        self.assertEqual(snapshot['fetchedAt'], '2026-10-28T20:00:00Z')
        self.assertEqual(snapshot['observations'], observations[-1:])
        self.assertEqual(snapshot['conversion']['densityKgPerLitre'], 0.8)
        for invalid in (0, -1, float('nan'), float('inf')):
            with self.assertRaises(market.DataError):
                market.usd_per_tonne(invalid)

    def test_failed_fetch_preserves_previous_file_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'market.json'
            original = b'{"latest":{"date":"2026-10-27","value":4.444}}\n'
            output.write_bytes(original)
            with patch.object(market, 'fetch_html', side_effect=TimeoutError('test timeout')):
                self.assertEqual(market.main(['--output', str(output)]), 1)
            self.assertEqual(output.read_bytes(), original)

    def test_stale_regression_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'market.json'
            newest = market.make_snapshot([{'date': '2026-10-27', 'value': 4.444}])
            market.write_atomic(newest, output)
            original = output.read_bytes()
            with self.assertRaises(market.DataError):
                market.write_atomic(market.make_snapshot([{'date': '2026-10-26', 'value': 4.585}]), output)
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

    def test_input_html_cli_success_and_bad_input_preserves_output(self):
        with tempfile.TemporaryDirectory() as folder:
            fixture, output = Path(folder) / 'eia.html', Path(folder) / 'market.json'
            fixture.write_text(page(('2026 Oct-19 to Oct-23', '4.567', '4.632', '4.548', '4.680', '4.686')))
            self.assertEqual(market.main(['--input-html', str(fixture), '--output', str(output)]), 0)
            result = json.loads(output.read_text())
            self.assertEqual(result['collection']['method'], 'local_html')
            original = output.read_bytes()
            fixture.write_text('<html>Unexpected response</html>')
            self.assertEqual(market.main(['--input-html', str(fixture), '--output', str(output)]), 1)
            self.assertEqual(output.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
