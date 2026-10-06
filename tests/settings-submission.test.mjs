import test from "node:test";
import assert from "node:assert/strict";
import { lockSettingsControls, SettingsSubmissionState } from "../src/settingsSubmission.ts";

test("保存中锁住所有草稿控件，结束后恢复各自原有禁用状态", () => {
  const controls = [{ disabled: false }, { disabled: false }, { disabled: true }];
  const unlock = lockSettingsControls(controls);
  assert.deepEqual(controls.map((control) => control.disabled), [true, true, true]);
  unlock();
  assert.deepEqual(controls.map((control) => control.disabled), [false, false, true]);
});

test("超时重试沿用原快照和请求 ID，草稿修改后产生新请求", () => {
  const state = new SettingsSubmissionState();
  let draft = { color: "white" };
  let created = 0;
  const create = () => ({ requestId: `request-${++created}`, draft: structuredClone(draft) });
  const first = state.begin(create);
  state.draftChanged(); // An input event during the locked attempt cannot invalidate it.
  assert.throws(() => state.begin(create), /仍在进行/);
  state.finish(false); // ACK timeout or error.
  assert.equal(state.begin(create), first);
  state.finish(false);
  draft = { color: "black" };
  state.draftChanged();
  const next = state.begin(create);
  assert.notEqual(next.requestId, first.requestId);
  assert.deepEqual(next.draft, { color: "black" });
  state.finish(true);
  assert.notEqual(state.begin(create).requestId, next.requestId);
  state.finish(false);
});
