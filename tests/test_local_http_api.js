#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  address: '127.0.0.1',
  port: 6011,
  mode: 'file',
  fileRoute: '/api/send-file',
  textRoute: '/api/send-text',
  timeoutSeconds: 30,
  format: 'text',
};

function formatErrorDetails(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const lines = [error.message];

  if (error.cause instanceof Error) {
    lines.push(`Cause: ${error.cause.message}`);
    if (typeof error.cause.code === 'string') {
      lines.push(`Code: ${error.cause.code}`);
    }
    if (typeof error.cause.errno === 'number') {
      lines.push(`Errno: ${error.cause.errno}`);
    }
    if (typeof error.cause.address === 'string') {
      lines.push(`Address: ${error.cause.address}`);
    }
    if (typeof error.cause.port === 'number') {
      lines.push(`Port: ${error.cause.port}`);
    }
  }

  return lines.join('\n');
}

function tryFormatJson(text) {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function printHelp() {
  console.log(`Usage:
  node tests/test_local_http_api.js [options]

Options:
  --mode <file|text>    Request mode, default file
  --file <path>         Use an existing file
  --text <value>        Text content to send in text mode
  --format <value>      Text format in text mode: text|markdown
  --marked              Mark the sent message
  --tag <name>          Add a tag name, can be repeated
  --address <value>     Bind address to test, default 127.0.0.1
  --port <number>       Port to test, default 6011
  --route <path>        Override API route
  --timeout <seconds>   Request timeout, default 30
  --sample              Force creation of a temporary sample file
  --dry-run             Print request info without sending
  --help                Show this help

Examples:
  node tests/test_local_http_api.js
  node tests/test_local_http_api.js --file C:\\temp\\demo.txt
  node tests/test_local_http_api.js --mode text --text "hello world"
  node tests/test_local_http_api.js --mode text --text "# title" --format markdown
  node tests/test_local_http_api.js --mode text --text "hello world" --tag test
  node tests/test_local_http_api.js --marked --tag urgent
  node tests/test_local_http_api.js --mode text --tag urgent --tag follow-up
  node tests/test_local_http_api.js --address 192.168.1.10 --port 6011
  node tests/test_local_http_api.js --dry-run`);
}

function parseArgs(argv) {
  const options = {
    filePath: '',
    text: '',
    format: DEFAULTS.format,
    mode: DEFAULTS.mode,
    marked: false,
    tagNames: [],
    address: DEFAULTS.address,
    port: DEFAULTS.port,
    route: '',
    timeoutSeconds: DEFAULTS.timeoutSeconds,
    createSampleFile: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--file':
        options.filePath = argv[++index] || '';
        break;
      case '--text':
        options.text = argv[++index] || '';
        break;
      case '--format':
        options.format = argv[++index] || '';
        break;
      case '--marked':
        options.marked = true;
        break;
      case '--tag':
        options.tagNames.push(argv[++index] || '');
        break;
      case '--mode':
        options.mode = argv[++index] || '';
        break;
      case '--address':
        options.address = argv[++index] || '';
        break;
      case '--port':
        options.port = Number(argv[++index]);
        break;
      case '--route':
        options.route = argv[++index] || '';
        break;
      case '--timeout':
        options.timeoutSeconds = Number(argv[++index]);
        break;
      case '--sample':
        options.createSampleFile = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveApiUrl(address, port, route) {
  const normalizedRoute = !route || route.trim() === ''
    ? DEFAULTS.fileRoute
    : route.startsWith('/')
      ? route
      : `/${route}`;
  const wrappedAddress = address.includes(':') && !address.startsWith('[')
    ? `[${address}]`
    : address;
  return `http://${wrappedAddress}:${port}${normalizedRoute}`;
}

function getDefaultRoute(mode) {
  return mode === 'text' ? DEFAULTS.textRoute : DEFAULTS.fileRoute;
}

function buildMarkedOptions(options) {
  const tagNames = options.tagNames
    .map((value) => value.trim())
    .filter(Boolean);

  if (!options.marked && tagNames.length === 0) {
    return null;
  }

  return {
    marked: options.marked || tagNames.length > 0,
    tagNames,
  };
}

async function createSampleFile() {
  const samplePath = path.join(
    os.tmpdir(),
    `transfer-genie-api-test-${Math.random().toString(16).slice(2)}.txt`,
  );
  const content = [
    'Transfer Genie local HTTP API test',
    `Timestamp: ${new Date().toISOString()}`,
    `Machine: ${os.hostname()}`,
  ].join(os.EOL);
  await fsp.writeFile(samplePath, content, 'utf8');
  return samplePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.address || options.address.trim() === '') {
    throw new Error('Address cannot be empty.');
  }
  if (!['file', 'text'].includes(options.mode)) {
    throw new Error('Mode must be either file or text.');
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds <= 0) {
    throw new Error('Timeout must be a positive number.');
  }
  if (options.mode === 'text' && !['text', 'markdown'].includes(options.format)) {
    throw new Error('Format must be text or markdown in text mode.');
  }
  for (const tagName of options.tagNames) {
    if (!tagName || tagName.trim() === '') {
      throw new Error('Tag name cannot be empty.');
    }
  }

  let filePath = options.filePath;
  let tempFileCreated = false;

  try {
    const route = options.route || getDefaultRoute(options.mode);
    const apiUrl = resolveApiUrl(options.address.trim(), options.port, route);
    const markedOptions = buildMarkedOptions(options);

    console.log(`API URL: ${apiUrl}`);
    if (options.mode === 'file') {
      if (options.createSampleFile || !filePath) {
        filePath = await createSampleFile();
        tempFileCreated = true;
      }
      const resolvedFilePath = path.resolve(filePath);
      await fsp.access(resolvedFilePath, fs.constants.R_OK);
      console.log(`File: ${resolvedFilePath}`);
      filePath = resolvedFilePath;
      const fileStat = await fsp.stat(filePath);
      console.log('Request Body:');
      console.log(JSON.stringify({
        type: 'multipart/form-data',
        fields: {
          file: {
            path: filePath,
            filename: path.basename(filePath),
            size: fileStat.size,
          },
          markedOptions,
        },
      }, null, 2));
    } else {
      const text = options.text || 'Transfer Genie local HTTP API text test';
      console.log(`Text: ${text}`);
      console.log(`Format: ${options.format}`);
      console.log('Request Body:');
      console.log(JSON.stringify({
        text,
        format: options.format,
        markedOptions,
      }, null, 2));
    }
    if (markedOptions) {
      console.log('Marked Options:');
      console.log(JSON.stringify(markedOptions, null, 2));
    }

    if (options.dryRun) {
      console.log('Dry run enabled. Request was not sent.');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutSeconds * 1000);

    try {
      let response;
      if (options.mode === 'file') {
        const fileBuffer = await fsp.readFile(filePath);
        const fileName = path.basename(filePath);
        const form = new FormData();
        const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
        form.append('file', blob, fileName);
        if (markedOptions) {
          form.append('markedOptions', JSON.stringify(markedOptions));
        }
        response = await fetch(apiUrl, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });
      } else {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            text: options.text || 'Transfer Genie local HTTP API text test',
            format: options.format,
            markedOptions,
          }),
          signal: controller.signal,
        });
      }
      const responseBody = await response.text();

      console.log(`HTTP Status: ${response.status} ${response.statusText}`);
      if (responseBody.trim() === '') {
        console.log('Response Body: <empty>');
      } else {
        const formattedJson = tryFormatJson(responseBody);
        console.log('Response Body:');
        console.log(formattedJson || responseBody);
      }

      if (!response.ok) {
        throw new Error(`Request failed with status code ${response.status}.`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    if (tempFileCreated && filePath) {
      await fsp.rm(filePath, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(formatErrorDetails(error));
  process.exitCode = 1;
});
