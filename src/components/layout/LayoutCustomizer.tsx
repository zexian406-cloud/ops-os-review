import { useState } from "react";
import {
  DASHBOARD_LABELS,
  LAYOUT_TEMPLATES,
  type DashboardSectionKey,
  type LayoutTemplateId,
} from "@/hooks/useLayoutPrefs";

interface LayoutCustomizerProps {
  visibleKeys: DashboardSectionKey[];
  allKeys: DashboardSectionKey[];
  toggle: (key: DashboardSectionKey) => void;
  onClose: () => void;
  onReset: () => void;
  onApplyTemplate: (templateId: LayoutTemplateId) => void;
}

/**
 * Dashboard 布局工具栏 — Notion Dashboard 风格
 * - 模板选择（运营日常 / 利润分析 / 老板视角）
 * - 显隐切换
 * - 保存布局 / 恢复默认
 */
export default function LayoutCustomizer({
  visibleKeys, allKeys, toggle, onClose, onReset, onApplyTemplate,
}: LayoutCustomizerProps) {
  const [savedToast, setSavedToast] = useState(false);

  const handleSave = () => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

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
          {savedToast && (
            <span className="text-[12px] font-medium text-accent-600 animate-pulse">
              <i className="ri-check-line" aria-hidden /> 布局已保存
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="rounded-[8px] bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-primary-600 cursor-pointer"
          >
            保存布局
          </button>
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

      {/* 模板选择 */}
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400 mb-2">布局模板</div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(LAYOUT_TEMPLATES) as [LayoutTemplateId, typeof LAYOUT_TEMPLATES[LayoutTemplateId]][]).map(([id, tpl]) => (
            <button
              key={id}
              type="button"
              onClick={() => onApplyTemplate(id)}
              className="flex items-center gap-2 rounded-[10px] border border-background-200 bg-background-50 px-4 py-2 text-[12px] font-medium text-foreground-600 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 cursor-pointer transition-all"
            >
              <i className={`${tpl.icon} text-[14px]`} aria-hidden />
              <div className="flex flex-col">
                <span>{tpl.label}</span>
                <span className="text-[10px] text-foreground-400">{tpl.desc}</span>
              </div>
            </button>
          ))}
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
