import { useState, useMemo, useCallback } from "react";
import ReactGridLayout, { type Layout } from "react-grid-layout";
import {
  SKU_LABELS,
  CORE_KPI_CARD_LABELS,
  COVERAGE_KPI_CARD_LABELS,
  QUALITY_KPI_CARD_LABELS,
  type SkuDetailSectionKey,
  type CoreKpiCardKey,
  type CoverageKpiCardKey,
  type QualityKpiCardKey,
  type GridItemLayout,
} from "@/hooks/useLayoutPrefs";

// react-grid-layout 内置样式
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

interface SkuLayoutCustomizerProps {
  visibleKeys: SkuDetailSectionKey[];
  orderedKeys: SkuDetailSectionKey[];
  allKeys: SkuDetailSectionKey[];
  toggle: (key: SkuDetailSectionKey) => void;
  moveSection: (key: SkuDetailSectionKey, direction: "up" | "down") => void;
  moveCoreKpiCard: (key: CoreKpiCardKey, direction: "left" | "right") => void;
  moveCoverageKpiCard: (key: CoverageKpiCardKey, direction: "left" | "right") => void;
  moveQualityKpiCard: (key: QualityKpiCardKey, direction: "left" | "right") => void;
  coreKpiCardOrder: CoreKpiCardKey[];
  coverageKpiCardOrder: CoverageKpiCardKey[];
  qualityKpiCardOrder: QualityKpiCardKey[];
  gridLayout: Record<string, GridItemLayout>;
  setGridLayout: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  onClose: () => void;
  onReset: () => void;
}

export default function SkuLayoutCustomizer({
  visibleKeys,
  allKeys,
  toggle,
  moveCoreKpiCard,
  moveCoverageKpiCard,
  moveQualityKpiCard,
  coreKpiCardOrder,
  coverageKpiCardOrder,
  qualityKpiCardOrder,
  gridLayout,
  setGridLayout,
  onClose,
  onReset,
}: SkuLayoutCustomizerProps) {
  const [tab, setTab] = useState<"layout" | "coreKpi" | "coverageKpi" | "qualityKpi">("layout");

  // 构建 react-grid-layout 的 layout 数组（仅包含可见区块）
  const rglLayout: Layout[] = useMemo(() => {
    return visibleKeys.map((key) => {
      const item = gridLayout[key] ?? { x: 0, y: 0, w: 12, h: 3 };
      return {
        i: key,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 3,
        maxW: 12,
        minH: 1,
      };
    });
  }, [visibleKeys, gridLayout]);

  const handleLayoutChange = useCallback((layout: Layout[]) => {
    setGridLayout(layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
  }, [setGridLayout]);

  return (
    <div className="glass-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-[16px] font-semibold text-foreground-950">自定义布局</h3>
          <p className="mt-0.5 text-[12px] text-foreground-400">
            拖拽调整区块位置和大小，点击勾选显示/隐藏
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-[10px] border border-background-200 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 cursor-pointer"
          >
            恢复默认
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] bg-foreground-950 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-foreground-800 cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>

      {/* ── 标签页 ── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTab("layout")}
          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-colors ${
            tab === "layout" ? "bg-foreground-950 text-white" : "bg-background-100 text-foreground-500 hover:bg-background-200"
          }`}
        >
          区块布局
        </button>
        <button
          type="button"
          onClick={() => setTab("coreKpi")}
          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-colors ${
            tab === "coreKpi" ? "bg-foreground-950 text-white" : "bg-background-100 text-foreground-500 hover:bg-background-200"
          }`}
        >
          核心 KPI 卡片
        </button>
        <button
          type="button"
          onClick={() => setTab("coverageKpi")}
          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-colors ${
            tab === "coverageKpi" ? "bg-foreground-950 text-white" : "bg-background-100 text-foreground-500 hover:bg-background-200"
          }`}
        >
          覆盖 KPI 卡片
        </button>
        <button
          type="button"
          onClick={() => setTab("qualityKpi")}
          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-colors ${
            tab === "qualityKpi" ? "bg-foreground-950 text-white" : "bg-background-100 text-foreground-500 hover:bg-background-200"
          }`}
        >
          质量 KPI 卡片
        </button>
      </div>

      {/* ── 区块布局：react-grid-layout 拖拽编辑器 ── */}
      {tab === "layout" && (
        <div className="space-y-4">
          {/* 显示/隐藏勾选区 */}
          <div className="rounded-xl border border-background-200 bg-background-50 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
              显示/隐藏区块（点击勾选）
            </div>
            <div className="flex flex-wrap gap-2">
              {allKeys.map((key) => {
                const isVisible = visibleKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] cursor-pointer transition-all ${
                      isVisible
                        ? "border-primary-300 bg-primary-50 text-primary-700"
                        : "border-dashed border-background-300 bg-background-50 text-foreground-400 hover:border-foreground-300"
                    }`}
                  >
                    <i className={isVisible ? "ri-checkbox-circle-fill text-primary-500" : "ri-checkbox-blank-circle-line text-foreground-300"} aria-hidden />
                    {SKU_LABELS[key]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 拖拽布局编辑器 */}
          {visibleKeys.length > 0 ? (
            <div className="rounded-xl border border-background-200 bg-background-100/50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                <i className="ri-drag-move-2-line" aria-hidden />
                拖拽区块调整位置，拖拽右下角调整大小
              </div>
              <div className="overflow-x-auto">
                <ReactGridLayout
                  className="layout"
                  layout={rglLayout}
                  cols={12}
                  rowHeight={40}
                  width={680}
                  margin={[8, 8]}
                  containerPadding={[0, 0]}
                  onLayoutChange={handleLayoutChange}
                  compactType="vertical"
                  isResizable={true}
                  isDraggable={true}
                >
                  {visibleKeys.map((key) => (
                    <div
                      key={key}
                      className="flex flex-col items-center justify-center rounded-lg border-2 border-primary-200 bg-primary-50/60 cursor-grab active:cursor-grabbing hover:border-primary-400 transition-colors overflow-hidden"
                    >
                      <i className="ri-draggable text-[14px] text-primary-400 mb-0.5" aria-hidden />
                      <span className="text-[11px] font-semibold text-foreground-700 text-center px-1 leading-tight">
                        {SKU_LABELS[key]}
                      </span>
                      <span className="text-[9px] text-foreground-400 mt-0.5">
                        {gridLayout[key]?.w ?? 12}列 × {gridLayout[key]?.h ?? 3}行
                      </span>
                    </div>
                  ))}
                </ReactGridLayout>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center text-[13px] text-foreground-400">
              请至少勾选一个区块
            </div>
          )}
        </div>
      )}

      {/* ── 核心 KPI 卡片排序 ── */}
      {tab === "coreKpi" && (
        <DraggableCardGrid
          cards={coreKpiCardOrder}
          labels={CORE_KPI_CARD_LABELS}
          onMove={moveCoreKpiCard}
        />
      )}

      {/* ── 覆盖 KPI 卡片排序 ── */}
      {tab === "coverageKpi" && (
        <DraggableCardGrid
          cards={coverageKpiCardOrder}
          labels={COVERAGE_KPI_CARD_LABELS}
          onMove={moveCoverageKpiCard}
        />
      )}

      {/* ── 质量 KPI 卡片排序 ── */}
      {tab === "qualityKpi" && (
        <DraggableCardGrid
          cards={qualityKpiCardOrder}
          labels={QUALITY_KPI_CARD_LABELS}
          onMove={moveQualityKpiCard}
        />
      )}
    </div>
  );
}

/* ── 拖拽排序子组件（横向排列） ── */
function DraggableCardGrid<T extends string>({
  cards,
  labels,
  onMove,
}: {
  cards: T[];
  labels: Record<T, string>;
  onMove: (key: T, direction: "left" | "right") => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const moveByDrag = (from: number, to: number) => {
    if (from === to) return;
    const key = cards[from];
    const step = from < to ? 1 : -1;
    const steps = Math.abs(to - from);
    for (let i = 0; i < steps; i++) {
      if (step === 1) onMove(key, "right");
      else onMove(key, "left");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {cards.map((key, idx) => (
        <div
          key={key}
          draggable
          onDragStart={() => setDragIdx(idx)}
          onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
          onDragEnd={() => {
            if (dragIdx !== null && dragOverIdx !== null) {
              moveByDrag(dragIdx, dragOverIdx);
            }
            setDragIdx(null);
            setDragOverIdx(null);
          }}
          className={`flex items-center gap-1.5 rounded-[12px] border px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all ${
            dragIdx === idx ? "opacity-50 ring-2 ring-primary-400" : ""
          } ${
            dragOverIdx === idx && dragIdx !== idx ? "border-primary-400 bg-primary-50/50 scale-105" : "border-background-200 bg-background-50"
          }`}
        >
          <i className="ri-draggable text-[14px] text-foreground-300" />
          <span className="text-[13px] font-medium text-foreground-900 whitespace-nowrap">
            {labels[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
