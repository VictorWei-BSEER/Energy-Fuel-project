# Fuel Atlas — project decision brief

Prepared 13 November 2026 (UTC+8). This brief supports a critical investment or research discussion. It is not a financing offer, operational dispatch authorization or claim of endorsement by any named institution.

## The decision problem

An airline buying cheaper fuel at one airport may carry it to a later station and avoid a more expensive purchase. Additional weight burns fuel, consumes capacity and can affect payload. A valid recommendation therefore needs comparable into-plane offers, the fixed mission and approved aircraft constraints—not simply a price spread on a map.

Fuel Atlas makes that trade-off inspectable. Its research asks a related systems question: when a local supply interruption occurs, does airborne fuel transfer preserve useful connectivity, or shift scarcity and emissions to another part of the network? The commercial and public-policy objectives are not automatically the same.

**Proposed next decision:** secure a data partner and independent methods review for a bounded shadow pilot. Do not expand into a broad energy-trading platform before testing that the narrower workflow creates repeatable value.

## What exists, and what remains unproven

| Capability | What can be inspected today | Evidence needed next |
| --- | --- | --- |
| Fixed-rotation fuel model | Browser-local optimization over 2–5 fixed legs, explicit fuel and weight constraints, optional uplift limits and equal terminal fuel across comparison strategies | Aircraft-specific incremental performance, operational tolerances, real supply constraints and prospective validation |
| Global geography | A sourced 67-airport sample across six inhabited continents with a global map and route visualization | Geography does not prove fuel availability, quoted prices or world-market coverage |
| Quotation handling | Bounded CSV import, dates, delivery basis, included-fee declaration, missing/overlapping quote rejection | Contract verification, buyer entitlements, supplier acceptance, quantity tiers and reconciled invoicing |
| Public data | Separate official-source benchmark/context feeds, timestamps and last-known observations | Licensed airport offers and usable airport stock/delivery data remain a different dataset |
| Research | Reproducible marginal tankering calculations, documented assumptions, route sensitivity and institutional Asian energy-security cases | Calibrated empirical estimates, causal identification and a validated network-service model |

The flight optimizer, marginal tankering study and separate supply-chain planner have distinct units, state variables and purposes. They are not one calibrated global energy model. No realized airline savings, customer contracts, revenue, retention or prospective operational trial is included in the project evidence.

## Commercial hypothesis and competitive context

The initial buyer hypothesis is an airline fuel procurement team working with flight operations. The proposed workflow is to reconcile dated offers, replay a fixed rotation, identify a feasible uplift alternative, inspect the constraints that drive it and retain the input/result record. Begin with one fleet type and a small airport network.

A paid pilot followed by a subscription is a pricing hypothesis, not a validated business model. Buyer interviews must establish the budget owner, existing workflow, willingness to pay and procurement lead time. Delivery economics must include data licensing, integration, domain support, security review and ongoing maintenance. No total-addressable-market estimate is asserted because an eligible customer count, achievable contract value and adoption evidence have not been established.

This is an existing product category. [Skymetrix’s Fuel page](https://skymetrix.com/airtelligent/fuel/) describes fuel procurement, flight-event integration and tankering support. [OpenAirlines’ fuel-manager page](https://www.openairlines.com/for-fuel-managers-ops-engineers/) describes operational fuel analytics, data gathering and reporting. These are vendor descriptions, not independent performance comparisons; their savings claims are not transferred to Fuel Atlas.

The differentiation to test is whether transparent resilience scenarios and decision provenance fill an unmet workflow alongside existing systems. A map, optimizer and attractive interface are insufficient evidence of a defensible advantage. Permissioned data access, validated performance, practical integration and user trust could become advantages only if the team establishes them.

## Economic value bridge

For the same mission and feasible service outcome:

**Net value = matched baseline purchase cost − feasible alternative purchase cost − additional non-fuel costs.**

The model’s purchase-cost difference already accounts for modeled carriage burn through the extra fuel that must be purchased. Do not subtract the same burn twice. Separately reconcile additional carbon charges, handling, displaced-payload value, contract penalties and implementation costs. Where a fee is already included in an into-plane price, do not deduct it again.

Keep payload, reserves, initial fuel, terminal fuel, applicable offers and information timing consistent. Existing fuel is already owned; incremental purchase cost is not full accounting profit. A comparison against an infeasible baseline measures a feasibility difference, not an achieved saving percentage. Lost-service valuations require a separate agreed method rather than assigning arbitrary cancellation costs.

Report both gross and net differences, coverage of eligible rotations, rejected cases, analyst time saved and the distribution of outcomes. An average alone could conceal a small set of bad recommendations or an impractical data burden. Annualization should follow validated operating frequency and observed eligibility, not a multiplication of a selected favorable example.

## Proposed 90-day pilot

The timeline starts after a partner agrees to participate; the dates are relative and depend on access. These are proposed gates, not completed milestones.

### Days 1–30: establish comparability

Obtain authorized offers, invoices, uplift records and airline-approved performance data. Record product, units, currency, fee coverage, validity, buyer rights, supply limits and exclusions. Separate the operational record from public benchmark context.

Acceptance: every admitted record has complete required provenance, units and delivery basis; missing material inputs block recommendations. Agree numerical tolerances, material-error criteria, eligible use cases and a holdout period before evaluating performance. Confirm who may access contracts and what can be published.

### Days 31–60: replay without hindsight

Replay historical rotations with only information that was available at each decision time. Compare the output with recorded practice and the same-constraint modeled baseline. Independently verify fuel mass balance, uplift limits, tank capacity, takeoff weight, landing weight and terminal fuel.

Acceptance: no unresolved hard-constraint violation. Report quote coverage, fuel-burn prediction error, invoice-reconciliation error and net value against the pre-agreed tolerances. Explain disagreements rather than labeling every difference from recorded practice an improvement. Keep calibration cases separate from the holdout evaluation.

### Days 61–90: test prospective usefulness

Run in shadow mode, with operations retaining authority. Log recommendations, operator disagreements, override reasons, analyst effort, latency and data failures. No recommendation automatically changes dispatch or places a fuel order.

Acceptance: repeatable user value, affordable integration and explicit operational sign-off. Stop or redesign if the net benefit disappears after costs, needed data remain inaccessible, performance errors overturn decisions or workflow overhead exceeds the benefit. Any move beyond shadow use requires a separate approved operational process.

## Systems-research agenda

Compare three mechanisms: a local delivery failure, refinery disruption and a correlated import shock. Test tankering against ground stocks, alternate suppliers and coordinated allocation. A supply interruption and a price increase should not be treated as the same event.

Relevant measurements include unmet fuel, unmet service, additional fuel burn, direct CO₂, procurement cost, recovery time and distribution of scarce fuel across operators and communities. Fuel shortfall is not automatically a count of cancelled flights; translating fuel to service requires a validated demand and mission representation. Priority-service and equity weights must be stated and tested rather than hidden in a composite risk score.

Jointly vary aircraft performance, supply logistics, restoration times and policy assumptions. Report feasible sets, model-form disagreement and scenario regret. Do not attach invented occurrence probabilities to scenarios. Scenario ranges are not statistical confidence intervals. Keep direct aircraft CO₂ separate from lifecycle emissions and non-CO₂ climate effects.

This agenda is relevant to [IIASA’s Energy, Climate, and Environment programme](https://iiasa.ac.at/programs/ece), which connects energy, services, local constraints and inequalities, and [Advancing Systems Analysis](https://iiasa.ac.at/programs/asa), which emphasizes resilience, decision methods and open science. This is a proposed fit with public programme themes, not an affiliation, invitation, joint project or endorsement.

Publish equations, input classifications, code versions, sensitivity design and reproducible outputs. Protect confidential contracts through appropriate access controls; publish de-identified or aggregate results only when authorized. Engage an independent domain reviewer and a data partner before extending the claim from conditional research to operational decision support.

## Source and claim ledger

External product and programme pages were checked on 13 November 2026 (UTC+8).

| Claim | Direct supporting source | Interpretation boundary |
| --- | --- | --- |
| The current project solves fixed-rotation uplift choices | `dist/flight-optimizer.js`; `docs/flight-model.md`; corresponding model tests | Demonstrated code behavior is not aircraft calibration or dispatch approval |
| The geographic sample contains 67 airports | `dist/data/global-airports.json`; `docs/global-geography.md` | An editorial sample, not universal market coverage or a traffic ranking |
| Quotation import requires dates and comparable basis | `dist/fuel-quotes.js`; `docs/airport-fuel-pricing.md` | Parsing does not authenticate a contract or guarantee supply |
| The research reports conditional marginal tankering results | `research/report.json`; `research/inputs.json`; `research/model.py` | The results do not identify current airport arbitrage or actual service preservation |
| Skymetrix describes procurement, flight-event integration and tankering support | [Fuel — Skymetrix](https://skymetrix.com/airtelligent/fuel/) | Vendor product description; no independent comparative or savings claim |
| OpenAirlines describes operational fuel analytics and reporting | [Fuel Managers & Operations Engineers — OpenAirlines](https://www.openairlines.com/for-fuel-managers-ops-engineers/) | Vendor product description; no transfer of marketing savings figures |
| Energy, services and inequality are relevant IIASA research themes | [ECE — IIASA](https://iiasa.ac.at/programs/ece) | Research relevance only, no institutional relationship |
| Resilience, analytical methods and open science are relevant IIASA themes | [ASA — IIASA](https://iiasa.ac.at/programs/asa) | Research relevance only, no institutional relationship |

All proposed customer choices, revenue approach, validation timetable, acceptance gates and future research work are the project’s own hypotheses or recommendations. They are not facts asserted by the cited organizations.

## Rebuild the review handout

The website brief fragment is `dist/brief/brief.html`; `dist/brief/brief.css` contains its scoped presentation. Run `python3 scripts/build_brief.py` to generate a standalone print view, the downloadable Markdown note and a source-hash manifest. Run `python3 scripts/build_brief.py --check` to verify those generated assets against their current source.

For the optional PDF, use an already installed Chromium binary:

```sh
python3 scripts/build_brief.py --pdf --chromium /absolute/path/to/chromium
```

The builder installs nothing. The print view embeds its CSS and uses system fonts, with no external runtime assets. It rewrites app navigation to the hosted main workspace and prints full source URLs. Browser/version metadata may change PDF bytes; source hashes define content provenance. Review the rendered pages after changes rather than relying on the existence of a PDF file alone.
