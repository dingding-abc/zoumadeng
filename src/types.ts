export type DisplayMode = "top" | "desktop";
export type QuoteViewMode = "ticker" | "list";
export const ALL_LIST_FIELDS = ["symbol", "name", "price", "changePct", "change", "turnoverRate", "volume", "amount"] as const;
export type ListField = typeof ALL_LIST_FIELDS[number];
export const CURRENT_SETTINGS_VERSION = 8 as const;
export const DEFAULT_LIST_FIELDS: ListField[] = ["symbol", "changePct"];
const LEGACY_DEFAULT_LIST_FIELDS: ListField[] = ["symbol", "name", "price", "changePct"];

export function resolveStoredListFields(value: unknown, settingsVersion: unknown): ListField[] {
  if (!Array.isArray(value)) return [...DEFAULT_LIST_FIELDS];
  const fields = ALL_LIST_FIELDS.filter((field) => value.includes(field));
  const version = Number(settingsVersion);
  const isLegacyDefault = (!Number.isFinite(version) || version < 7)
    && fields.length === LEGACY_DEFAULT_LIST_FIELDS.length
    && fields.every((field, index) => field === LEGACY_DEFAULT_LIST_FIELDS[index]);
  return isLegacyDefault ? [...DEFAULT_LIST_FIELDS] : fields;
}

export function resolveStoredShowFrame(value: unknown, settingsVersion: unknown): boolean {
  const version = Number(settingsVersion);
  if (!Number.isFinite(version) || version < CURRENT_SETTINGS_VERSION) return false;
  return typeof value === "boolean" ? value : false;
}

export interface WatchItem {
  symbol: string;
  name: string;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  turnoverRate: number | null;
  volume: number | null;
  amount: number | null;
  /** Data source timestamp, distinct from the local request completion time. */
  asOf?: string;
}

export interface TickerSettings {
  settingsVersion: typeof CURRENT_SETTINGS_VERSION;
  mode: DisplayMode;
  viewMode: QuoteViewMode;
  showListHeader: boolean;
  showUpdateTime: boolean;
  showFrame: boolean;
  backgroundOpacity: number;
  textOpacity: number;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  lineColor: string;
  upColor: string;
  downColor: string;
  flatColor: string;
  speed: number;
  listFields: ListField[];
  watchlist: WatchItem[];
}

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "sh000001", name: "上证指数" },
  { symbol: "sz399001", name: "深圳成指" },
  { symbol: "sz399006", name: "创业板指" },
  { symbol: "sh000680", name: "科创综指" },
];

export const DEFAULT_SETTINGS: TickerSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  mode: "top",
  viewMode: "ticker",
  showListHeader: true,
  showUpdateTime: true,
  showFrame: false,
  backgroundOpacity: 20,
  textOpacity: 35,
  fontSize: 12,
  textColor: "#444444",
  backgroundColor: "#ffffff",
  lineColor: "#d9d9d9",
  upColor: "#d94a4a",
  downColor: "#2e8b57",
  flatColor: "#777777",
  speed: 36,
  listFields: DEFAULT_LIST_FIELDS,
  watchlist: DEFAULT_WATCHLIST,
};
