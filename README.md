# FUEL ATLAS / 东亚能源流向

The **Asian energy security final project** is available at [`dist/research/index.html`](dist/research/index.html), with the [full report](dist/research/downloads/Final_Project.pdf), [919-word reflection](dist/research/downloads/Analytical_Reflection.pdf) and [offline submission package](dist/research/downloads/submission-package.zip). It studies conditional fuel-tankering thresholds and local fuel displacement; the published research is separate from the planning workspace below. Reproduction, evidence classifications and critique records are in [research/README.md](research/README.md).

An energy planning workspace organized into three top tabs: **Oil market live information**, **Predictions & flight calculations**, and **Sources**. Calculations open by default; switching tabs preserves editable inputs and results. Published market observations remain separate from scenario assumptions, and no airport fuel prices, stock or demand are inferred from them. The former `/planner.html` address redirects to the Calculations tab.

The Oil market tab embeds **WTI and Brent crude CFD charts from TradingView / OANDA**, with no API key required. Provider timestamps, delay indicators and market-closed states remain inside the original chart. This is a public market display, not an airport fuel quote or a numerical feed into the optimizer. Sources contains feed health, raw observation exports, the airport reference map and model methodology. See [market access, latency and current limits](docs/live-data.md).

## Run and verify

Requires Node.js 22+ and Python 3.10+.

```sh
npm ci
npm run dev
```

Open http://localhost:4173. The planning engine is bundled automatically before local serving. The deployed application runs entirely in the browser; no keys are exposed.

The planning map includes 50 airports within the existing East/Southeast Asia frame, selected using 2024 total passenger traffic. The cutoff is 15.2 million passengers per year. Select an airport for its traffic context, or use the map zoom controls to inspect dense areas. Selection methodology and references are available in Sources and [the airport directory notes](docs/airport-directory.md). Traffic rankings do not supply airport fuel prices or model demand.

```sh
npm run build
npm test
npm run check
```

## The model

Open the default Calculations tab (`/#calculations`) to plan 1–12 equal periods with explicitly assumed inputs. Edit supplier capacity/basis, period demand, initial stock, reserve targets, storage size/cost, route capacity/lead time/freight/handling, financing, budget and transport-emissions caps. Provide a flat benchmark, a growth assumption or an explicit price curve. These are scenario calculations, not an executable trading recommendation from observed supplier offers. The navigation label groups this existing planning model under predictions and flight calculations; the UI reorganization does not add a new forecasting model or flight-performance data.

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
- `dist/index.html`, `workspace.js`, `styles.css`: three-tab workspace, with calculations selected by default and persistent form state across tabs.
- `dist/dashboard.css`: dashboard typography, neutral surfaces, readable controls and responsive presentation.
- `dist/airport-map.js`, `src/airport-directory.js`, `dist/data/airport-directory.json`: the versioned 50-airport directory, marker layout, selection, zoom and source table. `scripts/build_airport_directory.py` rebuilds the coordinate join from an OurAirports CSV; `src/airport-traffic-2024.json` preserves the traffic candidates and references.
- `dist/observed-app.js`: observed market summaries, original-unit tables, source health, reference geography and exports.
- `dist/public-market.js`: official TradingView display integration, instrument selection and bounded loading/error/retry handling; no price extraction.
- `dist/planner-app.js`: scenario calculations and import/export inside the Calculations tab; `planner.html` redirects there and `app.js` is the retained prior source.
- `dist/data/`: verified source snapshots and health catalog.
- `scripts/refresh_data.py`, `data_adapters.py`, `collect_market.py`: ingestion.
- `scripts/build.mjs`: deterministic browser build and third-party license copy.
- `tests/`: model, data and DOM interaction checks.
- `dist/optimizer.js`, `model.js`: earlier single-period/aircraft examples, not the active planning engine.

No orders are executed. Vessel lots, source inventories, blending, taxes, contract obligations, hedging and credit/accounting workflows are outside this model. Planning routes are schematic; they are not observed ship or aircraft positions. Browser DOM behavior is tested; visual cross-browser inspection remains a separate check.
