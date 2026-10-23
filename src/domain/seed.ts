import { db, ensureDefaultShops, ensureDefaultSites } from "./db";
import { mockSkuMaster } from "@/mocks/skuMaster";
import { mockLatestSnapshot, buildMockHistory } from "@/mocks/dailySnapshot";
import { mockInventoryLatest } from "@/mocks/inventory";
import { mockCampaigns } from "@/mocks/campaigns";
import { mockPromotions } from "@/mocks/promotions";
import { MOCK_MANUAL_PROMOTIONS } from "@/mocks/manualPromotions";
import type { DailySnapshot, InventoryLayer, OpsLog, Shop, Site, TodoItem } from "./types";

export const SEED_FLAG = "seeded_v12";

export const DEMO_SITE_ID = "site_demo";

// 演示店铺：name 与 mockSkuMaster/promotions 的 store 值一一对应，挂在演示站点下不污染真实站点
export const DEMO_SHOPS: Shop[] = [
  { id: "shop_demo_1", name: "DEMO-STORE-US", siteId: DEMO_SITE_ID, createdAt: new Date().toISOString() },
  { id: "shop_demo_2", name: "DEMO-STORE2-US", siteId: DEMO_SITE_ID, createdAt: new Date().toISOString() },
];

// 演示数据独立站点：绝不与真实站点（site_us 等）混用
export const DEMO_SITE: Site = {
  id: DEMO_SITE_ID,
  name: "演示站点",
  marketplace: "US",
  currency: "USD",
  currencySymbol: "$",
  exchangeRateToUsd: 1.0,
  cnyToUsdRate: 7.25,
  commissionRate: 15,
  fbaDeliveryFee: 3.5,
  vatRate: 0,
  isActive: true,
  sortOrder: 99,
  createdAt: new Date().toISOString(),
};

const dayOffset = (today: string, offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** 演示待办：覆盖发货/广告/评分/退货/一品多链接/补货场景，日期相对「今天」滚动 */
function buildDemoTodos(today: string): TodoItem[] {
  const rows: Array<[string, string, string | undefined, number]> = [
    ["demo-todo-1", "sku009 库存仅够 90 天，今天安排发货 420 件", "sku009", 0],
    ["demo-todo-2", "sku012 广告费比 52.9% 严重偏高，调低竞价并否定无效词", "sku012", 1],
    ["demo-todo-3", "sku017 评分降至 4.3，排查新差评并逐一回复买家", "sku017", 2],
    ["demo-todo-4", "sku010 退款率 11.1% 超阈值，联系工厂改进包装", "sku010", -1],
    ["demo-todo-5", "sku007 一品三链接：核对二店两条链接的价格与库存一致性", "sku007", 3],
    ["demo-todo-6", "sku016 在途 570 件跟进到仓时间，避免旺季断货", "sku016", 5],
  ];
  return rows.map(([id, content, relatedSku, offset], i) => ({
    id,
    siteId: DEMO_SITE_ID,
    content,
    relatedSku,
    dueDate: dayOffset(today, offset),
    completed: false,
    createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
  }));
}

/** 演示操作记录：体现「记录处理过程」的完整用法 */
function buildDemoOpsLogs(today: string): OpsLog[] {
  const rows: Array<[string, string, string, string, string, number, string?]> = [
    ["demo-log-1", "sku011", "广告加投", "夏季秒杀前把日预算从 25 提到 37，抢占流量入口", "销量 +12%，费比升至 46.5%", 1],
    ["demo-log-2", "sku017", "差评处理", "对 3 条新差评逐一回复，并向平台发起移除申请", "评分暂稳 4.3", 2],
    ["demo-log-3", "sku009", "调价", "二店 B 链接降价 1 美金，对齐一店主力链接价格带", "转化率开始回升", 3, "sku009"],
    ["demo-log-4", "sku016", "补货", "按 60 天覆盖目标向 FBA 补货 500 件", "在途 570 件", 5],
    ["demo-log-5", "sku008", "优化Listing", "主图更换场景图，A+ 增加参数对比模块", "点击率 +8%", 6, "sku008"],
  ];
  return rows.map(([id, sku, action, detail, impact, offset, msku]) => ({
    id,
    siteId: DEMO_SITE_ID,
    sku,
    msku,
    date: dayOffset(today, -offset),
    action,
    detail,
    impact,
    createdAt: new Date(Date.now() - offset * 86400_000).toISOString(),
  }));
}

/**
 * 确保演示店铺存在；同时清理与任何数据都无关联的预置店铺（一店/二店/三店），
 * 避免店铺下拉出现永远筛不出数据的死选项。有真实数据引用（id 或名称）时跳过清理。
 */
async function ensureDemoShops(): Promise<void> {
  await db.shops.bulkPut(DEMO_SHOPS);
  const defaultIds = ["shop_1", "shop_2", "shop_3"];
  const defaultNames = new Set(["一店", "二店", "三店"]);
  const referenced = new Set<string>();
  for (const rows of [await db.skuMaster.toArray(), await db.promotions.toArray()]) {
    for (const r of rows) {
      if (r.store) referenced.add(r.store);
    }
  }
  const used = [...referenced].some((s) => defaultIds.includes(s) || defaultNames.has(s));
  if (!used) await db.shops.bulkDelete(defaultIds);
}

/**
 * 老演示库内容刷新（v9/v10 → v11）：只覆盖 site_demo 的演示行，绝不触碰真实站点数据。
 * 幂等：全部按固定主键 bulkPut，重复执行结果一致。
 */
async function refreshDemoContent(today: string): Promise<void> {
  const demoSku = await db.skuMaster.get({ sku: "sku001", siteId: DEMO_SITE_ID });
  if (!demoSku) return;

  await ensureDefaultSites();
  await ensureDefaultShops();
  await ensureDemoShops();
  if (!(await db.sites.get(DEMO_SITE_ID))) {
    await db.sites.put(DEMO_SITE);
  }
  await db.skuMaster.bulkPut(mockSkuMaster);

  // 重写演示站点的全部快照（历史 + 今天）：让演示归因场景随版本更新，真实站点不受影响
  const demoSnapshotIds = (await db.dailySnapshot.toArray())
    .filter((r) => r.siteId === DEMO_SITE_ID)
    .map((r) => r.id!);
  if (demoSnapshotIds.length > 0) await db.dailySnapshot.bulkDelete(demoSnapshotIds);
  const history = buildMockHistory(today).map((s) => ({
    ...s,
    adRatio: Math.abs(s.adRatio),
  }));
  await db.dailySnapshot.bulkAdd(history);
  const todayRows: Omit<DailySnapshot, "id">[] = mockLatestSnapshot.map((s) => ({
    ...s,
    date: today,
    adRatio: Math.abs(s.adRatio),
  }));
  await db.dailySnapshot.bulkAdd(todayRows);

  // 幂等刷新待办：删掉旧演示待办再写入（内容/日期可能随版本变化）
  const demoTodoIds = buildDemoTodos(today).map((t) => t.id);
  await db.todos.bulkDelete(demoTodoIds);
  await db.todos.bulkPut(buildDemoTodos(today));

  // 操作记录同理
  const demoLogIds = buildDemoOpsLogs(today).map((l) => l.id!);
  await db.opsLogs.bulkDelete(demoLogIds);
  await db.opsLogs.bulkPut(buildDemoOpsLogs(today));
}

/**
 * 首次使用（空库）时种入通用演示数据，展示在独立的「演示站点」。
 * 一旦检测到已有任何真实数据，则完全跳过，绝不写入演示数据。
 * v11：已有演示数据的库会做一次幂等内容刷新（补演示店铺/待办/操作记录/新快照字段）。
 */
export async function ensureSeedData(): Promise<void> {
  const flag = await db.config.get(SEED_FLAG);
  if (flag?.value === true) return;

  const today = new Date().toISOString().slice(0, 10);

  // 只在空库时种入演示数据；有真实数据则刷新演示内容（若有）后标记跳过
  const hasData = (await db.skuMaster.count()) > 0;
  if (hasData) {
    await refreshDemoContent(today);
    await db.config.put({ key: SEED_FLAG, value: true });
    return;
  }

  await ensureDefaultSites();
  await ensureDefaultShops();
  await ensureDemoShops();

  // 创建演示站点（若站点曾被删除则重建）
  if (!(await db.sites.get(DEMO_SITE_ID))) {
    await db.sites.put(DEMO_SITE);
  }

  await db.skuMaster.bulkPut(mockSkuMaster);

  const history = buildMockHistory(today).map((s) => ({
    ...s,
    adRatio: Math.abs(s.adRatio), // Normalize: adRatio must always be positive
  }));
  await db.dailySnapshot.bulkAdd(history);

  const todayRows: Omit<DailySnapshot, "id">[] = mockLatestSnapshot.map((s) => ({
    ...s,
    date: today,
    adRatio: Math.abs(s.adRatio), // Normalize: adRatio must always be positive
  }));
  await db.dailySnapshot
    .where("date")
    .equals(today)
    .delete();
  await db.dailySnapshot.bulkAdd(todayRows);

  const invRows: Omit<InventoryLayer, "id">[] = mockInventoryLatest.map((r) => ({
    ...r,
    date: today,
  }));
  await db.inventoryLayer.bulkAdd(invRows);

  await db.campaigns.bulkPut(mockCampaigns);
  await db.promotions.bulkPut(mockPromotions);
  await db.manualPromotions.bulkPut(MOCK_MANUAL_PROMOTIONS);
  await db.todos.bulkPut(buildDemoTodos(today));
  await db.opsLogs.bulkPut(buildDemoOpsLogs(today));

  // 新用户默认落在演示站点，以便首次看到演示数据
  await db.config.put({ key: "currentSiteId", value: DEMO_SITE_ID });

  await db.config.put({ key: SEED_FLAG, value: true });
}