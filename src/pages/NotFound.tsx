import { Link, useLocation } from "react-router-dom";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
      <h1 className="pointer-events-none absolute bottom-0 z-0 select-none text-9xl font-black text-background-200/60 md:text-[12rem]" aria-hidden>
        404
      </h1>
      <div className="relative z-10 max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <i className="ri-compass-3-line text-2xl" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-foreground-900 md:text-2xl">页面不存在</h1>
        <p className="mt-2 break-all font-mono text-sm text-foreground-400">{location.pathname}</p>
        <p className="mt-3 text-sm text-foreground-500">链接可能已失效、输入有误，或该功能已迁移到其它入口。</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <i className="ri-home-4-line" aria-hidden />
            返回运营一览
          </Link>
          <Link
            to="/operations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
          >
            <i className="ri-alarm-warning-line" aria-hidden />
            去异常中心
          </Link>
        </div>
      </div>
    </div>
  );
}
