// =========================================================
// ERP 网络层 —— 浏览器直连 + Cloudflare Worker 转发双通道
// ---------------------------------------------------------
// CORS 背景（需求备注的两种解决方案）：
//   ERP 开放接口 / MCP 服务端不返回 Access-Control-Allow-Origin，
//   浏览器 fetch 直连会被拦截（MCP 的 Streamable HTTP 同样受 CORS 约束；
//   领星官方 MCP 端点为流式 HTTP，并非 WebSocket）。
//   方案①：用户本地 node 代理转发（本地起 node server 转发请求，开发调试用）；
//   方案②（推荐）：用户自部署 Cloudflare Worker 免费中转（见 worker/cors-proxy.js），
//   Worker 仅转发请求、不存储任何用户密钥。
// 本层策略：先尝试浏览器直连（个别服务端可能已放开 CORS），
//   失败/被拦截时若配置了 proxyUrl 则自动经 Worker 转发重试。
// =========================================================

/** 单次 HTTP 请求配置 */
export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Cloudflare Worker 转发地址（可选） */
  proxyUrl?: string;
}

/**
 * 发送请求：直连优先，失败回落 Worker 转发。
 * 返回解析后的 JSON 对象与响应文本（日志用）。
 * headers 尽力返回响应头（Worker 转发时由 cors-proxy.js 原样带回；
 * 浏览器直连时仅当服务端通过 Access-Control-Expose-Headers 暴露才可读，
 * MCP 的 mcp-session-id 主要依赖 Worker 通道获取）。
 */
export async function fetchWithFallback(req: HttpRequest): Promise<{ status: number; text: string; via: "direct" | "proxy"; headers?: Record<string, string> }> {
  // 1) 直连尝试
  try {
    const res = await fetch(req.url, {
      method: req.method ?? "POST",
      headers: req.headers,
      body: req.body,
    });
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { status: res.status, text, via: "direct", headers };
  } catch {
    // 直连失败（典型为 CORS 拦截），继续走转发
  }
  // 2) Worker 转发
  if (!req.proxyUrl) throw new Error("直连被浏览器 CORS 拦截，且未配置 Worker 转发地址。请部署 worker/cors-proxy.js 并填入转发地址。");
  const res = await fetch(req.proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: req.url, method: req.method ?? "POST", headers: req.headers ?? {}, body: req.body ?? "" }),
  });
  if (!res.ok) throw new Error(`Worker 转发失败：HTTP ${res.status}（请检查 Worker 是否已部署并允许该目标域名）`);
  const forwarded = (await res.json()) as { status: number; text: string; headers?: Record<string, string> };
  return { status: forwarded.status, text: forwarded.text, via: "proxy", headers: forwarded.headers };
}

/**
 * 解析响应文本为 JSON —— 兼容两种格式：
 * ① application/json：直接 parse；
 * ② text/event-stream（SSE）：取 data: 行的内容 parse。
 *    优先解析最后一个 data: 行；失败时按 SSE 规范把多行 data 以换行拼接后重试
 *    （长 JSON 可能被 server 拆成多个 data: 行发送）。
 * MCP Streamable HTTP 的响应可能是这两种之一。
 */
export function parseJsonOrSse(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("响应为空");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }
  // SSE：data: {...} 行
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter((l) => l && l !== "[DONE]");
  if (dataLines.length === 0) throw new Error(`无法解析的响应格式：${trimmed.slice(0, 200)}`);
  try {
    return JSON.parse(dataLines[dataLines.length - 1]) as Record<string, unknown>;
  } catch {
    return JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  }
}

/* ────────── 浏览器内 MCP 客户端（JSON-RPC 2.0 over Streamable HTTP） ────────── */

const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpClientOptions {
  endpoint: string;
  apiKey: string;
  /** 鉴权 header 名称，默认领星 X-Mcp-Key */
  authHeader?: string;
  proxyUrl?: string;
  /** 每一步的日志回调 */
  log?: (level: "info" | "ok" | "warn" | "err", msg: string) => void;
}

/** 轻量 MCP 客户端：initialize → tools/list → tools/call（会话内复用 mcp-session-id） */
export class McpHttpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private opts: McpClientOptions;

  constructor(opts: McpClientOptions) {
    this.opts = opts;
  }

  private async rpc(method: string, params?: unknown, isNotification = false): Promise<Record<string, unknown> | null> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (this.opts.apiKey && this.opts.authHeader !== "none") {
      headers[this.opts.authHeader || "X-Mcp-Key"] = this.opts.apiKey;
    }
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) payload.params = params;
    if (!isNotification) payload.id = this.nextId++;

    const { status, text, via, headers: respHeaders } = await fetchWithFallback({
      url: this.opts.endpoint,
      headers,
      body: JSON.stringify(payload),
      proxyUrl: this.opts.proxyUrl,
    });
    if (!isNotification) this.opts.log?.("info", `MCP ${method} → HTTP ${status}（${via === "direct" ? "直连" : "Worker 转发"}）`);

    // 会话 ID：server 在 initialize 响应头返回 mcp-session-id，后续请求必须回传；
    // Worker 转发通道会原样带回响应头（直连通道受浏览器 Expose-Headers 限制，尽力而为）
    if (method === "initialize" && respHeaders) {
      const sid = respHeaders["mcp-session-id"] ?? respHeaders["Mcp-Session-Id"];
      if (sid) this.sessionId = sid;
    }

    // 流式 HTTP 规范：通知类请求服务器返回 202 Accepted 无 body
    if (isNotification || status === 202 || !text.trim()) return null;

    const parsed = parseJsonOrSse(text);
    if (method === "initialize") {
      this.opts.log?.("ok", `已连接 MCP 服务：${JSON.stringify((parsed as { result?: { serverInfo?: unknown } }).result?.serverInfo ?? {})}`);
    }
    if ((parsed as { error?: unknown }).error) {
      const err = (parsed as { error: { code: number; message: string } }).error;
      throw new Error(`MCP 错误 ${err.code}：${err.message}`);
    }
    return parsed;
  }

  /** 握手：initialize + initialized 通知 */
  async connect(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ops-os-erp-pull", version: "1.0.0" },
    });
    await this.rpc("notifications/initialized", undefined, true);
  }

  /** 列出服务端可用工具（调试用） */
  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    const res = await this.rpc("tools/list", {});
    const tools = (res?.result as { tools?: Array<{ name: string; description?: string }> })?.tools ?? [];
    return tools;
  }

  /** 调用工具，返回合并后的文本内容 */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown[]> {
    const res = await this.rpc("tools/call", { name, arguments: args });
    const result = res?.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | undefined;
    if (result?.isError) throw new Error(`工具 ${name} 执行出错：${JSON.stringify(result.content ?? {}).slice(0, 300)}`);
    return (result?.content ?? []).map((c) => {
      if (c.type === "text" || typeof c.text === "string") {
        try { return JSON.parse(c.text); } catch { return c.text; }
      }
      return c;
    });
  }
}
