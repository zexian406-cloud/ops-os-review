// QA 验证 F1：店铺联动 getOrCreateShopByName
// 验证：大小写/空格归一匹配、自动创建路径、重复名复用、空名回退 '-'
import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreateShopByName, db } from "@/domain/db";
import { resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
});

describe("F1 店铺联动 getOrCreateShopByName", () => {
  it("大小写/前后空格归一：已存在店铺名命中并复用其 id", async () => {
    await db.shops.bulkPut([
      { id: "shop_match", name: "  Amazon US ", createdAt: new Date().toISOString() },
    ]);
    // 传入全小写、无空格 → 应命中已存在的 shop_match
    const id = await getOrCreateShopByName("amazon us");
    expect(id).toBe("shop_match");
  });

  it("不存在的店铺名自动创建并返回新 id（store 被写入新店铺 id）", async () => {
    const before = await db.shops.count();
    const id = await getOrCreateShopByName("Brand New Shop");
    expect(id).not.toBe("-");
    const created = await db.shops.get(id);
    expect(created).toBeDefined();
    expect(created!.name).toBe("Brand New Shop");
    expect(await db.shops.count()).toBe(before + 1);
  });

  it("同名二次调用复用同一店铺（不重复创建）", async () => {
    const a = await getOrCreateShopByName("Dup Shop");
    const b = await getOrCreateShopByName("Dup Shop");
    expect(a).toBe(b);
    expect(await db.shops.count()).toBe(1);
  });

  it("空名与纯空格回退为 '-'（导入侧会再叠加 existing?.store / selectedShopId）", async () => {
    expect(await getOrCreateShopByName("")).toBe("-");
    expect(await getOrCreateShopByName("   ")).toBe("-");
    // 不应因此创建任何店铺
    expect(await db.shops.count()).toBe(0);
  });

  it("自动创建采用归一后的名称（trim 后写入）", async () => {
    const id = await getOrCreateShopByName("  Trimmed Shop  ");
    const created = await db.shops.get(id);
    expect(created!.name).toBe("Trimmed Shop");
  });
});
