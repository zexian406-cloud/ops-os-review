import { useSearchParams, Link } from 'react-router-dom';

export default function DiagnosisPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') ?? '';
  const sku = searchParams.get('sku') ?? '';

  const typeLabels: Record<string, string> = {
    stock: '库存健康',
    profit: '利润分析',
    ad: '广告效率',
    rating: '评分管理',
    return: '退货退款',
    listing: 'Listing 优化',
  };

  const typeLabel = typeLabels[type] ?? '全部告警';

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <i className="ri-search-eye-line text-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">异常诊断</h1>
          <p className="text-sm text-foreground-500">
            {sku ? `SKU: ${sku} · ` : ''}
            {typeLabel}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
        <div className="text-center py-12">
          <i className="ri-clipboard-line text-4xl text-foreground-300" />
          <p className="mt-4 text-foreground-600">
            {sku
              ? `SKU ${sku} 的 ${typeLabel}诊断报告`
              : '选择一个 SKU 或告警类型以查看诊断详情'}
          </p>
          <p className="mt-2 text-sm text-foreground-400">
            在 SKU 详情页点击告警卡片的「去诊断页」链接，即可查看针对性的诊断建议
          </p>
          <Link
            to="/operations"
            className="mt-6 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            返回运营中心
          </Link>
        </div>
      </div>
    </div>
  );
}
