# Product and methods review — 13 November 2026

The release addresses a reproducible defect: editing a flight price, opening the separate Research page and returning reset the model. The report and model also used different navigation systems. The review therefore starts with continuity of the user’s work, then checks the evidence used to make decisions.

Review records distinguish observed failures, fixes, verification and remaining limitations. They are an internal engineering and methods review, not third-party certification or an institutional endorsement.

| Review | Focus | Record |
| --- | --- | --- |
| Product | Navigation, state retention, keyboard access, language, import races and presentation | [Product review](2026-11-13-product-review.md) |
| Quantitative model | Independent LP comparison, mass balance, equal terminal fuel, numerical scale and interpretation | [Model audit](2026-11-13-model-audit.md) |
| Data | Source identity, observation/collection dates, stale data, snapshot consistency and coverage claims | [Data review](2026-11-13-data-review.md) |
| Browser | Actual Chromium flows, responsive widths, legacy deep links, imports, local assets and screenshots | [Browser review](2026-11-13-browser-review.md) |

The [project brief](../decision-brief.md) states the proposed commercial and research case. Its pilot gates are proposals; the code and scenario calculations do not establish realized savings, demand for the product, airline calibration or dispatch readiness.

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

Known boundaries remain explicit: public benchmarks are not airport into-plane offers; performance inputs are scenarios; the fixed-route uplift, marginal tankering and supply-chain models have different scopes; the global airport directory is a sample. There are no executed trades, validated customer outcomes or claimed IIASA affiliation.
