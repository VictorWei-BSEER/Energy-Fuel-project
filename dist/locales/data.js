export const dataMessages = {
  "data.eyebrow": {
    "en": "Inputs you can inspect",
    "zh": "每个输入都有依据"
  },
  "data.title": {
    "en": "Fuel data",
    "zh": "航油数据"
  },
  "data.badge": {
    "en": "Scenario data",
    "zh": "情景数据"
  },
  "data.intro": {
    "en": "A complete starting dataset for 67 airports. Prices follow the same formula, and flight inputs follow the route and aircraft you choose. Change the assumptions here to update your model.",
    "zh": "这里提供 67 个机场的完整起始数据。机场价格采用同一套计算规则，飞行参数随你选择的航线和机型生成。调整下方假设后，模型会同步更新。"
  },
  "data.step1": {
    "en": "01 / Shared assumptions",
    "zh": "01 / 统一假设"
  },
  "data.assumptions": {
    "en": "Build a consistent price picture",
    "zh": "用同一套规则构建机场价格"
  },
  "data.reset": {
    "en": "Restore defaults",
    "zh": "恢复默认值"
  },
  "data.priceReason": {
    "en": "The starting base of USD 800/t gives every airport a common reference. Regional adjustments create an explicit supply scenario. Distance to a regional reference airport adds a transport proxy, followed by service and tax adjustments.",
    "zh": "默认基础价为 800 美元/吨，让各机场有一个共同参照。区域差价表达设定的供给条件，再按机场到区域参照机场的距离加入运输成本，最后计入加注服务费和税费。"
  },
  "data.base": {
    "en": "Common jet-fuel base",
    "zh": "共同航油基础价"
  },
  "data.transport": {
    "en": "Distance transport coefficient",
    "zh": "距离运输系数"
  },
  "data.tax": {
    "en": "Fiscal adjustment",
    "zh": "税费调整"
  },
  "data.supply": {
    "en": "Supply cap per visit",
    "zh": "每次到访供油上限"
  },
  "data.supplyUnit": {
    "en": "tonnes per visit",
    "zh": "吨/次"
  },
  "data.apply": {
    "en": "Apply to model",
    "zh": "应用到模型"
  },
  "data.supplyReason": {
    "en": "The default supply cap is 120 tonnes per visit. Lower it to test a supply constraint. The reference airports organise the distance calculation, while regional price adjustments remain editable scenario choices.",
    "zh": "默认每次到访最多供应 120 吨，可以下调来测试供应受限的影响。区域参照机场用于计算距离，区域差价是这套情景中明确设定的参数。"
  },
  "data.step2": {
    "en": "02 / Airport dataset",
    "zh": "02 / 机场数据"
  },
  "data.airports": {
    "en": "See how each price is built",
    "zh": "查看各机场的价格构成"
  },
  "data.downloadJson": {
    "en": "Download data and assumptions",
    "zh": "下载数据与假设"
  },
  "data.downloadCsv": {
    "en": "Download airport CSV",
    "zh": "下载机场 CSV"
  },
  "data.searchLabel": {
    "en": "Find an airport",
    "zh": "查找机场"
  },
  "data.tableCaption": {
    "en": "Generated airport prices and supply assumptions",
    "zh": "生成的机场价格与供油假设"
  },
  "data.airport": {
    "en": "Airport",
    "zh": "机场"
  },
  "data.price": {
    "en": "Price · USD/t",
    "zh": "价格 · 美元/吨"
  },
  "data.cap": {
    "en": "Supply · t/visit",
    "zh": "供油 · 吨/次"
  },
  "data.step3": {
    "en": "03 / Your route",
    "zh": "03 / 你的航线"
  },
  "data.flightTitle": {
    "en": "Follow the inputs into the calculation",
    "zh": "从输入追溯到计算结果"
  },
  "data.chooseRoute": {
    "en": "Choose a route",
    "zh": "选择航线"
  },
  "data.flightReason": {
    "en": "Airport coordinates give the great-circle distance. A route multiplier and cruise speed give flight time. Cruise, climb and taxi assumptions then give fuel burn. Reserves and the cost of carrying extra fuel are calculated separately.",
    "zh": "机场坐标给出大圆距离，结合航路距离系数和巡航速度得到航时，再用巡航、爬升和滑行参数推导耗油量。保留油和额外携油的耗油成本分别计算。"
  },
  "data.methodTitle": {
    "en": "Calculation and calibration",
    "zh": "计算方法与校准方向"
  },
  "sources.eyebrow": {
    "en": "From scenario to evidence",
    "zh": "从情景走向实证"
  },
  "sources.title": {
    "en": "Connect the right data",
    "zh": "接入真正需要的数据"
  },
  "sources.intro": {
    "en": "Each input has a clear replacement path. Start with a route and a set of assumptions, then bring in dated supplier prices, flight performance and confirmed supply limits as they become available.",
    "zh": "每类输入都有对应的数据接入路径。先选航线并设定参数，再逐步换成有日期的供应商报价、飞行性能数据和确认可用的供油量。"
  },
  "sources.planTitle": {
    "en": "What to collect and where to get it",
    "zh": "需要什么数据，从哪里获取"
  },
  "sources.import": {
    "en": "Import fuel quotations",
    "zh": "导入航油报价"
  },
  "sources.input": {
    "en": "Model input",
    "zh": "模型输入"
  },
  "sources.current": {
    "en": "Available now",
    "zh": "当前可用"
  },
  "sources.next": {
    "en": "Replacement data",
    "zh": "后续数据来源"
  },
  "sources.geo": {
    "en": "Airport geography",
    "zh": "机场地理信息"
  },
  "sources.geoNow": {
    "en": "Coordinates for 67 airports, sourced from OurAirports. The map uses Natural Earth boundaries.",
    "zh": "67 个机场的坐标来自 OurAirports，地图边界来自 Natural Earth。"
  },
  "sources.geoNext": {
    "en": " provides a public starting point. Confirm the airport and operational routing against the flight plan.",
    "zh": " 提供公开的起始数据。实际使用时，按飞行计划核对机场与航路。"
  },
  "sources.price": {
    "en": "Delivered jet-fuel price",
    "zh": "机场交付航油价格"
  },
  "sources.priceNow": {
    "en": "A common jet-fuel base plus regional, distance, service and tax adjustments.",
    "zh": "共同航油基础价，加上区域差价、距离运输成本、服务费和税费。"
  },
  "sources.priceNext": {
    "en": "Request dated into-plane offers from airport fuel suppliers, airlines or fuel brokers. Record airport, currency, unit, fees, tax treatment, validity and supplier. Import comparable prices in USD/t.",
    "zh": "向机场供油商、航空公司或燃油经纪商取得有日期的加注报价，记录机场、币种、单位、费用、税务待遇、有效期和供应商，统一为美元/吨后导入。"
  },
  "sources.flight": {
    "en": "Flight performance",
    "zh": "飞行性能"
  },
  "sources.flightNow": {
    "en": "Two generic aircraft profiles derive fuel use from distance and time.",
    "zh": "两类通用机型按距离和航时推导航油消耗。"
  },
  "sources.flightNext": {
    "en": "Use operator flight-planning outputs for the chosen aircraft, payload, weather and routing. ",
    "zh": "采用运营方针对机型、载荷、天气和航路生成的飞行计划数据。"
  },
  "sources.openap": {
    "en": " can support an initial research calibration.",
    "zh": " 可用于研究阶段的初步校准。"
  },
  "sources.reserve": {
    "en": "Fuel reserve and weight limits",
    "zh": "保留油和重量限制"
  },
  "sources.reserveNow": {
    "en": "Explicit reserve, tank, takeoff and landing assumptions.",
    "zh": "明确设定保留油、油箱容量、起飞和落地重量限制。"
  },
  "sources.reserveNext": {
    "en": "Use the operator's approved reserve policy, aircraft limits, payload plan and airport-specific performance restrictions.",
    "zh": "使用运营方批准的保留油规则、飞机限制、载荷计划，以及具体机场的性能限制。"
  },
  "sources.supply": {
    "en": "Available uplift",
    "zh": "可加注量"
  },
  "sources.supplyNow": {
    "en": "An adjustable supply cap for each visit, with individual leg overrides.",
    "zh": "每次到访的供油上限可调整，也可在各航段单独修改。"
  },
  "sources.supplyNext": {
    "en": "Confirm allocated tonnes and the uplift window with each supplier. Add delivery-rate, slot or storage constraints when the operation requires them.",
    "zh": "向供应商确认可分配吨数和加注时段。按实际运行需求加入加注速度、时隙或储罐容量限制。"
  },
  "sources.benchmark": {
    "en": "Jet-fuel market context",
    "zh": "航油市场参照"
  },
  "sources.benchmarkNow": {
    "en": "The common scenario base is transparent and editable.",
    "zh": "共同基础价公开展示，可以自行调整。"
  },
  "sources.eia": {
    "en": "EIA's US Gulf Coast jet-fuel series",
    "zh": "EIA 美国墨西哥湾航油序列"
  },
  "sources.benchmarkNext": {
    "en": " gives public wholesale context with its own reporting lag. Regional assessments from Platts or Argus require the relevant access. Airport prices still need local delivery terms.",
    "zh": " 可作为公开批发市场参照，注意其发布日期和延迟。Platts、Argus 等区域评估需要相应权限。机场价格仍需结合当地交付条款。"
  },
  "sources.modelEyebrow": {
    "en": "The decision",
    "zh": "模型回答的问题"
  },
  "sources.modelTitle": {
    "en": "Where should this rotation buy fuel?",
    "zh": "这条航线应该在哪些机场买多少油？"
  },
  "sources.modelText": {
    "en": "You choose the airports and their order. The model chooses how much fuel to buy at each stop while meeting fuel balance, reserve, tank, weight and supply constraints. It compares that plan with buying the minimum needed on each leg, using the same final fuel target.",
    "zh": "你决定机场和停靠顺序，模型决定各站购油量，同时满足燃油平衡、保留油、油箱、重量和供油限制。比较对象是每段只买够用的方案，两者采用相同的终点剩余油量目标。"
  },
  "sources.modelNext": {
    "en": "A single leg checks feasibility and cost. Several legs reveal whether a lower price at an earlier stop justifies carrying extra fuel.",
    "zh": "单航段用于检查可行性和成本。多个航段可以判断前站的低价是否足以抵消额外携油带来的耗油。"
  },
  "sources.packageEyebrow": {
    "en": "Reproducible inputs",
    "zh": "可复现的输入"
  },
  "sources.packageTitle": {
    "en": "Keep the assumptions with the result",
    "zh": "让假设和结果一起保存"
  },
  "sources.packageText": {
    "en": "The dataset download includes all 67 airport records, price components, aircraft profiles, formulas and replacement sources. The model export records the route, inputs and calculated fuel plan so the result can be rerun.",
    "zh": "数据下载包含全部 67 个机场、价格构成、机型参数、公式和后续数据来源。模型导出则保留航线、输入和计算出的加油方案，方便复算。"
  },
  "sources.inspect": {
    "en": "Inspect the dataset",
    "zh": "查看数据集"
  },
  "sources.guide": {
    "en": "Read the model guide",
    "zh": "查看模型说明"
  },
  "data.searchPlaceholder": {
    "en": "Airport code, name or country",
    "zh": "机场代码、名称或国家"
  },
  "data.count": {
    "en": "{{visible}} of {{total}} airports",
    "zh": "显示 {{visible}} 个，共 {{total}} 个机场"
  },
  "data.applied": {
    "en": "Assumptions applied. Calculate again to update the fuel plan.",
    "zh": "参数已应用。重新计算即可更新加油方案。"
  },
  "data.invalid": {
    "en": "Use finite values, a positive base price and non-negative transport and supply. Every generated airport price must stay above zero.",
    "zh": "请输入有效数值。基础价须大于零，运输系数和供油上限须为非负数，生成后的各机场价格也须大于零。"
  },
  "data.total": {
    "en": "Generated price",
    "zh": "生成价格"
  },
  "data.hub": {
    "en": "{{region}} · reference airport {{hub}}",
    "zh": "{{region}} · 参照机场 {{hub}}"
  },
  "data.distance": {
    "en": "{{distance}} km × {{coefficient}} USD/t/km",
    "zh": "{{distance}} 公里 × {{coefficient}} 美元/吨/公里"
  },
  "data.hubReason": {
    "en": "Reference-airport distance provides a consistent transport proxy across the dataset. Replace it with the actual supply route and tariff when available.",
    "zh": "参照机场距离为整套数据提供统一的运输成本代理。取得实际供应路径和运价后，可以替换这部分计算。"
  },
  "data.airportSupply": {
    "en": "Supply assumption {{cap}} tonnes per visit",
    "zh": "供油假设为每次到访 {{cap}} 吨"
  },
  "data.noMatches": {
    "en": "No airports match this search.",
    "zh": "没有匹配的机场。"
  },
  "data.emptyRoute": {
    "en": "Choose an origin and destination in the model to see the generated flight inputs here.",
    "zh": "在模型中选择出发机场和目的机场后，这里会显示生成的飞行参数。"
  },
  "data.routeIntro": {
    "en": "{{profile}} · {{count}} complete legs",
    "zh": "{{profile}} · {{count}} 个完整航段"
  },
  "data.routeQuotes": {
    "en": "The route uses imported quotations. Airport scenario values remain available here for comparison.",
    "zh": "当前航线使用导入报价，机场情景数据可在这里作比较。"
  },
  "data.routeScenario": {
    "en": "The route uses generated prices, including any price changes you made in the model.",
    "zh": "当前航线使用生成价格，并保留你在模型中手动修改的价格。"
  },
  "data.leg": {
    "en": "Leg",
    "zh": "航段"
  },
  "data.distanceLabel": {
    "en": "Distance · km",
    "zh": "距离 · 公里"
  },
  "data.duration": {
    "en": "Airborne time · h",
    "zh": "飞行时间 · 小时"
  },
  "data.burn": {
    "en": "Base burn · t",
    "zh": "基础耗油 · 吨"
  },
  "data.reserveLabel": {
    "en": "Reserve · t",
    "zh": "保留油 · 吨"
  },
  "data.carry": {
    "en": "Carriage loss",
    "zh": "携油损耗率"
  },
  "data.currentPrice": {
    "en": "Current price · USD/t",
    "zh": "当前价格 · 美元/吨"
  },
  "data.missingPrice": {
    "en": "Quote needed",
    "zh": "需导入报价"
  },
  "data.formulaTime": {
    "en": "Airborne hours = great-circle kilometres × route multiplier ÷ cruise speed + non-cruise allowance.",
    "zh": "飞行小时数 = 大圆距离 × 航路距离系数 ÷ 巡航速度 + 非巡航时间。"
  },
  "data.formulaBurn": {
    "en": "Base burn = cruise hours × cruise burn rate + climb/descent allowance. Taxi fuel is added separately at departure.",
    "zh": "基础耗油 = 巡航时间 × 巡航耗油率 + 爬升和下降燃油。滑行燃油在出发时另计。"
  },
  "data.formulaReserve": {
    "en": "Reserve = the larger of the reserve floor and the sum of contingency, holding and alternate fuel.",
    "zh": "保留油取以下两者中的较大值：设定下限，或应急、等待和备降燃油之和。"
  },
  "data.formulaCarry": {
    "en": "Carriage loss = 1 − exp(−hourly coefficient × airborne hours). The hourly coefficient controls the additional fuel burned to carry extra fuel.",
    "zh": "携油损耗率 = 1 − exp(−每小时系数 × 飞行小时数)。每小时系数控制携带额外燃油增加的耗油。"
  },
  "data.calibrate": {
    "en": "Calibrate these profiles with operator flight-planning data for the aircraft, payload, wind and route. ICAO discusses an indicative 2.5–4.5% per hour carriage-cost range; the chosen coefficients are scenario parameters.",
    "zh": "取得实际机型、载荷、风况和航路的飞行计划数据后，可据此校准。ICAO 讨论过每小时约 2.5%–4.5% 的携油成本范围，这里的具体系数是情景参数。"
  },
  "data.profile": {
    "en": "Aircraft profile",
    "zh": "机型参数"
  },
  "data.speed": {
    "en": "Cruise speed · km/h",
    "zh": "巡航速度 · 公里/小时"
  },
  "data.burnRate": {
    "en": "Cruise burn · t/h",
    "zh": "巡航耗油 · 吨/小时"
  },
  "data.coefficient": {
    "en": "Carriage coefficient · 1/h",
    "zh": "携油系数 · 每小时"
  },
  "data.routeFactor": {
    "en": "Route multiplier",
    "zh": "航路距离系数"
  },
  "data.coords": {
    "en": "Coordinates from OurAirports",
    "zh": "坐标来源为 OurAirports"
  },
  "data.exported": {
    "en": "Dataset downloaded with its assumptions and input classifications.",
    "zh": "已下载数据及其假设和输入分类。"
  },
  "data.regionalTitle": {
    "en": "Regional supply assumptions",
    "zh": "区域供给假设"
  },
  "data.regionalReason": {
    "en": "These starting adjustments create a spread of supply conditions to test the model. The Gulf and Southeast Asia form the lower-cost scenario, while other regions have progressively higher delivery adjustments. Change them to test a different market structure.",
    "zh": "这组起始差价用于测试不同供给条件下的模型表现。海湾和东南亚设为较低成本情景，其他区域逐步提高交付成本。你可以修改这些参数，检验另一种市场结构。"
  },
  "data.region": {
    "en": "Region",
    "zh": "区域"
  },
  "data.reference": {
    "en": "Reference airport",
    "zh": "参照机场"
  },
  "data.basis": {
    "en": "Supply adjustment · USD/t",
    "zh": "供给差价 · 美元/吨"
  },
  "data.service": {
    "en": "Service adjustment · USD/t",
    "zh": "服务费 · 美元/吨"
  },
  "data.applyRegional": {
    "en": "Apply regional assumptions",
    "zh": "应用区域假设"
  },
  "data.regionalInvalid": {
    "en": "Check each regional adjustment. Service costs must be non-negative and generated airport prices must stay positive.",
    "zh": "请检查各区域参数。服务费须为非负数，生成后的各机场价格须大于零。"
  }
};
