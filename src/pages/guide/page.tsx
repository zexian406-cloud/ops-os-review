import { Link } from "react-router-dom";
/* 使用指南页面 — 17 项导航（促销管理+促销成本合并为促销运营中心） */
export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* 标题 */}
      <div>
        <h1 className="text-[24px] font-semibold text-foreground-900">使用说明书</h1>
        <p className="text-[13px] text-foreground-500 mt-1">
          Amazon Ops OS · v2 · 2026-08-04
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
          <p className="text-[12px] text-foreground-500">主要入口：「综合运营表」下载模板 → 填充数据 → 上传自动识别多 Sheet。新增列均为可选，留空不影响导入。</p>
        </Module>
        <Module title="4.15 店铺管理（/shop-management）">
          <p>新增、编辑、删除店铺，查看各店铺数据量。</p>
        </Module>
        <Module title="4.16 参数中心（/settings）">
          <p>供应链参数（Lead Time、安全库存、目标库存）、活动参数、利润率/广告费比/退货率阈值。</p>
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
        <SubTitle>多 MSKU 数据独立性</SubTitle>
        <p>销量表和运营数据表中，同一 SKU 的不同 MSKU 各占一行，填写各自的评分/评论数/广告费比/退货率/退款率。系统自动按 MSKU 独立存储到 mskuMetrics 字段，列表展开和详情页均展示各 MSKU 自身的值，不会取平均覆盖。</p>
        <SubTitle>产品链接 / 竞品链接</SubTitle>
        <p>在「SKU 标识符」或「运营数据导入」表中填写。产品链接为当前 Listing 的 Amazon URL；竞品链接支持多个，用换行符分隔。导入后可在 SKU 详情页直接点击跳转。</p>
        <SubTitle>自然订单 / 广告订单占比</SubTitle>
        <p>系统基于广告费比（adRatio）自动推导自然订单与广告订单占比：广告订单占比 ≈ 广告费比；自然订单占比 ≈ 100% - 广告费比。该指标展示在促销时间线和 SKU 详情页中，含可视化进度条。</p>
        <SubTitle>导入模板字段一览（新增）</SubTitle>
        <ul className="list-disc pl-5 space-y-1 text-[13px]">
          <li><strong>销量导入</strong>新增列：MSKU、评分、评论数、广告费比、退货率、退款率</li>
          <li><strong>运营数据导入</strong>新增列：MSKU、产品链接、竞品链接</li>
          <li><strong>SKU 标识符</strong>新增列：产品链接、竞品链接</li>
          <li><strong>CSV 综合表</strong>新增列：MSKU、评分、评论数、广告费比、退货率、退款率、产品链接、竞品链接</li>
          <li className="text-foreground-500">所有新增列均为可选，留空不影响导入；填写后对应功能自动展示</li>
        </ul>
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
          数据存储在浏览器本地的 IndexedDB 中，不上传服务器。清除浏览器数据会丢失数据，建议定期导出备份。
        </Faq>
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
