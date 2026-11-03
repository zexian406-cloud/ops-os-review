import { useEffect, useState, useRef } from "react";
import { getCloudConfig } from "@/domain/db";
import { pushToGitHub } from "@/domain/cloud";
import { exportAllData } from "@/domain/export";
import { exportAllCsv } from "@/domain/export-csv";
import type { CloudConfig } from "@/domain/types";
import { useNavigate } from "react-router-dom";
import SiteSwitcher from "./SiteSwitcher";
import ShopFilter from "./ShopFilter";

export default function Topbar({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) {
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
    // 未配置云端：跳到数据导入页顶部的云端配置区块并高亮展开
    if (!cloud) { navigate("/import?cloud=1"); return; }
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
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2 border-b border-background-200/60 bg-background-50/75 px-3 backdrop-blur-2xl sm:gap-3 sm:px-6">
      {/* 移动端汉堡菜单（<768px 显示） */}
      {onOpenMobileMenu && (
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="apple-btn-ghost inline-flex h-8 w-8 shrink-0 items-center justify-center md:hidden"
          aria-label="打开导航菜单"
        >
          <i className="ri-menu-line text-lg" aria-hidden />
        </button>
      )}

      <div className="hidden flex-col leading-tight sm:flex">
        <div className="font-heading text-[14px] font-semibold text-foreground-950 tracking-tight">
          今日运营
        </div>
        <div className="text-[11px] text-foreground-400">
          {dateLabel} · {weekLabel} · 数据来源：本地 IndexedDB
        </div>
      </div>

      <SiteSwitcher />
        <div className="hidden sm:block"><ShopFilter /></div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
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
          className="apple-btn-ghost inline-flex h-8 w-8 items-center justify-center px-0 whitespace-nowrap md:px-3 md:w-auto"
          title={dark ? "切换到日间模式" : "切换到夜间模式"}
        >
          <i className={dark ? "ri-sun-line" : "ri-moon-line"} aria-hidden />
        </button>

        <button
          type="button"
          onClick={handleCloudSave}
          disabled={saving}
          className="apple-btn-ghost inline-flex h-8 items-center justify-center gap-1.5 px-2 whitespace-nowrap md:px-3"
        >
          <i className={saving ? "ri-loader-4-line animate-spin" : "ri-cloud-line"} aria-hidden />
          <span className="hidden md:inline">{cloud ? (saving ? "保存中..." : "云端保存") : "配置云端"}</span>
        </button>

        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={exporting || exportCsv}
            className="apple-btn-ghost inline-flex h-8 items-center justify-center gap-1.5 px-2 whitespace-nowrap md:px-3"
          >
            <i className={exporting || exportCsv ? "ri-loader-4-line animate-spin" : "ri-download-2-line"} aria-hidden />
            <span className="hidden md:inline">{exporting ? "导出中..." : exportCsv ? "CSV导出中..." : "导出数据"}</span>
            <i className="ri-arrow-down-s-line hidden text-[10px] ml-0.5 md:inline" aria-hidden />
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
          className="apple-btn inline-flex h-8 items-center justify-center gap-1.5 px-2.5 whitespace-nowrap md:px-4"
        >
          <i className="ri-upload-2-line" aria-hidden />
          <span className="hidden md:inline">导入运营表</span>
        </button>
      </div>

      {toast && (
        <div
          className={[
            "fixed right-4 top-16 z-[60] rounded-[14px] border px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl sm:right-6 sm:top-20",
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