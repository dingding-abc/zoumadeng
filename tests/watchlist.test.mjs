import test from "node:test";
import assert from "node:assert/strict";
import { removeWatchItem, reorderWatchlist } from "../src/data/watchlist.ts";

const items = [
  { symbol: "000001", name: "一" },
  { symbol: "000002", name: "二" },
  { symbol: "000003", name: "三" },
];

test("自选股支持置顶、上移、下移和置底", () => {
  assert.deepEqual(reorderWatchlist(items, "000003", "top").map((item) => item.symbol), ["000003", "000001", "000002"]);
  assert.deepEqual(reorderWatchlist(items, "000003", "up").map((item) => item.symbol), ["000001", "000003", "000002"]);
  assert.deepEqual(reorderWatchlist(items, "000001", "down").map((item) => item.symbol), ["000002", "000001", "000003"]);
  assert.deepEqual(reorderWatchlist(items, "000001", "bottom").map((item) => item.symbol), ["000002", "000003", "000001"]);
});

test("自选股在边界位置移动时保持不变", () => {
  assert.equal(reorderWatchlist(items, "000001", "top"), items);
  assert.equal(reorderWatchlist(items, "000003", "down"), items);
});

test("删除所选自选股且不影响其他股票", () => {
  assert.deepEqual(removeWatchItem(items, "000002").map((item) => item.symbol), ["000001", "000003"]);
  assert.equal(removeWatchItem(items, "999999"), items);
});
