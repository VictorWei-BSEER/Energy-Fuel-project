#!/usr/bin/env python3
"""Reproduce conditional tankering thresholds from frozen, classified inputs.

Standard library only. Run ``python3 research/model.py`` to regenerate outputs,
or append ``--check`` to verify that checked-in outputs match these inputs.
No network, live quotes, aircraft dispatch calculation or optimization occurs.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import itertools
import json
import math
from pathlib import Path
import sys

MODEL_VERSION = "1.0.0"
HERE = Path(__file__).resolve().parent


def finite_number(value, name: str, *, positive=False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    if value < 0 or positive and value <= 0:
        raise ValueError(f"{name} must be {'positive' if positive else 'nonnegative'}")
    return float(value)


def retention_fraction(duration_h: float, k_per_hour: float, model="linear") -> float:
    """Fraction of marginal origin uplift remaining on arrival, dimensionless."""
    duration = finite_number(duration_h, "duration_h")
    coefficient = finite_number(k_per_hour, "k_per_hour")
    product = duration * coefficient
    if not math.isfinite(product):
        raise ValueError("duration times coefficient is outside the numerical domain")
    if model == "linear":
        retained = 1.0 - product
    elif model == "exponential":
        retained = math.exp(-product)
    else:
        raise ValueError("model must be linear or exponential")
    if not 0 < retained <= 1:
        raise ValueError("retention must be positive; the linear domain requires k*t < 1")
    return retained


def transfer_for_delivery(required_delivery_t, duration_h, k_per_hour, model="linear", co2_factor=3.16):
    """Compare equal useful fuel at destination, holding the mission unchanged."""
    quantity = finite_number(required_delivery_t, "required_delivery_t")
    co2 = finite_number(co2_factor, "co2_factor")
    retained = retention_fraction(duration_h, k_per_hour, model)
    uplift = quantity / retained
    burn = uplift - quantity
    emissions = co2 * burn
    if not all(math.isfinite(value) for value in (uplift, burn, emissions)):
        raise ValueError("fuel quantities exceed the finite numerical domain")
    return {"requiredDeliveryT": quantity, "retentionFraction": retained,
            "extraOriginUpliftT": uplift, "additionalBurnT": burn,
            "additionalCo2T": emissions}


def break_even_ratio(duration_h, k_per_hour, *, origin_price=1000, carbon_price=0,
                     extra_cost_per_delivered_t=0, model="linear", co2_factor=3.16):
    """Required destination/origin price ratio; f is per useful delivered tonne."""
    origin = finite_number(origin_price, "origin_price", positive=True)
    carbon = finite_number(carbon_price, "carbon_price")
    fee = finite_number(extra_cost_per_delivered_t, "extra_cost_per_delivered_t")
    co2 = finite_number(co2_factor, "co2_factor")
    retained = retention_fraction(duration_h, k_per_hour, model)
    ratio = 1 / retained + co2 * carbon / origin * (1 - retained) / retained + fee / origin
    if not math.isfinite(ratio):
        raise ValueError("threshold exceeds the finite numerical domain")
    return ratio


def incremental_benefit(required_delivery_t, duration_h, k_per_hour, *, origin_price,
                        destination_price, carbon_price=0, extra_cost_per_delivered_t=0,
                        model="linear", co2_factor=3.16):
    origin = finite_number(origin_price, "origin_price", positive=True)
    destination = finite_number(destination_price, "destination_price")
    carbon = finite_number(carbon_price, "carbon_price")
    fee = finite_number(extra_cost_per_delivered_t, "extra_cost_per_delivered_t")
    flow = transfer_for_delivery(required_delivery_t, duration_h, k_per_hour, model, co2_factor)
    value = (destination * flow["requiredDeliveryT"] - origin * flow["extraOriginUpliftT"]
             - carbon * flow["additionalCo2T"] - fee * flow["requiredDeliveryT"])
    if not math.isfinite(value):
        raise ValueError("incremental benefit exceeds the finite numerical domain")
    return value


def local_interruption(required_gap_t, extra_origin_headroom_t, duration_h, k_per_hour,
                       model="linear", co2_factor=3.16):
    """Conditional displaced uplift; do not consume headroom beyond the fuel gap."""
    need = finite_number(required_gap_t, "required_gap_t")
    headroom = finite_number(extra_origin_headroom_t, "extra_origin_headroom_t")
    co2 = finite_number(co2_factor, "co2_factor")
    retained = retention_fraction(duration_h, k_per_hour, model)
    used = min(headroom, need / retained)
    displaced = min(need, used * retained)
    burn = used - displaced
    if not all(math.isfinite(value) for value in (used, displaced, burn, burn * co2)):
        raise ValueError("interruption quantities exceed the finite numerical domain")
    return {"requiredGapT": need, "extraOriginHeadroomT": headroom,
            "extraOriginUsedT": used, "destinationUpliftDisplacedT": displaced,
            "gapRemainingT": max(0.0, need - displaced), "additionalBurnT": burn,
            "additionalCo2T": burn * co2}


def great_circle_km(lat_a, lon_a, lat_b, lon_b, radius_km=6371.0088):
    coordinates = (lat_a, lon_a, lat_b, lon_b)
    if any(isinstance(x, bool) or not isinstance(x, (float, int)) or not math.isfinite(x)
           for x in coordinates):
        raise ValueError("coordinates must be finite numeric WGS84 degrees")
    if not (-90 <= lat_a <= 90 and -90 <= lat_b <= 90 and
            -180 <= lon_a <= 180 and -180 <= lon_b <= 180):
        raise ValueError("coordinates outside WGS84 latitude/longitude bounds")
    radius = finite_number(radius_km, "radius_km", positive=True)
    a, b = math.radians(lat_a), math.radians(lat_b)
    dlat, dlon = b - a, math.radians(lon_b - lon_a)
    hav = math.sin(dlat / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(min(1.0, max(0.0, hav))))


def make_case(inputs, *, case_id, duration_h, coefficient, carbon, model,
              route=None, distance=None, speed=None, path_factor=None):
    parameters = inputs["parameters"]
    origin = parameters["originPriceScenarioUsdPerT"]["value"]
    fee = parameters["extraCostUsdPerDeliveredT"]["value"]
    quantity = parameters["requiredDeliveryT"]["value"]
    co2 = parameters["co2TonnesPerTonneFuel"]["value"]
    headroom = parameters["extraOriginHeadroomT"]["value"]
    threshold = break_even_ratio(duration_h, coefficient, origin_price=origin,
                                carbon_price=carbon, extra_cost_per_delivered_t=fee,
                                model=model, co2_factor=co2)
    flow = transfer_for_delivery(quantity, duration_h, coefficient, model, co2)
    result = {"id": case_id, "resultClassification": "conditional_scenario",
              "durationH": duration_h, "model": model, "kPerHour": coefficient,
              "originPriceScenarioUsdPerT": origin, "carbonUsdPerTCo2": carbon,
              "extraCostUsdPerDeliveredT": fee,
              **flow, "breakEvenPriceRatio": threshold,
              "breakEvenPremiumPct": 100 * (threshold - 1),
              "localInterruption": local_interruption(quantity, headroom, duration_h,
                                                       coefficient, model, co2),
              "sharedQuota": {"baselineRegionalUseT": quantity,
                              "tankeringRegionalUseT": flow["extraOriginUpliftT"],
                              "additionalRegionalUseT": flow["additionalBurnT"]}}
    if route is not None:
        result.update({"routeId": route["id"], "origin": route["origin"],
                       "destination": route["destination"], "distanceKm": distance,
                       "speedKph": speed, "pathFactor": path_factor,
                       "durationClassification": "derived_from_scenario_speed_and_path"})
    else:
        result["durationClassification"] = "controlled_scenario"
    return result


def build_results(inputs, inputs_sha256):
    if inputs.get("schemaVersion") != 1:
        raise ValueError("Unsupported input schema")
    p = inputs["parameters"]
    airports = {airport["iata"]: airport for airport in inputs["airports"]}
    if len(airports) != len(inputs["airports"]):
        raise ValueError("Duplicate airport identifiers")
    k = p["burnCoefficientPerHour"]["central"]
    carbon_values = p["carbonUsdPerTCo2"]["values"]
    models = p["models"]["values"]
    duration_cases = [make_case(inputs, case_id=f"duration-{duration:g}h-{model}-c{carbon:g}",
                               duration_h=duration, coefficient=k, carbon=carbon, model=model)
                      for duration, model, carbon in itertools.product(
                          p["controlledDurationH"]["values"], models, carbon_values)]
    route_cases, sensitivity, ranges = [], [], []
    for route in inputs["routes"]:
        origin, destination = airports[route["origin"]], airports[route["destination"]]
        distance = great_circle_km(origin["lat"], origin["lon"], destination["lat"],
                                   destination["lon"], p["earthRadiusKm"]["value"])
        speed, path = p["speedKph"]["central"], p["pathFactor"]["central"]
        finite_number(speed, "speedKph", positive=True)
        duration = distance * finite_number(path, "pathFactor", positive=True) / speed
        for model, carbon in itertools.product(models, carbon_values):
            route_cases.append(make_case(inputs, case_id=f"{route['id']}-{model}-c{carbon:g}",
                                         duration_h=duration, coefficient=k, carbon=carbon,
                                         model=model, route=route, distance=distance,
                                         speed=speed, path_factor=path))
        for coefficient, speed, path, carbon, model in itertools.product(
                p["burnCoefficientPerHour"]["values"], p["speedKph"]["values"],
                p["pathFactor"]["values"], carbon_values, models):
            finite_number(speed, "speedKph", positive=True)
            duration = distance * finite_number(path, "pathFactor", positive=True) / speed
            case_id = f"{route['id']}-{model}-k{coefficient:g}-v{speed:g}-r{path:g}-c{carbon:g}"
            sensitivity.append(make_case(inputs, case_id=case_id, duration_h=duration,
                                        coefficient=coefficient, carbon=carbon, model=model,
                                        route=route, distance=distance, speed=speed, path_factor=path))
        route_range = {"routeId": route["id"], "distanceKm": distance,
                       "rangeClassification": "finite_scenario_envelope_not_confidence_interval"}
        for model in models:
            rows = [row for row in sensitivity if row["routeId"] == route["id"]
                    and row["model"] == model and row["carbonUsdPerTCo2"] == 0]
            route_range[model] = {
                "premiumPctMin": min(row["breakEvenPremiumPct"] for row in rows),
                "premiumPctMax": max(row["breakEvenPremiumPct"] for row in rows),
                "durationHMin": min(row["durationH"] for row in rows),
                "durationHMax": max(row["durationH"] for row in rows),
                "additionalCo2TMin": min(row["additionalCo2T"] for row in rows),
                "additionalCo2TMax": max(row["additionalCo2T"] for row in rows),
                "caseCount": len(rows), "carbonUsdPerTCo2": 0}
        ranges.append(route_range)
    headline = next(row for row in duration_cases
                    if row["durationH"] == 4 and row["model"] == "linear"
                    and row["carbonUsdPerTCo2"] == 0)
    results = {
        "meta": {"schemaVersion": 1, "modelVersion": MODEL_VERSION,
                 "researchDate": inputs["researchDate"], "inputsSha256": inputs_sha256,
                 "sourceSnapshotSha256": inputs["airportSnapshot"]["snapshotSha256"],
                 "classificationNotes": inputs["outputInterpretation"],
                 "counterfactual": inputs["counterfactual"],
                 "units": {"fuel": "metric tonnes", "duration": "hours", "distance": "km",
                           "additionalCo2": "tonnes direct combustion CO2", "money": "USD",
                           "priceRatio": "destination/origin, dimensionless",
                           "premium": "percent above origin price"},
                 "formula": {"linearRetention": "a = 1 - k*t", "exponentialRetention": "a = exp(-k*t)",
                             "requiredOriginUplift": "X = q/a", "additionalBurn": "X-q",
                             "directCO2": "3.16*(X-q)",
                             "breakEvenPriceRatio": "1/a + (3.16*c/pA)*(1-a)/a + f/pA",
                             "boundedUpliftDisplacement": "a * min(Xmax, qNeed/a)"}},
        "headline": headline, "durationCases": duration_cases, "routeCases": route_cases,
        "routeRanges": ranges,
        "sensitivitySummary": {"caseCount": len(sensitivity), "routeCount": len(inputs["routes"]),
                               "dimensions": {"kPerHour": p["burnCoefficientPerHour"]["values"],
                                              "speedKph": p["speedKph"]["values"],
                                              "pathFactor": p["pathFactor"]["values"],
                                              "carbonUsdPerTCo2": carbon_values, "models": models},
                               "csvFile": "sensitivity.csv",
                               "interpretation": "Exhaustive finite factorial grid, not a probability distribution."}}
    return results, sensitivity


CSV_FIELDS = ["id", "resultClassification", "routeId", "origin", "destination", "distanceKm",
              "durationH", "durationClassification", "model", "kPerHour", "speedKph", "pathFactor",
              "originPriceScenarioUsdPerT", "carbonUsdPerTCo2", "extraCostUsdPerDeliveredT",
              "requiredDeliveryT", "retentionFraction", "extraOriginUpliftT", "additionalBurnT",
              "additionalCo2T", "breakEvenPriceRatio", "breakEvenPremiumPct",
              "localGapRequiredT", "localExtraOriginHeadroomT", "localExtraOriginUsedT",
              "localDestinationUpliftDisplacedT", "localGapRemainingT",
              "localAdditionalBurnT", "localAdditionalCo2T",
              "sharedQuotaAdditionalUseT"]


def csv_text(cases):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    for case in cases:
        row = {key: case.get(key, "") for key in CSV_FIELDS}
        local = case["localInterruption"]
        row.update({"localGapRequiredT": local["requiredGapT"],
                    "localExtraOriginHeadroomT": local["extraOriginHeadroomT"],
                    "localExtraOriginUsedT": local["extraOriginUsedT"],
                    "localDestinationUpliftDisplacedT": local["destinationUpliftDisplacedT"],
                    "localGapRemainingT": local["gapRemainingT"],
                    "localAdditionalBurnT": local["additionalBurnT"],
                    "localAdditionalCo2T": local["additionalCo2T"],
                    "sharedQuotaAdditionalUseT": case["sharedQuota"]["additionalRegionalUseT"]})
        writer.writerow({key: format(value, ".12g") if isinstance(value, float) else value
                         for key, value in row.items()})
    return buffer.getvalue()


def artifacts(input_bytes):
    inputs = json.loads(input_bytes)
    results, sensitivity = build_results(inputs, hashlib.sha256(input_bytes).hexdigest())
    return {"results.json": json.dumps(results, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
            "results.csv": csv_text(results["durationCases"] + results["routeCases"]),
            "sensitivity.csv": csv_text(sensitivity)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, default=HERE / "inputs.json")
    parser.add_argument("--output-dir", type=Path, default=HERE)
    parser.add_argument("--check", action="store_true", help="Compare without writing outputs")
    args = parser.parse_args(argv)
    try:
        output = artifacts(args.inputs.read_bytes())
        if args.check:
            mismatches = [name for name, text in output.items()
                          if not (args.output_dir / name).is_file()
                          or (args.output_dir / name).read_text(encoding="utf-8") != text]
            if mismatches:
                raise ValueError("Reproduction mismatch: " + ", ".join(mismatches))
            print("Verified deterministic results.json, results.csv and sensitivity.csv.")
        else:
            args.output_dir.mkdir(parents=True, exist_ok=True)
            for name, text in output.items():
                (args.output_dir / name).write_text(text, encoding="utf-8")
            print("Wrote 36 central cases and 486 sensitivity cases from frozen inputs.")
        return 0
    except (ValueError, KeyError, OSError, TypeError) as error:
        print(f"Research model failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
