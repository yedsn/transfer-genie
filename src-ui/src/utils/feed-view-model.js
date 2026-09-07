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
    var polishedText = isText ? normalizeText(source.content) : '';
    var rawTranscriptText = normalizeText(source.transcript_raw_text).trim();
    var isMarkdown = isText && format === 'markdown';
    var isSelf = sender === '我' || (!!senderName && sender === senderName);
    var isMarked = !!source.marked;
    var isSpeechTranscript = normalizeText(source.transcript_source) === 'speech-to-text';
    var isUploading = !!source.uploading;
    var isSending = !!source.sending;
    var isImage = isFile && !!ctx.isImagePath && ctx.isImagePath(originalName);
    var hasLocalFile = !!(ctx.hasLocalMessageFile && ctx.hasLocalMessageFile(source));
    var isDownloading = !!(ctx.isDownloadTaskActive && ctx.isDownloadTaskActive(source));
    var previewMaxChars = Number(ctx.previewMaxChars || 0);
    var exceedsPreviewLimit = isText && previewMaxChars > 0 && polishedText.length > previewMaxChars;
    var canRenderSimpleText = isText && !isMarkdown && !isSpeechTranscript && !exceedsPreviewLimit && !isSending && !isUploading;
    var canRenderSimpleFile = isFile && !isImage && !isUploading && !isDownloading;
    var canRenderInVue = canRenderSimpleText || canRenderSimpleFile;
    var headerText = ctx.formatTime
      ? sender + ' · ' + ctx.formatTime(timestampMs)
      : sender;
    var bodyText = isText ? polishedText : originalName;
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
      isSpeechTranscript: isSpeechTranscript,
      hasSpeechRawTranscript: isSpeechTranscript && !!rawTranscriptText && rawTranscriptText !== polishedText.trim(),
      speechRawTranscriptText: rawTranscriptText,
      speechPolishedTranscriptText: polishedText,
      exceedsPreviewLimit: exceedsPreviewLimit,
      isUploading: isUploading,
      isSending: isSending,
      hasLocalFile: hasLocalFile,
      isDownloading: isDownloading,
      canRenderInVue: canRenderInVue,
      showCopyAction: isText && !isSending,
      showPlaySourceAudioAction: isSpeechTranscript && !isSending,
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
