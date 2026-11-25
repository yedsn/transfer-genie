const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
process.stdout.write(JSON.stringify({ protocol_version: 1, kind: 'ready' }) + '\n');
input.once('line', line => {
  const request = JSON.parse(line);
  if (request.kind !== 'invoke' || request.protocol_version !== 1) process.exit(2);
  const items = request.inputs.map(item => ({ item_id: item.item_id, name: item.name, status: item.error ? 'failed' : 'succeeded', error: item.error || null }));
  process.stdout.write(JSON.stringify({ protocol_version: 1, kind: 'result', task_id: request.task_id, request_id: request.request_id, items }) + '\n', () => process.exit(0));
});
