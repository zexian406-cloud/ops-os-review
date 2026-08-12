import React, { useMemo, createContext, useContext } from "react";

/* ────────── CanvasItem Context ──────────
 * 通过 Context 向子元素传递列宽信息，
 * 使 CanvasItem 能根据 layout 中的 w 值设置 grid-column span。
 */
interface CanvasItemContextValue {
  colSpanMap: Map<string, number>;
}
const CanvasItemContext = createContext<CanvasItemContextValue>({ colSpanMap: new Map() });

/**
 * CanvasItem — 页面中每个区块的包装器
 *
 * 用法：
 * <CanvasLayout layout={rglLayout}>
 *   {visibleKeys.map(key => (
 *     <CanvasItem key={key} itemKey={key}>
 *       {sections[key]}
 *     </CanvasItem>
 *   ))}
 * </CanvasLayout>
 *
 * 注意：key 必须直接设在 <CanvasItem> 上，且与 layout 中的 i 值一致。
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
    const w = ctx.colSpanMap.get(itemKey) ?? 12;
    return (
      <div
        ref={ref}
        className={`canvas-item-wrapper ${injectedClassName ?? ""}`}
        style={{ ...injectedStyle, gridColumn: `span ${Math.min(Math.max(w, 1), 12)}` }}
        data-item-key={itemKey}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

interface CanvasLayoutProps {
  /** 布局配置：仅使用 i 和 w 字段确定列宽 */
  layout: { i: string; w: number; x?: number; y?: number; h?: number }[];
  children: React.ReactNode;
  // 以下 props 仅为向后兼容保留，不再使用
  customizing?: boolean;
  onLayoutChange?: (layout: unknown) => void;
  onHideItem?: (key: string) => void;
  onResetItemSize?: (key: string) => void;
  onResetItemPosition?: (key: string) => void;
  contentVersion?: number;
}

/**
 * 画布式布局组件 — 纯 CSS Grid 实现
 *
 * 使用 12 列响应式 CSS Grid 替代 react-grid-layout：
 * - 无测高循环 → 无抖动
 * - 无固定高度 → 无空隙
 * - 自动等高同行卡片
 * - 响应式：移动端单列，桌面端 12 列
 */
export default function CanvasLayout({
  layout,
  children,
}: CanvasLayoutProps) {
  // 构建 itemKey → w 映射，用于设置 grid-column span
  const colSpanMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of layout) {
      m.set(item.i, item.w);
    }
    return m;
  }, [layout]);

  return (
    <CanvasItemContext.Provider value={{ colSpanMap }}>
      <div className="canvas-layout-grid">
        {children}
      </div>
    </CanvasItemContext.Provider>
  );
}
