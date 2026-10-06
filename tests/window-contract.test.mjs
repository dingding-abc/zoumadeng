import test from "node:test";
import assert from "node:assert/strict";
import { addWatchItem, parseAddStockRequest, parseSettingsSaveRequest, watchlistForSettingsSave } from "../src/windowContract.ts";
import { DEFAULT_SETTINGS } from "../src/types.ts";

test("添加请求规范化代码并拒绝错误或过长的跨窗口数据", () => {
  const request = parseAddStockRequest({ requestId: "request-123", stock: { symbol: "SH600519", name: " 贵州茅台 " } });
  assert.deepEqual(request, { requestId: "request-123", stock: { symbol: "sh600519", name: "贵州茅台" } });
  assert.equal(parseAddStockRequest({ requestId: "request-123", stock: { symbol: "600519", name: "贵州茅台" } }), undefined);
  assert.equal(parseAddStockRequest({ requestId: "request-123", stock: { symbol: "sh600519", name: "" } }), undefined);
  assert.equal(parseAddStockRequest({ requestId: "request-123", stock: { symbol: "sh600519", name: "字".repeat(41) } }), undefined);
});

test("添加相同股票只产生一次列表变化", () => {
  const first = addWatchItem([], { symbol: "sh600519", name: "贵州茅台" });
  assert.equal(first.status, "added");
  const second = addWatchItem(first.items, { symbol: "sh600519", name: "另一个名称" });
  assert.equal(second.status, "already-present");
  assert.equal(second.items, first.items);
});

test("设置保存沿用最新自选，恢复默认时仍保留编辑期间新加的股票", () => {
  const baseline = [{ symbol: "sh000001", name: "上证指数" }];
  const added = { symbol: "sh600519", name: "贵州茅台" };
  assert.deepEqual(watchlistForSettingsSave([...baseline, added], baseline, false), [...baseline, added]);
  assert.deepEqual(watchlistForSettingsSave([...baseline, added], baseline, true), [added]);
  assert.ok(parseSettingsSaveRequest({ requestId: "request-123", draft: DEFAULT_SETTINGS, resetWatchlist: false, baseline }));
  assert.equal(parseSettingsSaveRequest({ requestId: "short", draft: DEFAULT_SETTINGS, resetWatchlist: false, baseline }), undefined);
});
