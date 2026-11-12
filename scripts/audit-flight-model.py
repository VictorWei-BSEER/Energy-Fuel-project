#!/usr/bin/env python3
"""Independent flight-model comparison using uplift/landing variables and HiGHS.

Optional audit: Python 3.10+, NumPy/SciPy and Node.js on PATH.
Run: python3 scripts/audit-flight-model.py
Does not install dependencies, use the network or alter model outputs.
"""
import argparse
import json
from pathlib import Path
import random
import subprocess

try:
    import numpy as np
    from scipy.optimize import linprog
except ImportError as error:
    raise SystemExit("This optional independent audit requires NumPy and SciPy.") from error

ROOT = Path(__file__).resolve().parents[1]


def generate_cases(count, seed):
    random_source = random.Random(seed)
    cases = []
    for index in range(count):
        leg_count = 2 + index % 4
        tank = random_source.uniform(35, 160)
        zero_fuel_weight = random_source.uniform(90, 180)
        case = {
            "initialFuelT": random_source.uniform(0, tank * 1.05),
            "aircraft": {
                "tankCapacityT": tank,
                "maxTakeoffWeightT": zero_fuel_weight + random_source.uniform(25, 180),
                "maxLandingWeightT": zero_fuel_weight + random_source.uniform(15, 100),
            },
            "legs": [],
        }
        for position in range(leg_count):
            leg = {
                "from": f"A{position}",
                "to": f"A{position + 1}",
                "priceUsdPerT": random_source.choice([0, random_source.uniform(300, 2200)]),
                "baseBurnT": random_source.uniform(0, 45),
                "taxiBurnT": random_source.uniform(0, 1),
                "reserveT": random_source.uniform(0, 15),
                "carryBurnRate": random_source.choice([0, random_source.uniform(.001, .35), .95]),
                "zeroFuelWeightT": zero_fuel_weight + random_source.uniform(-10, 10),
            }
            if random_source.random() < .4:
                leg["maxUpliftT"] = random_source.choice([0, random_source.uniform(0, 100)])
            case["legs"].append(leg)
        cases.append(case)
    return cases


def reference_solution(case):
    """Use U_i (uplift) and L_i (landing fuel), not production extra-fuel variables."""
    legs = case["legs"]
    count = len(legs)
    aircraft = case["aircraft"]
    arrival = case["initialFuelT"]
    for leg in legs:
        loaded = max(arrival, leg["taxiBurnT"] + leg["baseBurnT"] + leg["reserveT"])
        extra = loaded - leg["taxiBurnT"] - leg["baseBurnT"] - leg["reserveT"]
        arrival = loaded - leg["taxiBurnT"] - leg["baseBurnT"] - leg["carryBurnRate"] * extra
    terminal_target = arrival

    objective = np.array([leg["priceUsdPerT"] for leg in legs] + [0] * count)
    equalities, equality_values = [], []
    inequalities, upper_values = [], []
    for position, leg in enumerate(legs):
        retained = 1 - leg["carryBurnRate"]
        conservation = np.zeros(2 * count)
        conservation[count + position] = 1
        conservation[position] = -retained
        value = leg["carryBurnRate"] * leg["reserveT"] - retained * (leg["taxiBurnT"] + leg["baseBurnT"])
        if position:
            conservation[count + position - 1] = -retained
        else:
            value += retained * case["initialFuelT"]
        equalities.append(conservation)
        equality_values.append(value)

        departure = np.zeros(2 * count)
        departure[position] = 1
        if position:
            departure[count + position - 1] = 1
        existing = 0 if position else case["initialFuelT"]
        inequalities.append(departure)
        upper_values.append(aircraft["tankCapacityT"] - existing)
        inequalities.append(departure)
        upper_values.append(aircraft["maxTakeoffWeightT"] - leg["zeroFuelWeightT"] + leg["taxiBurnT"] - existing)

    terminal = np.zeros(2 * count)
    terminal[-1] = 1
    equalities.append(terminal)
    equality_values.append(terminal_target)
    bounds = [(0, leg.get("maxUpliftT")) for leg in legs] + [
        (leg["reserveT"], aircraft["maxLandingWeightT"] - leg["zeroFuelWeightT"])
        for leg in legs
    ]
    if case["initialFuelT"] > aircraft["tankCapacityT"] or any(
        upper is not None and lower > upper for lower, upper in bounds
    ):
        return False, None, terminal_target

    result = linprog(
        objective, A_ub=inequalities, b_ub=upper_values,
        A_eq=equalities, b_eq=equality_values, bounds=bounds, method="highs",
    )
    if result.status not in (0, 2):
        raise RuntimeError(result.message)
    return result.status == 0, result, terminal_target


def audit(cases):
    javascript = """
        import fs from 'node:fs';
        import { optimizeRotation } from './dist/flight-optimizer.js';
        const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
        process.stdout.write(JSON.stringify(cases.map(optimizeRotation)));
    """
    process = subprocess.run(
        ["node", "--input-type=module", "-e", javascript], cwd=ROOT,
        input=json.dumps(cases), text=True, capture_output=True, check=True,
    )
    answers = json.loads(process.stdout)
    if len(answers) != len(cases):
        raise RuntimeError("The production optimizer did not return every case.")
    counts = {
        "cases": len(cases), "feasible": 0, "infeasible": 0,
        "feasibility_discrepancies": 0, "cost_discrepancies": 0,
        "max_absolute_cost_error_usd": 0, "balance_checks": 0,
    }
    failures = []
    for index, (case, answer) in enumerate(zip(cases, answers)):
        feasible, reference, terminal_target = reference_solution(case)
        counts["feasible" if feasible else "infeasible"] += 1
        if feasible != answer["feasible"]:
            counts["feasibility_discrepancies"] += 1
            failures.append({"index": index, "kind": "feasibility", "reference": feasible, "actual": answer})
            continue
        if not feasible:
            continue
        difference = abs(reference.fun - answer["totalCostUsd"])
        counts["max_absolute_cost_error_usd"] = max(counts["max_absolute_cost_error_usd"], difference)
        if difference > 1e-5:
            counts["cost_discrepancies"] += 1
            failures.append({"index": index, "kind": "cost", "expected": reference.fun, "actual": answer["totalCostUsd"]})
        mass = case["initialFuelT"] + answer["totalUpliftT"] - answer["totalBurnT"]
        if abs(mass - answer["finalFuelT"]) >= 1e-7 or abs(answer["finalFuelT"] - terminal_target) >= 1e-7:
            failures.append({"index": index, "kind": "rotation balance or terminal stock"})
        for position, leg in enumerate(answer["legs"]):
            residual = leg["arrivalFuelT"] + leg["upliftT"] - leg["burnT"] - leg["landingFuelT"]
            if abs(residual) >= 1e-7:
                failures.append({"index": index, "leg": position, "kind": "leg balance", "residual": residual})
            counts["balance_checks"] += 1
    return counts, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=int, default=600)
    parser.add_argument("--seed", type=int, default=20261113)
    arguments = parser.parse_args()
    if not 1 <= arguments.cases <= 10000:
        parser.error("--cases must be between 1 and 10000")
    counts, failures = audit(generate_cases(arguments.cases, arguments.seed))
    print(json.dumps({
        "seed": arguments.seed,
        "reference_solver": "scipy.optimize.linprog / HiGHS",
        "counts": counts, "failures": failures,
    }, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
