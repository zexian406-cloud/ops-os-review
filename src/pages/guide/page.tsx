import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { compileFormula, FormulaEvalError } from "@/domain/formulaEval";
import { PROFIT_FORMULA_META } from "@/domain/types";
import type { ProfitFormulaKey } from "@/domain/types";

/* 使用指南页面 — 章节按侧边栏分组顺序编排 + 折叠章节 + 吸顶导航 + 互动演示 */
const CHAPTERS = [
  { num: "一", label: "开始使用" },
  { num: "二", label: "决策" },
  { num: "三", label: "运营" },
  { num: "四", label: "工具" },
  { num: "五", label: "数据" },
  { num: "六", label: "云端同步" },
  { num: "七", label: "常见问题" },
];

export default function GuidePage() {
  const [open, setOpen] = useState<Record<string, boolean>>({ 一: true });

  const toggle = (num: string) => setOpen((s) => ({ ...s, [num]: !s[num] }));
  const jump = (num: string) => {
    setOpen((s) => ({ ...s, [num]: true }));
    requestAnimationFrame(() =>
      document.getElementById(`guide-${num}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const allOpen = CHAPTERS.every((c) => open[c.num]);
  const toggleAll = () => {
    const next = !allOpen;
    setOpen(Object.fromEntries(CHAPTERS.map((c) => [c.num, next])));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3 pb-12">
      {/* 标题 */}
      <div className="pt-1">
        <h1 className="text-[24px] font-semibold text-foreground-900">使用说明书</h1>
        <p className="text-[13px] text-foreground-500 mt-1">
          Amazon Ops OS · v2 · 2026-10-14 · 章节按侧边栏分组顺序编写 · 点击章节标题展开，顶部导航可直达
        </p>
      </div>

      {/* 吸顶章节导航 */}
      <div className="sticky top-[52px] z-30 flex flex-wrap items-center gap-1.5 rounded-b-[14px] border-b border-background-200/60 bg-background-50/95 py-2 backdrop-blur">
        {CHAPTERS.map((c) => (
          <button
            key={c.num}
            onClick={() => jump(c.num)}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
              open[c.num]
                ? "border-primary-500 bg-primary-600 text-white"
                : "border-background-300 bg-white text-foreground-600 hover:border-primary-400 hover:text-primary-600"
            }`}
          >
            {c.num} {c.label}
          </button>
        ))}
        <button
          onClick={toggleAll}
          className="ml-auto rounded-full border border-background-300 bg-white px-2.5 py-1 text-[12px] text-foreground-500 hover:text-primary-600"
        >
          {allOpen ? "收起全部" : "展开全部"}
        </button>
      </div>

      {/* 一、开始使用 */}
      <GuideSection num="一" title="开始使用" open={open["一"]} onToggle={() => toggle("一")}>
        <p>Amazon Ops OS 是一款亚马逊运营管理工具，帮助运营人员完成决策、库存、风险、SKU、经营、促销、数据等管理工作。</p>
        <SubTitle>核心设计理念</SubTitle>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>分组导航</strong>：17 项入口按 5 组分类，每项独立可直接访问</li>
          <li><strong>促销三合一</strong>：促销运营中心合并活动管理 + 促销成本 + 促销时间线，一次录入全局联动</li>
          <li><strong>数据独立</strong>：每个 MSKU 的数据相互独立，不串数据</li>
          <li><strong>本地存储</strong>：数据存浏览器 IndexedDB，不上传服务器</li>
          <li><strong>自定义布局</strong>：支持卡片拖拽排序、显示/隐藏，个性化运营视图</li>
        </ul>
        <SubTitle>三步上手</SubTitle>
        <Step n="1" title="导入数据">
          进入「数据导入」上传 Excel 文件（支持综合运营表多 Sheet 一次性导入），系统自动识别列名。
        </Step>
        <Step n="2" title="查看运营一览">
          打开首页查看运营总览，了解整体状态、风险提醒、待办事项。
        </Step>
        <Step n="3" title="处理异常">
          库存问题→发货决策；异常分析→异常诊断；数据质量→数据健康；风险查看→风险中心。
        </Step>
        <SubTitle>本说明书怎么读</SubTitle>
        <p>章节顺序与侧边栏分组完全一致，逐组从上到下讲解；公式自定义、导入模板等深度内容直接内嵌在对应模块小节里，不用来回翻：</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">侧边栏分组</th>
                <th className="px-3 py-2 text-left">包含入口</th>
                <th className="px-3 py-2 text-left">对应章节</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr><td className="px-3 py-2 font-semibold">决策</td><td className="px-3 py-2">运营一览 · 异常诊断 · 历史对比 · 发货决策 · 风险中心</td><td className="px-3 py-2 text-primary-600 font-semibold">第二章</td></tr>
              <tr><td className="px-3 py-2 font-semibold">运营</td><td className="px-3 py-2">运营中心 · SKU 详情 · 旺季模拟 · 促销运营中心 · 新品测算</td><td className="px-3 py-2 text-primary-600 font-semibold">第三章</td></tr>
              <tr><td className="px-3 py-2 font-semibold">工具</td><td className="px-3 py-2">我的待办 · 操作记录</td><td className="px-3 py-2 text-primary-600 font-semibold">第四章</td></tr>
              <tr><td className="px-3 py-2 font-semibold">数据</td><td className="px-3 py-2">数据导入 · 数据健康 · 店铺管理 · 参数中心</td><td className="px-3 py-2 text-primary-600 font-semibold">第五章</td></tr>
              <tr><td className="px-3 py-2 font-semibold">帮助</td><td className="px-3 py-2">使用指南（即本页）</td><td className="px-3 py-2">—</td></tr>
            </tbody>
          </table>
        </div>
        <ExampleBox>
          <p><strong>首次体验（约 10 分钟）</strong>：系统内置演示数据（演示产品001~011），不用导入任何文件即可走完全流程：</p>
          <p>① 运营一览看「今日需要处理的事」，点一条 CRITICAL 告警的「去诊断」，看利润/广告/退货的原因拆解；</p>
          <p>② 发货决策页看 3 个待补货 SKU 的建议件数与最晚发货日；</p>
          <p>③ SKU 详情展开「演示产品003」，对比各 MSKU 的独立评分与利润；</p>
          <p>④ 首页点「自定义布局」把最常用的 KPI 卡片拖到最上面。熟悉后再按第五章导入真实数据。</p>
        </ExampleBox>
        <NoteBox items={[
          <>数据只存在当前浏览器 IndexedDB，换浏览器/电脑不会自动跟随；顶栏「导出数据」可随时手动导出备份文件，与第六章 GitHub 云端同步互为双保险</>,
          <>导入真实数据前，先到「店铺管理」建好店铺与站点，避免数据挂错店铺</>,
          <>全站默认按演示汇率运行（如 USD1=1$），正式使用前在顶栏站点切换器配置：冷门站点点「站点管理」新增（如澳大利亚站、墨西哥站、中东站），再到「汇率管理」配置真实汇率</>,
        ]} />
      </GuideSection>

      {/* 二、决策 */}
      <GuideSection num="二" title="决策（侧边栏第 1 组）" open={open["二"]} onToggle={() => toggle("二")}>
        <Module title="2.1 运营一览（首页 /）">
          <p>运营总览，包含 KPI 指标卡、风险提醒、待办事项、近 14 天分日指标走势（可切换销量 / 广告费比 / 退货率 / 评分，虚线为上期均值）、一品多链接聚合、健康度 TOP10。</p>
          <p className="text-[12px] text-foreground-500">支持自定义卡片布局：点击右上角「自定义布局」可拖拽排序、切换 KPI 指标。顶栏可按站点内店铺（下拉选择）过滤数据，告警区收起时 Critical 级别始终全部展示。</p>
        </Module>
        <Module title="2.2 异常诊断（/diagnosis）">
          <p>默认打开「问题总览」：一键扫描当前站点全部 SKU，把本次 vs 基线的所有异常（利润 / 广告 / 库存 / 评分 / Listing）汇总成一张清单，顶部统计严重 / 警告 / 提示数量，支持按严重度 / 类型 / SKU 排序，按问题类型和店铺筛选，点「去诊断」直达单品拆解。</p>
          <p>单品诊断四个 Tab：利润下降 / 销量下降 / 评分下降 / 费比上升。输入或选择 SKU 后展示对比结论、主要病因、诊断过程（决策树逐项命中）与建议动作。</p>
          <p className="text-[12px] text-foreground-500">评分下降诊断顺序：退货率 +3pp（质量问题）→ 新增评论且降幅 ≥0.2（新差评拉低）→ 按降幅分级（≥0.5 重度 / 0.2~0.5 轻度）。费比上升诊断顺序：销量降 20% 且费比 +5pp（转化下降被动推高）→ 广告花费涨 20% 且销量持平（加投）→ 促销期正常升高 → 涨幅 ≤5pp 波动正常。</p>
          <p className="text-[12px] text-foreground-500">对比口径可选：「本次 vs 上次导入」（默认，对比两个导入批次）、「近7天环比」「近14天环比」「近30天环比」及「自定义天数」（1-730 天，选后输入回看天数；以最新快照为终点，自动取目标日期前最近的快照做基线，实际基线日期会显示在口径旁；该时间范围前无快照时提示切换口径）。口径与天数会写入链接，可直接分享。运营中心 / 风险中心的告警列表同样支持排序与按店铺筛选。</p>
        </Module>
        <Module title="2.3 历史对比（/history）">
          <p>本周（最新导入）对比上周（上次导入），展示销量、库存、利润率、TACOS、评分的环比变化。</p>
        </Module>
        <Module title="2.4 发货决策（/shipment）">
          <p>自动补货建议，按优先级排序（紧急/高/中/低），展示当前库存、在途、建议发货量、最晚发货日。点击右上角「补货公式」可自定义计算方式，详见下方。</p>
        </Module>
        <SubTitle>2.4.1 补货公式自定义</SubTitle>
        <p>系统默认按以下公式计算补货建议，所有参数均可修改：</p>
        <CopyBlock lines={[
          "建议发货量 = (目标天数 + Lead Time + 安全库存 − 含在途覆盖天数) × 日均销量 × 活动倍率",
          "触发条件：含在途覆盖天数 < 触发阈值（默认 Lead Time + 安全库存）",
        ]} />
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
        <SubTitle>2.4.2 互动：发货建议计算器</SubTitle>
        <p className="text-[12px] text-foreground-500">随意改动参数，体验卡片各数字如何联动（与发货决策页完全同一套算法）：</p>
        <ShipmentCalc />
        <SubTitle>2.4.3 卡片数字依据</SubTitle>
        <p className="text-[12px] text-foreground-500">发货建议卡片上每个数字的来源（在库可售 = FBA 各仓在库合计）：</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border border-background-200 rounded-lg">
            <thead className="bg-background-100">
              <tr>
                <th className="px-3 py-2 text-left">卡片显示</th>
                <th className="px-3 py-2 text-left">计算依据</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">日均 N 件（7天/30天）</td>
                <td className="px-3 py-2">近 7 天销量日均，或 近 30 天月销 ÷ 30（口径在补货公式里切换）；日均为 0 或已停售的 SKU 不出建议</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">综合覆盖 X 天</td>
                <td className="px-3 py-2">(在库可售 + 在途) ÷ 日均。「综合」= 把在途库存也算作未来可用库存</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">目标 N 天</td>
                <td className="px-3 py-2">全局「目标覆盖天数」；活动倍率开启且 SKU 命中活动时 = 目标天数 + 活动额外天数（默认追加 30 天），同时日均按最高活动倍率放大</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">LT+安全 Y 天（阈值）</td>
                <td className="px-3 py-2">触发阈值，默认 = Lead Time + 安全库存天数；可在补货公式里改为 仅 LT / 仅安全库存 / 自定义天数</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">建议补货 N 件</td>
                <td className="px-3 py-2">(目标 + LT + 安全 − 综合覆盖) × 日均 × 活动倍率，再按取整方式处理（默认向上取整）；结果 ≤ 0 不出建议</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">最晚 YYYY-MM-DD</td>
                <td className="px-3 py-2">今天 + max(0, 综合覆盖 − 阈值)，即库存（含在途）烧到阈值那一天的日期</td>
              </tr>
              <tr>
                <td className="px-3 py-2 whitespace-nowrap">紧急 / 优先 / 常规 / 低优</td>
                <td className="px-3 py-2">按最晚发货日距今：≤ 3 天紧急、≤ 10 天优先、&gt; 30 天低优，其余常规；列表默认按此优先级排序</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Module title="2.5 风险中心（/risk）">
          <p>查看所有风险 SKU，按类型 / 店铺筛选，按严重度 / 类型 / SKU 排序；每条告警可一键「去诊断」定位根因。</p>
        </Module>
        <ExampleBox>
          <p><strong>每日 15 分钟决策流</strong>：</p>
          <p>① 运营一览看到「库存风险 13 条」→ 点卡片进风险中心，按严重程度排序；</p>
          <p>② 对断货的演示产品007（总库存 0、日销 5.2）点「去诊断」→ 跳转发货决策，列表按紧急优先，它排第一；</p>
          <p>③ 向工厂下单后，把「已下单 500 件」记录到操作记录；</p>
          <p>④ 回到诊断页处理利润异常 sku001（单件利润 -5.16），记录调价动作。</p>
          <p><strong>发货建议数字算例</strong>（可在 2.4.2 计算器直接复现）：日均 10 件、在库 80、在途 40 → 综合覆盖 (80+40)÷10 = 12 天，低于阈值 25 天（LT 15 + 安全库存 10）触发补货；建议量 = (45+15+10−12)×10 = <strong>580 件</strong>（向上取整）；最晚发货日 = 今天 + (25−12) = 13 天后；13 天落在 11~30 区间 → <strong>常规</strong>优先级。</p>
        </ExampleBox>
        <NoteBox items={[
          <>日均为 0 或已停售的 SKU 不出建议，这不是遗漏</>,
          <>「综合覆盖」已把在途库存算进去，不要按在库再单独估一遍</>,
          <>「最晚发货日」是库存烧到阈值的那天；Lead Time 已含在公式内，下单时勿再重复加天数</>,
          <>SKU 级单独设置过的 Lead Time / 安全库存优先于全局系数</>,
          <>列表可按优先级 / 紧急度 / 覆盖天数 / 建议量等 6 种方式切换排序</>,
        ]} />
      </GuideSection>

      {/* 三、运营 */}
      <GuideSection num="三" title="运营（侧边栏第 2 组）" open={open["三"]} onToggle={() => toggle("三")}>
        <Module title="3.1 运营中心（/operations）">
          <p>6 张运营视图，包含经营概览、本周 vs 上周对比、周环比变化趋势、销售利润分析。</p>
        </Module>
        <Module title="3.2 SKU 详情（/sku）">
          <p>SPU 产品汇总层 + MSKU 明细层。展开产品查看各 MSKU 独立数据，点击 MSKU 进入详情页。</p>
          <p className="text-[12px] text-foreground-500">MSKU 数据独立：评分、退款率、广告费比、利润、销售数据各 MSKU 独立，不串数据。SKU 页 FOB 成本按「参数中心」配置的币种录入，经全局汇率自动换算为站点货币。</p>
        </Module>
        <Module title="3.3 旺季模拟（/season）">
          <p>预设 Prime Day / Black Friday / Cyber Monday / Christmas，按销量倍率模拟库存缺口和补货需求。</p>
        </Module>
        <Module title="3.4 促销运营中心（/promo-center）">
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
        <Module title="3.5 新品测算（/calculator）">
          <p>输入尺寸、重量、FOB、头程、售价等参数，自动计算体积、总成本、毛利、毛利率、ROI。</p>
          <p className="text-[12px] text-foreground-500">利润数字与全站共用一套公式，可在「参数中心 → 利润公式」自定义（见 5.4）。</p>
          <p className="text-[12px] text-foreground-500">仓储天数别用默认值硬套：按「每批发货量 ÷ 日均销量」估算在仓天数再填（如日销 10、每批发 600 件 → 填 60），输入框下方有 30 / 60 / 90 / 120 / 180 / 360 快捷档位一键填入，也支持手输任意天数。费率阶梯越久越贵（如 61~90 天 0.3、91~120 天 0.6），估准天数才能落到正确费率档，仓储费成本才不失真。</p>
          <p className="text-[12px] text-foreground-500">海外仓服务商费率支持自定义计价币种：参数中心 → 海外仓费率，每个服务商可填 CAD / EUR 等（留空 = 按站点币种直接录入）。勾选参与比价时，仓储费自动按汇率图换算到当前站点币种；缺对应汇率时按原值计算并在结果中提示。</p>
        </Module>
        <ExampleBox>
          <p><strong>SKU 详情排查</strong>：展开「演示产品003」→ 每个 MSKU 行显示各自的评分/广告费比/利润 → 发现 SHOP2-B 评分跌到 4.2 而其他 MSKU 正常 → 点进该 MSKU 详情看退货率变化 → 用「记录操作」留痕「排查差评链接」。</p>
          <p><strong>促销三合一</strong>：Prime Day 前 2 周在「活动管理」建 BD（8 折，10-20 ~ 10-27）→「促销成本」自动估算活动开销 →「时间线」甘特图确认与 LD 不撞期 → 活动期间发货决策自动按活动倍率放大建议量并追加备货天数。</p>
          <p><strong>旺季模拟</strong>：选 Black Friday 场景按 3 倍销量推演 → 看哪些 SKU 出现库存缺口 → 把缺口 SKU 加进补货计划。</p>
          <p><strong>新品测算</strong>：选品会上输入 21×15×10cm / 500g / FOB 8 / 售价 35，实时得到体积重、总成本与毛利率，快速过滤不达标品。</p>
        </ExampleBox>
        <NoteBox items={[
          <>MSKU 指标按行独立存储，展开看的是各自数值，不会取平均（导入口径见 5.1.3）</>,
          <>促销时间线要看促销销量，需先导入销量数据</>,
          <>旺季模拟是按倍率推演的沙盘，不是销量预测，结果用于备货弹性参考</>,
          <>促销活动成本会汇入利润公式的「促销成本」「优惠券」变量；若在 5.4 关闭这两项成本开关，利润中将不再扣减</>,
        ]} />
      </GuideSection>

      {/* 四、工具 */}
      <GuideSection num="四" title="工具（侧边栏第 3 组）" open={open["四"]} onToggle={() => toggle("四")}>
        <Module title="4.1 我的待办（/todo）">
          <p>轻量任务记录，支持关联 SKU、设置截止日期、标记完成。首页展示未完成数量。</p>
        </Module>
        <Module title="4.2 操作记录（/ops-logs）">
          <p>运营操作日志，按日期分组展示。记录价格调整、广告开关、补货、Listing 优化等操作。</p>
        </Module>
        <ExampleBox>
          <p><strong>我的待办</strong>：诊断完 sku001 后建一条待办「观察提价后转化率」，关联 sku001、截止周五 → 首页「我的待办」卡片实时显示剩余数量，周五逐条勾销。</p>
          <p><strong>操作记录</strong>：周五回顾——按日期分组查看本周 8 条操作（调价、开广告、补货），对照 2.3 历史对比的环比变化，判断哪些动作真正带来了改善。</p>
        </ExampleBox>
        <NoteBox items={[
          <>待办是本地轻量记录，不会弹系统提醒，关键节点需要自己回看</>,
          <>操作记录来自你在各页主动点「记录操作」，不会自动同步亚马逊后台的变动</>,
        ]} />
      </GuideSection>

      {/* 五、数据 */}
      <GuideSection num="五" title="数据（侧边栏第 4 组）" open={open["五"]} onToggle={() => toggle("五")}>
        <Module title="5.1 数据导入（/import）">
          <p>支持综合运营表一次性多 Sheet 导入，自动识别列名。页面顶部「数据来源」三个 Tab：<strong>Excel 上传</strong>（9 个导入 Tab，见 5.1.1～5.1.7）、<strong>MCP 一键拉取</strong> / <strong>REST API 拉取</strong>（ERP 直连，见 5.1.8，一期仅领星）。模板已含 MSKU 级指标列（评分/评论数/广告费比/退货率/退款率）和产品链接/竞品链接列，按 MSKU 行填写即可展示独立指标和自然/广告订单占比。</p>
          <p className="text-[12px] text-foreground-500">主要入口：「综合运营表」下载模板 → 填充数据 → 上传自动识别多 Sheet。新增列均为可选，留空不影响导入。页面底部提供「GitHub 云端同步（手动保存）」备份区，详见第六章。</p>
        </Module>
        <SubTitle>5.1.1 综合运营表（主要入口）</SubTitle>
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
        <SubTitle>5.1.2 仓库区域映射（多站点 · 别名 · 自定义区域）</SubTitle>
        <p>入口：「数据导入」页 →「仓库映射」Tab。将领星等工具下载的仓库名称映射到区域，导入仓库明细时自动匹配并汇总。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>按站点区分</strong>：映射跟随店铺（站点）保存。同一仓库名在美国站映射为美东、在加拿大站映射为其他区域，互不影响；做多个站点时海外仓的销量和库存天然分开。导入时系统自动按当前站点创建映射；未配置站点专属映射时回退到通用映射。</li>
          <li><strong>别名</strong>：可为仓库设置显示名（如「美西 LG1 仓」），发货决策页和 SKU 详情页的仓库明细会优先展示别名，原始仓库名保持不变。</li>
          <li><strong>自定义区域</strong>：除美东/美西/东南/中南四个预置区域外，可添加自定义区域名（如「加拿大东仓」）。自定义区域在仓库明细中独立展示；预置四仓的汇总统计不受影响。预置四仓不可删除。</li>
          <li><strong>生效范围</strong>：映射保存后对所有历史数据重新生效；变更后发货建议、SKU 详情会自动刷新。</li>
        </ul>
        <SubTitle>5.1.3 多 MSKU 数据独立性</SubTitle>
        <p>销量表和运营数据表中，同一 SKU 的不同 MSKU 各占一行，填写各自的评分/评论数/广告费比/退货率/退款率。系统自动按 MSKU 独立存储到 mskuMetrics 字段，列表展开和详情页均展示各 MSKU 自身的值，不会取平均覆盖。</p>
        <SubTitle>5.1.4 产品链接 / 竞品链接</SubTitle>
        <p>在「SKU 标识符」或「运营数据导入」表中填写。产品链接为当前 Listing 的 Amazon URL；竞品链接支持多个，用换行符分隔。导入后可在 SKU 详情页直接点击跳转。</p>
        <SubTitle>5.1.5 自然订单 / 广告订单占比</SubTitle>
        <p>系统基于广告费比（adRatio）自动推导自然订单与广告订单占比：广告订单占比 ≈ 广告费比；自然订单占比 ≈ 100% - 广告费比。该指标展示在促销时间线和 SKU 详情页中，含可视化进度条。</p>
        <SubTitle>5.1.6 导入模板匹配口径说明</SubTitle>
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
        <SubTitle>5.1.7 列名智能匹配</SubTitle>
        <ul className="list-disc pl-5 space-y-1 text-[13px]">
          <li>退款率 / refund_rate / Refund Rate 均可识别</li>
          <li>退货率 / return_rate / Return Rate 均可识别</li>
          <li>FOB / 采购价 / 产品成本 均可识别</li>
          <li>产品链接 / Product URL / Listing 链接 均可识别</li>
          <li>竞品链接 / Competitor URL 均可识别</li>
        </ul>
        <SubTitle>5.1.8 ERP 一键拉取（一期：领星）</SubTitle>
        <p>数据导入页顶部新增「数据来源」三个 Tab：<strong>Excel 上传</strong>（原有流程，永远保留兜底）、<strong>MCP 一键拉取</strong>、<strong>REST API 拉取</strong>。ERP 下拉选择后表单自动联动：领星两条通道都可用；积加/易仓仅 MCP、赛狐/优麦云仅 REST，二期开放。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>开通前提</strong>：领星管理员在【业务配置】→【开放接口】开通。MCP：AI 助手 → MCP 页复制「服务器 URL」与「密钥」；REST：开放后台查看 AppID / AppSecret。</li>
          <li><strong>凭证安全</strong>：密钥只保存在本浏览器 localStorage，不上传任何服务器；「保存凭证到本机」后下次自动回填，换浏览器需重填。</li>
          <li><strong>CORS 转发</strong>：浏览器直连被拦截时需一个转发通道——部署仓库 <code>worker/cors-proxy.js</code> 到 Cloudflare Workers（免费，只转发不存储密钥），把 <code>*.workers.dev</code> 地址填入「Worker 转发地址」即可；不填则直连，失败时日志会提示。</li>
          <li><strong>拉取内容与口径</strong>：自动拉取 Listing 主档（MSKU/ASIN/SKU/店铺）、近 7 天销量/销售额、广告花费与 ACoS、FBA 可售库存、海外仓库存、退款数量，归一化后写入快照（数据日期可选，默认今天）。不同接口的行键（MSKU / 本地 SKU）自动合并为同一商品。</li>
          <li><strong>只补不覆盖</strong>：拉取仅补 SKU 标识与销量库存快照，Excel 已录入的 FOB/售价等成本字段不会被覆盖；两种通道数据口径一致，可与 Excel 混用。</li>
          <li><strong>限流</strong>：领星 MCP 工具调用限 100 次/分钟，常规拉取（3 个工具）不会触发。</li>
        </ul>
        <Module title="5.2 数据健康（/data-health）">
          <p>检查数据导入质量，展示各字段完整度，识别缺失或异常数据。</p>
        </Module>
        <Module title="5.3 店铺管理（/shop-management）">
          <p>新增、编辑、删除店铺，查看各店铺数据量。站点在顶栏站点切换器 →「站点管理」维护：预置美/英/德/日/加 5 站，冷门站点（澳大利亚、墨西哥、中东等）可自定义新增，任意站点的名称、代码、币种、佣金率均可编辑，支持启用/停用；汇率在「汇率管理」中按任意货币对配置。</p>
        </Module>
        <Module title="5.4 参数中心（/settings）">
          <p>供应链参数（Lead Time、安全库存、目标库存）、活动参数、利润率/广告费比/退货率阈值，以及「利润公式」Tab（详见下方）。</p>
        </Module>
        <SubTitle>5.4.1 常用设置（一般改这些就够了）</SubTitle>
        <p>入口：「参数中心」→「利润公式」Tab。默认按下面的公式计算，多数场景只需动两处：</p>
        <CopyBlock lines={[
          "总成本 = FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退货损失 + 促销成本 + 优惠券",
          "单件净利 = 售价 − 总成本；净利率 = 净利 ÷ 售价 × 100%",
        ]} />
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>成本项计入开关</strong>：9 个成本项（FOB / 头程运费 / 配送费 / 佣金 / 仓储费 / 广告费 / 退货损失 / 促销成本 / 优惠券）任意开关，关闭后该项按 0 计，全站利润数字（运营一览、SKU 详情、新品测算等）实时联动。</li>
          <li><strong>三个系数</strong>：默认佣金率（SKU 未填佣金时按此估算，默认 15%）、折扣广告费上浮率与折扣退款费上浮率（折扣场景预估加成，默认 10%，详见下方说明）。</li>
        </ul>
        <div className="rounded-[10px] border border-background-200 bg-background-50/60 px-4 py-3 space-y-2">
          <div className="text-[13px] font-semibold text-foreground-900">折扣预估上浮率（广告费 / 退款费）是干什么的</div>
          <p className="text-[12.5px] text-foreground-600 leading-relaxed">SKU 详情页「促销/折扣利润」卡片里「折扣广告费(估)」「折扣退款费(估)」两行的兜底算法：折扣口径有真实数据就直接用（填了折扣广告费、能按费比从折扣价推出、或有折扣价可按退款率算）；推不出来时才按「正常值 × (1 + 上浮率%)」估。两个估值仅作参考展示，<strong>不参与折扣净利计算</strong>。</p>
          <CopyBlock lines={[
            "折扣广告费(估) = 正常广告费 × (1 + 上浮率%)   例：3.5 × 1.1 = 3.85",
            "折扣退款费(估) = 正常退款费 × (1 + 上浮率%)   例：1.05 × 1.1 ≈ 1.16",
          ]} />
          <p className="text-[12px] text-foreground-500">试一试：下方 5.4.2 试算器选「折扣广告费(估)」，默认变量就是 正常广告费 3.5、上浮率 0.1，结果 3.85；把上浮率改成 0.2，结果变 4.2。</p>
        </div>
        <NoteBox items={[
          <>上浮率是「兜底估算」：折扣广告费(估)只要填了折扣广告费、或快照有广告费比能推出折扣口径，就完全不走上浮率；折扣退款费(估)在有折扣价时按「折扣价 × 退款率 × 月销」直接算，也不走上浮率</>,
          <>只影响两个「(估)」参考行：不改变正常列成本，也不参与折扣净利 / 折扣利润率的计算</>,
          <>调整建议：旺季秒杀、大促广告费涨幅大 → 调大（如 20 = ×1.2）；日常轻促销觉得估得太狠 → 调小（如 5 = ×1.05）；平时保持默认 10 即可，不用动</>,
          <>保存后立即生效，无需刷新；点「恢复默认」会把两项还原为 10</>,
        ]} />
        <p className="text-[12px] text-foreground-500">Tab 顶部的「当前生效公式」默认收起，点开可查看 8 条公式全文；自定义过的会有「已自定义 N 条」标记。设置页还有同款试算器思路——先在下方 5.4.2 玩明白，再去设置页改。</p>
        <SubTitle>5.4.2 互动：公式试算器</SubTitle>
        <p className="text-[12px] text-foreground-500">选一条公式、改改变量、直接写表达式，即时看到结果与报错——与设置页同一套求值器（仅本地试玩，不会保存到设置）：</p>
        <FormulaPlayground />
        <SubTitle>5.4.3 高级：公式表达式自定义</SubTitle>
        <p className="text-[12px] text-foreground-500">一般无需修改——写错会实时标红、保存时拦截、计算异常自动回退默认公式，不会算崩。需要改写某条公式算法时，展开下面的折叠区，内含变量列表、函数说明与可复制的示例。</p>
        <Collapse title="展开：变量列表 · 函数 · 常用示例（高级）">
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
        <SubTitle>常用示例（点击右侧图标一键复制）</SubTitle>
        <div className="space-y-1.5">
          <ExampleRow note="「单件净利」先扣 5% 杂费再减成本" expr="售价 * 0.95 - 总成本" />
          <ExampleRow note="「总成本」不算促销成本和优惠券（也可直接用上方开关关闭）" expr="FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退款损失" />
          <ExampleRow note="「总成本」每件额外加 2 元包材费" expr="FOB + 头程运费 + 配送费 + 佣金 + 仓储费 + 广告费 + 退款损失 + 促销成本 + 优惠券 + 2" />
          <ExampleRow note="「净利率」封顶 60%，避免极端值" expr="min(净利 ÷ 售价 × 100, 60)" />
          <ExampleRow note="「净利率」亏损时按 -5% 兜底展示" expr="max(净利 ÷ 售价 × 100, -5)" />
          <ExampleRow note="「折扣广告费(估)」固定按 1.2 倍估（不随上浮率设置变化）" expr="正常广告费 * 1.2" />
        </div>
        <p className="text-[12px] text-foreground-500">说明：示例中注释仅标注该表达式应填在哪条公式下，输入框中只需粘贴表达式本身（不要带公式名和等号，等号不是合法字符）；净利率 / 广告费比 / 退货率的结果为百分数（15 表示 15%）；变量名需与表中完全一致（不区分大小写英文字母，如 FOB 也可写 fob）。</p>
        <p className="text-[12px] text-foreground-500">说明：佣金取值优先级为 显式填写 → SKU 佣金率 × 售价 → 默认佣金率估算（比例可在下方修改）；广告费缺失时按费比 × 售价反推。点「恢复默认」还原全部配置，保存后无需刷新立即生效。</p>
        </Collapse>
        <ExampleBox>
          <p><strong>首次导入全流程</strong>：① 店铺管理建好 3 个店铺 → ② 数据导入下载「综合运营表」模板 → ③「SKU 标识符」Sheet 填 5 个 SKU（每个 MSKU 一行，含 ASIN/MSKU 对应关系）→ ④「销量导入」按 MSKU 填销量 + 评分 + 广告费比 → ⑤ 填 FBA 库存 / 仓库明细(FBM) / 在途明细 → ⑥ 上传一个文件，8 个 Sheet 自动识别导入 → ⑦ 数据健康检查字段完整度 → ⑧ 发货决策立即出建议。</p>
          <p><strong>仓库映射</strong>：领星导出的仓库名「AMER-WEST-LG1」→ 设别名「美西 LG1」、区域美西；美国站配一份，加拿大站再配一份，同名仓库互不影响。</p>
          <p><strong>利润公式算例</strong>（可在 5.4.2 试算器直接复现）：售价 35、FOB 8、头程运费 3、配送费 4.2、佣金 5.25、仓储费 0.6、广告费 3.5、退款损失 1.05、促销成本 0.35、优惠券 0.7 → 总成本 26.65 → 单件净利 8.35 → 净利率 ≈ 23.9%。</p>
        </ExampleBox>
        <NoteBox items={[
          <>以 ASIN 为口径的导入（销量 / FBA 库存明细 / 运营数据）必须先导入「SKU 标识符」建立 ASIN→SKU 映射，否则数据挂不上</>,
          <>导入仓库明细前先配好「仓库映射」（5.1.2），否则会汇总到错误区域；映射保存后对历史数据也重新生效</>,
          <>列名中英文 / 大小写均可识别（refund_rate、Refund Rate、退款率等），列留空不影响导入，缺失字段会在数据健康中标出</>,
          <>汇率与 FOB 成本录入币种在顶栏站点切换器 →「汇率管理」弹窗内配置，换算走全局汇率图，无路径时回退旧两级换算</>,
        ]} />
      </GuideSection>

      {/* 六、GitHub 云端同步 */}
      <GuideSection num="六" title="GitHub 云端同步（手动保存）" open={open["六"]} onToggle={() => toggle("六")}>
        <p>数据默认只存在当前浏览器的 IndexedDB 中，换设备或清除浏览器数据会丢失。「GitHub 云端同步」把全部数据（SKU 主档、快照、分仓库存、促销、参数等）导出为一个 JSON 文件，备份到<strong>你自己的 GitHub 私有仓库</strong>，需要时一键恢复。全程手动触发，不会自动上传。入口在「数据导入」页底部。</p>
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
        <ExampleBox>
          <p><strong>日常备份</strong>：每周五下班前打开「数据导入」页 → GitHub 云端同步 → 点「保存到 GitHub 云端」→ 看到按钮旁「上次同步时间」更新即可关机。</p>
          <p><strong>换机迁移</strong>：新电脑登录后配置同一个仓库（Token + owner/repo + 分支 + 文件路径）→ 点「保存并校验配置」→ 点「从 GitHub 拉取」→ SKU 主档、库存、促销、参数全部恢复，无缝继续工作。</p>
        </ExampleBox>
        <SubTitle>注意事项</SubTitle>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>手动备份</strong>：建议每周或每次大批量导入数据后点一次「保存到 GitHub 云端」。</li>
          <li><strong>Token 安全</strong>：Token 只保存在本地 IndexedDB，请求直接从浏览器发往 GitHub，不经任何服务器中转。</li>
          <li><strong>拉取会覆盖</strong>：「从 GitHub 拉取」会整库覆盖本地当前数据，执行前请确认本地没有未备份的新数据。</li>
          <li><strong>多设备</strong>：多台设备可共用同一备份仓库；建议养成「先拉取 → 编辑 → 再保存」的习惯，避免互相覆盖。</li>
        </ul>
      </GuideSection>

      {/* 七、常见问题 */}
      <GuideSection num="七" title="常见问题" open={open["七"]} onToggle={() => toggle("七")}>
        <p className="text-[12px] text-foreground-500">点击问题展开答案：</p>
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
          17 项导航按 5 组分类：决策组（5 项）、运营组（5 项）、工具组（2 项）、数据组（4 项）、帮助组（1 项）。展开侧边栏查看完整列表，各模块说明见第二~五章。
        </Faq>
        <Faq q="促销管理和促销成本去哪里了？">
          已合并为「促销运营中心」（<code className="font-mono bg-background-100 px-1 rounded">/promo-center</code>），包含三个 Tab：活动管理、促销成本、促销时间线。旧书签链接会自动跳转到对应 Tab。
        </Faq>
        <Faq q="我的站点不在列表里（冷门站点怎么办）？">
          顶栏站点切换器 →「站点管理」→ 新增自定义站点：名称/代码/币种任意填（冷门币种直接输入即可）→ 新站点自动启用并切换为当前站点 → 到「汇率管理」配置该币种的真实汇率。预置的英/德/日/加站也可改名为你实际经营的站点。
        </Faq>
        <Faq q="数据存储在哪里？">
          数据存储在浏览器本地的 IndexedDB 中，不上传服务器。清除浏览器数据会丢失数据，建议定期使用「GitHub 云端同步」手动备份（见第六章）。
        </Faq>
        <Faq q="换了电脑或浏览器，数据怎么迁移？">
          在旧设备上进入「数据导入」→「GitHub 云端同步」点「保存到 GitHub 云端」；在新设备上配置同一个仓库后点「从 GitHub 拉取」即可完整恢复（见第六章）。
        </Faq>
        <Faq q="补货建议不想用系统默认公式？">
          进入「发货决策」页点「补货公式」，可自定义日均销量口径（7天/30天）、触发阈值方式、目标天数/Lead Time/安全库存系数、活动倍率与取整方式（见 2.4）。利润计算同理，可在「参数中心 → 利润公式」自定义成本项计入（见 5.4）。
        </Faq>
        <NoteBox items={[
          <>页面空白 / 数据缺失 → 先到「数据健康」（5.2）看字段完整度，再检查导入文件列名</>,
          <>数字对不上 → 查「参数中心 → 利润公式」（5.4）与发货决策「补货公式」（2.4）是否改过配置或写错表达式</>,
          <>换设备数据丢了 → 按第六章从 GitHub 拉取恢复；平时没备份则无法找回</>,
          <>找不到功能入口 → 按第一章导览表对照侧边栏分组，各模块详细说明见第二~五章</>,
        ]} />
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

/* ── 章节折叠容器 ── */
function GuideSection({ num, title, open, onToggle, children }: {
  num: string; title: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section id={`guide-${num}`} className="scroll-mt-28 rounded-[14px] border border-background-200 bg-background-50/40">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <h2 className="text-[16px] font-semibold text-foreground-900">
          <span className="text-primary-600 mr-2">{num}、</span>{title}
        </h2>
        <i className={`text-[18px] text-foreground-400 ${open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-5 text-[13px] text-foreground-700 leading-relaxed">{children}</div>
      )}
    </section>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14px] font-semibold text-foreground-800 mt-3 mb-1">{children}</h3>;
}

/* ── 章节使用示例 / 注意事项 ── */
function ExampleBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-primary-200 bg-primary-50/40 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-primary-700">
        <i className="ri-play-circle-line" aria-hidden />使用示例
      </div>
      <div className="space-y-1.5 text-[13px] text-foreground-700 leading-relaxed">{children}</div>
    </div>
  );
}

function NoteBox({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="rounded-[10px] border border-amber-200 bg-amber-50/50 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
        <i className="ri-error-warning-line" aria-hidden />注意事项
      </div>
      <ul className="list-disc pl-5 space-y-1 text-[12.5px] text-foreground-700 leading-relaxed">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
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

/* ── 可折叠 FAQ ── */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [openF, setOpenF] = useState(false);
  return (
    <div className="rounded-[10px] border border-background-200 bg-background-50/60">
      <button onClick={() => setOpenF(!openF)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="font-semibold text-foreground-800 text-[13px]">Q：{q}</span>
        <i className={`shrink-0 text-foreground-400 ${openF ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`} aria-hidden />
      </button>
      {openF && <div className="px-4 pb-3 text-[12px] text-foreground-600 leading-relaxed">A：{children}</div>}
    </div>
  );
}

/* ── 内容折叠区（默认收起） ── */
function Collapse({ title, children }: { title: string; children: React.ReactNode }) {
  const [openC, setOpenC] = useState(false);
  return (
    <div className="rounded-[10px] border border-background-200 bg-background-50/60">
      <button onClick={() => setOpenC(!openC)} className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="font-semibold text-foreground-800 text-[13px]">{title}</span>
        <i className={`shrink-0 text-foreground-400 ${openC ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`} aria-hidden />
      </button>
      {openC && <div className="space-y-2 border-t border-background-200 px-4 pb-3 pt-3">{children}</div>}
    </div>
  );
}

/* ── 代码块 + 一键复制 ── */
function CopyBlock({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 剪贴板不可用时忽略 */ }
  };
  return (
    <div className="relative rounded-lg bg-background-100/60 p-3 pr-11 font-mono text-[12px] leading-relaxed text-foreground-700">
      {lines.map((l, i) => <div key={i}>{l}</div>)}
      <button onClick={copy} title="复制" className="absolute right-2 top-2 rounded-md border border-background-300 bg-white/90 px-1.5 py-0.5 text-[12px] text-foreground-400 hover:text-primary-600">
        <i className={copied ? "ri-check-line text-green-600" : "ri-file-copy-line"} aria-hidden />
      </button>
    </div>
  );
}

function ExampleRow({ note, expr }: { note: string; expr: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(expr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 忽略 */ }
  };
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-background-200 bg-background-50 px-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[11px] text-foreground-400">{note}</div>
        <div className="truncate font-mono text-[12px] text-foreground-700">{expr}</div>
      </div>
      <button onClick={copy} title="复制表达式" className="shrink-0 rounded-md border border-background-300 bg-white px-1.5 py-0.5 text-[12px] text-foreground-400 hover:text-primary-600">
        <i className={copied ? "ri-check-line text-green-600" : "ri-file-copy-line"} aria-hidden />
      </button>
    </div>
  );
}

/* ── 分段选择器 ── */
function Seg<T extends string>({ options, value, onChange }: {
  options: { v: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-background-300/70 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
            value === o.v ? "bg-primary-600 text-white" : "text-foreground-600 hover:bg-background-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumField({ label, value, onChange, step = "1" }: {
  label: string; value: number; onChange: (n: number) => void; step?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-foreground-500">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-background-300/70 bg-white px-2 py-1 text-[12px] text-foreground-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
    </label>
  );
}

/* ── 互动：发货建议计算器（与 engine.computeShipmentSuggestions 同一套算法） ── */
function ShipmentCalc() {
  const [v, setV] = useState({ daily: 10, onHand: 80, transit: 40, lt: 15, safety: 10, target: 45, mult: 1.5, extra: 30, custom: 60 });
  const [promoOn, setPromoOn] = useState(false);
  const [mode, setMode] = useState<"lt_safety" | "lt_only" | "safety_only" | "custom_days">("lt_safety");
  const [rounding, setRounding] = useState<"ceil" | "round" | "floor">("ceil");
  const set = (k: keyof typeof v, n: number) => setV((s) => ({ ...s, [k]: n }));

  const daily = v.daily;
  const ok = Number.isFinite(daily) && daily > 0 && v.onHand >= 0 && v.transit >= 0;
  const cover = ok ? (v.onHand + v.transit) / daily : Infinity;
  const multiplier = promoOn && v.mult > 1 ? v.mult : 1;
  const boosted = daily * multiplier;
  const targetEff = promoOn && multiplier > 1 ? v.target + v.extra : v.target;
  const threshold = mode === "lt_only" ? v.lt : mode === "safety_only" ? v.safety : mode === "custom_days" ? v.custom : v.lt + v.safety;
  const triggered = ok && cover < threshold;
  const raw = (targetEff + v.lt + v.safety - cover) * boosted;
  const qty = !ok ? 0 : rounding === "ceil" ? Math.ceil(raw) : rounding === "round" ? Math.round(raw) : Math.floor(raw);
  const daysUntil = ok ? Math.max(0, cover - threshold) : 0;
  const latest = new Date();
  latest.setDate(latest.getDate() + Math.round(daysUntil));
  const latestStr = latest.toISOString().slice(0, 10);
  const priority = daysUntil <= 3 ? "紧急" : daysUntil <= 10 ? "优先" : daysUntil > 30 ? "低优" : "常规";
  const priorityCls = daysUntil <= 3 ? "bg-red-100 text-red-700" : daysUntil <= 10 ? "bg-amber-100 text-amber-700" : "bg-background-100 text-foreground-600";

  return (
    <div className="rounded-lg border border-background-200 bg-white p-3 space-y-2.5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <NumField label="日均（件/天）" value={v.daily} step="0.1" onChange={(n) => set("daily", n)} />
        <NumField label="在库（件）" value={v.onHand} onChange={(n) => set("onHand", n)} />
        <NumField label="在途（件）" value={v.transit} onChange={(n) => set("transit", n)} />
        <NumField label="Lead Time（天）" value={v.lt} onChange={(n) => set("lt", n)} />
        <NumField label="安全库存（天）" value={v.safety} onChange={(n) => set("safety", n)} />
        <NumField label="目标天数" value={v.target} onChange={(n) => set("target", n)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-foreground-500">
        <span className="flex items-center gap-1.5">活动加成
          <Seg options={[{ v: "off", label: "关" }, { v: "on", label: "开" }]} value={promoOn ? "on" : "off"} onChange={(x) => setPromoOn(x === "on")} />
        </span>
        {promoOn && <NumField label="倍率" value={v.mult} step="0.1" onChange={(n) => set("mult", n)} />}
        {promoOn && <NumField label="额外天数" value={v.extra} onChange={(n) => set("extra", n)} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-foreground-500">
        <span className="flex items-center gap-1.5">触发阈值
          <Seg<"lt_safety" | "lt_only" | "safety_only" | "custom_days">
            options={[{ v: "lt_safety", label: "LT+安全" }, { v: "lt_only", label: "仅LT" }, { v: "safety_only", label: "仅安全" }, { v: "custom_days", label: "自定义" }]}
            value={mode}
            onChange={setMode}
          />
        </span>
        {mode === "custom_days" && <NumField label="阈值（天）" value={v.custom} onChange={(n) => set("custom", n)} />}
        <span className="flex items-center gap-1.5">取整
          <Seg<"ceil" | "round" | "floor"> options={[{ v: "ceil", label: "向上" }, { v: "round", label: "四舍五入" }, { v: "floor", label: "向下" }]} value={rounding} onChange={setRounding} />
        </span>
      </div>
      <div className={`rounded-md border px-3 py-2 text-[12px] ${triggered ? "border-red-200 bg-red-50/70" : "border-primary-200 bg-primary-50/30"}`}>
        {!ok ? (
          <div className="font-semibold text-foreground-500">日均销量需大于 0，在库/在途不能为负</div>
        ) : triggered ? (
          <>
            <div className="flex items-center gap-1 font-semibold text-red-700">
              <i className="ri-error-warning-line" aria-hidden />
              综合覆盖 {cover.toFixed(1)} 天 &lt; 阈值 {threshold} 天，需要向工厂下单
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-foreground-600">
              <span className="font-medium text-primary-700">建议补货 {qty.toLocaleString()} 件</span>
              <span>·</span>
              <span>最晚 {latestStr}</span>
              <span>·</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityCls}`}>{priority}</span>
              {qty <= 0 && <span className="text-foreground-400">（建议量 ≤ 0，列表中不会展示）</span>}
            </div>
            <div className="mt-1 font-mono text-[10px] text-foreground-400">
              (目标{targetEff} + LT{v.lt} + 安全{v.safety} − 综合覆盖{cover.toFixed(1)}) × 日均{boosted.toFixed(1)} = {qty.toLocaleString()} 件
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1 font-semibold text-primary-700">
            <i className="ri-check-double-line" aria-hidden />
            综合覆盖 {cover.toFixed(1)} 天 ≥ 阈值 {threshold} 天，库存充足，无需下单
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 互动：利润公式试算器（使用与设置页同一套求值器） ── */
const SAMPLE_VARS: Record<string, number> = {
  售价: 35, FOB: 8, 头程运费: 3, 配送费: 4.2, 佣金: 5.25, 仓储费: 0.6,
  广告费: 3.5, 退货费: 0.7, 退款损失: 1.05, 促销成本: 0.35, 优惠券: 0.7,
  总成本: 26.65, 净利: 8.35, 上浮率: 0.1, 正常广告费: 3.5, 正常退款费: 1.05,
};
const COST_ITEMS = ["FOB", "头程运费", "配送费", "佣金", "仓储费", "广告费", "退款损失", "促销成本", "优惠券"];
const VAR_LISTS: Record<ProfitFormulaKey, string[]> = {
  totalCost: ["售价", ...COST_ITEMS, "退货费"],
  discountTotalCost: ["售价", ...COST_ITEMS, "退货费"],
  grossProfit: ["售价", "总成本"],
  grossMargin: ["净利", "售价", "总成本"],
  adRatio: ["广告费", "售价"],
  returnRate: ["退货费", "售价"],
  discountAdEst: ["正常广告费", "上浮率"],
  discountReturnEst: ["正常退款费", "上浮率"],
};
const PLAY_DEFAULT: Record<ProfitFormulaKey, string> = {
  totalCost: [...COST_ITEMS].join(" + "),
  discountTotalCost: [...COST_ITEMS].join(" + "),
  grossProfit: "售价 − 总成本",
  grossMargin: "净利 ÷ 售价 × 100",
  adRatio: "广告费 ÷ 售价 × 100",
  returnRate: "退货费 ÷ 售价 × 100",
  discountAdEst: "正常广告费 × (1 + 上浮率)",
  discountReturnEst: "正常退款费 × (1 + 上浮率)",
};
const SAMPLE_EXPR: Record<ProfitFormulaKey, string> = {
  totalCost: COST_ITEMS.slice(0, 7).join(" + "),
  discountTotalCost: COST_ITEMS.slice(0, 7).join(" + "),
  grossProfit: "售价 * 0.95 - 总成本",
  grossMargin: "min(净利 ÷ 售价 × 100, 60)",
  adRatio: "广告费 ÷ 售价 × 100",
  returnRate: "退货费 ÷ 售价 × 100",
  discountAdEst: "正常广告费 * 1.2",
  discountReturnEst: "正常退款费 × (1 + 上浮率)",
};

function FormulaPlayground() {
  const keys = Object.keys(PROFIT_FORMULA_META) as ProfitFormulaKey[];
  const [key, setKey] = useState<ProfitFormulaKey>("totalCost");
  const [expr, setExpr] = useState(PLAY_DEFAULT.totalCost);
  const [vals, setVals] = useState<Record<string, number>>(SAMPLE_VARS);

  const varNames = VAR_LISTS[key];

  const pick = (k: ProfitFormulaKey) => {
    setKey(k);
    setExpr(PLAY_DEFAULT[k]);
  };

  const result = useMemo(() => {
    try {
      const fn = compileFormula(expr);
      const vars: Record<string, number> = {};
      for (const n of varNames) vars[n] = vals[n] ?? 0;
      return { ok: true as const, value: fn(vars) };
    } catch (e) {
      return { ok: false as const, msg: e instanceof FormulaEvalError ? e.message : "表达式无效" };
    }
  }, [expr, varNames, vals]);

  return (
    <div className="rounded-lg border border-background-200 bg-white p-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => pick(k)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              key === k ? "border-primary-500 bg-primary-600 text-white" : "border-background-300 bg-white text-foreground-600 hover:border-primary-400 hover:text-primary-600"
            }`}
          >
            {PROFIT_FORMULA_META[k].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {varNames.map((n) => (
          <NumField key={n} label={n} value={vals[n] ?? 0} step="0.05" onChange={(num) => setVals((s) => ({ ...s, [n]: num }))} />
        ))}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-foreground-500">表达式（可用变量：{varNames.join("、")}）</span>
          <div className="flex gap-1.5">
            <button onClick={() => setExpr(SAMPLE_EXPR[key])} className="rounded-md border border-background-300 bg-white px-2 py-0.5 text-[11px] text-foreground-600 hover:border-primary-400 hover:text-primary-600">填入示例</button>
            <button onClick={() => setExpr(PLAY_DEFAULT[key])} className="rounded-md border border-background-300 bg-white px-2 py-0.5 text-[11px] text-foreground-600 hover:border-primary-400 hover:text-primary-600">还原默认</button>
          </div>
        </div>
        <textarea
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-background-300/70 bg-white px-2.5 py-1.5 font-mono text-[12px] text-foreground-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>
      <div className={`rounded-md border px-3 py-2 text-[12px] ${result.ok ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60"}`}>
        {result.ok ? (
          <span className="font-mono font-semibold text-green-700">= {Number.isFinite(result.value) ? result.value.toFixed(2) : "∞（除以 0 会自动回退默认公式）"}</span>
        ) : (
          <span className="text-red-700"><i className="ri-error-warning-line mr-1" aria-hidden />{result.msg}（设置页会标红拦截，实际计算自动回退默认公式）</span>
        )}
      </div>
    </div>
  );
}
