import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { db } from "@/domain/db";
import { useOpsData } from "@/domain/store";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PageLayoutCustomizer from "@/components/layout/PageLayoutCustomizer";
import { usePageLayout } from "@/hooks/usePageLayout";
import type { TodoItem } from "@/domain/types";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TodoPage() {
  const { skuMaster } = useOpsData();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadTodos = async () => {
    const all = await db.todos.toArray();
    setTodos(all.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    }));
  };

  useEffect(() => { loadTodos(); }, []);

  const addTodo = async () => {
    const content = newContent.trim();
    if (!content) return;
    const item: TodoItem = {
      id: uid(),
      content,
      relatedSku: newSku || undefined,
      dueDate: newDueDate || undefined,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    await db.todos.put(item);
    setNewContent(""); setNewSku(""); setNewDueDate("");
    setToast({ msg: "已添加待办", ok: true });
    setTimeout(() => setToast(null), 2000);
    loadTodos();
  };

  const toggleTodo = async (item: TodoItem) => {
    const updated: TodoItem = {
      ...item,
      completed: !item.completed,
      completedAt: !item.completed ? new Date().toISOString() : undefined,
    };
    await db.todos.put(updated);
    loadTodos();
  };

  const deleteTodo = async (id: string) => {
    await db.todos.delete(id);
    setDeleteConfirm(null);
    loadTodos();
  };

  const incompleteCount = useMemo(() => todos.filter((t) => !t.completed).length, [todos]);
  const completedCount = useMemo(() => todos.filter((t) => t.completed).length, [todos]);

  const {
    customizing, setCustomizing, toggleSection, moveSection, reset: resetLayout,
    visibleKeys, orderedKeys, allKeys,
  } = usePageLayout("todo");

  const inputCls = "w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">My Tasks</div>
          <h1 className="font-heading text-[26px] font-bold text-foreground-950">我的待办</h1>
          <p className="text-[13px] text-foreground-500">
            {incompleteCount} 个未完成 · {completedCount} 个已完成 · 轻量记录，不做项目管理
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCustomizing(!customizing)}
          className="flex items-center gap-1.5 rounded-[12px] border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-800 cursor-pointer"
        >
          <i className={customizing ? "ri-close-line" : "ri-layout-masonry-line"} aria-hidden />
          {customizing ? "关闭设置" : "自定义布局"}
        </button>
      </div>

      {customizing && (
        <PageLayoutCustomizer
          pageId="todo"
          visibleKeys={visibleKeys}
          orderedKeys={orderedKeys}
          allKeys={allKeys}
          toggle={toggleSection}
          move={moveSection}
          onClose={() => setCustomizing(false)}
          onReset={resetLayout}
        />
      )}

      {/* Add new todo */}
      {visibleKeys.includes("addForm") && (
      <Section title="新增待办" icon="ri-add-circle-line">

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">待办内容 *</label>
            <input
              className={inputCls}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="例如：BFRS258 降价到 $35.99"
              onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }}
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">关联 SKU (选填)</label>
            <select
              className={inputCls + " cursor-pointer"}
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
            >
              <option value="">不关联</option>
              {skuMaster.map((s) => (
                <option key={s.sku} value={s.sku}>{s.sku} - {s.name}</option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">截止日 (选填)</label>
            <input
              type="date"
              className={inputCls}
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={addTodo}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap h-[38px]"
          >
            <i className="ri-add-line" aria-hidden /> 添加
          </button>
        </div>
      </Section>
      )}

      {/* Todo list */}
      {visibleKeys.includes("todoList") && (
      <Section title="待办列表" icon="ri-list-check-3" subtitle={`${incompleteCount} 个未完成`}>
        {todos.length === 0 ? (
          <EmptyState icon="ri-check-double-line" title="暂无待办" desc="输入待办内容并点击添加" />
        ) : (
          <div className="space-y-1.5">
            {todos.map((item) => {
              const isOverdue = !item.completed && item.dueDate && item.dueDate < todayStr();
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    item.completed
                      ? "border-background-200/50 bg-background-50/50"
                      : isOverdue
                        ? "border-red-200 bg-red-50/60"
                        : "border-background-200/70 bg-background-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(item)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 cursor-pointer transition-colors ${
                      item.completed
                        ? "border-accent-500 bg-accent-500 text-white"
                        : "border-background-300 hover:border-primary-400"
                    }`}
                  >
                    {item.completed && <i className="ri-check-line text-[12px]" aria-hidden />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] ${item.completed ? "line-through text-foreground-400" : "text-foreground-900"}`}>
                      {item.content}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-foreground-500">
                      {item.relatedSku && (
                        <Link
                          to={`/sku/${encodeURIComponent(item.relatedSku)}`}
                          className="rounded bg-secondary-100 px-1.5 py-0.5 text-secondary-800 hover:bg-secondary-200 cursor-pointer font-medium whitespace-nowrap"
                        >
                          <i className="ri-price-tag-3-line mr-0.5" aria-hidden />
                          {item.relatedSku}
                        </Link>
                      )}
                      {item.dueDate && (
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                          <i className={`${isOverdue ? "ri-alert-line" : "ri-calendar-line"} mr-0.5`} aria-hidden />
                          {item.dueDate}
                          {isOverdue && " (已过期)"}
                        </span>
                      )}
                      <span className="text-foreground-400">
                        创建 {new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                      </span>
                      {item.completed && item.completedAt && (
                        <span className="text-accent-600">
                          完成 {new Date(item.completedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(item.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-red-50 text-foreground-400 hover:text-red-500 cursor-pointer"
                    title="删除"
                  >
                    <i className="ri-delete-bin-line text-[14px]" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>
      )}


      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-background-50 p-6 shadow-xl">
            <div className="text-center">
              <h3 className="text-[16px] font-bold text-foreground-950">删除这条待办？</h3>
              <p className="mt-1 text-[13px] text-foreground-500">不影响关联的 SKU 数据</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-lg border border-background-200 py-2 text-[13px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap">取消</button>
              <button type="button" onClick={() => deleteTodo(deleteConfirm)} className="flex-1 rounded-lg bg-red-500 py-2 text-[13px] font-semibold text-white hover:bg-red-600 cursor-pointer whitespace-nowrap">删除</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl px-5 py-2.5 text-sm font-medium shadow-lg z-50 ${toast.ok ? "bg-accent-600 text-background-50" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}