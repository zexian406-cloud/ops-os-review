import {
  SKU_LABELS,
  type SkuDetailSectionKey,
} from "@/hooks/useLayoutPrefs";

interface SkuLayoutCustomizerProps {
  visibleKeys: SkuDetailSectionKey[];
  allKeys: SkuDetailSectionKey[];
  toggle: (key: SkuDetailSectionKey) => void;
  onClose: () => void;
  onReset: () => void;
}

/**
 * 简化版布局工具栏
 * - 仅提供显隐切换 + 恢复默认
 * - 拖拽编辑直接在页面上进行 (CanvasLayout 编辑模式)
 * - 不区分卡片类型，所有区块平等
 */
export default function SkuLayoutCustomizer({
  visibleKeys,
  allKeys,
  toggle,
  onClose,
  onReset,
}: SkuLayoutCustomizerProps) {
  return (
    <div className="sticky top-0 z-50 rounded-[14px] border-2 border-primary-300 bg-background-50/95 backdrop-blur-md p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="ri-drag-move-2-line text-[16px] text-primary-600" aria-hidden />
          <span className="text-[13px] font-semibold text-foreground-900">拖拽编辑模式</span>
          <span className="text-[11px] text-foreground-500">— 直接拖拽区块调整位置，拖右下角调整大小</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-[8px] border border-background-200 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 cursor-pointer"
          >
            恢复默认
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] bg-foreground-950 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-foreground-800 cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>

      {/* 显隐切换 */}
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
  );
}
