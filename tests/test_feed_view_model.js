import assert from 'node:assert/strict';
import '../frontend/feed-view-model.js';

const feedViewModel = globalThis.transferGenieFeedViewModel;

function message(overrides = {}) {
  return {
    filename: '001.txt',
    sender: 'Alice',
    timestamp_ms: 1710000000000,
    size: 128,
    kind: 'text',
    original_name: '001.txt',
    content: 'hello',
    marked: false,
    format: 'text',
    ...overrides,
  };
}

function testPlainTextMessage() {
  const viewModel = feedViewModel.createMessageViewModel(message(), {
    senderName: 'Bob',
    formatTime: () => '2024-03-09 10:00:00',
    formatBytes: () => '128 B',
    isImagePath: () => false,
  });

  assert.equal(viewModel.isText, true);
  assert.equal(viewModel.isFile, false);
  assert.equal(viewModel.isMarkdown, false);
  assert.equal(viewModel.isSelf, false);
  assert.equal(viewModel.headerText, 'Alice · 2024-03-09 10:00:00');
  assert.equal(viewModel.bodyText, 'hello');
  assert.equal(viewModel.metaText, '大小 128 B');
}

function testSelfMarkdownMessage() {
  const viewModel = feedViewModel.createMessageViewModel(
    message({
      sender: 'Bob',
      format: 'markdown',
      content: '# hi',
      marked: true,
      sending: true,
      sendStatus: 'sending',
    }),
    {
      senderName: 'Bob',
      formatTime: () => 'T',
      formatBytes: () => '1 KB',
      isImagePath: () => false,
    }
  );

  assert.equal(viewModel.isMarkdown, true);
  assert.equal(viewModel.isSelf, true);
  assert.equal(viewModel.isMarked, true);
  assert.equal(viewModel.isSending, true);
  assert.equal(viewModel.sendStatus, 'sending');
  assert.equal(viewModel.bodyText, '# hi');
}

function testImageFileMessage() {
  const viewModel = feedViewModel.createMessageViewModel(
    message({
      kind: 'file',
      original_name: 'photo.png',
      content: null,
      uploading: true,
    }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '2 MB',
      isImagePath: (value) => value.endsWith('.png'),
    }
  );

  assert.equal(viewModel.isFile, true);
  assert.equal(viewModel.isImage, true);
  assert.equal(viewModel.isUploading, true);
  assert.equal(viewModel.bodyText, 'photo.png');
  assert.equal(viewModel.showOpenFileAction, false);
}

function testCreateMessageViewModels() {
  const viewModels = feedViewModel.createMessageViewModels(
    [
      message({ filename: '001.txt', sender: 'A' }),
      message({ filename: '002.txt', sender: 'B', kind: 'file', original_name: 'b.bin', content: null }),
    ],
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: () => false,
    }
  );

  assert.equal(viewModels.length, 2);
  assert.equal(viewModels[0].filename, '001.txt');
  assert.equal(viewModels[1].isFile, true);
  assert.equal(viewModels[1].bodyText, 'b.bin');
}

function testCanRenderInVueFlag() {
  const plain = feedViewModel.createMessageViewModel(message(), {
    senderName: '',
    formatTime: () => 'T',
    formatBytes: () => '1 B',
    isImagePath: () => false,
  });
  const markdown = feedViewModel.createMessageViewModel(
    message({ format: 'markdown', content: '# title' }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: () => false,
    }
  );
  const sending = feedViewModel.createMessageViewModel(
    message({ sending: true, sendStatus: 'sending' }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: () => false,
    }
  );
  const file = feedViewModel.createMessageViewModel(
    message({ kind: 'file', original_name: 'archive.zip', content: null }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: () => false,
      hasLocalMessageFile: () => true,
      isDownloadTaskActive: () => false,
    }
  );

  assert.equal(plain.canRenderInVue, true);
  assert.equal(markdown.canRenderInVue, false);
  assert.equal(sending.canRenderInVue, false);
  assert.equal(file.canRenderInVue, true);
  assert.equal(file.hasLocalFile, true);
  assert.equal(file.showOpenFileAction, true);
  assert.equal(file.showSaveFileAsAction, true);
}

function testComplexFileMessagesStayOnLegacyPath() {
  const imageFile = feedViewModel.createMessageViewModel(
    message({ kind: 'file', original_name: 'photo.png', content: null }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: (value) => value.endsWith('.png'),
      hasLocalMessageFile: () => true,
      isDownloadTaskActive: () => false,
    }
  );
  const downloadingFile = feedViewModel.createMessageViewModel(
    message({ kind: 'file', original_name: 'archive.zip', content: null }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: () => false,
      hasLocalMessageFile: () => false,
      isDownloadTaskActive: () => true,
    }
  );
  const uploadingFile = feedViewModel.createMessageViewModel(
    message({ kind: 'file', original_name: 'archive.zip', content: null, uploading: true }),
    {
      senderName: '',
      formatTime: () => 'T',
      formatBytes: () => '1 B',
      isImagePath: () => false,
      hasLocalMessageFile: () => false,
      isDownloadTaskActive: () => false,
    }
  );

  assert.equal(imageFile.canRenderInVue, false);
  assert.equal(downloadingFile.canRenderInVue, false);
  assert.equal(uploadingFile.canRenderInVue, false);
}

function run() {
  testPlainTextMessage();
  testSelfMarkdownMessage();
  testImageFileMessage();
  testCreateMessageViewModels();
  testCanRenderInVueFlag();
  testComplexFileMessagesStayOnLegacyPath();
  console.log('feed-view-model tests passed');
}

run();
