import { ALL_LIST_FIELDS, CURRENT_SETTINGS_VERSION, type TickerSettings, type WatchItem } from './types.ts';

export const BACKUP_MAX_BYTES = 128 * 1024;
export const MAX_WATCH_ITEMS = 200;
export interface SettingsBackup { format: 'zoumadeng.settings'; version: 1; exportedAt: string; settings: TickerSettings }

export function parseWatchlist(value: unknown): WatchItem[] {
  if (!Array.isArray(value) || value.length > MAX_WATCH_ITEMS) throw new Error('自选数量必须在 0–200 之间');
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.symbol !== 'string' || !/^(sh|sz|bj)\d{6}$/i.test(item.symbol) || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 40) throw new Error('自选股票格式无效');
    const symbol = item.symbol.toLowerCase();
    if (seen.has(symbol)) throw new Error('自选股票代码不能重复');
    seen.add(symbol);
    return { symbol, name: item.name.trim() };
  });
}

export function parsePortableSettings(value: unknown): TickerSettings {
  if (!value || typeof value !== 'object') throw new Error('配置无效');
  const data = value as TickerSettings;
  if (data.settingsVersion !== CURRENT_SETTINGS_VERSION) throw new Error('配置版本不受当前应用支持');
  if (!['top', 'desktop'].includes(data.mode) || !['ticker', 'list'].includes(data.viewMode) || typeof data.showFrame !== 'boolean' || typeof data.showListHeader !== 'boolean') throw new Error('窗口配置无效');
  // Version 8 backups created before this option retain the previous visible time.
  if (data.showUpdateTime !== undefined && typeof data.showUpdateTime !== 'boolean') throw new Error('更新时间配置无效');
  for (const [key, minimum, maximum] of [['backgroundOpacity', 5, 100], ['textOpacity', 5, 100], ['fontSize', 8, 18], ['speed', 8, 90]] as const) {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < minimum || data[key] > maximum) throw new Error(`${key} 超出支持范围`);
  }
  const colors = ['textColor', 'backgroundColor', 'lineColor', 'upColor', 'downColor', 'flatColor'] as const;
  for (const key of colors) if (typeof data[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(data[key])) throw new Error('颜色格式无效');
  if (!Array.isArray(data.listFields) || !data.listFields.length || data.listFields.some(field => !ALL_LIST_FIELDS.includes(field)) || new Set(data.listFields).size !== data.listFields.length) throw new Error('显示字段无效或重复');
  return {
    settingsVersion: CURRENT_SETTINGS_VERSION, mode: data.mode, viewMode: data.viewMode,
    showFrame: data.showFrame, showListHeader: data.showListHeader,
    showUpdateTime: data.showUpdateTime ?? true,
    backgroundOpacity: data.backgroundOpacity, textOpacity: data.textOpacity, fontSize: data.fontSize, speed: data.speed,
    textColor: data.textColor, backgroundColor: data.backgroundColor, lineColor: data.lineColor,
    upColor: data.upColor, downColor: data.downColor, flatColor: data.flatColor,
    listFields: [...data.listFields], watchlist: parseWatchlist(data.watchlist),
  };
}

export function exportSettings(value: TickerSettings, now = new Date()): string {
  const backup: SettingsBackup = { format: 'zoumadeng.settings', version: 1, exportedAt: now.toISOString(), settings: parsePortableSettings(value) };
  return JSON.stringify(backup, null, 2);
}
export function importSettings(text: string): TickerSettings {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('配置文件超过 128 KiB');
  let backup: SettingsBackup;
  try { backup = JSON.parse(text); } catch { throw new Error('配置文件不是有效 JSON'); }
  if (!backup || backup.format !== 'zoumadeng.settings' || backup.version !== 1 || typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error('备份格式或版本不受支持');
  return parsePortableSettings(backup.settings);
}

/** Restore the exported list while preserving additions made after the dialog opened. */
export function restoredWatchlist(imported: WatchItem[], latest: WatchItem[], baseline: WatchItem[]): WatchItem[] {
  const original = new Set(baseline.map(item => item.symbol.toLowerCase()));
  const restored = parseWatchlist(imported);
  const included = new Set(restored.map(item => item.symbol));
  const additions = latest.filter(item => !original.has(item.symbol.toLowerCase()) && !included.has(item.symbol.toLowerCase()));
  return parseWatchlist([...restored, ...additions]);
}
