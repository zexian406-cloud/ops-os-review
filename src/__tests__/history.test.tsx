import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HistoryPage from "@/pages/history/page";
import { db } from "@/domain/db";
import { resetDb, makeSku, makeSnap } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await db.skuMaster.bulkPut([makeSku({ sku: "SKU-H", name: "品H" })]);
});

describe("历史对比页集成冒烟", () => {
  it("灌入 latest + previous 两份快照 → 对比行出现跌箭头", async () => {
    await db.dailySnapshot.bulkPut([
      makeSnap({
        sku: "SKU-H",
        date: "2026-07-25",
        dailySales7d: 10,
        adRatio: 20,
        rating: 4.5,
      }),
      makeSnap({
        sku: "SKU-H",
        date: "2026-08-01",
        dailySales7d: 5, // 销量下降 → ↓
        adRatio: 40, // TACOS 上升（goodDir=down → ↓）
        rating: 4.0, // 评分下降 → ↓
      }),
    ]);

    const { container } = render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    // 对比区块出现
    expect(await screen.findByText("本周 vs 上周")).toBeInTheDocument();
    // SKU 行出现
    expect(screen.getByRole("link", { name: /SKU-H/ })).toBeInTheDocument();
    // 至少出现一个「跌」图标（销量/评分/TACOS 下降 → ri-arrow-down-line）
    const downIcons = container.querySelectorAll(".ri-arrow-down-line");
    expect(downIcons.length).toBeGreaterThan(0);
    // 下跌图标带有可访问性标签
    expect(downIcons[0]).toHaveAttribute("aria-label", "环比下降");
  });

  it("只灌 latest 不灌 previous → 出现「暂无历史数据」空态，不白屏", async () => {
    await db.dailySnapshot.bulkPut([
      makeSnap({ sku: "SKU-H", date: "2026-08-01", profitMargin: 20 }),
    ]);

    const { container } = render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    // 空态文案出现
    expect(await screen.findByText("暂无上次导入数据")).toBeInTheDocument();
    // 不应渲染对比表格
    expect(screen.queryByText("本周 vs 上周")).toBeNull();
    // 未白屏：标题正常渲染
    expect(container.textContent).toContain("历史对比");
  });
});
