// =========================================================
// Cloudflare Worker CORS 转发（ERP 一键拉取配套，免费部署）
// ---------------------------------------------------------
// 用途：浏览器直连 ERP 开放接口 / MCP 服务被 CORS 拦截时，
//       前端 net.ts 的 fetchWithFallback 自动把请求交给本 Worker 转发。
// 安全约定（与产品需求一致）：
//   - Worker 只做「转发」，不存储、不记录任何用户密钥或业务数据；
//   - 部署后把 https://<name>.<account>.workers.dev 填入
//     数据导入页「Worker 转发地址」即可，填与不填功能均可正常开关。
//
// 部署步骤（无需装 CLI 也可在网页完成）：
//   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create Worker
//   2. 把本文件全部内容粘贴进在线编辑器，Deploy
//   3. （可选防滥用）在 Worker 设置里加环境变量 ALLOW_HOSTS，
//      逗号分隔允许转发的目标域名，如：
//      openapi.lingxing.com,openmcp.lingxing.com
//      留空 = 允许任意目标（自用场景可直接留空）。
// =========================================================

export default {
  async fetch(request, env) {
    // 统一 CORS 响应头：仅允许浏览器跨域调用本 Worker，不涉及任何凭证落盘
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "仅支持 POST" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 前端固定 POST { url, method, headers, body }（见 src/domain/erp/net.ts fetchWithFallback）
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "请求体必须是 JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = String(payload.url ?? "");
    if (!/^https?:\/\//i.test(target)) {
      return new Response(JSON.stringify({ error: "url 必须是 http(s) 地址" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 可选域名白名单（环境变量 ALLOW_HOSTS，逗号分隔；留空 = 不限制）
    const allowHosts = String(env?.ALLOW_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowHosts.length > 0) {
      const host = new URL(target).host;
      if (!allowHosts.includes(host)) {
        return new Response(JSON.stringify({ error: `目标域名未在 ALLOW_HOSTS 白名单内：${host}` }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 纯转发：原样带 method/headers/body，不修改、不缓存、不记录
    const upstreamHeaders = new Headers(payload.headers ?? {});
    delete upstreamHeaders.set("host");
    delete upstreamHeaders.set("content-length");
    try {
      const upstream = await fetch(target, {
        method: payload.method ?? "POST",
        headers: upstreamHeaders,
        body: payload.body || undefined,
      });
      const text = await upstream.text();
      // 返回 { status, text }：让前端拿到真实状态码与响应体（含 SSE 文本）
      return new Response(JSON.stringify({ status: upstream.status, text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: `转发失败：${e?.message ?? e}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
