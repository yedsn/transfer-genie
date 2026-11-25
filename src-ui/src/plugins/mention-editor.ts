import { pluginState, selectBot } from './plugin-store';

export function selectedMention() { return pluginState.target ? pluginState.mentionText : ''; }
export function mentionDeletion(text:string, from:number, to:number, direction:string) {
  const label=selectedMention();
  const start=label ? text.indexOf(label) : -1;
  if(start<0) return null;
  const end=start+label.length;
  const a=from===to && direction==='backward'?from-1:from;
  const b=from===to && direction==='forward'?to+1:to;
  return a<end && b>start ? {from:Math.min(from,start),to:Math.max(to,end)} : null;
}
export function decorateTextarea(input:HTMLTextAreaElement) {
  const label=selectedMention(), offset=label?input.value.indexOf(label):-1;
  let mirror=input.parentElement?.querySelector<HTMLElement>(':scope > [data-mention-for="'+input.dataset.mentionEditor+'"]');
  if(!input.dataset.mentionEditor) input.dataset.mentionEditor=crypto.randomUUID();
  if(offset<0 || input.closest('.CodeMirror') || input.offsetWidth===0) { mirror?.remove(); input.classList.remove('has-mention-overlay'); return; }
  if(!mirror) { mirror=document.createElement('div'); mirror.dataset.mentionFor=input.dataset.mentionEditor; mirror.className='mention-textarea-mirror'; mirror.setAttribute('aria-hidden','true');input.parentElement?.append(mirror); }
  const style=getComputedStyle(input);
  Object.assign(mirror.style,{left:input.offsetLeft+'px',top:input.offsetTop+'px',width:input.offsetWidth+'px',height:input.offsetHeight+'px',font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,padding:style.padding,borderWidth:style.borderWidth,borderStyle:'solid',borderColor:'transparent',boxSizing:style.boxSizing});
  const chip=document.createElement('span');chip.className='bot-mention-token';chip.textContent=label;
  mirror.replaceChildren(document.createTextNode(input.value.slice(0,offset)),chip,document.createTextNode(input.value.slice(offset+label.length)+'​'));
  input.parentElement!.classList.add('mention-editor-host');input.classList.add('has-mention-overlay');
  mirror.scrollTop=input.scrollTop;mirror.scrollLeft=input.scrollLeft;
}
export function deleteTextareaMention(input:HTMLTextAreaElement,direction:string) {
  const range=mentionDeletion(input.value,input.selectionStart,input.selectionEnd,direction);
  if(!range) return false;
  input.setRangeText('',range.from,range.to,'end');selectBot('');input.dispatchEvent(new Event('input',{bubbles:true}));decorateTextarea(input);return true;
}
