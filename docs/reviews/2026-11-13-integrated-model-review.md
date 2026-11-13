# Independent review of the integrated supply and flight model

Review date: 13 November 2026. Starting revision: `164bebd`.

This review examines whether upstream procurement, transport, airport inventory and aircraft uplift form one conserved optimization problem. It does not certify aircraft performance, commercial quotations, supply rights or operational dispatch. Review findings and executed checks are recorded separately below.

## Requirements established before implementation

1. **Physical coupling:** every aircraft uplift must appear as an outflow in the corresponding airport and departure-event inventory balance. A supply panel populated after an independent aircraft optimization is not joint optimization. Upstream limits must be able to change the preferred aircraft uplift schedule or make the rotation infeasible.
2. **Shared supply:** dispatches to all destinations must consume the same supplier allocation. A total-horizon allocation is distinct from a per-event dispatch limit. Neither may be copied as a fresh allowance for each route or airport visit.
3. **Cost boundary:** purchased product, transport and handling are charged once. An all-inclusive into-plane quotation cannot also incur an upstream product price and another transport/service markup. If quote mode uses direct local delivery, that boundary must be explicit.
4. **Inventory comparability:** the baseline and optimized cases use identical initial aircraft fuel, opening ground stocks, final aircraft fuel and terminal ground-stock targets. Opening stock can be treated as sunk, but an apparent saving must not arise solely by emptying inventory in one comparison case. The result is incremental modeled cost, not trading profit or full historical cost of goods sold.
5. **Same-network baseline:** fix the minimum-uplift aircraft reference and solve its procurement through the same supply network. Suppress savings when that reference is infeasible; a feasible tankering alternative is still useful but has no feasible baseline cost comparison.
6. **Timing:** define the period unit and sequence of receipt, uplift and closing inventory. If a period is one flight-departure event, it is not an hour or day. Zero lead time is an availability assumption, not instantaneous physical transport. Dispatches cannot supply earlier events or arrive outside the horizon unnoticed. Repeated visits to one airport must share that airport's inventory state.
7. **Complete service:** a flight must receive the fuel required by the aircraft equations and reserves. Supply-shortage variables must not manufacture uplift or classify a partially fueled rotation as feasible. Infeasible and numerical-failure results must not retain a stale successful plan.
8. **Domain and residual checks:** validate finite nonnegative masses/capacities, positive horizon, legal integer lead times and known endpoints before solving. Independently reconstruct aircraft balances, airport balances, capacities, terminal conditions and total cost from returned decisions. Solver success alone is insufficient.

## Modeling scope agreed during review

The existing aircraft engine minimizes purchased into-plane fuel over a fixed one-to-five-leg rotation, with mass-dependent carriage burn and matched final onboard fuel. The existing general supply planner instead uses equal user-defined periods and allows unmet demand. Its default volumes, time basis and shortage semantics cannot simply be imported into an aircraft dispatch problem.

The proposed integrated scope is one fixed aircraft rotation with a departure-event-indexed supply network. It may use explicitly synthetic regional suppliers and routes, or direct local deliveries at user-provided all-inclusive quotations. Geography establishes location only. Generated costs, capacities, inventory and delivery timing remain assumptions unless separately replaced by verified data. A tabbed interface is a view of the shared state; it is not itself evidence that the equations are coupled.

## Implementation and cost-boundary inspection

The implementation uses a single LP. Every aircraft uplift variable participates in its aircraft conservation equation and the matching airport-event inventory equation. Supplier and route dispatch variables feed those inventories after their integer lead time. Supplier stage and horizon constraints aggregate across destinations; repeated visits use one airport inventory sequence. The baseline fixes the original minimum-uplift flight quantities inside that same network. This is physical coupling, not allocation calculated after an independent flight solve.

The generated data builder decomposes each modeled delivered reference into ex-source product, freight, a signed airport/manual basis adjustment, into-plane service and fiscal adjustment. The reference price is not charged a second time. Imported-price mode instead creates direct all-inclusive offers and requires zero additional modeled service, tax or holding charges. Its visit-specific offer prices and capacities retain event restrictions, while volume and storage remain assumptions. The builder labels source pools, transport links and inventory as synthetic; sourced airport coordinates do not establish refinery locations or supply relationships.

The returned per-leg costs are an accounting allocation: the airport's total horizon cost is prorated by uplift across its visits; zero-uplift holding overhead goes to its first visit. They reconcile to the joint total but are not executable marginal prices, an inventory-costing policy or independently negotiated offers. The shipment and airport cost breakdown is the authoritative explanation of the objective.

This remains a single-aircraft, fixed-route, divisible-fuel scenario model. It does not model actual shipping calendars, vessel lots, refinery production, fuel-quality certification, supplier stock, commercial execution, aircraft scheduling, hedging or financial risk. A zero-event lead time means assumed availability, not zero transport duration. Aircraft combustion estimates are separate from an unmodeled full supply-chain lifecycle footprint.

## Independent verification record

`scripts/audit-integrated-model.py` independently formulates the joint problem with uplift and **landing fuel** as aircraft variables. Production uses extra departure fuel. The reference independently constructs airport receipt/storage constraints, supplier-stage and supplier-horizon allocations, route limits, integer event lead times, identical terminal inventories and the fixed-uplift baseline. It uses SciPy/HiGHS rather than the production JavaScript solver.

The first normal-scale run checked ten analytical cases and 240 generated cases with seed `2026111301`. It found 149 feasible and 101 infeasible cases, with no feasibility or objective disagreements; maximum objective difference was USD `6.760637916158885e-8`. Twenty-two feasible optimized cases had infeasible minimum-uplift baselines and correctly withheld savings. A second pass independently reconstructed every reported shipment's timing and cost, supplier/route/offer allocations, airport receipt and closing balances, aircraft fuel balance and final stocks. Those checks passed over the same cases. Repeating that sample adds validation coverage, not another 250 distinct cases.

Analytical cases establish that upstream prices change the selected uplift strategy, cheap supply is pooled over the horizon, a late delivery cannot fuel an earlier flight, repeated airport visits share one allocation, all-inclusive offers are charged once, opening stock is replenished to its terminal target, signed adjustments reconcile to the intended positive delivered cost, and savings are absent when the same-network baseline cannot be supplied.

## Adversarial findings and corrections

| Finding | Reproduction | Verified correction |
| --- | --- | --- |
| Absolute ground-balance tolerances admitted under-procurement at very small mass scales. | Scale a two-leg case's masses/capacities/weights by `1e-12` and its USD/t prices inversely. The economic problem retains true cost USD 2,111.111111111. The first implementation returned `feasible: true`, cost USD 2,100 and saving USD 900; at `1e-9` it returned USD 2,111.10. Aircraft physics alone passed because the shortfall occurred between purchased ground fuel and uplift. | The LP now normalizes mass and objective coefficients before solving. Ground residual checks use the aircraft mass scale without an absolute tonne floor and also reconstruct cumulative airport-pool conservation. Independent cases at mass factors `1e-12`, `1e-9`, `1`, `1e6` and `1e12` now all return USD 2,111.11111112115, approximately USD `1e-8` above the analytical minimum under the tie-break allowance. |
| A positive all-in price check did not exclude negative ground-fuel acquisition credits. | Supplier price USD 100/t, route basis adjustment −200/t and into-plane service USD 110/t yield positive all-in USD 10/t. With a 10 t flight need and an unused 20 t terminal ground-stock target, the first implementation reported cost −USD 1,900. | The solver and generated-network builder now reject negative net acquisition cost separately from the all-in price. The discovery case returns `invalid`, no cost and no savings. Signed basis/fiscal adjustments remain permitted when the relevant resulting costs satisfy their validity rules. |
| A broadly applied baseline substitution could hide a material optimality inconsistency. | Inspection found that any optimized cost above a feasible baseline was replaced by the baseline and labeled optimal, without a magnitude check. No such material discrepancy occurred in the numerical sample. | Substitution is now limited to the declared floating-point cost tolerance. A larger inconsistency returns a numerical error and does not claim optimality. Retaining a validated primary optimum if the optional tie-break fails remains appropriate. |

These are deliberately adversarial inputs, not realistic aircraft loads or observed prices. They exposed accounting/precision failure modes that were corrected before acceptance. Lasting regressions are included in `tests/integrated-optimizer.test.mjs`, `tests/integrated-data.test.mjs` and the independent Python audit.

## Final acceptance evidence

After the corrections, both `src/integrated-optimizer.js` and the compiled browser artifact `dist/integrated-optimizer.js` passed the same 250 normal-scale cases and six adversarial cases. These are **256 distinct input cases checked against each artifact**, not 512 distinct scenarios. The final normal-scale results were:

- 149 feasible and 101 infeasible cases; no feasibility or objective disagreements.
- 22 feasible optimized plans with infeasible baselines; savings correctly absent.
- Maximum cost difference from the independent SciPy solution: USD `1.0266376193612814e-8`.
- Exported shipment timing, shared capacities, inventory balances, aircraft balances, terminal conditions and full cash-flow reconciliation passed.
- All five scaled economic equivalents retained their correct cost; negative unused-stock acquisition credits were rejected.
- All 28 production optimizer and generated-data unit tests passed, including source-to-flight causal changes and quoted-mode accounting.

The independent run used SciPy 1.17.0. Audited artifact SHA-256 digests were:

```text
src/integrated-optimizer.js  ce03ffec0298a3d5fb96f675c62110bb5482a78c8c25c24600a53b029febba6f
dist/integrated-optimizer.js 250a0af7408df968f50139bbba4ffdb25c45a0e393eaa13d9ec1439405e6f0ad
```

Reproduction from the repository root, after installing NumPy/SciPy for the optional independent audit:

```sh
node --test tests/integrated-optimizer.test.mjs tests/integrated-data.test.mjs
python3 scripts/audit-integrated-model.py
python3 scripts/audit-integrated-model.py --module dist/integrated-optimizer.js
```

No unresolved blocker was found in the reviewed mathematical integration and generated-data boundary after these fixes. This is evidence over the stated cases and inspected constraints, not a proof over every floating-point input or a dispatch certification. Browser tab behavior, localization, imported-file date validity and visual presentation require their separate interface review.
