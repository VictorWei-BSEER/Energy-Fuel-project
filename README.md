# Fuel Atlas / 全球航线与燃油优化

Fuel Atlas connects procurement, deliveries, airport stocks and aircraft uplift in one calculation. Choose your route, edit the supply and aircraft inputs, then compare a joint plan with the minimum-uplift baseline. Four tabs share one application: Model, Data, Research and Method. The Chinese/English switch retains the current work.

首页从一个空白航段开始。选择出发机场、目的机场和后续停靠点，即可建立 1–5 个连续航段。模型为所选机场生成可编辑的供应商、运输、库存和机型参数，一次计算采购、到货、机场油量与飞机加油量。示例路线通过“载入示例”单独打开，计算由用户发起。

| 入口 | 用途 |
| --- | --- |
| `/#model` | 选择航线与供油条件，统一计算采购、配送、机场库存和飞机加油 |
| `/#data` | 查看机场数据、调整共享假设、下载输入和计算依据 |
| `/#research` | 亚洲能源安全研究、交互分析、参考文献与英文课程提交文件 |
| `/#method` | 统一模型的使用方法和中英文 PDF |
| `/#data/data-source-plan` | 数据页中的来源计划和供应商报价导入 |

旧地址 `#calculations`、`#fuel-data`、`#oil-markets`、`#briefing` 和 `#sources` 继续跳转到相应内容。`network.html` 和 `planner.html` 也跳转到同一应用。研究章节可通过 `#research/essay` 等地址打开。页签和语言切换保留输入、结果与播放进度；页面重载只恢复语言偏好。

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

1. 选择出发和目的机场。按需添加、删除或调整停靠顺序，建立 1–5 个连续航段。通用宽体机或窄体机参数生成航时、耗油和保留油。
2. 在同一表单中调整供应商采购上限、运输费用与提前期、机场期初库存、储量上限和保留量。重复到访的机场共用同一库存池。数据页可查看机场价格构成与共享假设。
3. 点击一次计算，同时求解采购、运输到货、机场库存和各航段加油量。每次起飞对应一个供应窗口，当期到货先入库再加油，超出规划范围的到货不能满足当前需求。
4. 比较统一优化方案与逐段按需加油基准。两者使用相同供应网络、容量和期末库存目标；基准也优化上游采购与运输。结果分列采购、运费、处理费、库存费、加注费和价格调整。若基准无法满足约束，显示原因而不计算虚假的节省值。
5. 计算后播放逐段加油和飞行过程。地图上的费用是供应成本分摊，不表示真实付款时间。取得全包到机报价后，导入 CSV 并选择“我的报价”；报价替换采购计价方式，仍使用同一模型和容量约束。

情景数据覆盖 67 个机场。机场位置来自 OurAirports，价格、供应、运输、库存与机型参数可修改并有生成依据。报价模式使用已含税费和加注费的到机价格，避免再次叠加上游或服务费用。JSON 导出保存输入、来源、约束和结果。

联合线性模型同时检查供应能力、运输提前期、机场库存、油箱、起降重量和保留油。优化方案与基准使用相同的机上初始/最终油量和机场期末库存目标。完整定义见[联合模型](docs/integrated-model.md)，飞行约束的推导见[固定轮转模型](docs/flight-model.md)，生成数据公式见[情景数据说明](docs/scenario-data.md)。

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

## 模型组件与公开数据

The active application uses the [joint model](docs/integrated-model.md). The earlier multi-period supply-chain engine remains in `src/planner.js` as a tested library, with its original [formulation](docs/model.md). Its former `network.html` and `planner.html` entry points now redirect into the same four-tab application.

Historical market-display modules and the 50-airport regional directory remain as source components and regression fixtures. They are not a second user application. The Data tab exposes the current input and source plan. Public benchmarks provide market context; airport procurement requires the applicable supplier offer and delivery terms. Source access and timestamp conventions are recorded in [live-data.md](docs/live-data.md) and [airport-directory.md](docs/airport-directory.md).

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

Collected observations retain their source, observation date and collection time. The active model takes generated inputs or imported quotations; background market feeds do not silently become airport procurement prices. Archived monitor components and their tests preserve the previous remote-snapshot loading behavior for reuse.

## Structure

- `src/workspace/index.template.html`, `scripts/build-workspace.mjs`: source and deterministic composition for Model, Data, Research and Method. Edit the template, not generated `dist/index.html`.
- `dist/application.css`: shared navigation, content widths and final interface rules; research styles are scoped to its panel.
- `dist/brief/brief.html`, `scripts/build_brief.py`: bilingual model guide source and reproducible print/Markdown artifacts.
- `dist/index.html`, `dist/flight.css`, `dist/workspace-flight.css`: generated application, model map/decision split, rotation inputs and quote import dialog.
- `dist/scenario-data.js`, `dist/scenario-settings.js`, `dist/data-view.js`: deterministic scenario generation, shared parameters and airport/input inspection.
- `dist/i18n.js`, `dist/locales/`: full-interface language switching and bilingual copy.
- `dist/flight-app.js`: rotation editing, price modes, strategy switching, map/row/cost motion integration, airport search/filtering, import and JSON export.
- `dist/rotation-motion.js`: deterministic refuel/flight/arrival playback with pause, restart, seek, leg progress and reduced-motion behavior.
- `dist/workspace-directory.js`: Sources-only 50-airport reference table and source links, independent of the legacy map controls.
- `dist/integrated-optimizer.js`, `dist/integrated-data.js`, `dist/integrated-view.js`: joint optimization, generated supply-network inputs and the shared supply/result interface.
- `dist/flight-optimizer.js`: flight-physics constraints, minimum-uplift baseline and component solver.
- `dist/fuel-quotes.js`: `QUOTE_CSV_TEMPLATE`, `parseQuoteCsv` and `quoteForAirport`; bounded CSV parsing and applicable quotation selection.
- `dist/world-map.js`, `dist/global-airports.js`, `dist/flight-geography.js`: sourced world geography, 67-airport sample and date-line-safe great-circle display paths. The retained network map still uses `asia-map.js`.
- `dist/data/fuel-sources.json`: source-card catalog with access and price-basis limitations; no invented airport quotes.
- `dist/fonts/`: local Manrope and Instrument Serif fonts with licenses.
- `src/planner.js`: multi-period LP, validation, scenarios and diagnostics.
- `dist/planner.js`: generated self-contained browser bundle (do not hand-edit).
- `dist/workspace.js`, `dist/styles.css`, `dist/dashboard.css`: shared hash routing and original dashboard foundation; calculations selected by default with persistent form state across tabs.
- `dist/network.html`, `dist/planner.html`: compatibility redirects into the unified application; old network markup remains a regression fixture.
- `dist/airport-map.js`, `src/airport-directory.js`, `dist/data/airport-directory.json`: the versioned 50-airport directory, marker layout, selection, zoom and source table. `scripts/build_airport_directory.py` rebuilds the coordinate join from an OurAirports CSV; `src/airport-traffic-2024.json` preserves the traffic candidates and references.
- `dist/observed-app.js`: observed market summaries, original-unit tables, source health, reference geography and exports.
- `dist/public-market.js`: official TradingView display integration, instrument selection and bounded loading/error/retry handling; no price extraction.
- `dist/planner-app.js`, `dist/app.js`: prior supply-chain interface components retained for regression tests.
- `dist/data/`: verified source snapshots and health catalog.
- `scripts/refresh_data.py`, `data_adapters.py`, `collect_market.py`: ingestion.
- `scripts/build.mjs`: deterministic browser build and third-party license copy.
- `tests/flight-optimizer.test.mjs`, `tests/fuel-quotes.test.mjs`, `tests/flight-ui.test.mjs`: rotation model, quote parsing/applicability and flight UI checks; motion/dashboard tests cover the playback controller and restored workspace. Other `tests/` files retain model, data and DOM regression checks.
- `dist/optimizer.js`, `model.js`: earlier single-period/aircraft examples, not the active planning engine.

The homepage uses HTML, CSS, native JavaScript ES modules and SVG, with browser-local computation and no map-service key. The joint and retained multi-period models use `javascript-lp-solver` bundled by esbuild; all planning calculations run locally in the browser. See [design scope and acceptance constraints](docs/design-brief.md).

The user chooses airport order and the model optimizes procurement, deliveries, airport stocks and uplift along that route. Playback follows the computed fuel balances. Real operational evaluation requires calibrated aircraft performance, applicable supplier terms and confirmed supply constraints. Numerical tests, DOM checks and real Chromium flows verify the implemented calculations and interface.

## 全球地图与本次界面更新

全球底图、机场样本、来源快照和离线重建方法见 [global-geography.md](docs/global-geography.md)。航迹按球面大圆插值并在日期变更线两侧拆分；这属于地理展示，不代表实际航路或实时飞机位置。当前模型按用户设定的航线优化供油和加油，不搜索全球最优航线。

界面参考 IEA 的 [Data and statistics](https://www.iea.org/data-and-statistics) 和 [Energy Statistics Data Browser](https://www.iea.org/data-and-statistics/data-tools/energy-statistics-data-browser) 的内容层级与数据浏览结构，保留 Fuel Atlas 自身品牌，不表示与 IEA 存在隶属或合作关系。

研究下载包仍是 12 November 2026 的可复现课程提交快照，不是完整交易平台安装包。在线主页将航班与供应链连接为同一个模型；完整平台源代码可从本仓库下载并通过 `npm ci`、`npm run dev` 本地运行。

## Review and browser acceptance

See [the review record](docs/reviews/README.md) for findings, corrections and validation evidence.

```sh
npx playwright install chromium
npm run test:browser
```

The browser runner starts its own local server unless a base URL is supplied. On systems with a preinstalled Chromium, use `FUEL_BROWSER_PATH=/path/to/chromium`. It exercises navigation state, deep links, keyboard controls, quote workflow and responsive layouts including user-selected routes, both languages, generated-data downloads and quotation imports. Review screenshots are written to the runner’s artifact directory.
