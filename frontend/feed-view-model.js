(function bootstrapFeedViewModel(globalScope) {
  if (!globalScope) {
    return;
  }

  function normalizeText(value) {
    return String(value || '');
  }

  function createMessageViewModel(message, context) {
    var source = message || {};
    var ctx = context || {};
    var senderName = normalizeText(ctx.senderName).trim();
    var sender = normalizeText(source.sender);
    var kind = normalizeText(source.kind) || 'text';
    var filename = normalizeText(source.filename);
    var originalName = normalizeText(source.original_name || source.filename);
    var timestampMs = Number(source.timestamp_ms || 0);
    var size = Number(source.size || 0);
    var format = normalizeText(source.format || 'text');
    var isFile = kind === 'file';
    var isText = !isFile;
    var isMarkdown = isText && format === 'markdown';
    var isSelf = sender === '我' || (!!senderName && sender === senderName);
    var isMarked = !!source.marked;
    var isUploading = !!source.uploading;
    var isSending = !!source.sending;
    var isImage = isFile && !!ctx.isImagePath && ctx.isImagePath(originalName);
    var hasLocalFile = !!(ctx.hasLocalMessageFile && ctx.hasLocalMessageFile(source));
    var isDownloading = !!(ctx.isDownloadTaskActive && ctx.isDownloadTaskActive(source));
    var canRenderSimpleText = isText && !isMarkdown && !isSending && !isUploading;
    var canRenderSimpleFile = isFile && !isImage && !isUploading && !isDownloading;
    var canRenderInVue = canRenderSimpleText || canRenderSimpleFile;
    var headerText = ctx.formatTime
      ? sender + ' · ' + ctx.formatTime(timestampMs)
      : sender;
    var bodyText = isText ? normalizeText(source.content) : originalName;
    var metaText = ctx.formatBytes ? '大小 ' + ctx.formatBytes(size) : '';

    return {
      filename: filename,
      originalName: originalName,
      timestampMs: timestampMs,
      kind: kind,
      format: format,
      isFile: isFile,
      isText: isText,
      isMarkdown: isMarkdown,
      isImage: isImage,
      isSelf: isSelf,
      isMarked: isMarked,
      isUploading: isUploading,
      isSending: isSending,
      hasLocalFile: hasLocalFile,
      isDownloading: isDownloading,
      canRenderInVue: canRenderInVue,
      showCopyAction: isText && !isSending,
      showDownloadTextAction: isText && !isSending,
      showOpenFileAction: isFile && !isUploading,
      showDownloadFileAction: isFile && !isUploading,
      showSaveFileAsAction: isFile && !isUploading,
      sendStatus: normalizeText(source.sendStatus),
      sendError: normalizeText(source.sendError),
      headerText: headerText,
      bodyText: bodyText,
      metaText: metaText,
      message: source,
    };
  }

  function createMessageViewModels(messages, context) {
    return (Array.isArray(messages) ? messages : []).map(function (message) {
      return createMessageViewModel(message, context);
    });
  }

  var api = {
    createMessageViewModel: createMessageViewModel,
    createMessageViewModels: createMessageViewModels,
  };

  globalScope.transferGenieFeedViewModel = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
