import type { WatchItem } from "../types";

export interface StockSearchResult extends WatchItem {
  market: "sh" | "sz" | "bj";
}

export type StockHintLoader = (query: string) => Promise<string | undefined>;

const POPULAR_A_SHARES: StockSearchResult[] = [
  { symbol: "000001", name: "平安银行", market: "sz" },
  { symbol: "000333", name: "美的集团", market: "sz" },
  { symbol: "000651", name: "格力电器", market: "sz" },
  { symbol: "000858", name: "五粮液", market: "sz" },
  { symbol: "002230", name: "科大讯飞", market: "sz" },
  { symbol: "002241", name: "歌尔股份", market: "sz" },
  { symbol: "002371", name: "北方华创", market: "sz" },
  { symbol: "002409", name: "雅克科技", market: "sz" },
  { symbol: "002594", name: "比亚迪", market: "sz" },
  { symbol: "002714", name: "牧原股份", market: "sz" },
  { symbol: "300015", name: "爱尔眼科", market: "sz" },
  { symbol: "300059", name: "东方财富", market: "sz" },
  { symbol: "300346", name: "南大光电", market: "sz" },
  { symbol: "300750", name: "宁德时代", market: "sz" },
  { symbol: "300760", name: "迈瑞医疗", market: "sz" },
  { symbol: "600004", name: "白云机场", market: "sh" },
  { symbol: "600030", name: "中信证券", market: "sh" },
  { symbol: "600036", name: "招商银行", market: "sh" },
  { symbol: "600276", name: "恒瑞医药", market: "sh" },
  { symbol: "600519", name: "贵州茅台", market: "sh" },
  { symbol: "601012", name: "隆基绿能", market: "sh" },
  { symbol: "601318", name: "中国平安", market: "sh" },
  { symbol: "601888", name: "中国中免", market: "sh" },
  { symbol: "603501", name: "韦尔股份", market: "sh" },
  { symbol: "688008", name: "澜起科技", market: "sh" },
  { symbol: "688012", name: "中微公司", market: "sh" },
  { symbol: "688019", name: "安集科技", market: "sh" },
  { symbol: "688041", name: "海光信息", market: "sh" },
  { symbol: "688120", name: "华海清科", market: "sh" },
  { symbol: "688256", name: "寒武纪", market: "sh" },
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function deduplicate(items: StockSearchResult[]): StockSearchResult[] {
  return [...new Map(items.map((item) => [item.symbol, item])).values()];
}

function decodeUnicodeEscapes(value: string): string {
  return value.replace(/\\u([0-9a-f]{4})/gi, (_, codePoint: string) => String.fromCharCode(Number.parseInt(codePoint, 16)));
}

function localMatches(query: string): StockSearchResult[] {
  const needle = normalize(query);
  if (!needle) return POPULAR_A_SHARES.slice(0, 12);
  return POPULAR_A_SHARES.filter((item) => item.symbol.includes(needle) || item.name.toLowerCase().includes(needle));
}

export function parseTencentHints(payload: string): StockSearchResult[] {
  const match = /v_hint="([^"]*)"/i.exec(payload);
  if (!match) return [];
  return match[1].split("^").flatMap((entry) => {
    // The live endpoint returns Chinese names as literal `\\uXXXX` sequences.
    // Decode each field before detecting the name while keeping the parser
    // independent of Tencent's undocumented field positions.
    const fields = entry.split("~").map(decodeUnicodeEscapes);
    const symbolWithMarket = fields.find((field) => /^(sh|sz|bj)\d{6}$/i.test(field));
    const marketIndex = fields.findIndex((field) => /^(sh|sz|bj)$/i.test(field));
    const separateSymbol = marketIndex >= 0 && /^\d{6}$/.test(fields[marketIndex + 1] ?? "")
      ? `${fields[marketIndex]}${fields[marketIndex + 1]}`
      : undefined;
    const normalizedSymbol = symbolWithMarket ?? separateSymbol;
    const name = fields.find((field) => /[\u4e00-\u9fff]/.test(field));
    if (!normalizedSymbol || !name) return [];
    return [{
      symbol: normalizedSymbol.slice(2),
      name,
      market: normalizedSymbol.slice(0, 2).toLowerCase() as StockSearchResult["market"],
    }];
  });
}

async function remoteMatches(query: string, fetchImpl: typeof fetch, hintLoader?: StockHintLoader): Promise<StockSearchResult[]> {
  if (normalize(query).length < 2) return [];
  const nativePayload = await hintLoader?.(query);
  if (nativePayload !== undefined) return parseTencentHints(nativePayload);
  const response = await fetchImpl(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(query)}&t=all`, { cache: "no-store" });
  if (!response.ok) return [];
  return parseTencentHints(await response.text());
}

/** Searches the bundled common-stock catalog first, then augments it with Tencent public suggestions. */
export async function searchStocks(query: string, fetchImpl: typeof fetch = fetch, hintLoader?: StockHintLoader): Promise<StockSearchResult[]> {
  const local = localMatches(query);
  try {
    return deduplicate([...local, ...await remoteMatches(query, fetchImpl, hintLoader)]).slice(0, 16);
  } catch {
    return local.slice(0, 16);
  }
}
