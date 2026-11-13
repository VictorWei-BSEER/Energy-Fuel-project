# Configurable route model and transparent synthetic inputs

Fuel Atlas can calculate a user-defined itinerary of **one to five continuous legs**, chosen from the 67-airport directory. The user chooses the route; the optimizer chooses how much fuel to purchase at each departure. A one-leg route provides fuel requirements and feasibility with no cross-station tankering arbitrage. It does not search for an optimal itinerary or execute purchases.

Airport coordinates are sourced from OurAirports. The airport prices, supply caps and generic aircraft parameters described here are **generated scenarios**, not observed quotes, stock reports or certified aircraft performance. Their purpose is to make every selected route calculable from inspectable assumptions while actual operator and supplier data are unavailable. A failed constraint remains a failed constraint; the generator never invents a larger tank, lower payload or favourable quote to make a route work.

## Source of truth and reproduction

- `dist/scenario-data.js` contains the deterministic functions, default parameters, bilingual field labels, units and replacement-data descriptions.
- `dist/data/scenario-dataset.json` contains the complete generated 67-airport dataset, regional assumptions, two generic aircraft profiles and provenance metadata.
- `scripts/build_scenario_data.mjs` rebuilds the JSON or verifies exact equality with it.
- `tests/scenario-data.test.mjs` checks the complete dataset, formulas, overrides, route envelopes, one-to-five-leg calculations, invalid inputs and every directed airport/profile pair.

```sh
node scripts/build_scenario_data.mjs
node scripts/build_scenario_data.mjs --check
node --test tests/scenario-data.test.mjs tests/flight-optimizer.test.mjs
```

There is no random number generator, seed, network request or build-time clock. Identical inputs produce identical output. The revision date identifies this assumption set; it is not a fuel-price observation date. The builder verifies the coordinate snapshot hash and retrieval time against `global-airports.json` before writing the dataset. Coordinate records have no per-airport observation timestamp.

## Airport prices: five visible components

All prices use USD per metric tonne. For airport `a`:

```text
scenarioPrice(a) = commonJetBase
                 + regionalSupplyAdjustment(a)
                 + greatCircleDistance(a, referenceHub(a)) × transportCoefficient
                 + intoPlaneServiceAdjustment(a)
                 + fiscalAdjustment
```

The common base is **800 USD/t**, the transport coefficient is **0.015 USD/t/km**, and the default fiscal adjustment is **0 USD/t**. These are analyst-selected normalizations. They are not fitted to the public market feed. A zero fiscal adjustment does not assert that a real operator or flight is tax exempt.

| Scenario group | Reference airport | Supply adjustment, USD/t | Service adjustment, USD/t |
| --- | --- | ---: | ---: |
| East Asia | ICN | 85 | 60 |
| Southeast Asia | SIN | 0 | 45 |
| South Asia | DEL | 95 | 65 |
| Gulf | DXB | −70 | 40 |
| Europe | AMS | 110 | 75 |
| North America | DFW | 60 | 65 |
| South America | GRU | 120 | 80 |
| Africa | JNB | 150 | 85 |
| Oceania | SYD | 140 | 80 |

The table deliberately creates editable supply-basis scenarios to test economic trade-offs. It is not evidence of relative fuel costs or competition in those markets. Reference airports are geographic anchors, not claims about real refineries, terminals, supplier relationships or routes. Straight-line hub distance is a transport-cost proxy; it does not reconstruct a pipeline, road or marine journey. Airport-region assignment follows explicit country groups for the Gulf, Southeast Asia and South Asia, then the OurAirports continent field. The complete assignment is exported per record.

For example, SIN is its own scenario reference airport, so its distance component is zero. Its generated price is `800 + 0 + 0 + 45 + 0 = 845 USD/t`. Moving the common base up by 100 raises every generated price by exactly 100. Changing an airport-specific service adjustment affects only that airport. Changing a regional basis affects that group's airports, and changing its reference hub recomputes their distance components.

Every airport has a default **120 t per visit** supply cap. This is a simple common scenario bound, chosen above the generic widebody's 110 t tank capacity so it does not create unexplained default airport bottlenecks. It is not daily throughput, storage, observed availability or a supplier allocation. Set a smaller cap to study rationing, or zero to study no uplift at that visit. Repeated visits receive separate visit caps; they do not deplete a shared airport stock. A time-indexed inventory model requires additional data and the separate supply-chain engine.

## Why these starting magnitudes were chosen

This is a **designed sensitivity experiment**, not a statistical estimate. The parameters have explicit economic roles:

- The 800 USD/t common base is a normalizer. For this fuel-only objective, multiplying the entire airport-price vector by a positive constant changes cash totals by that constant without changing the optimal feasible uplift quantities. The meaningful first comparison is the price ratio, not the absolute starting normalization. Changing only the common base leaves the other adjustments fixed, so it changes those price ratios and can change the preferred plan; this is different from scaling the entire price vector.
- Regional bases span −70 to +150 USD/t, or **−8.75% to +18.75%** of that normalizer. Service allowances span **5% to 10.625%**. Together with distance, this deliberately creates comparisons both below and above plausible *modelled* carriage hurdles. For example, the exponential approximation with 0.025/h has a 19.1% hurdle over seven hours; that is a consequence of the assumption, not a market observation.
- Each geographic group is assigned a visible experimental role: neutral reference, discounted origin, moderate premium, or high-cost stress case. That assignment does **not** establish a real regional cost hierarchy. It may be changed in the regional editor; the dataset exports the starting hypothesis and the current basis/service percentages separately.
- The transport coefficient adds **15 USD/t per 1,000 km**, equal to **1.875%** of the starting base. A 10,000 km reference distance adds 150 USD/t. This transparent linear response permits a controlled logistics sensitivity; no actual shipment route or tariff is implied.
- The 120 t/visit cap is deliberately above the 110 t widebody tank. Default results therefore do not depend on arbitrarily assigning some airports a binding supply shortage. A cap reduction is an explicit intervention rather than a hidden initial data choice.

The generic mass parameters also have an internal design: the widebody's 150 t zero-fuel weight leaves 90 t of takeoff fuel headroom and 40 t of landing fuel headroom, compared with a 110 t tank. The narrowbody's 54 t zero-fuel weight leaves 25 t and 13 t, compared with a 26 t tank. Distinct limits allow the optimizer to expose which constraint binds. These values are not presented as certified aircraft limits or empirically calibrated fuel consumption.

`SCENARIO_DESIGN` and each airport record's `design` object export this reasoning. They do not turn assumptions into observations. For a real-data model, the appropriate replacement is evidence about each field, not additional decimal places or a more elaborate unsupported scoring formula.

## Generic aircraft assumptions

These profiles provide coherent scales for experimentation. They are not named commercial aircraft, certified specifications or operational fuel plans. All numerical fields below can be changed through the generator API; the workspace also supports explicit per-leg overrides.

| Parameter | Unit | Generic widebody | Generic narrowbody |
| --- | --- | ---: | ---: |
| Usable tank assumption | t | 110 | 26 |
| Maximum takeoff assumption | t | 240 | 79 |
| Maximum landing assumption | t | 190 | 67 |
| Operating-empty weight proxy | t | 128 | 42 |
| Fixed payload | t | 22 | 12 |
| Cruise groundspeed proxy | km/h | 850 | 840 |
| Cruise-equivalent burn rate | t/h | 4.8 | 2.4 |
| Additional non-cruise time | h | 0.30 | 0.25 |
| Additional non-cruise fuel | t | 2.0 | 0.8 |
| Taxi fuel | t | 0.30 | 0.20 |
| Minimum arrival reserve | t | 6 | 3 |
| Holding burn rate | t/h | 3.0 | 1.5 |
| Holding-time allowance | h | 0.5 | 0.5 |
| Alternate-fuel allowance | t | 2 | 1 |
| Contingency on base burn | fraction | 0.05 | 0.05 |
| Marginal carriage coefficient | 1/h | 0.025 | 0.035 |
| Initial fuel | t | 8 | 4 |
| Lower approximation distance | km | 200 | 150 |
| Upper approximation distance | km | 14,000 | 6,500 |
| Upper approximation airborne time | h | 17 | 8.5 |

Both profiles use a 1.05 route-distance factor and the exponential marginal-retention approximation by default. The coefficient choices fall within the indicative 2.5–4.5% per-hour range discussed in the [ICAO Environmental Report 2022](https://www.icao.int/sites/default/files/environmental-protection/Documents/EnvironmentalReports/2022/ENVReport2022_Art38.pdf). Selecting these values for the generic profiles and choosing the retention law are analyst decisions. The literature does not calibrate either profile or establish that all widebodies have a lower penalty than all narrowbodies.

The distance and time envelopes are limits of this chosen approximation, not published aircraft maximum ranges. They are editable assumptions that should be replaced by the validated scope of an operator's performance data. Changing them does not relax the fuel/weight constraints.

## Route derivation

Spherical haversine distance uses sourced coordinates and an Earth radius of 6,371.0088 km. The following values are derived for each user-selected leg:

```text
routedDistanceKm = greatCircleDistanceKm × routeFactor
cruiseEquivalentHours = routedDistanceKm / cruiseSpeedKph
airborneHours = cruiseEquivalentHours + additionalNonCruiseHours
baseBurnT = cruiseEquivalentHours × cruiseBurnTPerH + additionalNonCruiseFuelT
reserveT = max(reserveMinimumT,
               contingencyFraction × baseBurnT
               + holdingReserveH × holdingBurnTPerH
               + alternateFuelT)
zeroFuelWeightT = emptyWeightT + payloadT
carryBurnRate = 1 − exp(−carryCoefficientPerH × airborneHours)
```

The non-cruise quantities are **additive allowances over a cruise-equivalent distance model**, not measured independent flight phases. No wind, airspace closure, operational route, climb profile or observed schedule is inferred. Taxi fuel is added separately before takeoff. The reserve decomposition is a scenario convention, not a statement of regulatory compliance or an operator's reserve policy.

A selectable linear alternative uses `carryBurnRate = carryCoefficientPerH × airborneHours`. If the loss reaches or exceeds one, generation reports an invalid retention domain rather than clipping the result. Other envelope or minimum-fuel failures return explicit reasons. Generated fuel and weight quantities are retained for diagnosis.

The fixed-rotation optimizer then applies fuel continuity, nonnegative uplift, tank, takeoff, landing, reserve and visit-cap constraints. It matches final fuel to the just-in-time baseline. A generated leg can be within its approximation envelope but still belong to an infeasible rotation because of initial fuel or cross-leg supply restrictions. The generator's `valid` flag is not an operational clearance and does not replace the optimizer's feasibility result.

## JavaScript interface

```js
import {
  AIRCRAFT_PROFILES, SCENARIO_DEFAULTS, ASSUMPTION_CATALOG,
  airportScenario, deriveLeg, deriveScenario, buildScenarioDataset,
} from './scenario-data.js';

const assumptions = {
  pricing: { baseJetUsdPerT: 900, taxAdjustmentUsdPerT: 0 },
  regions: { east_asia: { basisUsdPerT: 100 } },
  airportOverrides: { HKG: { maxUpliftT: 0, serviceUsdPerT: 70 } },
  aircraft: { payloadT: 20, carryModel: 'exponential' },
  initialFuelT: 8,
};
const scenario = deriveScenario(['SIN', 'HKG', 'NRT'], 'widebody', assumptions);
const singleLeg = deriveLeg('SIN', 'HKG', 'widebody', assumptions);
const airportInput = airportScenario('HKG', assumptions);
const completeDataset = buildScenarioDataset(assumptions);
```

`deriveScenario` accepts 2–6 IATA codes or 1–5 continuous `{from,to}` leg objects. It returns the optimizer fields plus the explicit assumptions, per-leg derivations, classification and provenance. `deriveLeg` supports a partially assembled itinerary without guessing the remaining route. Airport codes must be in the shared directory; origins and destinations cannot be identical. Malformed values, unknown option fields and non-finite formula results throw clear errors. The API never silently coerces numeric strings or ignores unknown airport overrides.

Each generated leg returns `errors` and structured `issues`:

- `scope: "envelope"`: distance below/above the approximation or time above its envelope. An unrelated price edit cannot clear these.
- `scope: "minimum-feasibility"`: minimum tank, takeoff or landing failure. The core solver must recheck these after explicit fuel or mass overrides.
- `scope: "parameter-domain"`: the selected carriage law leaves no positive retained fuel. A valid explicit carriage assumption is needed.

Generated and manually overridden values must be distinguished in exported scenarios. Imported supplier quotations belong to a separate data mode; unavailable, expired or rejected quotations must remain unavailable there. A missing quotation must never be filled from this synthetic dataset without the user explicitly switching to generated-scenario mode.

## Replacing assumptions with real data

The exported assumption catalog names a replacement source for every field. A practical migration is field-by-field:

| Current input | Potential real replacement | Required checks |
| --- | --- | --- |
| Common base | Licensed dated jet-fuel assessment; public EIA wholesale observations for context | Product, location, observation period, currency and unit; do not call it an airport quote |
| Basis, delivery fee and fiscal treatment | Dated supplier contract/into-plane offer and applicable tax evidence | Same mission/operator, delivery basis, fees, taxes, volume terms, validity and payment terms |
| Visit cap | Supplier-confirmed allocation for the uplift window | Quantity, timing, delivery rights and repeated-visit accounting |
| Route and burn | Operator-authorized route/performance planning | Aircraft, payload, weather, route, regulatory reserves and performance limits |
| Existing fuel and payload | Operational inventory/load plan | Measurement time, units and correspondence to the selected rotation |

No paid account is required to run the synthetic model or inspect the public reference data. Actual into-plane procurement and validated flight planning require the corresponding supplier/operator evidence; adding a public benchmark alone does not provide it.

## Validation completed for this release

The committed tests verify all 67 decompositions, deterministic JSON regeneration, independent spherical geometry, additive price changes, profile override propagation, infeasible-envelope handling and route lengths from one to five legs. Every directed pair of distinct airports is generated under both profiles: **8,844 airport/profile pairs**, each with finite values and an explicit validity result. Selected generated itineraries are passed through the optimizer and checked for whole-rotation fuel conservation, common terminal stock and absence of spurious single-leg arbitrage. The archived research results and explanatory essay remain a separate frozen analysis.
