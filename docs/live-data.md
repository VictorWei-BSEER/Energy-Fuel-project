# Public market display and data-feed access

The homepage embeds public **WTI and Brent crude CFD charts**, alongside its five collected public datasets. The charts use TradingView's official widget and OANDA instruments; they do not require a key in the application. No airport supplier quote feed or executable offer API is connected. The application never generates ticks, advances quote timestamps, or fills missing commercial observations with modeled values.

## Public market charts

| Instrument | TradingView symbol | Meaning |
| --- | --- | --- |
| WTI crude | `OANDA:WTICOUSD` | OANDA West Texas Oil CFD, not a NYMEX futures contract or physical cargo offer |
| Brent crude | `OANDA:BCOUSD` | OANDA Brent Crude Oil CFD, separate from the EIA Brent FOB spot observation below |

TradingView's [official widget market list](https://www.tradingview.com/widget-docs/markets/worldwide/) lists OANDA commodity coverage, and its symbol pages identify [WTI](https://www.tradingview.com/symbols/WTICOUSD/?exchange=OANDA) and [Brent](https://www.tradingview.com/symbols/BCOUSD/?exchange=OANDA). The [official widgets](https://www.tradingview.com/widget/) are supplied for embedding with TradingView attribution retained. The app appends the documented `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js` script with an explicit container size and no credential.

The provider controls quote time, market status and delay indicators. We do not infer a fixed 10- or 15-minute delay. The default `interval: "15"` selects **15-minute candles**, and `timezone: "Asia/Shanghai"` displays chart times in UTC+8. Neither setting changes feed latency. A loaded script or frame only confirms that the external display loaded, not that an instrument is trading or its last quote is fresh. Timeouts and loading errors leave the source links and retry control available.

These charts are **display only**. The [data FAQ](https://www.tradingview.com/widget-docs/faq/data/) does not provide a widget data-export/API facility; [TradingView terms](https://www.tradingview.com/policies/) restrict non-display use of its market data. The application therefore does not read iframe prices, persist them in GitHub, add them to CSV/JSON exports, or use them as optimizer inputs. The existing EIA/ECB/JODI datasets remain the independently collected and exportable observations.

The official documentation, symbols, configuration and local loading/failure behavior were verified. The managed execution environment has no supported browser QA facility, so an actual cross-origin quote render was not visually verified here. Availability can depend on the visitor's network, browser policy and provider.

## What updates now

| Source | Observations | Collection/check cadence |
| --- | --- | --- |
| EIA USGC jet fuel and Europe Brent spot | Daily observation dates, published with reporting lag; daily observations do not imply daily releases | Hourly collector check |
| ECB FX | Business-day informational reference rates | Hourly collector check |
| JODI jet kerosene | Monthly national reports with reporting lag and assessment flags | Daily collector check |
| OurAirports | Community-maintained reference coordinates, no record-level observation time | Daily collector check |

GitHub Actions schedules are best effort. The visible page checks these stored snapshots every 60 seconds; that timer is independent of the TradingView chart's own connection. Source observation time, retrieval time and page-check time remain separate. Refreshing a file never makes its underlying observation newer.

## Verified paths to a real stream

**CME futures:** the [official real-time WebSocket API](https://cmegroupclientsite.atlassian.net/wiki/spaces/EPICSANDBOX/pages/457414253/Real-Time%2BFutures%2Band%2BOptions%2BWebSocket%2BAPI) uses `wss://markets.api.cmegroup.com/marketdatastream/v1`, with OAuth credentials and market entitlements. Its token endpoint is `https://auth.cmegroup.com/as/token.oauth2`. A service must hold credentials server-side, subscribe only to entitled instruments, preserve instrument/contract/event time, and report disconnects, delays and stale values. Futures remain a separate market from physical jet fuel and airport uplift prices. This connector is **not implemented or activated**.

**Asian physical oil markets:** [S&P Platts eWindow Market Data](https://www.spglobal.com/content/dam/spglobal/ci/en/documents/platts/en/software-user-manuals/ewinmktdata.pdf) provides market bids, offers and trades to entitled CSM/CSM+ subscribers. Obtain the subscribed-market schema and connection documentation before writing an adapter; the endpoint and quote fields must not be guessed. Market data access does not itself authorize this project to transact.

**Airport uplift and logistics:** supplier/counterparty offers must provide grade, delivery location and basis, currency and unit, price, available volume, validity/expiry and material supply conditions. Contracted freight, storage and inventory inputs are also needed for an actionable procurement plan. A crude futures stream or national balance cannot supply these inputs.

Do not put credentials in frontend JavaScript, exported scenario files, public GitHub data or chat. A credentialed numerical market-data API requires a server runtime and secure server-side configuration. The current site is static; its official public chart embed and collected reference feeds require no secret.

## Why the free demo is not connected

OilPriceAPI's public demo can return real indicative front-month futures prices, with observation and collection times. It is rate-limited to 25 requests per day per IP; it is neither a tick stream nor an executable fuel offer. The provider's [redistribution policy](https://www.oilpriceapi.com/docs/redistribution) and [data-usage terms](https://www.oilpriceapi.com/legal/data-usage) state it cannot convey exchange public-display rights. Those demo prices are therefore not copied into this project's public repository or represented as a licensed live feed. Its [jet-fuel catalog](https://docs.oilpriceapi.com/api-reference/commodities/catalog/jet-fuel-usd/) also identifies EIA publication frequency, not real-time jet quotations.
