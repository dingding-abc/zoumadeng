import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { Menu, type MenuItemOptions } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { searchStocks, type StockSearchResult } from "./data/catalog";
import { createTencentProvider, demoQuotes } from "./data/provider";
import { completeQuotes, quoteStatusText } from "./data/quoteState";
import { BACKUP_MAX_BYTES, exportSettings, importSettings, parseWatchlist, restoredWatchlist } from "./settingsBackup";
import { removeWatchItem, reorderWatchlist, type WatchlistMove } from "./data/watchlist";
import { addWatchItem, parseAddStockRequest, parseSettingsSaveRequest, watchlistForSettingsSave, type AddStockRequest, type AddStockResult, type SettingsSaveRequest, type SettingsSaveResult } from "./windowContract";
import { lockSettingsControls, SettingsSubmissionState } from "./settingsSubmission";
import type { ListField, Quote, QuoteViewMode, TickerSettings } from "./types";
import { ALL_LIST_FIELDS, CURRENT_SETTINGS_VERSION, DEFAULT_SETTINGS, DEFAULT_WATCHLIST, resolveStoredListFields, resolveStoredShowFrame } from "./types";
import "./styles.css";

const STORAGE_KEY = "zoumadeng.settings.v1";
const SHORTCUT = "Alt+1";
const TICKER_WINDOW_HEIGHT = 66;
const QUICK_ADD_WINDOW_HEIGHT = 300; // Browser preview only.
const LIST_MAX_WINDOW_HEIGHT = 280;
const MAX_TICKER_WINDOW_WIDTH = 1120;
const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const FIELD_ORDER: ListField[] = [...ALL_LIST_FIELDS];
const FIELD_META: Record<ListField, { label: string; render: (quote: Quote) => string; valueClass?: (quote: Quote) => string }> = {
  symbol: { label: "代码", render: (quote) => quote.symbol.replace(/^(sh|sz|bj)/i, "") },
  name: { label: "名称", render: (quote) => quote.name },
  price: { label: "价格", render: (quote) => formatPrice(quote.price) },
  changePct: { label: "涨幅", render: (quote) => formatChange(quote.changePct), valueClass: (quote) => changeClass(quote.changePct) },
  change: { label: "涨跌", render: (quote) => formatSigned(quote.change), valueClass: (quote) => changeClass(quote.changePct) },
  turnoverRate: { label: "换手", render: (quote) => formatPercent(quote.turnoverRate), valueClass: (quote) => changeClass(quote.changePct) },
  volume: { label: "成交量", render: (quote) => formatCompact(quote.volume) },
  amount: { label: "成交额", render: (quote) => formatCompact(quote.amount) },
};
const provider = createTencentProvider();
const app = document.querySelector<HTMLElement>("#app")!;
const tickerTrack = document.querySelector<HTMLElement>("#ticker-track")!;
const listView = document.querySelector<HTMLElement>("#list-view")!;
const emptyView = document.querySelector<HTMLElement>("#quotes-empty")!;
const settingsDialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
const settingsForm = document.querySelector<HTMLFormElement>("#settings-form")!;
const contextMenu = document.querySelector<HTMLElement>("#context-menu")!;
const contextFrameButton = document.querySelector<HTMLButtonElement>("#context-frame")!;
const contextViewButton = document.querySelector<HTMLButtonElement>("#context-view")!;
const contextHeaderButton = document.querySelector<HTMLButtonElement>("#context-header")!;
const contextUpdateTimeButton = document.querySelector<HTMLButtonElement>("#context-update-time")!;
const contextDeleteButton = document.querySelector<HTMLButtonElement>("#context-delete")!;
const sortContextActions = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-sort-action]"));
const quickAddButton = document.querySelector<HTMLButtonElement>("#quick-add-button")!;
const quickAddPanel = document.querySelector<HTMLElement>("#quick-add-panel")!;
const stockSearchInput = document.querySelector<HTMLInputElement>("#stock-search-input")!;
const stockSearchResults = document.querySelector<HTMLElement>("#stock-search-results")!;
const dataState = document.querySelector<HTMLElement>("#data-state")!;
const minimizeWindowButton = document.querySelector<HTMLButtonElement>("#minimize-window-button")!;
const closeWindowButton = document.querySelector<HTMLButtonElement>("#close-window-button")!;
const listFieldInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="list-field"]'));
const colorInputs: Record<string, HTMLInputElement> = {
  backgroundColor: document.querySelector<HTMLInputElement>("#background-color-input")!,
  textColor: document.querySelector<HTMLInputElement>("#text-color-input")!,
  lineColor: document.querySelector<HTMLInputElement>("#line-color-input")!,
  upColor: document.querySelector<HTMLInputElement>("#up-color-input")!,
  downColor: document.querySelector<HTMLInputElement>("#down-color-input")!,
  flatColor: document.querySelector<HTMLInputElement>("#flat-color-input")!,
};
const outputFor = (key: string) => document.querySelector<HTMLOutputElement>(`#${key}-value`);
let currentWindowLabel = "main";
try { currentWindowLabel = getCurrentWindow().label; } catch { /* browser preview */ }
const injectedWindowRole = (window as Window & { __ZOUMADENG_WINDOW__?: string }).__ZOUMADENG_WINDOW__;
const isSettingsWindow = injectedWindowRole === "settings" || window.location.hash === "#settings" || currentWindowLabel === "settings";
const isAddStockWindow = injectedWindowRole === "add-stock" || window.location.hash === "#add-stock" || currentWindowLabel === "add-stock";
const isMainWindow = !isSettingsWindow && !isAddStockWindow;

let settings = loadSettings();
let settingsBeforeEdit = cloneSettings(settings);
let currentQuotes: Quote[] = [];
let refreshTimer: number | undefined;
let stockSearchTimer: number | undefined;
let stockSearchSequence = 0;
let quoteRefreshSequence = 0;
let quickAddOpen = false;
let activeSearchIndex = -1;
let tickerSignature = "";
let tickerDesiredWidth = 1;
let fallbackDemo = false;
let marketMessage = "等待刷新";
let marketUpdatedAt: string | undefined;
let marketDetail = "尚未完成行情请求";
let restoreWatchlistOnSave = false;
let contextMenuOpen = false;
let contextTargetSymbol: string | undefined;
let nativeContextTargetSymbol: string | undefined;
const nativeContextMenus = new Map<string, Menu>();
let resetWatchlistOnSave = false;
const settingsWatchlistAtOpen = cloneSettings(settings).watchlist;
let pendingAddRequest: AddStockRequest | undefined;
const settingsSubmission = new SettingsSubmissionState<SettingsSaveRequest>();
let submissionInFlight = false;
const processedRequests = new Map<string, AddStockResult | SettingsSaveResult>();
let writerQueue = Promise.resolve();
let removeAddRequestListener: (() => void) | undefined;
let removeSettingsRequestListener: (() => void) | undefined;

type StoredSettings = Omit<Partial<TickerSettings>, "settingsVersion"> & {
  settingsVersion?: number;
  opacity?: number;
  simulation?: boolean;
};

function cloneSettings(value: TickerSettings): TickerSettings { return structuredClone(value); }

function loadSettings(): TickerSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as StoredSettings | null;
    if (!stored) return cloneSettings(DEFAULT_SETTINGS);
    const legacyDarkTheme = stored.backgroundColor?.toLowerCase() === "#0a1018" || stored.textColor?.toLowerCase() === "#e8edf5";
    const allowed = new Set(FIELD_ORDER);
    const fields = resolveStoredListFields(stored.listFields, stored.settingsVersion);
    const { opacity: legacyOpacity, simulation: _legacySimulation, ...currentStored } = stored;
    return sanitizeSettings({
      ...DEFAULT_SETTINGS,
      ...currentStored,
      settingsVersion: CURRENT_SETTINGS_VERSION,
      backgroundOpacity: stored.backgroundOpacity ?? legacyOpacity ?? DEFAULT_SETTINGS.backgroundOpacity,
      textOpacity: stored.textOpacity ?? DEFAULT_SETTINGS.textOpacity,
      showFrame: resolveStoredShowFrame(stored.showFrame, stored.settingsVersion),
      ...(legacyDarkTheme ? {
        backgroundColor: DEFAULT_SETTINGS.backgroundColor,
        textColor: DEFAULT_SETTINGS.textColor,
        lineColor: DEFAULT_SETTINGS.lineColor,
        upColor: DEFAULT_SETTINGS.upColor,
        downColor: DEFAULT_SETTINGS.downColor,
        flatColor: DEFAULT_SETTINGS.flatColor,
        fontSize: DEFAULT_SETTINGS.fontSize,
      } : {}),
      listFields: fields.filter((field) => allowed.has(field)),
      watchlist: Array.isArray(stored.watchlist) ? stored.watchlist : DEFAULT_WATCHLIST,
    });
  } catch { return cloneSettings(DEFAULT_SETTINGS); }
}

function sanitizeSettings(value: TickerSettings): TickerSettings {
  const fields = FIELD_ORDER.filter((field) => value.listFields.includes(field));
  return {
    ...cloneSettings(DEFAULT_SETTINGS), ...value,
    listFields: fields.length ? fields : cloneSettings(DEFAULT_SETTINGS).listFields,
    textColor: toHexColor(value.textColor, DEFAULT_SETTINGS.textColor),
    backgroundColor: toHexColor(value.backgroundColor, DEFAULT_SETTINGS.backgroundColor),
    lineColor: toHexColor(value.lineColor, DEFAULT_SETTINGS.lineColor),
    upColor: toHexColor(value.upColor, DEFAULT_SETTINGS.upColor),
    downColor: toHexColor(value.downColor, DEFAULT_SETTINGS.downColor),
    flatColor: toHexColor(value.flatColor, DEFAULT_SETTINGS.flatColor),
    settingsVersion: CURRENT_SETTINGS_VERSION,
    backgroundOpacity: clampOpacity(value.backgroundOpacity, DEFAULT_SETTINGS.backgroundOpacity),
    textOpacity: clampOpacity(value.textOpacity, DEFAULT_SETTINGS.textOpacity),
    fontSize: Math.min(18, Math.max(8, Number(value.fontSize) || DEFAULT_SETTINGS.fontSize)),
    speed: Math.min(90, Math.max(8, Number(value.speed) || DEFAULT_SETTINGS.speed)),
    viewMode: value.viewMode === "list" ? "list" : "ticker",
    showUpdateTime: typeof value.showUpdateTime === "boolean" ? value.showUpdateTime : DEFAULT_SETTINGS.showUpdateTime,
    watchlist: parseWatchlist(value.watchlist),
  };
}

function toHexColor(value: unknown, fallback: string): string { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function clampOpacity(value: unknown, fallback: number): number { const numeric = Number(value); return Math.min(100, Math.max(5, Number.isFinite(numeric) ? numeric : fallback)); }
function colorWithOpacity(hex: string, opacity: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16), green = Number.parseInt(hex.slice(3, 5), 16), blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, opacity / 100))})`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character); }
function formatPrice(value: number | null): string { return value === null ? "--" : value.toFixed(2); }
function formatSigned(value: number | null): string { return value === null ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function formatChange(value: number | null): string { return value === null ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function formatPercent(value: number | null): string { return value === null ? "--" : `${value.toFixed(2)}%`; }
function formatCompact(value: number | null): string {
  if (value === null) return "--";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(Math.round(value));
}
function changeClass(changePct: number | null): "up" | "down" | "flat" { return changePct === null ? "flat" : changePct > 0 ? "up" : changePct < 0 ? "down" : "flat"; }

async function persistSettings(): Promise<void> {
  if (!isMainWindow && isTauri()) throw new Error("只有主窗口可以保存设置");
  settings = sanitizeSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  try { await emit("settings-updated", settings); } catch { /* browser preview */ }
}

function renderFieldMarkup(quote: Quote, field: ListField, ticker = false): string {
  const meta = FIELD_META[field];
  const className = meta.valueClass?.(quote) ?? "";
  return `<span class="${ticker ? "quote-field" : "list-value"} ${field} ${className}" data-field="${field}">${escapeHtml(meta.render(quote))}</span>`;
}
function renderQuotes(quotes: Quote[]): void {
  emptyView.hidden = settings.watchlist.length > 0;
  if (!settings.watchlist.length) { tickerTrack.innerHTML = ""; listView.innerHTML = ""; return; }
  if (settings.viewMode === "list") renderListQuotes(quotes);
  else renderTickerQuotes(quotes);
}
function renderTickerQuotes(quotes: Quote[]): void {
  const separator = '<span class="quote-separator" aria-hidden="true">|</span>';
  const html = quotes.map((quote) => `<article class="quote-card" data-symbol="${escapeHtml(quote.symbol)}" title="${escapeHtml(quote.asOf ? `数据源时间 ${quote.asOf}` : fallbackDemo ? '演示数据，无数据源时间' : '数据源未提供时间')}">${settings.listFields.map((field) => renderFieldMarkup(quote, field, true)).join("")}</article>`).join(separator);
  const naturalWidth = measureTickerGroup(html);
  tickerDesiredWidth = Math.max(1, Math.min(MAX_TICKER_WINDOW_WIDTH, Math.ceil(naturalWidth)));
  const repetitions = naturalWidth > 0 ? Math.max(1, Math.ceil(tickerDesiredWidth / naturalWidth)) : 1;
  const signature = `${settings.listFields.join(",")}|${quotes.map((quote) => quote.symbol).join(",")}|${repetitions}`;
  if (signature === tickerSignature) {
    tickerTrack.querySelectorAll<HTMLElement>(".quote-card").forEach((card) => {
      const quote = quotes.find((item) => item.symbol === card.dataset.symbol);
      if (quote) { card.innerHTML = settings.listFields.map((field) => renderFieldMarkup(quote, field, true)).join(""); card.title = quote.asOf ? `数据源时间 ${quote.asOf}` : fallbackDemo ? "演示数据，无数据源时间" : "数据源未提供时间"; }
    });
    window.requestAnimationFrame(() => void resizeWindowForTickerWidth());
    return;
  }
  tickerSignature = signature;
  const expanded = Array.from({ length: repetitions }, () => html).join(separator);
  tickerTrack.innerHTML = `<div class="ticker-group">${expanded}</div><div class="ticker-group" aria-hidden="true">${expanded}</div>`;
  applyTickerMotion();
  window.requestAnimationFrame(() => void resizeWindowForTickerWidth());
}
function renderListQuotes(quotes: Quote[]): void {
  const scrollTop = listView.scrollTop;
  const fields = settings.listFields;
  const columnWidth = (field: ListField): number => Math.max(
    displayWidth(FIELD_META[field].label),
    ...quotes.map((quote) => displayWidth(FIELD_META[field].render(quote))),
  ) + 2;
  const template = fields.map((field) => `${columnWidth(field)}ch`).join(" ");
  const headers = fields.map((field) => `<span data-field="${field}">${FIELD_META[field].label}</span>`).join("");
  const rows = quotes.map((quote) => `<div class="list-row" data-symbol="${escapeHtml(quote.symbol)}" title="${escapeHtml(quote.asOf ? `数据源时间 ${quote.asOf}` : fallbackDemo ? '演示数据，无数据源时间' : '数据源未提供时间')}" style="grid-template-columns:${template}">${fields.map((field) => renderFieldMarkup(quote, field)).join("")}</div>`).join("");
  const header = settings.showListHeader ? `<div class="list-header" style="grid-template-columns:${template}">${headers}</div>` : "";
  listView.innerHTML = `<div class="list-table">${header}${rows}</div>`;
  listView.scrollTop = scrollTop;
  window.requestAnimationFrame(() => void resizeWindowForListWidth());
}
function displayWidth(value: string): number { return Array.from(value).reduce((width, character) => width + (character.codePointAt(0)! > 0xff ? 2 : 1), 0); }
function measureTickerGroup(markup: string): number {
  const measure = document.createElement("div");
  measure.className = "ticker-group ticker-measure";
  measure.innerHTML = markup;
  app.appendChild(measure);
  const width = measure.getBoundingClientRect().width;
  measure.remove();
  return width;
}
function applyTickerMotion(): void {
  tickerTrack.style.setProperty("--ticker-duration", `${Math.max(18, 170 - settings.speed * 1.6)}s`);
}

function applySettingsToUi(): void {
  const backgroundFill = colorWithOpacity(settings.backgroundColor, settings.backgroundOpacity);
  const textFill = colorWithOpacity(settings.textColor, settings.textOpacity);
  const lineOpacity = Math.min(42, Math.max(6, settings.backgroundOpacity * .42));
  const lightLineOpacity = Math.min(20, Math.max(4, settings.backgroundOpacity * .2));
  document.documentElement.style.setProperty("--ticker-font-size", `${settings.fontSize}px`);
  app.style.setProperty("--ticker-font-size", `${settings.fontSize}px`);
  app.style.setProperty("--ticker-text-color", textFill);
  app.style.setProperty("--ticker-background-color", settings.backgroundColor);
  app.style.setProperty("--ticker-background-fill", backgroundFill);
  app.style.setProperty("--ticker-line-color", colorWithOpacity(settings.lineColor, lineOpacity));
  app.style.setProperty("--ticker-line-light", colorWithOpacity(settings.lineColor, lightLineOpacity));
  app.style.setProperty("--ticker-up-color", colorWithOpacity(settings.upColor, settings.textOpacity));
  app.style.setProperty("--ticker-down-color", colorWithOpacity(settings.downColor, settings.textOpacity));
  app.style.setProperty("--ticker-flat-color", colorWithOpacity(settings.flatColor, settings.textOpacity));
  app.classList.toggle("list-mode", settings.viewMode === "list");
  document.body.classList.toggle("list-mode", settings.viewMode === "list" && isMainWindow);
  app.classList.toggle("frame-hidden", !settings.showFrame);
  const statusText = quoteStatusText(marketUpdatedAt, marketMessage, settings.showUpdateTime);
  const wasStateHidden = dataState.hidden;
  dataState.hidden = !isMainWindow || !statusText;
  dataState.textContent = statusText;
  if (isMainWindow && wasStateHidden !== dataState.hidden) void resizeWindowForView();
  dataState.title = marketDetail;
  dataState.dataset.state = fallbackDemo ? "demo" : app.dataset.marketState || "loading";
  contextViewButton.textContent = settings.viewMode === "list" ? "切换到走马灯" : "切换到列表";
  contextHeaderButton.textContent = settings.showListHeader ? "隐藏表头" : "显示表头";
  contextUpdateTimeButton.textContent = settings.showUpdateTime ? "隐藏更新时间" : "显示更新时间";
  contextFrameButton.textContent = settings.showFrame ? "隐藏程序框" : "显示程序框";
  for (const [key, input] of Object.entries(colorInputs)) { input.value = settings[key as keyof TickerSettings] as string; const output = outputFor(key); if (output) output.value = input.value.toUpperCase(); }
  const backgroundOpacityRange = document.querySelector<HTMLInputElement>("#background-opacity-range")!; backgroundOpacityRange.value = String(settings.backgroundOpacity); document.querySelector<HTMLOutputElement>("#background-opacity-value")!.value = `${settings.backgroundOpacity}%`;
  const textOpacityRange = document.querySelector<HTMLInputElement>("#text-opacity-range")!; textOpacityRange.value = String(settings.textOpacity); document.querySelector<HTMLOutputElement>("#text-opacity-value")!.value = `${settings.textOpacity}%`;
  const fontRange = document.querySelector<HTMLInputElement>("#font-range")!; fontRange.value = String(settings.fontSize); document.querySelector<HTMLOutputElement>("#font-value")!.value = `${settings.fontSize}px`;
  const speedRange = document.querySelector<HTMLInputElement>("#speed-range")!; speedRange.value = String(settings.speed); document.querySelector<HTMLOutputElement>("#speed-value")!.value = String(settings.speed);
  listFieldInputs.forEach((input) => { input.checked = settings.listFields.includes(input.value as ListField); });
  applyTickerMotion();
}
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> { try { return await invoke<T>(command, args); } catch (error) { console.debug(`[走马灯] ${command} 不可用`, error); return undefined; } }

async function setViewMode(viewMode: QuoteViewMode): Promise<void> {
  settings.viewMode = viewMode; await persistSettings(); applySettingsToUi(); renderQuotes(currentQuotes); if (!settingsDialog.open) await resizeWindowForView();
}
function listWindowHeight(): number {
  const visibleRows = Math.min(settings.watchlist.length, 9);
  const toolbarHeight = (settings.showFrame ? 31 : 0) + (dataState.hidden ? 0 : 18);
  const headerHeight = settings.showListHeader ? 21 : 0;
  return Math.min(LIST_MAX_WINDOW_HEIGHT, toolbarHeight + headerHeight + visibleRows * 21 + 2);
}
async function resizeWindowForListWidth(): Promise<void> {
  if (!isMainWindow || settings.viewMode !== "list") return;
  const table = listView.querySelector<HTMLElement>(".list-table");
  if (!table) return;
  const horizontalChrome = 16;
  const width = Math.max(1, Math.ceil(table.getBoundingClientRect().width + horizontalChrome));
  await safeInvoke("set_window_width", { width });
}
async function resizeWindowForTickerWidth(): Promise<void> {
  if (!isMainWindow || settings.viewMode !== "ticker" || quickAddOpen) return;
  await safeInvoke("set_window_width", { width: tickerDesiredWidth });
}
async function resizeWindowForView(): Promise<void> {
  if (quickAddOpen) {
    await safeInvoke("set_window_height", { height: QUICK_ADD_WINDOW_HEIGHT });
    return;
  }
  if (settings.viewMode === "ticker") await resizeWindowForTickerWidth();
  await safeInvoke("set_window_height", { height: settings.viewMode === "list" ? listWindowHeight() : (settings.showFrame ? TICKER_WINDOW_HEIGHT : 46) });
}
async function refreshQuotes(): Promise<void> {
  const sequence = ++quoteRefreshSequence;
  if (!settings.watchlist.length) { currentQuotes = []; marketUpdatedAt = undefined; marketMessage = '暂无自选'; marketDetail = '添加自选后开始刷新'; renderQuotes(currentQuotes); applySettingsToUi(); return; }
  marketMessage = fallbackDemo ? '演示数据 · 刷新中' : [marketMessage.replace(/(^| · )刷新中$/, ""), '刷新中'].filter(Boolean).join(' · ');
  applySettingsToUi();
  try {
    const items = structuredClone(settings.watchlist);
    const received = await provider.fetchQuotes(items);
    if (sequence !== quoteRefreshSequence) return;
    const result = completeQuotes(items, received);
    const completed = new Date();
    fallbackDemo = false; currentQuotes = result.quotes;
    app.dataset.marketState = result.missing ? 'partial' : 'live';
    marketUpdatedAt = completed.toLocaleTimeString('zh-CN', { hour12: false });
    marketMessage = result.missing ? `缺 ${result.missing} 项` : '';
    marketDetail = `本机刷新时间 ${completed.toLocaleString('zh-CN')}；${result.missing ? '部分行情缺失，显示 --。' : '请求完成。'} 悬停股票可查看数据源时间；刷新时间不等于成交时间。`;
    renderQuotes(currentQuotes); applySettingsToUi();
  } catch (error) {
    if (sequence !== quoteRefreshSequence) return;
    fallbackDemo = true; currentQuotes = demoQuotes(settings.watchlist); app.dataset.marketState = 'demo';
    marketMessage = '演示数据 · 刷新失败';
    marketUpdatedAt = undefined;
    marketDetail = `${new Date().toLocaleString('zh-CN')}：${error instanceof Error ? error.message : '网络异常'}。当前数值仅为演示。`;
    renderQuotes(currentQuotes); applySettingsToUi();
  }
}

async function openQuickAdd(): Promise<void> {
  if (!isMainWindow) return;
  if (isTauri()) {
    try { await mainListenersReady; }
    catch { window.alert("主窗口尚未准备好添加股票，请稍后重试"); return; }
    const opened = await safeInvoke<boolean>("open_add_stock");
    if (opened === true) return;
    window.alert("添加股票窗口无法打开，请稍后重试");
    return;
  }
  quickAddOpen = true;
  quickAddPanel.hidden = false;
  await resizeWindowForView();
  stockSearchInput.value = "";
  activeSearchIndex = -1;
  stockSearchInput.focus();
  void updateStockSearch("");
}
function closeQuickAdd(): void {
  stockSearchSequence++;
  window.clearTimeout(stockSearchTimer);
  if (isAddStockWindow) {
    void (async () => {
      const closed = await safeInvoke<boolean>("close_add_stock");
      if (closed !== true) { try { await getCurrentWindow().destroy(); } catch { window.close(); } }
    })();
    return;
  }
  quickAddOpen = false; quickAddPanel.hidden = true; stockSearchInput.value = ""; stockSearchResults.innerHTML = ""; activeSearchIndex = -1; void resizeWindowForView();
}
function searchButtons(): HTMLButtonElement[] { return Array.from(stockSearchResults.querySelectorAll<HTMLButtonElement>(".stock-result:not(:disabled)")); }
function updateSearchActive(): void { const buttons = searchButtons(); buttons.forEach((button, index) => button.classList.toggle("active", index === activeSearchIndex)); buttons[activeSearchIndex]?.scrollIntoView({ block: "nearest" }); }
function renderStockSearchResults(results: StockSearchResult[]): void {
  if (!results.length) { stockSearchResults.innerHTML = '<p class="search-empty">未找到匹配股票</p>'; activeSearchIndex = -1; return; }
  const currentWatchlist = isAddStockWindow ? loadSettings().watchlist : settings.watchlist;
  stockSearchResults.innerHTML = results.map((stock) => { const canonicalSymbol = `${stock.market}${stock.symbol}`; const alreadyAdded = currentWatchlist.some((item) => item.symbol.toLowerCase() === canonicalSymbol); return `<button type="button" class="stock-result" data-symbol="${escapeHtml(stock.symbol)}" data-market="${stock.market}" data-name="${escapeHtml(stock.name)}" title="${escapeHtml(stock.name)}（${stock.symbol}）" ${alreadyAdded ? "disabled" : ""}><code class="stock-result-code">${escapeHtml(stock.symbol)}</code><span class="stock-result-name"><strong>${escapeHtml(stock.name)}</strong><small>${escapeHtml(stock.market.toUpperCase())} · ${alreadyAdded ? "已添加" : "点击添加"}</small></span><em>${alreadyAdded ? "已添加" : "添加"}</em></button>`; }).join("");
  activeSearchIndex = searchButtons().length ? 0 : -1; updateSearchActive();
}
async function updateStockSearch(query: string): Promise<void> { const sequence = ++stockSearchSequence; stockSearchResults.innerHTML = '<p class="search-empty">搜索中…</p>'; try { const results = await searchStocks(query, fetch, (value) => safeInvoke<string>("fetch_stock_hints", { query: value })); if (sequence !== stockSearchSequence || (!quickAddOpen && !isAddStockWindow)) return; renderStockSearchResults(results); } catch { if (sequence !== stockSearchSequence) return; stockSearchResults.innerHTML = '<p class="search-empty">搜索失败，请稍后重试</p>'; } }

async function awaitWindowResult<T extends { requestId: string }>(eventName: string, requestId: string, send: () => Promise<void>): Promise<T> {
  let unlisten: (() => void) | undefined;
  let timer: number | undefined;
  try {
    return await new Promise<T>(async (resolve, reject) => {
      try {
        unlisten = await listen<T>(eventName, (event) => {
          if (event.payload?.requestId !== requestId) return;
          if (timer) window.clearTimeout(timer);
          resolve(event.payload);
        });
        timer = window.setTimeout(() => reject(new Error("主窗口未确认保存，请重试")), 8000);
        await send();
      } catch (error) { reject(error); }
    });
  } finally { if (timer) window.clearTimeout(timer); unlisten?.(); }
}

async function addStockFromSearch(button: HTMLButtonElement): Promise<void> {
  if (submissionInFlight) return;
  const { symbol, market, name } = button.dataset;
  if (!symbol || !market || !name) return;
  const request = pendingAddRequest?.stock.symbol === `${market}${symbol}` ? pendingAddRequest : { requestId: crypto.randomUUID(), stock: { symbol: `${market}${symbol}`, name } };
  pendingAddRequest = request;
  submissionInFlight = true;
  stockSearchResults.setAttribute("aria-busy", "true");
  setSearchStatus("正在保存…");
  try {
    if (isAddStockWindow) {
      const result = await awaitWindowResult<AddStockResult>("add-stock-result", request.requestId, () => emitTo("main", "add-stock-request", request));
      if (result.status === "error") throw new Error(result.message || "保存失败");
    } else {
      const parsed = parseAddStockRequest(request);
      if (!parsed) throw new Error("股票代码或名称无效");
      const outcome = addWatchItem(settings.watchlist, parsed.stock);
      if (outcome.status === "added") { settings.watchlist = outcome.items; await persistSettings(); void refreshQuotes(); }
    }
    pendingAddRequest = undefined;
    closeQuickAdd();
  } catch (error) {
    setSearchStatus(`${error instanceof Error ? error.message : "保存失败"}；再次点击可重试`);
  } finally { submissionInFlight = false; stockSearchResults.removeAttribute("aria-busy"); }
}
function setSearchStatus(message: string): void { document.querySelector<HTMLElement>("#stock-search-status")!.textContent = message; }

async function handleAddStockRequest(payload: unknown): Promise<void> {
  const request = parseAddStockRequest(payload);
  const requestId = payload && typeof payload === "object" && "requestId" in payload ? String(payload.requestId) : "";
  const cached = processedRequests.get(requestId) as AddStockResult | undefined;
  if (cached) { await emitTo("add-stock", "add-stock-result", cached); return; }
  let result: AddStockResult;
  if (!request) result = { requestId, status: "error", message: "股票数据无效" };
  else {
    const previous = cloneSettings(settings);
    try {
      const outcome = addWatchItem(settings.watchlist, request.stock);
      if (outcome.status === "added") {
        settings.watchlist = outcome.items;
        await persistSettings();
        void refreshQuotes();
      }
      result = { requestId, status: outcome.status };
    } catch (error) { settings = previous; result = { requestId, status: "error", message: error instanceof Error ? error.message : "保存失败" }; }
  }
  if (request && result.status !== "error") processedRequests.set(requestId, result);
  await emitTo("add-stock", "add-stock-result", result).catch(() => undefined);
}

async function handleSettingsSaveRequest(payload: unknown): Promise<void> {
  const request = parseSettingsSaveRequest(payload);
  const requestId = payload && typeof payload === "object" && "requestId" in payload ? String(payload.requestId) : "";
  const cached = processedRequests.get(requestId) as SettingsSaveResult | undefined;
  if (cached) { await emitTo("settings", "settings-save-result", cached); return; }
  let result: SettingsSaveResult;
  if (!request) result = { requestId, status: "error", message: "设置数据无效" };
  else {
    const previous = cloneSettings(settings);
    try {
      const next = sanitizeSettings(request.draft);
      const additions = watchlistForSettingsSave(settings.watchlist, request.baseline, request.resetWatchlist);
      next.watchlist = request.restoreWatchlist ? restoredWatchlist(request.draft.watchlist, settings.watchlist, request.baseline) : request.resetWatchlist
        ? [...DEFAULT_WATCHLIST, ...additions.filter((item) => !DEFAULT_WATCHLIST.some((defaultItem) => defaultItem.symbol === item.symbol))]
        : settings.watchlist;
      if (request.restoreWatchlist) localStorage.setItem(`${STORAGE_KEY}.restore-previous`, exportSettings(previous));
      settings = next;
      await persistSettings();
      applySettingsToUi();
      void safeInvoke("set_window_mode", { mode: settings.mode });
      void resizeWindowForView();
      void refreshQuotes();
      result = { requestId, status: "saved" };
    } catch (error) { settings = previous; result = { requestId, status: "error", message: error instanceof Error ? error.message : "保存失败" }; }
  }
  if (request && result.status !== "error") processedRequests.set(requestId, result);
  await emitTo("settings", "settings-save-result", result).catch(() => undefined);
}

function queueWindowMutation(action: () => Promise<void>): void {
  writerQueue = writerQueue.then(action).catch((error) => console.error("跨窗口写入失败", error));
}

const mainListenersReady = isMainWindow && isTauri()
  ? Promise.all([
      listen<unknown>("add-stock-request", (event) => { queueWindowMutation(() => handleAddStockRequest(event.payload)); }),
      listen<unknown>("settings-save-request", (event) => { queueWindowMutation(() => handleSettingsSaveRequest(event.payload)); }),
    ]).then(([removeAdd, removeSettings]) => { removeAddRequestListener = removeAdd; removeSettingsRequestListener = removeSettings; })
  : Promise.resolve();
function handleSearchKeyDown(event: KeyboardEvent): void { const buttons = searchButtons(); if (event.key === "Escape") { event.preventDefault(); closeQuickAdd(); return; } if (!buttons.length) return; if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const delta = event.key === "ArrowDown" ? 1 : -1; activeSearchIndex = (activeSearchIndex + delta + buttons.length) % buttons.length; updateSearchActive(); } else if (event.key === "Enter" && activeSearchIndex >= 0) { event.preventDefault(); addStockFromSearch(buttons[activeSearchIndex]); } }

async function openSettings(): Promise<void> { if (quickAddOpen) closeQuickAdd(); resetWatchlistOnSave = false; restoreWatchlistOnSave = false; settingsBeforeEdit = cloneSettings(settings); if (isTauri()) await mainListenersReady; const opened = await safeInvoke<boolean>("open_settings"); if (opened !== true && !settingsDialog.open) { settingsDialog.showModal(); } }
async function destroySettingsWindow(): Promise<void> {
  const closed = await safeInvoke<boolean>("close_settings");
  if (closed === true) return;
  try { await getCurrentWindow().destroy(); } catch { window.close(); }
}
function closeSettings(): void { if (submissionInFlight) return; if (isSettingsWindow) { void destroySettingsWindow(); return; } resetWatchlistOnSave = false; restoreWatchlistOnSave = false; settings = cloneSettings(settingsBeforeEdit); applySettingsToUi(); settingsDialog.close(); }
async function saveSettingsAndClose(): Promise<void> {
  if (submissionInFlight) return;
  settings.listFields = listFieldInputs.filter((input) => input.checked).map((input) => input.value as ListField);
  if (!settings.listFields.length) return;
  submissionInFlight = true;
  const controls = settingsForm.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input, button, select, textarea");
  const unlockControls = lockSettingsControls(controls);
  const saveStatus = document.querySelector<HTMLElement>("#settings-save-status")!;
  saveStatus.textContent = "正在保存…";
  let saved = false;
  try {
    if (isSettingsWindow) {
      const request = settingsSubmission.begin(() => ({ requestId: crypto.randomUUID(), draft: cloneSettings(settings), resetWatchlist: resetWatchlistOnSave, restoreWatchlist: restoreWatchlistOnSave, baseline: settingsWatchlistAtOpen }));
      const result = await awaitWindowResult<SettingsSaveResult>("settings-save-result", request.requestId, () => emitTo("main", "settings-save-request", request));
      if (result.status === "error") throw new Error(result.message || "设置保存失败");
    } else {
      if (restoreWatchlistOnSave) {
        const latest = loadSettings();
        settings.watchlist = restoredWatchlist(settings.watchlist, latest.watchlist, settingsBeforeEdit.watchlist);
        localStorage.setItem(`${STORAGE_KEY}.restore-previous`, exportSettings(latest));
      } else settings.watchlist = watchlistForSettingsSave(settings.watchlist, settingsBeforeEdit.watchlist, resetWatchlistOnSave);
      if (resetWatchlistOnSave) settings.watchlist = [...DEFAULT_WATCHLIST, ...settings.watchlist.filter((item) => !DEFAULT_WATCHLIST.some((defaultItem) => defaultItem.symbol === item.symbol))];
      await persistSettings();
    }
    saved = true;
  } catch (error) { saveStatus.textContent = error instanceof Error ? error.message : "保存失败"; }
  finally { if (isSettingsWindow) settingsSubmission.finish(saved); unlockControls(); submissionInFlight = false; }
  if (saved) { saveStatus.textContent = ""; resetWatchlistOnSave = false; settingsBeforeEdit = cloneSettings(settings); applySettingsToUi(); closeSettings(); }
}
function resetSettings(): void { if (submissionInFlight) return; settingsSubmission.draftChanged(); restoreWatchlistOnSave = false; resetWatchlistOnSave = true; settings = cloneSettings(DEFAULT_SETTINGS); applySettingsToUi(); renderQuotes(currentQuotes); }
async function hideWindow(): Promise<void> { const window = getCurrentWindow(); try { await window.hide(); } catch { app.style.opacity = "0"; } }
async function startWindowDrag(event: MouseEvent): Promise<void> { if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, input, select, textarea, a"))) return; try { await getCurrentWindow().startDragging(); } catch { /* browser preview */ } }
function orderCurrentQuotes(quotes: Quote[]): Quote[] {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  return settings.watchlist.map((item) => bySymbol.get(item.symbol)).filter((quote): quote is Quote => Boolean(quote));
}
async function applyWatchlistMove(action: WatchlistMove, targetSymbol = contextTargetSymbol): Promise<void> {
  if (!targetSymbol) return;
  const symbol = targetSymbol;
  const reordered = reorderWatchlist(settings.watchlist, symbol, action);
  closeContextMenu();
  if (reordered === settings.watchlist) return;
  settings.watchlist = reordered;
  currentQuotes = orderCurrentQuotes(currentQuotes);
  renderQuotes(currentQuotes);
  await persistSettings();
}
async function deleteContextStock(targetSymbol = contextTargetSymbol): Promise<void> {
  if (!targetSymbol) return;
  const symbol = targetSymbol;
  const remaining = removeWatchItem(settings.watchlist, symbol);
  closeContextMenu();
  if (remaining === settings.watchlist) return;
  settings.watchlist = remaining;
  currentQuotes = currentQuotes.filter((quote) => quote.symbol !== symbol);
  tickerSignature = "";
  renderQuotes(currentQuotes);
  await persistSettings();
  await resizeWindowForView();
}
function closeContextMenu(): void {
  const wasOpen = contextMenuOpen;
  contextMenuOpen = false;
  contextTargetSymbol = undefined;
  if (wasOpen) contextMenu.hidden = true;
}
function toggleContextView(): void {
  const viewMode = settings.viewMode === "list" ? "ticker" : "list";
  closeContextMenu();
  void setViewMode(viewMode);
}
function openQuickAddFromContext(): void {
  closeContextMenu();
  nativeContextTargetSymbol = undefined;
  void openQuickAdd();
}
async function toggleContextHeader(): Promise<void> {
  settings.showListHeader = !settings.showListHeader;
  closeContextMenu();
  await persistSettings();
  applySettingsToUi();
  renderQuotes(currentQuotes);
  await resizeWindowForView();
}
async function toggleContextUpdateTime(): Promise<void> {
  settings.showUpdateTime = !settings.showUpdateTime;
  closeContextMenu();
  await persistSettings();
  applySettingsToUi();
  await resizeWindowForView();
}
function toggleContextFrame(): void {
  settings.showFrame = !settings.showFrame;
  void persistSettings();
  applySettingsToUi();
  closeContextMenu();
  void resizeWindowForView();
}
function applyNativeWatchlistMove(action: WatchlistMove): void {
  const symbol = nativeContextTargetSymbol;
  nativeContextTargetSymbol = undefined;
  void applyWatchlistMove(action, symbol);
}
function deleteNativeContextStock(): void {
  const symbol = nativeContextTargetSymbol;
  nativeContextTargetSymbol = undefined;
  void deleteContextStock(symbol);
}
async function nativeContextMenu(watchIndex: number): Promise<Menu> {
  const hasStock = watchIndex >= 0;
  const atTop = watchIndex === 0;
  const atBottom = hasStock && watchIndex === settings.watchlist.length - 1;
  const key = [settings.viewMode, settings.showListHeader, settings.showUpdateTime, settings.showFrame, hasStock, atTop, atBottom].join("|");
  const cached = nativeContextMenus.get(key);
  if (cached) return cached;

  const items: MenuItemOptions[] = [
    { text: "添加股票", action: openQuickAddFromContext },
  ];
  if (hasStock) items.push({ text: "删除股票", action: deleteNativeContextStock });
  items.push({ text: settings.viewMode === "list" ? "切换到走马灯" : "切换到列表", action: toggleContextView });
  if (settings.viewMode === "list") {
    items.push({ text: settings.showListHeader ? "隐藏表头" : "显示表头", action: () => void toggleContextHeader() });
  }
  items.push(
    { text: settings.showUpdateTime ? "隐藏更新时间" : "显示更新时间", action: () => void toggleContextUpdateTime() },
    { text: settings.showFrame ? "隐藏程序框" : "显示程序框", action: toggleContextFrame },
  );
  if (hasStock && settings.viewMode === "list") {
    items.push(
      { text: "置顶", enabled: !atTop, action: () => applyNativeWatchlistMove("top") },
      { text: "上移", enabled: !atTop, action: () => applyNativeWatchlistMove("up") },
      { text: "下移", enabled: !atBottom, action: () => applyNativeWatchlistMove("down") },
      { text: "置底", enabled: !atBottom, action: () => applyNativeWatchlistMove("bottom") },
    );
  }
  items.push(
    { text: "打开设置", action: () => void openSettings() },
    { text: "退出应用", action: () => void safeInvoke("exit_app") },
  );

  const menu = await Menu.new({ items });
  nativeContextMenus.set(key, menu);
  return menu;
}
async function openContextMenu(event: MouseEvent): Promise<void> {
  event.preventDefault();
  const quoteElement = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-symbol]") : null;
  const symbol = quoteElement?.dataset.symbol;
  const watchIndex = symbol ? settings.watchlist.findIndex((item) => item.symbol === symbol) : -1;
  contextTargetSymbol = watchIndex >= 0 ? symbol : undefined;
  nativeContextTargetSymbol = contextTargetSymbol;
  if (isTauri()) {
    try {
      contextMenuOpen = false;
      contextMenu.hidden = true;
      const menu = await nativeContextMenu(watchIndex);
      await menu.popup(new LogicalPosition(event.clientX, event.clientY), getCurrentWindow());
      return;
    } catch (error) {
      console.warn("原生右键菜单不可用，已回退到页面菜单", error);
    }
  }
  contextHeaderButton.hidden = settings.viewMode !== "list";
  contextDeleteButton.hidden = watchIndex < 0;
  sortContextActions.forEach((button) => {
    button.hidden = watchIndex < 0 || settings.viewMode !== "list";
    const action = button.dataset.sortAction as WatchlistMove;
    button.disabled = watchIndex < 0 || ((action === "top" || action === "up") && watchIndex === 0) || ((action === "down" || action === "bottom") && watchIndex === settings.watchlist.length - 1);
  });
  contextMenuOpen = true;
  contextMenu.hidden = false;
  contextMenu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - contextMenu.offsetWidth - 6))}px`;
  contextMenu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - contextMenu.offsetHeight - 6))}px`;
}
async function registerShortcut(): Promise<void> { try { await register(SHORTCUT, (event) => { if (event.state === "Pressed") void safeInvoke("toggle_window"); }); } catch (error) { console.debug("快捷键不可用", error); } }

const backupText = document.querySelector<HTMLTextAreaElement>('#backup-text')!;
const backupStatus = document.querySelector<HTMLElement>('#backup-status')!;
function importBackupDraft(text: string): void {
  if (submissionInFlight) return;
  try {
    const imported = importSettings(text);
    settings = imported; resetWatchlistOnSave = false; restoreWatchlistOnSave = true; settingsSubmission.draftChanged();
    applySettingsToUi();
    backupStatus.textContent = `已载入 ${settings.watchlist.length} 项自选草稿，点击“保存设置”后生效；并发新增自选会保留。`;
  } catch (error) { backupStatus.textContent = error instanceof Error ? error.message : '配置导入失败'; }
}
document.querySelector('#export-settings')!.addEventListener('click', () => {
  try {
    backupText.value = exportSettings(loadSettings());
    document.querySelector<HTMLDetailsElement>('#backup-details')!.open = true;
    backupStatus.textContent = '当前已保存配置已生成，请下载或复制后保存在本机。';
  } catch (error) { backupStatus.textContent = String(error); }
});
document.querySelector('#download-settings')!.addEventListener('click', () => {
  try {
    const value = exportSettings(importSettings(backupText.value));
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `zoumadeng-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupStatus.textContent = '已请求下载；如果窗口未出现保存提示，请复制下方 JSON。';
  } catch (error) { backupStatus.textContent = String(error); }
});
document.querySelector('#import-settings-text')!.addEventListener('click', () => importBackupDraft(backupText.value));
document.querySelector<HTMLInputElement>('#import-settings-file')!.addEventListener('change', async event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > BACKUP_MAX_BYTES) throw new Error('配置文件超过 128 KiB');
    const text = await file.text(); importBackupDraft(text); backupText.value = text;
  } catch (error) { backupStatus.textContent = String(error); }
  finally { input.value = ''; }
});
document.querySelector('#restore-previous-settings')!.addEventListener('click', () => {
  const previous = localStorage.getItem(`${STORAGE_KEY}.restore-previous`);
  if (previous) importBackupDraft(previous); else backupStatus.textContent = '没有导入前恢复点。';
});

quickAddButton.addEventListener("click", () => void openQuickAdd());
minimizeWindowButton.addEventListener("click", () => void safeInvoke("minimize_window"));
closeWindowButton.addEventListener("click", () => void hideWindow());
document.querySelector("#close-quick-add")!.addEventListener("click", closeQuickAdd);
stockSearchInput.addEventListener("input", () => { window.clearTimeout(stockSearchTimer); stockSearchTimer = window.setTimeout(() => void updateStockSearch(stockSearchInput.value), 180); });
stockSearchInput.addEventListener("keydown", handleSearchKeyDown);
stockSearchResults.addEventListener("click", (event) => { const button = (event.target as Element).closest<HTMLButtonElement>(".stock-result"); if (button) void addStockFromSearch(button); });
contextMenu.addEventListener("click", (event) => {
  const menuButton = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!menuButton) return;
  const sortButton = menuButton.closest<HTMLButtonElement>("[data-sort-action]");
  if (sortButton && !sortButton.disabled) void applyWatchlistMove(sortButton.dataset.sortAction as WatchlistMove);
  else window.queueMicrotask(closeContextMenu);
});
contextDeleteButton.addEventListener("click", () => void deleteContextStock());
document.querySelector("#context-add")!.addEventListener("click", openQuickAddFromContext);
document.querySelector("#context-settings")!.addEventListener("click", () => { closeContextMenu(); void openSettings(); });
contextViewButton.addEventListener("click", toggleContextView);
contextHeaderButton.addEventListener("click", () => void toggleContextHeader());
contextUpdateTimeButton.addEventListener("click", () => void toggleContextUpdateTime());
contextFrameButton.addEventListener("click", toggleContextFrame);
document.querySelector("#context-quit")!.addEventListener("click", () => { closeContextMenu(); void safeInvoke("exit_app"); });
document.querySelector("#close-settings")!.addEventListener("click", closeSettings);
document.querySelector("#cancel-settings")!.addEventListener("click", closeSettings);
document.querySelector("#reset-button")!.addEventListener("click", resetSettings);
settingsForm.addEventListener("submit", (event) => { event.preventDefault(); void saveSettingsAndClose(); });
settingsForm.addEventListener("input", () => { settingsSubmission.draftChanged(); if (!submissionInFlight) document.querySelector<HTMLElement>("#settings-save-status")!.textContent = ""; });
settingsDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSettings(); });
settingsDialog.addEventListener("click", (event) => { if (!isSettingsWindow && event.target === settingsDialog) closeSettings(); });
app.addEventListener("mousedown", (event) => void startWindowDrag(event));
app.addEventListener("contextmenu", (event) => void openContextMenu(event));
document.addEventListener("pointerdown", (event) => { if (contextMenuOpen && !contextMenu.contains(event.target as Node)) closeContextMenu(); }, true);
window.addEventListener("mousedown", (event) => { const target = event.target as Node; if (quickAddOpen && !quickAddPanel.contains(target) && event.target !== quickAddButton) closeQuickAdd(); });
window.addEventListener("blur", closeContextMenu);
window.addEventListener("keydown", (event) => { if (event.key === "Escape") { if (isSettingsWindow) closeSettings(); else if (quickAddOpen || isAddStockWindow) closeQuickAdd(); else closeContextMenu(); } });
for (const [key, input] of Object.entries(colorInputs)) input.addEventListener("input", () => { settings[key as keyof TickerSettings] = input.value as never; applySettingsToUi(); renderQuotes(currentQuotes); });
document.querySelector<HTMLInputElement>("#background-opacity-range")!.addEventListener("input", (event) => { settings.backgroundOpacity = Number((event.target as HTMLInputElement).value); applySettingsToUi(); });
document.querySelector<HTMLInputElement>("#text-opacity-range")!.addEventListener("input", (event) => { settings.textOpacity = Number((event.target as HTMLInputElement).value); applySettingsToUi(); });
document.querySelector<HTMLInputElement>("#font-range")!.addEventListener("input", (event) => { settings.fontSize = Number((event.target as HTMLInputElement).value); applySettingsToUi(); renderQuotes(currentQuotes); });
document.querySelector<HTMLInputElement>("#speed-range")!.addEventListener("input", (event) => { settings.speed = Number((event.target as HTMLInputElement).value); applySettingsToUi(); });
listFieldInputs.forEach((input) => input.addEventListener("change", () => { if (!listFieldInputs.some((field) => field.checked)) input.checked = true; settings.listFields = listFieldInputs.filter((field) => field.checked).map((field) => field.value as ListField); applySettingsToUi(); renderQuotes(currentQuotes); }));

applySettingsToUi();
if (isSettingsWindow) {
  document.body.classList.add("settings-window");
  if (!settingsDialog.open) settingsDialog.show();
}
else if (isAddStockWindow) {
  document.body.classList.add("add-stock-window");
  quickAddOpen = true;
  quickAddPanel.hidden = false;
  stockSearchInput.focus();
  void updateStockSearch("");
  void listen("settings-updated", () => { if (!submissionInFlight) void updateStockSearch(stockSearchInput.value); });
}
else { void mainListenersReady.catch((error) => console.error("跨窗口请求监听失败", error)); void safeInvoke("set_window_mode", { mode: settings.mode }); void resizeWindowForView(); void refreshQuotes(); void registerShortcut(); refreshTimer = window.setInterval(() => void refreshQuotes(), 15000); }
window.addEventListener("resize", () => {
  if (isMainWindow && settings.viewMode === "ticker" && currentQuotes.length) window.requestAnimationFrame(() => void resizeWindowForTickerWidth());
});
window.addEventListener("beforeunload", () => { stockSearchSequence++; window.clearTimeout(stockSearchTimer); if (refreshTimer) window.clearInterval(refreshTimer); removeAddRequestListener?.(); removeSettingsRequestListener?.(); if (isMainWindow) void unregister(SHORTCUT).catch(() => undefined); });
