import test from "node:test";
import assert from "node:assert/strict";
import { createTencentProvider, demoQuotes, parseTencentQuotes } from "../src/data/provider.ts";
import { completeQuotes, sourceTimestamp } from '../src/data/quoteState.ts';

test("解析腾讯行情的价格和涨跌幅", () => {
  const payload = `v_sh000001="1~上证指数~000001~3384.50~3340.00~0~120~";v_sz002409="0~雅克科技~002409~68.20~66.66~0~2860~${"~".repeat(30)}416000000~3.42~";`;
  const quotes = parseTencentQuotes(payload, [{ symbol: "002409", name: "雅克科技" }]);
  assert.equal(quotes.length, 1);
  const stock = quotes.find((quote) => quote.symbol === "002409");
  assert.equal(stock?.price, 68.2);
  assert.ok(Math.abs((stock?.changePct ?? 0) - 2.3105) < 0.001);
  assert.equal(stock?.volume, 286000);
  assert.equal(stock?.amount, 416000000);
  assert.equal(stock?.turnoverRate, 3.42);
});

test("忽略接口中未请求的股票", () => {
  const quotes = parseTencentQuotes('v_sh600519="1~贵州茅台~600519~1700~1680~0~";', [
    { symbol: "sh000001", name: "上证指数" },
  ]);
  assert.deepEqual(quotes, []);
});

test("实时与演示行情都只包含用户自选内容", () => {
  const items = [{ symbol: "002409", name: "雅克科技" }];
  assert.deepEqual(demoQuotes(items).map((quote) => quote.symbol), ["002409"]);
});

test('不响应的行情请求在截止时间终止并发送 abort', async () => {
  let signal;
  const provider = createTencentProvider(async (_url, options) => { signal = options.signal; return new Promise(() => {}); }, 20);
  await assert.rejects(provider.fetchQuotes([{ symbol: 'sh000001', name: '上证指数' }]), /超时/);
  assert.equal(signal.aborted, true);
});
test('响应体读取也受同一超时控制', async () => {
  const provider = createTencentProvider(async () => ({ ok: true, text: () => new Promise(() => {}) }), 20);
  await assert.rejects(provider.fetchQuotes([{ symbol: 'sh000001', name: '上证指数' }]), /超时/);
});
test('异常 HTTP 状态、空响应、无效代码均明确失败', async () => {
  const items = [{ symbol: 'sh000001', name: '上证指数' }];
  await assert.rejects(createTencentProvider(async () => ({ ok: false, status: 503 })).fetchQuotes(items), /503/);
  await assert.rejects(createTencentProvider(async () => ({ ok: true, text: async () => '' })).fetchQuotes(items), /未返回/);
  await assert.rejects(createTencentProvider(async () => { throw new Error('不应请求'); }).fetchQuotes([{ symbol: 'sh000001&other=x', name: 'x' }]), /无效/);
});
test('部分返回保持所有自选位置，缺失项为 -- 而非演示数值', () => {
  const items = [{ symbol: 'sh000001', name: '上证指数' }, { symbol: 'sh600519', name: '贵州茅台' }];
  const received = parseTencentQuotes('v_sh000001="1~上证指数~000001~3384~3340~0~120~";', items);
  const result = completeQuotes(items, received);
  assert.equal(result.missing, 1);
  assert.equal(result.quotes.length, 2);
  assert.equal(result.quotes[1].price, null);
  assert.equal(result.quotes[1].name, '贵州茅台');
});
test('数据源时间采用明确中国时区，无效日期不会被自动修正', () => {
  assert.equal(sourceTimestamp('20260930153000'), '2026-09-30T15:30:00+08:00');
  assert.equal(sourceTimestamp('20260230153000'), undefined);
  assert.equal(sourceTimestamp('20260930253000'), undefined);
  assert.equal(sourceTimestamp(''), undefined);
});
test('空白价格字段不能被解析为零价', () => {
  const quotes = parseTencentQuotes('v_sh000001="1~上证指数~000001~ ~3340~0~120~";', [{ symbol: 'sh000001', name: '上证指数' }]);
  assert.equal(quotes[0].price, null);
  assert.equal(completeQuotes([{ symbol: 'sh000001', name: '上证指数' }], quotes).missing, 1);
});

test('超大流式行情响应会停止读取', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(createTencentProvider(async () => response).fetchQuotes([{ symbol: 'sh000001', name: '上证指数' }]), /过大/);
  assert.equal(cancelled, true);
});
