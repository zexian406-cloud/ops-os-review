import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import HealthReport from '@/components/health/HealthReport';
import { getLatestHealthReport } from '@/domain/db';
import { computeHealthMetrics } from '@/domain/data-health';
import type { ValidationResult } from '@/domain/data-health';

interface StoredReport extends ValidationResult {
  savedAt?: string;
}

export default function DataHealthPage() {
  const [report, setReport] = useState<StoredReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await getLatestHealthReport<StoredReport>();
      setReport(r);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
          <i className="ri-heart-pulse-line text-xl" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground-950">数据健康</h1>
          <p className="text-sm text-foreground-500">导入数据质量检查与完整性验证</p>
        </div>
        {report?.savedAt && (
          <div className="text-right text-[12px] text-foreground-500">
            最近一次导入
            <div className="font-semibold text-foreground-700">
              {new Date(report.savedAt).toLocaleString('zh-CN')}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-12 text-center text-[13px] text-foreground-500">
          加载中...
        </div>
      ) : report ? (
        <DataHealthContent report={report} />
      ) : (
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
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

          <div className="mt-6 rounded-2xl border border-background-200/70 bg-background-100/60 p-6 text-center">
            <i className="ri-inbox-line text-4xl text-foreground-300" />
            <p className="mt-3 text-[14px] font-medium text-foreground-700">尚无导入记录</p>
            <p className="mt-1 text-[12px] text-foreground-500">
              前往「数据导入」页面上传 Excel，导入完成后将自动生成健康报告
            </p>
            <Link
              to="/import"
              className="mt-4 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              <i className="ri-upload-cloud-2-line mr-1" aria-hidden />
              前往数据导入
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-background-200/70 bg-background-100/60 p-6">
        <h2 className="text-[14px] font-semibold text-foreground-900">校验规则说明</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-background-200 text-left text-[11px] uppercase tracking-wider text-foreground-500">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">检查项</th>
                <th className="py-2 pr-3 font-medium">规则</th>
                <th className="py-2 pr-3 font-medium">处理方式</th>
                <th className="py-2 pr-3 font-medium">类型</th>
              </tr>
            </thead>
            <tbody className="text-foreground-700">
              <RuleRow id={1} name="SKU 为空" rule="SKU 列的值为空" action="跳过该行" type="错误" />
              <RuleRow id={2} name="发货方式为空" rule="值不在 [FBA/FBM/mixed] 中" action="跳过该行" type="错误" />
              <RuleRow id={3} name="FBA 库存为负" rule="数值 < 0" action="修正为 0" type="警告" />
              <RuleRow id={4} name="FBM 库存为负" rule="数值 < 0" action="修正为 0" type="警告" />
              <RuleRow id={5} name="日均销量为负" rule="7天/30天销量 < 0" action="修正为 0" type="警告" />
              <RuleRow id={6} name="售价 ≤ 0" rule="售价为空/0/负数" action="写入但标记异常" type="警告" />
              <RuleRow id={7} name="评分超出 0-5" rule="评分 < 0 或 > 5" action="写入，数值标红" type="警告" />
              <RuleRow id={8} name="FOB 为空" rule="FOB 列无值" action="写入，标记利润估算" type="提示" />
              <RuleRow id={9} name="LeadTime 为空" rule="交期列无值" action="使用默认值 40 天" type="提示" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ────────── 数据健康内容（有报告时展示） ────────── */

function DataHealthContent({ report }: { report: StoredReport }) {
  const metrics = useMemo(() => computeHealthMetrics(report), [report]);

  const integrityNum = parseFloat(metrics.integrity.value);
  const coverageNum = parseFloat(metrics.fieldCoverage.value);
  const outlierNum = parseInt(metrics.outliers.value, 10) || 0;

  const integrityTone = integrityNum >= 95 ? "accent" : integrityNum >= 70 ? "primary" : "red";
  const coverageTone = coverageNum >= 80 ? "primary" : coverageNum >= 60 ? "secondary" : "red";
  const outlierTone = outlierNum === 0 ? "accent" : "red";

  return (
    <div className="space-y-4">
      {/* 三张指标卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="数据完整性"
          value={metrics.integrity.value}
          detail={metrics.integrity.detail}
          tone={integrityTone}
          icon="ri-shield-check-line"
        />
        <MetricCard
          label="字段覆盖率"
          value={metrics.fieldCoverage.value}
          detail={metrics.fieldCoverage.detail}
          tone={coverageTone}
          icon="ri-pie-chart-line"
        />
        <MetricCard
          label="异常值检测"
          value={metrics.outliers.value}
          detail={metrics.outliers.detail}
          tone={outlierTone}
          icon="ri-alert-line"
        />
      </div>

      {/* 详细健康报告 */}
      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
        <HealthReport result={report} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "accent" | "primary" | "secondary" | "red";
  icon: string;
}) {
  const cfg = {
    accent: { text: "text-accent-600", bg: "bg-accent-50", border: "border-accent-200" },
    primary: { text: "text-primary-600", bg: "bg-primary-50", border: "border-primary-200" },
    secondary: { text: "text-secondary-600", bg: "bg-secondary-50", border: "border-secondary-200" },
    red: { text: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  }[tone];

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}>
      <div className="flex items-center gap-1.5">
        <i className={`${icon} text-[16px] ${cfg.text}`} aria-hidden />
        <div className="text-sm text-foreground-600">{label}</div>
      </div>
      <div className={`mt-2 text-3xl font-bold mono-num ${cfg.text}`}>{value}</div>
      <div className="mt-2 text-xs text-foreground-400">{detail}</div>
    </div>
  );
}

function RuleRow({ id, name, rule, action, type }: { id: number; name: string; rule: string; action: string; type: string }) {
  const typeCfg: Record<string, string> = {
    '错误': 'bg-red-50 text-red-700',
    '警告': 'bg-secondary-100 text-secondary-700',
    '提示': 'bg-primary-50 text-primary-700',
  };
  return (
    <tr className="border-b border-background-100/60 hover:bg-background-50/50">
      <td className="py-2 pr-3 mono-num text-foreground-500">{id}</td>
      <td className="py-2 pr-3 font-medium text-foreground-900">{name}</td>
      <td className="py-2 pr-3 text-foreground-600">{rule}</td>
      <td className="py-2 pr-3 text-foreground-600">{action}</td>
      <td className="py-2 pr-3">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${typeCfg[type]}`}>{type}</span>
      </td>
    </tr>
  );
}
