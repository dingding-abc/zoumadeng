import type { WatchItem } from "../types";

export type WatchlistMove = "top" | "up" | "down" | "bottom";

export function removeWatchItem(items: WatchItem[], symbol: string): WatchItem[] {
  return items.some((item) => item.symbol === symbol) ? items.filter((item) => item.symbol !== symbol) : items;
}

export function reorderWatchlist(items: WatchItem[], symbol: string, move: WatchlistMove): WatchItem[] {
  const index = items.findIndex((item) => item.symbol === symbol);
  if (index < 0) return items;

  const targetIndex = move === "top"
    ? 0
    : move === "bottom"
      ? items.length - 1
      : move === "up"
        ? Math.max(0, index - 1)
        : Math.min(items.length - 1, index + 1);
  if (targetIndex === index) return items;

  const reordered = [...items];
  const [item] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, item);
  return reordered;
}
