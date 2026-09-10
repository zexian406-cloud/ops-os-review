import { readFileSync } from "node:fs";
import { parseOperationExcel } from "../src/domain/excel";

const src = "c:\\Users\\HP\\.trae-cn\\attachments\\6a85426f8241b39828c5c6c7\\1cb334de-b144-4bcc-8d2e-264bfc6958b2_63cb427b-9bc3-4cb7-aff2-78be9e4d4ee7_【模板】综合运营表 (3).xlsx";
const buf = readFileSync(src);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const res = parseOperationExcel(ab, "2026-09-10");

const bySku = new Map(res.skuMaster.map((m) => [m.sku, m]));
const base = bySku.get("BFEXA72-51-A");
const combo = bySku.get("BFEXA72-51-A-Pan");
console.log("BFEXA72-51-A   :", JSON.stringify({ fob: base?.costFob, ship: base?.costShipping, deliv: base?.costDelivery, price: base?.price }));
console.log("BFEXA72-51-A-Pan(当前):", JSON.stringify({ fob: combo?.costFob, ship: combo?.costShipping, deliv: combo?.costDelivery, price: combo?.price, composeFormula: combo?.composeFormula }));

// 模拟公式 BFEXA72-51-A×1 + 25.64
const formula = "BFEXA72-51-A×1+25.64";
const terms = formula.split(/[＋+]/).map((t) => t.trim()).filter(Boolean);
let fob = 0, ship = 0, deliv = 0, allResolved = true;
const numOr0 = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
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
  fob += numOr0(comp.costFob) * qty;
  ship += numOr0(comp.costShipping) * qty;
  deliv += numOr0(comp.costDelivery) * qty;
}
console.log("公式计算结果:", JSON.stringify({ fob: +fob.toFixed(2), ship: +ship.toFixed(2), deliv: +deliv.toFixed(2), allResolved }));
