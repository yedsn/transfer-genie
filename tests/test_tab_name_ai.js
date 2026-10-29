import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../src-ui/src/workspace/tab-name-ai.js';

const ai = globalThis.transferGenieTabNameAi;
const configured = { aiEnabled: true, aiBaseUrl: 'https://example.com/v1', aiApiKey: 'key', aiModel: 'model' };
const draft = { text: '这是一份发布计划草稿', format: 'markdown' };

assert.equal(ai.availability({ text: '  ' }, configured).status, 'empty');
assert.equal(ai.availability(draft, { ...configured, aiEnabled: false }).status, 'unavailable');
assert.equal(ai.availability(draft, configured).status, 'loading');

const request = ai.buildRequest(draft);
assert.equal(request.text, draft.text);
assert.equal(request.format, 'markdown');
assert.match(request.temporaryPrompt.userPrompt, /只输出名称/);
assert.equal(ai.buildRequest(draft, '  自定义 {{text}} / {{format}}  ').temporaryPrompt.userPrompt, '自定义 {{text}} / {{format}}');
assert.equal(ai.buildRequest(draft, '   ').temporaryPrompt.userPrompt, ai.DEFAULT_PROMPT);
assert.equal(ai.normalizeSuggestion(' “发布计划” \n额外解释'), '发布计划');
const shortened = ai.normalizeSuggestion('这是一个明显超过十六个字符的标签名称建议');
assert.equal(Array.from(shortened).length, 16);
assert.ok('这是一个明显超过十六个字符的标签名称建议'.startsWith(shortened));

let emptyCalls = 0;
const empty = await ai.generate({ text: ' ' }, configured, async () => { emptyCalls += 1; });
assert.equal(empty.status, 'empty');
assert.equal(emptyCalls, 0, '空草稿不调用 AI');

const unavailable = await ai.generate(draft, configured, null);
assert.equal(unavailable.status, 'unavailable');

const ready = await ai.generate(draft, configured, async () => ({ outputText: '“秋季发布计划”' }));
assert.deepEqual(ready, { available: true, status: 'ready', message: 'AI 建议', suggestion: '秋季发布计划' });
let configuredRequest = null;
await ai.generate(draft, { ...configured, aiTabNamePrompt: '自定义命名：{{text}}' }, async (payload) => {
  configuredRequest = payload;
  return { outputText: '自定义名称' };
});
assert.equal(configuredRequest.temporaryPrompt.userPrompt, '自定义命名：{{text}}');

const failed = await ai.generate(draft, configured, async () => { throw new Error('网络失败'); });
assert.equal(failed.status, 'error');
assert.match(failed.message, /网络失败/);

const session = ai.createRequestSession();
const oldRequest = session.begin();
const currentRequest = session.begin();
assert.equal(session.isCurrent(oldRequest), false, '重新打开后旧请求失效');
assert.equal(session.isCurrent(currentRequest), true);
session.cancel();
assert.equal(session.isCurrent(currentRequest), false, '关闭窗口后请求失效');

const component = await readFile(new URL('../src-ui/src/workspace/ComposerWorkspace.vue', import.meta.url), 'utf8');
assert.ok(component.includes("ctxAction('rename')"), '右键菜单提供重命名入口');
assert.match(component, /v-model="renameDialog.title"/, '命名窗口预留手动输入');
const openRenameSource = component.slice(component.indexOf('async function openRenameDialog'), component.indexOf('async function generateRenameSuggestion'));
assert.ok(!openRenameSource.includes('tabNameAi.generate'), '打开命名窗口不会调用 AI');
assert.ok(!openRenameSource.includes('processText'), '打开命名窗口不会发送草稿内容');
assert.ok(component.includes('@click="generateRenameSuggestion"'), '仅由 AI 图标按钮触发生成');
assert.ok(component.includes('aria-label="使用 AI 根据草稿生成名称"'), 'AI 图标按钮有明确的辅助说明');
assert.ok(component.includes('renameDialog.value.title = result.suggestion'), 'AI 结果直接替换输入框内容');
assert.ok(!component.includes('cw-rename-ai-status'), '不显示下方 AI 状态区域');
assert.ok(!component.includes('cw-rename-suggestion'), '不显示下方 AI 建议区域');

console.log('tab name AI tests passed');
