# Product and methods reviews — 13 November 2026

The current release starts with a user-selected route and a deterministic, inspectable scenario dataset. It replaces the main crude-market display with model inputs, makes the interface fully bilingual and gives each assumed input a replacement data source.

The [configurable model review](2026-11-13-configurable-model-review.md) records the current browser acceptance results. Earlier reviews below document the shared navigation and mathematical foundations.

| Review | Focus | Record |
| --- | --- | --- |
| Product | Navigation, state retention, keyboard access, language, import races and presentation | [Product review](2026-11-13-product-review.md) |
| Quantitative model | Independent LP comparison, mass balance, equal terminal fuel, numerical scale and interpretation | [Model audit](2026-11-13-model-audit.md) |
| Data | Source identity, observation/collection dates, stale data, snapshot consistency and coverage claims | [Data review](2026-11-13-data-review.md) |
| Browser | Actual Chromium flows, responsive widths, legacy deep links, imports, local assets and screenshots | [Browser review](2026-11-13-browser-review.md) |

The [model guide](../decision-brief.md) explains the workflow and data replacement plan. The [scenario specification](../scenario-data.md) records the formulas, parameters and regional hypotheses.

The 12 November research PDF, 919-word reflection and offline submission ZIP remain dated snapshots. The online interface and current review records are newer. A browser layout check does not certify the archived PDF’s analytical claims; the numerical and source audits address those separately.

## Reproduce the release checks

```sh
npm ci
npm run build
npm run check
npm test
node scripts/build-workspace.mjs --check
python3 scripts/build_brief.py --check
python3 scripts/check_research_package.py
python3 scripts/check_research_package.py --package dist/research/downloads/submission-package.zip
npx playwright install chromium
npm run test:browser
```

The independent flight audit uses a different variable formulation and SciPy/HiGHS as an optional numerical cross-check. Its command and dependency are documented in the model audit; the browser runner uses controlled public-source fixtures so network availability cannot mask an interaction failure.

Known boundaries remain explicit: public benchmarks are not airport into-plane offers; performance inputs are scenarios; the fixed-route uplift, marginal tankering and supply-chain models have different scopes; the global airport directory is a sample.
