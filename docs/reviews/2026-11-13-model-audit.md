# Independent model audit — 13 November 2026

Scope: the fixed-rotation aircraft fuel optimizer, its global and East Asia illustrative presets, and consistency with the frozen research threshold model. This is a numerical and interpretation review, not aircraft dispatch approval, supplier verification or external institutional endorsement.

## Findings and corrections

| Finding | Evidence | Resolution |
| --- | --- | --- |
| Absolute fuel tolerances could manufacture savings for very small mass scales. | Rescaling a known two-leg case by `1e-9` and inversely rescaling its prices preserved the economic problem, but the previous implementation returned USD 7,634 instead of USD 14,546.9387755 and allowed negative uplift. At `1e-12`, fixed zeroing could erase purchases entirely. These are deliberately adversarial inputs, not realistic aircraft data. | Fuel feasibility tolerance now follows the input mass scale: `64 × Number.EPSILON × max(tank capacity, initial fuel, minimum departure fuel across legs)`. Tiny positive quantities are retained; only roundoff-size negative carry or uplift is set to zero. Regression checks cover scales `1e-12`, `1e-9`, `1`, `1e6` and `1e12`. Normal preset results are unchanged. |
| Method documentation still referred to 17 supported airports. | The shared directory contains 67 airport records. | Corrected the model documentation to 67. Airport coverage remains a selected geographic sample, not price coverage. |
| The flight and research engines use different meanings of the burn coefficient. | Flight `carryBurnRate` is dimensionless per leg; research `burnCoefficientPerHour` is per airborne hour. | Added an explicit engine distinction and mapping: linear `carryBurnRate = k × t`, exponential `carryBurnRate = 1 − exp(−k × t)`. This is a mathematical correspondence, not calibration of default flight inputs. |

## Independent optimization check

`python3 scripts/audit-flight-model.py` generated 600 rotations with seed `20261113`, two to five legs, varying prices, fuel demand, taxi burn, reserves, payload, tank and weight limits, initial fuel and optional supply caps. Cases include zero prices, zero supply and large carriage loss. The reference uses SciPy/HiGHS with **uplift and landing-fuel variables**, independently constructed conservation equations and constraints. Production code enumerates vertices in **extra departure-fuel variables**. The reference terminal stock is independently reconstructed from minimum purchases.

Executed with SciPy 1.17.0:

- 256 cases feasible in both implementations; 344 infeasible in both.
- Zero feasibility discrepancies and zero cost discrepancies above USD `1e-5`.
- Maximum absolute objective difference: USD `5.093170329928398e-11`.
- 837 individual feasible-leg fuel balances checked, plus all feasible-rotation mass balances and terminal-stock matches.

The independent harness is optional and needs NumPy/SciPy; normal application tests do not acquire these dependencies or access the network. It exits nonzero on a discrepancy. This sample is evidence over its stated domain, not a proof covering every possible floating-point input.

## Analytical and research checks

All 13 aircraft-optimizer tests passed after the fix. The added analytical bridge test uses a four-hour, 3.5%/hour linear carriage assumption with nonbinding capacities. At the research break-even price ratio, discretionary tankering is zero under the lower-burn tie-break. Raising the destination price by USD 10 per tonne delivers exactly USD 10 of additional benefit per useful tonne, with 0.514418604651 tonnes of additional direct CO₂, matching the independent marginal cash-flow identity.

The frozen research outputs also passed `python3 research/model.py --check` and the existing independent numerical checker. The latter checked all 36 central and 486 sensitivity cases, 1,296 monotonic comparisons, 243 linear/exponential pairs, independent spherical geometry, financial cash flows, fuel balances and boundary cases. The 919-word reflection and frozen numerical results were not changed in this review.

The core comparison is sound under its assumptions: identical route and payload, identical initial and terminal fuel, nonnegative uplift, the stated fuel/weight/supply constraints and purchase costs that include the supplied unit price. If the minimum-purchase reference violates a supply cap but a tankering plan is feasible, savings are withheld rather than measured against an unavailable alternative.

## Recomputed illustrative outputs

| Manual preset | Baseline purchase cost | Optimized purchase cost | Fuel-cost saving | Extra burn | Extra direct CO₂ | Post-hoc carbon break-even |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| East Asia | USD 31,270.00 | USD 27,673.53 | USD 3,596.47 | 0.65645 t | 2.07438 t | USD 1,733.76/t CO₂ |
| Global | USD 145,015.00 | USD 138,619.76 | USD 6,395.24 | 6.47619 t | 20.46476 t | USD 312.50/t CO₂ |

Both presets end with 8 tonnes of fuel. Prices, aircraft parameters and route burns in this table are manual scenarios. These numbers do not establish actual savings or financial returns.

The last column divides the existing plan's fuel-cost saving by its additional direct CO₂. It is the carbon value that erases **this plan's** saving against the baseline. Re-optimizing with a carbon objective could select a different amount of tankering; this calculation is not that optimization, an observed carbon price or a CORSIA charge. The 3.16 t CO₂/t fuel factor is the ICAO Jet A/Jet A-1 direct-combustion factor already cited in the research; lifecycle and non-CO₂ effects are excluded.

## Limits that a diligence reader must see

- This is fixed-route uplift optimization, not a global route-choice, fleet-scheduling, exchange-trading or regional welfare model. Airport coordinates establish geography only.
- The linear burn relation assumes a valid base burn at the supplied payload, reserve and mission. Performance, reserves, allowable weights and supply caps need operator validation; the example aircraft labels are not certified specifications.
- The research's 2.5–4.5% hourly literature range is a sensitivity input. It is not a statistical confidence interval, a calibration of the global preset, or evidence that one form is conservative against a real aircraft.
- Savings require comparable, valid into-plane prices and availability. Public wholesale series do not establish those inputs. Timing, fees, taxes, density, currency, quantity terms and delivery rights need contractual evidence.
- The solver uses floating-point arithmetic and a small bounded linear model. The tolerance fix addresses the demonstrated scale failure; it does not certify ill-conditioned extremes or substitute for an independent operational optimization implementation.
- Operational weather, altitude, winds, runway conditions, nonlinear performance, payload decisions, emergency-reserve composition, fuel compatibility, transaction execution and disruption probability are outside this engine.

An institution-facing demonstration can show transparent scenarios, reproducible equations and clear data gaps. A commercial or operational pilot needs dated operator-authorized data and out-of-sample checks before claiming value, readiness or safety.
