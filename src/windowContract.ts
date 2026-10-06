import { ALL_LIST_FIELDS, type TickerSettings, type WatchItem } from "./types.ts";
import { parsePortableSettings, parseWatchlist } from './settingsBackup.ts';

export interface AddStockRequest { requestId: string; stock: WatchItem }
export interface AddStockResult { requestId: string; status: "added" | "already-present" | "error"; message?: string }
export interface SettingsSaveRequest { requestId: string; draft: TickerSettings; resetWatchlist: boolean; baseline: WatchItem[]; restoreWatchlist?: boolean }
export interface SettingsSaveResult { requestId: string; status: "saved" | "error"; message?: string }

export function validRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
}

export function parseAddStockRequest(value: unknown): AddStockRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const request = value as Partial<AddStockRequest>;
  const stock = request.stock;
  if (!validRequestId(request.requestId) || !stock || typeof stock !== "object") return undefined;
  const symbol = typeof stock.symbol === "string" ? stock.symbol.toLowerCase() : "";
  const name = typeof stock.name === "string" ? stock.name.trim() : "";
  if (!/^(sh|sz|bj)\d{6}$/.test(symbol) || !name || name.length > 40) return undefined;
  return { requestId: request.requestId, stock: { symbol, name } };
}

export function parseSettingsSaveRequest(value: unknown): SettingsSaveRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const request = value as Partial<SettingsSaveRequest>;
  if (!validRequestId(request.requestId) || typeof request.resetWatchlist !== "boolean" || !Array.isArray(request.baseline)) return undefined;
  if (request.restoreWatchlist !== undefined && typeof request.restoreWatchlist !== 'boolean') return undefined;
  if (request.restoreWatchlist && request.resetWatchlist) return undefined;
  try { parsePortableSettings(request.draft); parseWatchlist(request.baseline); } catch { return undefined; }
  const draft = request.draft;
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.listFields) || !Array.isArray(draft.watchlist)) return undefined;
  if ((draft.mode !== "top" && draft.mode !== "desktop") || (draft.viewMode !== "ticker" && draft.viewMode !== "list")) return undefined;
  if (typeof draft.showFrame !== "boolean" || typeof draft.showListHeader !== "boolean") return undefined;
  if (!draft.listFields.length || draft.listFields.some((field) => !ALL_LIST_FIELDS.includes(field))) return undefined;
  if ([...request.baseline, ...draft.watchlist].some((item) => !item || !/^(sh|sz|bj)\d{6}$/i.test(item.symbol) || typeof item.name !== "string")) return undefined;
  return request as SettingsSaveRequest;
}

export function addWatchItem(items: WatchItem[], stock: WatchItem): { items: WatchItem[]; status: "added" | "already-present" } {
  if (items.some((item) => item.symbol.toLowerCase() === stock.symbol.toLowerCase())) return { items, status: "already-present" };
  return { items: [...items, stock], status: "added" };
}

// A settings reset removes the original list, while preserving stocks added since the dialog opened.
export function watchlistForSettingsSave(latest: WatchItem[], baseline: WatchItem[], reset: boolean): WatchItem[] {
  if (!reset) return latest;
  const original = new Set(baseline.map((item) => item.symbol.toLowerCase()));
  return latest.filter((item) => !original.has(item.symbol.toLowerCase()));
}
