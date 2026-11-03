# Fuel Atlas / 东亚短途宽体机加油决策

首页回答一个具体问题：**在既定的 2–5 航段轮转中，应该在哪一站加油、加多少，才能在满足油量与重量限制的同时降低新购燃油成本？** 航线保持不变；优化的是各站加油量与提前携油量。

主界面保留原来的三页签工作台：油市、预测与航班计算、来源。默认打开航班计算，沿用紧凑标题、左侧地图、右侧决策卡以及下方输入与结果表的结构。有效示例方案加载后，飞机会直接沿 PVG → ICN → HND → PVG 轮转自动演示；逐站加油、燃油消耗和累计采购成本同步变化。价格和机型性能明确标为可编辑示例；导入用户报价后，价格与示例数据分开使用。

| 入口 | 用途 |
| --- | --- |
| `/`、`/index.html`、`/#calculations` | 默认航班计算页签：固定轮转优化、17 个可选东亚机场、地图演示与逐段结果 |
| `/#oil-markets` | 原油市页签：WTI / Brent 公共图表与已采集的市场观测 |
| `/#sources` | 报价与来源页签：用户报价、数据时效、原始观测、50 机场参考目录与方法 |
| `/network.html#calculations` | 保留的多期供应链情景模型 |
| `/network.html#oil-markets` | 保留的 WTI / Brent 公共油市图表 |
| `/network.html#sources` | 原观测数据、刷新状态、50 机场目录与模型来源 |
| `/planner.html` | 跳转到 `/network.html#calculations` |

首页的三个页签直接响应 `#calculations`、`#oil-markets` 和 `#sources` 深链接；切换时保留表单和方案状态。原供应链模型另保留在 `network.html`，其库存、供应商和运输参数不代表飞机模型的数据或性能来源。

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

1. 在“示例场景”查看地图、轮转与加油建议。可编辑价格、基础耗油和已有燃油，以及展开后的性能、保留油与重量参数。
2. 添加或删除航段，将轮转保持为 2–5 个连续航段。修改机场后需同步核对耗油与载荷；系统不会从城市距离推断真实性能。
3. 点击“重新计算方案”，比较逐站按需基线与优化方案的成本、加油量、落地燃油和额外携油耗油。不可行输入显示诊断；编辑后旧结果立即失效。
4. 有效方案加载后即开始轮转演示：飞机沿路径移动，当前航段高亮，加油阶段的油量和累计采购成本上升，飞行阶段燃油下降。可暂停、重播、拖动进度或选择航段；切换“优化方案 / 逐站按需”时，各图表和演示使用对应方案。离开计算页签或页面进入后台时暂停；系统减少动态效果偏好下不自动播放，可手动选择静态进度。演示不是实时飞机位置、真实加油过程或实际飞行时间。
5. 导入报价并切到“我的报价”，按计划日期匹配出发站价格；计算后可导出包含输入、报价来源和结果的 JSON。

新轮转引擎直接枚举小规模有界线性问题的顶点。额外携油增加本段耗油；油箱容量在滑行前检查，起飞和落地重量分别检查。两方案使用相同初始燃油与相同终点库存，避免通过耗尽最后一站燃油制造节省。逐站按需基线因供油上限而不可行时，只展示可行性差异，不输出节省比例。方程、输入输出和默认示例见[固定轮转模型](docs/flight-model.md)。

“示例场景”的机场价格不是市场观测。787-9、A330-300 选项也是可编辑的参数标签，不代表机型认证性能。更换为用户报价后，耗油、保留油与重量参数仍需替换为航司认可的数据。

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

当前支持 `PEK PKX PVG SHA CAN SZX HKG TPE ICN GMP PUS HND NRT KIX NGO FUK CTS`。表头可调整顺序，但须且仅含上述 8 列。文件须为 UTF-8（可带 BOM），不超过 256 KiB、500 条记录。含逗号或双引号的字段按标准 CSV 规则转义。供应商、来源字段会检查禁止的控制字符及 `= + @ -` 公式前缀；来源不能使用非 HTTP(S) 协议链接。

无效记录逐行报错并排除；同一机场有效期重叠的记录全部排除，要求先选定适用合同，不静默选择供应商。非重叠的历史和未来记录可保留，但只有计划日期内唯一有效的报价进入计算。缺失或过期报价不自动回退为示例价。

文件只在当前页面内存中处理，不上传服务器，不跨刷新保存；再次导入会替换本次报价集合。导入记录标为“用户报价”，解析器不验证合同真伪或采购资格。本版不自动换算币种、升/加仑、密度或补齐税费；需在导入前人工核对合同、适用航班、有效期与全包到机口径。详细渠道、限制和扩展字段见[机场航油供货价研究](docs/airport-fuel-pricing.md)。

## 保留的供应链模型

Open the Calculations tab (`/network.html#calculations`) to plan 1–12 equal periods with explicitly assumed inputs. Edit supplier capacity/basis, period demand, initial stock, reserve targets, storage size/cost, route capacity/lead time/freight/handling, financing, budget and transport-emissions caps. Provide a flat benchmark, a growth assumption or an explicit price curve. These are scenario calculations, not an executable trading recommendation from observed supplier offers. This retained model is separate from the homepage aircraft rotation model; its tab label does not supply flight-performance data or add a forecasting model.

The continuous LP first minimizes unmet demand, then minimizes cost while preserving that service optimum within a disclosed numerical tolerance. Results include dated departures/arrivals, procurement, stock balances, shortages, binding constraints, costs and emissions. Supply arriving late never fulfills an earlier period's demand. Infeasible hard constraints produce diagnostics, not fabricated allocations.

Three stress cases share the same underlying assumptions. Cost comparisons appear only when both cases fully serve the same node-period demand. JSON export/import preserves the inputs and recomputes results; CSV exports shipment, procurement and shortage records. Existing inventory is already owned, so purchase costs apply only to new procurement. This is an incremental planning-cost model, not accounting profit.

See [model formulation](docs/model.md) for equations, timing, costs, tolerances and limits.

The retained planning map includes 50 airports within the existing East/Southeast Asia frame, selected using 2024 total passenger traffic, with a cutoff of 15.2 million passengers per year. This differs from the 17 East Asian airports currently selectable on the homepage. Select an airport for its traffic context or inspect dense areas with map zoom. Selection methodology and references are in the retained Sources tab and [airport directory notes](docs/airport-directory.md). Traffic rankings do not supply airport fuel prices or model demand.

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

The homepage oil-market/source tabs and retained `network.html` app load the latest collected dataset from GitHub `main`, then the previous data branch, then its bundled fallback. The observed monitor checks every 60 seconds while visible and has a manual check button; hidden pages pause automatic checks. Requests for all feeds use the same selected source location; each feed keeps its own observation date and freshness. These are periodic collected snapshots, not real-time exchange or supplier quotes. The hosted UI does not need to be redeployed for remote dataset updates. A failed check retains the last loaded observations and their timestamps. Remote observations do not change the homepage demonstration prices or user quotation collection.

## Structure

- `dist/index.html`, `dist/flight.css`, `dist/workspace-flight.css`: restored three-tab dashboard, compact calculations overview, map/decision split, rotation inputs and quote import dialog.
- `dist/flight-app.js`: rotation editing, price modes, strategy switching, map/row/cost motion integration, airport search/filtering, import and JSON export.
- `dist/rotation-motion.js`: deterministic refuel/flight/arrival playback with pause, restart, seek, leg progress and reduced-motion behavior.
- `dist/workspace-directory.js`: Sources-only 50-airport reference table and source links, independent of the legacy map controls.
- `dist/flight-optimizer.js`: pure fixed-rotation solver, baseline, fuel/weight constraints, diagnostics and demonstration input.
- `dist/fuel-quotes.js`: `QUOTE_CSV_TEMPLATE`, `parseQuoteCsv` and `quoteForAirport`; bounded CSV parsing and applicable quotation selection.
- `dist/asia-map.js`: shared SVG geography and projection; homepage routes are schematic paths.
- `dist/data/fuel-sources.json`: source-card catalog with access and price-basis limitations; no invented airport quotes.
- `dist/fonts/`: local Manrope and Instrument Serif fonts with licenses.
- `src/planner.js`: multi-period LP, validation, scenarios and diagnostics.
- `dist/planner.js`: generated self-contained browser bundle (do not hand-edit).
- `dist/workspace.js`, `dist/styles.css`, `dist/dashboard.css`: shared three-tab navigation and original dashboard foundation; calculations selected by default with persistent form state across tabs.
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

No orders are executed. The rotation model does not select routes, add stops or replace flight-performance and dispatch calculations. Linear carry-burn assumptions must be replaced with airline-approved operational data before actual use. Vessel lots, source inventories, blending, taxes, contract obligations, hedging and credit/accounting workflows remain outside the retained supply-chain model. Planning routes and plane playback are schematic; they are not observed ship or aircraft positions. Playback fuel and cost values come from the currently selected plan rather than invented live data. Browser DOM and motion behavior are tested; visual cross-browser inspection remains a separate check.
