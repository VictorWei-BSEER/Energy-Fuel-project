# Fuel Atlas / 全球航线与燃油优化

Fuel Atlas starts with the route you choose. It derives a complete set of scenario inputs, then calculates how much fuel to buy at each stop. The shared workspace includes the model, fuel data, research, a model guide and the data replacement plan. A top-right language switch changes the whole interface between Chinese and English while retaining the current work.

首页从一个空白航段开始。选择出发机场、目的机场和后续停靠点，即可建立 1–5 个连续航段。通用机型参数按机场距离推导航时、耗油和保留油，67 个机场采用统一价格公式。所有经济与性能输入都标为情景数据，并附有计算依据和后续数据来源。示例路线通过“载入示例”单独打开，计算由用户发起。

| 入口 | 用途 |
| --- | --- |
| `/#calculations` | 选择航线、调整参数、计算各站购油量，查看地图和逐段动态结果 |
| `/#fuel-data` | 查看 67 个机场的价格构成、调整共享假设、下载完整数据和计算依据 |
| `/#research` | 亚洲能源安全研究、交互分析、方法、参考文献与课程提交文件 |
| `/#briefing` | 模型使用说明和中英文 PDF |
| `/#sources` | 各类输入的数据获取方案和供应商报价导入 |
| `/network.html#calculations` | 保留的多期供应链情景模型 |
| `/network.html#oil-markets` | 保留的公开市场观测工具 |

`#oil-markets` 兼容跳转到新航油数据页。研究章节可通过 `#research/essay` 等地址打开。所有主工作台页签共用导航，切换保留表单、计算和进度状态。页面重载只恢复语言偏好，不保存报价或模型输入。

The Asian energy security project includes a [full report](dist/research/downloads/Final_Project.pdf), [919-word reflection](dist/research/downloads/Analytical_Reflection.pdf) and [offline ZIP](dist/research/downloads/submission-package.zip). See [research/README.md](research/README.md) for reproduction. The research exhibit retains its published case study; the interactive route model uses the route and inputs selected in the model tab.

## Run and verify

Requires Node.js 22+ and Python 3.10+.

```sh
npm ci
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). The existing supply-chain engine is bundled automatically before local serving. The deployed application runs entirely in the browser; no keys are exposed.

```sh
npm run build
npm test
npm run check
```

## 首页操作与模型

1. 选择出发和目的机场。按需添加、删除或调整停靠顺序，航段保持连续。选择通用宽体机或窄体机，查看生成的耗油、保留油和重量参数。
2. 在航油数据页查看每个机场的价格构成，调整基础价、运输系数、税费或供油上限。修改共享假设会更新模型中的生成输入，保留明确的手动修改，并使旧结果失效。
3. 点击计算，比较逐站按需方案与优化方案的采购成本、加油量、落地燃油和携油损耗。超出机型情景适用范围或无法满足约束时，页面给出具体原因。
4. 计算后可播放、暂停、拖动进度或选择航段。切换方案会同步更新地图与燃油成本。离开模型页签或将页面放到后台时，播放暂停。
5. 取得供应商报价后，通过 CSV 导入并选择“我的报价”，按计划日期匹配。模型 JSON 导出保留航线、输入、报价来源和结果。

价格由共同航油基础价、区域差价、参照机场距离运输成本、加注服务费和税费组成。机型使用明确的通用性能假设，几何数据来自 OurAirports。生成数据、公式和接入方案见[情景数据说明](docs/scenario-data.md)。

固定航线优化器枚举有界线性问题的顶点，检查油量连续性、油箱、起飞重量、落地重量、保留油和每次到访供油上限。两方案使用相同的初始燃油和终点剩余油量。若逐站按需方案因供油不足而不可行，结果展示可行性差异。数学定义见[固定轮转模型](docs/flight-model.md)。

### 报价 CSV

[dist/fuel-quotes.js](dist/fuel-quotes.js) 的 `QUOTE_CSV_TEMPLATE` 是格式来源。页面“下载 CSV 模板”导出以下表头和空白待填行；供应商、价格和来源留空，不能直接通过校验：

```csv
airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source
PVG,,,2026-11-04,2026-11-30,into-plane,true,
```

| 字段 | 要求 |
| --- | --- |
| `airport` | 支持机场的大写 IATA 三字码 |
| `supplier` | 非空供应商或合同名称，最多 240 字符 |
| `price_usd_per_t` | 大于零的有限数字；已统一为 USD/公吨，不接受货币符号、千分位或科学计数法 |
| `valid_from`、`valid_until` | 真实 `YYYY-MM-DD` 日期，开始不晚于结束；计划日包含两端日期 |
| `delivery_basis` | 必须为 `into-plane` |
| `fees_included` | 必须为小写 `true`，确认已包含适用税费及加注费用 |
| `source` | 非空文档名称，或无用户名、密码的 HTTP(S) 链接，最多 1,000 字符 |

当前支持共享全球目录中的 67 个 IATA 代码，完整列表和来源见 [global-airports.json](dist/data/global-airports.json)。原有 17 个东亚机场继续支持。表头可调整顺序，但须且仅含上述 8 列。文件须为 UTF-8（可带 BOM），不超过 256 KiB、500 条记录。含逗号或双引号的字段按标准 CSV 规则转义。供应商、来源字段会检查禁止的控制字符及 `= + @ -` 公式前缀；来源不能使用非 HTTP(S) 协议链接。

无效记录逐行报错并排除；同一机场有效期重叠的记录全部排除，要求先选定适用合同，不静默选择供应商。非重叠的历史和未来记录可保留，但只有计划日期内唯一有效的报价进入计算。缺失或过期报价不自动回退为示例价。

文件只在当前页面内存中处理，不上传服务器，不跨刷新保存；再次导入会替换本次报价集合。导入记录标为“用户报价”，解析器不验证合同真伪或采购资格。本版不自动换算币种、升/加仑、密度或补齐税费；需在导入前人工核对合同、适用航班、有效期与全包到机口径。详细渠道、限制和扩展字段见[机场航油供货价研究](docs/airport-fuel-pricing.md)。

## 保留的供应链模型

Open the Calculations tab (`/network.html#calculations`) to plan 1–12 equal periods with explicitly assumed inputs. Edit supplier capacity/basis, period demand, initial stock, reserve targets, storage size/cost, route capacity/lead time/freight/handling, financing, budget and transport-emissions caps. Provide a flat benchmark, a growth assumption or an explicit price curve. These are scenario calculations, not an executable trading recommendation from observed supplier offers. This retained model is separate from the homepage aircraft rotation model; its tab label does not supply flight-performance data or add a forecasting model.

The continuous LP first minimizes unmet demand, then minimizes cost while preserving that service optimum within a disclosed numerical tolerance. Results include dated departures/arrivals, procurement, stock balances, shortages, binding constraints, costs and emissions. Supply arriving late never fulfills an earlier period's demand. Infeasible hard constraints produce diagnostics, not fabricated allocations.

Three stress cases share the same underlying assumptions. Cost comparisons appear only when both cases fully serve the same node-period demand. JSON export/import preserves the inputs and recomputes results; CSV exports shipment, procurement and shortage records. Existing inventory is already owned, so purchase costs apply only to new procurement. This is an incremental planning-cost model, not accounting profit.

See [model formulation](docs/model.md) for equations, timing, costs, tolerances and limits.

The retained planning map includes 50 airports within the existing East/Southeast Asia frame, selected using 2024 total passenger traffic, with a cutoff of 15.2 million passengers per year. This is a separately selected reference directory, distinct from the 67-airport global sample selectable on the homepage. Select an airport for its traffic context or inspect dense areas with map zoom. Selection methodology and references are in the retained Sources tab and [airport directory notes](docs/airport-directory.md). Traffic rankings do not supply airport fuel prices or model demand.

## 保留的油市与观测数据

Public market display at `/#oil-markets` (also retained at `/network.html#oil-markets`): `OANDA:WTICOUSD` (WTI crude CFD) and `OANDA:BCOUSD` (Brent crude CFD). TradingView serves the chart directly to the visitor without an API key; the app does not copy, export or use its prices in the airport rotation optimizer. The chart defaults to 15-minute candles and UTC+8; **15 minutes is the candle interval, not the data delay**. Provider timestamps, source delay and market status remain in the original chart. Script/frame loading status does not prove a fresh quote has arrived. If the external chart is blocked or slow, use the retry control or its always-visible source links. See [market access, latency and current limits](docs/live-data.md).

Five official-source adapters have completed a real GitHub Actions HTTPS run:

| Feed | Observed monitor role |
| --- | --- |
| EIA US Gulf Coast jet fuel | U.S. wholesale benchmark in original USD/US gallon; no airport allocation or density conversion |
| EIA Brent spot | Market context; different product/geography from USGC jet |
| ECB reference FX | Context; reference rates, not executable quotes |
| OurAirports | Reference coordinates; no inventory or commercial fuel price data |
| JODI jet kerosene balances | National monthly context with reporting/assessment flags |

Every record retains source, observation period and collection time. Every feed has refresh health and last-known data. A failed collection preserves the prior snapshot; missing data is not zero. JODI missing economies and unassessed zeros must not be interpreted as absent supply. See [source provenance and coverage](docs/data-sources.md).

Asian supplier basis, available capacity, demand, stock, freight and contract prices remain **explicit assumptions**, not observations. IATA/Platts is marked restricted; Comtrade and executable supplier offers are not activated without a suitable access/configuration and product mapping. The UI distinguishes model input, context and reference feeds.

## Data refresh

```sh
npm run collect
# Or one feed:
python3 scripts/refresh_data.py --output-dir dist/data --only eia-jet
```

The collector needs HTTPS access to the official source hosts. The managed build environment has restricted outbound networking; real integration was verified in GitHub Actions. All sources have bounded responses, timeouts, schema/date validation and atomic writes.

The refresh workflow checks the three EIA/ECB market feeds hourly at minute 17, checks all five sources daily at 22:47 UTC, supports manual dispatch, and runs on relevant source changes. GitHub schedules are best effort and may run late. Scheduled Actions run from the default branch. It commits only `dist/data/`, reports partial failures, and fails if no selected feed refreshed.

The retained `network.html` app loads the latest collected dataset from GitHub `main`, then the previous data branch, then its bundled fallback. The observed monitor checks every 60 seconds while visible and has a manual check button; hidden pages pause automatic checks. Requests for all feeds use the same selected source location; each feed keeps its own observation date and freshness. These are periodic collected snapshots, not real-time exchange or supplier quotes. The hosted UI does not need to be redeployed for remote dataset updates. A failed check retains the last loaded observations and their timestamps. The main route model uses its generated scenario dataset or imported user quotations. Public market observations stay in the separate legacy monitor.

## Structure

- `src/workspace/index.template.html`, `scripts/build-workspace.mjs`: source and deterministic composition for the five mounted workspaces. Edit the template, not generated `dist/index.html`.
- `dist/application.css`: shared navigation, content widths and final interface rules; research styles are scoped to its panel.
- `dist/brief/brief.html`, `scripts/build_brief.py`: bilingual model guide source and reproducible print/Markdown artifacts.
- `dist/index.html`, `dist/flight.css`, `dist/workspace-flight.css`: generated application, model map/decision split, rotation inputs and quote import dialog.
- `dist/scenario-data.js`, `dist/scenario-settings.js`, `dist/data-view.js`: deterministic scenario generation, shared parameters and airport/input inspection.
- `dist/i18n.js`, `dist/locales/`: full-interface language switching and bilingual copy.
- `dist/flight-app.js`: rotation editing, price modes, strategy switching, map/row/cost motion integration, airport search/filtering, import and JSON export.
- `dist/rotation-motion.js`: deterministic refuel/flight/arrival playback with pause, restart, seek, leg progress and reduced-motion behavior.
- `dist/workspace-directory.js`: Sources-only 50-airport reference table and source links, independent of the legacy map controls.
- `dist/flight-optimizer.js`: pure fixed-rotation solver, baseline, fuel/weight constraints, diagnostics and demonstration input.
- `dist/fuel-quotes.js`: `QUOTE_CSV_TEMPLATE`, `parseQuoteCsv` and `quoteForAirport`; bounded CSV parsing and applicable quotation selection.
- `dist/world-map.js`, `dist/global-airports.js`, `dist/flight-geography.js`: sourced world geography, 67-airport sample and date-line-safe great-circle display paths. The retained network map still uses `asia-map.js`.
- `dist/data/fuel-sources.json`: source-card catalog with access and price-basis limitations; no invented airport quotes.
- `dist/fonts/`: local Manrope and Instrument Serif fonts with licenses.
- `src/planner.js`: multi-period LP, validation, scenarios and diagnostics.
- `dist/planner.js`: generated self-contained browser bundle (do not hand-edit).
- `dist/workspace.js`, `dist/styles.css`, `dist/dashboard.css`: shared hash routing and original dashboard foundation; calculations selected by default with persistent form state across tabs.
- `dist/network.html`: retained supply-chain calculations with the original map controls and supporting market/source tabs.
- `dist/airport-map.js`, `src/airport-directory.js`, `dist/data/airport-directory.json`: the versioned 50-airport directory, marker layout, selection, zoom and source table. `scripts/build_airport_directory.py` rebuilds the coordinate join from an OurAirports CSV; `src/airport-traffic-2024.json` preserves the traffic candidates and references.
- `dist/observed-app.js`: observed market summaries, original-unit tables, source health, reference geography and exports.
- `dist/public-market.js`: official TradingView display integration, instrument selection and bounded loading/error/retry handling; no price extraction.
- `dist/planner-app.js`: supply-chain scenario calculations and import/export inside the retained Calculations tab; `planner.html` redirects there and `app.js` is the retained prior source.
- `dist/data/`: verified source snapshots and health catalog.
- `scripts/refresh_data.py`, `data_adapters.py`, `collect_market.py`: ingestion.
- `scripts/build.mjs`: deterministic browser build and third-party license copy.
- `tests/flight-optimizer.test.mjs`, `tests/fuel-quotes.test.mjs`, `tests/flight-ui.test.mjs`: rotation model, quote parsing/applicability and flight UI checks; motion/dashboard tests cover the playback controller and restored workspace. Other `tests/` files retain model, data and DOM regression checks.
- `dist/optimizer.js`, `model.js`: earlier single-period/aircraft examples, not the active planning engine.

The homepage uses HTML, CSS, native JavaScript ES modules and SVG, with browser-local computation and no map-service key. The new rotation solver has no server solver dependency; the retained multi-period model uses `javascript-lp-solver` bundled by esbuild. See [design scope and acceptance constraints](docs/design-brief.md).

The user chooses airport order and the model optimizes fuel uplift along that route. Playback follows the computed fuel balances. Real operational evaluation requires calibrated aircraft performance, applicable supplier terms and confirmed supply constraints. Numerical tests, DOM checks and real Chromium flows verify the implemented calculations and interface.

## 全球地图与本次界面更新

全球底图、机场样本、来源快照和离线重建方法见 [global-geography.md](docs/global-geography.md)。航迹按球面大圆插值并在日期变更线两侧拆分；这属于地理展示，不代表实际航路或实时飞机位置。当前模型优化固定轮转的加油量，不搜索全球最优航线。

界面参考 IEA 的 [Data and statistics](https://www.iea.org/data-and-statistics) 和 [Energy Statistics Data Browser](https://www.iea.org/data-and-statistics/data-tools/energy-statistics-data-browser) 的内容层级与数据浏览结构，保留 Fuel Atlas 自身品牌，不表示与 IEA 存在隶属或合作关系。

研究下载包仍是 12 November 2026 的可复现课程提交快照，不是完整交易平台安装包。在线主页包含动态航班与供应链模型；完整平台源代码可从本仓库下载并通过 `npm ci`、`npm run dev` 本地运行。

## Review and browser acceptance

See [the review record](docs/reviews/README.md) for findings, corrections and validation evidence.

```sh
npx playwright install chromium
npm run test:browser
```

The browser runner starts its own local server unless a base URL is supplied. On systems with a preinstalled Chromium, use `FUEL_BROWSER_PATH=/path/to/chromium`. It exercises navigation state, deep links, keyboard controls, quote workflow and responsive layouts including user-selected routes, both languages, generated-data downloads and quotation imports. Review screenshots are written to the runner’s artifact directory.
