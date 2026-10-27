import assert from "node:assert/strict";
import { assertEmptyComposer, assertNoActiveEditing } from "./vphone/draft-safety.mjs";

const tree = (...labels) => ({ elements: labels.map((label) => ({ label })) });
assert.doesNotThrow(() => assertNoActiveEditing(tree("消息", "标记", "我的")));
assert.doesNotThrow(() => assertNoActiveEditing(tree("SUPABASE ONLY", "连接你的云端空间")));
for (const editor of ["关闭新消息", "消息内容", "关闭编辑标记", "新标签名称", "关闭发送者名称"]) {
  assert.throws(() => assertNoActiveEditing(tree("消息", "我的", editor)), /editor is open/);
}
assert.throws(() => assertNoActiveEditing(tree()), /Cannot verify/);
assert.throws(() => assertNoActiveEditing(null), /Cannot verify/);
assert.throws(() => assertNoActiveEditing(tree("文件", "取消")), /not at its idle/);
const composer = (value, attachments = false) => ({ elements: [{ label: "消息内容", value }, ...(attachments ? [{ label: "移除附件" }] : [])] });
assert.doesNotThrow(() => assertEmptyComposer(composer("")));
assert.doesNotThrow(() => assertEmptyComposer(composer("输入文字，或加入照片和文件…")));
assert.doesNotThrow(() => assertEmptyComposer(composer("写下你的想法…\n选中文字，用上方工具添加格式。")));
for (const draft of [composer("unsent fixture"), composer(" "), composer("", true), composer(undefined), tree()]) {
  assert.throws(() => assertEmptyComposer(draft), /nonempty or unverifiable draft/);
}
console.log("VPhone draft safety tests passed: idle/setup allowed, editors and unknown UI rejected without reading contents");
