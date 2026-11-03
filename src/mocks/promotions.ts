import type { Promotion } from "@/domain/types";

/**
 * 演示促销活动 — 日期随 today 滚动，保证月度复盘「促销 ROI」板块始终有已结束活动可算：
 *   promo-001 sku001 BD 7天（已结束·金额成本）→ ROI 为正
 *   promo-002 sku004 LD 1天（已结束·金额成本，成本高于毛贡献）→ ROI 为负（标红）
 *   promo-005 sku011 BD 7天（已结束·折扣率成本）→ 第三种成本口径
 *   promo-003 进行中 / promo-004、006 未开始 → 不进 ROI，仅促销中心展示
 */
export function buildMockPromotions(today: string): Promotion[] {
  const off = (n: number): string => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  };
  return [
    {
      id: "promo-001",
      sku: "sku001",
      skuName: "演示产品001",
      store: "DEMO-STORE-US",
      siteId: "site_demo",
      type: "BD",
      name: "BD 7天秒杀",
      startDate: off(-16),
      endDate: off(-10),
      status: "ended",
      multiplier: 2.5,
      discountPrice: 22.99,
      costMode: "amount",
      amount: 150,
      notes: "报名成功，注意库存",
    },
    {
      id: "promo-002",
      sku: "sku004",
      skuName: "演示产品004",
      store: "DEMO-STORE-US",
      siteId: "site_demo",
      type: "LD",
      name: "Lightning Deal 单日",
      startDate: off(-24),
      endDate: off(-24),
      status: "ended",
      multiplier: 4.0,
      discountPrice: 33.99,
      costMode: "amount",
      amount: 80,
      notes: "4 小时闪电 Deal，提前调广告预算",
    },
    {
      id: "promo-005",
      sku: "sku011",
      skuName: "演示产品011",
      store: "DEMO-STORE-US",
      siteId: "site_demo",
      type: "BD",
      name: "BD 周末专场",
      startDate: off(-14),
      endDate: off(-8),
      status: "ended",
      multiplier: 2.5,
      discountPrice: 69.99,
      costMode: "rate",
      rate: 15,
      notes: "按销售额 15% 计促销成本，注意及时补货",
    },
    {
      id: "promo-003",
      sku: "sku003",
      skuName: "演示产品003",
      store: "DEMO-STORE-US",
      siteId: "site_demo",
      type: "Coupon",
      name: "10% Coupon 秋季",
      startDate: off(-5),
      endDate: off(25),
      status: "active",
      multiplier: 1.3,
      discountPrice: 26.99,
      notes: "Coupon 已生效",
    },
    {
      id: "promo-004",
      sku: "sku008",
      skuName: "演示产品007 (SHOP2)",
      store: "DEMO-STORE2-US",
      siteId: "site_demo",
      type: "Promotion",
      name: "7-Day Deal 下月",
      startDate: off(10),
      endDate: off(17),
      status: "upcoming",
      multiplier: 2.0,
      discountPrice: 75.99,
    },
    {
      id: "promo-006",
      sku: "sku009",
      skuName: "演示产品007 (SHOP2-B)",
      store: "DEMO-STORE2-US",
      siteId: "site_demo",
      type: "BD",
      name: "BD Week",
      startDate: off(3),
      endDate: off(10),
      status: "upcoming",
      multiplier: 2.0,
      discountPrice: 79.99,
    },
  ];
}
