export type MarkdownAction = "bold" | "italic" | "heading" | "bullets" | "numbered" | "quote" | "code" | "link";

export function formatMarkdown(text: string, start: number, end: number, action: MarkdownAction) {
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(start, Math.min(end, text.length));
  const selected = text.slice(start, end);
  if (action === "code" && selected.includes("\n")) {
    const before = (start > 0 && text[start - 1] !== "\n" ? "\n" : "") + "```\n";
    const after = "\n```" + (end < text.length && text[end] !== "\n" ? "\n" : "");
    return { from: start, to: end, insertion: before + selected + after, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length };
  }
  const inline: Partial<Record<MarkdownAction, [string, string]>> = {
    bold: ["**", "**"], italic: ["*", "*"], code: ["`", "`"], link: ["[", "](https://)"],
  };
  const wrapper = inline[action];
  if (wrapper) {
    const [before, after] = wrapper;
    const content = action === "link" && !selected ? "链接文字" : selected;
    const insertion = before + content + after;
    if (action === "link") {
      const urlStart = start + content.length + 3;
      return { from: start, to: end, insertion, selectionStart: urlStart, selectionEnd: urlStart + 8 };
    }
    return { from: start, to: end, insertion, selectionStart: start + before.length, selectionEnd: start + before.length + content.length };
  }
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const content = text.slice(lineStart, lineEnd);
  const prefix = action === "heading" ? "## " : action === "bullets" ? "- " : action === "numbered" ? "1. " : "> ";
  const insertion = content.split("\n").map((line, index) => (action === "numbered" ? `${index + 1}. ` : prefix) + line).join("\n");
  const selectionStart = start === end ? lineStart + insertion.length : lineStart + prefix.length;
  return { from: lineStart, to: lineEnd, insertion, selectionStart, selectionEnd: lineStart + insertion.length };
}
