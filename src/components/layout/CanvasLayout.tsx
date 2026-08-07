import React, { useState, useRef, useEffect, useCallback } from "react";
import { GridLayout, useContainerWidth, getCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

interface CanvasLayoutProps {
  layout: Layout[];
  customizing: boolean;
  onLayoutChange: (layout: Layout[]) => void;
  children: React.ReactNode;
  /** 隐藏指定模块 */
  onHideItem?: (key: string) => void;
  /** 恢复指定模块的尺寸 (w/h) */
  onResetItemSize?: (key: string) => void;
  /** 恢复指定模块的位置 (x/y) */
  onResetItemPosition?: (key: string) => void;
}

/**
 * 画布式布局组件 — Notion Dashboard 风格 (react-grid-layout v2 API)
 *
 * v2 关键变化：
 * - 使用 gridConfig / dragConfig / resizeConfig 替代 v1 的 cols/rowHeight/isDraggable 等
 * - 使用 compactor 替代 compactType + preventCollision
 * - getCompactor(null, false, true) = 无压缩 + 禁止重叠，卡片固定在用户放置的位置
 *
 * 防覆盖机制：
 * - GridLayout 的 onLayoutChange 在挂载时也会触发，会覆盖正确的默认布局
 * - 使用 internalLayout 内部状态渲染，onLayoutChange 只更新内部状态
 * - onDragStop / onResizeStop 才真正持久化到父组件
 */
const FREE_FORM_COMPACTOR = getCompactor(null, false, true);

export default function CanvasLayout({
  layout,
  customizing,
  onLayoutChange,
  children,
  onHideItem,
  onResetItemSize,
  onResetItemPosition,
}: CanvasLayoutProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  // ── 内部布局状态 ──
  // GridLayout 的 onLayoutChange 在组件挂载时也会触发（可能返回经过 correctBounds
  // 调整的布局），直接持久化会覆盖正确的默认布局。因此用内部状态渲染，
  // 仅在用户拖拽/缩放完成（onDragStop / onResizeStop）时才持久化。
  const [internalLayout, setInternalLayout] = useState<Layout[]>(layout);

  // 外部 layout 变化时（切换模板、重置、显隐模块）同步到内部状态
  const layoutKey = JSON.stringify(layout);
  useEffect(() => {
    setInternalLayout(layout);
  }, [layoutKey]);

  // Safety: never render GridLayout with width=0 — causes all cards to collapse
  const safeWidth = width > 0 ? width : 0;
  const canRender = mounted && safeWidth > 0;

  // onLayoutChange: 只更新内部状态，不持久化（防止挂载时覆盖默认布局）
  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setInternalLayout([...newLayout] as Layout[]);
  }, []);

  // onDragStop / onResizeStop: 用户交互完成，持久化到父组件
  const handleDragStop = useCallback((newLayout: Layout) => {
    onLayoutChange([...newLayout] as Layout[]);
  }, [onLayoutChange]);

  const handleResizeStop = useCallback((newLayout: Layout) => {
    onLayoutChange([...newLayout] as Layout[]);
  }, [onLayoutChange]);

  // ── 为每个子元素包裹下拉菜单 ──
  // 注意：不能用 React.Children.map，它会自动给返回元素的 key 加前缀（如 "kpi" → ".$kpi"），
  // 导致 GridLayout 的 synchronizeLayoutWithChildren 用 child.key 匹配 layout.i 时全部失败，
  // 所有卡片回退到默认 1x1 尺寸。改用 forEach 手动构建数组，保留原始 key。
  const wrappedChildren: React.ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const key = String(child.key ?? "");
    wrappedChildren.push(
      <div key={key} className="canvas-item-wrapper">
        {customizing && (onHideItem || onResetItemSize || onResetItemPosition) && (
          <CardMenu
            itemKey={key}
            onHide={onHideItem ? () => onHideItem(key) : undefined}
            onResetSize={onResetItemSize ? () => onResetItemSize(key) : undefined}
            onResetPosition={onResetItemPosition ? () => onResetItemPosition(key) : undefined}
          />
        )}
        {child}
      </div>
    );
  });

  return (
    <div ref={containerRef} className="canvas-layout-wrapper">
      {canRender && (
        <GridLayout
          className={`canvas-layout ${customizing ? "canvas-layout-editing" : "canvas-layout-viewing"}`}
          layout={internalLayout}
          width={safeWidth}
          gridConfig={{ cols: 12, rowHeight: 40, margin: [12, 12], containerPadding: [0, 0] }}
          dragConfig={{ enabled: customizing }}
          resizeConfig={{ enabled: customizing }}
          compactor={FREE_FORM_COMPACTOR}
          onLayoutChange={handleLayoutChange}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
        >
          {wrappedChildren}
        </GridLayout>
      )}
    </div>
  );
}

/* ────────── 卡片右上角更多菜单 ────────── */
function CardMenu({
  itemKey,
  onHide,
  onResetSize,
  onResetPosition,
}: {
  itemKey: string;
  onHide?: () => void;
  onResetSize?: () => void;
  onResetPosition?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 如果没有任何操作，不渲染菜单按钮
  if (!onHide && !onResetSize && !onResetPosition) return null;

  return (
    <div ref={menuRef} className="canvas-card-menu" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="canvas-card-menu-btn"
        onClick={() => setOpen(!open)}
        title="更多操作"
      >
        <i className="ri-more-2-fill" aria-hidden />
      </button>
      {open && (
        <div className="canvas-card-menu-dropdown">
          {onResetPosition && (
            <button
              type="button"
              className="canvas-card-menu-item"
              onClick={() => { onResetPosition(); setOpen(false); }}
            >
              <i className="ri-map-pin-line" aria-hidden />
              恢复默认位置
            </button>
          )}
          {onResetSize && (
            <button
              type="button"
              className="canvas-card-menu-item"
              onClick={() => { onResetSize(); setOpen(false); }}
            >
              <i className="ri-aspect-ratio-line" aria-hidden />
              恢复默认尺寸
            </button>
          )}
          {onHide && (
            <button
              type="button"
              className="canvas-card-menu-item canvas-card-menu-danger"
              onClick={() => { onHide(); setOpen(false); }}
            >
              <i className="ri-eye-off-line" aria-hidden />
              隐藏模块
            </button>
          )}
        </div>
      )}
    </div>
  );
}
