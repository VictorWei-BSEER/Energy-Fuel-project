# 东亚机场航油供货价：来源与接入路线

研究日期：2026-11-04（Asia/Shanghai）。本轮仅查阅公开资料，未联系供应商、申请账户或购买数据。

## 结论

没有查到可直接覆盖东亚主要机场、代表航司可成交到机价的免费统一 API。Fuel Atlas 应先接入航司已有合同、供应商有效报价和结算单，再补充公开挂牌与市场基准。**炼厂价、FOB/CIF 现货价、机场挂牌价和航司 into-plane 合同价必须分开显示。**

以下资料确认的是数据渠道和口径；不代表已接通其接口或拿到机场可执行报价。未取得有效报价的机场保留“待报价”，不补造价格。

## 已查证渠道

| 来源 | 覆盖与访问方式 | 口径与限制 |
| --- | --- | --- |
| [台湾中油航油价格表](https://vipmbr.cpc.com.tw/mbwebs/showlistprice_d1510_en.aspx) | 公开 HTML；TPE、TSA、KHH、RMQ、HUN、TTT、KNH | 国际 Jet A-1 为 USD/L 挂牌，国内另列非合同价及税项。TPE 运输、储存费用另收，且页面声明仅供参考。本次页面生效日为 2026-10-01，不能标作今日实时报价。 |
| [World Fuel Contract / myWorld](https://www.world-kinect.com/world-fuel/aviation/payments-aviation/world-fuel-contract) | 客户报价门户；官方称全球 4,200+ 地点，可同时查最多 6 个机场；另有[商业航空服务](https://www.world-kinect.com/world-fuel/aviation/jet-fuel-aviation/commercial-aviation-fuel-solutions) | 需要客户账户和商业接入授权。须核实目标机场、商业宽体机用量、费用及有效期；未确认公开开发者 API。 |
| [Avfuel Contract Fuel](https://www.avfuel.com/fuel/about) | 客户合同报价；全球 3,500+ 地点；[地点查询](https://locations.avfuel.iflightplanner.com/) | 合同价与零售价不同。东亚机场覆盖和商业宽体机适用性需逐一确认，不能直接套用公务机报价。 |
| [Airportdata Level 4 API](https://api.airportdata.com/technical-specifications/details-levels-3-4) | 付费订阅、API key；`GET /fuel_prices/{handler_id}` | 文档含 Jet A-1 full-service、自报币种、体积单位、USD 换算、更新时间。尚未核实东亚目标机场覆盖率、更新频率和航司合同适用性，宜先索取样本。 |
| [IATA Aviation Energy Hub / Supplier Directory](https://www.iata.org/en/programs/ops-infra/fuel/) | 机场级 CAF/SAF 供应商目录；用于按机场建立询价清单 | 是寻源渠道，不是机场价格 API。目录访问条件以平台为准。 |
| [中国航油 CNAF](https://www.iata.org/en/about/sp/partners-directory/china-national-aviation-fuel-cnaf/1146/) | IATA 行业资料确认向中国及外国航司供应燃油；从航司已有合同、价格通知、发票接入 | 资料页不提供机场报价。中国机场合同、国内/国际航段税费和供油服务口径须单独确认。 |
| [ENEOS 航司供油](https://www.eneos.co.jp/business/industrial/petroleum/) | 日本航司供油商业渠道；已有合同或定向 RFQ | 未查到公开机场成交价。补充[日本航空服务询价入口](https://www.jas-fbo.co.jp/english/inquiry/)要求机场、机型、航班计划；其报价对商业宽体机是否适用仍需确认。 |
| [SK Incheon Petrochem 航空燃油](https://www.skincheonpetrochem.com/business/aviation) | 列明 ICN、GMP、PUS、CJJ、TAE、MWX、YNY；供应商合同/RFQ | 官方区分 Into Plane、Ex-Hydrant、Into-Storage，不能跨交付口径直接比价。页面不提供价格。 |
| [PetroChina HK 航空燃油](https://www.petrochinaintl.com.hk/en/our-business/aviation-fuel)及[AFSC 储运说明](https://www.afsc.com.hk/en/stockqc.html) | HKG 供应商寻源与费用拆分线索 | PetroChina HK 业务页搜索摘要确认供油业务，但正文读取跳转首页，未取得报价；AFSC 代供应商储运，油权仍属供应商，不能把基础设施服务商当作唯一售油方。 |
| [OPIS Worldwide Jet Fuel Report](https://www.opis.com/product/pricing/spot/worldwide-jet-fuel-report/) | 付费日报，email/FTP；含日本 CIF、台湾 FOB、韩国 FOB、新加坡 | 属贸易市场现货基准，适合合同指数、趋势与敏感性分析，不是东亚机场 into-plane 价。授权展示与再分发范围需单独确认。 |

[IATA Fuel Monitor](https://www.iata.org/en/publications/economics/fuel-monitor/)明确说明其数据是炼厂周均价格，并不提供历史数据，因此不能用于计算某个机场的真实供货价差。[发改价格〔2015〕329号](https://www.ndrc.gov.cn/xxgk/zcfb/tz/201502/t20150228_963773.html)是历史定价政策依据，说明不宜期待持续公开的全国统一到岸完税价；它本身不是当前机场供油价格。

## 推荐 MVP

1. 先接 1 家航司、6–8 个机场的合同价格通知、正式报价和最近发票，以人工审核后的 CSV/XLS 导入启动。
2. 每条价格显示“已核验合同价 / 有效报价 / 公开挂牌参考 / 市场基准 / 待报价”、来源、有效期和缺失费用。
3. 只让有效、同口径的到机报价进入成本优化；公开挂牌与市场基准用于参考和情景分析。
4. 再向 World Fuel、Avfuel 或 Airportdata 核实目标机场覆盖、账户接入和数据展示授权。没有授权时不抓取客户门户或再发布合同价。

## 最小数据字段

| 分组 | 字段 |
| --- | --- |
| 机场与适用范围 | `airport_icao`, `supplier`, `buyer_contract`, `fuel_grade`, `flight_scope`, `delivery_basis` |
| 来源与时效 | `quote_type`, `source_url_or_document`, `observed_at`, `verified_at`, `valid_from`, `valid_until` |
| 原始价格 | `original_currency`, `original_unit`, `base_price`, `index_name`, `index_period`, `differential` |
| 到机费用 | `into_plane_fee`, `transport_fee`, `storage_fee`, `tax`, `exemption_basis`, `fees_included`, `missing_fees` |
| 商业条件 | `min_uplift`, `volume_tier`, `credit_terms`, `supply_limit`, `availability_status` |
| 可比价换算 | `fx_rate`, `fx_date`, `density_kg_per_l`, `density_basis`, `temperature_basis`, `effective_usd_per_kg` |

保留原币、原单位、原始文档。L→kg 使用合同或实测密度及温度口径；缺失时显式列为假设，不能无声固定为 0.8。缺少税费、运输或加注费用时不标注“全包到机价”。

后续接口可参考[IATA Fuel Data Standards](https://www.iata.org/en/programs/ops-infra/fuel/data-standards/)的 Tender/Bid、Operational、Transaction、Invoice 四个 XML 标准；先实现 CSV 导入即可。
