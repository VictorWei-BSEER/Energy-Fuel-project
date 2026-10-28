# FUEL ATLAS / 东亚能源流向

An **observed energy-data monitor** with public source collection, an East Asia airport map and visible source timestamps. The homepage shows raw published values and missing coverage; it does not infer airport fuel prices, stock or demand. The multi-period planning model lives separately in the **Scenario laboratory** at `/planner.html`.

The homepage also embeds **WTI and Brent crude CFD charts from TradingView / OANDA**, with no API key required. Provider timestamps, delay indicators and market-closed states remain inside the original chart. This is a public market display, not an airport fuel quote or a numerical feed into the optimizer. See [market access, latency and current limits](docs/live-data.md).

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

Open `/planner.html` to plan 1–12 equal periods with explicitly assumed inputs. Edit supplier capacity/basis, period demand, initial stock, reserve targets, storage size/cost, route capacity/lead time/freight/handling, financing, budget and transport-emissions caps. Provide a flat benchmark, a growth assumption or an explicit price curve. These are scenario calculations, not an executable trading recommendation from observed supplier offers.

The continuous LP first minimizes unmet demand, then minimizes cost while preserving that service optimum within a disclosed numerical tolerance. Results include dated departures/arrivals, procurement, stock balances, shortages, binding constraints, costs and emissions. Supply arriving late never fulfills an earlier period's demand. Infeasible hard constraints produce diagnostics, not fabricated allocations.

Three stress cases share the same underlying assumptions. Cost comparisons appear only when both cases fully serve the same node-period demand. JSON export/import preserves the inputs and recomputes results; CSV exports shipment, procurement and shortage records. Existing inventory is already owned, so purchase costs apply only to new procurement. This is an incremental planning-cost model, not accounting profit.

See [model formulation](docs/model.md) for equations, timing, costs, tolerances and limits.

## Connected data

Public market display: `OANDA:WTICOUSD` (WTI crude CFD) and `OANDA:BCOUSD` (Brent crude CFD). Select either chart on the homepage. TradingView serves the chart directly to the visitor; the app does not copy or export its prices. The chart defaults to 15-minute candles and UTC+8; **15 minutes is the candle interval, not the data delay**. Source delay and market status are shown by the provider. Script/frame loading status does not prove a fresh quote has arrived. If the external chart is blocked or slow, use the retry control or its always-visible source links.

Five official-source adapters have completed a real GitHub Actions HTTPS run:

| Feed | Observed monitor role |
| --- | --- |
| EIA US Gulf Coast jet fuel | U.S. wholesale benchmark in original USD/US gallon; no airport allocation or density conversion |
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

The refresh workflow checks the three EIA/ECB market feeds hourly at minute 17, checks all five sources daily at 22:47 UTC, supports manual dispatch, and runs on relevant source changes. GitHub schedules are best effort and may run late. Scheduled Actions run from the default branch. It commits only `dist/data/`, reports partial failures, and fails if no selected feed refreshed.

The web app loads the latest collected dataset from GitHub `main`, then the previous data branch, then its bundled fallback. The observed monitor checks every 60 seconds while visible and has a manual check button; hidden pages pause automatic checks. Requests for all feeds use the same selected source location; each feed keeps its own observation date and freshness. These are periodic collected snapshots, not real-time exchange or supplier quotes. The hosted UI does not need to be redeployed for remote dataset updates. A failed check retains the last loaded observations and their timestamps.

## Structure

- `src/planner.js`: multi-period LP, validation, scenarios and diagnostics.
- `dist/planner.js`: generated self-contained browser bundle (do not hand-edit).
- `dist/index.html`, `observed-app.js`, `styles.css`: observed monitor, original-unit tables, source health and export.
- `dist/public-market.js`: official TradingView display integration, instrument selection and bounded loading/error/retry handling; no price extraction.
- `dist/planner.html`, `planner-app.js`: separate scenario laboratory and import/export; `app.js` is its retained prior source.
- `dist/data/`: verified source snapshots and health catalog.
- `scripts/refresh_data.py`, `data_adapters.py`, `collect_market.py`: ingestion.
- `scripts/build.mjs`: deterministic browser build and third-party license copy.
- `tests/`: model, data and DOM interaction checks.
- `dist/optimizer.js`, `model.js`: earlier single-period/aircraft examples, not the active planning engine.

No orders are executed. Vessel lots, source inventories, blending, taxes, contract obligations, hedging and credit/accounting workflows are outside this model. Planning routes are schematic; they are not observed ship or aircraft positions. Browser DOM behavior is tested; visual cross-browser inspection remains a separate check.
