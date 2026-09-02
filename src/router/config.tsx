import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { lazy, type ComponentType } from "react";
import NotFound from "@/pages/NotFound";
import AppShell from "@/components/layout/AppShell";

// 懒加载 + chunk 加载失败自动重试一次（部署更新后旧 chunk 失效时可自愈）
function lazyRetry(factory: () => Promise<{ default: ComponentType }>) {
  return lazy(() =>
    factory().catch(() => {
      return new Promise<{ default: ComponentType }>((resolve) => {
        window.setTimeout(() => resolve(factory()), 1200);
      });
    }),
  );
}

// P0/P1: 页面按需懒加载，避免 recharts / xlsx 等重型依赖被卷进首屏主包。
const Dashboard = lazyRetry(() => import("@/pages/dashboard/page"));
const Shipment = lazyRetry(() => import("@/pages/shipment/page"));
const Risk = lazyRetry(() => import("@/pages/risk/page"));
const Operations = lazyRetry(() => import("@/pages/operations/page"));
const SkuList = lazyRetry(() => import("@/pages/sku/page"));
const SkuDetail = lazyRetry(() => import("@/pages/sku/detail"));
const Season = lazyRetry(() => import("@/pages/season/page"));
const ImportPage = lazyRetry(() => import("@/pages/import/page"));
const Settings = lazyRetry(() => import("@/pages/settings/page"));
const GuidePage = lazyRetry(() => import("@/pages/guide/page"));
// 合并后的促销运营中心（替换原来的 PromotionsPage 和 PromoCostPage）
const PromoCenterPage = lazyRetry(() => import("@/pages/promo-center/page"));
const ProfitEstimate = lazyRetry(() => import("@/pages/profit-estimate/page"));
const CalculatorPage = lazyRetry(() => import("@/pages/calculator/page"));
const TodoPage = lazyRetry(() => import("@/pages/todo/page"));
const ShopManagementPage = lazyRetry(() => import("@/pages/shop-management/page"));
const OpsLogsPage = lazyRetry(() => import("@/pages/ops-logs/page"));
const DiagnosisPage = lazyRetry(() => import("@/pages/diagnosis/page"));
const DataHealthPage = lazyRetry(() => import("@/pages/data-health/page"));
const HistoryPage = lazyRetry(() => import("@/pages/history/page"));

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "shipment", element: <Shipment /> },
      { path: "risk", element: <Risk /> },
      { path: "operations", element: <Operations /> },
      { path: "sku", element: <SkuList /> },
      { path: "sku/:sku", element: <SkuDetail /> },
      { path: "season", element: <Season /> },
      { path: "import", element: <ImportPage /> },
      { path: "settings", element: <Settings /> },
      { path: "guide", element: <GuidePage /> },
      // ── 合并后的促销运营中心 ──
      { path: "promo-center", element: <PromoCenterPage /> },
      // 旧路由 301 重定向，确保书签和链接不失效
      { path: "promotions", element: <Navigate to="/promo-center?tab=activity" replace /> },
      { path: "promo-cost", element: <Navigate to="/promo-center?tab=cost" replace /> },
      { path: "profit-estimate", element: <ProfitEstimate /> },
      { path: "calculator", element: <CalculatorPage /> },
      { path: "todo", element: <TodoPage /> },
      { path: "ops-logs", element: <OpsLogsPage /> },
      { path: "diagnosis", element: <DiagnosisPage /> },
      { path: "data-health", element: <DataHealthPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "shop-management", element: <ShopManagementPage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
];

export default routes;
