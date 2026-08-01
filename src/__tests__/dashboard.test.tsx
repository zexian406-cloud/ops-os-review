import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "@/pages/dashboard/page";
import { db } from "@/domain/db";
import { resetDb, makeInv, makeSku, makeSnap } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await db.skuMaster.bulkPut([
    makeSku({ sku: "SKU-DASH-1", name: "品1" }),
    // 评分 < 3.8 → 触发 rating_low 因子，健康分降到「关注」
    makeSku({ sku: "SKU-DASH-2", name: "品2", rating: 3.5 }),
  ]);
  // 仅一个日期：无 previousSnapshot，避免 recharts 图表在 jsdom 渲染
  await db.dailySnapshot.bulkPut([
    makeSnap({ sku: "SKU-DASH-1", date: "2026-08-01" }),
    makeSnap({ sku: "SKU-DASH-2", date: "2026-08-01", rating: 3.5 }),
  ]);
  // 提供正向库存，避免 computeAlerts 把无库存 SKU 判为断货（否则健康分会变成「风险」）
  await db.inventoryLayer.bulkPut([
    makeInv({ sku: "SKU-DASH-1", eastStock: 500 }),
    makeInv({ sku: "SKU-DASH-2", eastStock: 500 }),
  ]);
});

describe("驾驶舱集成冒烟", () => {
  it("健康度最低 TOP10 区块出现，含分数徽章与下钻链接（默认收起，展开后可见）", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // 等待加载完成
    await screen.findByText("今日运营驾驶舱");

    // TOP10 区块标题与右上角「查看全部 SKU」在标题栏，始终可见（不受折叠影响）
    expect(screen.getByText("健康度最低 TOP10")).toBeInTheDocument();
    expect(screen.getByText(/查看全部 SKU/)).toBeInTheDocument();

    // 默认收起：表格内容（SKU 下钻链接、分数徽章）未渲染
    expect(screen.queryAllByRole("link", { name: /SKU-DASH-1/ }).length).toBe(0);

    // 点击区块右侧的「展开」开关
    fireEvent.click(screen.getByLabelText("展开"));

    // 展开后：SKU 下钻链接与分数徽章出现
    expect((await screen.findAllByRole("link", { name: /SKU-DASH-1/ })).length).toBeGreaterThan(0);
    // 分数徽章等级文本（品2 rating<3.8 → 关注）
    expect(screen.getAllByText("关注").length).toBeGreaterThan(0);
  });
});
