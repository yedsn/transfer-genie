import assert from 'node:assert/strict';
await import('../src-ui/src/utils/media-runtime.js');
const runtime = globalThis.transferGenieMediaRuntime;

assert.equal(runtime.extensionOf('C:\\Media Files\\Movie.MP4'), 'mp4');
assert.equal(runtime.mediaKind('photo.AVIF'), 'image');
assert.equal(runtime.mediaKind('voice.bin', 'audio/wav'), 'audio');
assert.equal(runtime.mediaKind('clip.webm'), 'video');
assert.equal(runtime.mediaKind('archive.zip'), 'archive');
assert.equal(runtime.mediaKind('report.pdf'), 'document');
assert.equal(runtime.mediaKind('settings.json'), 'code');
assert.deepEqual(runtime.filePreviewModel('report.pdf'), {
  kind: 'document', extension: 'pdf', label: '文档', glyph: 'PDF', visual: false, playable: false,
});
assert.deepEqual(runtime.filePreviewModel('README', ''), {
  kind: 'file', extension: '', label: '文件', glyph: 'FILE', visual: false, playable: false,
});
assert.equal(runtime.filePreviewModel('voice.bin', 'audio/wav').kind, 'audio');
assert.equal(runtime.filePreviewModel('sheet.xlsx').kind, 'document');
assert.equal(runtime.filePreviewModel('source.rs').kind, 'code');
assert.equal(runtime.canPlay('clip.mp4', '', () => ({ canPlayType: (type) => type === 'video/mp4' ? 'probably' : '' })), true);
assert.equal(runtime.canPlay('clip.mkv', '', () => ({ canPlayType: () => '' })), null);
assert.equal(runtime.canPlay('notes.txt', '', () => ({ canPlayType: () => 'probably' })), false);

const events = [];
const first = { pause: () => events.push('pause-first'), removeAttribute: () => events.push('clear-first'), load: () => {} };
const second = { pause: () => events.push('pause-second'), removeAttribute: () => {}, load: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
first.addEventListener = () => {}; first.removeEventListener = () => {};
const session = runtime.createMediaSession({ onActivePath: (path) => events.push(path || 'none') });
session.activate({ owner: 'feed', element: first, path: 'first.mp3' });
session.activate({ owner: 'preview', element: second, path: 'second.mp4' });
assert.ok(events.includes('pause-first'));
assert.equal(session.current().owner, 'preview');
assert.equal(session.stopOwner('feed'), false);
assert.equal(session.stopOwner('preview'), true);
assert.equal(session.current(), null);

let persistentEnded;
const persistent = {
  pause: () => events.push('pause-persistent'),
  removeAttribute: () => events.push('clear-persistent'),
  load: () => {},
  addEventListener: (name, listener) => { if (name === 'ended') persistentEnded = listener; },
  removeEventListener: () => {},
};
session.activate({ owner: 'persistent-audio', element: persistent, path: 'persistent.mp3', persistOnEnded: true });
persistentEnded();
assert.equal(session.current().owner, 'persistent-audio');
assert.equal(events.includes('clear-persistent'), false);
assert.equal(session.stopOwner('persistent-audio'), true);
assert.equal(session.current(), null);

console.log('media runtime tests passed');
