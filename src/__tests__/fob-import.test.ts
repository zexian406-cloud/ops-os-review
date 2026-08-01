import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { parseOperationExcel } from "@/domain/excel";
import { applyIncrementalCostUpdate } from "@/domain/cost-merge";
import { db } from "@/domain/db";
import { resetDb, makeSku } from "./fixtures";

function bufferFromSheets(sheets: { name: string; rows: (string | number)[][] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    // 产品成本更新表头：SKU + FOB；头程更新表头：SKU + 头程费 + 配送费
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return (out instanceof ArrayBuffer ? out : (out as unknown as Uint8Array).buffer) as ArrayBuffer;
}

beforeEach(async () => {
  await resetDb();
});

describe("FOB 增量成本导入（单表成本更新）", () => {
  it("单表「产品成本更新」能把 FOB 回写现有 SKU，且不丢其它字段", async () => {
    // 预置一条带旧 costFob 的 skuMaster
    await db.skuMaster.bulkPut([
      makeSku({
        sku: "SKU-FOB-1",
        name: "成本品",
        price: 30,
        costFob: 8,
        costShipping: 2,
        costDelivery: 1,
        costCommission: 4,
        coupon: 3,
      }),
    ]);

    const buf = bufferFromSheets([
      { name: "产品成本更新", rows: [["SKU", "FOB"], ["SKU-FOB-1", 12.5]] },
    ]);
    const parsed = parseOperationExcel(buf);

    // 单表场景：skuMaster 应为空，但 costFobMap 已解析到
    expect(parsed.skuMaster.length).toBe(0);
    expect(parsed.costFobMap.get("SKU-FOB-1")).toBe(12.5);
    expect(parsed.shippingMap.size).toBe(0); // 头程更新为独立 sheet，此处为空

    // 触发增量回写
    const updated = await applyIncrementalCostUpdate(parsed.costFobMap, parsed.shippingMap);
    expect(updated).toBe(1);

    // 断言 costFob 被更新；头程/配送费不在本表范围内，应保持原值
    const after = await db.skuMaster.get("SKU-FOB-1");
    expect(after).toBeDefined();
    expect(after!.costFob).toBe(12.5);
    expect(after!.costShipping).toBe(2);
    expect(after!.costDelivery).toBe(1);
    // 未被成本更新表覆盖的字段应原样保留
    expect(after!.name).toBe("成本品");
    expect(after!.price).toBe(30);
    expect(after!.costCommission).toBe(4);
    expect(after!.coupon).toBe(3);
  });

  it("「产品成本更新」+「头程更新」双表能把 FOB/头程/配送费一起回写", async () => {
    await db.skuMaster.bulkPut([
      makeSku({
        sku: "SKU-FOB-2",
        name: "成本品2",
        price: 40,
        costFob: 9,
        costShipping: 2,
        costDelivery: 1,
      }),
    ]);

    const buf = bufferFromSheets([
      { name: "产品成本更新", rows: [["SKU", "FOB"], ["SKU-FOB-2", 15]] },
      { name: "头程更新", rows: [["SKU", "头程费", "配送费"], ["SKU-FOB-2", 4, 2]] },
    ]);
    const parsed = parseOperationExcel(buf);

    expect(parsed.skuMaster.length).toBe(0);
    expect(parsed.costFobMap.get("SKU-FOB-2")).toBe(15);
    expect(parsed.shippingMap.get("SKU-FOB-2")?.shipping).toBe(4);
    expect(parsed.shippingMap.get("SKU-FOB-2")?.delivery).toBe(2);

    const updated = await applyIncrementalCostUpdate(parsed.costFobMap, parsed.shippingMap);
    expect(updated).toBe(1);

    const after = await db.skuMaster.get("SKU-FOB-2");
    expect(after!.costFob).toBe(15);
    expect(after!.costShipping).toBe(4);
    expect(after!.costDelivery).toBe(2);
    expect(after!.name).toBe("成本品2"); // 其它字段保留
  });

  it("现有库中不存在的 SKU 不被新建", async () => {
    const buf = bufferFromSheets([
      { name: "产品成本更新", rows: [["SKU", "FOB"], ["SKU-NOPE", 9.9]] },
    ]);
    const parsed = parseOperationExcel(buf);
    const updated = await applyIncrementalCostUpdate(parsed.costFobMap, parsed.shippingMap);
    expect(updated).toBe(0);
    expect(await db.skuMaster.get("SKU-NOPE")).toBeUndefined();
  });
});
