// QA 验证 F2：CSV 公式注入防护（csvLine，CWE-1236）
// 通过对真实导出函数 exportSkuMasterCsv 的集成测试，驱动真实的 csvLine 逻辑，
// 断言以 = + - @ <tab> <cr> 开头的单元格被前缀单引号，正常/含逗号单元格不被错误前缀。
import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportSkuMasterCsv } from "@/domain/export-csv";
import { db } from "@/domain/db";
import { resetDb, makeSku } from "./fixtures";

let captured: Blob | null = null;

beforeEach(() => {
  captured = null;
  // jsdom 未实现 URL.createObjectURL / 导航；捕获 Blob 并阻止 a.click() 导航
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (blob: Blob) => {
    captured = blob;
    return "blob:qa-test";
  };
  (URL as unknown as { revokeObjectURL: (s: string) => void }).revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

async function exportedCsv(): Promise<string> {
  await exportSkuMasterCsv();
  expect(captured).not.toBeNull();
  const text = await (captured as Blob).text();
  return text.replace(/^\uFEFF/, ""); // 去掉 UTF-8 BOM
}

describe("F2 CSV 公式注入防护 csvLine", () => {
  it("以 = 开头的单元格被前缀单引号强制文本", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2A", name: "=cmd|'A1'" })]);
    const csv = await exportedCsv();
    expect(csv).toContain("'=cmd|'A1'");
  });

  it("以 + 开头的单元格被前缀单引号", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2B", name: "+1+1" })]);
    const csv = await exportedCsv();
    expect(csv).toContain("'+1+1");
  });

  it("以 - 开头的单元格被前缀单引号", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2C", name: "-3" })]);
    const csv = await exportedCsv();
    expect(csv).toContain("'-3");
  });

  it("以 @ 开头的单元格被前缀单引号", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2D", name: "@SUM(A1:A2)" })]);
    const csv = await exportedCsv();
    expect(csv).toContain("'@SUM(A1:A2)");
  });

  it("正常文本不被加前缀", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2E", name: "正常品名" })]);
    const csv = await exportedCsv();
    expect(csv).toContain("正常品名");
    expect(csv).not.toContain("'正常品名");
  });

  it("含逗号的单元格被双引号包裹（且不带公式前缀）", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2F", name: "hello,world" })]);
    const csv = await exportedCsv();
    expect(csv).toContain('"hello,world"');
    expect(csv).not.toContain("'hello,world");
  });

  it("以公式字符开头且同时含逗号的单元格：前缀单引号并整体双引号包裹", async () => {
    await db.skuMaster.bulkPut([makeSku({ sku: "SKU-F2G", name: "=SUM(A1,B1)" })]);
    const csv = await exportedCsv();
    // 既有公式前缀 ' 又被整体双引号包裹
    expect(csv).toContain('"\'=SUM(A1,B1)"');
  });
});
