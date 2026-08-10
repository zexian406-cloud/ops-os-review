import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from "react";
import { GridLayout, useContainerWidth, getCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

/* ────────── CanvasItem Context ──────────
 * 通过 Context 向子元素传递自定义模式状态和回调，
 * 避免在 CanvasLayout 中包装子元素（包装会改变 key 导致 GridLayout 匹配失败）
 */
interface CanvasItemContextValue {
  customizing: boolean;
  onHideItem?: (key: string) => void;
  onResetItemSize?: (key: string) => void;
  onResetItemPosition?: (key: string) => void;
}
const CanvasItemContext = createContext<CanvasItemContextValue>({ customizing: false });

/**
 * CanvasItem — 页面中每个区块的包装器
 *
 * 用法：
 * <CanvasLayout layout={rglLayout} ...>
 *   {visibleKeys.map(key => (
 *     <CanvasItem key={key} itemKey={key}>
 *       {sections[key]}
 *     </CanvasItem>
 *   ))}
 * </CanvasLayout>
 *
 * 注意：key 必须直接设在 <CanvasItem> 上，且与 layout 中的 i 值一致。
 *
 * ReactGridLayout v2 的 GridItem 通过 React.cloneElement 向子元素注入：
 * - ref（elementRef）：DraggableCore 通过 nodeRef 定位 DOM 节点，
 *   若不转发 ref → nodeRef.current 为 null → handleDragStart 抛异常，拖拽完全不工作
 * - className（含 "react-grid-item"）：定位类，不转发则卡片堆叠在 0,0
 * - style（含 transform 定位）：定位样式，不转发则卡片无法定位
 *
 * DraggableCore 通过 Resizable 的 cloneElement 注入：
 * - onMouseDown / onMouseUp / onTouchEnd：拖拽事件处理，
 *   若不转发 → mousedown 事件无法触达 DraggableCore，拖拽无响应
 *
 * 因此 CanvasItem 必须使用 forwardRef 转发 ref，并通过 ...rest 展开所有额外 props。
 */
type CanvasItemProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  itemKey: string;
  children: React.ReactNode;
};

export const CanvasItem = React.forwardRef<HTMLDivElement, CanvasItemProps>(
  function CanvasItem(
    { itemKey, children, className: injectedClassName, style: injectedStyle, ...rest },
    ref
  ) {
    const ctx = useContext(CanvasItemContext);
    return (
      <div
        ref={ref}
        className={`canvas-item-wrapper ${injectedClassName ?? ""}`}
        style={injectedStyle}
        data-item-key={itemKey}
        {...rest}
      >
      {ctx.customizing && (
        <div className="drag-handle canvas-drag-bar">
          <i className="ri-drag-move-2-line" aria-hidden />
          <span>拖动移动</span>
        </div>
      )}
      {ctx.customizing && (ctx.onHideItem || ctx.onResetItemSize || ctx.onResetItemPosition) && (
        <CardMenu
          itemKey={itemKey}
          onHide={ctx.onHideItem ? () => ctx.onHideItem!(itemKey) : undefined}
          onResetSize={ctx.onResetItemSize ? () => ctx.onResetItemSize!(itemKey) : undefined}
          onResetPosition={ctx.onResetItemPosition ? () => ctx.onResetItemPosition!(itemKey) : undefined}
        />
      )}
      {children}
      </div>
    );
  }
);

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
 * v2 关键：
 * - gridConfig / dragConfig / resizeConfig 替代 v1 的 cols/rowHeight/isDraggable
 * - compactor 替代 compactType + preventCollision
 * - getCompactor(null, false, false) = 无压缩 + 禁止重叠 + 允许推挤
 *   参数顺序: (compactType, allowOverlap, preventCollision)
 *   preventCollision: false → 拖拽时碰到其他卡片会推挤它们让路（不弹回），
 *   allowOverlap: false → 最终布局不会有重叠
 *   配合 CSS overflow 控制内容不溢出卡片边界
 *
 * 拖拽策略：
 * - 拖拽仅在自定义模式下启用 (dragConfig.enabled: customizing)
 * - 使用 handle 指定拖拽手柄 (.drag-handle)，只有从手柄才能拖动卡片
 * - cancel 选择器作为额外保护，阻止从交互元素拖拽
 * - 缩放手柄仅在自定义模式下显示 (resizeConfig.enabled: customizing)
 * - 自定义模式额外提供: KPI 指标切换、模块显隐、卡片菜单等功能
 *
 * 防覆盖机制：
 * - GridLayout 的 onLayoutChange 在挂载时也会触发，会覆盖正确的默认布局
 * - 使用 internalLayout 内部状态渲染，onLayoutChange 只更新内部状态
 * - onDragStop / onResizeStop 才真正持久化到父组件
 *
 * 子元素直接传递给 GridLayout，不做额外包装（包装会改变 key 导致匹配失败）。
 * 页面应使用 <CanvasItem key={key} itemKey={key}> 包装每个区块。
 */
const FREE_FORM_COMPACTOR = getCompactor(null, false, false);

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

  // 外部 layout 变化时（重置、显隐模块）同步到内部状态
  const layoutKey = JSON.stringify(layout);
  useEffect(() => {
    setInternalLayout(layout);
  }, [layoutKey]);

  // Safety: never render GridLayout with width=0 — causes all cards to collapse
  const safeWidth = width > 0 ? width : 0;
  const canRender = mounted && safeWidth > 0;

  // onLayoutChange: 只更新内部状态，不持久化（防止挂载时覆盖默认布局）
  // 深度比较避免无限循环：onLayoutChange 在每次渲染都会触发，
  // 如果 layout 未实际变化则返回 prev（相同引用不触发重渲染）
  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setInternalLayout((prev) => {
      if (prev.length === newLayout.length) {
        const same = prev.every((item, i) => {
          const n = newLayout[i];
          return n.i === item.i && n.x === item.x && n.y === item.y && n.w === item.w && n.h === item.h;
        });
        if (same) return prev;
      }
      return [...newLayout] as Layout[];
    });
  }, []);

  // onDragStop / onResizeStop: 用户交互完成，持久化到父组件
  const handleDragStop = useCallback((newLayout: Layout) => {
    onLayoutChange([...newLayout] as Layout[]);
  }, [onLayoutChange]);

  const handleResizeStop = useCallback((newLayout: Layout) => {
    onLayoutChange([...newLayout] as Layout[]);
  }, [onLayoutChange]);

  // Context value for CanvasItem children
  const ctxValue = useRef<CanvasItemContextValue>({ customizing, onHideItem, onResetItemSize, onResetItemPosition });
  ctxValue.current = { customizing, onHideItem, onResetItemSize, onResetItemPosition };

  return (
    <CanvasItemContext.Provider value={ctxValue.current}>
      <div ref={containerRef} className="canvas-layout-wrapper">
        {canRender && (
          <GridLayout
            className={`canvas-layout ${customizing ? "canvas-layout-editing" : "canvas-layout-viewing"}`}
            layout={internalLayout}
            width={safeWidth}
            gridConfig={{ cols: 12, rowHeight: 40, margin: [12, 12], containerPadding: [0, 0] }}
            dragConfig={{ enabled: customizing, handle: '.drag-handle', cancel: 'input, textarea, select, button, a, .no-drag' }}
            resizeConfig={{ enabled: customizing }}
            compactor={FREE_FORM_COMPACTOR}
            autoSize={true}
            onLayoutChange={handleLayoutChange}
            onDragStop={handleDragStop}
            onResizeStop={handleResizeStop}
          >
            {children}
          </GridLayout>
        )}
      </div>
    </CanvasItemContext.Provider>
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
