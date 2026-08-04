import { useState, useRef } from "react";
import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  sub?: string;
  icon: string;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "决策",
    items: [
      { to: "/", label: "运营一览", sub: "今日第一眼", icon: "ri-dashboard-3-line" },
      { to: "/diagnosis", label: "异常诊断", sub: "原因拆解", icon: "ri-search-eye-line" },
      { to: "/history", label: "历史对比", sub: "本周 vs 上周", icon: "ri-exchange-line" },
      { to: "/data-health", label: "数据健康", sub: "导入质量检查", icon: "ri-heart-pulse-line" },
      { to: "/shipment", label: "发货决策", sub: "自动补货建议", icon: "ri-truck-line" },
      { to: "/risk", label: "风险中心", sub: "全站异常", icon: "ri-error-warning-line" },
    ],
  },
  {
    title: "运营",
    items: [
      { to: "/operations", label: "运营中心", sub: "6 张运营视图", icon: "ri-line-chart-line" },
      { to: "/sku", label: "SKU 详情", sub: "单品全景", icon: "ri-price-tag-3-line" },
      { to: "/season", label: "旺季模拟", sub: "Prime / BF / Xmas", icon: "ri-calendar-event-line" },
      { to: "/promo-center", label: "促销运营中心", sub: "活动·成本·时间线", icon: "ri-flashlight-line" },
      { to: "/calculator", label: "新品测算", sub: "成本利润预估", icon: "ri-calculator-line" },
    ],
  },
  {
    title: "工具",
    items: [
      { to: "/todo", label: "我的待办", sub: "轻量任务记录", icon: "ri-list-check-3" },
      { to: "/ops-logs", label: "操作记录", sub: "运营操作日志", icon: "ri-history-line" },
    ],
  },
  {
    title: "数据",
    items: [
      { to: "/import", label: "数据导入", sub: "Excel & 云端", icon: "ri-file-excel-2-line" },
      { to: "/shop-management", label: "店铺管理", sub: "新增/编辑/删除", icon: "ri-store-2-line" },
      { to: "/settings", label: "参数中心", sub: "供应链 / 活动", icon: "ri-settings-3-line" },
    ],
  },
  {
    title: "帮助",
    items: [
      { to: "/guide", label: "使用指南", sub: "完整操作手册", icon: "ri-book-open-line" },
    ],
  },
];

export default function Sidebar({
  collapsed,
  onToggle,
  mobile,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const effectiveExpanded = !collapsed || (collapsed && hovered);
  const sidebarWidth = effectiveExpanded ? "w-[240px]" : "w-[60px]";

  const handleClick = () => {
    if (mobile && onClose) onClose();
  };

  const asideCls = mobile
    ? "z-50 bg-[#0f0f1a]/95 backdrop-blur-3xl shadow-2xl"
    : "bg-sidebar text-sidebar-fg border-r border-sidebar-border";

  return (
    <aside
      ref={sidebarRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`${asideCls} ${sidebarWidth} h-full shrink-0 flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] flex overflow-hidden`}
    >
      {/* Logo 区域 */}
      <div className="flex items-center gap-3 px-5 pb-4 pt-6 min-h-0 shrink-0 overflow-hidden">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
          <i className="ri-rocket-2-line text-sm" aria-hidden />
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${
            effectiveExpanded ? "max-w-[160px] opacity-100" : "max-w-0 opacity-0"
          }`}
        >
          <div className="font-heading text-[14px] font-semibold leading-tight text-sidebar-accent-fg tracking-tight whitespace-nowrap">
            Amazon Ops
          </div>
          <div className="mt-0.5 text-[10px] font-medium tracking-[0.14em] text-sidebar-fg/40 uppercase whitespace-nowrap">
            Operation System
          </div>
        </div>
        {mobile && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            aria-label="关闭菜单"
          >
            <i className="ri-close-line text-lg text-sidebar-fg/60" aria-hidden />
          </button>
        )}
      </div>

      {/* Nav 导航区域 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 min-h-0">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <div
              className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-fg/35 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${
                effectiveExpanded ? "max-h-6 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      [
                        "group flex items-center rounded-[10px] text-[13px] font-medium transition-all duration-200 cursor-pointer",
                        effectiveExpanded
                          ? "gap-3 px-3 py-2 hover:bg-sidebar-accent"
                          : "justify-center py-2 hover:bg-sidebar-accent",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-fg font-semibold"
                          : "text-sidebar-fg/65",
                      ].join(" ")
                    }
                    onClick={handleClick}
                    title={!effectiveExpanded ? item.label : undefined}
                  >
                    {({ isActive }) => effectiveExpanded ? (
                      <>
                        <span
                          className={[
                            "flex shrink-0 items-center justify-center rounded-[8px] transition-all h-7 w-7 text-[16px]",
                            isActive
                              ? "bg-indigo-500/15 text-indigo-400"
                              : "text-sidebar-fg/35 group-hover:text-sidebar-fg/60",
                          ].join(" ")}
                        >
                          <i className={item.icon} aria-hidden />
                        </span>
                        <span className="flex flex-col leading-tight overflow-hidden max-w-[160px] opacity-100 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]">
                          <span className="whitespace-nowrap">{item.label}</span>
                          {item.sub && (
                            <span
                              className={[
                                "text-[10px] font-normal whitespace-nowrap",
                                isActive
                                  ? "text-indigo-400/50"
                                  : "text-sidebar-fg/30",
                              ].join(" ")}
                            >
                              {item.sub}
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <span
                        className={[
                          "flex shrink-0 items-center justify-center rounded-[8px] h-8 w-8 text-[18px]",
                          isActive
                            ? "bg-indigo-500/15 text-indigo-400"
                            : "text-sidebar-fg/35 group-hover:text-sidebar-fg/60",
                        ].join(" ")}
                      >
                        <i className={item.icon} aria-hidden />
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* 底部区域 */}
      <div className="border-t border-sidebar-border shrink-0">
        <button
          type="button"
          onClick={onToggle}
          className={`flex w-full items-center text-[12px] text-sidebar-fg/40 hover:text-sidebar-fg/60 hover:bg-sidebar-accent transition-all duration-200 cursor-pointer ${
            effectiveExpanded ? "gap-3 px-3 py-3" : "justify-center py-3"
          }`}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
        >
          {effectiveExpanded ? (
            <>
              <span className="flex shrink-0 items-center justify-center rounded-[8px] bg-sidebar-accent text-sidebar-fg/40 h-7 w-7 text-[16px]">
                <i className={`ri-sidebar-${collapsed ? "unfold" : "fold"}-line`} aria-hidden />
              </span>
              <span className="overflow-hidden max-w-[160px] opacity-100 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]">
                <span className="whitespace-nowrap">{collapsed ? "展开侧边栏" : "折叠侧边栏"}</span>
              </span>
            </>
          ) : (
            <span className="flex shrink-0 items-center justify-center rounded-[8px] bg-sidebar-accent text-sidebar-fg/40 h-8 w-8 text-[18px]">
              <i className={`ri-sidebar-${collapsed ? "unfold" : "fold"}-line`} aria-hidden />
            </span>
          )}
        </button>

        <div className={`px-5 pb-4 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${
          effectiveExpanded ? "max-h-16 opacity-100" : "max-h-0 opacity-0"
        }`}>
          <div className="flex items-center gap-2 text-[11px] text-sidebar-fg/40">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="whitespace-nowrap">本地存储运行中</span>
          </div>
          <div className="mt-1 text-[10px] text-sidebar-fg/30 whitespace-nowrap">
            Amazon Ops OS · v2
          </div>
        </div>
      </div>
    </aside>
  );
}
