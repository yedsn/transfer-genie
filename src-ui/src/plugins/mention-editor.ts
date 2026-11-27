import { downloadDraft, mentionOffset, pluginState, selectBot } from './plugin-store';

export function selectedMention() { return pluginState.target ? pluginState.mentionText : ''; }
export function mentionDeletion(text:string, from:number, to:number, direction:string) {
  const label=selectedMention();
  const start=mentionOffset(text, label);
  if(start<0) return null;
  const end=start+label.length;
  const a=from===to && direction==='backward'?from-1:from;
  const b=from===to && direction==='forward'?to+1:to;
  return a<end && b>start ? {from:Math.min(from,start),to:Math.max(to,end)} : null;
}

export function textareaCharacterRect(input: HTMLTextAreaElement, index: number) {
  const style = getComputedStyle(input);
  const bounds = input.getBoundingClientRect();
  // Match the textarea's content width, including the space lost to scrollbars.
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    position: 'fixed', visibility: 'hidden', pointerEvents: 'none', margin: '0',
    left: bounds.left + input.clientLeft + 'px', top: bounds.top + input.clientTop + 'px',
    width: input.clientWidth + 'px', boxSizing: 'border-box', padding: style.padding,
    font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing, tabSize: style.tabSize, textIndent: style.textIndent,
    textAlign: style.textAlign, direction: style.direction, textTransform: style.textTransform,
    whiteSpace: input.wrap === 'off' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word',
  });
  const text = document.createTextNode(input.value);
  mirror.append(text);
  document.body.append(mirror);
  const range = document.createRange();
  range.setStart(text, index);
  range.setEnd(text, index + 1);
  const rect = range.getBoundingClientRect();
  mirror.remove();
  return new DOMRect(rect.x - input.scrollLeft, rect.y - input.scrollTop, rect.width, rect.height);
}
export function decorateTextarea(input:HTMLTextAreaElement) {
  const label=selectedMention(), offset=mentionOffset(input.value, label);
  let mirror=input.parentElement?.querySelector<HTMLElement>(':scope > [data-mention-for="'+input.dataset.mentionEditor+'"]');
  if(!input.dataset.mentionEditor) input.dataset.mentionEditor=crypto.randomUUID();
  if(offset<0 || input.closest('.CodeMirror') || input.offsetWidth===0) { mirror?.remove(); input.classList.remove('has-mention-overlay'); return; }
  if(!mirror) { mirror=document.createElement('div'); mirror.dataset.mentionFor=input.dataset.mentionEditor; mirror.className='mention-textarea-mirror'; mirror.setAttribute('aria-hidden','true');input.parentElement?.append(mirror); }
  const style=getComputedStyle(input);
  Object.assign(mirror.style,{left:input.offsetLeft+'px',top:input.offsetTop+'px',width:input.offsetWidth+'px',height:input.offsetHeight+'px',font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,padding:style.padding,borderWidth:style.borderWidth,borderStyle:'solid',borderColor:'transparent',boxSizing:style.boxSizing});
  const key = JSON.stringify([input.value, offset, label, downloadDraft.enabled]);
  if (mirror.dataset.mentionContent !== key) {
    mirror.dataset.mentionContent = key;
    const chip=createMentionChip(label);
    if (downloadDraft.enabled) mirror.removeAttribute('aria-hidden');
    else mirror.setAttribute('aria-hidden','true');
    const before = document.createElement('span');
    const after = document.createElement('span');
    before.setAttribute('aria-hidden', 'true'); after.setAttribute('aria-hidden', 'true');
    before.textContent = input.value.slice(0,offset); after.textContent = input.value.slice(offset+label.length)+'​';
    mirror.replaceChildren(before, chip, after);
  }
  input.parentElement!.classList.add('mention-editor-host');input.classList.add('has-mention-overlay');
  mirror.scrollTop=input.scrollTop;mirror.scrollLeft=input.scrollLeft;
}
export function createMentionChip(label: string) {
  const chip = document.createElement(downloadDraft.enabled ? 'button' : 'span');
  chip.className = 'bot-mention-token';
  chip.textContent = label;
  if (chip instanceof HTMLButtonElement) {
    chip.type = 'button';
    chip.dataset.downloadMention = '';
    chip.setAttribute('aria-haspopup', 'menu');
    chip.setAttribute('aria-label', label + '，选择本次下载出口');
    chip.addEventListener('pointerdown', event => event.preventDefault());
  }
  return chip;
}
export function deleteTextareaMention(input:HTMLTextAreaElement,direction:string) {
  const range=mentionDeletion(input.value,input.selectionStart,input.selectionEnd,direction);
  if(!range) return false;
  input.setRangeText('',range.from,range.to,'end');selectBot('');input.dispatchEvent(new Event('input',{bubbles:true}));decorateTextarea(input);return true;
}
