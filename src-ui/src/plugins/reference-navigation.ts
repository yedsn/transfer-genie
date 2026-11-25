export async function locateQuotedMessage(filename: string): Promise<boolean> {
  const handler = (window as any).transferGenieLocateReference;
  if (handler && !await handler(filename)) return false;
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-filename]'))
    .find(node => node.dataset.filename === filename && node.getClientRects().length > 0);
  if (!target) return false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
  if (!reduced) target.animate([{ backgroundColor: 'var(--panel-soft)' }, { backgroundColor: 'transparent' }], { duration: 1400 });
  return true;
}
