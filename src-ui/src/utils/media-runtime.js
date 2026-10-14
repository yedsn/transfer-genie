(function (root, factory) {
  const runtime = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = runtime;
  root.transferGenieMediaRuntime = runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EXTENSIONS = {
    image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif']),
    audio: new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma']),
    video: new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv']),
    document: new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'rtf']),
    archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']),
    code: new Set(['txt', 'md', 'json', 'yaml', 'yml', 'xml', 'csv', 'js', 'ts', 'css', 'html', 'rs', 'py', 'go', 'java', 'sh']),
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
    if (mime === 'application/pdf' || /officedocument|msword|ms-excel|ms-powerpoint/.test(mime)) return 'document';
    if (/zip|rar|7z|tar|gzip|compressed/.test(mime)) return 'archive';
    if (mime.startsWith('text/') || /json|xml|yaml/.test(mime)) return 'code';
    const extension = extensionOf(name);
    return Object.keys(EXTENSIONS).find((kind) => EXTENSIONS[kind].has(extension)) || 'file';
  }

  function filePreviewModel(name, mimeType) {
    const kind = mediaKind(name, mimeType);
    const extension = extensionOf(name);
    const labels = { image: '图片', video: '视频', audio: '音频', document: '文档', archive: '压缩包', code: '文本', file: '文件' };
    const glyphs = { image: 'IMG', video: 'VID', audio: 'AUD', document: 'DOC', archive: 'ZIP', code: 'TXT', file: 'FILE' };
    return {
      kind,
      extension,
      label: labels[kind] || labels.file,
      glyph: extension ? extension.slice(0, 4).toUpperCase() : (glyphs[kind] || glyphs.file),
      visual: kind === 'image' || kind === 'video',
      playable: kind === 'audio' || kind === 'video',
    };
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

  return { extensionOf, mediaKind, filePreviewModel, mimeCandidates, canPlay, createMediaSession };
});
