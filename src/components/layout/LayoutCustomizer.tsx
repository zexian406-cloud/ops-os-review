import { DASHBOARD_LABELS, type DashboardSectionKey } from "@/hooks/useLayoutPrefs";

interface LayoutCustomizerProps {
  visibleKeys: DashboardSectionKey[];
  allKeys: DashboardSectionKey[];
  toggle: (key: DashboardSectionKey) => void;
  onClose: () => void;
  onReset: () => void;
}

/**
 * Dashboard 布局工具栏
 * - 显隐切换
 * - 恢复默认
 */
export default function LayoutCustomizer({
  visibleKeys, allKeys, toggle, onClose, onReset,
}: LayoutCustomizerProps) {
  return (
    <div className="sticky top-0 z-50 rounded-[14px] border-2 border-primary-300 bg-background-50/95 backdrop-blur-md p-4 shadow-lg">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <i className="ri-edit-2-line text-[16px] text-primary-600" aria-hidden />
          <span className="text-[14px] font-bold text-foreground-900">页面编辑模式</span>
          <span className="text-[12px] text-foreground-500">— 拖动卡片调整位置，拖右下角调整大小</span>
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

      {/* 模块显隐 */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400 mb-2">模块显示 / 隐藏</div>
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
                {DASHBOARD_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
