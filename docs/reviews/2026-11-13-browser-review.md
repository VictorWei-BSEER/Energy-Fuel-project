# Browser acceptance review — 13 November 2026

This review used actual Chromium rendering and interactions, rather than simulated DOM tests alone. It covers the local static application built from the release working tree. It does not certify production authentication, vendor services, aircraft operations or complete accessibility conformance.

## Runtime and reproducibility

- Chromium 154, installed at `/usr/bin/chromium` in the review environment.
- Playwright 1.62.1 and axe-core 4.14.0, pinned development dependencies.
- `npm run test:browser` runs `scripts/browser_review.mjs`, starts its own Python static server on an available loopback port and closes that server after the run. It uses an installed system Chromium when available; otherwise it uses Playwright's Chromium. `FUEL_BROWSER_PATH` explicitly selects an executable.
- CI serves the six checked-in public-feed snapshots from immutable in-memory buffers at the expected repository URLs and deliberately blocks the TradingView widget script. The report records each snapshot SHA-256, intercepted request and simulated provider failure. Application production fetching is unchanged.
- A pre-existing preview can be selected with `FUEL_BASE_URL` or the first CLI argument. `FUEL_BROWSER_OUTPUT` or the second CLI argument selects the report/screenshot directory; the default is `artifacts/browser-review`.

From a fresh checkout with the documented Node/Python prerequisites:

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:browser
```

Linux hosts also need Chromium's standard operating-system libraries. CI installs these through Playwright's supported `--with-deps` option. The review does not disable HTTPS verification, use private browser credentials or send supplier data to an external service.

## Observed defects and iterations

1. **Baseline reproduction.** Changing the first origin price to 1,234, opening Research and returning to Model reset the price to 950. The two pages had different mastheads, navigation and content widths. The East Asia map exposed 67 keyboard stops, including airports outside its viewport.
2. **Mounted-workspace integration.** Shared-tab state retention and keyboard navigation passed. Real screenshots exposed a footer inserted before the report, a research map attribution inheriting a fixed-position rule, and legacy typography shrinking report/brief table cells to 10 pixels. The 320-pixel view also overflowed by five pixels because an old mobile grid squeezed monetary values into half of a card. These findings were sent back to the implementation owners and corrected.
3. **Accessibility and visual correction.** Automated checks identified low contrast in timeline metadata, market labels, source labels and airport city text; research citation links depended on colour alone. Actual visible labels and accessible names differed on map and playback controls. Corrections were tested again. A Chromium font inspection also confirmed that the Arial substitute lacked the decorative northeast-arrow glyph; critical arrows now use inline SVG. The project brief's three-page PDF was rendered and inspected, and a split research section and joined words were corrected.
4. **Final acceptance.** The full runner passed after the fixes, including a fresh run in its automatic-server mode. Final desktop/mobile screenshots were visually inspected. They show the same masthead and primary navigation across the model, research report and project brief, with the report attribution, footer, type sizes and mobile card values in their intended locations.

The browser runner was exercised through these actual iterations; an early failure means later groups had not yet run, not that they passed:

| Run | Outcome | Finding or verification |
| --- | --- | --- |
| Iteration 1 | 3 groups passed; stopped on layout | 320-pixel model overflow |
| Iteration 2 | 4 groups passed; stopped on layout | First min-width fix did not remove the legacy mobile grid |
| Iteration 3 | 4 groups passed; stopped on layout | Monetary child still extended five pixels beyond the viewport |
| Iteration 4 | 5 groups passed; stopped on accessibility | Remaining low-contrast Market and Sources labels |
| Iteration 5 | 11 groups passed | Complete acceptance after layout and accessibility corrections |
| Final automatic-server run | 11 groups passed | Icon, text-flow and named-group polish; fresh self-start/cleanup verified |
| Final deterministic CI run | 11 groups passed | Checked-in snapshot fixtures and an explicit chart-provider failure; 18 fixture requests exercised |

The retained local audit artifacts are under `/workspace/artifacts/fuel-atlas-review/`. The final machine-readable result is `final-ci/browser-review.json`; screenshots use `final-ci/final-<section>-<width>.png`. The immediately preceding real-network attempt is retained separately under `final/`. These paths describe this execution workspace. CI writes equivalent artifacts under `artifacts/browser-review`.

## Final acceptance evidence

The final runner passed all 11 acceptance groups:

- Five mounted sections, their tab order and unique document IDs.
- Actual animation progression, automatic pause while the model is hidden, resume on return, and explicit manual pause.
- Edited model prices, recalculated cost and paused playback progress survive a Research round trip. Research slider changes also survive a return visit.
- Arrow-key, Home and End navigation through the shared tablist.
- All five sections at 320, 390, 768 and 1,440 pixels: 20 viewport/section combinations, each with one visible panel and no document-level horizontal overflow. Wide data tables may scroll inside their own containers.
- Automated WCAG 2/2.1 A and AA checks on all five tabs: zero reported violations in the reviewed state. Incomplete/manual candidates remain in the JSON report.
- Browser Back and Forward restore the selected section.
- A legacy `/research/#essay` URL reaches the corresponding mounted research section.
- A clearly synthetic four-airport CSV quotation fixture imports, calculates and exports with its user-supplied provenance intact. Fixture validity follows the selected plan date.
- Selecting an unpriced airport leaves its price empty, blocks a valid-looking result and disables export. The airport selector retains keyboard focus after rerendering.
- No uncaught JavaScript exceptions and no failed local runtime assets.

The final controlled local run completed at 05:43 on 13 November 2026, UTC+8. Its working model price was deliberately edited during the state-retention test; screenshot numbers from that test are not advertised market observations or frozen research findings.

## Visual and external-service limits

Desktop and mobile research sections were also inspected beyond the first screen: the sensitivity experiment, study geography, comparison table, methodology and references. The decision brief PDF was inspected on all three A4 pages. No remaining clipping, misplaced overlay or missing critical glyph was identified in these reviewed views.

During the earlier real-network runs, the environment could not load TradingView's external widget script (`ERR_TUNNEL_CONNECTION_FAILED`). The application displayed its fallback. The final CI run deliberately blocks that script instead and verifies `DISPLAY UNCONFIRMED` plus an enabled retry control. Neither result establishes live vendor-chart availability. Public-feed freshness and source truthfulness are covered separately in the data audit.

Axe's incomplete items include SVG colour evaluation and icon-only accessible-name checks. Visible SVG labels and the icon controls were inspected, but no screen reader, Safari or Firefox run was performed. Zero automated violations is not a claim of universal accessibility or absence of every possible defect. Production access and live third-party service behavior must remain separately observable.
