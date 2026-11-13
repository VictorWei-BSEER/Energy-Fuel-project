# Fuel Atlas 计算方法

更新于 2026 年 11 月 13 日

选好航线，一次计算采购、运输、机场库存和飞机加油。

## 情景数据

机场坐标来自公开数据。价格、供应与运输容量、库存和飞机参数是可修改的生成数据。导入报价只是更换同一模型的价格输入。

## 1 选择航线

先选择出发地和目的地，再按需要添加经停，组成 1–5 段连续航线。每次起飞对应一个规划阶段。机场顺序保持不变，模型统一安排整条链上的燃油流动。也可以单独打开示例航线。

## 2 设置供给条件

生成航线数据，再调整供应商容量、运输成本与提前期、机场初始库存和储存上限。在同一张表里设置飞机参数、初始油量与备份油。重复经过同一机场时，会使用同一份库存。

## 3 一次计算

计算将供应商采购、运输到货、机场库存和飞机加油连在一起。燃油必须先到货，才能装入飞机。供应与运输容量、储存上限、机场保留库存，以及飞机油量和重量限制会一起检查。运输提前期按起飞阶段计算。

## 4 查看完整方案

沿着供应商、机场和航段查看燃油数量。成本拆分列出采购、运输、处理、库存持有、加注服务和适用调整项。飞机加油量与额外耗油会和逐段按需加油的基线比较，两者使用相同供给网络、初始及终点库存。

## 5 换入自己的报价

导入带有效期、包含费用的到机报价，单位为美元/公吨，并选好飞行日期。报价直接进入采购成本，不再重复叠加模拟的上游和服务费用。供应、库存和飞机限制仍然生效。可以导出完整输入与方案，保存本次计算。

## 按相同条件比较

基线在每个航段只加所需燃油，同时在相同约束下优化上游供给。两种方案采用相同的终点飞机油量和机场库存目标。基线无法执行时，先查看限制条件。携油造成的额外耗油已经计入采购数量。

## 逐项接入实际数据

| 数据 | 来源 | 在模型中的用途 |
| --- | --- | --- |
| 价格与供油权利 | 供应商报价、合同与发票 | 设置采购价格、有效期、费用口径和分配量。 |
| 飞机性能 | 航司飞行计划与性能数据 | 设置耗油、备份油、载荷、重量限制和额外重量耗油参数。 |
| 运输与机场库存 | 物流运营商、机场燃油运营商和交付计划 | 设置交付能力与提前期、可用初始库存、储存空间和库存目标。 |
| 市场背景 | 公开能源价格、汇率与国家平衡数据 | 在数据页帮助设置情景并比较市场变化。 |

## 改一个条件，再比较

试着降低一家供应商的容量、延后一次交付，或提高某个机场的保留库存。重新计算，观察采购、库存和加油量如何一起变化。同一份结果也会显示额外携油造成的耗油。


# Fuel Atlas Method

Updated 13 November 2026

Choose your route and solve procurement, transport, airport stocks and aircraft uplift in one calculation.

## Scenario data

Airport coordinates come from public data. Prices, supplier and transport capacities, stocks and aircraft inputs are generated assumptions that you can edit. Imported quotations provide another price input to the same model.

## 1 Choose your route

Choose the departure and destination, then add stops for a continuous route of 1–5 legs. Each departure is one planning stage. The airport order stays fixed while the model decides how fuel moves through the whole chain. An example route is available separately.

## 2 Set the supply conditions

Generate the route inputs, then adjust supplier capacity, transport cost and lead stages, opening airport stock and storage limits. Set the aircraft profile, starting fuel and reserves in the same form. Repeated visits to an airport draw on the same stock pool.

## 3 Calculate once

The calculation connects supplier purchases to transport arrivals, airport stock and aircraft uplift. Fuel must arrive before it can be loaded. Supplier and route capacities, storage, airport reserves and aircraft fuel and weight limits are enforced together. Transport lead times are counted in departure stages.

## 4 Read the complete plan

Follow quantities from each supplier to each airport and flight leg. The cost breakdown separates procurement, freight, handling, stock holding, into-plane service and applicable adjustments. Compare aircraft uplift and extra burn with a minimum-uplift baseline that uses the same supply network and starting and final stocks.

## 5 Use your own quotations

Import dated, fee-inclusive into-plane offers in USD per metric tonne and choose the flight date. The quoted price enters procurement directly, so modeled upstream and service fees are not added again. Supply, storage and aircraft constraints still apply. Export the complete inputs and plan to keep the calculation.

## Compare like with like

The baseline loads only the fuel needed for each flight leg while optimizing upstream supply under the same constraints. Both plans use the same final aircraft fuel and airport-stock targets. If the baseline cannot be served, inspect the limiting conditions first. Extra carriage fuel is already included in the purchase quantities.

## Replace inputs with operational data

| Input | Source | Use in the model |
| --- | --- | --- |
| Prices and supply rights | Supplier offers, contracts and invoices | Set procurement prices, valid dates, fee coverage and allocated volumes. |
| Aircraft performance | Operator flight-planning and performance data | Set burn, reserves, payload, weight limits and the extra-weight fuel penalty. |
| Transport and airport stocks | Logistics operators, fuel operators and delivery schedules | Set delivery capacity and lead stages, usable opening stock, storage space and stock targets. |
| Market background | Public energy prices, exchange rates and national balances | Inform scenario assumptions and market comparisons in the Data tab. |

## Change one constraint and compare

Reduce one supplier’s capacity, delay a delivery or raise an airport’s reserve target. Calculate again and see how procurement, stock and uplift change together. The same result also shows the fuel burned to carry extra fuel.
