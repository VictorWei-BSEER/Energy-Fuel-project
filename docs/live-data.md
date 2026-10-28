# Live market data: connection state and requirements

The default monitor displays real published observations, **not a real-time price stream**. No live pricing credentials are configured and no live provider adapter is running. The `DISCONNECTED` indicator is intentional. The application does not generate ticks, forward-date values, use futures as airport quotes, or replace missing commercial data with modeled numbers on the homepage.

## What updates now

| Source | Observations | Collection/check cadence |
| --- | --- | --- |
| EIA USGC jet fuel and Europe Brent spot | Daily observation dates, published with reporting lag; daily observations do not imply daily releases | Hourly collector check |
| ECB FX | Business-day informational reference rates | Hourly collector check |
| JODI jet kerosene | Monthly national reports with reporting lag and assessment flags | Daily collector check |
| OurAirports | Community-maintained reference coordinates, no record-level observation time | Daily collector check |

GitHub Actions schedules are best effort. The visible page checks these stored snapshots every 60 seconds; it does not poll an exchange or the source websites. Source observation time, retrieval time and page-check time remain separate. Refreshing a file never makes its underlying observation newer.

## Verified paths to a real stream

**CME futures:** the [official real-time WebSocket API](https://cmegroupclientsite.atlassian.net/wiki/spaces/EPICSANDBOX/pages/457414253/Real-Time%2BFutures%2Band%2BOptions%2BWebSocket%2BAPI) uses `wss://markets.api.cmegroup.com/marketdatastream/v1`, with OAuth credentials and market entitlements. Its token endpoint is `https://auth.cmegroup.com/as/token.oauth2`. A service must hold credentials server-side, subscribe only to entitled instruments, preserve instrument/contract/event time, and report disconnects, delays and stale values. Futures remain a separate market from physical jet fuel and airport uplift prices. This connector is **not implemented or activated**.

**Asian physical oil markets:** [S&P Platts eWindow Market Data](https://www.spglobal.com/content/dam/spglobal/ci/en/documents/platts/en/software-user-manuals/ewinmktdata.pdf) provides market bids, offers and trades to entitled CSM/CSM+ subscribers. Obtain the subscribed-market schema and connection documentation before writing an adapter; the endpoint and quote fields must not be guessed. Market data access does not itself authorize this project to transact.

**Airport uplift and logistics:** supplier/counterparty offers must provide grade, delivery location and basis, currency and unit, price, available volume, validity/expiry and material supply conditions. Contracted freight, storage and inventory inputs are also needed for an actionable procurement plan. A crude futures stream or national balance cannot supply these inputs.

Do not put credentials in frontend JavaScript, exported scenario files, public GitHub data or chat. A live integration requires a server runtime and a secure server-side configuration. The current site is static; its public reference feeds require no secret.

## Why the free demo is not connected

OilPriceAPI's public demo can return real indicative front-month futures prices, with observation and collection times. It is rate-limited to 25 requests per day per IP; it is neither a tick stream nor an executable fuel offer. The provider's [redistribution policy](https://www.oilpriceapi.com/docs/redistribution) and [data-usage terms](https://www.oilpriceapi.com/legal/data-usage) state it cannot convey exchange public-display rights. Those demo prices are therefore not copied into this project's public repository or represented as a licensed live feed. Its [jet-fuel catalog](https://docs.oilpriceapi.com/api-reference/commodities/catalog/jet-fuel-usd/) also identifies EIA publication frequency, not real-time jet quotations.
