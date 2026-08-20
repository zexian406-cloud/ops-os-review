import { useEffect, useState, useRef } from "react";
import { getCloudConfig } from "@/domain/db";
import { pushToGitHub } from "@/domain/cloud";
import { exportAllData } from "@/domain/export";
import { exportAllCsv } from "@/domain/export-csv";
import type { CloudConfig } from "@/domain/types";
import { useNavigate } from "react-router-dom";
import SiteSwitcher from "./SiteSwitcher";
import ShopFilter from "./ShopFilter";
import SiteSwitcher from "./SiteSwitcher";
import ShopFilter from "./ShopFilter";
import SiteSwitcher from "./SiteSwitcher";
import ShopFilter from "./ShopFilter";
import SiteSwitcher from "./SiteSwitcher";
import ShopFilter from "./ShopFilter";

export default function Topbar() {
  const navigate = useNavigate();
  const [cloud, setCloud] = useState<CloudConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportCsv, setExportCsv] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("aos-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("aos-theme", "light");
    }
  };

  useEffect(() => { getCloudConfig().then(setCloud); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  const handleCloudSave = async () => {
    if (!cloud) { navigate("/import"); return; }
    setSaving(true);
    try {
      await pushToGitHub(cloud);
      const updated = await getCloudConfig();
      setCloud(updated);
      setToast({ tone: "ok", msg: "已保存到 GitHub 云端" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ tone: "err", msg: `云端保存失败：${msg.slice(0, 80)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (format: "xlsx" | "csv") => {
    if (format === "csv") {
      setExportCsv(true);
      try {
        await exportAllCsv();
        setToast({ tone: "ok", msg: "CSV 数据导出完成（6 个文件）" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast({ tone: "err", msg: `CSV 导出失败：${msg.slice(0, 80)}` });
      } finally { setExportCsv(false); }
    } else {
      setExporting(true);
      try {
        await exportAllData();
        setToast({ tone: "ok", msg: "Excel 数据导出完成" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast({ tone: "err", msg: `导出失败：${msg.slice(0, 80)}` });
      } finally { setExporting(false); }
    }
    setShowExportMenu(false);
  };

  const today = new Date();
  const dateLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  const weekLabel = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][today.getDay()];

  return (
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-3 border-b border-background-200/60 bg-background-50/75 px-6 backdrop-blur-2xl">
      <div className="flex flex-col leading-tight">
        <div className="font-heading text-[14px] font-semibold text-foreground-950 tracking-tight">
          今日运营
        </div>
        <div className="text-[11px] text-foreground-400">
          {dateLabel} · {weekLabel} · 数据来源：本地 IndexedDB
        </div>
      </div>

      <SiteSwitcher />
        <ShopFilter />
        <SiteSwitcher />
        <ShopFilter />
        <SiteSwitcher />
        <ShopFilter />
        <SiteSwitcher />
        <ShopFilter />
        <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full bg-white/50 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-foreground-500 border border-black/5 lg:inline-flex">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500" />
          本地已自动保存
        </span>

        {cloud?.lastSyncAt && (
          <span className="hidden text-[11px] text-foreground-400 md:inline-flex">
            上次云端：{new Date(cloud.lastSyncAt).toLocaleString()}
          </span>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="apple-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 whitespace-nowrap"
          title={dark ? "切换到日间模式" : "切换到夜间模式"}
        >
          <i className={dark ? "ri-sun-line" : "ri-moon-line"} aria-hidden />
        </button>

        <button
          type="button"
          onClick={handleCloudSave}
          disabled={saving}
          className="apple-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 whitespace-nowrap"
        >
          <i className={saving ? "ri-loader-4-line animate-spin" : "ri-cloud-line"} aria-hidden />
          {cloud ? (saving ? "保存中..." : "云端保存") : "配置云端"}
        </button>

        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={exporting || exportCsv}
            className="apple-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 whitespace-nowrap"
          >
            <i className={exporting || exportCsv ? "ri-loader-4-line animate-spin" : "ri-download-2-line"} aria-hidden />
            {exporting ? "导出中..." : exportCsv ? "CSV导出中..." : "导出数据"}
            <i className="ri-arrow-down-s-line text-[10px] ml-0.5" aria-hidden />
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-[14px] border border-background-200/60 bg-background-50/85 backdrop-blur-2xl py-1 shadow-lg shadow-black/5 z-50">
              <button
                type="button"
                onClick={() => handleExport("csv")}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground-600 hover:bg-white/50 hover:text-foreground-800 cursor-pointer text-left whitespace-nowrap"
              >
                <i className="ri-file-text-line text-sm text-accent-600" aria-hidden />
                导出全部 CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport("xlsx")}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground-600 hover:bg-white/50 hover:text-foreground-800 cursor-pointer text-left whitespace-nowrap"
              >
                <i className="ri-file-excel-2-line text-sm text-foreground-700" aria-hidden />
                导出 Excel 打包
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/import")}
          className="apple-btn inline-flex items-center gap-1.5 px-4 py-1.5 whitespace-nowrap"
        >
          <i className="ri-upload-2-line" aria-hidden />
          导入运营表
        </button>
      </div>

      {toast && (
        <div
          className={[
            "fixed right-6 top-20 z-50 rounded-[14px] border px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl",
            toast.tone === "ok"
              ? "border-emerald-200/60 bg-emerald-50/80 text-emerald-700"
              : "border-red-200/60 bg-red-50/80 text-red-600",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}
    </header>
  );
}