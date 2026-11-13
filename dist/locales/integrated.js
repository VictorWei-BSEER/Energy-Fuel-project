export const integratedMessages = {
  "chain.eyebrow": {
    "en": "SUPPLY TO FLIGHT",
    "zh": "从供油到航班"
  },
  "chain.title": {
    "en": "Connect the fuel supply",
    "zh": "把燃油供应接入航线"
  },
  "chain.reset": {
    "en": "Reset supply assumptions",
    "zh": "重置供应参数"
  },
  "chain.intro": {
    "en": "The same calculation chooses purchases, deliveries, airport stocks and aircraft uplift. Each airport can only put fuel on board when its supply and inventory allow it.",
    "zh": "同一次计算决定采购、配送、机场库存和航班加油量。每个机场的可加注量都受到设定的供油和库存约束。"
  },
  "chain.sourcing": {
    "en": "Purchase",
    "zh": "采购"
  },
  "chain.delivery": {
    "en": "Delivery",
    "zh": "配送"
  },
  "chain.stock": {
    "en": "Airport stock",
    "zh": "机场库存"
  },
  "chain.uplift": {
    "en": "Aircraft uplift",
    "zh": "航班加油"
  },
  "chain.empty": {
    "en": "Choose your airports to generate the connected supply network.",
    "zh": "选好机场后，这里会生成与航线相连的供应网络。"
  },
  "chain.timing": {
    "en": "Each departure is one supply window. Deliveries arrive before uplift. A lead time of one window means fuel dispatched now is available at the next departure.",
    "zh": "每次出发对应一个供油窗口，配送先到货，再进行加注。提前期为 1 个窗口，表示本窗口发出的燃油在下次出发前可用。"
  },
  "chain.suppliersTitle": {
    "en": "Suppliers and purchase limits",
    "zh": "供应商与采购上限"
  },
  "chain.supplier": {
    "en": "Supplier",
    "zh": "供应商"
  },
  "chain.purchaseRate": {
    "en": "Product · USD/t",
    "zh": "产品价 · 美元/吨"
  },
  "chain.stageCap": {
    "en": "Limit · t/window",
    "zh": "上限 · 吨/窗口"
  },
  "chain.totalCap": {
    "en": "Limit · t/rotation",
    "zh": "上限 · 吨/轮转"
  },
  "chain.routesTitle": {
    "en": "Deliveries and lead times",
    "zh": "配送与到货时间"
  },
  "chain.route": {
    "en": "Supply route",
    "zh": "供油路径"
  },
  "chain.freight": {
    "en": "Freight · USD/t",
    "zh": "运输费 · 美元/吨"
  },
  "chain.basis": {
    "en": "Price adjustment · USD/t",
    "zh": "价格调整 · 美元/吨"
  },
  "chain.lead": {
    "en": "Lead time · windows",
    "zh": "提前期 · 窗口数"
  },
  "chain.offersTitle": {
    "en": "Delivered supplier offers",
    "zh": "供应商交付报价"
  },
  "chain.airport": {
    "en": "Airport",
    "zh": "机场"
  },
  "chain.quotedPrice": {
    "en": "All-in offer · USD/t",
    "zh": "全包报价 · 美元/吨"
  },
  "chain.stockTitle": {
    "en": "Airport stocks and into-plane costs",
    "zh": "机场库存与加注费用"
  },
  "chain.opening": {
    "en": "Opening · t",
    "zh": "期初库存 · 吨"
  },
  "chain.terminal": {
    "en": "Final target · t",
    "zh": "期末目标 · 吨"
  },
  "chain.capacity": {
    "en": "Storage · t",
    "zh": "储存容量 · 吨"
  },
  "chain.reserve": {
    "en": "Stock floor · t",
    "zh": "库存下限 · 吨"
  },
  "chain.service": {
    "en": "Into-plane · USD/t",
    "zh": "加注费 · 美元/吨"
  },
  "chain.holding": {
    "en": "Holding · USD/t/window",
    "zh": "持有费 · 美元/吨/窗口"
  },
  "chain.resultEyebrow": {
    "en": "ONE PLAN, FROM PURCHASE TO FLIGHT",
    "zh": "从采购到航班，同一套方案"
  },
  "chain.resultTitle": {
    "en": "Follow the fuel through the system",
    "zh": "查看燃油在整个系统中的流动"
  },
  "chain.resultIntro": {
    "en": "Purchases and deliveries feed the same airport stocks used by the aircraft. The cost below includes each charge once.",
    "zh": "采购和配送进入机场库存，航班从该库存中加油。以下成本按各计费环节汇总，每项计入一次。"
  },
  "chain.flowsTitle": {
    "en": "Purchases and deliveries",
    "zh": "采购与配送"
  },
  "chain.dispatch": {
    "en": "Dispatch window",
    "zh": "发货窗口"
  },
  "chain.arrival": {
    "en": "Arrival window",
    "zh": "到货窗口"
  },
  "chain.quantity": {
    "en": "Delivered · t",
    "zh": "到货量 · 吨"
  },
  "chain.flowCost": {
    "en": "Supply cost · USD",
    "zh": "供应成本 · 美元"
  },
  "chain.inventoryTitle": {
    "en": "Airport fuel balance at every departure",
    "zh": "每次出发时的机场燃油平衡"
  },
  "chain.window": {
    "en": "Window",
    "zh": "窗口"
  },
  "chain.receipts": {
    "en": "Receipts · t",
    "zh": "到货 · 吨"
  },
  "chain.flightUplift": {
    "en": "Aircraft uplift · t",
    "zh": "航班加油 · 吨"
  },
  "chain.closing": {
    "en": "Closing · t",
    "zh": "期末库存 · 吨"
  },
  "chain.balance": {
    "en": "Opening stock + receipts − aircraft uplift = closing stock. Both plans use the same opening stocks and final stock targets.",
    "zh": "期初库存 + 到货 − 航班加油 = 期末库存。两种方案采用相同的期初库存和期末库存目标。"
  },
  "chain.modeled": {
    "en": "Generated supply data · Edit the suppliers, delivery limits and airport stocks below.",
    "zh": "生成的供应数据 · 可调整下方供应商、配送限制和机场库存。"
  },
  "chain.delivered": {
    "en": "Imported delivered offers · Each all-in price pays for the fuel at the airport. Availability and airport stock constraints still apply.",
    "zh": "导入的交付报价 · 全包价格用于采购已交付机场的燃油，供油量和机场库存约束继续参与计算。"
  },
  "chain.updated": {
    "en": "Supply inputs updated. Calculate the plan again.",
    "zh": "供应参数已更新，重新计算即可查看方案。"
  },
  "chain.invalid": {
    "en": "Check this value. Limits and costs need valid numbers, and lead time needs a whole number of windows.",
    "zh": "请检查这个数值。成本和上限需填写有效数字，提前期需填写整数窗口数。"
  },
  "chain.notReady": {
    "en": "Complete the route and airport prices to generate the supply network.",
    "zh": "补齐航线和机场价格后，即可生成供应网络。"
  },
  "chain.quoteWindow": {
    "en": "Valid offer for {{count}} departure windows",
    "zh": "适用于 {{count}} 个出发窗口"
  },
  "chain.supplierName": {
    "en": "{{region}} supply pool",
    "zh": "{{region}}供油池"
  },
  "chain.baseline": {
    "en": "Minimum-uplift comparison",
    "zh": "逐站按需比较方案"
  },
  "chain.optimized": {
    "en": "Joint optimized plan",
    "zh": "联合优化方案"
  },
  "chain.productCost": {
    "en": "Product purchases",
    "zh": "燃油采购"
  },
  "chain.transportCost": {
    "en": "Freight and handling",
    "zh": "运输与装卸"
  },
  "chain.stockCost": {
    "en": "Inventory holding",
    "zh": "库存持有"
  },
  "chain.intoPlaneCost": {
    "en": "Into-plane service",
    "zh": "机场加注"
  },
  "chain.adjustmentCost": {
    "en": "Price and tax adjustments",
    "zh": "价格与税费调整"
  },
  "chain.deliveredCost": {
    "en": "Delivered quotations",
    "zh": "交付报价采购"
  },
  "chain.totalCost": {
    "en": "Total system cost",
    "zh": "系统总成本"
  },
  "chain.noFlow": {
    "en": "Opening stocks cover the required uplift.",
    "zh": "所需加油由期初库存满足。"
  },
  "chain.quoteSupplier": {
    "en": "Delivered offer",
    "zh": "交付报价"
  },
  "chain.noComparison": {
    "en": "The minimum-uplift plan cannot meet these supply constraints. The feasible joint plan is shown.",
    "zh": "逐站按需方案无法满足当前供应约束，这里展示可行的联合方案。"
  },
  "chain.flightReference": {
    "en": "Delivered fuel reference",
    "zh": "机场交付参考价"
  },
  "chain.costAllocation": {
    "en": "Flight costs are allocated from this joint supply plan in proportion to each airport’s uplift.",
    "zh": "各航段按该机场的加注量分摊联合供应方案中的成本。"
  },
  "Fuel supply flow": {
    "en": "Fuel supply flow",
    "zh": "燃油供应流程"
  },
  "Joint supply-cost saving · scenario": {
    "en": "Joint supply-cost saving · scenario",
    "zh": "联合供应成本节省 · 情景"
  },
  "Joint supply-cost saving · user quotes": {
    "en": "Joint supply-cost saving · user quotes",
    "zh": "联合供应成本节省 · 用户报价"
  },
  "Same route · same aircraft and airport stock targets": {
    "en": "Same route · same aircraft and airport stock targets",
    "zh": "相同航线、机上燃油及机场库存目标"
  },
  "Allocated supply cost": {
    "en": "Allocated supply cost",
    "zh": "分摊供应成本"
  },
  "Supply network inputs changed. Calculate the joint plan again.": {
    "en": "Supply network inputs changed. Calculate the joint plan again.",
    "zh": "供应参数已更新，请重新计算联合方案。"
  },
  "Check aircraft inputs and the connected supply settings, then calculate again.": {
    "en": "Check aircraft inputs and the connected supply settings, then calculate again.",
    "zh": "请检查飞机参数和供应网络设置，再重新计算。"
  },
  "Complete the route and its prices before calculating the connected plan.": {
    "en": "Complete the route and its prices before calculating the connected plan.",
    "zh": "请先补齐航线和各站价格，再计算联合方案。"
  },
  "Joint network constraints cannot supply this rotation. Review source capacity, delivery timing and airport stocks.": {
    "en": "Joint network constraints cannot supply this rotation. Review source capacity, delivery timing and airport stocks.",
    "zh": "当前供应网络无法完成这条航线，请检查供油量、到货时间和机场库存。"
  },
  "The minimum-uplift comparison cannot meet the connected supply constraints.": {
    "en": "The minimum-uplift comparison cannot meet the connected supply constraints.",
    "zh": "逐站按需比较方案无法满足当前供应网络约束。"
  },
  "Supply settings contain invalid values. Review the connected inputs.": {
    "en": "Supply settings contain invalid values. Review the connected inputs.",
    "zh": "供应设置中存在无效数值，请检查相关参数。"
  },
  "The solution did not pass its fuel-balance checks. Review the inputs and calculate again.": {
    "en": "The solution did not pass its fuel-balance checks. Review the inputs and calculate again.",
    "zh": "结果未通过燃油平衡检查，请核对输入后重新计算。"
  },
  "Carbon cost at this level offsets the fuel saving. Direct combustion CO₂ only; the route is optimized for fuel purchase cost.": {
    "en": "This carbon charge offsets the supply-cost saving between these plans. Emissions here cover aircraft fuel combustion.",
    "zh": "按这一碳价计费，会抵消两种方案之间的供应成本节省。这里的排放量按飞机燃油燃烧计算。"
  },
  "chain.handling": {
    "en": "Handling · USD/t",
    "zh": "装卸费 · 美元/吨"
  },
  "chain.tax": {
    "en": "Tax adjustment · USD/t",
    "zh": "税费调整 · 美元/吨"
  },
"The fuel reference is below its delivery and service components. Adjust the price or cost breakdown.":{"en": "The fuel reference is below its delivery and service components. Adjust the price or cost breakdown.", "zh": "燃油参考价低于拆分出的配送与加注费用，请调整价格或费用构成。"}
};
