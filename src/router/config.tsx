import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { lazy } from "react";
import NotFound from "@/pages/NotFound";
import AppShell from "@/components/layout/AppShell";

// P0/P1: 页面按需懒加载，避免 recharts / xlsx 等重型依赖被卷进首屏主包。
const Dashboard = lazy(() => import("@/pages/dashboard/page"));
const Shipment = lazy(() => import("@/pages/shipment/page"));
const Risk = lazy(() => import("@/pages/risk/page"));
const Operations = lazy(() => import("@/pages/operations/page"));
const SkuList = lazy(() => import("@/pages/sku/page"));
const SkuDetail = lazy(() => import("@/pages/sku/detail"));
const Season = lazy(() => import("@/pages/season/page"));
const ImportPage = lazy(() => import("@/pages/import/page"));
const Settings = lazy(() => import("@/pages/settings/page"));
const GuidePage = lazy(() => import("@/pages/guide/page"));
// 合并后的促销运营中心（替换原来的 PromotionsPage 和 PromoCostPage）
const PromoCenterPage = lazy(() => import("@/pages/promo-center/page"));
const ProfitEstimate = lazy(() => import("@/pages/profit-estimate/page"));
const CalculatorPage = lazy(() => import("@/pages/calculator/page"));
const TodoPage = lazy(() => import("@/pages/todo/page"));
const ShopManagementPage = lazy(() => import("@/pages/shop-management/page"));
const OpsLogsPage = lazy(() => import("@/pages/ops-logs/page"));
const DiagnosisPage = lazy(() => import("@/pages/diagnosis/page"));
const DataHealthPage = lazy(() => import("@/pages/data-health/page"));
const HistoryPage = lazy(() => import("@/pages/history/page"));

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
