// =========================================================
// 数据健康报告面板 — 导入完成后的弹窗 + 数据健康页静态展示
// 不可跳过：导入页使用时，用户必须点击「确认并继续」才能关闭
// =========================================================

import type { ValidationResult, AggregatedIssue } from "@/domain/data-health";
import { aggregateIssues } from "@/domain/data-health";

interface Props {
  result: ValidationResult;
  /** 是否为弹窗模式（显示「确认并继续」按钮） */
  modal?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  /** 是否禁用确认按钮（数据写入中） */
  confirming?: boolean;
}

const fmtNum = (n: number) => n.toLocaleString("zh-CN");

export default function HealthReport({ result, modal, onConfirm, onCancel, confirming }: Props) {
  const { summary, errors, warnings, tips } = result;
  const errAgg = aggregateIssues(errors);
  const warnAgg = aggregateIssues(warnings);
  const tipAgg = aggregateIssues(tips);

  return (
    <div className={modal ? "" : "space-y-4"}>
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <i className="ri-heart-pulse-line text-[22px] text-accent-600" aria-hidden />
        <h3 className="text-[18px] font-bold text-foreground-950">数据健康报告</h3>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          tone="ok"
          icon="ri-checkbox-circle-line"
          label="成功导入"
          value={`${fmtNum(summary.successCount)} 条`}
          sub="按 SKU + 店铺 + 发货方式 计数"
        />
        <SummaryCard
          tone="err"
          icon="ri-close-circle-line"
          label="错误（已跳过）"
          value={`${fmtNum(summary.errorCount)} 条`}
          sub={summary.errorCount > 0 ? "未写入 IndexedDB" : "无错误"}
        />
        <SummaryCard
          tone="warn"
          icon="ri-error-warning-line"
          label="警告（已修正）"
          value={`${fmtNum(summary.warningCount)} 条`}
          sub={summary.warningCount > 0 ? "已自动修正后入库" : "无警告"}
        />
        <SummaryCard
          tone="tip"
          icon="ri-lightbulb-line"
          label="提示（需关注）"
          value={`${fmtNum(summary.tipCount)} 条`}
          sub={summary.tipCount > 0 ? "已入库，请关注" : "无提示"}
        />
      </div>

      {/* 错误列表 */}
      {errAgg.length > 0 && (
        <IssueSection
          title="错误（已跳过）"
          icon="ri-close-circle-line"
          tone="err"
          issues={errAgg}
        />
      )}

      {/* 警告列表 */}
      {warnAgg.length > 0 && (
        <IssueSection
          title="警告（已自动修正）"
          icon="ri-error-warning-line"
          tone="warn"
          issues={warnAgg}
        />
      )}

      {/* 提示列表 */}
      {tipAgg.length > 0 && (
        <IssueSection
          title="提示（需关注）"
          icon="ri-lightbulb-line"
          tone="tip"
          issues={tipAgg}
        />
      )}

      {/* 完美导入提示 */}
      {summary.errorCount === 0 && summary.warningCount === 0 && summary.tipCount === 0 && (
        <div className="rounded-lg border border-accent-200 bg-accent-50 px-4 py-4 text-center">
          <i className="ri-emotion-happy-line text-[24px] text-accent-600" aria-hidden />
          <div className="mt-2 text-[14px] font-semibold text-accent-900">数据质量完美，无任何异常</div>
          <div className="mt-1 text-[12px] text-foreground-600">所有 {fmtNum(summary.successCount)} 条记录均通过校验</div>
        </div>
      )}

      {/* 操作按钮 */}
      {modal && (
        <div className="flex items-center justify-end gap-2 border-t border-background-200 pt-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={confirming}
              className="rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-[13px] font-medium text-foreground-700 hover:bg-background-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              取消导入
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-primary-500 px-5 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <i className={confirming ? "ri-loader-4-line animate-spin" : "ri-check-line"} aria-hidden />
            {confirming ? "写入中..." : "确认并继续"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ────────── 子组件 ────────── */

function SummaryCard({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: "ok" | "err" | "warn" | "tip";
  icon: string;
  label: string;
  value: string;
  sub: string;
}) {
  const cfg = {
    ok: { bg: "bg-accent-50", text: "text-accent-700", valueText: "text-accent-900", border: "border-accent-200" },
    err: { bg: "bg-red-50", text: "text-red-600", valueText: "text-red-800", border: "border-red-200" },
    warn: { bg: "bg-secondary-50", text: "text-secondary-700", valueText: "text-secondary-900", border: "border-secondary-200" },
    tip: { bg: "bg-primary-50", text: "text-primary-700", valueText: "text-primary-900", border: "border-primary-200" },
  }[tone];

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-3`}>
      <div className="flex items-center gap-1.5">
        <i className={`${icon} text-[14px] ${cfg.text}`} aria-hidden />
        <div className={`text-[12px] font-medium ${cfg.text}`}>{label}</div>
      </div>
      <div className={`mt-1 text-[20px] font-bold mono-num ${cfg.valueText}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-foreground-500">{sub}</div>
    </div>
  );
}

function IssueSection({
  title,
  icon,
  tone,
  issues,
}: {
  title: string;
  icon: string;
  tone: "err" | "warn" | "tip";
  issues: AggregatedIssue[];
}) {
  const cfg = {
    err: { text: "text-red-700", dot: "bg-red-500" },
    warn: { text: "text-secondary-700", dot: "bg-secondary-500" },
    tip: { text: "text-primary-700", dot: "bg-primary-500" },
  }[tone];

  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4">
      <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${cfg.text}`}>
        <i className={`${icon} text-[15px]`} aria-hidden />
        {title}
      </div>
      <ul className="mt-2 space-y-1.5">
        {issues.map((it) => (
          <li key={it.ruleId} className="flex items-start gap-2 text-[12px] text-foreground-700">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
            <span className="flex-1">
              <span className="font-semibold">{it.count} 条</span> {it.ruleName}
              {it.sampleSku && (
                <span className="ml-1 text-foreground-500">（如 SKU {it.sampleSku}）</span>
              )}
              <span className="ml-1 text-foreground-500">· {it.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
