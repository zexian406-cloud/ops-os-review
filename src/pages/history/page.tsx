import { Link } from 'react-router-dom';

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <i className="ri-history-line text-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">历史对比</h1>
          <p className="text-sm text-foreground-500">本周 vs 上周数据对比分析</p>
        </div>
      </div>

      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
        <div className="text-center py-12">
          <i className="ri-bar-chart-box-line text-4xl text-foreground-300" />
          <p className="mt-4 text-foreground-600">选择时间范围进行历史对比</p>
          <p className="mt-2 text-sm text-foreground-400">
            在 SKU 详情页可以查看单个 SKU 的历史变化对比
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to="/operations"
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              返回运营中心
            </Link>
            <Link
              to="/import"
              className="rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100"
            >
              前往数据导入
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-background-50 p-4 text-center">
          <div className="text-xs text-foreground-500">日均销量</div>
          <div className="mt-1 text-lg font-semibold text-foreground-900">--</div>
        </div>
        <div className="rounded-xl bg-background-50 p-4 text-center">
          <div className="text-xs text-foreground-500">库存周转</div>
          <div className="mt-1 text-lg font-semibold text-foreground-900">--</div>
        </div>
        <div className="rounded-xl bg-background-50 p-4 text-center">
          <div className="text-xs text-foreground-500">利润率</div>
          <div className="mt-1 text-lg font-semibold text-foreground-900">--</div>
        </div>
        <div className="rounded-xl bg-background-50 p-4 text-center">
          <div className="text-xs text-foreground-500">广告费比</div>
          <div className="mt-1 text-lg font-semibold text-foreground-900">--</div>
        </div>
      </div>
    </div>
  );
}
