import React from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

interface CanvasLayoutProps {
  layout: Layout[];
  customizing: boolean;
  onLayoutChange: (layout: Layout[]) => void;
  children: React.ReactNode;
}

/**
 * 画布式布局组件 — 全部推翻重做版
 *
 * 核心思路：编辑模式和浏览模式都使用 ReactGridLayout。
 * - 编辑模式 (customizing=true): 可拖拽 + 可缩放，区块显示虚线边框
 * - 浏览模式 (customizing=false): 不可拖拽不可缩放，区块内容溢出可滚动
 * - compactType=null: 不自动压缩，区块固定在用户放置的位置（真正的自由画布）
 *
 * 子元素需要带 key 属性，key 值与 layout 数组中的 i 字段对应。
 */
export default function CanvasLayout({
  layout,
  customizing,
  onLayoutChange,
  children,
}: CanvasLayoutProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  return (
    <div ref={containerRef} className="canvas-layout-wrapper">
      {mounted && (
        <GridLayout
          className={`canvas-layout ${customizing ? "canvas-layout-editing" : "canvas-layout-viewing"}`}
          layout={layout}
          width={width}
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
          {children}
        </GridLayout>
      )}
    </div>
  );
}
