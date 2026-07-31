import type { CloudConfig } from "./types";
import { exportSnapshot, importSnapshot, setCloudConfig } from "./db";

/**
 * GitHub-based cloud sync.
 * Uses a personal-access-token to read/write one JSON file in a repo.
 * All work happens client-side; no server needed.
 */

const API = "https://api.github.com";

interface GhFileMeta {
  sha: string;
  content: string;    // base64
  encoding: "base64";
}

function b64Encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function b64Decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getRemoteFile(
  cfg: CloudConfig
): Promise<{ sha: string; body: string } | null> {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    cfg.path
  )}?ref=${encodeURIComponent(cfg.branch)}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub read failed: ${resp.status} ${await resp.text()}`);
  const data = (await resp.json()) as GhFileMeta;
  return { sha: data.sha, body: b64Decode(data.content) };
}

export async function pushToGitHub(cfg: CloudConfig): Promise<{ sha: string }> {
  const payload = await exportSnapshot();
  const body = JSON.stringify(payload, null, 2);
  const remote = await getRemoteFile(cfg).catch(() => null);
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `chore(ops): sync ${new Date().toISOString()}`,
      content: b64Encode(body),
      branch: cfg.branch,
      sha: remote?.sha,
    }),
  });
  if (!resp.ok) {
    throw new Error(`GitHub push failed: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json();
  const nextCfg: CloudConfig = { ...cfg, lastSyncAt: new Date().toISOString() };
  await setCloudConfig(nextCfg);
  return { sha: json?.content?.sha ?? "" };
}

export async function pullFromGitHub(cfg: CloudConfig): Promise<{
  ok: boolean;
  message: string;
}> {
  const remote = await getRemoteFile(cfg);
  if (!remote) {
    return { ok: false, message: "云端还没有数据文件，请先执行一次云端保存" };
  }
  const parsed = JSON.parse(remote.body);
  await importSnapshot(parsed);
  const nextCfg: CloudConfig = { ...cfg, lastSyncAt: new Date().toISOString() };
  await setCloudConfig(nextCfg);
  return { ok: true, message: "已从云端恢复数据" };
}

export async function verifyGitHubConfig(cfg: CloudConfig): Promise<boolean> {
  const resp = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  return resp.ok;
}