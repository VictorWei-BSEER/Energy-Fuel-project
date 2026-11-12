# Fuel Atlas product review — 13 November 2026

Review scope: navigation, interaction continuity, accessibility, evidence presentation and the journey from a model result to its research basis. Initial source baseline: `a681f24fab7ec18d2a8f540ea62111a040cbc8c9`. This is a source and simulated-DOM review, not a claim of browser or assistive-technology certification. Subsequent verification is recorded below.

## Initial diagnosis

The interface has two different product shells. The model, market and sources use mounted ARIA tabs and retain local state. Research is an ordinary link to a separate document, whose header, tabs, width, typography and content hierarchy are independently implemented. Returning from that document recreates the application and loses its in-memory state. Consistent colors do not resolve this difference in behavior.

The corrective design is one application shell with model, market, research, project brief and source panels. The offline research exhibit remains a separately identified artifact. Research must retain its own reading hierarchy without becoming a second top-level navigation system.

## Findings and remediation requirements

| ID | Priority | Observed issue | Required outcome |
| --- | --- | --- | --- |
| UX-01 | P1 | `index.html` links to `./research/`, while the other destinations are `data-workspace` tabs. Research uses a different masthead/product navigation and a separate document. | Use one shell and one top-level tab implementation. Model inputs, quote set, result and paused playback progress survive visiting Research and returning. |
| UX-02 | P1 | Research CSS includes global `:root`, `body`, `*`, heading, button and common class rules. Simply injecting it into the main application would change unrelated panels. The research document also has its own `main` ID and relative figure/download paths. | Scope research style rules and variables to its panel. Guarantee unique DOM IDs, correct relocated asset URLs and one top-level main landmark. Loading Research must not change model or market controls. |
| UX-03 | P1 | All 67 SVG airport groups receive `tabindex="0"`, including offscreen airports when the map is cropped to East Asia. Keyboard users must traverse dozens of invisible/unhelpful stops before playback and results. | Use a documented roving-focus pattern or a small visible selection, with an accessible airport picker/table. No offscreen map node should remain in the tab sequence. Enter/Space should inspect; Escape should dismiss the tooltip. |
| UX-04 | P1 | Changing an airport calls `renderForm()`, which replaces the focused `<select>` with a new node. Deleting a leg likewise destroys its focused button. | Preserve focus by stable field identity when a row rerenders. After deletion, focus an adjacent usable row/control. Keyboard selection must not send focus to the document body. |
| UX-05 | P1 | Quote import awaits `file.text()` without an import generation. A slower earlier file can finish after a newer selection and overwrite the intended quote set. Clearing quotes can also be undone by an outstanding read. | Only the latest selected import can commit state. Clearing quotes invalidates pending reads. Errors preserve the intended existing state and identify what was accepted/rejected. |
| UX-06 | P2 | Main decision controls, numeric explanation and errors are predominantly Chinese while the report is English. A reader of the English research cannot independently operate the central example. | Provide a coherent English or bilingual decision path covering price mode, route, constraints, calculation, results, errors and export. Mark English panel content with `lang="en"` within a Chinese document, or provide a deliberate application language setting. |
| UX-07 | P2 | The route workspace presents financial savings prominently; the research separately exposes physical displacement and CO₂. A presenter can mistake a visually convincing global example for calibrated operational evidence. | Keep the scenario classification adjacent to results; explain fixed-route uplift optimization and the separate marginal research model. Provide a decision brief with measured/assumed/unproven distinctions and a pilot acceptance design, without invented realized savings, customers, TAM or institutional endorsement. |
| UX-08 | P2 | Existing workspace hash handling recognizes only tab names. Research introduces many in-page anchors, and old links include `/research/#essay`. | Resolve report section deep links to the Research panel; Back/Forward must select the correct tab and section. Invalid hashes must fail safely. The offline package must retain its local links and work without the application shell. |

## Acceptance matrix

| Journey | Objective acceptance condition | Evidence required |
| --- | --- | --- |
| Shared shell | Exactly one primary header/nav and one selected top-level tab; consistent order/labels on all hosted entry routes. | DOM structure plus browser screenshots at model and report routes. |
| Model → Research → Model | Edited input, imported quotes, computed result and paused progress remain unchanged; hidden model does not keep advancing. | Integration test and manual browser round trip. |
| Report deep links | Direct legacy `/research/#essay` and new report-section URLs open the intended content; back/forward restores the correct panel. | Route tests plus browser navigation. |
| Keyboard navigation | Arrow keys/Home/End follow the tab pattern; active tab and panel relationships are valid; focus never remains in a hidden panel. | DOM tests and keyboard browser check. |
| Map keyboard path | No more than one roving map entry, or a deliberately small visible selection; no clipped airport in the tab sequence. | DOM test for global/East Asia/fit-route and keyboard inspection. |
| Route edits | Airport select remains focused after adjacent-leg continuity updates; delete/add actions leave predictable focus. | DOM focus test and native-select browser check. |
| Quote import concurrency | Earlier slow import cannot replace a later file; Clear cancels any pending commit. | Controlled deferred-file regression test. |
| Evidence consistency | Airport prices and performance assumptions remain distinct from dated public benchmarks and sourced coordinates. No unverified live-price claim. | Content/source audit and empty-data state check. |
| Results | Same terminal inventory for comparison; infeasible baseline does not produce a savings percentage; edits invalidate old results and exports. | Existing quantitative and UI tests, retained after integration. |
| Research reproduction | Main essay, equations and frozen results remain consistent; offline files resolve without network. | Research integrity checker, numerical reproduction and ZIP checks. |
| Responsive/zoom | At 360, 768 and 1440 CSS pixels, no unintended page-level horizontal overflow; controls remain operable, tables/nav may scroll locally; 200% zoom readable. | Browser viewport/zoom inspection, not source inspection alone. |
| Loading/failure | A failed chart has actionable fallback; missing quotes stay missing; failed refresh retains dated valid observations with failure labeling. | Existing failure tests plus browser provider failure view if available. |
| Presentation | A new reader can explain the question, evidence, result, limitations and next validation step after the brief, without a presenter supplying hidden context. | Independent content review. |

## Existing strengths to preserve

The flight result is invalidated immediately after edits. Missing airport prices remain empty; quotation provenance and validity are required. The optimizer distinguishes infeasible baselines, and the result comparison holds terminal fuel constant. Public benchmarks retain observation and collection dates, with cached/failure labels. Market widgets distinguish display success from quote freshness. The research reports conditional results and exposes linear/exponential sensitivity instead of treating one formula as measured fact. These are useful foundations; the unified interface should not hide them.

## Review status

Round 1: source inspection completed; findings sent to the implementer before integration. No UI files were changed by this reviewer. Round 2 and final acceptance evidence will be appended after the revised application is available.

## Round 2 — implementation review and focused verification

The shared workspace was inspected after composition. It has one header and primary navigation, five mounted panels, a scoped research stylesheet, rewritten report-local links and a hosted legacy-route adapter. The frozen report content remains available as an explicitly separate offline exhibit. I independently ran the six unified-workspace tests: all passed, including form identity/state preservation, report deep links/history, five-tab keyboard navigation, legacy redirects, frozen content identity and stylesheet isolation.

At the lead implementer's request, this reviewer then implemented the three flight-interaction fixes identified in Round 1. Those parts are **implementer self-checks**, not independent certification:

- Map airports use a single roving tab stop among nodes inside the current viewport. Arrow keys cycle through that visible set; Home/End select its ends; Enter/Space inspect and Escape dismisses. Scope/camera changes remove clipped nodes from the tab sequence.
- Route-form regeneration restores the active field by leg/key. Deleting a leg selects a surviving origin field; adding a leg moves focus to the new origin.
- Quote reads have a monotonically increasing generation. Only the latest selection can commit; clearing quotes invalidates pending reads. A late earlier read cannot replace a later file or undo Clear.
- The main decision path and dynamic diagnostics now use English. Numerical-engine labels remain stable internally and are translated in the presentation layer. Source-language airport names can remain as secondary labels.
- A material physical consequence is now shown next to savings: additional direct combustion CO₂ versus the feasible baseline, using 3.16 t CO₂/t fuel. A separately explained post-hoc carbon-value threshold compares the same two plans; it is not a carbon-optimized solution, market price, lifecycle result or non-CO₂ assessment. It is absent when no comparable baseline exists.

Sixteen flight UI and ten dashboard UI tests passed after these changes. The added tests cover visible-map keyboard traversal, predictable focus after route edits/deletion/addition, out-of-order file reads, Clear during a pending import, and the direct-emissions comparison. Global-scenario display checks agree with the separate model review: 20.46 t additional direct CO₂ and a rounded threshold of $313/t CO₂. A targeted diagnostic test passed again after making the threshold unit explicit.

The independent browser reviewer subsequently identified accessible-name mismatches: visible airport labels were not fully represented by the corresponding SVG button name, and reduced-motion button labels differed from their accessible names. These were corrected by referencing the actual visible map-label element with `aria-labelledby` and matching the visible action terms. Label references are updated when map scope changes. Missing map prices no longer display a misleading `/t` suffix. Browser verification of the final version belongs to the separate browser evidence record.

The project brief was also reviewed. Its maturity label, evidence boundary, attributed competitor descriptions, proposed pilot gates, net-value calculation and research agenda support a critical diligence discussion. No unsupported realized savings, TAM, traction, customer, investment-return or institutional-endorsement claim was found. Its commercial and systems-research propositions remain explicitly unvalidated.

### Finding status after Round 2

| Finding | Status | Verification boundary |
| --- | --- | --- |
| UX-01 / UX-02 | Corrected in shared workspace | Independently inspected composition and passed six integration tests; final viewport appearance is covered by browser review. |
| UX-03 / UX-04 / UX-05 | Corrected in flight interactions | Regression tests passed; focus adapters verify application intent, while native SVG/select behavior requires the independent browser check. |
| UX-06 | Corrected for the principal decision flow | Main static controls and dynamic results/errors use English; secondary source names and archived documents may retain their original language. |
| UX-07 | Corrected in presentation and brief | Physical consequence shown alongside fuel-cost savings; maturity and separate-model boundaries stated. Empirical calibration and a supervised pilot remain future work. |
| UX-08 | Corrected in routing and composition | Direct, legacy and internal report links/history tests pass; local offline entry skips the hosted redirect. |

This review does not establish that the system has no possible defect or that it is certified for operational dispatch. It records specific defects, implemented remedies and bounded evidence. Final publication should retain the independent browser/a11y results and the quantitative audit alongside this record.
