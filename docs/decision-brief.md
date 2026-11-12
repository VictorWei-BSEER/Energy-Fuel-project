# Fuel Atlas 使用说明

更新于 2026 年 11 月 13 日

选好航线，生成一组数据，看看每一站怎么加油。

## 情景数据

机场坐标来自公开地理数据。价格、供油上限和飞机参数是用于推演的生成数据，相同设置会得到相同结果。有自己的数据后，可以逐项替换。

## 1 选择航线

先选择出发地和目的地，再按需要添加经停，组成 1–5 段连续航线。地图会随选择变化。模型沿这条航线计算各站加油量。也可以单独打开示例航线。

## 2 生成数据

为航线生成一组完整数据。机场油价和供油上限按情景规则设定，飞行时间、耗油和备份油根据距离及所选飞机参数计算。生成后可以继续修改。

## 3 计算方案

修改后运行计算。模型会检查油量平衡、油箱容量、起降重量、备份油和各机场的供油上限。当前设置无法完成航线时，结果会指出需要调整的限制。

## 4 比较两种方案

比较每站按需加油和提前多买燃油两种方案。两者采用相同的初始油量和终点油量。除了采购成本，也要看额外耗油、各站加油量与剩余燃油。播放航线可以查看这些数值沿途如何变化。

## 5 换入自己的数据

导入带有效期的机场报价，选好飞行日期，再更新飞机和供油参数。报价统一为包含到机费用的美元/公吨。缺失或有效期重叠的报价会提示修正。最后可以导出输入和结果，保存本次比较。

## 成本降低意味着什么

采购成本降低，可能同时伴随更多飞行耗油。用于携油的额外燃油已经计入采购成本。评估最终收益时，再补充单独的碳费用、操作费用和载荷影响。

## 接下来接哪些数据

| 数据 | 来源 | 在模型中的用途 |
| --- | --- | --- |
| 机场航油价格 | 供应商报价、航司合同与发票 | 替换生成价格，同时保留有效期、币种、单位、费用与采购条件。 |
| 飞机性能 | 航司认可的性能与飞行计划数据 | 替换耗油率、重量限制、备份油和额外重量耗油参数。 |
| 实际供油能力 | 供应商、机场燃油运营商及合同供油权利 | 设置每次停靠可获得的加油量，并测试供油中断。 |
| 市场基准 | 公开能源价格、汇率与国家燃油平衡数据 | 观察市场背景并设置情景，机场合同价单独接入。 |

## 先从一个变化开始

先改一个机场的价格或供油上限，重新计算并比较。再试不同的飞机参数或航线，更容易看清结果由什么驱动。研究报告里有更详细的携油成本分析。


# Fuel Atlas Model guide

Updated 13 November 2026

Choose a route, generate a scenario and compare the fuel plan at each stop.

## Scenario data

Airport coordinates come from public geographic data. Prices, supply limits and aircraft parameters are generated assumptions for exploring the model. The same settings produce the same inputs. Replace them with your own data when available.

## 1 Choose the route

Choose the departure and destination, then add stops to build a continuous route of 1–5 legs. The map follows your choices. The model keeps this route fixed and chooses how much fuel to buy at each stop. An example route is available separately.

## 2 Generate the inputs

Generate a complete scenario for the route. Airport prices and supply limits come from the scenario rules. Distance and the selected aircraft profile give flight time, fuel burn and reserves. You can then edit the values you want to test.

## 3 Run the calculation

Run the optimizer after editing. It checks fuel balance, tank capacity, takeoff weight, landing weight, reserves and each airport’s uplift limit. If the route cannot be served with those inputs, the result shows which limits need attention.

## 4 Compare both plans

Compare buying as needed at every stop with buying extra fuel earlier. Both plans start and finish with the same fuel. Read the purchase cost alongside extra burn, uplift by airport and remaining fuel. Playback shows how those values change along the route.

## 5 Bring in your own data

Import dated airport quotes, choose the flight date and update the aircraft and supply inputs. Prices use USD per metric tonne with into-plane fees included. Missing or overlapping quotes are shown for correction. Export the inputs and results to keep a copy of the comparison.

## How to read a lower cost

A lower purchase cost can come with more fuel burned in flight. That extra fuel is already included in the purchase calculation. Add any separate carbon charges, handling costs or payload effects when assessing the final benefit.

## Data to connect next

| Input | Source | Use in the model |
| --- | --- | --- |
| Airport fuel prices | Supplier quotes, airline contracts and invoices | Replace generated prices. Keep validity, currency, units, fees and buyer terms together. |
| Aircraft performance | Airline-approved performance and flight-planning data | Replace burn rates, weight limits, reserves and the extra-weight fuel penalty. |
| Fuel availability | Suppliers, airport fuel operators and contracted delivery rights | Set usable uplift limits for each visit and test a supply interruption. |
| Market benchmarks | Public energy prices, exchange rates and national fuel balances | Track the market background and set scenarios. Airport contract prices remain separate inputs. |

## Try one change at a time

Change one airport price or supply limit, recalculate and compare. Then vary the aircraft or route. This makes it easier to see what is driving the result. The research tab explains the fuel-carriage trade-off in more detail.
