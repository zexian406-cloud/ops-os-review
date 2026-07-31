import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/pages/dashboard/page";
import Shipment from "@/pages/shipment/page";
import Risk from "@/pages/risk/page";
import Operations from "@/pages/operations/page";
import SkuList from "@/pages/sku/page";
import SkuDetail from "@/pages/sku/detail";
import Season from "@/pages/season/page";
import ImportPage from "@/pages/import/page";
import Settings from "@/pages/settings/page";
import GuidePage from "@/pages/guide/page";
import PromotionsPage from "@/pages/promotions/page";
import PromoCostPage from "@/pages/promo-cost/page";
import ProfitEstimate from "@/pages/profit-estimate/page";
import CalculatorPage from "@/pages/calculator/page";
import TodoPage from "@/pages/todo/page";
import ShopManagementPage from "@/pages/shop-management/page";

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
      { path: "shop-management", element: <ShopManagementPage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
];

export default routes;