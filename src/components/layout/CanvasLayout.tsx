import React, { useState, useRef, useEffect } from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
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
 * 画布式布局组件 — Notion Dashboard 风格
 *
 * 核心思路：编辑模式和浏览模式都使用 ReactGridLayout。
 * - 编辑模式 (customizing=true): 可拖拽 + 可缩放，区块显示虚线边框，右上角显示更多菜单
 * - 浏览模式 (customizing=false): 不可拖拽不可缩放，区块内容溢出可滚动
 * - compactType=null: 不自动压缩，区块固定在用户放置的位置
 * - preventCollision: 不允许重叠
 *
 * 子元素需要带 key 属性，key 值与 layout 数组中的 i 字段对应。
 */
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

  // Safety: never render GridLayout with width=0 — causes all cards to collapse
  const safeWidth = width > 0 ? width : 0;
  const canRender = mounted && safeWidth > 0;

  // ── 为每个子元素包裹下拉菜单 ──
  const wrappedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    const key = String(child.key ?? "");
    return (
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
          layout={layout}
          width={safeWidth}
          cols={12}
          rowHeight={40}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          isDraggable={customizing}
          isResizable={customizing}
          compactType={null}
          preventCollision
          onLayoutChange={onLayoutChange}
          useCSSTransforms
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
