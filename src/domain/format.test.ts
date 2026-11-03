import { describe, expect, it } from "vitest";
import { fmtFactor } from "./format";

describe("fmtFactor · Bug2 回归：全站百分比/数值统一格式化", () => {
  it("百分比固定 1 位小数，禁止裸浮点输出", () => {
    expect(fmtFactor(1.3900000000000006, "%")).toBe("1.4%"); // 修复前 "↓1.3900000000000006%"
    expect(fmtFactor(46.46, "%")).toBe("46.5%");
    expect(fmtFactor(8, "%")).toBe("8.0%");
    expect(fmtFactor(0.049999999, "%")).toBe("0.0%");
    expect(fmtFactor(12.34, "%")).toBe("12.3%");
  });

  it("非百分比：整数原样、小数保留 1 位，单位紧随", () => {
    expect(fmtFactor(5, "件")).toBe("5件");
    expect(fmtFactor(186, "件")).toBe("186件");
    expect(fmtFactor(3.4166667, "天")).toBe("3.4天");
    expect(fmtFactor(5)).toBe("5");
    expect(fmtFactor(3.25)).toBe("3.3");
  });

  it("缺失 / 非法数值 → —", () => {
    expect(fmtFactor(null, "%")).toBe("—");
    expect(fmtFactor(undefined, "%")).toBe("—");
    expect(fmtFactor("", "%")).toBe("—");
    expect(fmtFactor(NaN, "%")).toBe("—");
    expect(fmtFactor(Infinity, "%")).toBe("—");
    expect(fmtFactor(-Infinity)).toBe("—");
  });

  it("预格式化字符串透传，纯数字字符串补单位", () => {
    expect(fmtFactor("约 3 天", "天")).toBe("约 3 天");
    expect(fmtFactor("45.5%（后台口径）", "%")).toBe("45.5%（后台口径）");
    expect(fmtFactor("12.5", "%")).toBe("12.5%");
    expect(fmtFactor("-0.7", "%")).toBe("-0.7%");
    expect(fmtFactor("6", "件")).toBe("6件");
  });
});
