# Independent integrated-model localization review — 13 November 2026

No unresolved localization or wording defect was found in the integrated states reviewed below. The review used a fresh Chromium context against `http://127.0.0.1:4188/`, loading the `20261113-integrated` modules, and independently inspected the translation and presentation sources. The reviewer changed no application code. The [earlier five-tab localization review](2026-11-13-localization-review.md) remains a historical record.

## Scope

The current product has four primary tabs: **模型 / 数据 / 研究 / 方法** and **Model / Data / Research / Method**. All four mounted panels, including their expanded details, were inspected in Chinese and English. Document titles, visible text, input labels, tooltips and map accessibility descriptions followed the selected language. No English paragraph remained in the inspected Chinese states, and no Chinese interface prose remained in English. Codes, units, organization names, original citation identifiers, user-supplied values and the bilingual language selector were treated as intentional original content.

The final source check covered **850 translation entries** and **36 bilingual field-label/meaning pairs** from [the integrated field catalog](../../dist/integrated-data.js). Both language values were present, interpolation placeholders agreed, and English values contained no Chinese text. The review also inspected [the locale runtime](../../dist/i18n.js), [integrated presentation](../../dist/integrated-view.js), [flight presentation](../../dist/flight-app.js) and the integrated Method text.

## Observed browser results

| State | Evidence and result |
| --- | --- |
| Fresh application and repeated language changes | Four matching tab names and document titles in both languages. Expanded Model, Data, Research and Method text had no mixed-language prose or accessibility descriptions. |
| User-selected SIN → HKG → NRT, scenario mode | Supplier, delivery, ground-inventory and aircraft results localized together. Product purchases, into-plane service and total system cost remained distinct labels. The interface identified the supply inputs as generated data. |
| HKG supply-route capacity set to zero | The joint plan remained feasible while the minimum-uplift baseline became infeasible. The English result stated that carrying fuel forward met the supply constraint; Chinese conveyed the same meaning. |
| Invalid lead time of 1.5 windows | The invalid value and error remained present across a language switch. Both messages required a whole number of windows. A valid edit produced localized recalculation status. |
| First delivery delayed one window, with no opening ground stock | The visible infeasibility message named supply capacity, delivery timing and airport stocks. Switching language updated the existing error. |
| SIN opening ground stock set to 10 tonnes | The final stock target also became 10, as described by the field tooltip. Both languages distinguished opening ground stock, exact final ground stock, airport storage and aircraft fuel. The resulting balance table showed receipts, aircraft uplift and closing stock separately. |
| Imported, fee-inclusive SIN and HKG quotations | Delivery rows used meaningful localized labels: “SIN/HKG all-inclusive offer” and “SIN/HKG 全包报价”. They were not replaced by a claim that opening stocks supplied those purchases. |
| Imported-quotation cost boundary | The fixture displayed only **Delivered quotations** and **Total system cost**, both $42,920.23. Into-plane, tax and holding fields were zero and disabled. No modeled product, freight, service, tax or holding amount was added to the displayed quote total. |
| Legacy navigation | `/network.html` redirected to the four-tab Model. The `#sources` alias opened Data. No visible link offered an independent supply-chain application or a separate Sources tab. |

No page errors occurred in the principal bilingual scenario, constrained-supply and quotation flow.

## Wording findings and resolution

The source pass found a stale carbon-note literal that still described a fuel-purchase-only objective. Its translation entry had already been revised, but direct assignment of the old literal bypassed the revised entry. Flight presentation now calls the translation function for that key. Actual solved results displayed “supply-cost saving” in English and “供应成本节省” in Chinese, with the emissions boundary stated as aircraft fuel combustion.

The Chinese integrated introduction and result introduction initially used “实际设定” and “实际计费环节”. They now use “设定的供油和库存约束” and “各计费环节”, consistent with generated assumptions rather than observed operations. The Method text and field meanings also distinguish imported prices from assumed physical allocations and describe why modeled upstream and service charges are not added again.

The reviewed terminology preserves three material distinctions: ground stock versus onboard fuel; delivery-event windows versus hours or days; and the total joint supply cost versus its procurement, transport, service and holding components. The imported-price mode remains part of the same planning interface, while its cost boundary is explained separately.

This review establishes the observed wording and language behavior of these cases. It is not a numerical proof of the optimizer, a verification of supplier quotations or a claim that the generated capacities, inventories or timing are operational observations.
