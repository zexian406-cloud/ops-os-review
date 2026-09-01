import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ensureDatabaseOpen, ensureDefaultSites } from "./domain/db";

function App() {
  const [ready, setReady] = useState(false);
  const [bootErr, setBootErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 恢复主题偏好
        const saved = localStorage.getItem("aos-theme");
        if (saved === "dark") {
          document.documentElement.classList.add("dark");
        } else if (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          document.documentElement.classList.add("dark");
        }

        // 先确保数据库可打开（旧库主键冲突会在此自动重建恢复)，再初始化站点
        await ensureDatabaseOpen();
        // 确保默认站点在组件渲染前初始化
        await ensureDefaultSites();

        setReady(true);
      } catch (err) {
        console.error("应用初始化失败：", err);
        setBootErr(String((err as Error)?.message ?? err));
      }
    })();
  }, []);

  if (bootErr) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-50 text-foreground-500 px-6">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <i className="ri-alert-line text-3xl text-danger-600" aria-hidden />
          <span className="text-sm font-medium text-foreground-800">应用初始化失败</span>
          <span className="text-xs break-all">{bootErr}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-50 text-foreground-500">
        <div className="flex flex-col items-center gap-3">
          <i className="ri-loader-4-line animate-spin text-2xl text-foreground-800" aria-hidden />
          <span className="text-sm">正在加载 Amazon Ops OS...</span>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter basename={__BASE_PATH__}>
          <AppRoutes />
        </BrowserRouter>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default App;