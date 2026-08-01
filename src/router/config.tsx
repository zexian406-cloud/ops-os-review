import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import AppShell from "@/components/layout/AppShell";

// P0/P1: 页面按需懒加载，避免 recharts / xlsx 等重型依赖被卷进首屏主包。
// `lazy` 由 unplugin-auto-import 自动注入，无需显式 import。
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
const PromotionsPage = lazy(() => import("@/pages/promotions/page"));
const PromoCostPage = lazy(() => import("@/pages/promo-cost/page"));
const ProfitEstimate = lazy(() => import("@/pages/profit-estimate/page"));
const CalculatorPage = lazy(() => import("@/pages/calculator/page"));
const TodoPage = lazy(() => import("@/pages/todo/page"));
const ShopManagementPage = lazy(() => import("@/pages/shop-management/page"));
const OpsLogsPage = lazy(() => import("@/pages/ops-logs/page"));

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
      { path: "promotions", element: <PromotionsPage /> },
      { path: "promo-cost", element: <PromoCostPage /> },
      { path: "profit-estimate", element: <ProfitEstimate /> },
      { path: "calculator", element: <CalculatorPage /> },
      { path: "todo", element: <TodoPage /> },
      { path: "ops-logs", element: <OpsLogsPage /> },
      { path: "shop-management", element: <ShopManagementPage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
];

export default routes;