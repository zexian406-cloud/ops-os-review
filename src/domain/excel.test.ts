import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseOperationExcel } from "./excel";
import type { SkuMaster } from "./types";

/** 在内存中构造多 Sheet 工作簿并序列化为 ArrayBuffer（不依赖外部 fixture 文件） */
const buildXlsx = (sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]): ArrayBuffer => {
  const wb = XLSX.utils.book_new();
  for (const { name, headers, rows } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
};

const FIXED_DATE = "2026-11-01";

describe("parseOperationExcel · 极简三表合一", () => {
  const buf = buildXlsx([
    {
      name: "基础档案",
      headers: ["SKU", "MSKU", "ASIN", "店铺", "售价", "FOB", "头程费", "配送费", "包裹长cm", "包裹宽cm", "包裹高cm", "包裹重kg", "工厂名"],
      rows: [["BFRS258", "BFRS258-GM", "B0TEST00001", "Test Store", 39.99, 28.5, 12.3, 4.56, 30, 25, 20, 1.2, "东莞美联"]],
    },
    {
      name: "库存物流",
      headers: ["SKU", "FBA在库", "FBM库存", "在途件数", "目的仓", "预计到仓"],
      rows: [["BFRS258", 186, 180, 80, "美西", "2026-08-05"]],
    },
    {
      name: "运营数据",
      headers: ["SKU", "MSKU", "7天销量", "30天销量", "Sessions(近7天)", "订单量(近7天)", "Sessions(上期)", "订单量(上期)", "CVR%(可选)", "评分", "评论数", "广告花费", "退货率"],
      rows: [["", "BFRS258-GM", 24, 102, 1200, 24, 1350, 30, "", 4.2, 156, 45.6, 3.2]],
    },
  ]);
  const r = parseOperationExcel(buf, FIXED_DATE);

  it("基础档案表 → SkuMaster（价格/成本/工厂名/MSKU）", () => {
    expect(r.missingCritical).toEqual([]);
    const m = r.skuMaster.find((s) => s.sku === "BFRS258");
    expect(m).toBeTruthy();
    expect(m!.price).toBeCloseTo(39.99);
    expect(m!.costFob).toBeCloseTo(28.5);
    expect(m!.costShipping).toBeCloseTo(12.3); // 头程费
    expect(m!.costDelivery).toBeCloseTo(4.56); // 配送费
    expect(m!.factoryName).toBe("东莞美联");
    expect(m!.msku).toContain("BFRS258-GM");
    expect(m!.asin).toBe("B0TEST00001");
  });

  it("库存物流表 → 库存层（FBA/FBM/在途）", () => {
    const layer = r.inventoryLayer.find((l) => l.sku === "BFRS258");
    expect(layer).toBeTruthy();
    expect(layer!.fbaStock).toBe(186);
    expect(layer!.fbmStock).toBe(180);
    expect(layer!.transitBatches?.[0]).toMatchObject({ qty: 80, warehouse: "美西", etaDate: "2026-08-05", status: "in_transit" });
  });

  it("运营数据表（仅 MSKU）→ 反查聚合为本期快照，日均 = 7天销量/7", () => {
    const cur = r.dailySnapshot.find((s) => s.sku === "BFRS258" && s.date === FIXED_DATE && s.dailySales7d > 0);
    expect(cur).toBeTruthy();
    expect(cur!.dailySales7d).toBeCloseTo(24 / 7, 2);
    expect(cur!.sessions).toBe(1200);
    expect(cur!.orders).toBe(24);
    expect(cur!.monthlySales).toBe(102); // 30天销量：周期总量存 monthlySales
  });

  it("自动计算：毛利率/总成本（佣金按 15% 估）与广告花费折算费比", () => {
    const cur = r.dailySnapshot.find((s) => s.sku === "BFRS258" && s.date === FIXED_DATE && s.dailySales7d > 0)!;
    const expectedCost = 39.99 * 0.15 + 28.5 + 12.3 + 4.56;
    expect(cur.totalCost).toBeCloseTo(expectedCost, 1);
    expect(cur.profitMargin).toBeCloseTo(((39.99 - expectedCost) / 39.99) * 100, 1); // 百分数口径
    expect(cur.profitSource).toBe("ESTIMATED");
    // 广告花费 45.6 → 费比 = 45.6 / (24 × 39.99) × 100 ≈ 4.74
    expect(cur.adRatio).toBeGreaterThan(4);
    expect(cur.adRatio).toBeLessThan(5);
  });

  it("上期 Sessions/订单量 → 写入 today-7 稀疏快照（销量字段为 0）", () => {
    const prev = r.dailySnapshot.find((s) => s.sku === "BFRS258" && s.date === "2026-10-25");
    expect(prev).toBeTruthy();
    expect(prev!.dailySales7d).toBe(0); // 稀疏行：销量为 0，诊断均值会跳过
    expect(prev!.sessions).toBe(1350);
    expect(prev!.orders).toBe(30);
  });

  it("广告费比列（旧表头）命中时直接采用，不被花费列误判", () => {
    const buf2 = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "广告费比"],
        rows: [["RATIO-SKU", 7, 12.5]],
      },
    ]);
    const r2 = parseOperationExcel(buf2, FIXED_DATE);
    const cur = r2.dailySnapshot.find((s) => s.sku === "RATIO-SKU")!;
    expect(cur.adRatio).toBeCloseTo(12.5);
  });
});

describe("parseOperationExcel · MSKU 建档与自动关联", () => {
  const opsOnly = buildXlsx([
    {
      name: "运营数据",
      headers: ["MSKU", "7天销量", "30天销量", "Sessions(近7天)", "订单量(近7天)", "Sessions(上期)", "订单量(上期)", "评分", "评论数", "广告花费", "退货率"],
      rows: [["NEWMSKU-01", 7, 35, 700, 7, 770, 10, 4.0, 80, 20.0, 2.0]],
    },
  ]);

  it("库内无此 MSKU → 自动新建主档（FBM 兜底，MSKU 记录在案）", () => {
    const r = parseOperationExcel(opsOnly, FIXED_DATE);
    expect(r.missingCritical).toEqual([]);
    const m = r.skuMaster.find((s) => s.sku === "NEWMSKU-01");
    expect(m).toBeTruthy();
    expect(m!.msku).toBe("NEWMSKU-01");
    expect(m!.fulfillment).toBe("FBM");
    expect(m!.saleStatus).toBe("active");
    // 快照挂在新 SKU 上，含本期 + 上期
    const cur = r.dailySnapshot.find((s) => s.sku === "NEWMSKU-01" && s.dailySales7d > 0)!;
    expect(cur.dailySales7d).toBeCloseTo(1, 2);
    expect(cur.sessions).toBe(700);
    expect(cur.orders).toBe(7);
    const prev = r.dailySnapshot.find((s) => s.sku === "NEWMSKU-01" && s.dailySales7d === 0)!;
    expect(prev.sessions).toBe(770);
    expect(prev.orders).toBe(10);
  });

  it("库内已有主档（msku 字段）→ 反查内部 SKU，不重复建档", () => {
    const existing = [
      { sku: "OLD-001", name: "老品", store: "-", price: 10, saleStatus: "active", fulfillment: "FBM", msku: "NEWMSKU-01" },
    ] as unknown as SkuMaster[];
    const r = parseOperationExcel(opsOnly, FIXED_DATE, { existingMasters: existing });
    const cur = r.dailySnapshot.find((s) => s.dailySales7d > 0)!;
    expect(cur.sku).toBe("OLD-001");
    expect(r.skuMaster.find((s) => s.sku === "NEWMSKU-01")).toBeUndefined();
  });

  it("库内已有主档（mskuStores 记录）→ 同样反查成功", () => {
    const existing = [
      { sku: "OLD-002", name: "老品2", store: "-", price: 10, saleStatus: "active", fulfillment: "FBM", mskuStores: { "NEWMSKU-01": "Shop A" } },
    ] as unknown as SkuMaster[];
    const r = parseOperationExcel(opsOnly, FIXED_DATE, { existingMasters: existing });
    const cur = r.dailySnapshot.find((s) => s.dailySales7d > 0)!;
    expect(cur.sku).toBe("OLD-002");
  });
});

describe("parseOperationExcel · CVR 反推订单量", () => {
  it("只填 CVR 不填订单量 → orders = sessions × CVR%", () => {
    const buf = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "Sessions(近7天)", "CVR%(可选)"],
        rows: [["CVRSKU-1", 14, 1000, 2.5]],
      },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "CVRSKU-1" && s.dailySales7d > 0)!;
    expect(cur.sessions).toBe(1000);
    expect(cur.orders).toBeCloseTo(25);
  });

  it("Excel 百分比格式（2.5% 存为 0.025）→ 同样反推 25 单", () => {
    const buf = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "Sessions(近7天)", "CVR%(可选)"],
        rows: [["CVRSKU-2", 14, 1000, 0.025]],
      },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "CVRSKU-2" && s.dailySales7d > 0)!;
    expect(cur.orders).toBeCloseTo(25);
  });

  it("订单量与 CVR 同时填写 → 订单量优先，不被 CVR 覆盖", () => {
    const buf = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "Sessions(近7天)", "订单量(近7天)", "CVR%(可选)"],
        rows: [["CVRSKU-3", 14, 1000, 30, 2.5]],
      },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "CVRSKU-3" && s.dailySales7d > 0)!;
    expect(cur.orders).toBe(30);
  });
});

describe("parseOperationExcel · 上期列防串列", () => {
  it("Sessions(本期) 与 Sessions(上期) 各归其位，不互相侵占", () => {
    const buf = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "Sessions(近7天)", "订单量(近7天)", "Sessions(上期)", "订单量(上期)"],
        rows: [["GUARD-SKU", 7, 1200, 24, 1350, 30]],
      },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "GUARD-SKU" && s.date === FIXED_DATE)!;
    expect(cur.sessions).toBe(1200);
    expect(cur.orders).toBe(24);
    const prev = r.dailySnapshot.find((s) => s.sku === "GUARD-SKU" && s.date === "2026-10-25")!;
    expect(prev.sessions).toBe(1350);
    expect(prev.orders).toBe(30);
  });
});

describe("parseOperationExcel · 功能4/5：广告订单数（选填）与退款率", () => {
  it("广告订单数列 → 真实值写入快照 adOrders", () => {
    const buf = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "订单量(近7天)", "广告订单数(选填)"],
        rows: [["ADOSKU", 14, 30, 6]],
      },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "ADOSKU" && s.date === FIXED_DATE && s.dailySales7d > 0)!;
    expect(cur.adOrders).toBe(6);
    expect(cur.orders).toBe(30);
  });

  it("无广告订单数列 → adOrders 为 undefined（UI 回退费比推导并标「估算」）", () => {
    const buf = buildXlsx([
      { name: "运营数据", headers: ["SKU", "7天销量", "订单量(近7天)"], rows: [["NOAD", 14, 30]] },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "NOAD" && s.date === FIXED_DATE && s.dailySales7d > 0)!;
    expect(cur.adOrders).toBeUndefined();
  });

  it("退款率真实 0% 与未导入区分：显式 0 记 0，无列记 undefined", () => {
    const withZero = parseOperationExcel(
      buildXlsx([
        { name: "运营数据", headers: ["SKU", "7天销量", "退款率"], rows: [["RF-ZERO", 14, 0]] },
      ]),
      FIXED_DATE,
    );
    const zero = withZero.dailySnapshot.find((s) => s.sku === "RF-ZERO" && s.date === FIXED_DATE && s.dailySales7d > 0)!;
    expect(zero.refundRate).toBe(0);

    const withoutCol = parseOperationExcel(
      buildXlsx([{ name: "运营数据", headers: ["SKU", "7天销量"], rows: [["RF-MISS", 14]] }]),
      FIXED_DATE,
    );
    const miss = withoutCol.dailySnapshot.find((s) => s.sku === "RF-MISS" && s.date === FIXED_DATE && s.dailySales7d > 0)!;
    expect(miss.refundRate).toBeUndefined();
  });

  it("退款率正常值写入（聚合保留 2 位小数）", () => {
    const buf = buildXlsx([
      { name: "运营数据", headers: ["SKU", "7天销量", "退款率"], rows: [["RF-OK", 14, 2.1]] },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const cur = r.dailySnapshot.find((s) => s.sku === "RF-OK" && s.date === FIXED_DATE && s.dailySales7d > 0)!;
    expect(cur.refundRate).toBeCloseTo(2.1);
  });

  it("上期稀疏快照不带 adOrders/refundRate（仅 Sessions/订单量）", () => {
    const buf = buildXlsx([
      {
        name: "运营数据",
        headers: ["SKU", "7天销量", "Sessions(上期)", "订单量(上期)", "广告订单数(选填)", "退款率"],
        rows: [["SPARSE", 14, 1350, 30, 6, 2.1]],
      },
    ]);
    const r = parseOperationExcel(buf, FIXED_DATE);
    const prev = r.dailySnapshot.find((s) => s.sku === "SPARSE" && s.date === "2026-10-25")!;
    expect(prev.dailySales7d).toBe(0);
    expect(prev.sessions).toBe(1350);
    expect(prev.orders).toBe(30);
    expect(prev.adOrders).toBeUndefined();
    expect(prev.refundRate).toBeUndefined();
  });
});
