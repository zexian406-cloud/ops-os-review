import { Link } from "react-router-dom";
/* 使用指南页面 — 17 项导航（促销管理+促销成本合并为促销运营中心） */
export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* 标题 */}
      <div>
        <h1 className="text-[24px] font-semibold text-foreground-900">使用说明书</h1>
        <p className="text-[13px] text-foreground-500 mt-1">
          Amazon Ops OS · v2 · 2026-10-14
        </p>
      </div>
      {/* 一、系统简介 */}
      <GuideSection num="一" title="系统简介">
        <p>Amazon Ops OS 是一款亚马逊运营管理工具，帮助运营人员完成决策、库存、风险、SKU、经营、促销、数据等管理工作。</p>
        <SubTitle>核心设计理念</SubTitle>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>分组导航</strong>：17 项入口按 5 组分类，每项独立可直接访问</li>
          <li><strong>促销三合一</strong>：促销运营中心合并活动管理 + 促销成本 + 促销时间线，一次录入全局联动</li>
          <li><strong>数据独立</strong>：每个 MSKU 的数据相互独立，不串数据</li>
          <li><strong>本地存储</strong>：数据存浏览器 IndexedDB，不上传服务器</li>
          <li><strong>自定义布局</strong>：支持卡片拖拽排序、显示/隐藏，个性化运营视图</li>
        </ul>
      </GuideSection>
      {/* 二、快速入门 */}
      <GuideSection num="二" title="快速入门">
        <Step n="1" title="导入数据">
          进入「数据导入」上传 Excel 文件（支持综合运营表多 Sheet 一次性导入），系统自动识别列名。
        </Step>
        <Step n="2" title="查看运营一览">
          打开首页查看运营总览，了解整体状态、风险提醒、待办事项。
        </Step>
        <Step n="3" title="处理异常">
          库存问题→发货决策；异常分析→异常诊断；数据质量→数据健康；风险查看→风险中心。
        </Step>
      </GuideSection>
      {/* 三、导航结构 */}
      <GuideSection num="三" title="导航结构">
        <p>系统采用分组导航，共 17 个一级入口，按 5 组分类：</p>
        <SubTitle>决策组（6 项）</SubTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">路径</th>
                <th className="px-3 py-2 text-left">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2">运营一览</td><td className="px-3 py-2 font-mono">/</td><td className="px-3 py-2">运营状态总览 + 待办</td></tr>
              <tr><td className="px-3 py-2">异常诊断</td><td className="px-3 py-2 font-mono">/diagnosis</td><td className="px-3 py-2">风险原因拆解</td></tr>
              <tr><td className="px-3 py-2">历史对比</td><td className="px-3 py-2 font-mono">/history</td><td className="px-3 py-2">本周 vs 上周对比</td></tr>
              <tr><td className="px-3 py-2">数据健康</td><td className="px-3 py-2 font-mono">/data-health</td><td className="px-3 py-2">导入质量检查</td></tr>
              <tr><td className="px-3 py-2">发货决策</td><td className="px-3 py-2 font-mono">/shipment</td><td className="px-3 py-2">自动补货建议</td></tr>
              <tr><td className="px-3 py-2">风险中心</td><td className="px-3 py-2 font-mono">/risk</td><td className="px-3 py-2">全站异常列表</td></tr>
            </tbody>
          </table>
        </div>
        <SubTitle>运营组（5 项）</SubTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">路径</th>
                <th className="px-3 py-2 text-left">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2">运营中心</td><td className="px-3 py-2 font-mono">/operations</td><td className="px-3 py-2">6 张运营视图</td></tr>
              <tr><td className="px-3 py-2">SKU 详情</td><td className="px-3 py-2 font-mono">/sku</td><td className="px-3 py-2">单品全景 + MSKU 明细</td></tr>
              <tr><td className="px-3 py-2">旺季模拟</td><td className="px-3 py-2 font-mono">/season</td><td className="px-3 py-2">Prime / BF / Xmas 预测</td></tr>
              <tr><td className="px-3 py-2">促销运营中心</td><td className="px-3 py-2 font-mono">/promo-center</td><td className="px-3 py-2">活动管理 + 促销成本 + 促销时间线（三合一）</td></tr>
              <tr><td className="px-3 py-2">新品测算</td><td className="px-3 py-2 font-mono">/calculator</td><td className="px-3 py-2">成本利润预估</td></tr>
            </tbody>
          </table>
        </div>
        <SubTitle>工具组（2 项）</SubTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">路径</th>
                <th className="px-3 py-2 text-left">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2">我的待办</td><td className="px-3 py-2 font-mono">/todo</td><td className="px-3 py-2">轻量任务记录</td></tr>
              <tr><td className="px-3 py-2">操作记录</td><td className="px-3 py-2 font-mono">/ops-logs</td><td className="px-3 py-2">运营操作日志</td></tr>
            </tbody>
          </table>
        </div>
        <SubTitle>数据组（3 项）</SubTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">路径</th>
                <th className="px-3 py-2 text-left">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2">数据导入</td><td className="px-3 py-2 font-mono">/import</td><td className="px-3 py-2">Excel & 云端</td></tr>
              <tr><td className="px-3 py-2">店铺管理</td><td className="px-3 py-2 font-mono">/shop-management</td><td className="px-3 py-2">新增/编辑/删除店铺</td></tr>
              <tr><td className="px-3 py-2">参数中心</td><td className="px-3 py-2 font-mono">/settings</td><td className="px-3 py-2">供应链 / 活动参数</td></tr>
            </tbody>
          </table>
        </div>
        <SubTitle>帮助组（1 项）</SubTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">路径</th>
                <th className="px-3 py-2 text-left">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2">使用指南</td><td className="px-3 py-2 font-mono">/guide</td><td className="px-3 py-2">完整操作手册</td></tr>
            </tbody>
          </table>
        </div>
      </GuideSection>
      {/* 四、各模块详细说明 */}
      <GuideSection num="四" title="各模块详细说明">
        <Module title="4.1 运营一览（首页 /）">
          <p>运营总览，包含 KPI 指标卡、风险提醒、待办事项、本周 vs 上周对比、健康度 TOP10。</p>
          <p className="text-[12px] text-foreground-500">支持自定义卡片布局：点击右上角「自定义布局」可拖拽排序、切换 KPI 指标。</p>
        </Module>
        <Module title="4.2 异常诊断（/diagnosis）">
          <p>对风险 SKU 进行原因拆解，展示影响因子（上期→本期变化），支持记录操作到操作记录。</p>
        </Module>
        <Module title="4.3 历史对比（/history）">
          <p>本周（最新导入）对比上周（上次导入），展示销量、库存、利润率、TACOS、评分的环比变化。</p>
        </Module>
        <Module title="4.4 数据健康（/data-health）">
          <p>检查数据导入质量，展示各字段完整度，识别缺失或异常数据。</p>
        </Module>
        <Module title="4.5 发货决策（/shipment）">
          <p>自动补货建议，按优先级排序（紧急/高/中/低），展示当前库存、在途、建议发货量、最晚发货日。</p>
          <p className="text-[12px] text-foreground-500">点击右上角「补货公式」可自定义日均销量口径、触发阈值、目标天数/Lead Time/安全库存系数、活动倍率与取整方式，详见第七节。</p>
        </Module>
        <Module title="4.6 风险中心（/risk）">
          <p>查看所有风险 SKU，按类型筛选（库存/利润/广告/评分/退货/Listing），按严重程度排序。</p>
        </Module>
        <Module title="4.7 运营中心（/operations）">
          <p>6 张运营视图，包含经营概览、本周 vs 上周对比、周环比变化趋势、销售利润分析。</p>
        </Module>
        <Module title="4.8 SKU 详情（/sku）">
          <p>SPU 产品汇总层 + MSKU 明细层。展开产品查看各 MSKU 独立数据，点击 MSKU 进入详情页。</p>
          <p className="text-[12px] text-foreground-500">MSKU 数据独立：评分、退款率、广告费比、利润、销售数据各 MSKU 独立，不串数据。</p>
        </Module>
        <Module title="4.9 旺季模拟（/season）">
          <p>预设 Prime Day / Black Friday / Cyber Monday / Christmas，按销量倍率模拟库存缺口和补货需求。</p>
        </Module>
        <Module title="4.10 促销运营中心（/promo-center）">
          <p>三合一促销运营中心：活动管理 + 促销成本 + 促销时间线。一次录入，全局联动。</p>
          <SubTitle>Tab 1 活动管理</SubTitle>
          <p>管理促销活动：BD / LD / Coupon / Price Discount / Promotion / 自定义（可自定义活动名称）。活动录入时同步填写成本（金额或折扣率），自动估算总成本。</p>
          <div className="flex flex-wrap gap-2">
            {["BD (Best Deal)", "LD (Lightning Deal)", "Coupon", "Price Discount", "Promotion", "自定义"].map((t) => (
              <span key={t} className="rounded-full bg-background-100 px-2.5 py-0.5 text-[11px] font-medium text-foreground-600">{t}</span>
            ))}
          </div>
          <SubTitle>Tab 2 促销成本</SubTitle>
          <p>管理手动促销成本：优惠券、秒杀、站外折扣、其他。支持金额模式和折扣率模式。</p>
          <SubTitle>Tab 3 促销时间线</SubTitle>
          <p>按 SKU 甘特条直观展示各促销时间段 + 当时促销价格 + 促销成本。周成本聚合图展示跨周均摊成本，同时展示自然订单/广告订单占比。如需查看促销销量，请导入销量数据。</p>
          <SubTitle>旧路由兼容</SubTitle>
          <p className="text-[12px] text-foreground-500">旧链接 <code className="font-mono bg-background-100 px-1 rounded">/promotions</code> 自动跳转至活动管理 Tab；<code className="font-mono bg-background-100 px-1 rounded">/promo-cost</code> 自动跳转至促销成本 Tab。</p>
        </Module>
        <Module title="4.11 新品测算（/calculator）">
          <p>输入尺寸、重量、FOB、头程、售价等参数，自动计算体积、总成本、毛利、毛利率、ROI。</p>
        </Module>
        <Module title="4.12 我的待办（/todo）">
          <p>轻量任务记录，支持关联 SKU、设置截止日期、标记完成。首页展示未完成数量。</p>
        </Module>
        <Module title="4.13 操作记录（/ops-logs）">
          <p>运营操作日志，按日期分组展示。记录价格调整、广告开关、补货、Listing 优化等操作。</p>
        </Module>
        <Module title="4.14 数据导入（/import）">
          <p>支持综合运营表一次性多 Sheet 导入，自动识别列名。包含 9 个导入 Tab。模板已含 MSKU 级指标列（评分/评论数/广告费比/退货率/退款率）和产品链接/竞品链接列，按 MSKU 行填写即可展示独立指标和自然/广告订单占比。</p>
          <p className="text-[12px] text-foreground-500">主要入口：「综合运营表」下载模板 → 填充数据 → 上传自动识别多 Sheet。新增列均为可选，留空不影响导入。页面底部提供「GitHub 云端同步（手动保存）」备份区，详见第九节。</p>
        </Module>
        <Module title="4.15 店铺管理（/shop-management）">
          <p>新增、编辑、删除店铺，查看各店铺数据量。</p>
        </Module>
        <Module title="4.16 参数中心（/settings）">
          <p>供应链参数（Lead Time、安全库存、目标库存）、活动参数、利润率/广告费比/退货率阈值。</p>
          <p className="text-[12px] text-foreground-500">「利润公式」Tab 可查看默认利润计算公式，并自定义成本项计入与折扣预估上浮率，详见第八节。</p>
        </Module>
      </GuideSection>
      {/* 五、数据导入指南 */}
      <GuideSection num="五" title="数据导入指南">
        <SubTitle>综合运营表（主要入口）</SubTitle>
        <p>数据导入页第一个 Tab「综合运营表」，下载模板后填充数据，上传时自动识别多 Sheet 一次性导入。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">Sheet 名</th>
                <th className="px-3 py-2 text-left">内容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2 font-mono">SKU 标识符</td><td className="px-3 py-2">产品主档（店铺/SKU/品名/MSKU/ASIN/售价/FOB/发货方式/产品链接/竞品链接）</td></tr>
              <tr><td className="px-3 py-2 font-mono">销量导入</td><td className="px-3 py-2">销量、MSKU、评分、评论数、广告费比、退货率、退款率（按 MSKU 行独立存储）</td></tr>
              <tr><td className="px-3 py-2 font-mono">运营数据导入</td><td className="px-3 py-2">MSKU、退款率、评分、评论数、退货率、ACoAS、产品链接、竞品链接</td></tr>
              <tr><td className="px-3 py-2 font-mono">FBA 库存明细</td><td className="px-3 py-2">FBA 库存</td></tr>
              <tr><td className="px-3 py-2 font-mono">仓库明细(FBM)</td><td className="px-3 py-2">FBM 各海外仓库存</td></tr>
              <tr><td className="px-3 py-2 font-mono">在途明细</td><td className="px-3 py-2">在途批次</td></tr>
              <tr><td className="px-3 py-2 font-mono">工厂明细</td><td className="px-3 py-2">工厂生产批次</td></tr>
              <tr><td className="px-3 py-2 font-mono">头程更新</td><td className="px-3 py-2">头程费 + 配送费</td></tr>
            </tbody>
          </table>
        </div>
        <SubTitle>仓库区域映射（多站点 · 别名 · 自定义区域）</SubTitle>
        <p>入口：「数据导入」页 →「仓库映射」Tab。将领星等工具下载的仓库名称映射到区域，导入仓库明细时自动匹配并汇总。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>按站点区分</strong>：映射跟随店铺（站点）保存。同一仓库名在美国站映射为美东、在加拿大站映射为其他区域，互不影响；做多个站点时海外仓的销量和库存天然分开。导入时系统自动按当前站点创建映射；未配置站点专属映射时回退到通用映射。</li>
          <li><strong>别名</strong>：可为仓库设置显示名（如「美西 LG1 仓」），发货决策页和 SKU 详情页的仓库明细会优先展示别名，原始仓库名保持不变。</li>
          <li><strong>自定义区域</strong>：除美东/美西/东南/中南四个预置区域外，可添加自定义区域名（如「加拿大东仓」）。自定义区域在仓库明细中独立展示；预置四仓的汇总统计不受影响。预置四仓不可删除。</li>
          <li><strong>生效范围</strong>：映射保存后对所有历史数据重新生效；变更后发货建议、SKU 详情会自动刷新。</li>
        </ul>
        <SubTitle>多 MSKU 数据独立性</SubTitle>
        <p>销量表和运营数据表中，同一 SKU 的不同 MSKU 各占一行，填写各自的评分/评论数/广告费比/退货率/退款率。系统自动按 MSKU 独立存储到 mskuMetrics 字段，列表展开和详情页均展示各 MSKU 自身的值，不会取平均覆盖。</p>
        <SubTitle>产品链接 / 竞品链接</SubTitle>
        <p>在「SKU 标识符」或「运营数据导入」表中填写。产品链接为当前 Listing 的 Amazon URL；竞品链接支持多个，用换行符分隔。导入后可在 SKU 详情页直接点击跳转。</p>
        <SubTitle>自然订单 / 广告订单占比</SubTitle>
        <p>系统基于广告费比（adRatio）自动推导自然订单与广告订单占比：广告订单占比 ≈ 广告费比；自然订单占比 ≈ 100% - 广告费比。该指标展示在促销时间线和 SKU 详情页中，含可视化进度条。</p>
        <SubTitle>导入模板匹配口径说明</SubTitle>
        <div className="rounded-lg border border-background-200 bg-background-50 p-3 text-[13px] text-foreground-700">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-background-200">
                <th className="py-1.5 pr-3 text-left font-semibold">导入类型</th>
                <th className="py-1.5 pr-3 text-left font-semibold">匹配口径</th>
                <th className="py-1.5 text-left font-semibold">说明</th>
              </tr>
            </thead>
            <tbody className="text-foreground-600">
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">销量导入</td><td className="py-1.5 pr-3 text-primary-600 font-semibold">ASIN</td><td className="py-1.5">以 ASIN 为口径，自动匹配对应 SKU</td></tr>
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">运营数据导入</td><td className="py-1.5 pr-3 text-primary-600 font-semibold">ASIN / MSKU</td><td className="py-1.5">支持以 ASIN 或 MSKU 为口径匹配</td></tr>
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">FBA库存明细</td><td className="py-1.5 pr-3 text-primary-600 font-semibold">ASIN</td><td className="py-1.5">以 ASIN 为口径，自动匹配对应 SKU</td></tr>
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">仓库明细(FBM)</td><td className="py-1.5 pr-3 text-accent-600 font-semibold">SKU</td><td className="py-1.5">以 SKU 为口径直接匹配</td></tr>
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">在途明细</td><td className="py-1.5 pr-3 text-accent-600 font-semibold">SKU</td><td className="py-1.5">以 SKU 为口径直接匹配</td></tr>
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">工厂明细</td><td className="py-1.5 pr-3 text-accent-600 font-semibold">SKU</td><td className="py-1.5">以 SKU 为口径直接匹配</td></tr>
              <tr className="border-b border-background-100"><td className="py-1.5 pr-3 font-medium">头程更新</td><td className="py-1.5 pr-3 text-accent-600 font-semibold">SKU</td><td className="py-1.5">以 SKU 为口径，同时更新 MSKU</td></tr>
              <tr><td className="py-1.5 pr-3 font-medium">SKU标识符</td><td className="py-1.5 pr-3 text-secondary-600 font-semibold">ASIN + MSKU</td><td className="py-1.5">用于建立 ASIN/MSKU/SKU 对应关系</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-foreground-500">注：以 ASIN 为口径的导入类型，需先通过「SKU标识符」导入建立 ASIN→SKU 的对应关系。系统会自动查找对应的 SKU 进行数据关联。</p>
        <SubTitle>列名智能匹配</SubTitle>
        <ul className="list-disc pl-5 space-y-1 text-[13px]">
          <li>退款率 / refund_rate / Refund Rate 均可识别</li>
          <li>退货率 / return_rate / Return Rate 均可识别</li>
          <li>FOB / 采购价 / 产品成本 均可识别</li>
          <li>产品链接 / Product URL / Listing 链接 均可识别</li>
          <li>竞品链接 / Competitor URL 均可识别</li>
        </ul>
      </GuideSection>
      {/* 六、常见问题 */}
      <GuideSection num="六" title="常见问题">
        <Faq q="导入数据后页面显示为空？">
          进入「数据健康」检查数据完整度，确认 Excel 中 SKU 列名正确，刷新页面重新加载。
        </Faq>
        <Faq q="多个 MSKU 显示相同数据？">
          确认销量导入 Sheet 中有 MSKU 列，每个 MSKU 独占一行，各有自己的退款率/退货率/广告费比/评分。系统会按 MSKU 独立保留数据。
        </Faq>
        <Faq q="退款率显示「缺失」？">
          确认列名为「退款率」「refund_rate」「Refund Rate」之一，确认数值格式正确，重新导入数据。
        </Faq>
        <Faq q="找不到某个功能？">
          17 项导航按 5 组分类：决策组（6 项）、运营组（5 项，含促销运营中心）、工具组（2 项）、数据组（3 项）、帮助组（1 项）。展开侧边栏查看完整列表。
        </Faq>
        <Faq q="促销管理和促销成本去哪里了？">
          已合并为「促销运营中心」（<code className="font-mono bg-background-100 px-1 rounded">/promo-center</code>），包含三个 Tab：活动管理、促销成本、促销时间线。旧书签链接会自动跳转到对应 Tab。
        </Faq>
        <Faq q="数据存储在哪里？">
          数据存储在浏览器本地的 IndexedDB 中，不上传服务器。清除浏览器数据会丢失数据，建议定期使用「GitHub 云端同步」手动备份（见第九节）。
        </Faq>
        <Faq q="换了电脑或浏览器，数据怎么迁移？">
          在旧设备上进入「数据导入」→「GitHub 云端同步」点「保存到 GitHub 云端」；在新设备上配置同一个仓库后点「从 GitHub 拉取」即可完整恢复（见第九节）。
        </Faq>
        <Faq q="补货建议不想用系统默认公式？">
          进入「发货决策」页点「补货公式」，可自定义日均销量口径（7天/30天）、触发阈值方式、目标天数/Lead Time/安全库存系数、活动倍率与取整方式（见第七节）。利润计算同理，可在「参数中心 → 利润公式」自定义成本项计入（见第八节）。
        </Faq>
      </GuideSection>
      {/* 七、补货公式自定义 */}
      <GuideSection num="七" title="补货公式自定义（/shipment）">
        <p>入口：「发货决策」页右上角「补货公式」按钮。系统默认按以下公式计算补货建议，所有参数均可修改：</p>
        <div className="rounded-lg bg-background-100/60 p-3 font-mono text-[12px] leading-relaxed text-foreground-700">
          <div>建议发货量 = (目标天数 + Lead Time + 安全库存 − 含在途覆盖天数) × 日均销量 × 活动倍率</div>
          <div>触发条件：含在途覆盖天数 &lt; 触发阈值（默认 Lead Time + 安全库存）</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">配置项</th>
                <th className="px-3 py-2 text-left">可选值</th>
                <th className="px-3 py-2 text-left">默认</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2">日均销量口径</td><td className="px-3 py-2">近 7 天平均 / 近 30 天平均</td><td className="px-3 py-2">近 7 天</td></tr>
              <tr><td className="px-3 py-2">触发阈值方式</td><td className="px-3 py-2">Lead Time + 安全库存 / 仅 Lead Time / 仅安全库存 / 自定义天数</td><td className="px-3 py-2">LT + 安全库存</td></tr>
              <tr><td className="px-3 py-2">三个系数（天）</td><td className="px-3 py-2">目标天数、Lead Time、安全库存</td><td className="px-3 py-2">与「参数中心 → 全局阈值」共用</td></tr>
              <tr><td className="px-3 py-2">活动倍率</td><td className="px-3 py-2">开关 + 活动额外天数（活动期间按最高活动倍率放大销量并追加备货天数）</td><td className="px-3 py-2">开启，额外 30 天</td></tr>
              <tr><td className="px-3 py-2">取整方式</td><td className="px-3 py-2">向上取整（补足）/ 向下取整（保守）/ 四舍五入</td><td className="px-3 py-2">向上取整</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-foreground-500">说明：SKU 级单独设置过的 Lead Time / 安全库存优先于这里的全局系数；保存后立即重新计算发货建议列表，弹窗内附实时公式预览。</p>
      </GuideSection>
      {/* 八、利润公式自定义 */}
      <GuideSection num="八" title="利润公式自定义（/settings）">
        <p>入口：「参数中心」→「利润公式」Tab。系统默认公式如下，页面顶部实时展示当前生效的公式文本：</p>
        <div className="rounded-lg bg-background-100/60 p-3 font-mono text-[12px] leading-relaxed text-foreground-700">
          <div>总成本 = FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退货损失 + 促销成本 + 优惠券</div>
          <div>单件净利 = 售价 − 总成本；净利率 = 净利 ÷ 售价 × 100%</div>
          <div>广告费比 = 广告费 ÷ 售价 × 100%</div>
          <div>折扣广告费(估) = 正常广告费 × (1 + 上浮率)；折扣退款费(估) 同理</div>
        </div>
        <SubTitle>可自定义内容</SubTitle>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>公式表达式完全自定义（高级）</strong>：8 条公式（总成本、折扣总成本、单件净利、净利率、广告费比、退货率、折扣广告费估、折扣退款费估）都能用中文变量名加四则运算、括号和 min/max/round/floor/ceil/abs 函数改写。留空即用内置默认公式；表达式写错会标红提示，计算时若出错自动回退默认公式，不会算崩。</li>
          <li><strong>成本项计入开关</strong>：9 个成本项（FOB / 头程运费 / 配送费 / 佣金 / 仓储费 / 广告费 / 退货损失 / 促销成本 / 优惠券）任意开关。关闭后该项按 0 计，全站所有利润数字（运营一览、SKU 详情、新品测算等）实时联动。</li>
          <li><strong>默认佣金率</strong>：SKU 未填佣金且未填佣金率时按此比例估算，默认 15%，可按类目实际佣金比例修改。</li>
          <li><strong>折扣预估上浮率</strong>：折扣价场景下广告费与退款费的预估上浮比例，默认 10%（即 ×1.1），可按实际促销力度调整。</li>
        </ul>
        <SubTitle>自定义公式：变量列表</SubTitle>
        <p className="text-[12px] text-foreground-500">运算符支持 + − × ÷（也可写 * /）、括号、小数；函数支持 min(a,b)、max(a,b)、round(x)、floor(x)、ceil(x)、abs(x)。除以 0 或表达式无效时自动回退默认公式。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">公式</th>
                <th className="px-3 py-2 text-left">可用变量</th>
                <th className="px-3 py-2 text-left">默认表达式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">总成本</td>
                <td className="px-3 py-2">售价、FOB、头程运费、配送费、佣金、仓储费、广告费、退货费、退款损失、促销成本、优惠券<br /><span className="text-[11px] text-foreground-400">各项已按成本项开关处理，关闭项为 0；「退货费」仅诊断用，默认不计入</span></td>
                <td className="px-3 py-2 font-mono text-[11px]">FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退款损失 + 促销成本 + 优惠券</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">折扣总成本</td>
                <td className="px-3 py-2">同总成本（变量值为折扣口径，「售价」为折扣售价）</td>
                <td className="px-3 py-2 font-mono text-[11px]">与总成本相同</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">单件净利</td>
                <td className="px-3 py-2">售价、总成本</td>
                <td className="px-3 py-2 font-mono text-[11px]">售价 − 总成本</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">净利率</td>
                <td className="px-3 py-2">净利、售价、总成本</td>
                <td className="px-3 py-2 font-mono text-[11px]">净利 ÷ 售价 × 100</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">广告费比</td>
                <td className="px-3 py-2">广告费、售价</td>
                <td className="px-3 py-2 font-mono text-[11px]">广告费 ÷ 售价 × 100</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">退货率</td>
                <td className="px-3 py-2">退货费、售价</td>
                <td className="px-3 py-2 font-mono text-[11px]">退货费 ÷ 售价 × 100</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">折扣广告费(估)</td>
                <td className="px-3 py-2">正常广告费、上浮率<br /><span className="text-[11px] text-foreground-400">上浮率 = 设置值 ÷ 100，如设置 10 则变量值为 0.1</span></td>
                <td className="px-3 py-2 font-mono text-[11px]">正常广告费 × (1 + 上浮率)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">折扣退款费(估)</td>
                <td className="px-3 py-2">正常退款费、上浮率</td>
                <td className="px-3 py-2 font-mono text-[11px]">正常退款费 × (1 + 上浮率)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <SubTitle>自定义公式：常用示例</SubTitle>
        <div className="rounded-lg bg-background-100/60 p-3 font-mono text-[12px] leading-relaxed text-foreground-700">
          <div>// 「单件净利」先扣 5% 杂费再减成本</div>
          <div>售价 * 0.95 - 总成本</div>
          <div className="mt-1.5">// 「总成本」不算促销成本和优惠券（也可直接用上方开关关闭）</div>
          <div>FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退款损失</div>
          <div className="mt-1.5">// 「总成本」每件额外加 2 元包材费</div>
          <div>FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退款损失 + 促销成本 + 优惠券 + 2</div>
          <div className="mt-1.5">// 「净利率」封顶 60%，避免极端值</div>
          <div>min(净利 ÷ 售价 × 100, 60)</div>
          <div className="mt-1.5">// 「净利率」亏损时按 -5% 兜底展示</div>
          <div>max(净利 ÷ 售价 × 100, -5)</div>
          <div className="mt-1.5">// 「折扣广告费(估)」固定按 1.2 倍估（不随上浮率设置变化）</div>
          <div>正常广告费 * 1.2</div>
        </div>
        <p className="text-[12px] text-foreground-500">说明：示例中「// …」行仅标注该表达式应填在哪条公式下，输入框中只需粘贴它下一行的表达式本身（不要带公式名和等号，等号不是合法字符）；净利率 / 广告费比 / 退货率的结果为百分数（15 表示 15%）；变量名需与表中完全一致（不区分大小写英文字母，如 FOB 也可写 fob）。</p>
        <p className="text-[12px] text-foreground-500">说明：佣金取值优先级为 显式填写 → SKU 佣金率 × 售价 → 默认佣金率估算（比例可在下方修改）；广告费缺失时按费比 × 售价反推。点「恢复默认」还原全部配置，保存后无需刷新立即生效。</p>
      </GuideSection>
      {/* 九、GitHub 云端同步 */}
      <GuideSection num="九" title="GitHub 云端同步（手动保存）">
        <p>数据默认只存在当前浏览器的 IndexedDB 中，换设备或清除浏览器数据会丢失。「GitHub 云端同步」把全部数据（SKU 主档、快照、分仓库存、促销、参数等）导出为一个 JSON 文件，备份到<strong>你自己的 GitHub 私有仓库</strong>，需要时一键恢复。全程手动触发，不会自动上传。</p>
        <SubTitle>首次配置（约 5 分钟）</SubTitle>
        <Step n="1" title="新建私有仓库">
          登录 GitHub → 右上角「+」→ New repository → 命名（如 ops-backup）→ 勾选 Private → Create。
        </Step>
        <Step n="2" title="创建 Personal Access Token">
          GitHub → Settings → Developer settings → Personal access tokens → Generate new token，勾选 repo（仓库读写）权限。建议只为该备份仓库授权，用完可随时撤销。
        </Step>
        <Step n="3" title="填写配置">
          进入「数据导入」页底部「GitHub 云端同步（手动保存）」区：粘贴 Token，填仓库路径（owner / repo）、分支（默认 main）、文件路径（如 backup/ops-snapshot.json）。
        </Step>
        <Step n="4" title="保存并校验">
          点「保存并校验配置」，提示校验通过后配置会保存到本地，下次无需重复填写。
        </Step>
        <Step n="5" title="备份 / 恢复">
          点「保存到 GitHub 云端」上传全部数据；换设备或数据丢失时，配置好同一仓库后点「从 GitHub 拉取」恢复。按钮旁会显示上次同步时间。
        </Step>
        <SubTitle>注意事项</SubTitle>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>手动备份</strong>：建议每周或每次大批量导入数据后点一次「保存到 GitHub 云端」。</li>
          <li><strong>Token 安全</strong>：Token 只保存在本地 IndexedDB，请求直接从浏览器发往 GitHub，不经任何服务器中转。</li>
          <li><strong>拉取会覆盖</strong>：「从 GitHub 拉取」会整库覆盖本地当前数据，执行前请确认本地没有未备份的新数据。</li>
          <li><strong>多设备</strong>：多台设备可共用同一备份仓库；建议养成「先拉取 → 编辑 → 再保存」的习惯，避免互相覆盖。</li>
        </ul>
      </GuideSection>
      {/* 底部 */}
      <div className="border-t border-background-200 pt-6 text-center">
        <Link to="/" className="text-[13px] font-medium text-primary-600 hover:underline">
          ← 返回运营一览
        </Link>
      </div>
    </div>
  );
}
/* ── 子组件 ── */
function GuideSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-background-200 bg-background-50/40 p-5">
      <h2 className="text-[17px] font-semibold text-foreground-900 mb-3">
        <span className="text-primary-600 mr-2">{num}、</span>{title}
      </h2>
      <div className="space-y-3 text-[13px] text-foreground-700 leading-relaxed">{children}</div>
    </section>
  );
}
function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14px] font-semibold text-foreground-800 mt-3 mb-1">{children}</h3>;
}
function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[12px] font-bold text-primary-700">{n}</span>
      <div>
        <div className="font-semibold text-foreground-800">{title}</div>
        <div className="text-[13px] text-foreground-600">{children}</div>
      </div>
    </div>
  );
}
function Module({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-primary-300 pl-4 py-1">
      <div className="font-semibold text-foreground-800 mb-1">{title}</div>
      <div className="space-y-1.5 text-[13px] text-foreground-600">{children}</div>
    </div>
  );
}
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-background-200 bg-background-50/60 px-4 py-3">
      <div className="font-semibold text-foreground-800 text-[13px] mb-1">Q：{q}</div>
      <div className="text-[12px] text-foreground-600 leading-relaxed">A：{children}</div>
    </div>
  );
}
