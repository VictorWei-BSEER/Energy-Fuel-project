# Multi-period procurement and distribution formulation

The implemented model is a continuous, single-product LP over 1–12 equal user-defined periods. All quantities are metric tonnes. Financial inputs and outputs use USD; transport factors use kg CO2e/tonne. Internal node identifiers are illustrative, not official port codes.

## Timing and decisions

For source i, destination j and departure period t, x(i,j,t) is the purchased/dispatched volume. A route with integer lead time L(i,j) arrives in period t+L. Variables whose arrival falls beyond the horizon are excluded. Purchases occur at dispatch, with no separately modeled source stock.

At each destination and period, I(j,t) is closing inventory and u(j,t) is demand not served on time. Opening inventory I(j,0) is already owned. Arrivals happen before consumption within each period. There is no starting cargo in transit and no backorder fulfillment.

## Constraints

Inventory balance:

    I(j,t) = I(j,t-1) + arriving volume(j,t) - demand(j,t) + u(j,t)
    0 <= u(j,t) <= demand(j,t)

Reserve and tank limits:

    reserve(j,t) <= I(j,t) <= tankCapacity(j)
    I(j,t-1) + arriving volume(j,t) <= tankCapacity(j)

The second constraint is a batch-receipt timing assumption: the full arrival must fit before consumption. It is intentionally stricter than a continuous within-period loading/discharge model.

Dispatch limits:

    sum_j x(i,j,t) <= supplierCapacity(i,t)
    x(i,j,t) <= routeCapacity(i,j,t)
    x(i,j,t) >= 0

Optional global budget constrains the complete modeled cost, including holding and financing. Optional transport-emissions cap constrains sum(x * route factor). It does not represent lifecycle emissions.

## Costs

Each dispatched tonne pays the departure period benchmark plus supplier basis, freight and handling. Transit financing is purchase value × rate per period × route lead time. Each closing inventory balance, including terminal reserves, pays holding cost plus financing at that period's benchmark valuation.

Initial inventory is not repurchased. Its closing balances incur holding and financing. The cost result is therefore incremental planning spend plus carry, not full historical cost of goods sold or trading PnL. There is no terminal salvage credit. The explicit future price curve is an assumption, not an observed forward curve; an observed US benchmark remains a geographic proxy.

## Two objectives and numerical validation

1. Minimize total unmet tonnes under all hard constraints.
2. Preserve the first objective within a 1e-7 tonne numerical band, then minimize cost.

This avoids an arbitrary shortage penalty. Both returned LP solutions are independently checked against the original balances, caps and variable bounds. A small feasibility tolerance is disclosed in solver output. Optional package presolve is disabled after an independently reproduced false-infeasibility case; the original constraints are retained.

Status meanings:

- `optimal`: validated plan serves all demand within tolerance.
- `shortage`: validated plan attains the maximum possible on-time service and reports the least-cost plan at that service level.
- `structural-infeasible`: even allowing unserved demand, hard reserve/storage/budget/emissions constraints cannot be satisfied. No cost or allocation is claimed.
- `solver-error`: numerical or verification failure; no plan is claimed.

The model minimizes total shortage; it does not impose fairness or customer priority among equally sized shortages. Add service-priority constraints before applying to a commercial customer portfolio.

## Scenarios and comparisons

Base, Gulf disruption and Singapore outage apply disclosed capacity/basis/freight adjustments independently to base inputs. Demand multipliers and price curves are separate user assumptions. Stress-case cost differences are shown only for identical node-period demand fully served by both cases. They are not realized trading profits or savings against a verified operational policy.

## Verification

Regression tests cover late arrival, reserve deficits, storage receipt limits, early purchase versus holding, budget and emissions restrictions, repeating-fraction numerical boundaries, and scenario independence. An independent SciPy HiGHS implementation matched 212 hand-derived and deterministic random cases, including optimal, shortage and structural-infeasible states; differences stayed within exported quantity/currency rounding.

The UI validates inputs, invalidates outdated results after edits, recomputes imported scenarios, and does not trust saved result fields. Source observations and all manual assumptions are included in JSON exports. CSV is a compact result schedule; retain JSON for full reproducibility.

## Boundaries

Single grade and divisible cargo; no integer vessel lots, ship calendars, quality/blending, taxes, source inventories, contract take-or-pay, customs permissions, credit exposure, derivatives, execution or accounting ledger. Those are separate model and data requirements. Public national statistics and airport coordinates are contextual; they do not establish tradable volume or terminal inventory.
