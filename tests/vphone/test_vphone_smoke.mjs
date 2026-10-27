#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_CLI = "/Applications/vphone-launchpad.app/Contents/MacOS/vphone-launchpad-cli";
const DEFAULT_ROOT = "/Volumes/VPhone/machines";
const DEFAULT_APP = "/Volumes/VPhone/installers/Transfer Genie VPhone.app";
const BUNDLE_ID = "com.transfergenie";

function parseArgs(argv) {
  const result = {
    app: process.env.VPHONE_APP || DEFAULT_APP,
    artifactDir: process.env.VPHONE_ARTIFACT_DIR || "",
    attachmentText: process.env.VPHONE_ATTACHMENT_TEXT || "",
    coldStarts: Number(process.env.VPHONE_COLD_STARTS || 2),
    expectRemoteText: process.env.VPHONE_EXPECT_REMOTE_TEXT || "",
    help: false,
    machine: process.env.VPHONE_MACHINE || "Transfer-Genie-iOS-26",
    reinstallCount: Number(process.env.VPHONE_REINSTALL_COUNT || 2),
    requireAuth: false,
    root: process.env.VPHONE_LIBRARY_ROOT || DEFAULT_ROOT,
    sendText: process.env.VPHONE_SEND_TEXT || "",
    snapshotReset: process.env.VPHONE_SNAPSHOT_RESET || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value`);
      index += 1;
      return next;
    };
    if (flag === "--app") result.app = value();
    else if (flag === "--artifact-dir") result.artifactDir = value();
    else if (flag === "--attachment-text") result.attachmentText = value();
    else if (flag === "--cold-starts") result.coldStarts = Number(value());
    else if (flag === "--expect-remote-text") result.expectRemoteText = value();
    else if (flag === "--help" || flag === "-h") result.help = true;
    else if (flag === "--machine") result.machine = value();
    else if (flag === "--reinstall-count") result.reinstallCount = Number(value());
    else if (flag === "--require-auth") result.requireAuth = true;
    else if (flag === "--root") result.root = value();
    else if (flag === "--send-text") result.sendText = value();
    else if (flag === "--snapshot-reset") result.snapshotReset = value();
    else throw new Error(`unknown option: ${flag}`);
  }
  for (const [name, number] of [["cold starts", result.coldStarts], ["reinstall count", result.reinstallCount]]) {
    if (!Number.isInteger(number) || number < 1 || number > 20) throw new Error(`${name} must be an integer from 1 to 20`);
  }
  return result;
}

function usage() {
  return `VPhone supplemental smoke suite

Usage:
  node tests/vphone/test_vphone_smoke.mjs [options]

Default coverage (no Supabase writes):
  host/bundle health, running guest, CoreDevice visibility, repeated installd IPA
  installation, cold starts, foreground process, current mobile UI, screenshot,
  bounded/redacted logs, process termination, crash check, and login restoration
  when the guest is already signed in.

Options:
  --app <.app|.ipa>              Install source (default: ${DEFAULT_APP})
  --artifact-dir <directory>     Result directory on the host
  --machine <name>               VPhone machine name
  --root <directory>             VPhone library root
  --reinstall-count <1-20>       installd installations (default: 2)
  --cold-starts <1-20>           terminate/launch cycles (default: 2)
  --require-auth                 Fail unless the signed-in mobile shell is visible
  --send-text <text>             Send a unique live Supabase test message
  --expect-remote-text <text>    Refresh and verify a known remote test message
  --attachment-text <text>       Exercise preview, Quick Look/share for a known item
  --snapshot-reset <name>        Revert an existing stopped-VM snapshot and retest

Safety gates:
  VPHONE_ALLOW_SUPABASE_WRITES=1 is required with --send-text.
  VPHONE_ALLOW_SNAPSHOT_REVERT=1 is required with --snapshot-reset.

This suite is supplemental only. Passing never replaces the official Simulator
or the Jam iPhone 12 release, Keychain, Photos/iCloud, lifecycle, cellular, media,
performance, or stability acceptance gates.`;
}

function log(message) {
  process.stdout.write(`[vphone smoke] ${message}\n`);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout || 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${commandName} ${args.join(" ")} failed (${result.status})\n${result.stderr || result.stdout}`);
  }
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function jsonCommand(commandName, args, options) {
  const result = command(commandName, args, options);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`invalid JSON from ${commandName} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      /token|secret|password|authorization|anon.?key/i.test(key) ? "[redacted]" : redact(child),
    ]));
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, "[redacted-jwt]");
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const cli = process.env.VPHONE_CLI || DEFAULT_CLI;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = resolve(options.artifactDir || `/Volumes/VPhone/installers/vphone-smoke/${timestamp}`);
const report = {
  classification: "SUPPLEMENTAL_ONLY_NOT_JAM_ACCEPTANCE",
  startedAt: new Date().toISOString(),
  machine: options.machine,
  checks: [],
  scenarios: {
    authenticated: "not-run",
    attachmentPreviewQuickLookShare: options.attachmentText ? "pending" : "not-requested",
    snapshotReset: options.snapshotReset ? "pending" : "not-requested",
    textSendPull: options.sendText || options.expectRemoteText ? "pending" : "not-requested",
  },
};
let temporaryIpaRoot = "";

function record(name, details = {}) {
  report.checks.push({ name, ok: true, ...details });
  log(`PASS ${name}`);
}

function guestRpc(method, params = {}, timeout = 60_000) {
  const response = jsonCommand(cli, [
    "guest", "rpc", options.machine, method, JSON.stringify(params),
    "--root", options.root,
  ], { timeout });
  assert(response.ok === true, `${method} failed: ${JSON.stringify(response)}`);
  return response.result;
}

function guestUnlock() {
  jsonCommand(cli, ["guest", "unlock", options.machine, "--root", options.root, "--timeout", "30"], { timeout: 45_000 });
}

function tree() {
  return guestRpc("ui.tree", { max_elements: 400, visible_only: true }, 45_000);
}

function labels(uiTree) {
  return (uiTree.elements || []).map((element) => String(element.label || "")).filter(Boolean);
}

function hasLabel(uiTree, text) {
  return labels(uiTree).some((label) => label.includes(text));
}

function tapText(text, match = "contains") {
  return guestRpc("ui.tap_element", { text, match }, 30_000);
}

function waitText(text, timeout = 15) {
  return guestRpc("ui.wait", { text, match: "contains", timeout }, (timeout + 5) * 1000);
}

function waitForLabel(test, description, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTree = { elements: [] };
  while (Date.now() < deadline) {
    lastTree = tree();
    if (test(labels(lastTree))) return lastTree;
    command("sleep", ["1"]);
  }
  throw new Error(`timed out waiting for ${description} (labels hash ${sha256(labels(lastTree).join("\n"))})`);
}

function captureScreenshot(name) {
  const shot = guestRpc("screen.screenshot", {}, 45_000);
  const path = join(artifactDir, `${name}.jpg`);
  const encoded = shot.data || shot.image;
  assert(typeof encoded === "string" && encoded.length > 0, "screen.screenshot returned no image data");
  writeFileSync(path, Buffer.from(encoded, "base64"));
  return { path, width: shot.width, height: shot.height, bytes: Buffer.byteLength(encoded, "base64") };
}

function waitForMobileShell(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTree = { elements: [] };
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      lastTree = tree();
      lastError = "";
    } catch (error) {
      lastError = String(error?.message || error);
      command("sleep", ["1"]);
      continue;
    }
    const currentLabels = labels(lastTree);
    const setup = currentLabels.some((label) => label.includes("SUPABASE ONLY"))
      && currentLabels.some((label) => label.includes("连接你的云端空间"));
    const signedIn = currentLabels.includes("消息") && currentLabels.includes("标记") && currentLabels.includes("我的");
    if (setup || signedIn) return { state: signedIn ? "signed-in" : "setup", ui: lastTree };
    command("sleep", ["1"]);
  }
  const diagnostic = captureScreenshot("mobile-shell-not-ready");
  throw new Error(`mobile shell did not become accessible within ${timeoutMs / 1000}s (labels hash ${sha256(labels(lastTree).join("\n"))}; last error ${lastError || "none"}; screenshot ${diagnostic.path})`);
}

function makeIpa(inputPath) {
  const source = resolve(inputPath);
  assert(existsSync(source), `install source does not exist: ${source}`);
  if (extname(source).toLowerCase() === ".ipa") return { path: source, temporaryRoot: "" };
  assert(extname(source).toLowerCase() === ".app", `--app must point to a .app or .ipa: ${source}`);
  const plist = join(source, "Info.plist");
  const bundleId = command("plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", plist]).stdout.trim();
  assert(bundleId === BUNDLE_ID, `unexpected bundle identifier ${bundleId}`);
  const staging = mkdtempSync(join(tmpdir(), "transfer-genie-vphone-ipa."));
  const payload = join(staging, "Payload");
  const target = join(payload, basename(source));
  mkdirSync(payload, { recursive: true });
  command("ditto", [source, target], { timeout: 180_000 });
  const ipa = join(staging, "Transfer-Genie-VPhone.ipa");
  command("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", payload, ipa], { timeout: 180_000 });
  return { path: ipa, temporaryRoot: staging };
}

function installWithInstalld(ipa, udid, iteration) {
  const result = command("ideviceinstaller", ["-u", udid, "install", ipa], { timeout: 300_000 });
  assert(/InstallComplete|Install: Complete/.test(result.stdout + result.stderr), `installd did not report completion on iteration ${iteration}`);
  record(`installd IPA installation ${iteration}`, { outputHash: sha256(result.stdout + result.stderr) });
}

function coldLaunch(iteration) {
  guestRpc("apps.terminate", { bundle_id: BUNDLE_ID });
  guestUnlock();
  const launch = guestRpc("apps.launch", { bundle_id: BUNDLE_ID }, 60_000);
  assert(Number.isInteger(launch.pid) && launch.pid > 0, `launch ${iteration} did not return a pid`);
  const foreground = guestRpc("apps.foreground", {});
  assert(foreground.bundle_id === BUNDLE_ID, `launch ${iteration} is not foreground`);
  const { state, ui } = waitForMobileShell();
  record(`cold process launch ${iteration}`, { pid: launch.pid, shellState: state });
  return { state, ui };
}

function refreshSignedInFeed() {
  tapText("我的", "exact");
  waitText("立即同步");
  tapText("立即同步", "contains");
  tapText("消息", "exact");
}

function exerciseTextFlow(sendText, expectedRemoteText) {
  if (sendText) {
    assert(process.env.VPHONE_ALLOW_SUPABASE_WRITES === "1", "--send-text requires VPHONE_ALLOW_SUPABASE_WRITES=1");
    tapText("新消息", "exact");
    waitText("消息内容");
    tapText("消息内容", "exact");
    guestRpc("input.paste", { text: sendText }, 30_000);
    tapText("发送", "exact");
    waitText(sendText, 45);
    waitForLabel((items) => items.some((item) => item.includes("切换 Supabase 存储空间，已同步")), "Supabase convergence after text send", 90_000);
    record("live Supabase text send converged", { textHash: sha256(sendText) });
    coldLaunch("text-restoration");
    waitText(sendText, 45);
    record("sent text restored after process termination", { textHash: sha256(sendText) });
  }
  if (expectedRemoteText) {
    refreshSignedInFeed();
    waitText(expectedRemoteText, 45);
    record("remote text pull after manual sync", { textHash: sha256(expectedRemoteText) });
  }
}

function exerciseAttachmentFlow(targetText) {
  tapText(targetText, "contains");
  waitText("系统预览");
  tapText("系统预览", "exact");
  const quickLook = waitForLabel((items) => items.includes("Done") || items.includes("完成"), "Quick Look", 60_000);
  const preview = captureScreenshot("attachment-quick-look");
  record("attachment Quick Look opened", { screenshot: preview.path });
  if (hasLabel(quickLook, "Done")) tapText("Done", "exact");
  else tapText("完成", "exact");
  waitText("系统预览");
  tapText("分享", "exact");
  waitForLabel((items) => items.includes("AirDrop") && (items.includes("Save to Files") || items.includes("存储到“文件”")), "system share sheet", 60_000);
  const share = captureScreenshot("attachment-share-sheet");
  const shareUi = tree();
  assert(hasLabel(shareUi, "AirDrop"), "share sheet did not expose system activities");
  record("attachment system share sheet opened", { screenshot: share.path });
  coldLaunch("after-share-sheet");
  record("app recovered after share sheet termination");
}

function snapshotReset(snapshotName, ipa, udid) {
  assert(process.env.VPHONE_ALLOW_SNAPSHOT_REVERT === "1", "--snapshot-reset requires VPHONE_ALLOW_SNAPSHOT_REVERT=1");
  const machine = jsonCommand(cli, ["vm", "list"]).find((item) => item.name === options.machine && item.libraryRoot === options.root);
  assert(machine, "machine disappeared before snapshot reset");
  command(cli, ["vm", "stop", options.machine, "--root", options.root], { timeout: 180_000 });
  const snapshots = command(cli, ["exec", "--bundle", machine.bundle, "vm", "snapshot", "list", "--library-root", options.root, options.machine, "--json"]);
  const snapshotListing = `${snapshots.stdout}\n${snapshots.stderr}`;
  assert(snapshotListing.includes(`\"name\":\"${snapshotName}\"`) || snapshotListing.includes(`\"name\" : \"${snapshotName}\"`), `snapshot does not exist: ${snapshotName}`);
  command(cli, ["exec", "--bundle", machine.bundle, "vm", "snapshot", "revert", "--library-root", options.root, options.machine, snapshotName, "--force"], { timeout: 300_000 });
  command(cli, ["vm", "start", options.machine, "--root", options.root, "--wait", "--timeout", "900"], { timeout: 930_000 });
  guestUnlock();
  installWithInstalld(ipa, udid, "after-snapshot-reset");
  coldLaunch("after-snapshot-reset");
  record("explicit snapshot reset and recovery", { snapshotName });
}

mkdirSync(artifactDir, { recursive: true });
log("SUPPLEMENTAL ONLY — this run cannot satisfy Jam release acceptance");

try {
  assert(existsSync(cli), `VPhone CLI not found: ${cli}`);
  const status = jsonCommand(cli, ["status"]);
  assert(status.hostReady && status.bundleReady && status.helper.startsWith("ready"), "VPhone host/bundle/helper is not ready");
  record("VPhone host and pinned bundle ready", { activeBundle: status.activeBundle });

  const machines = jsonCommand(cli, ["vm", "list"]);
  const machine = machines.find((item) => item.name === options.machine && item.libraryRoot === options.root);
  assert(machine, `machine not found in ${options.root}: ${options.machine}`);
  assert(machine.state === "running" && machine.panicked === false, `machine is not healthy and running: ${machine.state}`);
  record("VPhone guest running", { bundle: machine.bundle, ios: machine.ios, udid: machine.udid });

  const ping = jsonCommand(cli, ["guest", "send", options.machine, '{"t":"ping"}', "--root", options.root]);
  assert(ping.ok === true, "guest ping failed");
  guestUnlock();
  const device = guestRpc("device.info");
  assert(device.developer_mode?.enabled === true, "Developer Mode is not enabled in the VPhone guest");
  record("guest control and Developer Mode ready", { ios: device.ios_version, model: device.model });

  const deviceJson = join(artifactDir, "coredevice.json");
  command("xcrun", ["devicectl", "list", "devices", "--json-output", deviceJson], { timeout: 60_000 });
  const coreDevices = JSON.parse(readFileSync(deviceJson, "utf8")).result?.devices || [];
  const coreDevice = coreDevices.find((item) => item.hardwareProperties?.udid === machine.udid || item.deviceProperties?.name === options.machine);
  assert(coreDevice && coreDevice.connectionProperties?.pairingState === "paired" && coreDevice.deviceProperties?.bootState === "booted", "VPhone guest is not booted and paired in CoreDevice");
  record("CoreDevice/Xcode visibility", { identifier: coreDevice.identifier, reality: coreDevice.hardwareProperties?.reality });

  const ipa = makeIpa(options.app);
  temporaryIpaRoot = ipa.temporaryRoot;
  for (let iteration = 1; iteration <= options.reinstallCount; iteration += 1) installWithInstalld(ipa.path, machine.udid, iteration);
  const installed = guestRpc("apps.search", { query: "Transfer Genie" });
  assert(installed.apps?.some((app) => app.bundle_id === BUNDLE_ID), "Transfer Genie is not installed after installd completion");
  record("installed app registration visible to guest");

  const baselineCrashes = guestRpc("logs.crashes", { bundle_id: BUNDLE_ID }).crashes.map((item) => item.path);
  let shellState = "unknown";
  for (let iteration = 1; iteration <= options.coldStarts; iteration += 1) shellState = coldLaunch(iteration).state;
  const initialShot = captureScreenshot("mobile-shell");
  record("mobile shell screenshot captured", initialShot);

  if (shellState === "signed-in") {
    report.scenarios.authenticated = "passed";
    coldLaunch("login-restoration");
    record("login restoration after process termination");
  } else {
    report.scenarios.authenticated = "skipped-not-signed-in";
    assert(!options.requireAuth && !options.sendText && !options.expectRemoteText && !options.attachmentText, "an authenticated scenario was requested but the guest is on setup");
  }

  if (options.sendText || options.expectRemoteText) {
    exerciseTextFlow(options.sendText, options.expectRemoteText);
    report.scenarios.textSendPull = "passed";
  }
  if (options.attachmentText) {
    exerciseAttachmentFlow(options.attachmentText);
    report.scenarios.attachmentPreviewQuickLookShare = "passed";
  }

  const logs = redact(guestRpc("logs.syslog", { process: "Transfer Genie", seconds: 2, max_lines: 250 }, 30_000));
  writeFileSync(join(artifactDir, "transfer-genie-syslog.json"), `${JSON.stringify(logs, null, 2)}\n`);
  record("bounded app logs captured and redacted");

  const crashes = guestRpc("logs.crashes", { bundle_id: BUNDLE_ID }).crashes;
  const newCrashes = crashes.filter((item) => !baselineCrashes.includes(item.path));
  assert(newCrashes.length === 0, `new Transfer Genie crash reports appeared: ${newCrashes.map((item) => item.path).join(", ")}`);
  record("no new app crash report");

  if (options.snapshotReset) {
    snapshotReset(options.snapshotReset, ipa.path, machine.udid);
    report.scenarios.snapshotReset = "passed";
  }

  report.finishedAt = new Date().toISOString();
  report.ok = true;
  writeFileSync(join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  log(`PASS supplemental suite (${report.checks.length} checks)`);
  log(`artifacts: ${artifactDir}`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.ok = false;
  report.error = String(error?.message || error);
  writeFileSync(join(artifactDir, "report.json"), `${JSON.stringify(redact(report), null, 2)}\n`);
  process.stderr.write(`[vphone smoke] FAIL ${report.error}\n[vphone smoke] artifacts: ${artifactDir}\n`);
  process.exitCode = 1;
} finally {
  if (temporaryIpaRoot) rmSync(temporaryIpaRoot, { recursive: true, force: true });
}
