// =========================================================
// ERP 一键拉取面板（一期：领星试点）
// ---------------------------------------------------------
// 需求规则：
// 1. 纯前端实现，凭证（密钥/Secret）仅保存在浏览器 localStorage，
//    绝不上传任何服务器（Worker 转发也不落盘，仅转发请求）；
// 2. ERP 下拉联动：领星 MCP/REST 均可用；积加/易仓仅 MCP；
//    赛狐/优麦云仅 REST（二期占位，下拉可见但禁用）；
// 3. 拉取 → 归一化（MCP/REST 共用）→ 写 IndexedDB 的编排见 domain/erp/ingest.ts。
// =========================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import { ERP_REGISTRY, CREDENTIALS_STORAGE_KEY } from "@/domain/erp/types";
import type {
  ErpId,
  McpCredential,
  PullLogEntry,
  RestCredential,
} from "@/domain/erp/types";
import { pullAndNormalize, writeNormalizedRows, type IngestResult } from "@/domain/erp/ingest";
import { lingxingClearToken } from "@/domain/erp/lingxing";
import { McpHttpClient } from "@/domain/erp/net";
import type { Shop } from "@/domain/types";

/* ────────── 凭证本地存储（业务代码：仅 localStorage，无网络上传） ────────── */

type CredStore = Record<string, { mcp?: McpCredential; rest?: RestCredential }>;

function loadCredStore(): CredStore {
  try {
    return JSON.parse(localStorage.getItem(CREDENTIALS_STORAGE_KEY) ?? "{}") as CredStore;
  } catch {
    return {};
  }
}

function saveCredStore(store: CredStore): void {
  localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(store));
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const LOG_TONE: Record<PullLogEntry["level"], string> = {
  info: "text-foreground-600",
  ok: "text-accent-700",
  warn: "text-secondary-700",
  err: "text-red-600",
};

const LOG_ICON: Record<PullLogEntry["level"], string> = {
  info: "ri-arrow-right-s-line",
  ok: "ri-checkbox-circle-line",
  warn: "ri-error-warning-line",
  err: "ri-close-circle-line",
};

/* ────────── 通用表单字段 ────────── */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-foreground-700">
        {label}
        {hint && <span className="font-normal text-foreground-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 focus:border-primary-500 focus:outline-none";

export default function ErpPullPanel({ method, shops }: { method: "mcp" | "rest"; shops: Shop[] }) {
  // ERP 选择：一期注册表里只有领星开放，其余为二期占位（禁用）
  const [erpId, setErpId] = useState<ErpId>("lingxing");
  const erp = useMemo(() => ERP_REGISTRY.find((e) => e.id === erpId) ?? ERP_REGISTRY[0], [erpId]);

  /* 凭证状态（从 localStorage 恢复，按 ERP + 拉取方式隔离） */
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [credMsg, setCredMsg] = useState<string | null>(null);

  /* 拉取流程状态 */
  const [pullDate, setPullDate] = useState(todayStr);
  const [fallbackShop, setFallbackShop] = useState("");
  const [pulling, setPulling] = useState(false);
  const [logs, setLogs] = useState<PullLogEntry[]>([]);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [corsOpen, setCorsOpen] = useState(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const addLog = (level: PullLogEntry["level"], msg: string) => {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => [...prev, { time, level, msg }]);
  };

  /* 切换 ERP 或拉取方式时：预填模板 + 恢复本地已存凭证 */
  useEffect(() => {
    const store = loadCredStore();
    const saved = store[erpId]?.[method];
    setEndpoint(saved && "endpoint" in saved ? saved.endpoint : erp.mcpEndpoint ?? "");
    setApiKey(saved?.apiKey ?? "");
    setSecret(saved && "secret" in saved ? saved.secret : "");
    setBaseUrl(saved && "baseUrl" in saved ? saved.baseUrl : erp.restBaseUrl ?? "");
    setProxyUrl(saved?.proxyUrl ?? "");
    setCredMsg(null);
    setLogs([]);
    setResult(null);
  }, [erpId, method, erp.mcpEndpoint, erp.restBaseUrl]);

  /* 日志自动滚动到底部 */
  useEffect(() => {
    logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight });
  }, [logs]);

  /* 保存凭证到 localStorage（业务规则：绝不外传） */
  const saveCredential = () => {
    const store = loadCredStore();
    const entry = store[erpId] ?? {};
    if (method === "mcp") {
      entry.mcp = { endpoint, apiKey, proxyUrl: proxyUrl || undefined };
    } else {
      entry.rest = { baseUrl, apiKey, secret, proxyUrl: proxyUrl || undefined };
      if (erpId === "lingxing") lingxingClearToken(); // 凭证变更时清掉旧 token 缓存
    }
    store[erpId] = entry;
    saveCredStore(store);
    setCredMsg("凭证已保存到本浏览器（localStorage），不会上传任何服务器");
  };

  /* 表单可见性联动（需求规则）：领星双通道可用；积加/易仓仅 MCP；赛狐/优麦云仅 REST */
  const showMcp = method === "mcp";
  const showRest = method === "rest";

  /* 组装凭证对象 */
  const buildCredential = (): McpCredential | RestCredential =>
    showMcp
      ? { endpoint, apiKey, proxyUrl: proxyUrl || undefined }
      : { baseUrl, apiKey, secret, proxyUrl: proxyUrl || undefined };

  /* MCP 连接测试：握手 + 工具清单，不写数据 */
  const testMcp = async () => {
    if (!endpoint || !apiKey) {
      addLog("err", "请先填写 MCP 服务器 URL 与鉴权密钥");
      return;
    }
    addLog("info", "测试连接：initialize → tools/list");
    try {
      const client = new McpHttpClient({
        endpoint,
        apiKey,
        authHeader: erp.mcpAuthHeader ?? "X-Mcp-Key",
        proxyUrl: proxyUrl || undefined,
        log: addLog,
      });
      await client.connect();
      const tools = await client.listTools();
      addLog("ok", `连接成功，服务端可用工具 ${tools.length} 个`);
    } catch (e) {
      addLog("err", `连接失败：${(e as Error).message.slice(0, 300)}`);
    }
  };

  /* 拉取主流程：拉取 → 归一化 → 写库（编排逻辑在 domain/erp/ingest.ts） */
  const doPull = async () => {
    if (pulling) return;
    if (showMcp && (!endpoint || !apiKey)) {
      addLog("err", "请先填写 MCP 服务器 URL 与鉴权密钥（保存凭证后下次自动回填）");
      return;
    }
    if (showRest && (!baseUrl || !apiKey || !secret)) {
      addLog("err", "请先填写 API 域名、AppID 与 AppSecret（保存凭证后下次自动回填）");
      return;
    }
    setPulling(true);
    setResult(null);
    addLog("info", `开始拉取：${erp.name} · ${showMcp ? "MCP 一键拉取" : "REST API 拉取"}`);
    try {
      const preview = await pullAndNormalize(method, buildCredential(), addLog);
      if (preview.rows.length === 0) {
        addLog("warn", "归一化后没有可写入的数据行：请检查凭证、数据权限或字段映射（见使用说明）");
        return;
      }
      const r = await writeNormalizedRows(preview.rows, pullDate, fallbackShop || undefined);
      setResult(r);
      addLog("ok", `写入完成：SKU 主档 ${r.skuCount} · 快照 ${r.snapshotCount} · 库存 ${r.inventoryCount}${r.shopNames.length ? ` · 店铺：${r.shopNames.join("、")}` : ""}`);
    } catch (e) {
      addLog("err", `拉取失败：${(e as Error).message.slice(0, 400)}`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── ERP 选择 + 拉取方式徽标 ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-background-200/70 bg-background-100/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <i className="ri-plug-line text-[16px] text-foreground-500" aria-hidden />
          <span className="text-[13px] font-medium text-foreground-700">选择 ERP：</span>
        </div>
        <select
          value={erpId}
          onChange={(e) => setErpId(e.target.value as ErpId)}
          className="rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
        >
          {ERP_REGISTRY.map((e) => (
            <option key={e.id} value={e.id} disabled={e.phase2}>
              {e.name}{e.phase2 ? "（二期）" : ""}
            </option>
          ))}
        </select>
        <Badge tone={showMcp ? "primary" : "accent"}>
          {showMcp ? "MCP 一键拉取" : "REST API 拉取"}
        </Badge>
        <span className="text-[11px] text-foreground-400">{erp.guide}</span>
      </div>

      {/* ── 连接配置表单（MCP / REST 二选一，按 method 由外层 Tab 决定） ── */}
      <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <i className={showMcp ? "ri-magic-line text-[15px] text-primary-600" : "ri-key-2-line text-[15px] text-primary-600"} aria-hidden />
          <span className="text-[13px] font-semibold text-foreground-800">
            {showMcp ? "MCP 连接配置" : "REST API 连接配置"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {showMcp && (
            <>
              <Field label="MCP 服务器 URL" hint="领星 AI 助手 → MCP → 复制 JSON 中的 url">
                <input className={inputCls} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://openmcp.lingxing.com/mcp-servers/lingxing-mcp" />
              </Field>
              <Field label={`鉴权密钥（${erp.mcpAuthHeader ?? "X-Mcp-Key"}）`} hint="领星 MCP 页面 → 复制密钥">
                <input className={inputCls} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="粘贴密钥" />
              </Field>
            </>
          )}
          {showRest && (
            <>
              <Field label="API 域名" hint="领星开放平台">
                <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openapi.lingxing.com" />
              </Field>
              <Field label="AppID（app_key）" hint="开放后台 → 应用信息">
                <input className={inputCls} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AppID" />
              </Field>
              <Field label="AppSecret" hint="开放后台 → 应用信息">
                <input className={inputCls} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="AppSecret" />
              </Field>
            </>
          )}
          {/* CORS 转发：两种拉取方式都可能需要（浏览器直连被拦时自动走 Worker） */}
          <Field label="Worker 转发地址（可选）" hint="CORS 被拦截时自动经此转发">
            <input className={inputCls} value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="https://你的-worker.workers.dev" />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveCredential}
            className="rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer"
          >
            <i className="ri-save-3-line mr-1" aria-hidden />
            保存凭证到本机
          </button>
          {showMcp && (
            <button
              type="button"
              onClick={testMcp}
              disabled={pulling}
              className="rounded-md border border-primary-300 bg-primary-50 px-3 py-1.5 text-[12px] font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50 cursor-pointer"
            >
              <i className="ri-links-line mr-1" aria-hidden />
              测试连接
            </button>
          )}
          {credMsg && <span className="text-[11px] text-accent-700">{credMsg}</span>}
        </div>

        {/* CORS 说明（需求备注的两种解决方案，默认收起） */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setCorsOpen(!corsOpen)}
            className="flex items-center gap-1 text-[11px] text-foreground-500 hover:text-foreground-700 cursor-pointer"
          >
            <i className={corsOpen ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"} aria-hidden />
            浏览器直连被拦截（CORS）怎么办？
          </button>
          {corsOpen && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-background-50 p-3 text-[12px] text-foreground-600">
              <p><strong className="text-foreground-800">方案①（推荐）：Cloudflare Worker 免费中转</strong> —— 仓库 <code className="rounded bg-background-200 px-1">worker/cors-proxy.js</code> 一键部署到 Cloudflare（免费额度足够），把生成的 <code className="rounded bg-background-200 px-1">*.workers.dev</code> 地址填入上方「Worker 转发地址」。Worker 只转发请求，<strong>不存储任何密钥</strong>。</p>
              <p><strong className="text-foreground-800">方案②：本地 node 代理</strong> —— 本地起 node 转发服务（开发调试用），同样填入转发地址即可，拉取逻辑零改动。</p>
              <p className="text-foreground-400">客户端会先尝试浏览器直连，被 CORS 拦截时若填了转发地址则自动回落，无需手动切换。</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 拉取参数与执行 ── */}
      <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 px-4 py-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="数据日期" hint="快照归属日期，默认今天">
            <input type="date" className={inputCls} value={pullDate} onChange={(e) => setPullDate(e.target.value)} />
          </Field>
          <Field label="店铺兜底" hint="ERP 数据无店铺名时归入该店铺">
            <select className={`${inputCls} cursor-pointer`} value={fallbackShop} onChange={(e) => setFallbackShop(e.target.value)}>
              <option value="">（不指定）</option>
              {shops.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={doPull}
            disabled={pulling}
            className="rounded-[9px] bg-primary-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-600 disabled:opacity-60 cursor-pointer"
          >
            <i className={pulling ? "ri-loader-4-line animate-spin mr-1" : "ri-download-cloud-2-line mr-1"} aria-hidden />
            {pulling ? "拉取中..." : showMcp ? "一键拉取（MCP）" : "一键拉取（REST）"}
          </button>
          <span className="text-[11px] text-foreground-400">
            拉取仅补 SKU 标识（MSKU/ASIN/SKU/店铺）与销量库存快照，<strong className="text-foreground-600">不会覆盖</strong> Excel 已录入的 FOB/售价等成本字段。
          </span>
        </div>

        {/* 结果统计 */}
        {result && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="accent">SKU 主档 +{result.skuCount}</Badge>
            <Badge tone="accent">每日快照 +{result.snapshotCount}</Badge>
            <Badge tone="accent">库存记录 +{result.inventoryCount}</Badge>
            {result.shopNames.map((n) => <Badge key={n}>{n}</Badge>)}
          </div>
        )}

        {/* 进度日志 */}
        {logs.length > 0 && (
          <div ref={logBoxRef} className="mt-3 max-h-52 overflow-y-auto rounded-lg bg-foreground-950/95 p-3 font-mono text-[11.5px] leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={LOG_TONE[l.level]}>
                <span className="text-foreground-500">[{l.time}]</span>{" "}
                <i className={`${LOG_ICON[l.level]} align-[-1px]`} aria-hidden /> {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
