import { useState, useCallback, useRef } from "react";
import type { PageId } from "@/hooks/usePageLayout";
import { PAGE_LABELS, SECTION_LABELS } from "@/hooks/usePageLayout";

interface PageLayoutCustomizerProps {
  pageId: PageId;
  visibleKeys: string[];
  orderedKeys: string[];
  allKeys: string[];
  toggle: (key: string) => void;
  move: (key: string, dir: "up" | "down") => void;
  onClose: () => void;
  onReset: () => void;
}

export default function PageLayoutCustomizer({
  pageId,
  visibleKeys,
  orderedKeys,
  allKeys,
  toggle,
  move,
  onClose,
  onReset,
}: PageLayoutCustomizerProps) {
  const pageName = PAGE_LABELS[pageId] ?? pageId;
  const labels = SECTION_LABELS[pageId] ?? {};
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragNode = useRef<HTMLElement | null>(null);

  const handleDragStart = useCallback((key: string, e: React.DragEvent) => {
    setDragKey(key);
    dragNode.current = e.currentTarget as HTMLElement;
    e.dataTransfer.effectAllowed = "move";
    (e.currentTarget as HTMLElement).style.opacity = "0.4";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDragKey(null);
    setDragOverKey(null);
    (e.currentTarget as HTMLElement).style.opacity = "1";
  }, []);

  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverKey(null);
  }, []);

  const handleDrop = useCallback((targetKey: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!dragKey || dragKey === targetKey) return;
    const fromIdx = orderedKeys.indexOf(dragKey);
    const toIdx = orderedKeys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    // 连续向上或向下移动
    if (fromIdx < toIdx) {
      for (let i = fromIdx; i < toIdx; i++) {
        move(dragKey, "down");
      }
    } else {
      for (let i = fromIdx; i > toIdx; i--) {
        move(dragKey, "up");
      }
    }
  }, [dragKey, orderedKeys, move]);

  return (
    <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-[16px] font-semibold text-foreground-950">
            {pageName} — 自定义布局
          </h3>
          <p className="mt-0.5 text-[12px] text-foreground-400">
            勾选显示区块，拖拽或箭头调整顺序
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

      <div className="space-y-2">
        {orderedKeys.map((key, idx) => {
          const isDragOver = dragOverKey === key && dragKey !== key;
          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => handleDragStart(key, e)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(key, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(key, e)}
              className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 transition-all cursor-grab active:cursor-grabbing
                ${isDragOver ? "border-primary-400 bg-primary-50/60 shadow-md scale-[1.02]" : "border-background-200/60 bg-background-50"}
                ${dragKey === key ? "shadow-lg" : ""}`}
            >
              <div className="flex cursor-grab items-center text-foreground-300 hover:text-foreground-500">
                <i className="ri-draggable text-[16px]" aria-hidden />
              </div>
              <input
                type="checkbox"
                checked={visibleKeys.includes(key)}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-foreground-950 cursor-pointer"
              />
              <span className="flex-1 text-[13px] font-medium text-foreground-800">
                {labels[key] ?? key}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(key, "up")}
                  disabled={idx === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-background-100 disabled:opacity-30 cursor-pointer"
                  title="上移"
                >
                  <i className="ri-arrow-up-line text-foreground-500" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(key, "down")}
                  disabled={idx === orderedKeys.length - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-background-100 disabled:opacity-30 cursor-pointer"
                  title="下移"
                >
                  <i className="ri-arrow-down-line text-foreground-500" aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 隐藏但仍可启用的区块 */}
      {allKeys.filter((k) => !orderedKeys.includes(k)).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
            已隐藏区块（点击勾选显示）
          </div>
          <div className="flex flex-wrap gap-2">
            {allKeys
              .filter((k) => !orderedKeys.includes(k))
              .map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-background-300 bg-background-50 px-3 py-1.5 text-[12px] text-foreground-500 hover:border-foreground-300 hover:text-foreground-700 cursor-pointer"
                >
                  <i className="ri-add-line" aria-hidden />
                  {labels[key] ?? key}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}