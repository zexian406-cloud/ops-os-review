// =========================================================
// ERP 一键拉取模块 — 类型定义与 ERP 注册表
// ---------------------------------------------------------
// 设计原则：
// 1. 纯浏览器实现，不依赖任何自建后端；
// 2. 用户凭证（密钥/Secret）仅存浏览器 localStorage，绝不外传；
// 3. 所有 ERP 通过 ERP_REGISTRY 注册，二期扩展（积加/易仓/赛狐/优麦云）
//    只需在注册表加条目 + 补对应 adapter，UI 与拉取编排零改动。
// =========================================================

/** ERP 标识 */
export type ErpId = "lingxing" | "jijia" | "yicang" | "saihu" | "youmaiyun";

/** 拉取方式 */
export type PullMethod = "mcp" | "rest";

/**
 * ERP 元信息（能力矩阵）。
 * mcpEnabled / restEnabled 决定该 ERP 选中后哪些表单可见（需求中的 UI 联动规则）；
 * phase2 = true 表示二期才开放，下拉中可见但禁用。
 */
export interface ErpMeta {
  id: ErpId;
  name: string;
  phase2: boolean;
  mcpEnabled: boolean;
  restEnabled: boolean;
  /** MCP 官方服务端点（预填模板，用户可改） */
  mcpEndpoint?: string;
  /** MCP 鉴权 header 名称（领星为 X-Mcp-Key） */
  mcpAuthHeader?: string;
  /** REST API 基地址（预填模板） */
  restBaseUrl?: string;
  /** 开通指引（显示在表单下方） */
  guide?: string;
}

/** ERP 注册表 —— 一期仅领星开放，其余为二期占位 */
export const ERP_REGISTRY: ErpMeta[] = [
  {
    id: "lingxing",
    name: "领星 ERP",
    phase2: false,
    // 需求规则：选领星时 MCP 和 REST 两个选项都可用
    mcpEnabled: true,
    restEnabled: true,
    // 领星官方 MCP 为「流式 HTTP」传输（非 WebSocket），浏览器直连存在 CORS，
    // 客户端会先尝试直连、失败自动回落到用户自部署的 Cloudflare Worker 转发。
    mcpEndpoint: "https://openmcp.lingxing.com/mcp-servers/lingxing-mcp",
    mcpAuthHeader: "X-Mcp-Key",
    restBaseUrl: "https://openapi.lingxing.com",
    guide:
      "领星管理员在【业务配置】→【开放接口】开通：MCP 页面复制「服务器URL」与「密钥」；开放后台查看 AppID/AppSecret。",
  },
  {
    id: "jijia",
    name: "积加 ERP",
    phase2: true,
    mcpEnabled: true, // 仅 MCP 可用
    restEnabled: false,
    guide: "积加需管理员开通 MCP 套餐并在 MCP 市场订购服务后分配权限（二期接入）。",
  },
  {
    id: "yicang",
    name: "易仓 ERP",
    phase2: true,
    mcpEnabled: true,
    restEnabled: false,
    guide: "易仓 MCP 服务待官方确认（二期接入）。",
  },
  {
    id: "saihu",
    name: "赛狐 ERP",
    phase2: true,
    mcpEnabled: false,
    restEnabled: true, // 仅 REST 可用
    guide: "赛狐开放平台 API（二期接入）。",
  },
  {
    id: "youmaiyun",
    name: "优麦云",
    phase2: true,
    mcpEnabled: false,
    restEnabled: true,
    guide: "优麦云开放 API（二期接入）。",
  },
];

/** 数据源 Tab（需求：Excel 上传 / MCP 一键拉取 / REST API 拉取） */
export type SourceTab = "excel" | "mcp" | "rest";

/**
 * 归一化统一字段结构 —— MCP 与 REST 共用（需求核心规则）。
 * 拉取到的任何 ERP 原始数据必须先经 normalize 转成该结构，再写 IndexedDB。
 */
export interface NormalizedRow {
  msku: string;          // MSKU（亚马逊在线 SKU）
  asin: string;          // ASIN
  sku: string;           // 本地 SKU / 产品编码（ERP 侧的 SKU 字段）
  name?: string;         // 品名（可选，领星 Listing 有）
  store?: string;        // 店铺名（可选）
  sales: number;         // 销量：近 7 天累计
  sales30d?: number;     // 销量：近 30 天累计（可选）
  revenue: number;       // 销售额：近 7 天（站点币种）
  adSpend: number;       // 广告花费：近 7 天
  acos: number;          // ACoS %：广告花费 / 广告销售额
  fbaStock: number;      // FBA 可售库存
  whStock: number;       // 海外仓库存（FBM 仓）
  refundQty: number;     // 退款数量：近 7 天
}

/** MCP 连接配置（浏览器凭证，仅存本地） */
export interface McpCredential {
  endpoint: string;      // MCP 服务地址
  apiKey: string;        // 鉴权密钥（领星 = X-Mcp-Key 的值）
  proxyUrl?: string;     // Cloudflare Worker 转发地址（可选，直连失败时使用）
}

/** REST 连接配置（浏览器凭证，仅存本地） */
export interface RestCredential {
  baseUrl: string;       // API 域名
  apiKey: string;        // API Key / AppID
  secret: string;        // Secret / AppSecret
  proxyUrl?: string;     // Cloudflare Worker 转发地址（浏览器直连必遇 CORS，强烈建议配置）
}

/** localStorage 凭证存储结构（key = ERP ID） */
export interface ErpCredentialStore {
  [erpId: string]: {
    mcp?: McpCredential;
    rest?: RestCredential;
  };
}

export const CREDENTIALS_STORAGE_KEY = "ops-erp-credentials";

/** 拉取进度日志（UI 展示用） */
export interface PullLogEntry {
  time: string;
  level: "info" | "ok" | "warn" | "err";
  msg: string;
}
