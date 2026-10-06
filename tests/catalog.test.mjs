import test from "node:test";
import assert from "node:assert/strict";
import { parseTencentHints, searchStocks } from "../src/data/catalog.ts";

const unavailableFetch = async () => {
  throw new Error("network unavailable");
};

test("股票搜索支持代码的部分匹配", async () => {
  const results = await searchStocks("688", unavailableFetch);
  assert.ok(results.some((stock) => stock.symbol === "688019"));
});

test("股票搜索支持名称的部分匹配", async () => {
  const results = await searchStocks("雅克", unavailableFetch);
  assert.deepEqual(results.map((stock) => stock.symbol), ["002409"]);
});

test("离线搜索支持白云机场 600004", async () => {
  const results = await searchStocks("600004", unavailableFetch);
  assert.deepEqual(results.map((stock) => stock.symbol), ["600004"]);
  assert.equal(results[0].name, "白云机场");
});

test("腾讯搜索建议支持市场与代码分列的格式", () => {
  const results = parseTencentHints('v_hint="sh~600004~白云机场~BYJC";');
  assert.deepEqual(results, [{ symbol: "600004", name: "白云机场", market: "sh" }]);
});

test("腾讯搜索建议解码真实接口返回的 Unicode 股票名称", () => {
  const payload = String.raw`v_hint="sh~600007~\u4e2d\u56fd\u56fd\u8d38~zggm~GP-A^sh~600008~\u9996\u521b\u73af\u4fdd~schb~GP-A^sh~688114~\u534e\u5927\u667a\u9020~hdzz~GP-A-KCB"`;
  assert.deepEqual(parseTencentHints(payload), [
    { symbol: "600007", name: "中国国贸", market: "sh" },
    { symbol: "600008", name: "首创环保", market: "sh" },
    { symbol: "688114", name: "华大智造", market: "sh" },
  ]);
});

test("股票搜索可使用腾讯返回的简称拼音首字母", async () => {
  const pinyinFetch = async (url) => {
    assert.match(String(url), /q=hdzz/);
    return new Response(String.raw`v_hint="sh~688114~\u534e\u5927\u667a\u9020~hdzz~GP-A-KCB"`, { status: 200 });
  };

  assert.deepEqual(await searchStocks("hdzz", pinyinFetch), [
    { symbol: "688114", name: "华大智造", market: "sh" },
  ]);
});

test("桌面端优先通过原生加载器搜索，避免 WebView CORS 限制", async () => {
  const forbiddenWebviewFetch = async () => {
    throw new Error("WebView fetch should not run");
  };
  const nativeLoader = async (query) => {
    assert.equal(query, "600008");
    return String.raw`v_hint="sh~600008~\u9996\u521b\u73af\u4fdd~schb~GP-A"`;
  };

  assert.deepEqual(await searchStocks("600008", forbiddenWebviewFetch, nativeLoader), [
    { symbol: "600008", name: "首创环保", market: "sh" },
  ]);
});
