# Integrated fuel-model browser review — 13 November 2026

This review covers a single connected fuel model: upstream procurement and transport, airport inventory, and aircraft fuel uplift. A shared calculation and export must describe the same scenario. It does not treat juxtaposed interfaces or matching visual styles as evidence of mathematical integration.

## Acceptance criteria

| Area | Required browser behavior |
| --- | --- |
| Unified navigation | Four primary tabs—Model, Data, Research and Method—share one shell and retain the entered scenario. Former Sources links open the source plan within Data. Legacy network and planner URLs return to the integrated workspace. |
| Initial state | One empty origin–destination row, no implied calculation or moving aircraft. Loading examples remains an explicit action. |
| Route creation | Choose any supported airport; add, reorder and remove stops while keeping one to five continuous legs. |
| Causal integration | A controlled upstream constraint change affects airport fuel availability and aircraft uplift or feasibility. Restoring the constraint restores the corresponding solution. The test records the actual scenario and change. |
| Single calculation | One Calculate action updates procurement, transported quantities, airport stock balances, aircraft uplift and total cost from the same solve. Input changes invalidate the whole result. |
| Accounting | Exported component costs reconcile with the objective. Airport mass balances reconcile arrivals, initial stock, aircraft withdrawal and ending stock; aircraft fuel balances remain independently checkable. |
| Quotation boundary | Imported into-plane quotations use the quoted price once. Missing required quotes block calculation; synthetic upstream purchasing or transport costs are not silently added to a delivered price. |
| Retained state | Changing tabs or language retains selected route, numerical inputs, upstream assumptions, quotation mode, loaded quotes and paused animation. The selected language survives reload. |
| Data presentation | Generated network inputs and their assumptions are inspectable and are clearly distinguished from observations or commercial offers. |
| Presentation | Both languages, four viewports (320, 390, 768, 1440), four sections: 32 combinations. Capture empty, calculated and constrained model views plus key data/research/method views. Check actual map/footer rendering, not just document overflow. |
| Accessibility and runtime | Eight automated WCAG 2/2.1 A/AA scans, keyboard navigation, deep links, browser history, no uncaught JavaScript errors or failed local runtime assets. |

## Review status

The focused causal browser case passed, including a second pass for keyboard focus and retained invalid inputs. The first full run passed ten acceptance groups and all 32 layout combinations, then found an integrated-form eyebrow contrast of 3.13:1 (`#8393a7` on white, 9 px). The text is now darker and 11 px. Screenshot review also exposed a lower-specificity airport-select rule, which left the English placeholder clipped; the corrected selector now displays it in full.

The next full run passed twelve groups, all 32 expanded layouts and eight accessibility scans with zero violations, but stopped on a test expectation that legacy in-page aliases would rewrite their URL hash. The application correctly opened the right panel while retaining the entered alias. The harness now distinguishes preserved in-page aliases from redirected legacy HTML entry points. The corrected final self-start run passed all **15 acceptance groups**. It repeated all **32 expanded language/viewport/section combinations** and **eight WCAG 2/2.1 A/AA scans**, with **zero automated violations**, zero unexpected visible-language candidates, no uncaught JavaScript errors, no failed local assets and no removed-provider requests.

The final report is `/workspace/artifacts/fuel-atlas-integrated-review/final-2/browser-review.json`, checked at 2026-11-13T01:08:54.732Z. The runner started and stopped its own HTTP server. Previous partial reports and screenshots are retained rather than overwritten. The prior configurable-model and localization reviews remain historical evidence for the previous interface.

## Causal evidence

The browser selects SIN → HKG → NRT and changes the HKG supplier purchase input to USD 500/t. The resulting joint plan uplifts **23.5141 t at SIN and 19.8651 t at HKG**, with total cost **USD 31,610.49**. Setting the HKG supply-route capacity to zero changes the plan to **45.1792 t at SIN and effectively zero at HKG**, with total cost **USD 38,176.41**. The minimum-uplift baseline becomes infeasible, and both savings fields correctly become null.

Restoring capacity restores the previous objective. A separate USD 25/t increase in the SIN delivered reference appears once as an explicit basis adjustment and changes the objective. The test reads the downloaded user artifact and independently reconciles all eight cost components, allocated flight-leg costs, shared supplier capacities and deliveries into airport receipts, airport stock equations, aircraft departure/landing fuel equations and final stock targets. UI delivery-window numbers match the export's one-based stages.

Evidence from the first focused run is saved in `/workspace/artifacts/fuel-atlas-integrated-review/causal-1/`, including normal and outage plan JSON files, bilingual screenshots and the machine-readable test report.

## Reproduction and boundaries

The reusable command is `npm run test:browser` after installing dependencies, Chromium and building the application. The runner can start and stop its own static HTTP server. `FUEL_BROWSER_PATH`, `FUEL_BROWSER_OUTPUT` and `FUEL_BASE_URL` optionally select the browser, artifact directory and existing server.

Public repository feed requests receive checked-in immutable snapshots with recorded hashes. Removed TradingView/OANDA requests fail acceptance. Browser tests do not verify a live supplier service. Synthetic prices, stock limits and generic aircraft performance remain modeling assumptions.

Chromium, selected keyboard interactions and automated accessibility scans provide bounded evidence. They do not establish screen-reader compatibility, cross-browser certification, observed physical supply or dispatch readiness. Automated incomplete checks and any remaining issues will be recorded with the final result.

The independent [integrated localization review](2026-11-13-integrated-localization-review.md) covers 850 translation entries and 36 field-description pairs, including invalid lead times, infeasibility, ground-stock meaning and delivered-quotation cost boundaries.

## Final acceptance and visual review

The completed suite verifies blank-first setup, explicit examples, one-to-five-leg routes, the global-map playback and footer, shared pricing assumptions, tab and language retention, keyboard navigation, legacy research/network/planner entry points and Sources aliases. Supplier input commits preserve normal Tab movement. An invalid pending supply value survives a temporarily incomplete route and a language change, blocks calculation/export and recovers only when corrected.

Imported quote mode was exercised with missing and complete origin coverage. Missing quotes block calculation. With complete offers, all modeled procurement, freight, handling, basis, holding, into-plane and tax components are zero; the delivered-quotation component equals the total objective and the aircraft uplift multiplied by its all-inclusive prices. Quote state and results remain intact through both languages and all four tabs.

Empty and calculated model, global map, constrained joint results, Data, Research and Method screenshots were reviewed. Additional below-the-fold mobile captures in `/workspace/artifacts/fuel-atlas-integrated-review/mobile-detail/` show the supply editors and joint result cards in both languages. Dense input and accounting tables use their own horizontal scroll region; they do not widen the page. Financial and mass displays are rounded for readability, while the JSON export retains numerical precision.

The final JSON retains automated manual-review candidates for SVG/map contrast, visible/accessibility-name matching and inline-link presentation. No claim of exhaustive accessibility certification is made. The default reproducible CI artifact directory is `artifacts/browser-review/`. The focused causal case can be rerun with `FUEL_BROWSER_CASE=integrated npm run test:browser`; the full release regression remains `npm run test:browser`.
