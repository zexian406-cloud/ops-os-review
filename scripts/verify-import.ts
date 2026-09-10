import { readFileSync } from "node:fs";
import { parseOperationExcel } from "../src/domain/excel";

const src = "c:\\Users\\HP\\.trae-cn\\attachments\\6a85426f8241b39828c5c6c7\\1cb334de-b144-4bcc-8d2e-264bfc6958b2_63cb427b-9bc3-4cb7-aff2-78be9e4d4ee7_【模板】综合运营表 (3).xlsx";
const buf = readFileSync(src);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const res = parseOperationExcel(ab, "2026-09-10");

console.log("=== columnMap ===");
console.log(JSON.stringify(res.columnMap, null, 1));
console.log("missingCritical:", res.missingCritical);
console.log("skuMaster rows:", res.skuMaster.length, "| snapshots:", res.dailySnapshot.length, "| inventory:", res.inventoryLayer.length);

console.log("\n=== snapshots: adRatio/rating/returnRate ===");
for (const s of res.dailySnapshot) {
  console.log(`${s.sku.padEnd(20)} adRatio=${String(s.adRatio).padEnd(6)} rating=${s.rating} ret=${s.returnRate} ref=${s.refundRate} sales7d=${s.dailySales7d} monthly=${s.monthlySales}`);
}

console.log("\n=== master: combo/delete targets ===");
for (const m of res.skuMaster) {
  if (/BFEXA72-51-A-Pan|^BFGCH|^BFT74|^BFEQT42-74/.test(m.sku)) {
    console.log(`${m.sku.padEnd(20)} fob=${m.costFob} ship=${m.costShipping} deliv=${m.costDelivery} price=${m.price} composeFormula=${m.composeFormula ?? "-"}`);
  }
}

console.log("\n=== inventory targets ===");
for (const inv of res.inventoryLayer) {
  if (/BFEXA72-51-A-Pan|^BFGCH|^BFT74|^BFEQT42-74/.test(inv.sku)) {
    console.log(`${inv.sku.padEnd(20)} fba=${inv.fbaStock} fbm=${inv.fbmStock} transit=${JSON.stringify(inv.transitBatches ?? [])}`);
  }
}
