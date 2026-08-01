import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, getCompetitors, addCompetitor, updateCompetitor, deleteCompetitor } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { CompetitorRecord, SkuMaster } from "@/domain/types";

const today = () => new Date().toISOString().slice(0, 10);

interface FormState {
  id?: string;
  sku?: string;
  competitorName: string;
  competitorAsin: string;
  date: string;
  price: string;
  rating: string;
  reviewCount: string;
  coupon: string;
  note: string;
}

const emptyForm = (sku?: string, skuName?: string): FormState => ({
  sku,
  competitorName: "",
  competitorAsin: "",
  date: today(),
  price: "",
  rating: "",
  reviewCount: "",
  coupon: "",
  note: "",
});

export default function CompetitorsPage() {
  const [records, setRecords] = useState<CompetitorRecord[]>([]);
  const [skuMaster, setSkuMaster] = useState<SkuMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [filterSku, setFilterSku] = useState<string>("all");

  const reload = async () => {
    const [recs, sm] = await Promise.all([getCompetitors(), db.skuMaster.toArray()]);
    setRecords(recs);
    setSkuMaster(sm);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const skuOptions = useMemo(() => skuMaster.filter((s) => s.saleStatus !== "discontinued"), [skuMaster]);

  const filtered = useMemo(() => {
    if (filterSku === "all") return records;
    return records.filter((r) => (r.sku ?? "") === filterSku);
  }, [records, filterSku]);

  const openNew = (sku?: string, skuName?: string) => {
    setEditing(emptyForm(sku, skuName));
    setShowForm(true);
  };
  const openEdit = (rec: CompetitorRecord) => {
    setEditing({
      id: rec.id,
      sku: rec.sku,
      competitorName: rec.competitorName,
      competitorAsin: rec.competitorAsin ?? "",
      date: rec.date,
      price: rec.price != null ? String(rec.price) : "",
      rating: rec.rating != null ? String(rec.rating) : "",
      reviewCount: rec.reviewCount != null ? String(rec.reviewCount) : "",
      coupon: rec.coupon != null ? String(rec.coupon) : "",
      note: rec.note ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!editing || !editing.competitorName.trim()) return;
    const payload = {
      sku: editing.sku || undefined,
      skuName: editing.sku ? skuMaster.find((s) => s.sku === editing.sku)?.name : undefined,
      competitorName: editing.competitorName.trim(),
      competitorAsin: editing.competitorAsin.trim() || undefined,
      date: editing.date,
      price: editing.price ? Number(editing.price) : undefined,
      rating: editing.rating ? Number(editing.rating) : undefined,
      reviewCount: editing.reviewCount ? Number(editing.reviewCount) : undefined,
      coupon: editing.coupon ? Number(editing.coupon) : undefined,
      note: editing.note.trim() || undefined,
    };
    if (editing.id) {
      await updateCompetitor(editing.id, payload);
    } else {
      await addCompetitor(payload);
    }
    setShowForm(false);
    setEditing(null);
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteCompetitor(id);
    await reload();
  };

  if (loading) return <div className="text-sm text-foreground-400">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-foreground-950">竞品记录</h1>
          <p className="mt-1 text-[13px] text-foreground-500">
            手动记录竞品变化（价格 / 评分 / Review / Coupon），与自家 SKU 关联对比
          </p>
        </div>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-1.5 rounded-[12px] bg-primary-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-700 cursor-pointer"
        >
          <i className="ri-add-line" aria-hidden />
          新增竞品记录
        </button>
      </div>

      {records.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-foreground-400">关联自家 SKU：</span>
          <select
            value={filterSku}
            onChange={(e) => setFilterSku(e.target.value)}
            className="rounded-lg border border-background-300 bg-background-50 px-3 py-1.5 text-[13px] focus:border-primary-500 focus:outline-none cursor-pointer"
          >
            <option value="all">全部</option>
            {skuOptions.map((s) => (
              <option key={s.sku} value={s.sku}>{s.sku}{s.name ? ` · ${s.name}` : ""}</option>
            ))}
          </select>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState
          icon="ri-spy-line"
          title="还没有竞品记录"
          desc="点击右上角「新增竞品记录」，开始追踪竞品的价格、评分和促销变化"
          action={
            <button onClick={() => openNew()} className="apple-btn mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium cursor-pointer">
              <i className="ri-add-line" aria-hidden /> 新增竞品记录
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((rec) => (
            <div key={rec.id} className="glass-card group relative p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-foreground-900 truncate">{rec.competitorName}</div>
                  {rec.competitorAsin && <div className="mt-0.5 text-[11px] text-foreground-400">ASIN: {rec.competitorAsin}</div>}
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openEdit(rec)} className="text-[14px] text-foreground-400 hover:text-primary-600 cursor-pointer"><i className="ri-edit-line" aria-hidden /></button>
                  <button onClick={() => handleDelete(rec.id)} className="text-[14px] text-foreground-300 hover:text-red-500 cursor-pointer"><i className="ri-delete-bin-line" aria-hidden /></button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <Metric label="价格" value={rec.price != null ? `$${rec.price}` : "—"} />
                <Metric label="评分" value={rec.rating != null ? `${rec.rating}` : "—"} />
                <Metric label="Review" value={rec.reviewCount != null ? `${rec.reviewCount}` : "—"} />
                <Metric label="Coupon" value={rec.coupon != null ? `$${rec.coupon}` : "—"} />
              </div>

              {rec.note && <div className="mt-3 rounded-[10px] bg-background-50/70 px-3 py-2 text-[12px] text-foreground-600">{rec.note}</div>}

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-foreground-400">{rec.date}</span>
                {rec.sku && (
                  <Link to={`/sku/${encodeURIComponent(rec.sku)}`} className="text-[11px] font-medium text-primary-600 hover:underline">
                    关联 {rec.sku}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 表单弹窗 */}
      {showForm && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-background-50 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-[16px] font-semibold text-foreground-950">{editing.id ? "编辑竞品记录" : "新增竞品记录"}</h3>
              <button onClick={() => setShowForm(false)} className="text-[18px] text-foreground-400 hover:text-foreground-700 cursor-pointer"><i className="ri-close-line" aria-hidden /></button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="竞品名称 / 标识" required>
                <input value={editing.competitorName} onChange={(e) => setEditing({ ...editing, competitorName: e.target.value })} placeholder="如：竞品A / 核心ASIN" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" />
              </Field>
              <Field label="竞品 ASIN">
                <input value={editing.competitorAsin} onChange={(e) => setEditing({ ...editing, competitorAsin: e.target.value })} placeholder="选填" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" />
              </Field>
              <Field label="关联自家 SKU">
                <select value={editing.sku ?? ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value || undefined })} className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none cursor-pointer">
                  <option value="">不关联</option>
                  {skuOptions.map((s) => (<option key={s.sku} value={s.sku}>{s.sku}{s.name ? ` · ${s.name}` : ""}</option>))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="日期"><input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" /></Field>
                <Field label="价格 ($)"><input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} inputMode="decimal" placeholder="选填" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" /></Field>
                <Field label="评分"><input value={editing.rating} onChange={(e) => setEditing({ ...editing, rating: e.target.value })} inputMode="decimal" placeholder="选填" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" /></Field>
                <Field label="Review 数量"><input value={editing.reviewCount} onChange={(e) => setEditing({ ...editing, reviewCount: e.target.value })} inputMode="numeric" placeholder="选填" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" /></Field>
              </div>
              <Field label="Coupon ($)"><input value={editing.coupon} onChange={(e) => setEditing({ ...editing, coupon: e.target.value })} inputMode="decimal" placeholder="选填" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" /></Field>
              <Field label="变化备注"><textarea value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} rows={2} placeholder="如：降价 $2，开启大额 Coupon" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" /></Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-background-300 px-4 py-2 text-[13px] text-foreground-600 hover:bg-background-100 cursor-pointer">取消</button>
              <button onClick={handleSave} disabled={!editing.competitorName.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-700 cursor-pointer disabled:opacity-40">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-foreground-600">{label}{required && <span className="text-red-500"> *</span>}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-background-50/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-400">{label}</div>
      <div className="mono-num mt-0.5 text-[15px] font-bold text-foreground-900">{value}</div>
    </div>
  );
}
