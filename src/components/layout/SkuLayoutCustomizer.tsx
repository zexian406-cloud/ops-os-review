import { useState, useRef } from "react";
import {
  SKU_LABELS,
  CORE_KPI_CARD_LABELS,
  COVERAGE_KPI_CARD_LABELS,
  QUALITY_KPI_CARD_LABELS,
  type SkuDetailSectionKey,
  type CoreKpiCardKey,
  type CoverageKpiCardKey,
  type QualityKpiCardKey,
} from "@/hooks/useLayoutPrefs";

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
  onClose: () => void;
  onReset: () => void;
}

export default function SkuLayoutCustomizer({
  visibleKeys,
  orderedKeys,
  allKeys,
  toggle,
  moveSection,
  moveCoreKpiCard,
  moveCoverageKpiCard,
  moveQualityKpiCard,
  coreKpiCardOrder,
  coverageKpiCardOrder,
  qualityKpiCardOrder,
  onClose,
  onReset,
}: SkuLayoutCustomizerProps) {
  const [tab, setTab] = useState<"sections" | "coreKpi" | "coverageKpi" | "qualityKpi">("sections");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  };

  const handleDrop = (fromIdx: number, toIdx: number, moveFn: (key: any, dir: "up" | "down" | "left" | "right") => void, dir: "up" | "down" | "left" | "right") => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    // 逐格移动，模拟用户一步步拖
    const step = fromIdx < toIdx ? 1 : -1;
    const steps = Math.abs(toIdx - fromIdx);
    // 需要知道拖拽元素的 key 和每次移动的方向
    // 但我们先把这里留空，用下面的通用处理
    setDragIdx(null);
    dragOverIdx.current = null;
  };

  const moveByDrag = <T,>(items: T[], from: number, to: number, moveFn: (key: T, dir: "up" | "down" | "left" | "right") => void, dir: "up" | "down" | "left" | "right") => {
    if (from === to) return;
    const key = items[from];
    const step = from < to ? 1 : -1;
    const steps = Math.abs(to - from);
    for (let i = 0; i < steps; i++) {
      moveFn(key, dir);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-[16px] font-semibold text-foreground-950">自定义布局</h3>
          <p className="mt-0.5 text-[12px] text-foreground-400">
            拖拽调整顺序，点击勾选显示/隐藏
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
          onClick={() => setTab("sections")}
          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-colors ${
            tab === "sections" ? "bg-foreground-950 text-white" : "bg-background-100 text-foreground-500 hover:bg-background-200"
          }`}
        >
          区块顺序
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

      {/* ── 区块排序（拖拽版） ── */}
      {tab === "sections" && (
        <div className="space-y-1.5">
          {orderedKeys.map((key, idx) => (
            <div
              key={key}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); dragOverIdx.current = idx; }}
              onDragEnd={() => {
                if (dragIdx !== null && dragOverIdx.current !== null && dragIdx !== dragOverIdx.current) {
                  moveByDrag(orderedKeys, dragIdx, dragOverIdx.current, moveSection, dragIdx < dragOverIdx.current ? "down" : "up");
                }
                setDragIdx(null);
                dragOverIdx.current = null;
              }}
              className={`flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 transition-all cursor-grab active:cursor-grabbing ${
                dragIdx === idx ? "opacity-50 ring-2 ring-primary-400" : ""
              } ${
                dragOverIdx.current === idx && dragIdx !== idx ? "border-primary-400 bg-primary-50/50" : ""
              } ${
                visibleKeys.includes(key) ? "border-foreground-200 bg-foreground-50" : "border-background-200 bg-background-50"
              }`}
            >
              <i className="ri-draggable text-[16px] text-foreground-300 hover:text-foreground-500" />
              <input
                type="checkbox"
                checked={visibleKeys.includes(key)}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-foreground-950 cursor-pointer"
              />
              <span className={`text-[13px] font-medium ${visibleKeys.includes(key) ? "text-foreground-900" : "text-foreground-400"}`}>
                {SKU_LABELS[key]}
              </span>
              <span className="ml-auto text-[11px] text-foreground-300">#{idx + 1}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 核心 KPI 卡片排序（拖拽版） ── */}
      {tab === "coreKpi" && (
        <DraggableCardGrid
          cards={coreKpiCardOrder}
          labels={CORE_KPI_CARD_LABELS}
          onMove={moveCoreKpiCard}
          dir="left" fromDir="left" toDir="right"
        />
      )}

      {/* ── 覆盖 KPI 卡片排序（拖拽版） ── */}
      {tab === "coverageKpi" && (
        <DraggableCardGrid
          cards={coverageKpiCardOrder}
          labels={COVERAGE_KPI_CARD_LABELS}
          onMove={moveCoverageKpiCard}
          dir="left" fromDir="left" toDir="right"
        />
      )}

      {/* ── 质量 KPI 卡片排序（拖拽版） ── */}
      {tab === "qualityKpi" && (
        <DraggableCardGrid
          cards={qualityKpiCardOrder}
          labels={QUALITY_KPI_CARD_LABELS}
          onMove={moveQualityKpiCard}
          dir="left" fromDir="left" toDir="right"
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
  const dragOverIdx = useRef<number | null>(null);

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
          onDragOver={(e) => { e.preventDefault(); dragOverIdx.current = idx; }}
          onDragEnd={() => {
            if (dragIdx !== null && dragOverIdx.current !== null) {
              moveByDrag(dragIdx, dragOverIdx.current);
            }
            setDragIdx(null);
            dragOverIdx.current = null;
          }}
          className={`flex items-center gap-1.5 rounded-[12px] border px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all ${
            dragIdx === idx ? "opacity-50 ring-2 ring-primary-400" : ""
          } ${
            dragOverIdx.current === idx && dragIdx !== idx ? "border-primary-400 bg-primary-50/50 scale-105" : "border-background-200 bg-background-50"
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