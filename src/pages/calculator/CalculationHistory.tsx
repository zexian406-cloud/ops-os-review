import { useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import type { CalculationRecord } from "@/domain/types";
import { db } from "@/domain/db";

interface Props {
  records: CalculationRecord[];
  onRefresh: () => void;
}

const CURRENCY: Record<string, string> = {
  US: "$", UK: "£", DE: "€", JP: "¥", CA: "C$", AU: "A$",
};

export default function CalculationHistory({ records, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const deleteRecord = async (id: string) => {
    await db.calculationRecords.delete(id);
    onRefresh();
    setMsg("已删除");
    setTimeout(() => setMsg(null), 1500);
  };

  const exportToExcel = () => {
    if (records.length === 0) return;

    const cur = (rec: CalculationRecord) => CURRENCY[rec.marketplace] ?? "$";

    const rows = records.map((rec, i) => ({
      "序号": i + 1,
      "品名": rec.name || "未命名",
      "SKU": rec.sku || "",
      "ASIN": rec.asin || "",
      "站点": rec.marketplace,
      "配送方式": rec.deliveryMode,
      "方案名称": rec.schemeName || "",
      "最优方案": rec.isBestScheme ? "是" : "",
      "售价": Number(rec.price.toFixed(2)),
      "FOB折合": Number(rec.costFob.toFixed(2)),
      "头程费": Number(rec.costShipping.toFixed(2)),
      "配送费": Number(rec.costDelivery.toFixed(2)),
      "佣金": Number(rec.costCommission.toFixed(2)),
      "仓储费": Number(rec.costStorage.toFixed(2)),
      "广告费": Number(rec.costAd.toFixed(2)),
      "退货费": Number(rec.costReturn.toFixed(2)),
      "优惠券": Number(rec.coupon.toFixed(2)),
      "总成本": Number(rec.totalCost.toFixed(2)),
      "净利": Number(rec.grossProfit.toFixed(2)),
      "净利率(%)": Number(rec.grossMargin.toFixed(1)),
      "ROI(%)": Number(rec.roi.toFixed(1)),
      "备注": rec.notes || "",
      "创建时间": new Date(rec.createdAt).toLocaleString("zh-CN"),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(8, k.length * 2 + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "测算记录");
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `新品测算记录_${dateStr}.xlsx`);

    setMsg(`已导出 ${records.length} 条记录`);
    setTimeout(() => setMsg(null), 2000);
  };

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-background-200/70 bg-background-100/50 px-4 py-8 text-center text-[13px] text-foreground-500">
        <i className="ri-history-line mb-2 block text-[28px] text-foreground-300" aria-hidden />
        暂无测算记录，保存后将在此显示
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {msg && (
        <div className="rounded-lg bg-accent-100 px-3 py-1.5 text-[12px] text-accent-800">{msg}</div>
      )}

      {/* 导出按钮 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportToExcel}
          className="inline-flex items-center gap-1.5 rounded-md border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-600 hover:border-primary-400 hover:text-primary-700 cursor-pointer transition-colors"
        >
          <i className="ri-download-2-line" aria-hidden /> 导出 Excel
        </button>
      </div>

      {records.map((rec) => {
        const isOpen = expanded === rec.id;
        const cur = CURRENCY[rec.marketplace] ?? "$";
        return (
          <div key={rec.id} className="rounded-xl border border-background-200/70 bg-background-50 overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background-100/60"
              onClick={() => setExpanded(isOpen ? null : rec.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-foreground-900">{rec.name || "未命名"}</span>
                  {rec.schemeName && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      rec.isBestScheme
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-background-200 text-foreground-600"
                    }`}>
                      {rec.isBestScheme && <i className="ri-medal-line mr-0.5" aria-hidden />}
                      {rec.schemeName}
                    </span>
                  )}
                  {rec.sku && (
                    <Link
                      to={`/sku/${encodeURIComponent(rec.sku)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-200 cursor-pointer"
                    >
                      {rec.sku}
                    </Link>
                  )}
                  <span className="rounded bg-background-200 px-1.5 py-0.5 text-[10px] font-medium text-foreground-600">{rec.deliveryMode}</span>
                  <span className="text-[11px] text-foreground-400">{rec.marketplace}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px]">
                  <span className="text-foreground-500">售价 <strong className="mono-num text-foreground-800">{cur}{rec.price.toFixed(2)}</strong></span>
                  <span className="text-foreground-500">净利 <strong className={`mono-num ${rec.grossProfit >= 0 ? "text-accent-700" : "text-red-600"}`}>{cur}{rec.grossProfit.toFixed(2)}</strong></span>
                  <span className="text-foreground-500">利润率 <strong className={`mono-num ${rec.grossMargin >= 0 ? "text-accent-700" : "text-red-600"}`}>{rec.grossMargin.toFixed(1)}%</strong></span>
                  <span className="text-foreground-500">ROI <strong className="mono-num text-foreground-700">{rec.roi.toFixed(1)}%</strong></span>
                  <span className="text-foreground-400">{new Date(rec.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <i className={`${isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-foreground-400 text-[16px]`} aria-hidden />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteRecord(rec.id!); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-foreground-400 hover:bg-red-50 hover:text-red-500 cursor-pointer"
                >
                  <i className="ri-delete-bin-line" aria-hidden />
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-background-200/70 bg-background-100/40 px-4 py-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 text-[12px]">
                  {[
                    { label: "售价", value: `${cur}${rec.price.toFixed(2)}` },
                    { label: "FOB折合", value: `${cur}${rec.costFob.toFixed(2)}` },
                    { label: "头程费", value: `${cur}${rec.costShipping.toFixed(2)}` },
                    { label: "配送费", value: `${cur}${rec.costDelivery.toFixed(2)}` },
                    { label: "佣金", value: `${cur}${rec.costCommission.toFixed(2)}` },
                    { label: "仓储费", value: `${cur}${rec.costStorage.toFixed(2)}` },
                    { label: "广告费", value: `${cur}${rec.costAd.toFixed(2)}` },
                    { label: "退货费", value: `${cur}${rec.costReturn.toFixed(2)}` },
                    { label: "优惠券", value: `${cur}${rec.coupon.toFixed(2)}` },
                    { label: "总成本", value: `${cur}${rec.totalCost.toFixed(2)}` },
                    { label: "净利", value: `${cur}${rec.grossProfit.toFixed(2)}` },
                    { label: "净利率", value: `${rec.grossMargin.toFixed(1)}%` },
                    { label: "ROI", value: `${rec.roi.toFixed(1)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-background-50 px-2.5 py-2">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-foreground-500">{label}</div>
                      <div className="mono-num mt-0.5 text-[14px] font-semibold text-foreground-900">{value}</div>
                    </div>
                  ))}
                </div>
                {rec.notes && (
                  <div className="mt-2 rounded-lg bg-background-50 px-3 py-2 text-[12px] text-foreground-600">
                    <i className="ri-sticky-note-line mr-1" aria-hidden />{rec.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
