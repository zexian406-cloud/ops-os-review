import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const SIDEBAR_COLLAPSED_KEY = "aos-sidebar-collapsed";

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  // 移动端（<768px）抽屉导航
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <div className="relative flex h-screen w-full bg-background-50 text-foreground-950 overflow-hidden">
      {/* 桌面侧边栏（<768px 隐藏，由移动抽屉替代） */}
      <div className="relative z-10 hidden shrink-0 md:flex">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* 移动端抽屉：遮罩 + 侧边导航 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex shadow-2xl">
            <Sidebar
              collapsed={false}
              onToggle={() => {}}
              mobile
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto min-h-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}