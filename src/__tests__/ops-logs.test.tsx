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
    // SKU-A 的子 MSKU（parentSku 指向父 SKU），用于验证关联 MSKU 下拉
    makeSku({ sku: "SKU-A-1", name: "品A-子1", parentSku: "SKU-A", msku: "MSKU-A-1" }),
    makeSku({ sku: "SKU-A-2", name: "品A-子2", parentSku: "SKU-A", msku: "MSKU-A-2" }),
  ]);
  await db.promotions.bulkPut([
    makePromo({ id: "P1", sku: "SKU-A", type: "BD", name: "春季大促A" }),
    makePromo({ id: "P2", sku: "SKU-A", type: "LD", name: "会员日A" }),
    makePromo({ id: "P3", sku: "SKU-B", type: "Coupon", name: "黑五B" }),
  ]);
});

describe("操作记录页集成冒烟", () => {
  it("「记一笔」：SKU 必选拦截 + 促销联动过滤 + 不选 MSKU 也能提交", async () => {
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
    // 关联 MSKU 下拉也存在且可选
    expect(screen.getByText("关联 MSKU")).toBeInTheDocument();

    // 弹窗内 select 顺序：0=SKU 1=促销 2=MSKU 3=动作 4=异常
    const selects = document.querySelectorAll("select");
    const skuSelect = selects[0] as HTMLSelectElement;
    const promoSelect = selects[1] as HTMLSelectElement;
    const mskuSelect = selects[2] as HTMLSelectElement;
    const actionSelect = selects[3] as HTMLSelectElement;

    // SKU 未选时，保存按钮禁用（提交被拦截）
    expect(screen.getByRole("button", { name: /保存记录/ })).toBeDisabled();

    // 选中 SKU-A
    fireEvent.change(skuSelect, { target: { value: "SKU-A" } });

    // MSKU 下拉联动：仅出现 SKU-A 的子 MSKU（MSKU-A-1 / MSKU-A-2），且为选填
    expect(screen.getByText("MSKU-A-1")).toBeInTheDocument();
    expect(screen.getByText("MSKU-A-2")).toBeInTheDocument();
    expect(mskuSelect.value).toBe(""); // 默认不选

    // 促销下拉联动：仅出现 SKU-A 的促销（P1/P2），不应出现 SKU-B 的 P3
    expect(screen.queryByText("Coupon · 黑五B")).toBeNull();
    expect(screen.getByText("BD · 春季大促A")).toBeInTheDocument();
    expect(screen.getByText("LD · 会员日A")).toBeInTheDocument();

    // 选中一个促销
    fireEvent.change(promoSelect, { target: { value: "P1" } });

    // 选必填动作（刻意不选 MSKU → 应仍可提交）
    fireEvent.change(actionSelect, { target: { value: "降价" } });

    // 此时保存按钮可用
    expect(screen.getByRole("button", { name: /保存记录/ })).toBeEnabled();

    // 提交（未选 MSKU）
    fireEvent.click(screen.getByRole("button", { name: /保存记录/ }));

    // 列表出现新记录，并带「关联促销」标识（链接文本为「关联促销：<名称>」）
    await waitFor(() => {
      expect(screen.getByText(/关联促销/)).toBeInTheDocument();
    });
    expect(screen.getByText(/春季大促A/)).toBeInTheDocument();
    expect(screen.getByText("降价")).toBeInTheDocument();

    // 数据库确认：未选 MSKU → msku 为空
    const saved = await db.opsLogs.toArray();
    expect(saved.length).toBe(1);
    expect(saved[0].msku).toBeUndefined();
  });

  it("「记一笔」：选择关联 MSKU → 提交后记录带 msku 字段", async () => {
    render(
      <MemoryRouter>
        <OpsLogsPage />
      </MemoryRouter>,
    );

    await screen.findByText("运营操作记录");
    fireEvent.click(screen.getByRole("button", { name: /记一笔操作/ }));
    expect(await screen.findByText("关联 SKU")).toBeInTheDocument();

    const selects = document.querySelectorAll("select");
    const skuSelect = selects[0] as HTMLSelectElement;
    const mskuSelect = selects[2] as HTMLSelectElement;
    const actionSelect = selects[3] as HTMLSelectElement;

    fireEvent.change(skuSelect, { target: { value: "SKU-A" } });
    // 选择子 MSKU
    fireEvent.change(mskuSelect, { target: { value: "MSKU-A-1" } });
    fireEvent.change(actionSelect, { target: { value: "补货" } });

    expect(screen.getByRole("button", { name: /保存记录/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /保存记录/ }));

    // 列表出现该 MSKU 标识
    await waitFor(() => {
      expect(screen.getByText("MSKU-A-1")).toBeInTheDocument();
    });

    // 数据库确认：选中的 MSKU 已写入记录
    const saved = await db.opsLogs.toArray();
    expect(saved.length).toBe(1);
    expect(saved[0].msku).toBe("MSKU-A-1");
    expect(saved[0].sku).toBe("SKU-A");
  });
});
