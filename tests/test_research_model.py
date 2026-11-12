"""Physical accounting, dimensional thresholds and frozen-study reproducibility."""
from decimal import Decimal, getcontext
import csv
import importlib.util
import io
import json
import math
from pathlib import Path
import random
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location("tankering_research", ROOT / "research/model.py")
model = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(model)


class TankeringResearchTests(unittest.TestCase):
    def test_four_hour_headline_matches_independent_decimal_accounting(self):
        getcontext().prec = 40
        a = Decimal(1) - Decimal(".035") * Decimal(4)
        x = Decimal(1) / a
        flow = model.transfer_for_delivery(1, 4, .035)
        self.assertAlmostEqual(flow["extraOriginUpliftT"], float(x), places=14)
        self.assertAlmostEqual(flow["additionalBurnT"], float(x - 1), places=14)
        self.assertAlmostEqual(flow["additionalCo2T"], float((x - 1) * Decimal("3.16")), places=14)
        ratio = model.break_even_ratio(4, .035, origin_price=1000, carbon_price=100)
        self.assertAlmostEqual(ratio, 1.214232558139535, places=13)

    def test_conservation_for_both_structural_models_across_study_domain(self):
        random.seed(20261112)
        for _ in range(200):
            duration, coefficient, quantity = random.uniform(0, 9), random.uniform(.025, .045), random.uniform(0, 20)
            for method in ("linear", "exponential"):
                flow = model.transfer_for_delivery(quantity, duration, coefficient, method)
                self.assertAlmostEqual(flow["extraOriginUpliftT"] - flow["additionalBurnT"], quantity, places=12)
                self.assertAlmostEqual(flow["extraOriginUpliftT"] * flow["retentionFraction"], quantity, places=12)
                self.assertGreaterEqual(flow["additionalBurnT"], 0)
                self.assertAlmostEqual(flow["additionalCo2T"], 3.16 * flow["additionalBurnT"], places=12)

    def test_threshold_produces_zero_incremental_benefit_and_correct_sign(self):
        for method in ("linear", "exponential"):
            for duration in (0, 2, 4, 8):
                for carbon in (0, 100, 200):
                    ratio = model.break_even_ratio(duration, .035, origin_price=1100,
                                                   carbon_price=carbon, extra_cost_per_delivered_t=37,
                                                   model=method)
                    kwargs = dict(required_delivery_t=3, duration_h=duration, k_per_hour=.035,
                                  origin_price=1100, carbon_price=carbon,
                                  extra_cost_per_delivered_t=37, model=method)
                    self.assertAlmostEqual(model.incremental_benefit(destination_price=1100 * ratio, **kwargs), 0, places=9)
                    self.assertGreater(model.incremental_benefit(destination_price=1100 * ratio + 1, **kwargs), 0)
                    self.assertLess(model.incremental_benefit(destination_price=1100 * ratio - 1, **kwargs), 0)

    def test_carrying_cost_increases_with_duration_and_coefficient(self):
        for method in ("linear", "exponential"):
            durations = [model.break_even_ratio(t, .035, model=method) for t in (0, 2, 4, 6, 8)]
            coefficients = [model.break_even_ratio(4, k, model=method) for k in (.025, .035, .045)]
            self.assertTrue(all(a < b for a, b in zip(durations, durations[1:])))
            self.assertTrue(all(a < b for a, b in zip(coefficients, coefficients[1:])))

    def test_carbon_and_per_delivered_tonne_cost_raise_threshold(self):
        for method in ("linear", "exponential"):
            baseline = model.break_even_ratio(4, .035, model=method)
            carbon = model.break_even_ratio(4, .035, carbon_price=100, model=method)
            carbon_and_fee = model.break_even_ratio(4, .035, carbon_price=100,
                                                   extra_cost_per_delivered_t=40, model=method)
            self.assertGreater(carbon, baseline)
            self.assertAlmostEqual(carbon_and_fee - carbon, .04, places=14)

    def test_zero_burn_limits_do_not_manufacture_a_price_premium(self):
        for method in ("linear", "exponential"):
            for duration, coefficient in ((0, .035), (4, 0)):
                flow = model.transfer_for_delivery(1, duration, coefficient, method)
                self.assertEqual(flow["additionalBurnT"], 0)
                self.assertEqual(flow["additionalCo2T"], 0)
                self.assertEqual(model.break_even_ratio(duration, coefficient, model=method), 1)
                self.assertAlmostEqual(model.break_even_ratio(duration, coefficient,
                                      extra_cost_per_delivered_t=50, carbon_price=200, model=method), 1.05)

    def test_zero_carbon_zero_fee_threshold_is_independent_of_reference_price(self):
        for method in ("linear", "exponential"):
            values = [model.break_even_ratio(4, .035, origin_price=p, model=method)
                      for p in (500, 1000, 2000)]
            self.assertEqual(values[0], values[1])
            self.assertEqual(values[1], values[2])

    def test_linear_is_more_fuel_intensive_than_exponential_at_same_inputs_only(self):
        for duration in (1, 4, 8):
            linear = model.transfer_for_delivery(1, duration, .035, "linear")
            exponential = model.transfer_for_delivery(1, duration, .035, "exponential")
            self.assertGreater(linear["additionalBurnT"], exponential["additionalBurnT"])
            self.assertGreater(linear["additionalCo2T"], exponential["additionalCo2T"])

    def test_local_gap_is_bounded_by_retained_extra_origin_headroom(self):
        row = model.local_interruption(1, 1, 4, .035)
        self.assertAlmostEqual(row["destinationUpliftDisplacedT"], .86)
        self.assertAlmostEqual(row["gapRemainingT"], .14)
        self.assertAlmostEqual(row["extraOriginUsedT"], 1)
        self.assertAlmostEqual(row["additionalBurnT"], .14)

    def test_sufficient_headroom_does_not_carry_unneeded_fuel(self):
        row = model.local_interruption(.5, 10, 4, .035)
        self.assertEqual(row["destinationUpliftDisplacedT"], .5)
        self.assertEqual(row["gapRemainingT"], 0)
        self.assertAlmostEqual(row["extraOriginUsedT"], .5 / .86)
        self.assertLess(row["extraOriginUsedT"], row["extraOriginHeadroomT"])

    def test_no_gap_or_no_headroom_never_creates_extra_burn_or_supply(self):
        for need, headroom in ((0, 10), (1, 0)):
            for method in ("linear", "exponential"):
                row = model.local_interruption(need, headroom, 4, .035, method)
                self.assertEqual(row["extraOriginUsedT"], 0)
                self.assertEqual(row["destinationUpliftDisplacedT"], 0)
                self.assertEqual(row["additionalBurnT"], 0)
                self.assertEqual(row["gapRemainingT"], need)

    def test_zero_quantity_is_no_action_with_no_variable_fee(self):
        self.assertEqual(model.incremental_benefit(0, 4, .035, origin_price=1000,
                         destination_price=1400, carbon_price=100, extra_cost_per_delivered_t=50), 0)

    def test_equal_destination_fuel_reveals_shared_regional_resource_cost(self):
        for method in ("linear", "exponential"):
            flow = model.transfer_for_delivery(2, 4, .035, method)
            self.assertAlmostEqual(flow["extraOriginUpliftT"] - 2, flow["additionalBurnT"])
            self.assertGreater(flow["extraOriginUpliftT"], 2)
            self.assertEqual(flow["requiredDeliveryT"], 2)

    def test_nonfinite_negative_and_boolean_inputs_are_rejected(self):
        for bad in (float("nan"), float("inf"), -1, True, "4", None):
            for callback in (
                    lambda: model.retention_fraction(bad, .035),
                    lambda: model.retention_fraction(4, bad),
                    lambda: model.transfer_for_delivery(bad, 4, .035),
                    lambda: model.break_even_ratio(4, .035, origin_price=bad),
                    lambda: model.break_even_ratio(4, .035, carbon_price=bad),
                    lambda: model.local_interruption(1, bad, 4, .035)):
                with self.assertRaises(ValueError): callback()

    def test_singular_or_underflowing_retention_and_nonpositive_price_are_rejected(self):
        for t, k, method in ((4, .25, "linear"), (10, .2, "linear"),
                             (1000, 1000, "exponential"), (1e308, 1e308, "linear")):
            with self.assertRaises(ValueError): model.retention_fraction(t, k, method)
        with self.assertRaises(ValueError): model.retention_fraction(4, .035, "unknown")
        with self.assertRaises(ValueError): model.break_even_ratio(4, .035, origin_price=0)
        with self.assertRaises(ValueError): model.local_interruption(1e308, 1e308, 20, .04)

    def test_geometry_has_independent_zero_quarter_circle_and_antipodal_checks(self):
        radius = 6371.0088
        self.assertEqual(model.great_circle_km(20, 120, 20, 120), 0)
        self.assertAlmostEqual(model.great_circle_km(0, 0, 0, 90), math.pi * radius / 2, places=8)
        self.assertAlmostEqual(model.great_circle_km(0, 0, 0, 180), math.pi * radius, places=8)
        self.assertAlmostEqual(model.great_circle_km(1.35019,103.994003,22.31184,113.914862),
                               model.great_circle_km(22.31184,113.914862,1.35019,103.994003), places=10)
        with self.assertRaises(ValueError): model.great_circle_km(91, 0, 0, 0)

    def test_frozen_inputs_separate_source_records_from_scenario_prices(self):
        data = json.loads((ROOT / "research/inputs.json").read_text())
        self.assertEqual({a["iata"] for a in data["airports"]}, {"SIN", "HKG", "NRT"})
        self.assertEqual(data["airportSnapshot"]["classification"], "observed")
        self.assertRegex(data["airportSnapshot"]["snapshotSha256"], r"^[0-9a-f]{64}$")
        self.assertIsNone(data["actualAirportPrices"]["values"])
        self.assertIsNone(data["actualAirportInventories"]["values"])
        self.assertEqual(data["parameters"]["originPriceScenarioUsdPerT"]["classification"], "scenario")
        self.assertTrue(all("price" not in key.lower() for airport in data["airports"] for key in airport))

    def test_artifacts_are_deterministic_and_cover_the_full_factorial(self):
        source = (ROOT / "research/inputs.json").read_bytes()
        first, second = model.artifacts(source), model.artifacts(source)
        self.assertEqual(first, second)
        result = json.loads(first["results.json"])
        self.assertEqual(len(result["durationCases"]), 18)
        self.assertEqual(len(result["routeCases"]), 18)
        grid = list(csv.DictReader(io.StringIO(first["sensitivity.csv"])))
        self.assertEqual(len(grid), 486)
        self.assertEqual(len({row["id"] for row in grid}), 486)
        self.assertEqual(result["sensitivitySummary"]["caseCount"], 486)
        for name, text in first.items():
            self.assertEqual((ROOT / "research" / name).read_text(), text)

    def test_csv_emissions_preserve_delivery_and_origin_headroom_denominators(self):
        data = json.loads((ROOT / "research/inputs.json").read_text())
        result, grid = model.build_results(data, "test")
        cases = result["durationCases"] + result["routeCases"] + grid
        rows = list(csv.DictReader(io.StringIO(model.csv_text(cases))))
        for case, row in zip(cases, rows):
            local = case["localInterruption"]
            local_burn = float(row["localAdditionalBurnT"])
            local_co2 = float(row["localAdditionalCo2T"])
            self.assertAlmostEqual(local_burn, local["additionalBurnT"], places=10)
            self.assertAlmostEqual(local_co2, local["additionalCo2T"], places=10)
            self.assertAlmostEqual(float(row["localExtraOriginUsedT"]) - local_burn,
                                   float(row["localDestinationUpliftDisplacedT"]), places=10)
            self.assertAlmostEqual(local_co2, local_burn * 3.16, places=10)
        headline = next(row for row in rows if float(row["durationH"]) == 4
                        and row["model"] == "linear" and float(row["carbonUsdPerTCo2"]) == 0)
        self.assertAlmostEqual(float(headline["additionalCo2T"]), .514418604651, places=10)
        self.assertAlmostEqual(float(headline["localAdditionalCo2T"]), .4424, places=10)
        self.assertAlmostEqual(float(headline["localAdditionalBurnT"]), .14, places=10)

    def test_reported_envelopes_match_enumerated_cases_without_probability_claim(self):
        data = json.loads((ROOT / "research/inputs.json").read_text())
        result, grid = model.build_results(data, "test")
        for route in result["routeRanges"]:
            self.assertIn("not_confidence_interval", route["rangeClassification"])
            for method in ("linear", "exponential"):
                premiums = [r["breakEvenPremiumPct"] for r in grid if r["routeId"] == route["routeId"]
                            and r["model"] == method and r["carbonUsdPerTCo2"] == 0]
                self.assertEqual(route[method]["premiumPctMin"], min(premiums))
                self.assertEqual(route[method]["premiumPctMax"], max(premiums))
                self.assertEqual(route[method]["caseCount"], 27)

    def test_cli_check_does_not_rewrite_or_accept_changed_results(self):
        with tempfile.TemporaryDirectory() as temp:
            self.assertEqual(model.main(["--output-dir", temp]), 0)
            before = {p.name:p.read_bytes() for p in Path(temp).iterdir()}
            self.assertEqual(model.main(["--output-dir", temp, "--check"]), 0)
            self.assertEqual(before, {p.name:p.read_bytes() for p in Path(temp).iterdir()})
            (Path(temp) / "results.csv").write_text("incorrect\n")
            self.assertEqual(model.main(["--output-dir", temp, "--check"]), 1)


if __name__ == "__main__":
    unittest.main()
