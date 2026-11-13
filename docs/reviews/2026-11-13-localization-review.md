# Independent localization review — 13 November 2026

The reviewed Chinese and English interfaces have no unresolved localization defect in the states exercised below. This review inspected the translation source independently and used actual Chromium against the candidate served at `http://127.0.0.1:4188/`. The reviewer changed no application code.

## Scope and method

All five mounted workspaces were reviewed: calculations, fuel data, research, model guide and sources. The fresh session defaulted to Chinese (`zh-CN`); the English switch set `en`, and an English selection persisted through reload using `fuel-atlas-language`.

The source review covered [the locale runtime](../../dist/i18n.js), its five catalogs, [flight presentation](../../dist/flight-app.js), [airport labels](../../dist/airport-labels.js), [data presentation](../../dist/data-view.js) and [research presentation](../../dist/research/research.js). The final catalog check covered **761 entries**: both language values were present, interpolation placeholders agreed, and no English catalog value contained Chinese text.

Rendered text was inspected in both languages, including expanded details. Searches for English paragraphs in Chinese and Chinese text in English were followed by a broader inspection of Latin text and accessibility descriptions. Airport codes, units, organization and author names, formula symbols, citation identifiers, user-supplied strings and explicitly labelled English downloads were treated as intentional original content. The persistent `中文` language-selector label is intentional.

## Browser evidence

| State exercised | Result |
| --- | --- |
| Fresh blank route and all five tabs, Chinese → English → Chinese | Labels, prose, headings and document titles followed the selected language. |
| User-built SIN → HKG → NRT; calculation; manual playback progress | Recommendation, result, fuel and playback text localized; switching an existing calculation did not leave mixed-language prose. |
| Valid two-record supplier CSV; rejected unsupported-airport CSV; clearing quotes | Accepted counts, rejection details and clear feedback localized. Switching language while the dialog was open also updated existing feedback. Synthetic user-supplied supplier text remained unchanged. |
| SIN → LHR with the narrowbody profile | The visible out-of-envelope error appeared in Chinese and switched to its English equivalent. |
| Research duration 5.5 h, carbon charge 120 and extra cost 30; expanded details | Updated premium explanation, sensitivity text, chart labels and surrounding prose localized in both languages. |
| Research origin-price input of zero | The visible validation message switched correctly between “请输入范围内的数值。” and “Enter valid values within the displayed input limits.” |
| Fuel-data base and regional edits; SIN filter; empty search; expanded calculation method | Applied-status text, filtered counts, no-match state, price components and methods localized in both languages. |
| Tax adjustment causing non-positive generated prices | The price-validation status switched correctly while preserving its financial meaning. |
| Current map accessibility descriptions | The ten rendered airport descriptions used the selected-language airport names, including HKG/NRT and SIN/DXB/LHR/JFK/LAX/GRU/JNB/SYD. |

## Findings resolved during review

| Finding | Resolution and verification |
| --- | --- |
| Multiple English phrases shared Chinese text, creating ambiguous reverse lookup. | The runtime now retains each text/attribute entry and uses explicit keys where needed. Repeated switches across the mounted workspaces retained the expected labels and titles. |
| The Chinese “just-in-time is already optimal” message attributed the result specifically to an insufficient price spread. Binding capacity or supply limits can also explain that outcome. | The Chinese now says the plan is optimal under the current inputs and does not invent a cause. Verified in the final flight catalog. |
| Map `aria-description` used raw, mixed-language airport names. | Rendering now uses `airportLabel()` for the selected language. Rechecked in Chromium in both languages. |
| An out-of-envelope diagnostic changed from “adjust the route” to “a shorter stage” without a matching catalog key; raw derivation exceptions could also reach presentation. | The flight presentation now uses matching localized diagnostic keys and a localized generation-error message. The long narrowbody route was rechecked in Chromium. |

The reviewed wording preserves the distinctions between scenario inputs and supplier quotes, fuel purchase savings and additional carriage burn, terminal fuel and airport inventory, direct combustion CO₂ and broader climate effects, and regional observations and airport-specific supply. The Chinese research text retains the conditional interpretation of tankering and does not turn physical fuel displacement into a claim that flights were saved.

This is a bounded interface and translation review, not certification of every possible validation combination or of the archived English research package. Responsive layout, contrast, numerical correctness and broader browser acceptance are recorded in the separate [browser review](2026-11-13-configurable-model-review.md), [product review](2026-11-13-product-review.md) and [model audit](2026-11-13-model-audit.md).
