# Shared product workspace

The application has five mounted views under one header and tablist: Global model, Market data, Research report, Project brief and Sources. Views are hidden and shown in place. Changing tabs does not reload the page, destroy a solved flight rotation, clear quotation imports or reset research controls.

## Source and build

- Edit `src/workspace/index.template.html` for shared chrome and the model, market and source panels.
- Edit `dist/research/index.html` for the standalone research source. The builder takes only its section navigation, main content and embedded frozen data; it excludes the separate standalone masthead and footer.
- Edit `dist/brief/brief.html` and its fully scoped `brief.css` for the project brief.
- Run `npm run build:workspace`, or the full `npm run build`, after editing any of these sources. The builder writes `dist/index.html` and `dist/research/research-embedded.css`. Do not hand-edit those generated outputs.
- `npm run check` checks that the generated files match their inputs. It also rejects duplicate IDs and research CSS rules that cannot be safely scoped.

The research content is composed at build time. It does not load in an iframe or need a runtime HTML request. Research styles are prefixed with `#workspace-research`, including reset and media rules; the standalone document's page-margin rule is not applied to the app. Shared `application.css` loads last and owns product-level layout.

## Routes and state

`dist/workspace.js` owns the route and keyboard behavior. The main view hashes are `#calculations`, `#oil-markets`, `#research`, `#briefing` and `#sources`. Nested routes, such as `#research/essay` or `#briefing/brief-pilot-title`, select the relevant view before scrolling to its section. Internal links, browser Back/Forward and roving Arrow/Home/End navigation use the same mounted panels. Each view remembers its previous scroll position when selected again; explicit section links take precedence.

Hosted requests to `/research/` and `/research/#essay` are canonicalized to the shared workspace. The small entry redirect runs only for HTTP(S). Opening the offline exhibit through `file://`, or requesting `?standalone`, retains the standalone research view. The offline packager removes the redirect before creating a new archive. Existing submitted PDFs, DOCX and ZIP files remain dated research snapshots; they are not silently rewritten by a workspace build.

## Verification boundaries

`tests/unified-workspace.test.mjs` covers mounted state, scroll continuity, routes, history events, keyboard navigation, hosted versus offline entry behavior, content identity and local-asset rebasing. It also checks that the shared footer follows all panels. These simulated DOM tests are supplemented by the real Chromium workflow in `npm run test:browser`; neither test group validates airline dispatch suitability or real airport quotations.
