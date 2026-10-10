(function (root, factory) {
  const runtime = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = runtime;
  root.transferGenieMediaRuntime = runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EXTENSIONS = {
    image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif']),
    audio: new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma']),
    video: new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv']),
  };

  function extensionOf(name) {
    const clean = String(name || '').split(/[?#]/, 1)[0];
    const base = clean.split(/[/\\]/).pop() || '';
    const index = base.lastIndexOf('.');
    return index > 0 ? base.slice(index + 1).toLowerCase() : '';
  }

  function mediaKind(name, mimeType) {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    const extension = extensionOf(name);
    return Object.keys(EXTENSIONS).find((kind) => EXTENSIONS[kind].has(extension)) || 'file';
  }

  function mimeCandidates(name, kind = mediaKind(name)) {
    const extension = extensionOf(name);
    const known = {
      mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
      ogg: kind === 'video' ? 'video/ogg' : 'audio/ogg', opus: 'audio/ogg; codecs=opus',
      flac: 'audio/flac', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime',
      webm: kind === 'audio' ? 'audio/webm' : 'video/webm',
    };
    return known[extension] ? [known[extension]] : [];
  }

  function canPlay(name, mimeType, createElement) {
    const kind = mediaKind(name, mimeType);
    if (!['audio', 'video'].includes(kind)) return false;
    const factory = createElement || ((tag) => document.createElement(tag));
    const element = factory(kind);
    if (!element || typeof element.canPlayType !== 'function') return null;
    const candidates = mimeType ? [mimeType] : mimeCandidates(name, kind);
    if (!candidates.length) return null;
    return candidates.some((candidate) => !!element.canPlayType(candidate).replace('no', ''));
  }

  function createMediaSession(options = {}) {
    let current = null;
    const notifyPath = typeof options.onActivePath === 'function' ? options.onActivePath : () => {};

    function stop(reason = 'stop', owner) {
      if (!current || (owner && current.owner !== owner)) return false;
      const active = current;
      current = null;
      try { active.element?.pause?.(); } catch (_) {}
      try {
        if (active.element) {
          active.element.removeAttribute?.('src');
          active.element.load?.();
        }
      } catch (_) {}
      try { active.cleanup?.(reason); } catch (_) {}
      if (active.objectUrl && typeof URL !== 'undefined') {
        try { URL.revokeObjectURL(active.objectUrl); } catch (_) {}
      }
      notifyPath(null);
      return true;
    }

    function activate(entry) {
      if (!entry?.element) throw new Error('缺少媒体元素');
      if (current?.element !== entry.element) stop('switch');
      current = { ...entry };
      notifyPath(entry.path || null);
      const ended = () => { if (current?.element === entry.element) stop('ended'); };
      entry.element.addEventListener?.('ended', ended, { once: true });
      const previousCleanup = current.cleanup;
      current.cleanup = (reason) => {
        entry.element.removeEventListener?.('ended', ended);
        previousCleanup?.(reason);
      };
      return current;
    }

    return { activate, stop, stopOwner: (owner) => stop('owner-closed', owner), current: () => current };
  }

  return { extensionOf, mediaKind, mimeCandidates, canPlay, createMediaSession };
});
