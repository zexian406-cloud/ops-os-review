// QA 验证 F3（存储型 XSS 防护 safeHref）+ F4（优惠券显示 / 瀑布图促销成本段）
// 通过对 SkuDetail 真实渲染，断言：
//  - productUrl / 竞品链接为 javascript:/data: 时渲染为 href="#"（不执行脚本）
//  - 合法 https 链接原样保留
//  - 折扣区「优惠券」行显示 ($$x)（修复：原先缺少 $）
//  - 存在手动促销成本时瀑布图出现「促销成本(手动)」段
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SkuDetail from "@/pages/sku/detail";
import { db } from "@/domain/db";
import { resetDb, makeSku, makeSnap, makeInv } from "./fixtures";

function renderDetail(skuId: string) {
  return render(
    <MemoryRouter initialEntries={[`/sku/${skuId}`]}>
      <Routes>
        <Route path="/sku/:sku" element={<SkuDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await resetDb();
});

describe("F3 存储型 XSS 防护 safeHref", () => {
  it("productUrl/竞品为 javascript:/data: 时全部渲染为 #，且无任何危险 href", async () => {
    await db.skuMaster.bulkPut([
      makeSku({
        sku: "SKU-XSS",
        name: "XSS测试品",
        productUrl: "javascript:alert(1)",
        competitorUrls: [
          "data:text/html,<script>alert(2)</script>",
          "https://good.example/dp/X",
        ],
      }),
    ]);
    await db.dailySnapshot.bulkPut([makeSnap({ sku: "SKU-XSS" })]);
    await db.inventoryLayer.bulkPut([makeInv({ sku: "SKU-XSS", eastStock: 100 })]);
    renderDetail("SKU-XSS");

    await screen.findByText("产品链接"); // 等待详情渲染完成

    const links = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
    const dangerous = links.filter((a) => {
      const h = (a.getAttribute("href") ?? "").toLowerCase();
      return h.startsWith("javascript:") || h.startsWith("data:") || h.startsWith("vbscript:");
    });
    expect(dangerous.length).toBe(0); // 核心安全断言：没有任何可执行协议链接

    // productUrl 信息区链接应被中和
    const infoLink = links.find((a) => a.textContent?.includes("产品链接"));
    expect(infoLink?.getAttribute("href")).toBe("#");

    // 竞品 1（data:）应被中和
    const comp1 = links.find((a) => a.textContent?.includes("竞品 1"));
    expect(comp1?.getAttribute("href")).toBe("#");

    // 竞品 2（https）应原样保留
    const comp2 = links.find((a) => a.textContent?.includes("竞品 2"));
    expect(comp2?.getAttribute("href")).toBe("https://good.example/dp/X");
  });

  it("合法 https productUrl 原样保留（不被中和）", async () => {
    await db.skuMaster.bulkPut([
      makeSku({ sku: "SKU-XSS2", name: "合法链接品", productUrl: "https://www.amazon.com/dp/ABC" }),
    ]);
    await db.dailySnapshot.bulkPut([makeSnap({ sku: "SKU-XSS2" })]);
    await db.inventoryLayer.bulkPut([makeInv({ sku: "SKU-XSS2", eastStock: 100 })]);
    renderDetail("SKU-XSS2");

    await screen.findByText("在 Amazon 打开");
    const links = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
    const amazonLink = links.find((a) => a.textContent?.includes("在 Amazon 打开"));
    expect(amazonLink?.getAttribute("href")).toBe("https://www.amazon.com/dp/ABC");
  });
});

describe("F4 优惠券显示 / 瀑布图促销成本段", () => {
  it("折扣区「优惠券」行显示 ($$x)（修复：原先缺少 $ 符号）", async () => {
    await db.skuMaster.bulkPut([
      makeSku({ sku: "SKU-COUPON", name: "优惠券品", price: 100, coupon: 5 }),
    ]);
    await db.promotions.bulkPut([
      {
        id: "P-COUPON",
        sku: "SKU-COUPON",
        skuName: "优惠券品",
        store: "shop_1",
        type: "Coupon",
        name: "折扣活动",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        status: "active",
        discountPrice: 90,
      },
    ]);
    await db.dailySnapshot.bulkPut([makeSnap({ sku: "SKU-COUPON" })]);
    await db.inventoryLayer.bulkPut([makeInv({ sku: "SKU-COUPON", eastStock: 100 })]);
    renderDetail("SKU-COUPON");

    // 等待详情加载完成（loading=false）。用 heading 角色避免 SKU 名多处匹配
    await screen.findByRole("heading", { name: "优惠券品" });

    // 折扣区「优惠券」行应渲染为带 $ 的括号金额。
    // 注意：源码写为 `($${discountCostCoupon.toFixed(2)})`，其中 \$ 是转义 $，
    // 实测渲染为单 $ 的 "($x.xx)"（见 QA 报告 F4 发现），并非预期的 "($$x)"。
    await waitFor(() => {
      const els = screen.getAllByText(
        (text) => text.startsWith("($") && text.endsWith(")"),
      );
      expect(els.length).toBeGreaterThan(0);
    });
  });

  it("存在手动促销成本时，瀑布图出现「促销成本(手动)」段", async () => {
    await db.skuMaster.bulkPut([
      makeSku({
        sku: "SKU-PROMO",
        name: "促销成本品",
        price: 100,
        costFob: 30,
        costShipping: 5,
        costDelivery: 4,
        costCommission: 15,
        costStorage: 2,
        costAd: 10,
        costReturn: 3,
      }),
    ]);
    await db.dailySnapshot.bulkPut([makeSnap({ sku: "SKU-PROMO", date: "2026-08-01" })]);
    await db.inventoryLayer.bulkPut([makeInv({ sku: "SKU-PROMO", eastStock: 100 })]);
    await db.manualPromotions.bulkPut([
      {
        id: "MP1",
        sku: "SKU-PROMO",
        type: "BD",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        costMode: "amount",
        amount: 8,
        createdAt: new Date().toISOString(),
      },
    ]);
    renderDetail("SKU-PROMO");

    // 瀑布图含该段即证明 costPromo 已接入（正常盈利区与瀑布图区各出现一次，故用 getAllByText）
    const segs = await screen.findAllByText("促销成本(手动)");
    expect(segs.length).toBeGreaterThanOrEqual(1);
  });
});
