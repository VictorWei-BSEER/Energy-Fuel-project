import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('build_airport_directory', Path(__file__).resolve().parents[1] / 'scripts/build_airport_directory.py')
directory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(directory)


class AirportSelectionTests(unittest.TestCase):
    def test_passengers_rank_eligible_airports_with_a_stable_tie_break(self):
        traffic = {'year': 2024, 'sources': {'test': {}}, 'candidates': [
            {'iata': code, 'passengers': n, 'source': 'test'} for code, n in [('AAA', 200), ('BBB', 300), ('CCC', 300), ('DDD', 1000), ('EEE', 900)] ]}
        def airport(code, lon=110, lat=30, service='yes'):
            return {'iata_code': code, 'ident': code, 'type': 'large_airport', 'name': code, 'municipality': code, 'iso_country': 'CN', 'scheduled_service': service, 'longitude_deg': str(lon), 'latitude_deg': str(lat)}
        coordinates = [airport('AAA'), airport('BBB'), airport('CCC'), airport('DDD', lon=80), airport('EEE', service='no')]
        selected, excluded = directory.select_airports(traffic, coordinates, limit=2)
        self.assertEqual([a['iata'] for a in selected], ['BBB', 'CCC'])
        self.assertEqual([a['iata'] for a in excluded], ['AAA'])
        self.assertEqual([a['rank'] for a in selected], [1, 2])

    def test_invalid_or_insufficient_traffic_does_not_produce_a_directory(self):
        with self.assertRaises(ValueError):
            directory.select_airports({'year': 2024, 'sources': {}, 'candidates': []}, [], limit=50)
        with self.assertRaises(ValueError):
            directory.select_airports({'year': 2024, 'sources': {'test': {}}, 'candidates': [{'iata': 'AAA', 'passengers': -1, 'source': 'test'}]}, [], limit=1)


if __name__ == '__main__':
    unittest.main()
