// =========================================================
// Listing 流量/转化分流判定单元测试（listingVerdict.ts）
// 覆盖：Sessions 跌/CVR 稳 → visibility；两者都跌 → both；
//       数据缺失/非法 → insufficient；2% 容忍度边界；快照提取与告警注入
// =========================================================
import { describe, expect, it } from "vitest";
import {
  attachListingVerdicts,
  computeCvr,
  computeListingVerdict,
  extractListingInput,
  getVerdictText,
} from "./listingVerdict";
import { snapKey } from "./engine";
import type { Alert, DailySnapshot } from "./types";

describe("computeCvr", () => {
  it("正常计算：25 / 1000 → 2.5%", () => {
    expect(computeCvr(25, 1000)).toBeCloseTo(2.5);
  });

  it("Sessions 为 0 / 负数 / 缺失 → NaN", () => {
    expect(computeCvr(25, 0)).toBeNaN();
    expect(computeCvr(25, -10)).toBeNaN();
    expect(computeCvr(25, undefined)).toBeNaN();
  });

  it("订单缺失或为 0 → NaN", () => {
    expect(computeCvr(undefined, 1000)).toBeNaN();
    expect(computeCvr(0, 1000)).toBeNaN();
  });
});

describe("computeListingVerdict · 四象限", () => {
  it("Sessions 跌、CVR 稳 → visibility（流量端）", () => {
    // Sessions -30%，CVR 持平
    expect(computeListingVerdict(700, 1000, 2.5, 2.5)).toBe("visibility");
  });

  it("Sessions 跌、CVR 升 → visibility（转化率回升不能抵消流量问题）", () => {
    expect(computeListingVerdict(700, 1000, 3.0, 2.5)).toBe("visibility");
  });

  it("Sessions 稳、CVR 跌 → detail_page（详情页转化端）", () => {
    // Sessions 持平，CVR 2.5% → 1.5%
    expect(computeListingVerdict(1000, 1000, 1.5, 2.5)).toBe("detail_page");
  });

  it("Sessions 升、CVR 跌 → detail_page（流量补不回转化）", () => {
    expect(computeListingVerdict(1200, 1000, 1.5, 2.5)).toBe("detail_page");
  });

  it("两者都跌 → both（需排除下架/类目下滑）", () => {
    expect(computeListingVerdict(600, 1000, 1.5, 2.5)).toBe("both");
  });

  it("两者都稳 → none", () => {
    expect(computeListingVerdict(1010, 1000, 2.5, 2.5)).toBe("none");
  });

  it("两者都升 → none", () => {
    expect(computeListingVerdict(1200, 1000, 3.0, 2.5)).toBe("none");
  });
});

describe("computeListingVerdict · 2% 容忍度边界", () => {
  it("Sessions 恰好 -2% → 稳（不判跌）；CVR 稳 → none", () => {
    expect(computeListingVerdict(980, 1000, 2.5, 2.5)).toBe("none");
  });

  it("Sessions -2.1% → 跌；CVR 稳 → visibility", () => {
    expect(computeListingVerdict(979, 1000, 2.5, 2.5)).toBe("visibility");
  });

  it("CVR 恰好 -2% → 稳：Sessions 跌时仍判 visibility 而非 both", () => {
    // CVR 2.5 → 2.45 = -2.0%，落在容忍带内
    expect(computeListingVerdict(700, 1000, 2.45, 2.5)).toBe("visibility");
  });

  it("CVR -2.1% → 跌：Sessions 稳时判 detail_page", () => {
    expect(computeListingVerdict(1000, 1000, 2.44, 2.5)).toBe("detail_page");
  });

  it("Sessions -2.1% 且 CVR -2.1% → both", () => {
    expect(computeListingVerdict(979, 1000, 2.44, 2.5)).toBe("both");
  });
});

describe("computeListingVerdict · 数据缺失/非法 → insufficient", () => {
  it("Sessions 缺失", () => {
    expect(computeListingVerdict(undefined, 1000, 2.5, 2.5)).toBe("insufficient");
    expect(computeListingVerdict(700, undefined, 2.5, 2.5)).toBe("insufficient");
  });

  it("CVR 缺失", () => {
    expect(computeListingVerdict(700, 1000, undefined, 2.5)).toBe("insufficient");
    expect(computeListingVerdict(700, 1000, 2.5, undefined)).toBe("insufficient");
  });

  it("全部缺失 → insufficient（绝不硬造结论）", () => {
    expect(computeListingVerdict(undefined, undefined, undefined, undefined)).toBe("insufficient");
  });

  it("上期 Sessions 为 0 → 相对变化无法计算 → insufficient", () => {
    expect(computeListingVerdict(700, 0, 2.5, 2.5)).toBe("insufficient");
  });

  it("本期 Sessions 为 0 → 合法数据，按 -100% 极端下跌处理（如下架）→ visibility", () => {
    // relPct 只对「上期为 0」返回 NaN；本期归零是真实观测（跌没），不是数据缺失
    expect(computeListingVerdict(0, 1000, 2.5, 2.5)).toBe("visibility");
  });

  it("NaN 输入 → insufficient", () => {
    expect(computeListingVerdict(NaN, 1000, 2.5, 2.5)).toBe("insufficient");
    expect(computeListingVerdict(700, 1000, NaN, 2.5)).toBe("insufficient");
  });
});

describe("getVerdictText · 中文文案", () => {
  it("五种结论各有文案", () => {
    expect(getVerdictText("visibility")).toBe("流量端异常");
    expect(getVerdictText("detail_page")).toBe("转化端异常");
    expect(getVerdictText("both")).toBe("流量+转化双重异常");
    expect(getVerdictText("none")).toBe("未见分流异常");
    expect(getVerdictText("insufficient")).toBe("数据不足");
  });
});

/** 构造快照：sessions/orders 可选，其余字段给安全默认值 */
const mkSnap = (over: Partial<DailySnapshot>): DailySnapshot =>
  ({
    date: "2026-11-01", sku: "sku004", siteId: "site_us",
    dailySales7d: 5, monthlySales: 150, adRatio: 0, rating: 4.5,
    reviewCount: 100, returnRate: 0,
    ...over,
  }) as DailySnapshot;

describe("extractListingInput · 两期快照提取", () => {
  it("正常提取：sessions 直取，CVR 由 orders/sessions 派生", () => {
    const input = extractListingInput(
      mkSnap({ sessions: 700, orders: 17.5 }),
      mkSnap({ date: "2026-10-31", sessions: 1000, orders: 25 }),
    );
    expect(input.sessionsCurrent).toBe(700);
    expect(input.sessionsPrevious).toBe(1000);
    expect(input.cvrCurrent).toBeCloseTo(2.5);
    expect(input.cvrPrevious).toBeCloseTo(2.5);
    // 联动判定：Sessions 跌、CVR 稳 → visibility
    expect(computeListingVerdict(input.sessionsCurrent, input.sessionsPrevious, input.cvrCurrent, input.cvrPrevious)).toBe("visibility");
  });

  it("任一期快照缺失 → 空对象（verdict 判 insufficient）", () => {
    expect(extractListingInput(undefined, mkSnap({}))).toEqual({});
    expect(extractListingInput(mkSnap({}), undefined)).toEqual({});
  });

  it("Sessions 为 0 的行 → CVR NaN → undefined → insufficient", () => {
    const input = extractListingInput(
      mkSnap({ sessions: 0, orders: 25 }),
      mkSnap({ date: "2026-10-31", sessions: 1000, orders: 25 }),
    );
    expect(input.cvrCurrent).toBeUndefined();
    expect(computeListingVerdict(input.sessionsCurrent, input.sessionsPrevious, input.cvrCurrent, input.cvrPrevious)).toBe("insufficient");
  });

  it("稀疏快照（上期只填 Sessions/订单量，销量为 0）也能提取流量四元组", () => {
    // 极简运营数据表把 Sessions(上期)/订单量(上期) 写到 7 天前的稀疏行
    const input = extractListingInput(
      mkSnap({ sessions: 300, orders: 7.5 }),
      mkSnap({ date: "2026-10-25", dailySales7d: 0, monthlySales: 0, sessions: 770, orders: 19.25 }),
    );
    expect(input.sessionsPrevious).toBe(770);
    expect(input.cvrPrevious).toBeCloseTo(2.5);
    // Sessions -61%、CVR 稳 → visibility
    expect(computeListingVerdict(input.sessionsCurrent, input.sessionsPrevious, input.cvrCurrent, input.cvrPrevious)).toBe("visibility");
  });
});

describe("attachListingVerdicts · 告警注入", () => {
  const latest = new Map([
    [snapKey("sku004", "site_us"), mkSnap({ sessions: 300, orders: 7.5 })],
    [snapKey("sku008", "site_us"), mkSnap({ sku: "sku008", sessions: 1000, orders: 25 })],
  ]);
  const previous = new Map([
    [snapKey("sku004", "site_us"), mkSnap({ date: "2026-10-31", sessions: 770, orders: 19.25 })],
    [snapKey("sku008", "site_us"), mkSnap({ date: "2026-10-31", sku: "sku008", sessions: 1000, orders: 45 })],
  ]);
  const mkAlert = (over: Partial<Alert>): Alert =>
    ({
      id: "a1", date: "2026-11-01", sku: "sku004", type: "traffic_drop",
      severity: "critical", title: "流量下滑", detail: "", status: "open",
      ...over,
    }) as Alert;

  it("注入分流结论与四元组（引擎告警无 siteId 时用 fallbackSiteId 匹配）", () => {
    const [out] = attachListingVerdicts([mkAlert({})], latest, previous, "site_us");
    expect(out.listingVerdict).toBe("visibility"); // Sessions 770→300 跌、CVR 持平
    expect(out.sessionsCurrent).toBe(300);
    expect(out.sessionsPrevious).toBe(770);
    expect(out.cvrCurrent).toBeCloseTo(2.5);
    expect(out.cvrPrevious).toBeCloseTo(2.5);
  });

  it("CVR 跌且 Sessions 稳 → 注入 detail_page", () => {
    const [out] = attachListingVerdicts([mkAlert({ sku: "sku008" })], latest, previous, "site_us");
    expect(out.listingVerdict).toBe("detail_page"); // Sessions 持平、CVR 4.5→2.5
  });

  it("快照无流量数据 → 告警原样返回（不注入标签）", () => {
    const bare = new Map([[snapKey("sku999", "site_us"), mkSnap({ sku: "sku999" })]]);
    const prevBare = new Map([[snapKey("sku999", "site_us"), mkSnap({ sku: "sku999", date: "2026-10-31" })]]);
    const [out] = attachListingVerdicts([mkAlert({ sku: "sku999" })], bare, prevBare, "site_us");
    expect(out.listingVerdict).toBeUndefined();
    expect(out.sessionsCurrent).toBeUndefined();
  });

  it("任一期快照整体缺失 → 不注入任何标签（UI 等价 insufficient 不显示）", () => {
    const [out] = attachListingVerdicts([mkAlert({})], latest, new Map(), "site_us");
    expect(out.listingVerdict).toBeUndefined();
    expect(out.sessionsCurrent).toBeUndefined();
    expect(out.cvrCurrent).toBeUndefined();
  });

  it("告警自带 siteId 时优先用自身 siteId 匹配快照", () => {
    const other = new Map([
      [snapKey("sku004", "site_uk"), mkSnap({ sessions: 500, orders: 12.5 })],
    ]);
    const otherPrev = new Map([
      [snapKey("sku004", "site_uk"), mkSnap({ date: "2026-10-31", sessions: 500, orders: 12.5 })],
    ]);
    const [out] = attachListingVerdicts([mkAlert({ siteId: "site_uk" })], other, otherPrev, "site_us");
    expect(out.listingVerdict).toBe("none"); // 两期完全持平
  });
});
