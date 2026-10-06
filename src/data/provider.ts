import type { Quote, WatchItem } from "../types";
import { sourceTimestamp } from './quoteState.ts';

export interface QuoteProvider {
  readonly id: string;
  fetchQuotes(items: WatchItem[]): Promise<Quote[]>;
}

function toTencentSymbol(symbol: string): string {
  if (/^(sh|sz|bj)/i.test(symbol)) return symbol.toLowerCase();
  if (symbol.startsWith("6")) return `sh${symbol}`;
  if (symbol.startsWith("0") || symbol.startsWith("3")) return `sz${symbol}`;
  return `sz${symbol}`;
}

function toNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function readBoundedBody(response: Response): Promise<string> {
  const limit = 2 * 1024 * 1024;
  if (!response.body) {
    const body = await response.text();
    if (new TextEncoder().encode(body).length > limit) throw new Error('行情响应过大');
    return body;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return result + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error('行情响应过大'); }
      result += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

/** Parse Tencent's v_symbol="...~..." response without depending on field names. */
export function parseTencentQuotes(payload: string, requested: WatchItem[]): Quote[] {
  const requestedBySymbol = new Map<string, WatchItem>();
  requested.forEach((item) => requestedBySymbol.set(toTencentSymbol(item.symbol), item));
  const results = new Map<string, Quote>();
  const expression = /v_([a-z0-9]+)="([^"]*)"/gi;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(payload)) !== null) {
    const symbol = match[1].toLowerCase();
    const fields = match[2].split("~");
    const requestedItem = requestedBySymbol.get(symbol);
    if (!requestedItem || fields.length < 5) continue;

    const price = toNumber(fields[3]);
    const previousClose = toNumber(fields[4]);
    const change = previousClose !== null && price !== null ? price - previousClose : toNumber(fields[31]);
    const changePct = previousClose && change !== null
      ? (change / previousClose) * 100
      : toNumber(fields[32]);
    const volume = toNumber(fields[6]);
    const amount = toNumber(fields[37]);
    const turnoverRate = toNumber(fields[38]);
    results.set(symbol, {
      symbol: requestedItem.symbol,
      // Keep the local watchlist label first: Tencent may return GBK text while
      // the WebView decodes the response as UTF-8, which would garble Chinese names.
      name: requestedItem.name || fields[1] || symbol,
      price,
      change,
      changePct,
      // Tencent volume is reported in lots (one lot = 100 shares).
      volume: volume === null ? null : volume * 100,
      amount,
      turnoverRate,
      asOf: sourceTimestamp(fields[30]),
    });
  }

  return requested
    .map((item) => results.get(toTencentSymbol(item.symbol)))
    .filter((quote): quote is Quote => Boolean(quote));
}

export function createTencentProvider(fetchImpl: typeof fetch = fetch, timeoutMs = 10000): QuoteProvider {
  return {
    id: "tencent",
    async fetchQuotes(items) {
      if (!items.length) return [];
      if (items.length > 200 || items.some(item => !/^(?:(sh|sz|bj))?\d{6}$/i.test(item.symbol))) throw new Error('自选代码无效或超过 200 项');
      const symbols = items.map((item) => toTencentSymbol(item.symbol));
      const url = `https://qt.gtimg.cn/q=${symbols.join(",")}&_=${Date.now()}`;
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('行情请求超时')); }, timeoutMs); });
      try {
        return await Promise.race([deadline, (async () => {
          const response = await fetchImpl(url, { cache: 'no-store', signal: controller.signal });
          if (!response.ok) throw new Error(`行情接口返回 ${response.status}`);
          const body = await readBoundedBody(response);
          const quotes = parseTencentQuotes(body, items);
          if (!quotes.length) throw new Error('行情接口未返回可解析数据');
          return quotes;
        })()]);
      } finally { if (timeout) clearTimeout(timeout); }
    },
  };
}

export function demoQuotes(items: WatchItem[]): Quote[] {
  return items.map((item, index) => {
    const price = [68.2, 142.8, 187.5, 156.1, 36.74][index] ?? 50;
    const changePct = [2.31, -1.25, 3.16, 1.08, -0.64][index] ?? 0.5;
    return {
      symbol: item.symbol,
      name: item.name,
      price,
      change: price * changePct / 100,
      changePct,
      turnoverRate: [3.42, 1.18, 4.26, 2.08, 5.17][index] ?? 0.8,
      volume: [286000, 118000, 426000, 208000, 517000][index] ?? 80000,
      amount: [416000000, 168000000, 812000000, 326000000, 193000000][index] ?? 96000000,
    };
  });
}
