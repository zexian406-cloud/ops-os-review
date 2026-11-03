import { describe, expect, it } from "vitest";
import { countShopMskus, filterSkuMasterByShop } from "./shopFilter";

type Row = { sku: string; store?: string | null };

const shops = [
  { id: "shop_1", name: "DEMO-STORE-US" },
  { id: "shop_2", name: "DEMO-STORE2-US" },
];

const rows: Row[] = [
  { sku: "sku001", store: "shop_1" },          // SKU 编辑器口径：存店铺 id
  { sku: "sku007", store: "DEMO-STORE-US" },   // 导入/演示口径：存店铺名
  { sku: "sku008", store: "shop_2" },
  { sku: "sku009", store: "DEMO-STORE2-US" },
];

describe("filterSkuMasterByShop", () => {
  it("选择「全部店铺」时原样返回所有行", () => {
    const result = filterSkuMasterByShop(rows, "all", shops);
    expect(result).toEqual(rows);
    expect(result).toBe(rows); // 引用不变，保持下游 useMemo 稳定
  });

  it("按店铺 id 匹配：SKU 编辑器写入的 store=id 数据不被滤空", () => {
    const result = filterSkuMasterByShop(rows, "shop_1", shops);
    expect(result.map((r) => r.sku)).toEqual(["sku001", "sku007"]);
  });

  it("按店铺名匹配（回归用例）：导入/演示数据 store=店铺名，修复前只按 id 匹配会得到空数组", () => {
    const nameOnlyRows: Row[] = [
      { sku: "sku008", store: "DEMO-STORE2-US" },
      { sku: "sku009", store: "DEMO-STORE2-US" },
    ];
    // 旧行为：store === "shop_2" 恒为 false → 空数组
    expect(filterSkuMasterByShop(nameOnlyRows, "shop_2", shops).map((r) => r.sku)).toEqual([
      "sku008",
      "sku009",
    ]);
  });

  it("切换到另一店铺时只保留该店铺的行", () => {
    const result = filterSkuMasterByShop(rows, "shop_2", shops);
    expect(result.map((r) => r.sku)).toEqual(["sku008", "sku009"]);
  });

  it("currentShopId 不在店铺列表中时，仍按 id 直接匹配存量数据", () => {
    // 店铺被删除但主档还挂着旧 id 的边界场景
    const result = filterSkuMasterByShop(rows, "shop_9", shops);
    expect(result).toEqual([]);
    const orphanRows: Row[] = [{ sku: "sku010", store: "shop_9" }];
    expect(filterSkuMasterByShop(orphanRows, "shop_9", shops).map((r) => r.sku)).toEqual(["sku010"]);
  });

  it("store 为 null / undefined / 空串的行始终被排除", () => {
    const dirtyRows: Row[] = [
      { sku: "skuA", store: null },
      { sku: "skuB", store: undefined },
      { sku: "skuC", store: "" },
      { sku: "sku001", store: "shop_1" },
    ];
    const result = filterSkuMasterByShop(dirtyRows, "shop_1", shops);
    expect(result.map((r) => r.sku)).toEqual(["sku001"]);
  });

  it("店铺名为空串时不产生名称匹配 token，避免空串误命中", () => {
    const weirdShops = [{ id: "shop_1", name: "" }];
    const result = filterSkuMasterByShop(
      [{ sku: "skuA", store: "" }, { sku: "skuB", store: "shop_1" }],
      "shop_1",
      weirdShops,
    );
    expect(result.map((r) => r.sku)).toEqual(["skuB"]);
  });

  it("空数据集返回空数组且不抛错", () => {
    expect(filterSkuMasterByShop([], "shop_1", shops)).toEqual([]);
    expect(filterSkuMasterByShop(rows, "all", [])).toEqual(rows);
  });
});

describe("countShopMskus · 店铺数据量口径（Bug3 回归）", () => {
  // 混合两种口径的演示数据：mskuStores（导入按行记录）与 store（SKU 编辑器）
  const masterRows = [
    { sku: "A", msku: "A-1,A-2", mskuStores: { "A-1": "DEMO-STORE-US", "A-2": "DEMO-STORE2-US" } },
    { sku: "B", msku: "B-1,B-2,B-3", store: "DEMO-STORE-US" },
    { sku: "C", msku: "C-1", mskuStores: { "C-1": "DEMO-STORE-US" } },
    { sku: "D", msku: "D-1", store: "DEMO-STORE2-US" },
  ];

  it("mskuStores 按行逐个 MSKU 计数，store 字段回退按 MSKU 逗号拆分计数", () => {
    // 店一 = A-1(1) + B 记录 3 个 MSKU + C-1(1) = 5
    expect(countShopMskus(masterRows, "DEMO-STORE-US")).toBe(5);
    // 店二 = A-2(1) + D-1(1) = 2
    expect(countShopMskus(masterRows, "DEMO-STORE2-US")).toBe(2);
  });

  it("MSKU 含空段 / 空白段时不虚增计数", () => {
    expect(countShopMskus([{ msku: "E-1,,E-2, ", store: "DEMO-STORE-US" }], "DEMO-STORE-US")).toBe(2);
    expect(countShopMskus([{ store: "DEMO-STORE-US" }], "DEMO-STORE-US")).toBe(0);
  });

  it("修复前口径回归：store 存店铺名，按 shopId 查询恒为 0 → 现按店名统计", () => {
    // Bug3 现象：两个店铺都显示「0 条数据」，但 SKU 列表挂着 17 个 MSKU
    expect(countShopMskus(masterRows, "shop_1")).toBe(0); // 传 id 不命中（本函数只认店名）
    expect(countShopMskus(masterRows, "DEMO-STORE-US")).toBe(5); // 传店名正常出数
  });

  it("未知店铺 / 空店名 / 空数据集 → 0", () => {
    expect(countShopMskus(masterRows, "NOT-EXIST")).toBe(0);
    expect(countShopMskus(masterRows, "")).toBe(0);
    expect(countShopMskus([], "DEMO-STORE-US")).toBe(0);
  });
});
