# Market data and collection

The procurement-model benchmark is the **U.S. Gulf Coast Kerosene-Type Jet Fuel Spot Price FOB**, published on the [official EIA daily history page](https://www.eia.gov/dnav/pet/hist/eer_epjk_pf4_rgc_dpgD.htm). Its unit is USD per **US gallon**. It is a regional wholesale reference, not an East Asian price, delivered cargo quote, airport refuelling offer, or executable transaction.

The checked-in `dist/data/market.json` contains 27 actual observations from 21 September to 27 October 2026. The latest observation is **27 October 2026: 4.444 USD/US gallon**. The source page showed a release date of 28 October and a next release date of 4 November 2026 when read. Dates reflect the market observation; they must not be replaced with the app's current clock.

This first snapshot was transcribed from the official table using the web connector. `collection.method` is explicitly `web_connector`. The managed development environment does not allow outbound HTTPS to EIA, so no direct EIA request or scheduled refresh was run here. The collector's parsing and failure behavior are tested offline. The initial snapshot does not establish an operational live feed.

## Refreshing the public benchmark

Python 3.10+ and the standard library are sufficient; no paid subscription or API key is required for this public HTML history endpoint:

```bash
python scripts/collect_market.py --output dist/data/market.json
python -m unittest discover -s tests -p 'test_collect_market.py' -v
```

An authorized environment must permit HTTPS to `www.eia.gov`. The collector honors inherited proxies and system CA trust and never tries to bypass network restrictions. For a saved copy of the official source HTML, or offline parser checks:

```bash
python scripts/collect_market.py --input-html /absolute/path/to/eia.html --output /absolute/path/to/market.json
```

The collector retains the most recent 90 actual observations by default (`--keep` changes this). It uses a bounded request and timeout, verifies series title and units, validates calendar dates and positive finite values, and skips documented missing markers without shifting weekday columns. It rejects ambiguous rows rather than inventing data. A failed fetch, malformed response, invalid value or regressed latest observation leaves the previous JSON file unchanged. Writes use a temporary file and atomic replacement. Genuine revisions to existing observation dates are allowed.

A daily schedule is sufficient to detect newly published data. Daily observations do not imply same-day publishing or a streaming quotation service. The multi-source workflow refreshes files under `dist/data/` and records per-source success or failure. Installing workflow source does not prove a scheduled run has occurred. Updating GitHub data alone does not redeploy the private Sites preview; the app may explicitly refresh the published branch snapshots, or a separate publishing workflow is needed.

## JSON contract

- `source`: stable source ID, title, URL, region, unit and frequency. The initial snapshot also records the page's release dates.
- `observations`: ascending actual `{date, value}` records. Missing market days are absent; they are not zero-valued or forward-filled.
- `latest` and `observedAt`: the latest market observation, separate from retrieval time.
- `fetchedAt`: UTC time when the source data was retrieved/collected.
- `collection.method`: `web_connector` for this initial snapshot, `https` for the direct collector, or `local_html` for an imported page. `status: ok` means successful collection, not necessarily recent observations.
- `staleAfterDays: 7`: the UI should assess age from `latest.date`, not `fetchedAt`. A successful fresh fetch of old observations must remain stale.
- `conversion`: a derived USD/tonne reference using assumed density `0.8 kg/L` and the exact US gallon conversion `3.785411784 L/US gal`.

The conversion is `USD/tonne = (USD/US gallon) × 1000 ÷ (0.8 × 3.785411784)`. For 4.444 USD/US gallon it is approximately **1467.48 USD/tonne**. Density is a modeling assumption, not a measured cargo specification. The converted number remains a US Gulf Coast benchmark. Regional differentials, delivered costs, demand, capacity and disruptions used in the optimizer are explicitly estimated or scenario inputs.

## Candidate additions and their limits

| Source | Purpose | Availability and implementation status |
| --- | --- | --- |
| [EIA Open Data API](https://www.eia.gov/opendata/documentation.php) | Structured market series | Free registration key; an optional future replacement for HTML parsing, not integrated |
| [IATA Fuel Price Monitor](https://www.iata.org/en/publications/economics/fuel-monitor/) | Weekly regional refinery-level comparison | Data derives from Platts; public viewing does not establish redistribution rights. [Methodology](https://www.iata.org/en/publications/economics/fuel-monitor/platts-methodology/) identifies proprietary underlying data. Not scraped or bundled |
| [UN Comtrade API](https://uncomtrade.org/docs/un-comtrade-api/) | Trade quantities, values and import dependence | Use official API access; verify product classifications and units. Trade unit values are not spot quotations. Not integrated |
| [JODI](https://www.jodidata.org/about-jodi/faqs.aspx) | Monthly production, imports, exports, stocks and demand | Verified public CSV endpoint and strict adapter implemented. Initial catalog is unavailable because no dependable numeric rows could be extracted in this restricted environment |
| [OurAirports](https://ourairports.com/data/) | Airport coordinates and identifiers | Connected public-domain CSV adapter and actual 10-airport snapshot. Does not supply commercial airport fuel quotes |

All future connectors should preserve source URL, observation and retrieval times, location, product grade, unit, currency, delivery basis, data status, and usage terms. Keep observed, estimated and scenario data distinguishable in storage and on screen. A quote is only executable when its counterparty, quantity, delivery, validity and other material conditions are known.


## Connected multi-source pipeline

Run all configured public adapters in an environment authorized to reach their official hosts:

```bash
python scripts/refresh_data.py --output-dir dist/data
python -m unittest discover -s tests -p 'test_*.py' -v
```

No credentials or paid market-data subscription are required for the five attempted public endpoints. Each source request has a 20-second timeout; downloads are capped at 4 MiB except the 20 MiB airport/JODI CSV caps. A successful source is written independently and atomically. A failure preserves its last valid snapshot, while the catalog records the failed attempt. The process exits zero when at least one selected source succeeds and nonzero when all selected sources fail. Partial success is not full-feed health; inspect `refreshSummary` and each `lastAttemptStatus`.

Use `--only eia-jet eia-brent ecb-fx ourairports jodi` to select any subset. `--catalog-only` rebuilds catalog metadata from existing files without making network requests or changing source retrieval timestamps. In this managed environment only `--only ourairports` was run against its live HTTP source, because that official repository host is permitted. EIA/ECB initial observations were obtained through the available web connector; their direct adapters require external validation on an authorized runner. No network-policy bypass was used.

| Snapshot | Actual content and provenance | Role |
| --- | --- | --- |
| `market.json` | 27 EIA USGC jet observations, latest 2026-10-27, 4.444 USD/US gallon; initial web-connector read | Explicit model proxy only |
| `brent.json` | 27 EIA Europe Brent observations, latest 2026-10-27, 123.10 USD/barrel; [official source](https://www.eia.gov/dnav/pet/hist/RBRTED.htm) read through web connector | Market context |
| `fx.json` | Selected official ECB reference rates for 2026-10-28, including USD 1.1133 per EUR; [official HTML reference page](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) read through web connector. Direct refresh uses the linked ECB XML feed | Currency context |
| `airports.json` | Ten actual airport coordinate records fetched from the [official OurAirports repository](https://github.com/davidmegginson/ourairports-data); public domain | Geographic reference |
| `jodi.json` | Created only after a successful, validated public CSV retrieval; no invented initial observations | National supply context |
| `catalog.json` | Current collection health, source identity, role, frequency, units, limitations and links for connected and unavailable feeds | Source audit |

ECB rates are currency units per EUR, so a USD amount converts to currency C as `USD amount × rate[C] / rate[USD]`. They are informational reference rates, not transaction quotes. The official source discourages using them for transaction purposes. Initial FX data has one true observation date; subsequent successful refreshes accumulate up to 90 actual dates. No historical series is synthesized.

If the UI compares jet with Brent, the dimensional conversion is `jet USD/US gallon × 42 − Brent USD/barrel`, joined on the same observation date. Because the commodities and locations differ, this is only an indicative cross-market spread. It is not an Asian jet crack, refinery margin, delivery premium, or executable arbitrage.

Airport data has no reliable per-record observation timestamp. Its catalog `observationDate` is null, while `fetchedAt` records the actual retrieval. Coordinates may support map nodes and geographic distance, but do not imply commercial capacities, routes, cargo availability, or fuel inventory.

## Catalog health semantics

`catalog.json` has `schemaVersion`, `generatedAt`, `feeds`, and `refreshSummary:{attempted,succeeded,failed}`. Each feed includes:

- `id`, `title`, `path` relative to the static site root (for example `data/brent.json`), and `sourceUrl`;
- `status`: `observed` when a valid snapshot exists, `unavailable` when none exists, or `restricted` for an intentionally inactive licensed source;
- `role`: `model`, `context` or `reference`;
- `observationDate`, `fetchedAt`, `frequency`, `unit`, `region`, `limitations`, `collectionMethod`;
- `lastAttemptAt`, `lastAttemptStatus` (`success`, `failed`, `not_attempted`), and bounded `error` text when a request or validation failed.

A failed refresh can have `status: observed` because the last verified snapshot is still available. Its `lastAttemptStatus: failed` and unchanged `fetchedAt` distinguish cached data from newly collected observations. A new catalog timestamp never updates the market observation date. UI freshness must use the source's observation date and frequency, and show failed collection attempts independently.

## JODI adapter and remaining unavailable inputs

The official [JODI downloads page](https://www.jodidata.org/oil/database/data-downloads.aspx) links the current-year refined-products CSV at:

`https://www.jodidata.org/_resources/files/downloads/oil-data/annual-csv/secondary/secondaryyear2026.csv`

The current-year URL is generated from the collection year; if JODI changes its naming convention or does not yet publish that file, the source remains unavailable until the adapter is updated. The web connector could verify the official download link but could not read its binary content type. Therefore the initial catalog contains no JODI numbers.

The strict CSV adapter requires `REF_AREA`, `TIME_PERIOD`, `ENERGY_PRODUCT`, `FLOW_BREAKDOWN`, `UNIT_MEASURE`, `OBS_VALUE`, and `ASSESSMENT_CODE`; it rejects an unknown schema. It selects `JETKERO` only (not the broader `KEROSENE`), `KTONS` only, and JP/KR/CN/SG/HK/TW where reported. Selected flows are refinery output (`REFGROUT`), demand (`TOTDEMO`), imports (`TOTIMPSB`), exports (`TOTEXPSB`), and closing stocks (`CLOSTLV`). A reported zero remains zero; missing cells are omitted. Original assessment codes are retained, not silently upgraded in quality. The [official code reference](https://www.jodidata.org/_resources/files/downloads/oil-data/jodi-wdb-short-long-names.pdf) documents dimensions. The source is monthly and subject to country coverage, reporting lag and revisions.

JODI aggregate observations are contextual. They never automatically set an airport's demand, an operator's available stock, or contracted route capacity. IATA/Platts remains `restricted`; UN Comtrade remains `unavailable` pending account access and verified commodity classification. Supplier executable offers, freight contracts, storage entitlements and local airport prices are also cataloged as unavailable. Editable modeled values are clearly separated from observed public feeds.
