# Market data and collection

The initial working data feed is the **U.S. Gulf Coast Kerosene-Type Jet Fuel Spot Price FOB**, published on the [official EIA daily history page](https://www.eia.gov/dnav/pet/hist/eer_epjk_pf4_rgc_dpgD.htm). Its unit is USD per **US gallon**. It is a regional wholesale reference, not an East Asian price, delivered cargo quote, airport refuelling offer, or executable transaction.

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

A daily schedule is sufficient to detect newly published data. Daily observations do not imply same-day publishing or a streaming quotation service. The GitHub workflow, if installed on the repository's default branch with write permission, refreshes only the JSON file. It has not been executed or enabled by this development task. Updating GitHub data alone does not redeploy the private Sites preview; that requires the project's publishing workflow.

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
| [JODI](https://www.jodidata.org/about-jodi/faqs.aspx) | Monthly production, imports, exports, stocks and demand | Public official source; verify national coverage and jet-fuel/kerosene definitions. Not integrated |
| [OurAirports](https://ourairports.com/data/) | Airport coordinates and identifiers | Public-domain dataset; does not supply commercial airport fuel quotes. Not integrated as an automated feed |

All future connectors should preserve source URL, observation and retrieval times, location, product grade, unit, currency, delivery basis, data status, and usage terms. Keep observed, estimated and scenario data distinguishable in storage and on screen. A quote is only executable when its counterparty, quantity, delivery, validity and other material conditions are known.
