import { vi, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * 回归验证：驾驶舱「健康度最低 TOP10」行内 SKU 链接跳转到
 * `/diagnosis?sku=:sku` 后，诊断页必须只展示该 SKU 的风险，
 * 并自动展开、显示提示条；未知 SKU 必须落到空状态。
 *
 * 实现说明（可靠性）：
 * 诊断页仅依赖 `useOpsData()` 获取 alerts / skuMaster / 快照 / 库存。
 * 这里用 vi.mock 注入确定性的两份告警（DG-SKU-A / DG-SKU-B 各一条），
 * 避免依赖共享的 fake-indexeddb 在跨文件并行时偶发串数据导致的不稳定。
 * 真实的告警生成逻辑由 computeAlerts / useOpsData 的既有单测覆盖；
 * 本测试专注验证「按 ?sku= 过滤 + 自动展开 + 提示条 + 空状态」这一新增行为。
 */

const { SKU_A, SKU_B } = vi.hoisted(() => ({
  SKU_A: "DG-SKU-A",
  SKU_B: "DG-SKU-B",
}));

vi.mock("@/domain/store", async () => {
  const { makeSku, makeSnap, makeInv } = await import("./fixtures");

  const skuMaster = [
    makeSku({ sku: SKU_A, name: "品A" }),
    makeSku({ sku: SKU_B, name: "品B" }),
  ];
  const latestSnapshot = new Map<string, ReturnType<typeof makeSnap>>([
    [SKU_A, makeSnap({ sku: SKU_A, dailySales7d: 10, stockOnHand: 100 })],
    [SKU_B, makeSnap({ sku: SKU_B, dailySales7d: 10, stockOnHand: 100 })],
  ]);
  const latestInventory = new Map<string, ReturnType<typeof makeInv>>([
    [SKU_A, makeInv({ sku: SKU_A, eastStock: 100 })],
    [SKU_B, makeInv({ sku: SKU_B, eastStock: 100 })],
  ]);
  // 两条标题不同（便于在卡片里肉眼区分），且都来自 computeDiagnosis 已知良好的 low_stock 类型
  const alerts = [
    {
      id: "alert-a",
      date: "2026-08-01",
      sku: SKU_A,
      skuName: "品A",
      type: "low_stock" as const,
      severity: "critical" as const,
      title: "库存不足 · 10 天",
      detail: "可售 10 天 < Lead Time 40 + 安全库存 30",
      status: "open" as const,
    },
    {
      id: "alert-b",
      date: "2026-08-01",
      sku: SKU_B,
      skuName: "品B",
      type: "low_stock" as const,
      severity: "warning" as const,
      title: "库存不足 · 12 天",
      detail: "可售 12 天 < Lead Time 40 + 安全库存 30",
      status: "open" as const,
    },
  ];

  return {
    useOpsData: () => ({
      loading: false,
      alerts,
      skuMaster,
      latestSnapshot,
      latestInventory,
      previousSnapshot: undefined,
      promotions: [],
    }),
  };
});

import DiagnosisPage from "@/pages/diagnosis/page";

const renderWith = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DiagnosisPage />
    </MemoryRouter>,
  );

const skuLink = (sku: string) => screen.queryByRole("link", { name: `[${sku}]` });

describe("诊断页 ?sku= 过滤（来自驾驶舱 TOP10 下钻）", () => {
  it("未带 sku 参数时，两个 SKU 的告警都展示", async () => {
    renderWith("/diagnosis");
    await screen.findByText("异常诊断详情");

    expect(screen.getByRole("link", { name: `[${SKU_A}]` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `[${SKU_B}]` })).toBeInTheDocument();
    // 未带 sku 时不应出现「正在查看 SKU」提示条
    expect(screen.queryByText(/正在查看 SKU/)).toBeNull();
  });

  it("带 ?sku=DG-SKU-A 时，只展示该 SKU 的告警，不展示另一 SKU（过滤生效 + 自动展开 + 提示条）", async () => {
    renderWith(`/diagnosis?sku=${SKU_A}`);
    await screen.findByText("异常诊断详情");

    // 提示条出现
    expect(screen.getByText(/正在查看 SKU/)).toBeInTheDocument();
    // 目标 SKU 的告警卡片出现
    expect(screen.getByRole("link", { name: `[${SKU_A}]` })).toBeInTheDocument();
    // 其它 SKU 的告警卡片完全不渲染（过滤生效的关键断言）
    expect(skuLink(SKU_B)).toBeNull();
    // 自动展开：该 SKU 卡片的切换按钮应为「收起诊断」
    expect(await screen.findByText("收起诊断")).toBeInTheDocument();
  });

  it("带 ?sku=DG-SKU-B 时，只展示 B，不展示 A（对称的过滤）", async () => {
    renderWith(`/diagnosis?sku=${SKU_B}`);
    await screen.findByText("异常诊断详情");

    expect(screen.getByRole("link", { name: `[${SKU_B}]` })).toBeInTheDocument();
    expect(skuLink(SKU_A)).toBeNull();
    expect(screen.getByText(/正在查看 SKU/)).toBeInTheDocument();
  });

  it("带未知 sku 时落到空状态，不放出任何告警卡片", async () => {
    renderWith("/diagnosis?sku=NOPE-SKU");
    await screen.findByText("该 SKU 暂无风险告警");

    expect(skuLink(SKU_A)).toBeNull();
    expect(skuLink(SKU_B)).toBeNull();
  });
});
