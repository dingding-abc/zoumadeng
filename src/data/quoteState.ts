import type { Quote, WatchItem } from '../types.ts';

/** The time preference never suppresses missing-data or demo warnings. */
export function quoteStatusText(updatedAt: string | undefined, message: string, showUpdateTime: boolean): string {
  return [showUpdateTime && updatedAt ? `更新 ${updatedAt}` : '', message].filter(Boolean).join(' · ');
}

export function completeQuotes(items: WatchItem[], received: Quote[]): { quotes: Quote[]; missing: number } {
  const bySymbol = new Map(received.map(quote => [quote.symbol.toLowerCase(), quote]));
  let missing = 0;
  const quotes = items.map(item => {
    const quote = bySymbol.get(item.symbol.toLowerCase());
    if (quote?.price !== null && quote?.price !== undefined) return quote;
    missing++;
    return quote ?? { ...item, price: null, change: null, changePct: null, turnoverRate: null, volume: null, amount: null };
  });
  return { quotes, missing };
}

export function sourceTimestamp(value: string | undefined): string | undefined {
  if (!value || !/^\d{14}$/.test(value)) return undefined;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return undefined;
  const roundtrip = new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace(/[-T:]/g, '');
  return roundtrip === value ? iso : undefined;
}
