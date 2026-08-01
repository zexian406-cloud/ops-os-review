import { useState } from "react";
import { Link } from "react-router-dom";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";

/* ────────── 内容区块配置 ────────── */
interface GuideBlock {
  id: string;
  title: string;
  icon: string;
  desc: string;
  tone: "primary" | "accent" | "secondary" | "warn";
  link?: string;
  linkLabel?: string;
  sections: { sub: string; body: string; tips?: string[] }[];
}

const GUIDE: GuideBlock[] = [
  {
    id: "overview",
    title: "系统概述",
    icon: "ri-rocket-2-line",
    desc: "Amazon Ops OS 是一个以 SSOT（单一数据源）为核心的 Amazon 运营管理系统。它替代了运营团队日常使用的 Excel 运营表——数据从 ERP 导出后导入系统，自动完成异常检测、发货建议、利润分析、促销管理和旺季模拟。",
    tone: "primary",
    sections: [
      {
        sub: "为什么不用 Excel 了",
        body: "运营团队通常每人维护自己的一套 Excel 运营表，离职时需要打包交接、数据散落在多个文件里、每周手动做表格费时费力。Amazon Ops OS 把这些问题全解决了：① 离职不需要打包——数据在浏览器本地，清空即走；② 换人或离职可快速清空数据重新开始；③ 所有 SKU 数据可视化集中展示，每周看 Dashboard 就能直观定位问题和精准备货。",
      },
      {
        sub: "核心设计",
        body: "所有数据存储在本地浏览器的 IndexedDB 中——不需要服务器、不需要数据库连接、不需要登录账号。打开浏览器就能用，关掉也不会丢。如果你有 GitHub 账号，可以一键把数据备份到云端，换电脑也能恢复。",
      },
      {
        sub: "与 ERP 的关系",
        body: "系统不是 ERP 的替代品——它是 ERP 的上层分析工具。你的数据源头依然是 ERP（如领星、船长、积加等），从 ERP 导出运营报表后导入本系统，系统负责自动分析、异常检测、发货计算和可视化展示。ERP 管数据录入和流程，本系统管数据分析和决策辅助，两者配合使用。",
        tips: [
          "每周只需要操作一次，全部导入流程不超过 5 分钟",
          "模板在「数据导入」页面每个入口都有「下载模板」按钮",
        ],
      },
      {
        sub: "五个分组",
        body: "左侧导航分为五个分组：决策（驾驶舱、异常诊断、历史对比、数据健康、发货决策、风险中心）帮你发现问题并做决策；运营（运营中心、SKU 详情、旺季模拟、促销管理、促销成本、新品测算）帮你深度分析单品和规划新品；工具（我的待办、操作记录）是轻量辅助；数据（数据导入、店铺管理、参数中心）是数据入口与配置后台；帮助（使用指南）是本手册。",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard · 今日运营总览",
    icon: "ri-dashboard-3-line",
    desc: "每天早上打开的第一个页面。一屏看全所有 SKU 的当前状态：在售 SKU 数、全站库存、日均销量、月销售额，以及与上期的环比变化。",
    tone: "primary",
    link: "/",
    linkLabel: "打开 Dashboard",
    sections: [
      {
        sub: "顶部 KPI 卡片",
        body: "四张大卡片：在售 SKU 数、全站库存、日均销量（近 7 天日均）、月销售额（估算 GMV）。每张卡片下方如果有环比数据，会用红/绿色箭头标注上升或下降。",
      },
      {
        sub: "上期对比条",
        body: "展示本周与上周（或上次导入与本次导入）的环比变化：日均销量变化、库存变化、平均利润率变化、平均评分变化。点击「查看 SKU 明细」跳到 SKU 列表。",
      },
      {
        sub: "促销活动提醒",
        body: "如果参数中心里有即将开始或正在进行的促销，Dashboard 会列出所有活动。开始前 2 天和到期前 2 天会有明显的倒计时 Badge 提醒。",
        tips: ["在「参数中心 → 促销管理」添加促销活动"],
      },
      {
        sub: "今日需要处理的事",
        body: "把告警按类型聚合成 6 个卡片：库存风险、利润异常、广告异常、评分下降、退货异常、Listing 待优化。每个卡片显示数量，点击直接跳转到运营中心对应的分析视图。绿色代表正常，红色代表需要关注。",
      },
      {
        sub: "右侧面板",
        body: "左侧是紧急告警列表（Critical + Warning 两级），右侧是今日发货建议的 TOP 6。点击可跳转到风险中心或发货决策中心。",
      },
    ],
  },
  {
    id: "shipment",
    title: "发货决策中心",
    icon: "ri-truck-line",
    desc: "核心决策工具。系统根据每个 SKU 的日均销量、当前库存、在途数量，自动算出建议发货量和最晚发货日。",
    tone: "accent",
    link: "/shipment",
    linkLabel: "打开发货决策",
    sections: [
      {
        sub: "卡片式浏览",
        body: "每个 SKU 一张卡片，顶部显示 SKU 名 + 状态 Badge（无需发货 / 需向工厂下单）。卡片内部展示各仓库存分布（FBA 在库、FBM 在库、在途批次、工厂批次），每条都带数量和可售天数。",
      },
      {
        sub: "覆盖进度条",
        body: "卡片底部有一条进度条，展示「含在途综合覆盖天数」与「目标天数」的比值。绿色区间代表达标，红色区间代表不够——一目了然。",
      },
      {
        sub: "发货建议提示条",
        body: "如果覆盖率不足，红色提示条会显示：当前覆盖天数 vs 目标天数差距、建议发货数量、最晚发货日期、优先级标签。点击任意卡片可进入对应 SKU 详情页，查看更完整的数据再决定。",
        tips: ["发货目标天数默认 60 天，可在「参数中心 → 全局阈值」调整"],
      },
      {
        sub: "筛选与搜索",
        body: "支持按优先级（紧急/优先/常规/低优）筛选，也支持按 SKU 名或品名搜索。",
      },
    ],
  },
  {
    id: "risk",
    title: "风险中心",
    icon: "ri-error-warning-line",
    desc: "规则引擎自动识别全站异常，按类型（库存/利润/广告/评分/退货/Listing）和严重度（Critical/Warning/Info）分类展示。",
    tone: "warn",
    link: "/risk",
    linkLabel: "打开风险中心",
    sections: [
      {
        sub: "按类型筛选",
        body: "顶部 Tab 切换：全部、库存、利润、广告、评分、退货、Listing。每个 Tab 有数字角标——多少条异常一目了然。",
      },
      {
        sub: "按严重度过滤",
        body: "右上角下拉可以选择只看 Critical、Warning 或 Info 级别的告警。Critical 是必须立刻处理的，Warning 是需要关注的，Info 是提示性的。",
        tips: ["规则阈值（如利润率 < 多少触发告警）在「参数中心 → 全局阈值」修改"],
      },
    ],
  },
  {
    id: "operations",
    title: "运营中心 · 7 张分析视图",
    icon: "ri-line-chart-line",
    desc: "不是 Excel 平铺——只显示需要你处理的 SKU。7 个 Tab 分别对应 7 种运营场景，每个 Tab 只列出有异常的 SKU。",
    tone: "secondary",
    link: "/operations",
    linkLabel: "打开运营中心",
    sections: [
      {
        sub: "利润异常",
        body: "利润率低于设定阈值的 SKU。显示当前利润率、单件利润，按利润率从低到高排列。红色代表亏损，黄色代表利润偏低。",
      },
      {
        sub: "广告异常",
        body: "广告费比（ACOS/TACOS）超过设定阈值的 SKU。红色代表严重超标（>40%），黄色代表偏高。",
      },
      {
        sub: "评分下降",
        body: "评分低于 4.0 的 SKU。红色代表低于 3.5，需要紧急处理差评。",
      },
      {
        sub: "Review 增长",
        body: "评分在 3.5-4.5 之间的 SKU，提醒关注差评回复和 Review 增量。",
      },
      {
        sub: "退货率异常",
        body: "退货率超过设定阈值的 SKU。红色代表 >10%，提示分析退货原因。",
      },
      {
        sub: "Listing 待优化",
        body: "A+ 页面未完成的 SKU——提醒分配设计任务并完善 Listing。",
      },
      {
        sub: "新品成长",
        body: "上架天数在「新品期」（默认 90 天）内的 SKU，显示日销和月销，方便追踪新品表现。",
        tips: ["新品期天数在「参数中心 → 全局阈值 → 新品期」调整"],
      },
    ],
  },
  {
    id: "sku",
    title: "SKU 详情 · 单品全景",
    icon: "ri-price-tag-3-line",
    desc: "点击任意 SKU 进入全景视图——一个页面看全销量、库存、利润、成本、广告、促销、评分等所有数据维度。",
    tone: "primary",
    sections: [
      {
        sub: "SKU 列表页",
        body: "展示所有 SKU 的一行摘要：品名、店铺、生命周期、总库存、全部月销总和、近七天日均总销量、评分。支持按店铺、状态筛选和关键词搜索。点击任意行进入详情。每行左侧有复选框，支持勾选多个 MSKU 后批量删除（顶部出现红色操作栏），也可全选当前产品组内的所有 MSKU。",
      },
      {
        sub: "头部信息条",
        body: "SKU、MSKU、ASIN、UPC、店铺、站点、配送方式、链接类型、在售状态、生命周期、品类、A+ 状态、上架日期——全部以 Badge 形式排列，右上角可直接跳转 Amazon 产品页。",
      },
      {
        sub: "核心 KPI 区",
        body: "3 行 16 个指标：销量类（7天日均/30天累计/在库库存/在途库存/总库存/存销比）、覆盖类（综合覆盖天数/在库覆盖/含在途覆盖/LeadTime/安全库存）、评分广告类（评分/Review数/退货率/广告费比/广告花费/退款费）。",
      },
      {
        sub: "盈利分析 · 双栏对比（统一公式）",
        body: "左侧「正常售价」和右侧「折扣售价」并列展示。采用与利润测算统一的公式：总成本 = FOB + 头程 + 配送 + 佣金 + 仓储 + 广告 + 退货 + 优惠券。如果有促销活动，各费率按比例重算，折扣净利和利润率实时展示。",
      },
      {
        sub: "成本瀑布",
        body: "一条可视化进度条：售价 → 逐项扣减 FOB/头程/配送/佣金/仓租/广告/退货/优惠券 → 最终净利，红色/绿色一眼看出盈亏。",
      },
      {
        sub: "库存分析 & 趋势图",
        body: "7 个仓库格子（FBA/FBM/工厂/美东/美西/东南/中南）+ 8 个库存数据卡片。下方 3 张周趋势柱状图：周销量、周利润、利润率&费比。",
      },
      {
        sub: "基础数据 & Listing 状态",
        body: "3 列卡片完整展示产品信息、包裹参数（长宽高/单箱数/重量/LeadTime/安全库存天数）、Listing 状态（A+、高级A+、安装视频、透明计划、竞品链接）。",
      },
    ],
  },
  {
    id: "season",
    title: "旺季模拟",
    icon: "ri-calendar-event-line",
    desc: "模拟大促期间的备货需求。选择促销节点、调整销量倍率，系统自动重跑发货建议，告诉你哪些 SKU 需要提前备货、备多少。",
    tone: "accent",
    link: "/season",
    linkLabel: "打开旺季模拟",
    sections: [
      {
        sub: "预设大促节点",
        body: "Prime Day、Black Friday、Cyber Monday、Christmas——点击即可选择，每个节点有默认倍率（Prime Day ×3、BF ×2.5 等）。",
      },
      {
        sub: "手动调整倍率",
        body: "拖拽滑块可以自由调整销量倍率（1~5 倍），适合模拟自定促销活动或竞品价格战的影响。",
      },
      {
        sub: "备货清单",
        body: "底部表格列出所有需要备货的 SKU：原始日销 → 倍率后日销 → 目标天数 → 建议备货量 → 最晚发货日期 → 优先级。顶部 KPI 汇总：需备货 SKU 数、总备货量、预估 FOB 成本、紧急发货数。",
        tips: ["模拟结果不会修改实际数据——纯模拟，放心玩"],
      },
    ],
  },
  {
    id: "import",
    title: "数据导入",
    icon: "ri-file-excel-2-line",
    desc: "所有数据的入口。从 ERP（领星/船长/积加等）导出运营报表后，通过 8 个导入入口上传，每个都有模板下载和使用说明。",
    tone: "secondary",
    link: "/import",
    linkLabel: "打开数据导入",
    sections: [
      {
        sub: "8 个导入入口",
        body: "综合运营表（首次/全量 + MSKU 支持）、周销量、FBA 库存明细、FBM 库存明细、库存在途、产品成本（FOB）、头程更新（头程费+配送费）、SKU 标识符（ASIN/UPC/父体）。每个入口旁都有「下载模板」按钮，生成带列名和示例数据的 .xlsx 文件。",
      },
      {
        sub: "自动计算 & 智能合并",
        body: "综合运营表支持「覆盖导入」和「部分更新」两种模式，上传时弹窗选择。日销为空时自动取「七天」列 / 7；利润/利润率/总成本为空时从 FOB+头程+配送+佣金+仓储+广告+退货等组件反推——不需要在 Excel 里手动算。同日期 FBA+FBM+在途自动合并，周销量每次导入创建新快照，历史数据自动保留。",
        tips: ["覆盖导入：Excel 所有字段直接写入，空单元格会清空已有数据", "部分更新：仅更新有值的字段，空单元格不覆盖已有数据——适合只改部分参数"],
      },
      {
        sub: "GitHub 云端备份",
        body: "页面底部可以配置 GitHub Token，一键 Push 到云端或 Pull 恢复。换电脑时从 GitHub 拉取即可恢复全部数据。Token 只存在本地浏览器，不经过任何服务器。",
      },
    ],
  },
  {
    id: "settings",
    title: "参数中心",
    icon: "ri-settings-3-line",
    desc: "系统的配置后台——全局阈值、大促活动、促销管理、SKU 供应链参数。",
    tone: "secondary",
    link: "/settings",
    linkLabel: "打开参数中心",
    sections: [
      {
        sub: "全局阈值",
        body: "8 个参数控制全系统行为：默认 LeadTime（天）、安全库存天数、目标库存天数、利润率阈值、广告费比阈值、评分下降阈值、退货率阈值、新品期天数。修改后所有模块立即生效。",
      },
      {
        sub: "大促活动配置",
        body: "管理 Prime Day / BF / CM / Xmas 等大促的日期和倍率。启用的活动会自动加到发货建议和 Dashboard 的促销提醒中。",
      },
      {
        sub: "促销管理",
        body: "在「运营 → 促销管理」页面中手动添加 BD / LD / 7DD / Coupon 等促销活动。选择 SKU、类型、活动名称、日期、折扣价、倍率。Dashboard 会自动在开始前 2 天和到期前 2 天提醒。",
      },
      {
        sub: "SKU 供应链参数",
        body: "逐条修改每个 SKU 的品类、生命周期、LeadTime、安全库存、头程费、配送费和 FOB。修改后即时写入，自动保存。",
        tips: ["批量修改某几个 SKU 的 FOB 或头程——建议用「数据导入」的 Excel 方式更快"],
      },
    ],
  },
  {
    id: "profit",
    title: "新品利润测算",
    icon: "ri-calculator-line",
    desc: "新品上线前的利润模拟工具——多站点同时测算，费率可调，总成本公式驱动联动所有子项，一键写入 SKU 库。",
    tone: "accent",
    link: "/profit-estimate",
    linkLabel: "打开利润测算",
    sections: [
      {
        sub: "多站点 & 自定义品类",
        body: "顶部可切换站点（US/UK/DE/JP/CA/AU），每个站点独立设定售价、成本、佣金率、广告费比、退货率和配送方式（FBA/FBM），支持新增和删除站点。品类支持自定义——输入新品类名称点 + 即可保存，下次自动出现在下拉列表中。多站点时自动生成对比表格。",
      },
      {
        sub: "公式自动计算",
        body: "三大核心公式：佣金 = 售价 × 佣金率%、广告 = 售价 × 费比%、退货 = 售价 × 退货率%。费率值可手动修改，计算结果实时展示公式过程。",
      },
      {
        sub: "总成本联动",
        body: "总成本 = FOB + 头程 + 配送 + 佣金 + 仓储 + 广告 + 退货 + 优惠券。修改任意子项——售价、费率、成本——右侧净利润、净利率、保本售价全部实时重算。",
      },
      {
        sub: "成本结构可视化",
        body: "右侧展示当前站点测算结果：净利润、净利率（按 20%/10%/0 分色）、总成本、保本售价。成本结构条形图展示各子项占比。",
      },
      {
        sub: "一键写入 SKU 库",
        body: "点击「添加当前站点到 SKU 库」或「添加全部站点」，数据直接写入 SKU 主档表，佣金/广告/退货按公式计算结果存入，之后在 SKU 详情页就能看到完整的成本分解。",
        tips: ["写入后自动跳到 SKU 列表，可继续在详情页查看和编辑"],
      },
      {
        sub: "FBA vs FBM 仓储",
        body: "FBA 模式仓储费手动填（费用不固定）；FBM 模式下会提示海外仓仓储费并按包裹尺寸自动算出体积 m³ 方便对照。",
      },
    ],
  },
];

/* ────────── 每周操作清单 ────────── */
const WEEKLY_CHECKLIST = [
  {
    day: "周一上午",
    icon: "ri-calendar-check-line",
    items: [
      "依次导入：周销量 → FBA 库存明细 → FBM 库存明细 → 库存在途（每个点一次上传即可）",
      "打开 Dashboard 看环比变化和今日待处理事项",
      "打开发货决策中心，看哪些 SKU 需要下单",
    ],
  },
  {
    day: "每月初 / 头程变动时",
    icon: "ri-refresh-line",
    items: [
      "导入「产品成本（FOB）」或「头程更新」（如果数据有变化）",
      "检查「参数中心 → 全局阈值」是否需要调整（如目标库存天数）",
    ],
  },
  {
    day: "促销报名后",
    icon: "ri-flashlight-line",
    items: [
      "去「参数中心 → 促销管理」添加促销活动",
      "Dashboard 会自动在开始/到期前 2 天提醒，不用记日期",
      "旺季前用「旺季模拟」跑一遍备货清单，提前安排发货",
    ],
  },
  {
    day: "日常",
    icon: "ri-eye-line",
    items: [
      "Dashboard 看一眼：告警数字、促销提醒、发货建议 TOP 6",
      "风险中心：处理 Critical 级别告警",
      "运营中心：按异常类型逐步清理",
      "需要备份时：进入「数据导入」页面底部，点击「保存到 GitHub 云端」",
    ],
  },
];

/* ────────── 页面 ────────── */
export default function GuidePage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(GUIDE.map((g) => g.id)));

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const expandAll = () => setExpanded(new Set(GUIDE.map((g) => g.id)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="space-y-8">
      {/* ── 页头 ── */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          User Guide
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">使用指南</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-foreground-500">
          从零开始，了解 Amazon Ops OS 的每个模块怎么用、什么时候用、以及推荐的操作节奏。数据从 ERP 导入，系统自动分析——替代运营表，让数据更直观、备货更精准。
        </p>
      </div>

      {/* ── 系统速览 ── */}
      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-xl text-background-50">
                <i className="ri-rocket-2-line" aria-hidden />
              </div>
              <div>
                <div className="font-heading text-xl font-bold text-foreground-950">
                  Amazon Ops OS
                </div>
                <div className="text-[12px] text-foreground-500">
                  SSOT 运营管理系统 · 本地运行 · 数据 100% 私密
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <QuickStat icon="ri-dashboard-3-line" label="Dashboard" value="决策入口" />
            <QuickStat icon="ri-truck-line" label="发货决策" value="补货计算" />
            <QuickStat icon="ri-error-warning-line" label="风险中心" value="异常检测" />
            <QuickStat icon="ri-line-chart-line" label="运营中心" value="7 张视图" />
            <QuickStat icon="ri-price-tag-3-line" label="SKU 详情" value="单品全景" />
            <QuickStat icon="ri-calendar-event-line" label="旺季模拟" value="大促备货" />
            <QuickStat icon="ri-file-excel-2-line" label="数据导入" value="Excel 入口" />
            <QuickStat icon="ri-settings-3-line" label="参数中心" value="配置后台" />
          </div>
        </div>
      </div>

      {/* ── 模块详解 ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-[18px] font-bold text-foreground-950">
          模块详解
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-md px-3 py-1 text-[11px] font-medium text-foreground-600 hover:bg-background-200/60 hover:text-foreground-900 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-down-s-line mr-1" aria-hidden />
            全部展开
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-md px-3 py-1 text-[11px] font-medium text-foreground-600 hover:bg-background-200/60 hover:text-foreground-900 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-up-s-line mr-1" aria-hidden />
            全部折叠
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {GUIDE.map((block) => {
          const isOpen = expanded.has(block.id);
          return (
            <div
              key={block.id}
              className="rounded-xl border border-background-200/70 bg-background-50 overflow-hidden"
            >
              {/* 模块头部 */}
              <button
                type="button"
                onClick={() => toggle(block.id)}
                className="w-full flex items-start gap-4 p-5 text-left hover:bg-background-100/40 transition-colors cursor-pointer"
              >
                <div
                  className={[
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl",
                    block.tone === "primary" ? "bg-primary-100 text-primary-700" : "",
                    block.tone === "accent" ? "bg-accent-100 text-accent-700" : "",
                    block.tone === "secondary" ? "bg-secondary-100 text-secondary-800" : "",
                    block.tone === "warn" ? "bg-secondary-100 text-secondary-700" : "",
                  ].join(" ")}
                >
                  <i className={block.icon} aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-[16px] font-bold text-foreground-950">
                      {block.title}
                    </span>
                    <Badge tone={block.tone}>{isOpen ? "展开中" : "已折叠"}</Badge>
                  </div>
                  <div className="mt-1 text-[13px] text-foreground-600 leading-relaxed">
                    {block.desc}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {block.link && (
                    <Link
                      to={block.link}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                    >
                      {block.linkLabel ?? "前往"}
                      <i className="ri-arrow-right-line ml-1 text-[10px]" aria-hidden />
                    </Link>
                  )}
                  <i
                    className={[
                      "text-foreground-400 text-lg transition-transform",
                      isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line",
                    ].join(" ")}
                    aria-hidden
                  />
                </div>
              </button>

              {/* 展开内容 */}
              {isOpen && (
                <div className="border-t border-background-200/70 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {block.sections.map((sec, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-background-200/60 bg-background-100/50 p-4"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary-100 text-[10px] font-bold text-primary-700 mt-0.5">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-foreground-900">
                              {sec.sub}
                            </div>
                            <div className="mt-1 text-[12px] leading-relaxed text-foreground-600">
                              {sec.body}
                            </div>
                            {sec.tips && sec.tips.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {sec.tips.map((tip, ti) => (
                                  <div
                                    key={ti}
                                    className="flex items-start gap-1.5"
                                  >
                                    <i
                                      className="ri-lightbulb-line text-[12px] text-accent-600 mt-0.5 shrink-0"
                                      aria-hidden
                                    />
                                    <span className="text-[11px] text-accent-800">
                                      {tip}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 每周操作清单 ── */}
      <Section
        title="推荐操作节奏"
        subtitle="按这个节奏走，每天不超过 10 分钟"
        icon="ri-calendar-check-line"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {WEEKLY_CHECKLIST.map((item) => (
            <div
              key={item.day}
              className="flex flex-col rounded-xl border border-background-200/70 bg-background-50 p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <i className={item.icon} aria-hidden />
                </div>
                <div className="font-heading text-[15px] font-bold text-foreground-950">
                  {item.day}
                </div>
              </div>
              <ul className="space-y-2 flex-1">
                {item.items.map((task, ti) => (
                  <li key={ti} className="flex items-start gap-2 text-[12px] text-foreground-600 leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section
        title="常见问题"
        subtitle="FAQ"
        icon="ri-question-answer-line"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            {
              q: "数据存在哪里？安全吗？",
              a: "数据存在浏览器的 IndexedDB 中——完全本地，不上传到任何服务器。Token 也一样。换电脑时需要通过 GitHub 手动备份恢复。",
            },
            {
              q: "需要连接 Amazon API 吗？",
              a: "不需要。系统不连接 Amazon API。你的数据源头是 ERP（如领星、船长、积加等），从 ERP 导出报表后导入本系统。这种离线模式保证数据 100% 私密，不存在任何第三方服务器。",
            },
            {
              q: "这个系统和 ERP 是什么关系？",
              a: "ERP 负责数据录入和业务流程（采购、物流、财务等），本系统负责数据分析和运营决策。两者互补不替代——ERP 是数据来源，本系统是分析工具。每周从 ERP 导出一次数据导入本系统，就能在 Dashboard 看到直观的可视化分析和发货建议。",
            },
            {
              q: "同一天多次导入会覆盖还是重复？",
              a: "导入综合运营表时有弹窗让你选择：覆盖导入会把 Excel 所有字段（包括空值）写入，部分更新只更新有值的字段，空单元格不动原有数据。库存（FBA/FBM/在途）同日期会合并，不会重复。周销量每次导入创建新快照，旧数据保留——所以 Dashboard 能自动做环比。",
            },
            {
              q: "换电脑了怎么办？",
              a: "先在原电脑的「数据导入」页面底部点「保存到 GitHub 云端」，再到新电脑上配置 GitHub 点「从 GitHub 拉取」即可恢复。",
            },
            {
              q: "为什么运营中心有些视图是空的？",
              a: "运营中心只显示有异常的 SKU——如果某个视图（比如利润异常）是空的，说明当前所有 SKU 的利润率都在阈值之上，这是好事。",
            },
            {
              q: "发货建议的数量是怎么算的？",
              a: "目标库存天数 = LeadTime + 安全库存天数。系统用日均销量 × 目标天数 -（在库 + 在途）算出建议发货量。你可以在参数中心修改这些参数来适配不同 SKU 的实际情况。",
            },
          ].map((faq, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-background-200/70 bg-background-100/50 p-4"
            >
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[11px] font-bold text-accent-700 mt-0.5">
                  Q
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-foreground-900">
                    {faq.q}
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-foreground-600">
                    {faq.a}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 底部 ── */}
      <div className="rounded-xl border border-background-200/70 bg-background-100/60 p-5 text-center">
        <div className="text-[12px] text-foreground-500">
          Amazon Ops OS v2 · SSOT 运营管理系统 · 本地运行 · 数据 100% 私密
        </div>
      </div>
    </div>
  );
}

/* ────────── 速览小卡片 ────────── */
function QuickStat({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-100 text-foreground-600">
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[10px] font-medium text-foreground-500">{label}</div>
      <div className="text-[11px] font-semibold text-foreground-700">{value}</div>
    </div>
  );
}