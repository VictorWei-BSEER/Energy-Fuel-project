"""Independent SciPy/HiGHS check of the coupled aircraft and supply-chain LP.

The reference uses uplift and landing-fuel variables instead of the production
engine's extra-departure-fuel variables. NumPy/SciPy are optional audit-only deps.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
import subprocess

import numpy as np
from scipy.optimize import linprog

ROOT = Path(__file__).resolve().parents[1]


def at(value, stage):
    return value[stage] if isinstance(value, list) else value


class LinearModel:
    def __init__(self):
        self.names, self.cost, self.bounds = [], [], []
        self.equalities, self.limits = [], []

    def variable(self, name, cost=0, lower=0, upper=None):
        self.names.append(name)
        self.cost.append(cost)
        self.bounds.append((lower, upper))
        return name

    def equal(self, coefficients, rhs):
        self.equalities.append((coefficients, rhs))

    def limit(self, coefficients, rhs):
        self.limits.append((coefficients, rhs))

    def solve(self):
        indices = {name: i for i, name in enumerate(self.names)}

        def matrices(rows):
            if not rows:
                return None, None
            matrix = np.zeros((len(rows), len(indices)))
            rhs = np.array([row[1] for row in rows], dtype=float)
            for i, (coefficients, _) in enumerate(rows):
                for name, value in coefficients.items():
                    matrix[i, indices[name]] = value
            return matrix, rhs

        a_eq, b_eq = matrices(self.equalities)
        a_ub, b_ub = matrices(self.limits)
        result = linprog(self.cost, A_ub=a_ub, b_ub=b_ub, A_eq=a_eq,
                         b_eq=b_eq, bounds=self.bounds, method="highs")
        if result.status == 2:
            return {"feasible": False}
        if not result.success:
            raise AssertionError(f"Independent LP failed: {result.message}")
        return {"feasible": True, "cost": float(result.fun),
                "values": dict(zip(self.names, map(float, result.x)))}


def reference(input_data, baseline=False):
    legs, chain = input_data["legs"], input_data["supplyChain"]
    n, aircraft = len(legs), input_data["aircraft"]
    model = LinearModel()
    airports = {a["code"]: a for a in chain["airports"]}
    landing_target, previous = [], input_data["initialFuelT"]
    for leg in legs:
        minimum = leg.get("taxiBurnT", 0) + leg["baseBurnT"] + leg["reserveT"]
        departure = max(previous, minimum)
        previous = leg["reserveT"] + (1 - leg["carryBurnRate"]) * (departure - minimum)
        landing_target.append(previous)

    for i, leg in enumerate(legs):
        airport = airports[leg["from"]]
        service = airport.get("intoPlaneUsdPerT", 0) + airport.get("taxAdjustmentUsdPerT", 0)
        model.variable(f"uplift_{i}", service, upper=leg.get("maxUpliftT"))
        model.variable(f"landing_{i}", lower=leg["reserveT"],
                       upper=aircraft["maxLandingWeightT"] - leg["zeroFuelWeightT"])
    for airport in chain["airports"]:
        for t in range(n):
            model.variable(f"stock_{airport['code']}_{t}", airport.get("holdingUsdPerTPerStage", 0),
                           airport.get("reserveT", 0), airport["storageCapacityT"])

    # Independently impose aircraft conservation in landing-fuel coordinates.
    for i, leg in enumerate(legs):
        eta = 1 - leg["carryBurnRate"]
        coefficients = {f"uplift_{i}": 1, f"landing_{i}": -1 / eta}
        rhs = leg.get("taxiBurnT", 0) + leg["baseBurnT"] + leg["reserveT"] - leg["reserveT"] / eta
        departure = {f"uplift_{i}": 1}
        opening = input_data["initialFuelT"] if i == 0 else 0
        if i:
            coefficients[f"landing_{i-1}"] = 1
            departure[f"landing_{i-1}"] = 1
        model.equal(coefficients, rhs - opening)
        model.limit(departure, aircraft["tankCapacityT"] - opening)
        model.limit(departure, aircraft["maxTakeoffWeightT"] - leg["zeroFuelWeightT"] + leg.get("taxiBurnT", 0) - opening)
        if baseline:
            model.equal({f"landing_{i}": 1}, landing_target[i])
    model.equal({f"landing_{n-1}": 1}, landing_target[-1])

    flows = []
    if chain["mode"] == "delivered":
        for r, offer in enumerate(chain.get("deliveredOffers", [])):
            route_variables = {}
            for t in range(n):
                name = model.variable(f"delivery_{r}_{t}", at(offer["priceUsdPerT"], t), upper=at(offer["capacityT"], t))
                route_variables[name] = 1
                flows.append({"name": name, "airport": offer["airport"], "arrival": t})
            if "totalCapacityT" in offer:
                model.limit(route_variables, offer["totalCapacityT"])
    else:
        suppliers = {s["id"]: s for s in chain["suppliers"]}
        supplier_flows = {supplier: [[] for _ in range(n)] for supplier in suppliers}
        for r, route in enumerate(chain["routes"]):
            source = suppliers[route["supplierId"]]
            route_variables = {}
            for t in range(n):
                arrival = t + route["leadTimeStages"]
                if arrival >= n:
                    continue
                cost = at(source["priceUsdPerT"], t) + route.get("freightUsdPerT", 0) + route.get("handlingUsdPerT", 0) + route.get("basisAdjustmentUsdPerT", 0)
                name = model.variable(f"shipment_{r}_{t}", cost, upper=at(route["capacityT"], t))
                route_variables[name] = 1
                supplier_flows[route["supplierId"]][t].append(name)
                flows.append({"name": name, "airport": route["airport"], "arrival": arrival})
            if "totalCapacityT" in route:
                model.limit(route_variables, route["totalCapacityT"])
        for supplier_id, periods in supplier_flows.items():
            for t, names in enumerate(periods):
                model.limit({name: 1 for name in names}, at(suppliers[supplier_id]["capacityT"], t))
            if "totalCapacityT" in suppliers[supplier_id]:
                model.limit({name: 1 for names in periods for name in names}, suppliers[supplier_id]["totalCapacityT"])

    for airport in chain["airports"]:
        code = airport["code"]
        for t in range(n):
            opening = airport["initialInventoryT"] if t == 0 else 0
            balance = {f"stock_{code}_{t}": 1}
            receipt = {}
            if t:
                balance[f"stock_{code}_{t-1}"] = -1
                receipt[f"stock_{code}_{t-1}"] = 1
            for flow in flows:
                if flow["airport"] == code and flow["arrival"] == t:
                    balance[flow["name"]] = -1
                    receipt[flow["name"]] = 1
            if legs[t]["from"] == code:
                balance[f"uplift_{t}"] = 1
            model.equal(balance, opening)
            model.limit(receipt, airport["storageCapacityT"] - opening)
        model.equal({f"stock_{code}_{n-1}": 1}, airport.get("terminalInventoryT", airport["initialInventoryT"]))
    return model.solve()


def example():
    legs = [
        {"from": "PVG", "to": "ICN", "priceUsdPerT": 1, "baseBurnT": 10,
         "taxiBurnT": 0, "reserveT": 0, "carryBurnRate": .1, "zeroFuelWeightT": 40},
        {"from": "ICN", "to": "HND", "priceUsdPerT": 9999, "baseBurnT": 10,
         "taxiBurnT": 0, "reserveT": 0, "carryBurnRate": 0, "zeroFuelWeightT": 40},
    ]
    return {"initialFuelT": 0, "aircraft": {"tankCapacityT": 50, "maxTakeoffWeightT": 100, "maxLandingWeightT": 100}, "legs": legs,
            "supplyChain": {"mode": "modeled", "suppliers": [
                {"id": "CHEAP", "priceUsdPerT": 100, "capacityT": 100, "totalCapacityT": 100},
                {"id": "DEAR", "priceUsdPerT": 200, "capacityT": 100, "totalCapacityT": 100}],
                "routes": [{"supplierId": "CHEAP", "airport": "PVG", "capacityT": 100, "leadTimeStages": 0, "freightUsdPerT": 0},
                           {"supplierId": "DEAR", "airport": "ICN", "capacityT": 100, "leadTimeStages": 0, "freightUsdPerT": 0}],
                "airports": [{"code": code, "initialInventoryT": 0, "terminalInventoryT": 0, "storageCapacityT": 100, "intoPlaneUsdPerT": 0} for code in ["PVG", "ICN"]]}}


def hand_cases():
    cases = []

    def add(name, data, expected_cost=None, expected_baseline=None):
        cases.append((name, data, expected_cost, expected_baseline))

    add("two-leg full tankering", example(), 100 * (10 + 10 / .9), 3000)
    data = example()
    data["supplyChain"]["suppliers"][0]["totalCapacityT"] = 15
    add("cheap horizon allocation", data, 2600, 3000)
    data = example()
    data["supplyChain"]["suppliers"][0]["priceUsdPerT"] = 1000
    data["supplyChain"]["suppliers"][1]["priceUsdPerT"] = 100
    add("upstream prices override misleading leg references", data, 11000, 11000)
    data = example()
    data["supplyChain"]["routes"][1]["capacityT"] = 0
    add("tankering feasible but minimum-uplift baseline infeasible", data, 100 * (10 + 10 / .9), None)
    data = example()
    data["supplyChain"]["routes"][0]["leadTimeStages"] = 1
    add("late first-stage supply cannot fuel first flight", data, None, None)
    data = example()
    data["supplyChain"]["suppliers"] = [{"id": "SHARED", "priceUsdPerT": 100, "capacityT": 100, "totalCapacityT": 19}]
    for route in data["supplyChain"]["routes"]:
        route["supplierId"] = "SHARED"
    add("one shared allocation cannot serve two independent 10t needs", data, None, None)
    data = example()
    data["supplyChain"]["mode"] = "delivered"
    data["supplyChain"]["suppliers"] = []
    data["supplyChain"]["routes"] = []
    data["supplyChain"]["deliveredOffers"] = [{"airport": code, "priceUsdPerT": price, "capacityT": 100, "totalCapacityT": 100} for code, price in [("PVG", 100), ("ICN", 200)]]
    add("all-inclusive delivered quote charged once", data, 100 * (10 + 10 / .9), 3000)
    data = example()
    data["supplyChain"]["airports"][0].update(initialInventoryT=20, terminalInventoryT=20)
    data["supplyChain"]["routes"][0]["leadTimeStages"] = 1
    add("opening stock must be replenished to its identical terminal target", data, 2200, 3000)
    data = example()
    data["supplyChain"]["routes"][0]["basisAdjustmentUsdPerT"] = -80
    data["supplyChain"]["airports"][0].update(intoPlaneUsdPerT=90, taxAdjustmentUsdPerT=-10)
    add("signed adjustments reconcile to the same positive all-in price", data, 100 * (10 + 10 / .9), 3000)
    data = example()
    data["legs"][0]["carryBurnRate"] = 0
    data["legs"][1]["to"] = "PVG"
    data["legs"].append({**data["legs"][0], "to": "HND"})
    data["supplyChain"]["suppliers"][0]["totalCapacityT"] = 10
    add("repeated airport shares one allocation across both visits", data, 5000, None)
    return cases


def random_cases(count, seed):
    rng = random.Random(seed)
    codes = ["PVG", "ICN", "HND"]
    cases = []
    for case in range(count):
        n = rng.randint(1, 4)
        route = [rng.choice(codes)]
        for _ in range(n):
            route.append(rng.choice([code for code in codes if code != route[-1]]))
        legs = [{"from": route[i], "to": route[i+1], "priceUsdPerT": rng.randint(1, 9999),
                 "baseBurnT": rng.uniform(3, 15), "taxiBurnT": rng.uniform(0, .4),
                 "reserveT": rng.uniform(2, 6), "carryBurnRate": rng.choice([0, .02, .06, .15]),
                 "zeroFuelWeightT": rng.uniform(45, 60), "maxUpliftT": rng.uniform(5, 50)} for i in range(n)]
        origins = list(dict.fromkeys(route[:-1]))
        airports = []
        for code in origins:
            opening = rng.choice([0, rng.uniform(0, 12)])
            airports.append({"code": code, "initialInventoryT": opening, "terminalInventoryT": opening,
                             "storageCapacityT": rng.uniform(30, 100), "reserveT": 0,
                             "intoPlaneUsdPerT": rng.uniform(0, 25), "holdingUsdPerTPerStage": rng.choice([0, .5, 3]),
                             "taxAdjustmentUsdPerT": rng.uniform(-5, 10)})
        suppliers = [{"id": f"S{s}", "priceUsdPerT": [rng.uniform(80, 300) for _ in range(n)],
                      "capacityT": [rng.choice([0, rng.uniform(10, 70)]) for _ in range(n)],
                      "totalCapacityT": rng.uniform(10, 140)} for s in range(2)]
        routes = [{"supplierId": source["id"], "airport": code,
                   "capacityT": [rng.uniform(0, 50) for _ in range(n)], "totalCapacityT": rng.uniform(10, 100),
                   "leadTimeStages": rng.choice([0, 0, 0, 1, 2]), "freightUsdPerT": rng.uniform(0, 30),
                   "handlingUsdPerT": rng.uniform(0, 8), "basisAdjustmentUsdPerT": rng.uniform(-10, 20)} for source in suppliers for code in origins]
        data = {"initialFuelT": rng.uniform(0, 15),
                "aircraft": {"tankCapacityT": rng.uniform(30, 80), "maxTakeoffWeightT": rng.uniform(75, 140), "maxLandingWeightT": rng.uniform(75, 120)},
                "legs": legs, "supplyChain": {"mode": "modeled", "suppliers": suppliers, "routes": routes, "airports": airports}}
        if case % 4 == 0:
            data["supplyChain"].update(mode="delivered", suppliers=[], routes=[],
                deliveredOffers=[{"airport": code, "priceUsdPerT": [rng.uniform(100, 300) for _ in range(n)],
                                  "capacityT": [rng.uniform(5, 50) for _ in range(n)], "totalCapacityT": rng.uniform(10, 100)} for code in origins])
            for airport in airports:
                airport["intoPlaneUsdPerT"] = 0
                airport["taxAdjustmentUsdPerT"] = 0
                airport["holdingUsdPerTPerStage"] = 0
        cases.append((f"random {case}", data, "random", "random"))
    return cases


def independent_residuals(data, result):
    """Reconstruct costs and conservation from exported physical decisions."""
    chain, n, errors = data["supplyChain"], len(data["legs"]), []
    plan = result.get("supplyChain") or {}
    source_by_id = {row["id"]: row for row in chain.get("suppliers", [])}
    routes = {row.get("id", f"route-{i+1}"): row for i, row in enumerate(chain.get("routes", []))}
    offers = {row.get("id", f"offer-{i+1}"): row for i, row in enumerate(chain.get("deliveredOffers", []))}
    arrivals = {(row["code"], t): 0 for row in chain["airports"] for t in range(n)}
    route_usage, source_usage, offer_usage = {}, {}, {}
    cost = 0
    tol = 1e-6
    for shipment in plan.get("shipments", []):
        quantity = shipment["quantityT"]
        departure, arrival = shipment["departureStage"] - 1, shipment["arrivalStage"] - 1
        if quantity < -tol or not 0 <= departure <= arrival < n:
            errors.append("invalid shipment timing or quantity")
            continue
        if chain["mode"] == "modeled":
            route = routes[shipment["routeId"]]
            supplier_id = route["supplierId"]
            source = source_by_id[supplier_id]
            if arrival != departure + route["leadTimeStages"] or shipment["airport"] != route["airport"]:
                errors.append("shipment lead time or destination mismatch")
            route_usage[(shipment["routeId"], departure)] = route_usage.get((shipment["routeId"], departure), 0) + quantity
            source_usage[(supplier_id, departure)] = source_usage.get((supplier_id, departure), 0) + quantity
            unit = at(source["priceUsdPerT"], departure) + route.get("freightUsdPerT", 0) + route.get("handlingUsdPerT", 0) + route.get("basisAdjustmentUsdPerT", 0)
        else:
            offer = offers[shipment["offerId"]]
            if arrival != departure or shipment["airport"] != offer["airport"]:
                errors.append("direct offer timing or destination mismatch")
            offer_usage[(shipment["offerId"], departure)] = offer_usage.get((shipment["offerId"], departure), 0) + quantity
            unit = at(offer["priceUsdPerT"], departure)
        if abs(shipment["costUsd"] - quantity * unit) > 1e-4:
            errors.append("shipment cost does not match input terms")
        cost += quantity * unit
        arrivals[(shipment["airport"], arrival)] += quantity
    for rows, usage, label in [(source_by_id, source_usage, "supplier"), (routes, route_usage, "route"), (offers, offer_usage, "offer")]:
        for identifier, row in rows.items():
            total = 0
            for t in range(n):
                used = usage.get((identifier, t), 0)
                total += used
                if used > at(row["capacityT"], t) + tol:
                    errors.append(f"shared {label} stage capacity exceeded")
            if "totalCapacityT" in row and total > row["totalCapacityT"] + tol:
                errors.append(f"shared {label} horizon capacity exceeded")
    reported = {(row["airport"], row["stage"] - 1): row for row in plan.get("airportInventory", [])}
    if len(reported) != len(chain["airports"]) * n:
        errors.append("missing airport inventory events")
    for airport in chain["airports"]:
        opening = airport["initialInventoryT"]
        for t in range(n):
            row = reported.get((airport["code"], t))
            if row is None:
                continue
            arriving = arrivals[(airport["code"], t)]
            uplift = result["legs"][t]["upliftT"] if data["legs"][t]["from"] == airport["code"] else 0
            closing = opening + arriving - uplift
            if any(abs(row[key] - expected) > tol for key, expected in [("openingT", opening), ("arrivalsT", arriving), ("upliftT", uplift), ("closingT", closing)]):
                errors.append("airport stock-to-aircraft conservation mismatch")
            if opening + arriving > airport["storageCapacityT"] + tol or closing < airport.get("reserveT", 0) - tol:
                errors.append("airport receipt storage or reserve violated")
            cost += closing * airport.get("holdingUsdPerTPerStage", 0)
            cost += uplift * (airport.get("intoPlaneUsdPerT", 0) + airport.get("taxAdjustmentUsdPerT", 0))
            opening = closing
        if abs(opening - airport.get("terminalInventoryT", airport["initialInventoryT"])) > tol:
            errors.append("terminal ground stock mismatch")
    if abs(cost - result["totalCostUsd"]) > 1e-4:
        errors.append("full objective does not reconcile to independent cash-flow reconstruction")
    if abs(sum(row["costUsd"] for row in result["legs"]) - result["totalCostUsd"]) > 1e-4:
        errors.append("allocated leg costs do not sum to full objective")
    return errors


def adversarial_cases():
    examples = []
    for factor in [1e-12, 1e-9, 1, 1e6, 1e12]:
        data = example()
        data["initialFuelT"] *= factor
        for key in data["aircraft"]:
            data["aircraft"][key] *= factor
        for leg in data["legs"]:
            for key in ["baseBurnT", "taxiBurnT", "reserveT", "zeroFuelWeightT"]:
                leg[key] *= factor
            leg["priceUsdPerT"] /= factor
        for source in data["supplyChain"]["suppliers"]:
            source["priceUsdPerT"] /= factor
            source["capacityT"] *= factor
            source["totalCapacityT"] *= factor
        for route in data["supplyChain"]["routes"]:
            route["capacityT"] *= factor
        for airport in data["supplyChain"]["airports"]:
            for key in ["initialInventoryT", "terminalInventoryT", "storageCapacityT"]:
                airport[key] *= factor
        examples.append((f"mass scale {factor:g}", data, 100 * (10 + 10 / .9)))
    data = example()
    data["legs"] = data["legs"][:1]
    for key in ["suppliers", "routes", "airports"]:
        data["supplyChain"][key] = data["supplyChain"][key][:1]
    data["supplyChain"]["routes"][0]["basisAdjustmentUsdPerT"] = -200
    data["supplyChain"]["airports"][0].update(intoPlaneUsdPerT=110, terminalInventoryT=20)
    examples.append(("negative ground acquisition with positive all-in reference", data, "reject"))
    return examples


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=int, default=240)
    parser.add_argument("--seed", type=int, default=2026111301)
    parser.add_argument("--module", choices=["src/integrated-optimizer.js", "dist/integrated-optimizer.js"], default="src/integrated-optimizer.js")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    cases = hand_cases() + random_cases(args.cases, args.seed)
    adversarial = adversarial_cases()
    js = """import fs from 'node:fs';
const { optimizeIntegratedRotation } = await import(process.argv[1]);
const inputs=JSON.parse(fs.readFileSync(0,'utf8'));
const outputs=inputs.map(input=>{try{return optimizeIntegratedRotation(input);}catch(error){return {feasible:false,status:'threw',errors:[error.message]}}});
process.stdout.write(JSON.stringify(outputs));
"""
    process = subprocess.run(["node", "--input-type=module", "-e", js, (ROOT / args.module).as_uri()], cwd=ROOT,
                             input=json.dumps([case[1] for case in cases] + [case[1] for case in adversarial]), text=True, capture_output=True, check=True)
    outputs = json.loads(process.stdout)
    failures, maximum_cost_error = [], 0
    feasible_count, baseline_infeasible_count = 0, 0
    for (name, data, expected, expected_baseline), actual in zip(cases, outputs):
        optimal, baseline = reference(data), reference(data, baseline=True)
        if expected != "random":
            assert optimal["feasible"] == (expected is not None), (name, optimal)
            if expected is not None:
                assert math.isclose(optimal["cost"], expected, abs_tol=1e-6), (name, optimal, expected)
            assert baseline["feasible"] == (expected_baseline is not None), (name, baseline)
            if expected_baseline is not None:
                assert math.isclose(baseline["cost"], expected_baseline, abs_tol=1e-6), (name, baseline, expected_baseline)
        if actual.get("feasible") != optimal["feasible"]:
            failures.append({"case": name, "problem": "feasibility disagreement", "reference": optimal["feasible"], "actual": actual})
            continue
        if not optimal["feasible"]:
            if actual.get("totalCostUsd") is not None or actual.get("savingsUsd") is not None:
                failures.append({"case": name, "problem": "infeasible result retains financial claims"})
            continue
        feasible_count += 1
        for problem in independent_residuals(data, actual):
            failures.append({"case": name, "problem": problem})
        rows = actual.get("legs", [])
        if len(rows) != len(data["legs"]):
            failures.append({"case": name, "problem": "missing aircraft rows"})
        else:
            opening = data["initialFuelT"]
            for i, row in enumerate(rows):
                leg = data["legs"][i]
                uplift, landing = row["upliftT"], row["landingFuelT"]
                minimum = leg.get("taxiBurnT", 0) + leg["baseBurnT"] + leg["reserveT"]
                expected_burn = leg.get("taxiBurnT", 0) + leg["baseBurnT"] + leg["carryBurnRate"] * (opening + uplift - minimum)
                if min(uplift, landing - leg["reserveT"]) < -1e-6 or abs(opening + uplift - expected_burn - landing) > 1e-6:
                    failures.append({"case": name, "problem": "aircraft conservation or reserve failure", "leg": i})
                if abs(row["burnT"] - expected_burn) > 1e-6:
                    failures.append({"case": name, "problem": "reported burn disagrees with physics", "leg": i})
                opening = landing
            if abs(opening - optimal["values"][f"landing_{len(rows)-1}"]) > 1e-6:
                failures.append({"case": name, "problem": "terminal aircraft fuel mismatch"})
        delta = abs(actual["totalCostUsd"] - optimal["cost"])
        maximum_cost_error = max(maximum_cost_error, delta)
        if delta > 1e-4:
            failures.append({"case": name, "problem": "objective disagreement", "reference": optimal["cost"], "actual": actual["totalCostUsd"]})
        if not baseline["feasible"]:
            baseline_infeasible_count += 1
            if actual.get("savingsUsd") is not None:
                failures.append({"case": name, "problem": "savings against infeasible baseline"})
        elif actual.get("baseline", {}).get("feasible") is not True or abs(actual["baseline"]["totalCostUsd"] - baseline["cost"]) > 1e-4:
            failures.append({"case": name, "problem": "same-network baseline disagreement", "reference": baseline["cost"], "actual": actual.get("baseline")})
        else:
            expected_savings = baseline["cost"] - optimal["cost"]
            if actual.get("savingsUsd") is None or abs(actual["savingsUsd"] - expected_savings) > 1e-4:
                failures.append({"case": name, "problem": "savings reconciliation disagreement"})
    adversarial_results = []
    for (name, _, expected), actual in zip(adversarial, outputs[len(cases):]):
        if expected == "reject":
            passed = actual.get("status") == "invalid" and not actual.get("feasible") and actual.get("totalCostUsd") is None
        elif actual.get("feasible"):
            passed = abs(actual["totalCostUsd"] - expected) <= 1e-4
        else:
            passed = actual.get("status") == "numerical-error" and actual.get("totalCostUsd") is None and actual.get("savingsUsd") is None
        adversarial_results.append({"case": name, "status": actual.get("status"), "costUsd": actual.get("totalCostUsd"), "passed": passed})
        if not passed:
            failures.append({"case": name, "problem": "adversarial accounting or numerical guard failed", "actual": actual})
    report = {"module": args.module, "seed": args.seed, "cases": len(cases), "handDerivedCases": len(hand_cases()),
              "feasibleCases": feasible_count, "infeasibleCases": len(cases) - feasible_count,
              "feasibleOptimizationsWithInfeasibleBaseline": baseline_infeasible_count,
              "maximumObjectiveErrorUsd": maximum_cost_error, "adversarial": adversarial_results, "failures": failures}
    serialized = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(serialized + "\n")
    print(serialized)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
