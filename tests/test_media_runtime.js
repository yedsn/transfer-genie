import assert from 'node:assert/strict';
await import('../src-ui/src/utils/media-runtime.js');
const runtime = globalThis.transferGenieMediaRuntime;

assert.equal(runtime.extensionOf('C:\\Media Files\\Movie.MP4'), 'mp4');
assert.equal(runtime.mediaKind('photo.AVIF'), 'image');
assert.equal(runtime.mediaKind('voice.bin', 'audio/wav'), 'audio');
assert.equal(runtime.mediaKind('clip.webm'), 'video');
assert.equal(runtime.mediaKind('archive.zip'), 'file');
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

console.log('media runtime tests passed');
