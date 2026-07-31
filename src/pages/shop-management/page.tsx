import { useEffect, useState, useCallback } from "react";
import { getAllShops, addShop, renameShop, deleteShop, getShopDataCount } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import type { Shop } from "@/domain/types";

export default function ShopManagementPage() {
  const [shops, setShops] = useState<(Shop & { dataCount: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<Shop | null>(null);

  const loadShops = useCallback(async () => {
    setLoading(true);
    const all = await getAllShops();
    const withCounts = await Promise.all(
      all.map(async (s) => ({
        ...s,
        dataCount: await getShopDataCount(s.id),
      }))
    );
    setShops(withCounts);
    setLoading(false);
  }, []);

  useEffect(() => { loadShops(); }, [loadShops]);

  const handleAdd = async () => {
    if (!newName.trim()) {
      setMsg("请输入店铺名称");
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    await addShop(newName.trim());
    setNewName("");
    setMsg(`已添加店铺「${newName.trim()}」`);
    setTimeout(() => setMsg(null), 2000);
    await loadShops();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) {
      setMsg("店铺名称不能为空");
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    await renameShop(id, editName.trim());
    setEditingId(null);
    setEditName("");
    setMsg("已重命名");
    setTimeout(() => setMsg(null), 2000);
    await loadShops();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (shops.length <= 1) {
      setMsg("至少保留一个店铺，无法删除");
      setTimeout(() => setMsg(null), 3000);
      setDeleteConfirm(null);
      return;
    }
    await deleteShop(deleteConfirm.id);
    setDeleteConfirm(null);
    setMsg(`已删除店铺「${deleteConfirm.name}」及其关联数据`);
    setTimeout(() => setMsg(null), 3000);
    await loadShops();
  };

  if (loading) {
    return <div className="text-sm text-foreground-500">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Shop Management
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">店铺管理</h1>
        <p className="text-[13px] text-foreground-500">
          管理店铺列表 · 新增、编辑、删除店铺 · 删除店铺时将同时清除该店铺的所有数据
        </p>
      </div>

      {/* ── 新增店铺 ── */}
      <Section
        title="新增店铺"
        icon="ri-add-circle-line"
        subtitle='自定义店铺名称，如"美国站一店""加拿大站""欧洲站"等'
      >
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="输入店铺名称..."
            className="flex-1 max-w-sm rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" aria-hidden /> 添加店铺
          </button>
        </div>
      </Section>

      {/* ── 店铺列表 ── */}
      <Section
        title="店铺列表"
        icon="ri-store-2-line"
        subtitle={`共 ${shops.length} 个店铺`}
      >
        {shops.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <i className="ri-store-2-line text-[40px] text-foreground-300" aria-hidden />
            <p className="mt-3 text-[13px] text-foreground-500">暂无店铺，请在上方添加</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                  <th className="border-b border-background-200 px-3 py-2.5">店铺名称</th>
                  <th className="border-b border-background-200 px-3 py-2.5">数据量</th>
                  <th className="border-b border-background-200 px-3 py-2.5">创建时间</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id} className="hover:bg-background-100/60">
                    <td className="border-b border-background-200/70 px-3 py-2.5">
                      {editingId === shop.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRename(shop.id); }}
                            className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRename(shop.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent-500 text-[14px] text-background-50 hover:bg-accent-600 cursor-pointer"
                            title="确认"
                          >
                            <i className="ri-check-line" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditName(""); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-foreground-400 hover:text-foreground-600 cursor-pointer"
                            title="取消"
                          >
                            <i className="ri-close-line" aria-hidden />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground-900">{shop.name}</span>
                          <span className="mono-num text-[11px] text-foreground-400">{shop.id}</span>
                        </div>
                      )}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5">
                      <Badge tone={shop.dataCount > 0 ? "primary" : "secondary"}>
                        {shop.dataCount} 条数据
                      </Badge>
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-[12px] text-foreground-500">
                      {new Date(shop.createdAt).toLocaleString()}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingId(shop.id); setEditName(shop.name); }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-foreground-400 hover:text-primary-600 hover:bg-background-100 cursor-pointer"
                          title="重命名"
                        >
                          <i className="ri-edit-line" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(shop)}
                          disabled={shops.length <= 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-red-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title={shops.length <= 1 ? "至少保留一个店铺" : "删除店铺"}
                        >
                          <i className="ri-delete-bin-line" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 消息提示 ── */}
      {msg && (
        <div className="fixed bottom-6 right-6 z-50 rounded-[14px] border border-accent-200/60 bg-accent-50/80 px-4 py-2.5 text-sm text-accent-800 shadow-lg backdrop-blur-xl">
          {msg}
        </div>
      )}

      {/* ── 删除确认弹窗 ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-background-50 p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mx-auto">
              <i className="ri-delete-bin-line text-[22px] text-red-500" aria-hidden />
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-[16px] font-bold text-foreground-950">删除店铺</h3>
              <p className="mt-2 text-[13px] text-foreground-600">
                确定要删除 <strong className="text-foreground-950">{deleteConfirm.name}</strong> 吗？
              </p>
              <p className="mt-1 text-[12px] text-red-600 font-medium">
                删除店铺将同时删除该店铺的所有数据，是否继续？
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-background-200 py-2 text-[13px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-red-500 py-2 text-[13px] font-semibold text-white hover:bg-red-600 cursor-pointer whitespace-nowrap"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}