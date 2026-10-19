// =========================================================
// 领星 ERP 适配器（一期试点）
// ---------------------------------------------------------
// REST 通道（Open API）：
//   - 域名 openapi.lingxing.com；鉴权 = AppID + AppSecret 签名换 access_token
//   - 签名规则（官方文档 4.1 节）：所有业务入参 + 固定参数 app_key / access_token /
//     timestamp（秒），按参数名 ASCII 升序拼 key=value&，末尾拼接 AppSecret 后 MD5（32位小写）。
//   - ⚠️ 接口路径 / 返回结构若与官方文档有出入，改下方 LINGXING_ENDPOINTS 常量表即可，
//     拉取失败时 UI 日志会展示原始响应片段，便于对照文档校正。
// MCP 通道：
//   - 官方端点 https://openmcp.lingxing.com/mcp-servers/lingxing-mcp，鉴权 header X-Mcp-Key，
//     传输为流式 HTTP（浏览器直连可能被 CORS 拦截，客户端已内置 Worker 回落）。
//   - 拉取计划 MCP_TOOL_PLAN 中登记所需工具；server 未提供某工具时跳过并提示。
// =========================================================

import { md5 } from "js-md5";
import { fetchWithFallback } from "./net";
import { McpHttpClient } from "./net";
import type { McpCredential, RestCredential } from "./types";

type Log = (level: "info" | "ok" | "warn" | "err", msg: string) => void;
export type RawRow = Record<string, unknown>;

/* ────────── 领星 REST：签名与 access_token ────────── */

const TOKEN_CACHE_KEY = "ops-erp-lingxing-token";
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000; // token 官方有效期 24h，这里 20h 主动刷新

/** 领星签名：参数按 ASCII 升序拼 key=value&，末尾拼 secret，MD5 小写 */
export function lingxingSign(params: Record<string, string | number>, secret: string): string {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] != null && k !== "sign")
    .sort();
  const base = keys.map((k) => `${k}=${params[k]}`).join("&") + secret;
  return md5(base);
}

interface LingxingToken { token: string; expiresAt: number }

/** 获取（并缓存）access_token */
export async function lingxingGetToken(cred: RestCredential, log: Log): Promise<string> {
  const cached = localStorage.getItem(TOKEN_CACHE_KEY);
  if (cached) {
    try {
      const t = JSON.parse(cached) as LingxingToken;
      if (t.expiresAt > Date.now()) return t.token;
    } catch { /* 缓存损坏则重新获取 */ }
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { app_key: cred.apiKey, timestamp };
  const body = {
    app_key: cred.apiKey,
    timestamp,
    sign: lingxingSign(params, cred.secret),
  };
  const res = await fetchWithFallback({
    url: `${cred.baseUrl.replace(/\/$/, "")}/api/auth-server/oauth/access-token`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    proxyUrl: cred.proxyUrl,
  });
  log("info", `access_token 接口 → HTTP ${res.status}：${res.text.slice(0, 200)}`);
  const parsed = JSON.parse(res.text) as { code?: string | number; data?: { access_token?: string }; access_token?: string; message?: string };
  const token = parsed.data?.access_token ?? parsed.access_token;
  if (!token) throw new Error(`获取 access_token 失败：${parsed.message ?? res.text.slice(0, 200)}`);
  localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token, expiresAt: Date.now() + TOKEN_TTL_MS } satisfies LingxingToken));
  log("ok", "access_token 获取成功（已缓存本地，仅存浏览器）");
  return token;
}

/** 清除 token 缓存（凭证变更时调用） */
export function lingxingClearToken(): void {
  localStorage.removeItem(TOKEN_CACHE_KEY);
}

/**
 * 领星业务接口路径表 —— ⚠️ 以官方文档 apidoc.lingxing.com 为准校正。
 * 一期 REST 拉取：订单（聚合销量/销售额）+ 本地库存（海外仓）+ FBA 库存。
 * 广告费/ACoS 数据量小且字段稳定，一期建议走 MCP 的广告报告工具。
 */
export const LINGXING_ENDPOINTS = {
  /** 亚马逊订单列表（按下单时间区间拉取，聚合出销量/销售额/退款数量） */
  orders: "/erp/sc/data/mws/order",
  /** FBA 库存（可售） */
  fbaStock: "/erp/sc/data/mws/inventory",
  /** 本地库存（海外仓/FBM） */
  localStock: "/erp/sc/data/local_inventory",
} as const;

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** 带公共参数与签名的领星业务请求 */
async function lingxingApi(
  cred: RestCredential,
  token: string,
  path: string,
  bizParams: Record<string, string | number>,
  log: Log,
): Promise<RawRow[]> {
  const timestamp = Math.floor(Date.now() / 1000);
  const allParams: Record<string, string | number> = {
    ...bizParams,
    app_key: cred.apiKey,
    access_token: token,
    timestamp,
  };
  const sign = lingxingSign(allParams, cred.secret);
  const url = `${cred.baseUrl.replace(/\/$/, "")}${path}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, String(v)])), sign }).toString()}`;
  const res = await fetchWithFallback({ url, method: "GET", proxyUrl: cred.proxyUrl });
  const parsed = JSON.parse(res.text) as {
    code?: string | number;
    message?: string;
    data?: unknown;
  };
  const code = String(parsed.code);
  if (code !== "0") throw new Error(`接口 ${path} 返回错误 code=${code}：${parsed.message ?? res.text.slice(0, 200)}`);
  // data 可能是 { list: [...] } 或直接数组
  const data = parsed.data as { list?: RawRow[] } | RawRow[] | null;
  const rows = Array.isArray(data) ? data : (data?.list ?? []);
  log("ok", `${path} → ${rows.length} 行`);
  return rows;
}

/** 领星 REST 拉取：返回各数据源原始行（交由 normalizeLingxing 归一化） */
export async function lingxingRestPull(
  cred: RestCredential,
  log: Log,
): Promise<{ salesRows: RawRow[]; stockRows: RawRow[]; whRows: RawRow[] }> {
  const token = await lingxingGetToken(cred, log);
  const range: Record<string, string | number> = {
    date_from: daysAgo(30),
    date_to: daysAgo(0),
  };

  const out = { salesRows: [] as RawRow[], stockRows: [] as RawRow[], whRows: [] as RawRow[] };
  // 订单 → 销量/销售额（近 30 天区间，前端聚合 7/30 天口径）
  try {
    out.salesRows = await lingxingApi(cred, token, LINGXING_ENDPOINTS.orders, range, log);
  } catch (e) {
    log("warn", `订单接口拉取失败（销量/销售额将为 0）：${(e as Error).message}`);
  }
  // FBA 可售库存
  try {
    out.stockRows = await lingxingApi(cred, token, LINGXING_ENDPOINTS.fbaStock, {}, log);
  } catch (e) {
    log("warn", `FBA 库存接口拉取失败（FBA 可售将为 0）：${(e as Error).message}`);
  }
  // 本地/海外仓库存
  try {
    out.whRows = await lingxingApi(cred, token, LINGXING_ENDPOINTS.localStock, {}, log);
  } catch (e) {
    log("warn", `本地库存接口拉取失败（海外仓将为 0）：${(e as Error).message}`);
  }
  return out;
}

/* ────────── 领星 MCP：工具拉取计划 ────────── */

/**
 * MCP 拉取计划：登记「工具名 → 数据归类」。
 * 工具参数以官方 MCP 工具 schema 为准（未知时传空对象取默认第一页）；
 * server 工具清单运行时可通过 tools/list 确认，未登记到的工具自动跳过。
 */
const MCP_TOOL_PLAN: Array<{ tool: string; bucket: "listingRows" | "salesRows" | "stockRows" | "whRows" | "adRows"; label: string }> = [
  { tool: "erp_listing", bucket: "listingRows", label: "Listing 列表（主档：MSKU/ASIN/SKU/店铺）" },
  { tool: "get_fba_stock_list", bucket: "stockRows", label: "FBA 仓库库存" },
  { tool: "ad_campaign_product_report", bucket: "adRows", label: "广告商品报告（花费/ACoS）" },
];

export interface LingxingMcpResult {
  listingRows: RawRow[];
  salesRows: RawRow[];
  stockRows: RawRow[];
  whRows: RawRow[];
  adRows: RawRow[];
}

/** 领星 MCP 拉取：连接 → 逐工具调用 → 原始行分组返回 */
export async function lingxingMcpPull(cred: McpCredential, log: Log): Promise<LingxingMcpResult> {
  const client = new McpHttpClient({
    endpoint: cred.endpoint,
    apiKey: cred.apiKey,
    authHeader: "X-Mcp-Key",
    proxyUrl: cred.proxyUrl,
    log,
  });
  log("info", `连接 MCP 服务：${cred.endpoint}`);
  await client.connect();

  const tools = await client.listTools();
  log("ok", `服务端可用工具 ${tools.length} 个（限流：100 次/分钟）`);
  const names = new Set(tools.map((t) => t.name));

  const out: LingxingMcpResult = { listingRows: [], salesRows: [], stockRows: [], whRows: [], adRows: [] };
  for (const plan of MCP_TOOL_PLAN) {
    if (!names.has(plan.tool)) {
      log("warn", `服务端未提供工具 ${plan.tool}，跳过「${plan.label}」`);
      continue;
    }
    try {
      const content = await client.callTool(plan.tool, {});
      // 工具返回文本或 JSON，尝试提取行数组（兼容 { list: [] } / { data: { list: [] } } / 直接数组）
      const rows = extractRows(content);
      out[plan.bucket] = rows;
      log("ok", `${plan.tool} → ${rows.length} 行（${plan.label}）`);
    } catch (e) {
      log("warn", `${plan.tool} 调用失败，跳过：${(e as Error).message.slice(0, 300)}`);
    }
  }
  return out;
}

/** 从 MCP 工具返回内容中提取行数组 */
function extractRows(content: unknown[]): RawRow[] {
  for (const c of content) {
    if (Array.isArray(c)) return c as RawRow[];
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      const nested = (obj.list ?? obj.rows ?? (obj.data as Record<string, unknown>)?.list) as unknown;
      if (Array.isArray(nested)) return nested as RawRow[];
      return [obj];
    }
  }
  return [];
}
