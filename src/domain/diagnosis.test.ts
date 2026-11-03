import { describe, expect, it } from "vitest";
import { computeDiagnosis } from "./diagnosis";

describe("computeDiagnosis · Bug1 回归：百分数不再双重缩放", () => {
  it("ad 诊断：adRatio 46.46 保持原始百分数（不被 ×100），summary 显示 46.5%", () => {
    const r = computeDiagnosis({
      type: "ad",
      sku: { sku: "BFRS258" },
      latestSnap: { adRatio: 46.46 },
      previousSnap: { adRatio: 30 },
    });
    const f = r.factors[0];
    expect(f.after).toBe(46.46); // 修复前为 4646（双重 ×100）
    expect(f.before).toBe(30);
    expect(f.delta).toBeCloseTo(16.46, 6); // 修复前为 1646
    expect(f.unit).toBe("%");
    expect(r.summary).toContain("46.5%"); // 1 位小数（修复前 "4646.0%"）
    expect(r.summary).toContain("偏高需优化");
    expect(f.impact).toBe("up_bad"); // 阈值 >30%
  });

  it("ad 诊断：25% 属正常（快照口径 25=25%，旧阈值 0.3 会误判）", () => {
    const r = computeDiagnosis({ type: "ad", sku: { sku: "X" }, latestSnap: { adRatio: 25 } });
    expect(r.factors[0].impact).toBe("neutral");
    expect(r.summary).toContain("正常");
  });

  it("return 诊断：退款率 8% 正常、12% 触发 up_bad（阈值 >10%）", () => {
    const ok = computeDiagnosis({ type: "return", sku: { sku: "X" }, latestSnap: { refundRate: 8 } });
    expect(ok.factors[0].impact).toBe("neutral");
    expect(ok.summary).toContain("8.0%");
    const bad = computeDiagnosis({ type: "return", sku: { sku: "X" }, latestSnap: { refundRate: 12 } });
    expect(bad.factors[0].impact).toBe("up_bad");
    expect(bad.suggestion).toContain("分析退款原因");
  });

  it("return 诊断：退款率缺失 → 提示补数，不误用退货率", () => {
    const r = computeDiagnosis({ type: "return", sku: { sku: "X" }, latestSnap: { returnRate: 12 } });
    expect(r.summary).toContain("未导入退款率");
    expect(r.suggestion).toContain("补填");
  });

  it("return 诊断：800% 拼接 bug 不复现", () => {
    const r = computeDiagnosis({ type: "return", sku: { sku: "X" }, latestSnap: { refundRate: 8 } });
    expect(r.factors[0].after).toBe(8);
    expect(r.summary).not.toContain("800");
    expect(r.summary).not.toContain("4646");
  });
});

describe("computeDiagnosis · Bug2 联动：裸浮点 delta 由格式化层收敛", () => {
  it("delta 为原始浮点差值（1.3900000000000006），领域层不截断、UI 层 fmtFactor 统一 1 位小数", () => {
    const r = computeDiagnosis({
      type: "ad",
      sku: { sku: "X" },
      latestSnap: { adRatio: 46.46 },
      previousSnap: { adRatio: 45.07 },
    });
    const d = r.factors[0].delta;
    expect(d).toBeCloseTo(1.39, 10);
    expect(d).not.toBe(1.39); // 确认是裸浮点 → 必须依赖格式化层，禁止直接字符串拼接
  });

  it("before/after 缺失时 delta 为 undefined（不产出 NaN）", () => {
    const r = computeDiagnosis({ type: "ad", sku: { sku: "X" }, latestSnap: { adRatio: 20 } });
    expect(r.factors[0].before).toBeUndefined();
    expect(r.factors[0].delta).toBeUndefined();
  });
});
