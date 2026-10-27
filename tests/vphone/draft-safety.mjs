// An open editor is enough to stop: never read or log its contents to decide.
export function assertNoActiveEditing(uiTree) {
  if (!Array.isArray(uiTree?.elements) || uiTree.elements.length === 0) {
    throw new Error("Cannot verify the current app UI; refusing installation or termination");
  }
  const labels = uiTree.elements.map((element) => String(element.label || ""));
  if (labels.some((label) => ["关闭新消息", "消息内容", "关闭编辑标记", "新标签名称", "关闭发送者名称"].some((editor) => label.includes(editor)))) {
    throw new Error("An editor is open in VPhone; finish editing or explicitly clear the draft before running smoke tests");
  }
  const ready = labels.includes("消息") && labels.includes("我的");
  const setup = labels.some((label) => label.includes("连接你的云端空间"));
  if (!ready && !setup) {
    throw new Error("The app is not at its idle shell or setup page; refusing installation or termination");
  }
}

export function assertEmptyComposer(uiTree) {
  const elements = uiTree?.elements || [];
  const editor = elements.find((element) => element.label === "消息内容");
  const emptyText = typeof editor?.value === "string" && (editor.value.length === 0 || editor.value === "输入文字，或加入照片和文件…" || editor.value === "写下你的想法…\n选中文字，用上方工具添加格式。");
  const hasAttachments = elements.some((element) => String(element.label || "").includes("移除附件"));
  const protectedState = elements.some((element) => /已标记|草稿自动保存失败/.test(String(element.label || "")));
  if (!emptyText || hasAttachments || protectedState) {
    throw new Error("A nonempty or unverifiable draft exists in VPhone; preserve it before running smoke tests");
  }
}
