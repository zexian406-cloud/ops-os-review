import { useEffect, useMemo, useState } from "react";
import {
  db,
  deleteWarehouseMapping,
  getAllSites,
  getAllWarehouseMappings,
  getWarehouseRegions,
  patchWarehouseMapping,
  reapplyWarehouseMappings,
  setWarehouseRegions,
  upsertWarehouseMapping,
} from "@/domain/db";
import type { Site, WarehouseMapping, WarehouseRegion, WarehouseRegionOption } from "@/domain/types";

/** 仓库名称 → 区域映射（参数中心内统一维护；导入仓库明细时自动匹配） */
export default function WarehouseMappingPanel() {
  const [mappings, setMappings] = useState<WarehouseMapping[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [regions, setRegions] = useState<WarehouseRegionOption[]>([]);
  const [newName, setNewName] = useState("");
  const [newRegion, setNewRegion] = useState<WarehouseRegion>("east");
  const [newSiteId, setNewSiteId] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newRegionName, setNewRegionName] = useState("");
  const [aliasDrafts, setAliasDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const [all, regionList] = await Promise.all([getAllWarehouseMappings(), getWarehouseRegions()]);
    all.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
    setMappings(all);
    setRegions(regionList);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => { getAllSites().then(setSites); }, []);

  const regionLabel = useMemo(() => {
    const m = new Map<string, string>();
    regions.forEach((r) => m.set(r.code, r.label));
    return m;
  }, [regions]);

  const siteLabel = useMemo(() => {
    const m = new Map<string, string>();
    sites.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sites]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await upsertWarehouseMapping(newName.trim(), newRegion, {
      siteId: newSiteId || null,
      alias: newAlias || null,
    });
    setNewName("");
    setNewAlias("");
    reload();
  };

  const handleUpdate = async (m: WarehouseMapping, region: WarehouseRegion) => {
    await upsertWarehouseMapping(m.warehouseName, region, {
      siteId: m.siteId ?? null,
      alias: m.alias ?? null,
    });
    reload();
  };

  const handleSiteChange = async (m: WarehouseMapping, siteId: string) => {
    await patchWarehouseMapping(m.id!, { siteId: siteId || null });
    reload();
  };

  const handleAliasSave = async (m: WarehouseMapping) => {
    const draft = aliasDrafts[m.id!];
    if (draft === undefined) return;
    await patchWarehouseMapping(m.id!, { alias: draft });
    setAliasDrafts((p) => {
      const next = { ...p };
      delete next[m.id!];
      return next;
    });
    reload();
  };

  const handleDelete = async (id: number) => {
    await deleteWarehouseMapping(id);
    reload();
  };

  const handleAddRegion = async () => {
    const name = newRegionName.trim();
    if (!name) return;
    if (regions.some((r) => r.code === name || r.label === name)) {
      setNewRegionName("");
      return;
    }
    await setWarehouseRegions([...regions, { code: name, label: name }]);
    setNewRegionName("");
    reload();
  };

  const handleDeleteRegion = async (code: string) => {
    // 预置四仓不可删；已使用的自定义区域删除后映射保留原值但下拉中不再出现
    if (["east", "west", "southeast", "southcentral"].includes(code)) return;
    await setWarehouseRegions(regions.filter((r) => r.code !== code));
    reload();
  };

  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null);
  const handleReapply = async () => {
    const count = await reapplyWarehouseMappings();
    setReapplyMsg(`已重新计算 ${count} 条库存记录的区域字段`);
    setTimeout(() => setReapplyMsg(null), 4000);
  };

  // 从已有的 warehouseBreakdown 中收集所有出现过的仓库名
  const [knownWarehouses, setKnownWarehouses] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const allInv = await db.inventoryLayer.toArray();
      const names = new Set<string>();
      allInv.forEach(inv => {
        inv.warehouseBreakdown?.forEach(wb => names.add(wb.warehouse));
      });
      setKnownWarehouses([...names].sort());
    })();
  }, []);

  if (loading) return <div className="text-[13px] text-foreground-500">加载中...</div>;

  const regionLabelOf = (code: string) => regionLabel.get(code) ?? code;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary-50/60 p-3 text-[12px] text-foreground-700">
        <i className="ri-information-line mr-1 text-primary-600" aria-hidden />
        导入仓库明细时，系统会按仓库名匹配区域（自动识别美东/美西/东南/中南）。匹配不到的仓库在这里手动指定。
        <b>适用站点</b>可选「通用」或某个站点——同名仓库可按站点分别映射（如美国站和加拿大站各自的海外仓互不影响）；
        <b>别名</b>用于在发货页等处替换显示原始仓库名；区域也可以自定义命名（如"加拿大东仓"）。
        修改映射后系统会自动重算已有库存数据的区域字段，无需重新导入。
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleReapply}
          className="rounded-[9px] bg-primary-600 px-3 py-1.5 text-[12px] text-white hover:bg-primary-700 cursor-pointer transition-colors"
        >
          <i className="ri-refresh-line mr-1" aria-hidden />
          重新应用映射
        </button>
        {reapplyMsg && (
          <span className="text-[12px] text-accent-600">{reapplyMsg}</span>
        )}
      </div>

      {/* 区域管理 */}
      <div className="rounded-lg border border-background-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-foreground-700">区域管理（{regions.length} 个）</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {regions.map((r) => {
            const isPreset = ["east", "west", "southeast", "southcentral"].includes(r.code);
            return (
              <span key={r.code} className="flex items-center gap-1 rounded-md bg-secondary-100 px-2 py-0.5 text-[11px] text-secondary-700">
                {r.label}
                {!isPreset && (
                  <button type="button" onClick={() => handleDeleteRegion(r.code)}
                    className="text-secondary-400 hover:text-red-500 cursor-pointer" aria-label={`删除区域 ${r.label}`}>
                    <i className="ri-close-line text-[12px]" aria-hidden />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newRegionName}
            onChange={(e) => setNewRegionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddRegion(); }}
            placeholder="添加自定义区域，如：加拿大东仓"
            className="w-56 rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[12px] focus:border-primary-400 focus:outline-none"
          />
          <button onClick={handleAddRegion} disabled={!newRegionName.trim()}
            className="rounded-md bg-secondary-600 px-3 py-1.5 text-[12px] text-white hover:bg-secondary-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
            添加区域
          </button>
        </div>
      </div>

      {/* 已有映射列表 */}
      {mappings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-background-200 text-left text-[11px] text-foreground-500 uppercase tracking-wider">
                <th className="py-2 pr-3 font-medium">仓库名称</th>
                <th className="py-2 pr-3 font-medium">适用站点</th>
                <th className="py-2 pr-3 font-medium">别名（显示名）</th>
                <th className="py-2 pr-3 font-medium">映射区域</th>
                <th className="py-2 pr-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-b border-background-100/60 hover:bg-background-50/50">
                  <td className="py-2 pr-3 font-mono text-[12px]">{m.warehouseName}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={m.siteId ?? ""}
                      onChange={(e) => handleSiteChange(m, e.target.value)}
                      className="rounded-md border border-background-300 bg-white px-2 py-1 text-[12px] text-foreground-800 focus:border-primary-400 focus:outline-none"
                    >
                      <option value="">通用（所有站点）</option>
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={aliasDrafts[m.id!] ?? m.alias ?? ""}
                      onChange={(e) => setAliasDrafts((p) => ({ ...p, [m.id!]: e.target.value }))}
                      onBlur={() => handleAliasSave(m)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      placeholder="留空用原名"
                      className="w-32 rounded-md border border-background-300 bg-white px-2 py-1 text-[12px] focus:border-primary-400 focus:outline-none"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={m.region}
                      onChange={(e) => handleUpdate(m, e.target.value as WarehouseRegion)}
                      className="rounded-md border border-background-300 bg-white px-2 py-1 text-[12px] text-foreground-800 focus:border-primary-400 focus:outline-none"
                    >
                      {regions.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => handleDelete(m.id!)}
                      className="text-[11px] text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-[12px] text-foreground-400 italic">
          还没有映射记录。导入仓库明细时会自动猜测区域，猜不到的在这里手动添加。
        </div>
      )}

      {/* 未映射的仓库名提示 */}
      {knownWarehouses.length > 0 && (
        <div className="rounded-lg border border-background-200 p-3">
          <div className="mb-2 text-[12px] font-medium text-foreground-700">
            已导入数据中出现过的仓库名（{knownWarehouses.length} 个）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {knownWarehouses.map(name => {
              const mapped = mappings.find(m => m.warehouseName === name && !m.siteId)
                ?? mappings.find(m => m.warehouseName === name);
              return (
                <span
                  key={name}
                  className={`mono-num rounded-md px-2 py-0.5 text-[11px] ${
                    mapped ? "bg-accent-100 text-accent-700" : "bg-secondary-100 text-secondary-700"
                  }`}
                  title={mapped
                    ? `已映射: ${regionLabelOf(mapped.region)}${mapped.siteId ? `（${siteLabel.get(mapped.siteId) ?? mapped.siteId}）` : "（通用）"}`
                    : "未映射"}
                >
                  {name} {mapped ? `→ ${regionLabelOf(mapped.region)}` : "⚠️ 未映射"}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 手动添加映射 */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-background-200 p-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-foreground-600">仓库名称</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="如：乐歌(新) CAP"
            list="warehouse-suggestions"
            className="w-full rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-primary-400 focus:outline-none"
          />
          <datalist id="warehouse-suggestions">
            {knownWarehouses.map(w => <option key={w} value={w} />)}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-foreground-600">适用站点</label>
          <select
            value={newSiteId}
            onChange={(e) => setNewSiteId(e.target.value)}
            className="rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-primary-400 focus:outline-none"
          >
            <option value="">通用</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-foreground-600">别名</label>
          <input
            type="text"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="可选"
            className="w-28 rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-primary-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-foreground-600">区域</label>
          <select
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value as WarehouseRegion)}
            className="rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-primary-400 focus:outline-none"
          >
            {regions.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="rounded-[9px] bg-primary-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          添加映射
        </button>
      </div>
    </div>
  );
}
