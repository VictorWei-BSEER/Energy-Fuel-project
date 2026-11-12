# Configurable model and language review — 13 November 2026

This review covers the configurable route builder, complete illustrative airport data and a persistent Chinese/English interface. It replaces the prior browser suite's assumption that a prefilled global example is the starting state. Numerical validation and dataset assumptions are reviewed separately; a usable interface does not establish supplier prices or aircraft certification.

## Acceptance criteria

| Area | Required behavior |
| --- | --- |
| First visit | Chinese is the initial interface language. One empty origin–destination row is available, with no selected airports, calculated saving or moving aircraft. |
| Own route | A user can choose from all 67 airports and build one to five continuous legs. Airport changes update the affected generated parameters; adding, removing and reordering stops preserves a coherent sequence. |
| Example | Selecting an example name does not silently apply or calculate it. Loading an example is an explicit action separate from calculating. |
| Illustrative data | All 67 airport records contain complete price components and provenance. Component values sum to the stated total. Derived distances and performance parameters remain labeled assumptions. |
| One leg | A single-leg case can calculate its fuel need but cannot invent a tankering saving without an intermediate buying choice. |
| Quotes | Imported quotation mode requires valid supplier records for the selected origins and date. Missing records never fall back to the complete illustrative price dataset. |
| Locale | The top-right Chinese/English control updates all five sections and dynamic results. Route codes, numerical inputs, imported quotes and paused progress survive switching. The language choice survives reload. |
| Translation | Interface prose and dynamic messages are coherent in the selected language. Brands, IATA codes, units, original source titles, user-supplied text and explicitly identified English downloads are distinguished from untranslated interface copy. |
| Market panel removal | The main application makes no TradingView, OANDA or CFD-widget requests and does not display the removed quote panel. |
| Presentation | Shared navigation, keyboard use, legacy deep links and browser history work at desktop and mobile sizes. Institutional promotion is absent; evidence-source citations remain identifiable. |
| Verification | Real Chromium interactions and screenshots, 40 language/viewport/section combinations, both-language automated accessibility scans, and deterministic public-feed fixture responses. |

## Review sequence

1. The first complete visual and layout pass exercised 40 combinations (two languages, four widths, five sections). Route selection, data calculations, animation, numerical state retention and visible translation checks passed. Automated accessibility found a selected table-cell contrast of 4.18:1 and English SVG airport names whose visible text concatenation did not match their accessible names. The implementation now uses darker, larger table text and explicit whitespace in SVG labels. Screenshot review also found a contradictory Chinese calculation-button label; that translation was corrected.
2. An expanded test added regional pricing and manual-override checks. This run stopped because the test attempted to edit a collapsed regional settings section. The test now opens the section using its summary before interacting. This was a test-harness correction, not an application defect.
3. The corrected full regression passed all 13 acceptance groups. All 40 language/viewport/section combinations fit the document width; 10 WCAG 2/2.1 A/AA scans reported zero violations. Visible-language heuristics found zero unexpected interface passages. Browser history, legacy deep links, keyboard navigation and saved language preference passed. No uncaught JavaScript errors, local asset failures or removed-provider requests were recorded.

The independent localization review additionally checked expanded disclosure content, calculated recommendations, imported and rejected quotation messages, airport descriptions and route validation errors. It identified and verified corrections to an unjustified Chinese explanation of the no-tankering result, raw airport names in accessible descriptions and a stale calculation-button translation. Its detailed record is [the localization review](2026-11-13-localization-review.md).

## Reproduction

From the repository root, install dependencies with `npm ci`, install Chromium with `npx playwright install --with-deps chromium`, run the normal build, then run:

```sh
npm run test:browser
```

The runner starts and stops its own static HTTP server when no base URL is supplied. `FUEL_BROWSER_PATH` can select an installed Chromium; `FUEL_BROWSER_OUTPUT` selects the artifact directory. Repository public-feed requests, if made, receive immutable checked-in snapshots with recorded SHA-256 hashes. TradingView/OANDA requests are blocked and count as failures. This isolates interface regression from public-service availability; it does not verify live feeds or supplier access.

## Remaining boundaries

Synthetic prices, service allowances, supply limits and generic aircraft performance are scenario inputs. Passing UI tests does not turn them into airport offers, observed inventories or certified dispatch data. Geography provenance is separately exposed.

Chromium is the exercised browser. Keyboard navigation and automated WCAG 2/2.1 A/AA checks do not replace screen-reader, Safari, Firefox or comprehensive accessibility testing. Native date input formatting follows the browser's locale. Original source titles, brands, units, formulas, IATA codes and explicitly labeled English download artifacts are permitted in either interface language.

## Final acceptance evidence

The full successful run is recorded in `/workspace/artifacts/fuel-atlas-configurable-review/iteration-3/browser-review.json` in the review workspace. The default reproducible CI artifact location is `artifacts/browser-review/browser-review.json`; screenshots sit alongside it. Empty and calculated views are captured in Chinese and English at 390 and 1440 pixels. The run also verifies 320 and 768 pixel layouts without horizontal document overflow.

Verified stateful workflows include one-leg calculation without false tankering savings; airport changes, stop reordering and one-to-five-leg editing; all 67 complete component sums; JSON and CSV downloads; regional assumptions changing the affected route price; preserving manual prices during shared-assumption updates; active animation, hidden-tab pause and manual progress retention; imported quote counts and feedback translating without losing prices; and missing quotation origins blocking calculation with no illustrative-price fallback.

A separate rerun using the runner's automatically started and cleaned-up HTTP server is in progress against the frozen application. The preceding complete run has passed; the self-start check will be appended when it finishes. Independent model and implementation tests remain separate evidence and are not counted as browser acceptance groups.

