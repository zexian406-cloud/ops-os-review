import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OpsLogsPage from "@/pages/ops-logs/page";
import { db } from "@/domain/db";
import { resetDb, makeSku, makePromo } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await db.skuMaster.bulkPut([
    makeSku({ sku: "SKU-A", name: "品A" }),
    makeSku({ sku: "SKU-B", name: "品B" }),
  ]);
  await db.promotions.bulkPut([
    makePromo({ id: "P1", sku: "SKU-A", type: "BD", name: "春季大促A" }),
    makePromo({ id: "P2", sku: "SKU-A", type: "LD", name: "会员日A" }),
    makePromo({ id: "P3", sku: "SKU-B", type: "Coupon", name: "黑五B" }),
  ]);
});

describe("操作记录页集成冒烟", () => {
  it("「记一笔」：SKU 必选拦截 + 促销联动过滤 + 提交后出现关联促销记录", async () => {
    render(
      <MemoryRouter>
        <OpsLogsPage />
      </MemoryRouter>,
    );

    // 等待页面加载完成（loading=false）
    await screen.findByText("运营操作记录");

    // 打开「记一笔」弹窗
    fireEvent.click(screen.getByRole("button", { name: /记一笔操作/ }));
    expect(await screen.findByText("关联 SKU")).toBeInTheDocument();

    // 弹窗内 select 顺序：0=SKU 1=促销 2=动作 3=异常
    const selects = document.querySelectorAll("select");
    const skuSelect = selects[0] as HTMLSelectElement;
    const promoSelect = selects[1] as HTMLSelectElement;
    const actionSelect = selects[2] as HTMLSelectElement;

    // SKU 未选时，保存按钮禁用（提交被拦截）
    expect(screen.getByRole("button", { name: /保存记录/ })).toBeDisabled();

    // 选中 SKU-A
    fireEvent.change(skuSelect, { target: { value: "SKU-A" } });

    // 促销下拉联动：仅出现 SKU-A 的促销（P1/P2），不应出现 SKU-B 的 P3
    expect(screen.queryByText("Coupon · 黑五B")).toBeNull();
    expect(screen.getByText("BD · 春季大促A")).toBeInTheDocument();
    expect(screen.getByText("LD · 会员日A")).toBeInTheDocument();

    // 选中一个促销
    fireEvent.change(promoSelect, { target: { value: "P1" } });

    // 选必填动作
    fireEvent.change(actionSelect, { target: { value: "降价" } });

    // 此时保存按钮可用
    expect(screen.getByRole("button", { name: /保存记录/ })).toBeEnabled();

    // 提交
    fireEvent.click(screen.getByRole("button", { name: /保存记录/ }));

    // 列表出现新记录，并带「关联促销」标识（链接文本为「关联促销：<名称>」）
    await waitFor(() => {
      expect(screen.getByText(/关联促销/)).toBeInTheDocument();
    });
    expect(screen.getByText(/春季大促A/)).toBeInTheDocument();
    expect(screen.getByText("降价")).toBeInTheDocument();
  });
});
