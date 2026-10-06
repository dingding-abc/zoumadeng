import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteStatusText } from '../src/data/quoteState.ts';

test('更新时间可独立隐藏，缺失、刷新和演示状态继续可见', () => {
  assert.equal(quoteStatusText('09:30:05', '', true), '更新 09:30:05');
  assert.equal(quoteStatusText('09:30:05', '', false), '');
  assert.equal(quoteStatusText('09:30:05', '缺 2 项', true), '更新 09:30:05 · 缺 2 项');
  assert.equal(quoteStatusText('09:30:05', '缺 2 项', false), '缺 2 项');
  assert.equal(quoteStatusText('09:30:05', '刷新中', false), '刷新中');
  assert.equal(quoteStatusText(undefined, '演示数据 · 刷新失败', false), '演示数据 · 刷新失败');
  assert.equal(quoteStatusText(undefined, '等待刷新', false), '等待刷新');
});
