import { describe, expect, it } from "vitest";
import { computeAlerts, snapKey } from "./engine";
import type { Alert, DailySnapshot, GlobalConfig, InventoryLayer, SkuMaster } from "./types";
import { ALERT_TYPE_LABELS } from "./types";

/** 最小可用配置：阈值取宽松值，确保除 traffic_drop 外不触发其他告警干扰断言 */
const config = {
  profitMarginThreshold: 10,
  adRatioThreshold: 50,
  ratingDropThreshold: 0.3,
  returnRateThreshold: 10,
  defaultLeadTime: 40,
  defaultSafetyStockDays: 30,
  defaultTargetCoverDays: 60,
} as unknown as GlobalConfig;

const sku = {
  sku: "TSKU-1",
  name: "测试品",
  store: "Test Store",
  siteId: "site_us",
  price: 39.99,
  costFob: 5,
  saleStatus: "active",
  fulfillment: "FBA",
} as unknown as SkuMaster;

const snap = (sessions?: number): DailySnapshot =>
  ({
    date: "2026-11-01",
    sku: "TSKU-1",
    siteId: "site_us",
    dailySales7d: 7,
    monthlySales: 210,
    adRatio: 0,
    rating: 0,
    reviewCount: 0,
    returnRate: 0,
    refundRate: 0,
    sessions,
    orders: 10,
  }) as unknown as DailySnapshot;

const prevSnap = (sessions?: number): DailySnapshot =>
  ({ ...snap(sessions), date: "2026-10-25" }) as unknown as DailySnapshot;

const inv = {
  sku: "TSKU-1",
  siteId: "site_us",
  fbaStock: 700,
  fbmStock: 0,
  warehouseBreakdown: [],
} as unknown as InventoryLayer;

const run = (curSessions?: number, prevSessions?: number): Alert[] => {
  const latestSnapshot = new Map([[snapKey("TSKU-1", "site_us"), snap(curSessions)]]);
  const previousSnapshot = new Map([[snapKey("TSKU-1", "site_us"), prevSnap(prevSessions)]]);
  return computeAlerts({
    skuMaster: [sku],
    latestSnapshot,
    latestInventory: new Map([[snapKey("TSKU-1", "site_us"), inv]]),
    previousSnapshot,
    config,
    today: "2026-11-01",
  });
};

const traffic = (alerts: Alert[]) => alerts.filter((a) => a.type === "traffic_drop");

describe("computeAlerts · 流量下滑告警（traffic_drop）", () => {
  it("Sessions 900 → 500（-44%）→ 触发 warning 告警，明细含两期数值", () => {
    const alerts = traffic(run(500, 900));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].title).toBe("流量下滑 · 44%");
    expect(alerts[0].detail).toBe("Sessions 900 → 500（周环比 -44%）");
    expect(alerts[0].metric).toBeCloseTo(-44.4, 1);
  });

  it("跌幅 ≥50% → 升级 critical", () => {
    const alerts = traffic(run(400, 900));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
  });

  it("跌幅 10%（低于 30% 阈值）→ 不告警", () => {
    expect(traffic(run(810, 900))).toHaveLength(0);
  });

  it("上期 <50 Sessions（小样本）→ 即使跌幅超阈值也不告警", () => {
    expect(traffic(run(10, 30))).toHaveLength(0);
  });

  it("本期或上期 Sessions 缺失 → 不告警（等价数据不足）", () => {
    expect(traffic(run(undefined, 900))).toHaveLength(0);
    expect(traffic(run(500, undefined))).toHaveLength(0);
  });

  it("无上期快照 → 不告警", () => {
    const alerts = computeAlerts({
      skuMaster: [sku],
      latestSnapshot: new Map([[snapKey("TSKU-1", "site_us"), snap(500)]]),
      latestInventory: new Map([[snapKey("TSKU-1", "site_us"), inv]]),
      config,
      today: "2026-11-01",
    });
    expect(traffic(alerts)).toHaveLength(0);
  });

  it("Sessions 上升 → 不告警", () => {
    expect(traffic(run(1200, 900))).toHaveLength(0);
  });
});

describe("computeAlerts · 退款率异常（主口径）", () => {
  const runRefund = (patch: Partial<DailySnapshot>): Alert[] => {
    const cur = { ...snap(), ...patch } as unknown as DailySnapshot;
    return computeAlerts({
      skuMaster: [sku],
      latestSnapshot: new Map([[snapKey("TSKU-1", "site_us"), cur]]),
      latestInventory: new Map([[snapKey("TSKU-1", "site_us"), inv]]),
      previousSnapshot: new Map([[snapKey("TSKU-1", "site_us"), prevSnap()]]),
      config,
      today: "2026-11-01",
    }).filter((a) => a.type === "return");
  };

  it("退款率 15% > 阈值 10% → warning，标题与 metric 用退款率", () => {
    const alerts = runRefund({ refundRate: 15, returnRate: 0 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].title).toBe("退款率高 · 15.0%");
    expect(alerts[0].metric).toBeCloseTo(15);
    expect(alerts[0].detail).toContain("退款率");
  });

  it("退款率 = 8%（未超阈值）→ 不告警", () => {
    expect(runRefund({ refundRate: 8 })).toHaveLength(0);
  });

  it("退款率 > 20% → 升级 critical", () => {
    const alerts = runRefund({ refundRate: 25 });
    expect(alerts[0].severity).toBe("critical");
  });

  it("退款率缺失而退货率 30% → 不告警（交给数据健康提示补数）", () => {
    expect(runRefund({ refundRate: undefined, returnRate: 30 })).toHaveLength(0);
  });

  it("告警类型文案统一为「退款异常」", () => {
    expect(ALERT_TYPE_LABELS.return).toBe("退款异常");
  });
});

describe("computeAlerts · 演示数据流量下滑案例边界", () => {
  // 演示库（seeded_v13）固定注入：sku004 今天 28、sku008 今天 65；
  // 昨天 Sessions 随机区间由历史生成器决定，这里用区间端点锁定严重度恒定
  const runSku = (sku: string, cur: number, prev: number): Alert[] => {
    const key = snapKey(sku, "site_demo");
    const mk = (sessions: number, date: string): DailySnapshot =>
      ({
        date, sku, siteId: "site_demo",
        dailySales7d: 5, monthlySales: 150, adRatio: 0, rating: 4.5,
        reviewCount: 100, returnRate: 0, sessions, orders: sessions * 0.085,
      }) as unknown as DailySnapshot;
    return computeAlerts({
      skuMaster: [{ sku, name: sku, store: "DEMO-STORE-US", siteId: "site_demo", price: 39.99, costFob: 5, saleStatus: "active", fulfillment: "FBA" }] as unknown as SkuMaster[],
      latestSnapshot: new Map([[key, mk(cur, "2026-11-01")]]),
      latestInventory: new Map(),
      previousSnapshot: new Map([[key, mk(prev, "2026-10-31")]]),
      config,
      today: "2026-11-01",
    }).filter((a) => a.type === "traffic_drop");
  };

  it("sku004（今天 28）：昨天最低 ~60 时仍为 critical（≥50%）", () => {
    const alerts = runSku("sku004", 28, 59.5);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
  });

  it("sku008（今天 65）：昨天最高 ~127 时仍为 warning（<50%）且 ≥30%", () => {
    const alerts = runSku("sku008", 65, 126.7);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
  });
});
