# FUEL ATLAS / 东亚能源流向

A working single-period jet-fuel procurement and logistics optimizer with an offline East Asia map. Constructivist interface, public benchmark observations, editable supply/demand assumptions, constrained allocation, stress scenarios and reproducible exports.

## Run

Node.js 22+ and Python 3.10+ are recommended. The browser app has no runtime dependencies.

```sh
npm run dev
```

Open http://localhost:4173. To run checks:

```sh
npm ci
npm test
npm run check
```

## What works

- Three illustrative supply hubs and three demand hubs on a real Natural Earth geographic base.
- Exact continuous min-cost maximum-flow optimization, including residual rerouting, supply limits and route capacity limits.
- Existing inventories and closing reserve targets adjust each destination's required delivery.
- Editable benchmark, supplier capacity/basis, demand and logistics assumptions; base, Gulf shock and Singapore outage scenarios.
- Procurement/logistics cost breakdown, allocation and unmet demand; baseline savings shown only when both solutions fulfill demand.
- A real, dated EIA US Gulf Coast jet-fuel benchmark snapshot, with source, units, acquisition method and density conversion.
- Scenario export and an independent educational aircraft-tankering model module.

## Refresh observed data

```sh
npm run collect
```

The collector downloads EIA's public daily HTML and atomically updates `dist/data/market.json`. It requires outbound HTTPS access to www.eia.gov. Failed fetches or validation preserve the previous file. The checked-in initial snapshot was acquired from the official EIA page through a web connector; direct runtime fetching was not integration-tested in the restricted build environment.

`.github/workflows/refresh-market.yml` provides weekday/manual refresh when present on the repository's default branch with Actions write permission. That workflow updates the source snapshot; it does not automatically republish the separately hosted Sites preview. Rebuild/redeploy that preview to carry a new snapshot. No schedule has been verified as running yet.

## Data and model boundaries

EIA is a **US Gulf Coast FOB benchmark**, not an Asian port or airport executable quote. All supply capacities, demand, inventory, reserve, regional basis, freight, handling and storage figures are **editable scenario assumptions**. The USD/tonne conversion assumes density 0.8 kg/L and 3.785411784 litres per US gallon.

The optimization covers one common planning period and a single interchangeable product. It is a continuous transportation model with an inventory-adjusted delivery requirement. It does not model vessel scheduling, lead times, integer cargo lots, credit limits, tax treatment, quality/blending, multi-period storage, emissions, hedging, or execution. Those require additional data and constraints. Cost savings are comparisons with a disclosed shipping-cost-first heuristic, not realized trading profit.

When infeasible, displayed delivery cost covers only the partial allocation; unmet requirements remain explicit and savings comparisons are suppressed. Animated routes depict model allocations, not observed ships or flights. Source dates and collection dates are distinct. Public benchmark observations are not a live tick feed.

## Files

- `dist/index.html`, `styles.css`, `app.js`: static browser interface.
- `dist/optimizer.js`: physical procurement/transport solver and assumptions.
- `dist/model.js`: separate simplified aircraft-tankering model, not operational dispatch advice.
- `dist/asia-map.js`: offline Natural Earth map geometry.
- `dist/data/market.json`: observed public benchmark snapshot.
- `scripts/collect_market.py`: collector and validation.
- `tests/`: solver, model, ingestion and interface checks.
- `docs/data-sources.md`, `docs/map-source.md`: data provenance.

No API keys are required, no orders are placed, and no third-party tracking or external map tiles are loaded.
