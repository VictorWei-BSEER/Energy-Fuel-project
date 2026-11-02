# Planning airport directory

The planning map shows 50 scheduled-service airports ranked by calendar-year 2024 total passenger traffic within the existing map bounds: longitude 92–151° E, latitude 6° S–51° N. Size means passengers, not runway area, freight throughput, available fuel, or model demand. The 50th airport is Osaka Itami (ITM), with 15,157,501 passengers; the next eligible airport in the candidate table is Taiyuan (TYN), with 14,775,147.

The directory uses a fixed comparison year across countries. It is a versioned reference selection rather than a live traffic ranking, and some operator totals are rounded. It excludes airports outside the frame even when they are busier, including Delhi, Ürümqi, Jakarta and Bali. The geographic frame is unchanged. Passenger counts do not automatically expand the scenario network or provide fuel-price, demand, stock or capacity inputs.

Coordinates, names, and identifiers were retrieved from the public-domain [OurAirports dataset](https://ourairports.com/data/). The checked-in directory records collection time and the full coordinate CSV's SHA-256. Source municipality names are preserved.

Traffic references:

- Mainland China: [CAAC 2024 airport production statistics and throughput ranking](https://www.caac.gov.cn/XXGK/XXGK/TJSJ/202503/t20250314_226932.html), transcribed through the [2024 national ranking table](https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_China#2024_final_statistics).
- Japan: [MLIT airport management statistics](https://www.mlit.go.jp/koku/15_bf_000185.html), transcribed through the [calendar-year 2024 ranking table](https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_Japan#Busiest_Japanese_airports_by_passenger_traffic).
- Thailand: [AOT calendar-year 2024 traffic report, January–December](https://aot.listedcompany.com/misc/statistic/2025/20250117-aot-traffic-fiscal-2024-12m.pdf). These figures replace fiscal-year totals in the regional compilation; BKK is 62,234,693, DMK 30,490,635, and HKT 17,215,315.
- South Korea: [2024 national airport ranking](https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_South_Korea#2024_final_statistics). Incheon uses total passengers, not the smaller international-only figure.
- Other regional hubs: the [2024 Asia traffic compilation](https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_Asia#2024_statistics), which links individual operator/regulator reports. Rounded source totals are retained without inventing additional precision.

`src/airport-traffic-2024.json` preserves the candidate figures and their source keys. `dist/data/airport-directory.json` contains the selected 50 airports, source links, cutoff and next five excluded eligible airports. The separate observed-data collection feed remains a dated source snapshot; the planning directory has its own versioned provenance in the Sources tab.

To rebuild the geographic join after downloading the full OurAirports CSV:

```sh
python3 scripts/build_airport_directory.py --input-csv /path/to/airports.csv
npm run build
```

The application bundles the directory for offline availability. All 50 markers are rendered. IATA labels avoid collisions where possible; selecting an airport prioritizes its label, reveals traffic context, and centers zoom controls on it. The airport selector and arrow keys provide access to airports in dense clusters.
