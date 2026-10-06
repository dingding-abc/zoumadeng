import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { exportSettings, importSettings, parsePortableSettings, restoredWatchlist } from '../src/settingsBackup.ts';
import { parseSettingsSaveRequest } from '../src/windowContract.ts';

test('配置完整导出和导入往返，不与输入共享可变对象', () => {
  const before = structuredClone(DEFAULT_SETTINGS);
  const text = exportSettings(before, new Date('2026-09-30T00:00:00Z'));
  const restored = importSettings(text);
  assert.deepEqual(restored, before);
  restored.watchlist[0].name = 'changed';
  assert.notEqual(restored.watchlist[0].name, before.watchlist[0].name);
  assert.equal(JSON.parse(text).version, 1);
});
test('未来版本、无效 JSON、超大文件拒绝导入', () => {
  const data = JSON.parse(exportSettings(DEFAULT_SETTINGS));
  for (const text of ['{', JSON.stringify({ ...data, version: 2 }), JSON.stringify({ ...data, format: 'other' }), ' '.repeat(128 * 1024 + 1)]) assert.throws(() => importSettings(text));
});
test('更新时间隐藏选项可备份恢复，旧备份默认显示并拒绝错误类型', () => {
  const hidden = { ...DEFAULT_SETTINGS, showUpdateTime: false };
  assert.equal(importSettings(exportSettings(hidden)).showUpdateTime, false);
  const legacy = JSON.parse(exportSettings(DEFAULT_SETTINGS));
  delete legacy.settings.showUpdateTime;
  assert.equal(importSettings(JSON.stringify(legacy)).showUpdateTime, true);
  for (const value of [null, 'false', 0]) assert.throws(() => parsePortableSettings({ ...DEFAULT_SETTINGS, showUpdateTime: value }));
  assert.ok(parseSettingsSaveRequest({ requestId: 'time-12345', draft: hidden, resetWatchlist: false, baseline: hidden.watchlist }));
});
test('配置外观数值、字段和股票名称代码在边界校验', () => {
  for (const patch of [{ speed: Infinity }, { fontSize: 100 }, { mode: 'unknown' }, { textColor: 'url(https://evil)' }, { listFields: [] }, { watchlist: [{ symbol: '../secret', name: 'bad' }] }, { watchlist: [{ symbol: 'sh600519', name: 'a'.repeat(41) }] }]) assert.throws(() => parsePortableSettings({ ...DEFAULT_SETTINGS, ...patch }));
});
test('自选股票重复与超量拒绝，空自选允许导出恢复', () => {
  const item = { symbol: 'sh600519', name: '贵州茅台' };
  assert.throws(() => parsePortableSettings({ ...DEFAULT_SETTINGS, watchlist: [item, { ...item, symbol: 'SH600519' }] }));
  assert.throws(() => parsePortableSettings({ ...DEFAULT_SETTINGS, watchlist: Array(201).fill(item) }));
  assert.deepEqual(importSettings(exportSettings({ ...DEFAULT_SETTINGS, watchlist: [] })).watchlist, []);
});
test('恢复导入列表保留弹窗打开期间新增自选并避免重复', () => {
  const baseline = [{ symbol: 'sh000001', name: '上证指数' }];
  const added = { symbol: 'sh600519', name: '贵州茅台' };
  const imported = [{ symbol: 'sz000001', name: '平安银行' }];
  assert.deepEqual(restoredWatchlist(imported, [...baseline, added], baseline), [...imported, added]);
  assert.deepEqual(restoredWatchlist([added], [...baseline, added], baseline), [added]);
  assert.deepEqual(restoredWatchlist([], [...baseline, added], baseline), [added]);
});
test('跨窗口恢复沿现有保存请求，拒绝同时恢复默认或错误数值', () => {
  const request = { requestId: 'restore-12345', draft: DEFAULT_SETTINGS, resetWatchlist: false, restoreWatchlist: true, baseline: DEFAULT_SETTINGS.watchlist };
  assert.ok(parseSettingsSaveRequest(request));
  assert.equal(parseSettingsSaveRequest({ ...request, resetWatchlist: true }), undefined);
  assert.equal(parseSettingsSaveRequest({ ...request, draft: { ...DEFAULT_SETTINGS, fontSize: -1 } }), undefined);
});
