# FUEL ATLAS / 东亚能源流向

An interactive, single-product **multi-period jet-fuel procurement and distribution model** with real public data collection, an East Asia map, and reproducible scenario files.

## Run and verify

Requires Node.js 22+ and Python 3.10+.

```sh
npm ci
npm run dev
```

Open http://localhost:4173. The planning engine is bundled automatically before local serving. The deployed application runs entirely in the browser; no keys are exposed.

```sh
npm run build
npm test
npm run check
```

## The model

Plan 1–12 equal periods. Edit supplier capacity/basis, period demand, initial stock, reserve targets, storage size/cost, route capacity/lead time/freight/handling, financing, budget and transport-emissions caps. Provide a flat benchmark, a growth assumption or an explicit price curve.

The continuous LP first minimizes unmet demand, then minimizes cost while preserving that service optimum within a disclosed numerical tolerance. Results include dated departures/arrivals, procurement, stock balances, shortages, binding constraints, costs and emissions. Supply arriving late never fulfills an earlier period's demand. Infeasible hard constraints produce diagnostics, not fabricated allocations.

Three stress cases share the same underlying assumptions. Cost comparisons appear only when both cases fully serve the same node-period demand. JSON export/import preserves the inputs and recomputes results; CSV exports shipment, procurement and shortage records. Existing inventory is already owned, so purchase costs apply only to new procurement. This is an incremental planning-cost model, not accounting profit.

See [model formulation](docs/model.md) for equations, timing, costs, tolerances and limits.

## Connected data

Five official-source adapters have completed a real GitHub Actions HTTPS run:

| Feed | Model role |
| --- | --- |
| EIA US Gulf Coast jet fuel | Observed geographic benchmark proxy for the user-editable future curve |
| EIA Brent spot | Market context; different product/geography from USGC jet |
| ECB reference FX | Context; reference rates, not executable quotes |
| OurAirports | Reference coordinates; no inventory or commercial fuel price data |
| JODI jet kerosene balances | National monthly context with reporting/assessment flags |

Every record retains source, observation period and collection time. Every feed has refresh health and last-known data. A failed collection preserves the prior snapshot; missing data is not zero. JODI missing economies and unassessed zeros must not be interpreted as absent supply. See [source provenance and coverage](docs/data-sources.md).

Asian supplier basis, available capacity, demand, stock, freight and contract prices remain **explicit assumptions**, not observations. IATA/Platts is marked restricted; Comtrade and executable supplier offers are not activated without a suitable access/configuration and product mapping. The UI distinguishes model input, context and reference feeds.

## Data refresh

```sh
npm run collect
# Or one feed:
python3 scripts/refresh_data.py --output-dir dist/data --only eia-jet
```

The collector needs HTTPS access to the official source hosts. The managed build environment has restricted outbound networking; real integration was verified in GitHub Actions. All sources have bounded responses, timeouts, schema/date validation and atomic writes.

The refresh workflow runs on weekdays at 22:17 UTC, supports manual dispatch, and runs on relevant source changes. Scheduled Actions run from the default branch. It commits only `dist/data/`, reports partial failures, and fails if no active feed refreshed.

The web app loads the latest collected dataset from GitHub `main`, then the working feature branch, then its bundled fallback. The Refresh data button repeats this process. Requests for all feeds use the same selected source location; each feed keeps its own observation date and freshness. These are periodic collected snapshots, not real-time exchange or supplier quotes. The hosted UI does not need to be redeployed for remote dataset updates.

## Structure

- `src/planner.js`: multi-period LP, validation, scenarios and diagnostics.
- `dist/planner.js`: generated self-contained browser bundle (do not hand-edit).
- `dist/index.html`, `styles.css`, `app.js`: constructivist UI and import/export.
- `dist/data/`: verified source snapshots and health catalog.
- `scripts/refresh_data.py`, `data_adapters.py`, `collect_market.py`: ingestion.
- `scripts/build.mjs`: deterministic browser build and third-party license copy.
- `tests/`: model, data and DOM interaction checks.
- `dist/optimizer.js`, `model.js`: earlier single-period/aircraft examples, not the active planning engine.

No orders are executed. Vessel lots, source inventories, blending, taxes, contract obligations, hedging and credit/accounting workflows are outside this model. Planning routes are schematic; they are not observed ship or aircraft positions. Browser DOM behavior is tested; visual cross-browser inspection remains a separate check.
