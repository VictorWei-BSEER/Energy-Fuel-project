# Fuel tankering and East Asian aviation security

This independent research and digital-creative project examines a conditional question: **how much destination refuelling demand can airline tankering displace, and what fuel-price premium compensates for its additional fuel consumption and emissions?** Singapore Changi, Hong Kong and Tokyo Narita provide a regional geographic frame. The project identifies thresholds, not actual profitable airport pairs or aircraft dispatch plans.

## Submission format

The final project combines an offline-capable interactive research exhibit, a reproducible quantitative analysis, and an 800–1,000-word analytical reflection. The supplementary report, evidence registers, input classifications and four documented critique-and-revision rounds make the analysis inspectable. The existing market-monitoring and bulk procurement workspace is contextual material; its default scenario allocations are not research findings.

## Revised design after review round 1

The research separates private fuel cost, airline operational flexibility, airport delivery capability and national supply security. Its physical security measure is **tonnes of fuel uplift displaced at the destination**. It does not infer flights saved, disruption probabilities, usable airport stocks or regional welfare.

The counterfactual holds the aircraft mission, payload, mandatory reserves and onward fuel requirement fixed. In the reference case, the aircraft buys a marginal tonne at the destination. In the tankering case, it purchases enough additional fuel at the origin to deliver that same tonne after paying the incremental carrying burn. Fuel after the destination purchase is therefore equal in both cases; any common onward-flight consumption cancels. Aircraft and contract feasibility remain conditions, not solved constraints.

The primary mass-retention approximation is `a = 1 - k*t`, where `t` is airborne time and `k` is an assumed hourly carrying coefficient informed by ICAO's published 2.5–4.5% range. For one net tonne delivered, origin uplift is `1/a`, extra burn is `1/a - 1`, and combustion CO2 is extra burn multiplied by 3.16. `a = exp(-k*t)` tests structural sensitivity. The linear approximation is conservative relative to that alternative at the same coefficient; neither is calibrated to a named aircraft.

Unknown airport prices remain unknown. The principal result is a break-even destination/origin price ratio. Currency illustrations explicitly assume a fuel price and carbon shadow price; they are not airport quotes or current compliance charges. Coordinates are source observations; distances are derived; routing, speed, fuel availability and carbon-price settings are scenarios.

Three mechanisms frame interpretation: ordinary price-driven tankering; a destination-specific interruption when the origin can provide the additional fuel; and a correlated upstream shortage. Tankering can shift a local uplift requirement but consumes more aggregate fuel. A shared regional fuel constraint is a resource-accounting test, not an estimated emergency allocation outcome.

The economic price comparison assumes the destination purchase is available in the reference case. The interruption calculation instead measures how much of a specified local uplift gap could be displaced with additional fuel available at the origin. An unavailable purchase is not treated as an executable alternative, and its avoided cost or disruption value is not estimated. Neither calculation establishes flight continuation.

The two physical calculations have different denominators. At four hours and `k = 0.035`, delivering **one net tonne** requires 1.162791 tonnes of extra origin uplift, burns 0.162791 tonnes and adds 0.514419 tonnes of combustion CO2. With **one tonne of extra origin headroom**, 0.86 tonnes can be delivered, burning 0.14 tonnes and adding 0.4424 tonnes of CO2. In both CSVs, `additionalBurnT` and `additionalCo2T` belong to the net-delivery calculation; `localAdditionalBurnT` and `localAdditionalCo2T` belong to the headroom-constrained interruption calculation. All quantities are metric tonnes.

## Reproduce

```sh
python3 research/model.py
python3 -m unittest discover -s tests -p 'test_research_model.py'
python3 research/reviews/independent_numerical_check.py
python3 scripts/build_research.py
python3 scripts/render_research.py
python3 scripts/build_research.py --package
python3 scripts/check_research_package.py --package artifacts/energy-security-project/submission-package.zip
```

The model uses the Python standard library. Figure/document builds additionally use NumPy, Matplotlib, ReportLab and python-docx. The interactive exhibit runs without a server or network connection; open its `index.html` from the extracted offline package. Reproduction does not require live airport prices, TradingView, or paid APIs.

For a full publication rebuild, use Python 3.11+ and first run `python3 -m pip install -r research/publication-requirements.txt`. Install Noto Sans or DejaVu Sans and DejaVu Sans Mono as system fonts (Debian/Ubuntu package: `fonts-dejavu-core`). Installing dependencies on a clean machine requires network access; the numerical model and included exhibit do not. Run the commands above from the repository root or the extracted ZIP root. The scripts select `dist/research/` in the repository and `exhibit/` in the extracted package automatically. Generated documents and the rebuilt ZIP are saved under `artifacts/energy-security-project/`.

Validation scope: numerical reproduction, independent arithmetic audit, JavaScript/Python parity, simulated DOM interactions, static links/assets, archive integrity, and page-by-page PDF raster inspection. No actual browser rendering or assistive-technology run was available in this environment; responsive CSS and semantic labels are implemented, but cross-browser and screen-reader behavior is not certified.

The independent audit uses the archived airport snapshot in `research/reviews/airport-source-snapshot.json`, whose SHA256 matches the frozen input provenance. Future refreshes of the market app's airport file therefore do not change this study. The audit reconstructs exported cash flows and fuel balances independently; it does not establish empirical aircraft validity. The original round-2 input manifest and audit report are preserved separately from the revised manifest and rerun report.

Research cutoff: 12 November 2026. Historical measurement periods remain attached to contextual statistics. All mathematical findings are author calculations under the declared assumptions. AI-assisted research, coding and critical review were used; the four reviews are not an external consultancy endorsement or instructor assessment.
