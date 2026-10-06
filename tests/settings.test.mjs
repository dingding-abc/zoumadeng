import test from "node:test";
import assert from "node:assert/strict";
import { ALL_LIST_FIELDS, DEFAULT_SETTINGS, DEFAULT_WATCHLIST, resolveStoredListFields, resolveStoredShowFrame } from "../src/types.ts";

test("默认不显示程序框", () => {
  assert.equal(DEFAULT_SETTINGS.showFrame, false);
});

test("默认配置包含走马灯显示与可自定义的配色", () => {
  assert.equal(DEFAULT_SETTINGS.viewMode, "ticker");
  assert.equal(DEFAULT_SETTINGS.settingsVersion, 8);
  assert.equal(DEFAULT_SETTINGS.fontSize, 12);
  assert.equal(DEFAULT_SETTINGS.backgroundOpacity, 20);
  assert.equal(DEFAULT_SETTINGS.textOpacity, 35);
  assert.equal(DEFAULT_SETTINGS.textColor, "#444444");
  assert.deepEqual(DEFAULT_SETTINGS.listFields, ["symbol", "changePct"]);
  assert.match(DEFAULT_SETTINGS.textColor, /^#[0-9a-f]{6}$/i);
  assert.match(DEFAULT_SETTINGS.backgroundColor, /^#[0-9a-f]{6}$/i);
  assert.match(DEFAULT_SETTINGS.lineColor, /^#[0-9a-f]{6}$/i);
  assert.match(DEFAULT_SETTINGS.upColor, /^#[0-9a-f]{6}$/i);
  assert.match(DEFAULT_SETTINGS.downColor, /^#[0-9a-f]{6}$/i);
  assert.match(DEFAULT_SETTINGS.flatColor, /^#[0-9a-f]{6}$/i);
  assert.deepEqual([...DEFAULT_SETTINGS.listFields].sort(), ["changePct", "symbol"]);
});

test("默认行情字段覆盖八种展示字段", () => {
  assert.deepEqual(ALL_LIST_FIELDS, ["symbol", "name", "price", "changePct", "change", "turnoverRate", "volume", "amount"]);
});

test("旧版默认字段升级为代码和涨幅，但保留用户自定义字段", () => {
  assert.deepEqual(resolveStoredListFields(["symbol", "name", "price", "changePct"], 6), ["symbol", "changePct"]);
  assert.deepEqual(resolveStoredListFields(["symbol", "price"], 6), ["symbol", "price"]);
  assert.deepEqual(resolveStoredListFields(["symbol", "name", "price", "changePct"], 7), ["symbol", "name", "price", "changePct"]);
});

test("旧版默认程序框升级为隐藏，新版用户选择保持不变", () => {
  assert.equal(resolveStoredShowFrame(true, 7), false);
  assert.equal(resolveStoredShowFrame(true, undefined), false);
  assert.equal(resolveStoredShowFrame(true, 8), true);
  assert.equal(resolveStoredShowFrame(false, 8), false);
});

test("默认自选为四个主要指数", () => {
  assert.deepEqual(DEFAULT_WATCHLIST, [
    { symbol: "sh000001", name: "上证指数" },
    { symbol: "sz399001", name: "深圳成指" },
    { symbol: "sz399006", name: "创业板指" },
    { symbol: "sh000680", name: "科创综指" },
  ]);
});
