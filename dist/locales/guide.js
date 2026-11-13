export const guideMessages = {
  "guide.eyebrow": {
    "en": "Method",
    "zh": "计算方法"
  },
  "guide.title": {
    "en": "One fuel plan, from supply to flight",
    "zh": "从供油到飞行，一起计算"
  },
  "guide.deck": {
    "en": "Choose your route and solve procurement, transport, airport stocks and aircraft uplift in one calculation.",
    "zh": "选好航线，一次计算采购、运输、机场库存和飞机加油。"
  },
  "guide.downloads": {
    "en": "Model guide downloads",
    "zh": "使用说明下载"
  },
  "guide.pdf.en": {
    "en": "English PDF",
    "zh": "英文 PDF"
  },
  "guide.pdf.zh": {
    "en": "Chinese PDF",
    "zh": "中文 PDF"
  },
  "guide.notes": {
    "en": "Guide and data plan",
    "zh": "说明与数据接入计划"
  },
  "guide.print": {
    "en": "Print view",
    "zh": "打印版"
  },
  "guide.step1.title": {
    "en": "Choose your route",
    "zh": "选择航线"
  },
  "guide.step1.text": {
    "en": "Choose the departure and destination, then add stops for a continuous route of 1–5 legs. Each departure is one planning stage. The airport order stays fixed while the model decides how fuel moves through the whole chain. An example route is available separately.",
    "zh": "先选择出发地和目的地，再按需要添加经停，组成 1–5 段连续航线。每次起飞对应一个规划阶段。机场顺序保持不变，模型统一安排整条链上的燃油流动。也可以单独打开示例航线。"
  },
  "guide.step2.title": {
    "en": "Set the supply conditions",
    "zh": "设置供给条件"
  },
  "guide.step2.text": {
    "en": "Generate the route inputs, then adjust supplier capacity, transport cost and lead stages, opening airport stock and storage limits. Set the aircraft profile, starting fuel and reserves in the same form. Repeated visits to an airport draw on the same stock pool.",
    "zh": "生成航线数据，再调整供应商容量、运输成本与提前期、机场初始库存和储存上限。在同一张表里设置飞机参数、初始油量与备份油。重复经过同一机场时，会使用同一份库存。"
  },
  "guide.scenario.title": {
    "en": "Scenario data",
    "zh": "情景数据"
  },
  "guide.scenario.text": {
    "en": "Airport coordinates come from public data. Prices, supplier and transport capacities, stocks and aircraft inputs are generated assumptions that you can edit. Imported quotations provide another price input to the same model.",
    "zh": "机场坐标来自公开数据。价格、供应与运输容量、库存和飞机参数是可修改的生成数据。导入报价只是更换同一模型的价格输入。"
  },
  "guide.step3.title": {
    "en": "Calculate once",
    "zh": "一次计算"
  },
  "guide.step3.text": {
    "en": "The calculation connects supplier purchases to transport arrivals, airport stock and aircraft uplift. Fuel must arrive before it can be loaded. Supplier and route capacities, storage, airport reserves and aircraft fuel and weight limits are enforced together. Transport lead times are counted in departure stages.",
    "zh": "计算将供应商采购、运输到货、机场库存和飞机加油连在一起。燃油必须先到货，才能装入飞机。供应与运输容量、储存上限、机场保留库存，以及飞机油量和重量限制会一起检查。运输提前期按起飞阶段计算。"
  },
  "guide.step4.title": {
    "en": "Read the complete plan",
    "zh": "查看完整方案"
  },
  "guide.step4.text": {
    "en": "Follow quantities from each supplier to each airport and flight leg. The cost breakdown separates procurement, freight, handling, stock holding, into-plane service and applicable adjustments. Compare aircraft uplift and extra burn with a minimum-uplift baseline that uses the same supply network and starting and final stocks.",
    "zh": "沿着供应商、机场和航段查看燃油数量。成本拆分列出采购、运输、处理、库存持有、加注服务和适用调整项。飞机加油量与额外耗油会和逐段按需加油的基线比较，两者使用相同供给网络、初始及终点库存。"
  },
  "guide.step5.title": {
    "en": "Use your own quotations",
    "zh": "换入自己的报价"
  },
  "guide.step5.text": {
    "en": "Import dated, fee-inclusive into-plane offers in USD per metric tonne and choose the flight date. The quoted price enters procurement directly, so modeled upstream and service fees are not added again. Supply, storage and aircraft constraints still apply. Export the complete inputs and plan to keep the calculation.",
    "zh": "导入带有效期、包含费用的到机报价，单位为美元/公吨，并选好飞行日期。报价直接进入采购成本，不再重复叠加模拟的上游和服务费用。供应、库存和飞机限制仍然生效。可以导出完整输入与方案，保存本次计算。"
  },
  "guide.read.title": {
    "en": "Compare like with like",
    "zh": "按相同条件比较"
  },
  "guide.read.text": {
    "en": "The baseline loads only the fuel needed for each flight leg while optimizing upstream supply under the same constraints. Both plans use the same final aircraft fuel and airport-stock targets. If the baseline cannot be served, inspect the limiting conditions first. Extra carriage fuel is already included in the purchase quantities.",
    "zh": "基线在每个航段只加所需燃油，同时在相同约束下优化上游供给。两种方案采用相同的终点飞机油量和机场库存目标。基线无法执行时，先查看限制条件。携油造成的额外耗油已经计入采购数量。"
  },
  "guide.data.title": {
    "en": "Replace inputs with operational data",
    "zh": "逐项接入实际数据"
  },
  "guide.data.caption": {
    "en": "Data used by the connected model",
    "zh": "同一模型使用的数据"
  },
  "guide.data.input": {
    "en": "Input",
    "zh": "数据"
  },
  "guide.data.source": {
    "en": "Source",
    "zh": "来源"
  },
  "guide.data.use": {
    "en": "Use in the model",
    "zh": "在模型中的用途"
  },
  "guide.data.quote": {
    "en": "Prices and supply rights",
    "zh": "价格与供油权利"
  },
  "guide.data.quote.source": {
    "en": "Supplier offers, contracts and invoices",
    "zh": "供应商报价、合同与发票"
  },
  "guide.data.quote.use": {
    "en": "Set procurement prices, valid dates, fee coverage and allocated volumes.",
    "zh": "设置采购价格、有效期、费用口径和分配量。"
  },
  "guide.data.performance": {
    "en": "Aircraft performance",
    "zh": "飞机性能"
  },
  "guide.data.performance.source": {
    "en": "Operator flight-planning and performance data",
    "zh": "航司飞行计划与性能数据"
  },
  "guide.data.performance.use": {
    "en": "Set burn, reserves, payload, weight limits and the extra-weight fuel penalty.",
    "zh": "设置耗油、备份油、载荷、重量限制和额外重量耗油参数。"
  },
  "guide.data.supply": {
    "en": "Transport and airport stocks",
    "zh": "运输与机场库存"
  },
  "guide.data.supply.source": {
    "en": "Logistics operators, fuel operators and delivery schedules",
    "zh": "物流运营商、机场燃油运营商和交付计划"
  },
  "guide.data.supply.use": {
    "en": "Set delivery capacity and lead stages, usable opening stock, storage space and stock targets.",
    "zh": "设置交付能力与提前期、可用初始库存、储存空间和库存目标。"
  },
  "guide.data.benchmark": {
    "en": "Market background",
    "zh": "市场背景"
  },
  "guide.data.benchmark.source": {
    "en": "Public energy prices, exchange rates and national balances",
    "zh": "公开能源价格、汇率与国家平衡数据"
  },
  "guide.data.benchmark.use": {
    "en": "Inform scenario assumptions and market comparisons in the Data tab.",
    "zh": "在数据页帮助设置情景并比较市场变化。"
  },
  "guide.next.title": {
    "en": "Change one constraint and compare",
    "zh": "改一个条件，再比较"
  },
  "guide.next.text": {
    "en": "Reduce one supplier’s capacity, delay a delivery or raise an airport’s reserve target. Calculate again and see how procurement, stock and uplift change together. The same result also shows the fuel burned to carry extra fuel.",
    "zh": "试着降低一家供应商的容量、延后一次交付，或提高某个机场的保留库存。重新计算，观察采购、库存和加油量如何一起变化。同一份结果也会显示额外携油造成的耗油。"
  },
  "guide.model": {
    "en": "Open the model",
    "zh": "打开模型"
  },
  "guide.research": {
    "en": "Read the research",
    "zh": "阅读研究"
  },
  "guide.sources": {
    "en": "View data and sources",
    "zh": "查看数据与来源"
  },
  "guide.updated": {
    "en": "Updated 13 November 2026",
    "zh": "更新于 2026 年 11 月 13 日"
  },
  "guide.print.href": {
    "en": "./brief/print.html",
    "zh": "./brief/print-zh.html"
  }
};
