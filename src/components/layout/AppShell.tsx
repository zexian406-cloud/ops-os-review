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
      {/* 桌面侧边栏 */}
      <div className="relative z-10 flex shrink-0">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* 主内容区域 */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto min-h-full max-w-[1600px] px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}