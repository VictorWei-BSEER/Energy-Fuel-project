# Data evidence and source-integrity review

Review date: 13 November 2026 (UTC+8). This is an AI-assisted technical review for the project, not an external assurance opinion or an institutional endorsement.

## Scope and conclusion

Reviewed the displayed public-data monitor, TradingView/OANDA chart boundary, airport quote parser, source collectors, local fallback snapshots and the regional airport directory. The public source tests passed, but the review found three user-facing inconsistencies and a separate integrity gap that warranted correction before a diligence demonstration.

The product can support a traceable scenario demonstration. It still cannot claim observed airport transaction prices, validated aircraft performance or executable supplier availability. None of the changes described below creates those data.

## Findings and corrections

| Priority | Observed defect | Correction | Verification |
| --- | --- | --- | --- |
| High | The deployed fallback bundle was collected on 3 November, while GitHub already held observations collected on 12 November. A blocked remote request could therefore return much older data. | Copied all six public snapshot files together from GitHub commit `69aefb9cd596ca378b722050b51df6d7abf9a8e4`. No values were regenerated or inferred. | Exact source bytes copied using `git show`; observed-date and collection-date separation retained. |
| High | Market summary cards only said “reporting lag” or “reference rate”; stale or failed-collection status appeared lower down in Sources. | The same health classification now appears immediately beside the Market value's observation date. Stale and collection-failure states are textual and also carry `.source-warning`; a failed collection does not advance the observed price. | New regression advances the test clock, then marks a collection failed and verifies unchanged values plus visible stale/cache warnings. |
| Medium | The regional traffic directory still claimed quotation/optimization support for only 17 East Asian airports. | Directory copy derives the current global support count from the shared airport directory, while retaining the separate 50-airport regional traffic sample. | Regression verifies global support count and the unchanged 50 regional rows. |
| High | Frontend validation checked types and source identity but accepted a headline `latest` value absent from historical observations, duplicates, and disagreement between catalog and payload dates. Reading a mutable source branch across a refresh could mix files. | Validation now rejects catalog/payload collection or observation mismatch, future collection timestamps, failed payload collection status, inconsistent latest/history values, duplicate keys, nonpositive prices and invalid JODI flow/assessment values. Valid same-date revisions with a newer collection timestamp remain accepted. | Thirteen added malformed-candidate cases verify rejection and preservation of the entire last-good dataset; the prior same-date revision test still passes. |

## Snapshot inventory at the reviewed source commit

All six files were collected at `2026-11-12T21:25:10.485001Z`, equivalent to **13 November 05:25:10 UTC+8**. A collection time is not a market observation time.

| Data | Latest source observation | Meaning in this product |
| --- | --- | --- |
| EIA U.S. Gulf Coast jet fuel FOB | 11 November 2026 | Published wholesale benchmark in USD/US gallon; not an Asian airport price. |
| EIA Europe Brent FOB | 11 November 2026 | Separate crude benchmark in USD/barrel; not jet fuel or an executable crack trade. |
| ECB reference FX | 12 November 2026 | Informational currency units per EUR; no automatic FX conversion of airport quotes. |
| JODI jet kerosene | August 2026 | National monthly balances in KTONS, with assessment flags and missing coverage preserved. |
| OurAirports selected coordinates | No record-level observation date supplied | Reference geometry only; collection time is available. |
| Catalog | Not an observation series | Source identity, cadence, last collection attempt and limitations. |

The global 67-airport coordinate sample, the 50-airport traffic reference directory and the 10-airport observed-map subset serve different purposes. Their counts must not be presented as a count of connected airport quotation feeds.

## Boundaries verified

- The public chart identifies **OANDA CFDs**, not exchange-traded futures or aviation-fuel quotes. Its 15-minute setting is candle duration; script/iframe load events are not evidence of quote freshness. The provider's displayed timestamp and delay indicators remain the reference.
- EIA and ECB are delayed published observations. The page checks for collected snapshots every minute; this does not turn the observations into tick data or trigger an upstream collection.
- JODI missing records remain missing. Reported zero values retain the source assessment code; an unassessed zero cannot establish no refinery activity or no available fuel.
- Quotation import accepts user-supplied normalized USD/metric-tonne into-plane records with all applicable fees explicitly confirmed. It checks format, dates, overlap, scope, bounds and source fields; it does not authenticate a supplier, confirm a contract, verify tax treatment or guarantee availability.
- Global airport coordinates do not create price or capacity observations. Public supplier-directory and paid-service links are access leads, not connected APIs.
- No supplier was contacted, no account was created, no paid data was obtained and no new source scrape was performed for this review.

## Review iterations and evidence

1. **Baseline inspection:** read collector and UI contracts, compared the six fallback files to GitHub, and ran 42 quote/observed/chart JavaScript tests plus 27 collector Python tests. Existing tests passed despite the identified UX and integrity gaps.
2. **Corrections and adverse cases:** implemented the directory/health/integrity corrections and added 15 regression cases, including the market status and directory checks. The 39 observed/directory tests passed against the older local fixtures.
3. **Synchronized-data check:** repeated the same 39 tests against the exact newer six-file source set. All passed, including valid same-date revisions and preservation after invalid replacement attempts.

Final focused verification: **57 JavaScript tests and 27 Python tests passed** after the synchronized-data check.

Commands:

```sh
node --test tests/observed-ui.test.mjs tests/public-market-ui.test.mjs tests/fuel-quotes.test.mjs tests/workspace-directory.test.mjs
python3 -m unittest discover -s tests -p 'test_data_pipeline.py'
python3 -m unittest discover -s tests -p 'test_collect_market.py'
```

These are source/DOM and collector checks. They do not constitute browser rendering, third-party provider uptime, supplier diligence or independent verification of the upstream publications.

## Remaining validation before a commercial or research pilot

Obtain dated buyer-specific into-plane offers or invoice/contract evidence, document unit and tax normalization, establish license scope and provenance, calibrate performance to an approved aircraft dataset, and back-test against a predeclared operational baseline. External findings should report performance and uncertainty only after this evidence exists. Present-day benchmark context is useful without claiming those pilot gates have already passed.
