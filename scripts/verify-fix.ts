import { readFileSync } from "node:fs";
import { parseOperationExcel } from "../src/domain/excel";

const src = "c:\\Users\\HP\\.trae-cn\\attachments\\6a85426f8241b39828c5c6c7\\1cb334de-b144-4bcc-8d2e-264bfc6958b2_63cb427b-9bc3-4cb7-aff2-78be9e4d4ee7_【模板】综合运营表 (3).xlsx";
const buf = readFileSync(src);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const res = parseOperationExcel(ab, "2026-09-10");

console.log("=== 库存回填: stockOnHand / stockInTransit ===");
for (const s of res.dailySnapshot) {
  if (s.stockOnHand > 0 || s.stockInTransit > 0) {
    console.log(`${s.sku.padEnd(20)} onHand=${String(s.stockOnHand).padEnd(6)} transit=${String(s.stockInTransit).padEnd(6)} coverOH=${s.daysOfCoverOnHand === Infinity ? "∞" : s.daysOfCoverOnHand} coverAll=${s.daysOfCoverWithTransit === Infinity ? "∞" : s.daysOfCoverWithTransit}`);
  }
}

console.log("\n=== 组合公式模拟: BFEXA72-51-A-Pan = BFEXA72-51-A×1 + 25.64 ===");
const base = res.skuMaster.find((m) => m.sku === "BFEXA72-51-A");
const combo = res.skuMaster.find((m) => m.sku === "BFEXA72-51-A-Pan");
console.log(`BFEXA72-51-A  fob=${base?.costFob} ship=${base?.costShipping} deliv=${base?.costDelivery}`);
console.log(`BFEXA72-51-A-Pan 导入后 fob=${combo?.costFob}（期望 = 基础 + 25.64）`);

// 模拟 Step 8（与 excel.ts 同一逻辑）：把公式挂到组合款上重算
if (combo) {
  const bySku = new Map(res.skuMaster.map((m) => [m.sku, m]));
  const formula = "BFEXA72-51-A×1+25.64";
  const terms = formula.split(/[＋+]/).map((t) => t.trim()).filter(Boolean);
  let fob = 0, ship = 0, deliv = 0, allResolved = true;
  const isNumLiteral = (s: string) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s);
  for (const term of terms) {
    const sep = term.search(/[×*]/);
    let compSku = term, qty = 1;
    if (sep >= 0) {
      compSku = term.slice(0, sep).trim();
      const q = parseFloat(term.slice(sep + 1));
      if (isFinite(q) && q > 0) qty = q;
    }
    if (isNumLiteral(compSku)) { fob += parseFloat(compSku) * qty; continue; }
    const comp = bySku.get(compSku);
    if (!comp) { allResolved = false; continue; }
    fob += (typeof comp.costFob === "number" && isFinite(comp.costFob) ? comp.costFob : 0) * qty;
    ship += (typeof comp.costShipping === "number" && isFinite(comp.costShipping) ? comp.costShipping : 0) * qty;
    deliv += (typeof comp.costDelivery === "number" && isFinite(comp.costDelivery) ? comp.costDelivery : 0) * qty;
  }
  console.log(`模拟公式计算: fob=${fob.toFixed(2)} ship=${ship.toFixed(2)} deliv=${deliv.toFixed(2)} allResolved=${allResolved}`);
}
