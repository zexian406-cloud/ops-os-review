import { Link } from 'react-router-dom';

export default function DataHealthPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
          <i className="ri-heart-pulse-line text-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">数据健康</h1>
          <p className="text-sm text-foreground-500">导入数据质量检查与完整性验证</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
          <div className="text-sm text-foreground-500">数据完整性</div>
          <div className="mt-2 text-3xl font-bold text-accent-600">--</div>
          <div className="mt-2 text-xs text-foreground-400">待导入数据后显示</div>
        </div>
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
          <div className="text-sm text-foreground-500">字段覆盖率</div>
          <div className="mt-2 text-3xl font-bold text-primary-600">--</div>
          <div className="mt-2 text-xs text-foreground-400">检查 MSKU、评分、广告费比等关键字段</div>
        </div>
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
          <div className="text-sm text-foreground-500">异常值检测</div>
          <div className="mt-2 text-3xl font-bold text-secondary-600">--</div>
          <div className="mt-2 text-xs text-foreground-400">自动识别超出合理范围的数据</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-background-200/70 bg-background-50 p-6">
        <h2 className="text-lg font-semibold text-foreground-900">使用说明</h2>
        <ul className="mt-3 space-y-2 text-sm text-foreground-600">
          <li>
            <i className="ri-checkbox-circle-line mr-1 text-accent-500" />
            前往「数据导入」页面上传 Excel 文件
          </li>
          <li>
            <i className="ri-checkbox-circle-line mr-1 text-accent-500" />
            导入后系统会自动检查数据完整性和质量
          </li>
          <li>
            <i className="ri-checkbox-circle-line mr-1 text-accent-500" />
            查看健康度报告，识别需要补充的数据
          </li>
        </ul>
        <Link
          to="/import"
          className="mt-4 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          前往数据导入
        </Link>
      </div>
    </div>
  );
}
