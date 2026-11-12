# 固定轮转加油模型

实现来源：[dist/flight-optimizer.js](../dist/flight-optimizer.js)。单位统一为公吨（t）与 USD/t；以下描述对应本版代码。

## 问题与范围

输入一串固定的 2–5 个连续航段，最小化各出发站新增燃油采购成本。可以在便宜站提前加油，带到后续站；额外携油增加本段耗油。模型不改变航线、不增加经停、不预测价格。

`baselineRotation(input)` 生成逐站按需基线；`optimizeRotation(input)` 返回最优可行方案及基线；`defaultRotation()` 返回新的可编辑演示输入。

## 输入

| 层级 | 字段 | 含义 |
| --- | --- | --- |
| 顶层 | `initialFuelT` | 首站已有燃油，非负 |
| `aircraft` | `tankCapacityT` | 滑行前油箱容量，大于零 |
| `aircraft` | `maxTakeoffWeightT`、`maxLandingWeightT` | 最大起飞/落地重量，大于零 |
| 每个 `legs[]` | `from`、`to` | 机场字符串；后一段出发站必须等于前一段到达站 |
| 每段 | `priceUsdPerT` | 出发站新购燃油单价，有限非负数 |
| 每段 | `baseBurnT` | 基础空中耗油，非负 |
| 每段 | `taxiBurnT` | 滑行耗油，非负，省略时为 0 |
| 每段 | `reserveT` | 到达必须保留的燃油，非负 |
| 每段 | `carryBurnRate` | 每吨额外起飞携油在本段损耗的比例，`0 ≤ k < 1`；不是百分数输入 |
| 每段 | `zeroFuelWeightT` | 本段无油重量，含按用户输入固定的载荷 |
| 每段 | `maxUpliftT` | 可选本站供油上限；省略为不额外限制，0 表示本段出发站不能加油 |

纯计算函数允许零价情景；报价 CSV 要求单价大于零。UI 另限制共享目录中的 67 个可选机场并拒绝同站出发/到达。计划日期和报价有效期在 UI/报价模块匹配，模型只接收最终数值。

## 油量平衡与成本

对航段 `i`，记到站已有燃油为 `A_i`、本站加油为 `U_i`、滑行耗油为 `T_i`、基础空中耗油为 `B_i`、到达保留油为 `R_i`、携油损耗系数为 `k_i`。变量 `E_i ≥ 0` 表示超过 `B_i + R_i` 的额外起飞携油：

```text
滑行前出发油量 D_i = T_i + B_i + R_i + E_i
本站加油       U_i = D_i - A_i
起飞油量       F_i = B_i + R_i + E_i
额外携油耗油   X_i = k_i × E_i
航段总耗油     C_i = T_i + B_i + X_i
落地油量       L_i = R_i + (1 - k_i) × E_i
下一站已有油量 A_(i+1) = L_i

目标：min Σ(priceUsdPerT_i × U_i)
全轮转平衡：initialFuelT + ΣU_i - ΣC_i = finalFuelT
```

初始燃油视为已经持有，只对新增采购计成本。`k_i` 是本段每吨额外携油的总损耗比例，不是每小时、每海里系数。播放中的油量变化为按段耗油插值的示意，不是实际飞行剖面。

## 约束与库存公平

每段满足：

```text
U_i ≥ 0                                      不允许卸油
D_i ≤ tankCapacityT                          滑行前油箱容量
zeroFuelWeightT_i + F_i ≤ maxTakeoffWeightT   起飞重量
zeroFuelWeightT_i + L_i ≤ maxLandingWeightT   落地重量
L_i ≥ R_i                                    到达保留油
U_i ≤ maxUpliftT_i                            若设置供油上限
```

基线逐站只补足 `T_i + B_i + R_i`；已有燃油超过该值时携带剩余燃油，不通过卸油降低库存。基线与优化使用相同初始燃油，且优化最终落地燃油必须等于基线最终落地燃油。节省不会来自耗尽终点库存。

无油重量随航段输入，模型不为了带油减少旅客、货物或改变载荷。低价站携油量同时受油箱、起飞重量、落地重量与供油上限约束。最低必要燃油已经超限，或初始油量超过油箱容量时返回不可行诊断。

基线受本站供油上限限制时，提前携油可能仍可执行；此时返回该方案，但 `savingsUsd`、`savingsPercent`、`extraBurnVsBaselineT` 均为 `null`，不与不可行基线报告节省。

## 求解与输出

最多 5 个变量，通过终点库存等式与活动约束枚举有界线性问题的顶点。成本近似相同时优先更少额外耗油，再优先更少携油，结果确定。燃油可行性容差按问题的质量尺度计算：`64 × Number.EPSILON × max(油箱容量, 初始油量, 各段最低出发油量)`；成本比较容差 `1e-6 USD`。仅将容差以内的负携油/负加油数值舍入为零，不删除微小正油量。该容差用于浮点数误差处理，不是获准超出运行限制的裕度；页面可四舍五入，计算保持完整精度。

| 输出 | 含义 |
| --- | --- |
| `feasible`、`status` | 是否可行；`optimal`、`infeasible` 或 `invalid` 等状态 |
| `errors`、`diagnostics` | 输入错误、超限原因或基线不可比说明 |
| `legs[]` | 每段原输入及已有燃油、加油量、滑行前/起飞/落地油量、额外耗油、重量、采购成本、生效约束 |
| `totalCostUsd`、`totalUpliftT`、`totalBurnT`、`totalExtraBurnT` | 总采购成本、新增燃油、总耗油、额外携油耗油 |
| `finalFuelT`、`terminalTargetFuelT` | 最终库存及相同终点库存目标 |
| `baseline` | 逐站按需基线，可含用于诊断的不可行段 |
| `savingsUsd`、`savingsPercent`、`extraBurnVsBaselineT` | 两方案可比时的成本节省、比例、额外耗油差 |
| `solver` | 枚举方法、检查顶点数和变量数 |

UI 的方案 JSON 另包含 `schemaVersion`、计划日期、价格模式、性能状态、输入和适用报价来源，便于复核；不代表已经下单。

## 默认示例与假设

`defaultRotation()` 的价格与性能均为人工示例，不是实时合同价，也不是 787-9 或 A330-300 的真实性能：初始燃油 8 t、油箱 110 t、最大起飞 240 t、最大落地 190 t。

| 航段 | 示例 USD/t | 基础耗油 t | 滑行 t | 到达保留 t | 携油损耗 | 无油重量 t |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PVG → ICN | 860 | 7.5 | 0.25 | 8 | 1.8% | 163 |
| ICN → HND | 980 | 9.2 | 0.25 | 8 | 2.2% | 161 |
| HND → PVG | 1120 | 13.4 | 0.30 | 8 | 2.9% | 164 |

按当前实现运行示例，按需采购成本 $31,270，优化成本约 $27,673.53，节省约 $3,596.47（11.50%），额外耗油约 0.65645 t；终点燃油均为 8 t。优化加油量约为 PVG 27.09827 t、ICN 4.45818 t、HND 0 t；首段受最大落地重量约束。这些是可复算的示例输出，不是商业承诺。

真实使用需替换为航司认可的耗油、载荷、保留油、重量限制、有效全包到机价和供油能力。天气、风、跑道、飞行高度、非线性性能、法规储备构成及运行风险未在本线性模型中单独求解。价格接入见[机场航油供货价研究](airport-fuel-pricing.md)。

## Global workspace extension — 13 November 2026

The UI now opens a separate, explicitly hypothetical four-leg SIN–DXB–LHR–JFK–LAX scenario from `flight-geography.js`. Its fuel and price inputs are manual assumptions, not empirical aircraft performance or supplier offers. The original East Asia `defaultRotation()` remains available from the preset control and its reference results are unchanged. Both presets use the same constrained uplift optimizer and matched terminal fuel rule. The global directory expands airport selection and quote-code recognition; geography supplies neither prices nor fuel burn. `world-map.js` and spherical route interpolation provide display geometry only.

## 与研究报告的区别

全球工作台使用固定 2–5 航段的受约束加油优化；研究报告使用单次边际燃油运输的阈值模型。工作台的 `carryBurnRate` 是**整个航段**每吨额外携油的损耗比例；研究的 `burnCoefficientPerHour` 是**每小时**系数。只有采用线性研究假设并指定时长 `t` 时，才可令 `carryBurnRate = k × t`；若采用指数研究假设，则应令 `carryBurnRate = 1 − exp(−k × t)`。这是一种模型映射，不是机型或航线性能校准，也不意味着工作台默认示例来自研究中的三条亚洲连接。

研究阈值比较相同目的地可用燃油，但没有油箱、重量或实际供油可行性检验。工作台在给定的人工性能与报价参数下检查上述约束。两者均不推断机场供货能力、航班取消概率、真实利润或区域福利。

可比方案的额外直接燃烧排放为 `3.16 × extraBurnVsBaselineT`，单位 t CO₂；3.16 来自研究已列明的 ICAO Jet A/Jet A-1 因子，不含生命周期和非 CO₂ 效应。在节省与额外排放都为正时，`savingsUsd / (3.16 × extraBurnVsBaselineT)` 给出**当前方案**燃油采购节省被额外碳价值抵消的 USD/t CO₂ 阈值；它既不是观测碳价，也不是重新纳入碳目标优化后的最优决策。

可选独立核验：安装 NumPy/SciPy 后运行 `python3 scripts/audit-flight-model.py`。脚本用与生产代码不同的加油量/落地油量变量和 SciPy/HiGHS，比较 600 个固定种子的可行/不可行输入，并检验现金成本与燃油平衡。它是数值复核，不是实际飞机运行认证。
