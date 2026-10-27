<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  attachmentStatus,
  isOwnMessage,
  previewStatus,
  type MobileMessage,
  useMobileController,
} from "./mobile-controller";
import MobileMessageBody from "./MobileMessageBody.vue";
import MobileText from "./MobileText.vue";

type MobileTab = "feed" | "marked" | "profile";
type MobileDiagnostic = {
  platform?: string;
  nativePlugin?: boolean;
  mainThread?: boolean;
};
type SheetName =
  "composer" | "actions" | "transfer" | "spaces" | "detail" | "cache" | "sender" | "about" | "marked-edit" | "unmark-confirm" | "conflicts" | "delete-confirm" | null;

const controller = useMobileController();
const { state, currentSpace, pendingCount, activeTransfers } = controller;
const activeTab = ref<MobileTab>("feed");
const activeSheet = ref<SheetName>(null);
const viewportHeight = ref(window.visualViewport?.height || window.innerHeight);
const viewportTop = ref(window.visualViewport?.offsetTop || 0);
const keyboardVisible = ref(false);
const mobileDiagnostic = ref<MobileDiagnostic | null>(
  (window as any).__TRANSFER_GENIE_MOBILE_DIAGNOSTIC__ || null,
);
function updateMobileDiagnostic(event: Event) {
  mobileDiagnostic.value = (event as CustomEvent<MobileDiagnostic>).detail || null;
}
async function refreshMobileDiagnostic() {
  try {
    const diagnostic = await (window as any).transferGenieApi?.mobileIntegration?.diagnostic(
      `about-${Date.now()}`,
    );
    if (diagnostic) mobileDiagnostic.value = diagnostic;
  } catch {
    // The about sheet remains usable when the native bridge is unavailable.
  }
}
function updateViewport() {
  const viewport = window.visualViewport;
  // Pin the shell to the visible area, not the layout viewport behind the keyboard.
  // Ignore pinch zoom: it must remain an accessibility action, not a keyboard signal.
  if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
  viewportHeight.value = viewport?.height || window.innerHeight;
  viewportTop.value = viewport?.offsetTop || 0;
  // WKWebView may scroll the layout viewport when refocusing after a native
  // picker, reducing innerHeight by the same amount as the page scroll.
  keyboardVisible.value = window.innerHeight + window.scrollY - viewportHeight.value > 100;
}
const selectedMessage = ref<MobileMessage | null>(null);
const deleteConfirmation = ref<"single" | "selection" | null>(null);
const cacheConfirmation = ref(false);
const selectionMode = ref(false);
const selectedFilenames = ref<string[]>([]);
const searchOpen = ref(false);
const searchQuery = ref("");
let searchTimer: number | undefined;
const senderNameDraft = ref("");
const markedTagDraft = ref<string[]>([]);
const markedDueDraft = ref("");
const newTagDraft = ref("");
const pendingTags = ref<{ id: string; name: string }[]>([]);
const markEditorSource = ref<"message" | "composer" | "selection">("message");
const markedEnabledDraft = ref(true);
const savingMark = ref(false);
const composerPreview = ref(false);
let markReturnSheet: SheetName = null;
let markOpener: HTMLElement | null = null;
let unmarkSelection = false;
const markedTagOptions = computed(() => [...state.tags, ...pendingTags.value]);
const markedFilter = ref<"pending" | "all">("pending");
const activeTag = ref("");
const feedScroller = ref<HTMLElement | null>(null);
let toggleAnchor: { card: HTMLElement; offset: number } | null = null;
function beforeMessageToggle(element: HTMLElement) {
  const card = element.closest<HTMLElement>(".mobile-message-card");
  const scroller = feedScroller.value;
  if (!card || !scroller) return;
  followLatest = false;
  toggleAnchor = { card, offset: Math.max(0, card.getBoundingClientRect().top - scroller.getBoundingClientRect().top) };
}
function afterMessageToggle() {
  const scroller = feedScroller.value;
  if (scroller && toggleAnchor) {
    scroller.scrollTop += toggleAnchor.card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - toggleAnchor.offset;
  }
  toggleAnchor = null;
}
let followLatest = true;
let historyLoadArmed = true;
let longPressTimer: number | undefined;
let longPressTriggered = false;
let statusTimer: number | undefined;
let removeTransferListeners: undefined | (() => void);
let sheetOpener: HTMLElement | null = null;
let composerCloseTimer: number | undefined;
watch(
  () => [state.composer.text, state.composer.attachments.length],
  () => {
    if (!state.composer.sending) {
      state.composer.savedLocally = false;
      state.composer.error = "";
    }
  },
  { flush: "sync" },
);

const visibleMessages = computed(() => searchQuery.value.trim() ? state.search.messages : state.messages);
const selectedMessages = computed(() => visibleMessages.value.filter((message) => selectedFilenames.value.includes(message.filename)));
watch(searchQuery, (query) => {
  window.clearTimeout(searchTimer);
  endSelection();
  void controller.searchMessages("");
  if (query.trim()) {
    state.search.loading = true;
    searchTimer = window.setTimeout(() => { void controller.searchMessages(query); }, 250);
  }
});

function scrollToLatest() {
  const scroller = feedScroller.value;
  if (!scroller) return;
  scroller.scrollTop = scroller.scrollHeight;
  followLatest = true;
}

function handleFeedScroll() {
  const scroller = feedScroller.value;
  if (!scroller) return;
  followLatest = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  if (scroller.scrollTop > 120) historyLoadArmed = true;
  if (scroller.scrollTop <= 80 && historyLoadArmed && !searchQuery.value && state.hasMoreBefore && !state.loadingOlder) {
    historyLoadArmed = false;
    void controller.loadOlderMessages();
  }
}

watch(feedScroller, (scroller) => {
  if (scroller) void nextTick(scrollToLatest);
});

watch(
  () => visibleMessages.value.map((message) => message.filename),
  async (_, previous) => {
    const scroller = feedScroller.value;
    if (!scroller) return;
    const shouldFollow = followLatest || !previous?.length;
    const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-message-filename]"));
    const anchor = cards.find((card) => card.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top);
    const anchorOffset = anchor ? anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top : 0;
    const filename = anchor?.dataset.messageFilename;
    await nextTick();
    if (feedScroller.value !== scroller) return;
    if (shouldFollow && !state.loadingOlder && !searchQuery.value) scrollToLatest();
    else if (filename) {
      const restored = Array.from(scroller.querySelectorAll<HTMLElement>("[data-message-filename]"))
        .find((card) => card.dataset.messageFilename === filename);
      if (restored) scroller.scrollTop += restored.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchorOffset;
    }
  },
  { flush: "pre" },
);

const visibleMarkedItems = computed(() => state.markedView.messages);
watch([markedFilter, activeTag], ([filter, tag]) => { void controller.setMarkedFilter(filter === "pending", tag); });

const syncTone = computed(() => {
  if (
    state.syncStatus?.conflict_count > 0 ||
    state.syncStatus?.conflictCount > 0
  )
    return "conflict";
  if (state.syncStatus?.last_error || state.syncStatus?.lastError)
    return "offline";
  if (state.syncStatus?.running) return "running";
  if (pendingCount.value > 0) return "pending";
  return "ready";
});

const compactSyncTitle = computed(() => ({
  conflict: "同步冲突",
  offline: "离线 · 本机已保留",
  running: "同步中…",
  pending: `${pendingCount.value} 项待同步`,
  ready: "已同步",
})[syncTone.value]);

const syncDetail = computed(() => {
  const error = state.syncStatus?.last_error || state.syncStatus?.lastError;
  if (error) return String(error);
  const lastRun = state.syncStatus?.last_run_ms || state.syncStatus?.lastRunMs;
  return lastRun
    ? `最近同步 ${new Date(lastRun).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : "可以点击手动刷新";
});

const accountInitial = computed(() =>
  String(state.account?.email || state.settings?.sender_name || "TG")
    .slice(0, 1)
    .toUpperCase(),
);
const profileTitle = computed(
  () =>
    state.settings?.sender_name ||
    state.account?.email?.split("@")[0] ||
    "Transfer Genie",
);
const activeTransferProgress = computed(
  () => activeTransfers.value[0]?.progress || 0,
);
const cacheSize = computed(() => {
  const bytes = Number(state.cache.reclaimableBytes || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** index).toFixed(index === 0 || bytes / 1024 ** index >= 100 ? 0 : 1)} ${units[index]}`;
});

function openSheet(name: SheetName) {
  window.clearTimeout(composerCloseTimer);
  if (name === "composer" && !state.composer.sending) {
    state.composer.savedLocally = false;
    state.composer.error = "";
  }
  if (name !== "marked-edit" && name !== "unmark-confirm") {
    sheetOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  activeSheet.value = name;
  if (name === "sender") {
    senderNameDraft.value = state.settings?.sender_name || "";
    state.sender.error = "";
  }
  if (name === "spaces" && !state.previewMode)
    void controller.loadSpaces().catch(() => undefined);
  if (name === "transfer" && !state.previewMode)
    void controller.refreshRuntimeState();
  if (name === "conflicts" && !state.previewMode)
    void controller.loadConflicts().catch(() => undefined);
  if (name === "cache" && !state.previewMode)
    void controller.refreshCache().catch(() => undefined);
  if (name === "about" && !state.previewMode)
    void refreshMobileDiagnostic();
  void nextTick(() => {
    const sheet = document.querySelector<HTMLElement>(
      ".mobile-sheet-layer .mobile-sheet",
    );
    const preferred =
      sheet?.querySelector<HTMLElement>("[autofocus]") ||
      sheet?.querySelector<HTMLElement>(
        "header button, button, textarea, input",
      );
    (preferred || sheet)?.focus({ preventScroll: true });
  });
}
function closeSheet() {
  if (state.boot === "ready" && ["marked-edit", "unmark-confirm"].includes(activeSheet.value || "")) {
    if (!state.busy && !savingMark.value) returnFromMarkSettings();
    return;
  }
  if (activeSheet.value === "composer" && state.composer.selecting) return;
  window.clearTimeout(composerCloseTimer);
  activeSheet.value = null;
  deleteConfirmation.value = null;
  cacheConfirmation.value = false;
  selectedMessage.value = null;
  const opener = sheetOpener;
  sheetOpener = null;
  void nextTick(() => opener?.focus({ preventScroll: true }));
}
function trapSheetFocus(event: KeyboardEvent) {
  const sheet = document.querySelector<HTMLElement>(
    ".mobile-sheet-layer .mobile-sheet",
  );
  if (!sheet) return;
  const focusable = Array.from(
    sheet.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (!focusable.length) {
    event.preventDefault();
    sheet.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;
  if (event.shiftKey && (current === first || !sheet.contains(current))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (current === last || !sheet.contains(current))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}
function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Tab" && activeSheet.value) trapSheetFocus(event);
  else if (event.key === "Escape" && activeSheet.value) closeSheet();
  else if (event.key === "Escape" && selectionMode.value && !state.busy) endSelection();
}
watch(
  () => state.boot,
  (boot) => {
    if (boot !== "ready") {
      closeSheet();
      searchQuery.value = "";
      activeTag.value = "";
      markedFilter.value = "pending";
      endSelection();
    }
  },
);
function selectTab(tab: MobileTab) {
  if (selectionMode.value && state.busy) return;
  endSelection();
  activeTab.value = tab;
  searchOpen.value = false;
  searchQuery.value = "";
  closeSheet();
}
function openMessage(message: MobileMessage) {
  if (longPressTriggered) { longPressTriggered = false; return; }
  if (selectionMode.value) { toggleMessageSelection(message); return; }
  selectedMessage.value = message;
  openSheet("detail");
}
function beginLongPress(message: MobileMessage) {
  window.clearTimeout(longPressTimer);
  longPressTriggered = false;
  if (selectionMode.value || state.busy || state.composer.sending) return;
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true;
    startSelection(message);
  }, 460);
}
function cancelLongPress() {
  window.clearTimeout(longPressTimer);
}
function openActions(message: MobileMessage) {
  if (selectionMode.value) { toggleMessageSelection(message); return; }
  selectedMessage.value = message;
  openSheet("actions");
}
function startSelection(message: MobileMessage) {
  if (state.busy || state.composer.sending) return;
  closeSheet();
  selectionMode.value = true;
  selectedFilenames.value = [message.filename];
}
function endSelection() {
  selectionMode.value = false;
  selectedFilenames.value = [];
}
function toggleMessageSelection(message: MobileMessage) {
  if (state.busy) return;
  selectedFilenames.value = selectedFilenames.value.includes(message.filename)
    ? selectedFilenames.value.filter((filename) => filename !== message.filename)
    : [...selectedFilenames.value, message.filename];
}
async function applySelection(action: "mark" | "unmark" | "delete", confirmed = false) {
  if (state.busy || !selectedMessages.value.length) return;
  if (action === "mark" && !confirmed) {
    openMarkSettings("selection");
    return;
  }
  if (action === "unmark" && !confirmed) {
    openUnmarkConfirmation(null, true);
    return;
  }
  if (action === "delete" && !confirmed) {
    deleteConfirmation.value = "selection";
    openSheet("delete-confirm");
    return;
  }
  const result = await controller.applyMessageSelection(selectedMessages.value, action);
  if (!result) return;
  selectedFilenames.value = result.failed;
  if (!result.failed.length) endSelection();
}
watch(() => visibleMessages.value.map((message) => message.filename), (filenames) => {
  selectedFilenames.value = selectedFilenames.value.filter((filename) => filenames.includes(filename));
});
function openMarkedEditor(message: MobileMessage) {
  selectedMessage.value = message;
  openMarkSettings("message");
}
function toggleSelectedMark() {
  const message = selectedMessage.value;
  if (!message) return;
  if (message.marked) openUnmarkConfirmation(message);
  else openMarkedEditor(message);
}
function rememberMarkSource() {
  markReturnSheet = activeSheet.value;
  markOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.error = "";
}
function openMarkSettings(source: "message" | "composer" | "selection") {
  if (state.busy || state.composer.sending || state.composer.selecting) return;
  rememberMarkSource();
  markEditorSource.value = source;
  markedTagDraft.value = [...(source === "composer" ? state.composer.tagIds : source === "message" ? selectedMessage.value?.tagIds || [] : [])];
  markedDueDraft.value = source === "composer" ? state.composer.dueDate : source === "message" ? selectedMessage.value?.dueDate || "" : "";
  markedEnabledDraft.value = true;
  pendingTags.value = [];
  newTagDraft.value = "";
  openSheet("marked-edit");
}
function returnFromMarkSettings() {
  activeSheet.value = markReturnSheet;
  if (!markReturnSheet) selectedMessage.value = null;
  const opener = markOpener;
  markReturnSheet = null;
  markOpener = null;
  void nextTick(() => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>(".mobile-sheet header button, .mobile-sheet button")?.focus({ preventScroll: true });
  });
}
function openUnmarkConfirmation(message: MobileMessage | null, selection = false) {
  if (state.busy || state.composer.sending) return;
  if (message) selectedMessage.value = message;
  rememberMarkSource();
  unmarkSelection = selection;
  openSheet("unmark-confirm");
}
async function confirmUnmark() {
  if (state.busy) return;
  if (unmarkSelection) {
    await applySelection("unmark", true);
    if (!state.error) returnFromMarkSettings();
  } else if (selectedMessage.value && await controller.toggleMark(selectedMessage.value)) {
    if (markReturnSheet === "actions") markReturnSheet = null;
    returnFromMarkSettings();
  }
}
async function deleteSelectedMessage(deleteRemote: boolean, confirmed = false) {
  const message = selectedMessage.value;
  if (!message || state.busy) return;
  if (deleteRemote && !confirmed) {
    deleteConfirmation.value = "single";
    openSheet("delete-confirm");
    return;
  }
  if (await controller.deleteMessage(message, deleteRemote) && selectedMessage.value === message && ["actions", "delete-confirm"].includes(activeSheet.value || "")) closeSheet();
}
function cancelDeletion() {
  if (state.busy) return;
  const source = deleteConfirmation.value;
  deleteConfirmation.value = null;
  if (source === "single") openSheet("actions");
  else closeSheet();
}
async function confirmDeletion() {
  if (state.busy) return;
  if (deleteConfirmation.value === "single") await deleteSelectedMessage(true, true);
  else if (deleteConfirmation.value === "selection") {
    await applySelection("delete", true);
    if (!state.error) closeSheet();
  }
}
async function copySelectedText() {
  const message = selectedMessage.value;
  if (!message) return;
  if (await controller.copyMessage(message) && selectedMessage.value === message && activeSheet.value === "actions") closeSheet();
}
async function sendDraft() {
  const complete = await controller.sendDraft();
  if (state.composer.savedLocally) await nextTick(scrollToLatest);
  if (complete) {
    composerCloseTimer = window.setTimeout(() => {
      if (activeSheet.value === "composer" && state.composer.savedLocally && !state.composer.sending && !state.composer.text.trim() && !state.composer.attachments.length) closeSheet();
    }, 650);
  }
}
async function saveSenderName() {
  if (await controller.saveSenderName(senderNameDraft.value)) closeSheet();
}
function toggleMarkedTag(tagId: string) {
  markedTagDraft.value = markedTagDraft.value.includes(tagId)
    ? markedTagDraft.value.filter((id) => id !== tagId)
    : [...markedTagDraft.value, tagId];
}
function addMarkedTag() {
  const name = newTagDraft.value.trim();
  if (!name || state.busy || savingMark.value) return;
  let tag = markedTagOptions.value.find((item) => item.name === name);
  if (!tag) {
    tag = { id: `draft-tag-${Date.now()}-${pendingTags.value.length}`, name };
    pendingTags.value.push(tag);
  }
  if (!markedTagDraft.value.includes(tag.id)) markedTagDraft.value.push(tag.id);
  newTagDraft.value = "";
}
async function saveMarkedMetadata() {
  if (state.busy || savingMark.value) return;
  savingMark.value = true;
  try {
    if (markedEnabledDraft.value) {
      for (const pending of [...pendingTags.value]) {
        if (!markedTagDraft.value.includes(pending.id)) continue;
        const tag = await controller.createMarkedTag(pending.name);
        if (!tag) return;
        markedTagDraft.value = markedTagDraft.value.map((id) => id === pending.id ? tag.id : id);
        pendingTags.value = pendingTags.value.filter((item) => item.id !== pending.id);
      }
    }
    if (markEditorSource.value === "composer") {
      state.composer.marked = markedEnabledDraft.value;
      state.composer.tagIds = markedEnabledDraft.value ? [...markedTagDraft.value] : [];
      state.composer.dueDate = markedEnabledDraft.value ? markedDueDraft.value : "";
      returnFromMarkSettings();
    } else if (markEditorSource.value === "selection") {
      const result = await controller.applyMessageSelection(selectedMessages.value, "mark", { tagIds: markedTagDraft.value, dueDate: markedDueDraft.value || null });
      if (!result) return;
      selectedFilenames.value = result.failed;
      if (!result.failed.length) { endSelection(); returnFromMarkSettings(); }
    } else if (selectedMessage.value && await controller.updateMarkedMetadata(selectedMessage.value, markedTagDraft.value, markedDueDraft.value || null)) {
      if (markReturnSheet === "actions") markReturnSheet = null;
      returnFromMarkSettings();
    }
  } finally { savingMark.value = false; }
}
function conflictSummary(conflict: any, side: "local" | "remote") {
  const payload = side === "local" ? conflict.localPayload : conflict.remotePayload;
  if (!payload || payload.deleted_at != null || payload.deletedAt != null)
    return "该版本已被删除";
  return String(payload.content || payload.originalName || payload.name || payload.filename || conflict.entityId || "同步项目").slice(0, 90);
}
async function chooseSpace(space: any) {
  if (state.boot === "needs-space" && state.setup.flowId)
    await controller.completeSetup(space);
  else await controller.switchSpace(space);
  if (state.boot === "ready") closeSheet();
}
async function clearCache() {
  if (!state.cache.clearing && !state.busy) cacheConfirmation.value = true;
}
async function confirmCacheClear() {
  if (await controller.clearCache()) cacheConfirmation.value = false;
}

onMounted(async () => {
  updateViewport();
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("scroll", updateViewport);
  window.addEventListener("resize", updateViewport);
  window.addEventListener(
    "transfer-genie-mobile-diagnostic",
    updateMobileDiagnostic,
  );
  window.addEventListener(
    "transfer-genie-mobile-recovered",
    controller.refreshAfterForeground,
  );
  window.addEventListener("keydown", handleGlobalKeydown);
  await controller.initialize();
  removeTransferListeners = await controller.installTransferListeners();
  statusTimer = window.setInterval(() => {
    if (state.boot === "ready" && !state.previewMode)
      void controller.refreshRuntimeState();
  }, 30000);
});
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", updateViewport);
  window.visualViewport?.removeEventListener("scroll", updateViewport);
  window.removeEventListener("resize", updateViewport);
  window.removeEventListener(
    "transfer-genie-mobile-diagnostic",
    updateMobileDiagnostic,
  );
  window.clearTimeout(searchTimer);
  window.removeEventListener(
    "transfer-genie-mobile-recovered",
    controller.refreshAfterForeground,
  );
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.clearTimeout(longPressTimer);
  window.clearTimeout(composerCloseTimer);
  window.clearInterval(statusTimer);
  removeTransferListeners?.();
});
</script>

<template>
  <div
    class="mobile-shell"
    :class="[`is-${activeTab}`, { 'is-keyboard-visible': keyboardVisible }]"
    :style="{ '--mobile-viewport-height': `${viewportHeight}px`, '--mobile-viewport-top': `${viewportTop}px` }"
  >
    <div class="mobile-ambient mobile-ambient-one"></div>
    <div class="mobile-ambient mobile-ambient-two"></div>

    <main v-if="state.boot !== 'ready'" class="mobile-onboarding">
      <section v-if="state.boot === 'loading'" class="mobile-gate-card">
        <span class="mobile-gate-logo">TG</span>
        <h1>正在打开口袋中转站</h1>
        <p>读取本机 SQLite、Keychain 会话与 Supabase 空间。</p>
        <div class="mobile-gate-loader"></div>
      </section>
      <section
        v-else-if="state.boot === 'no-profile'"
        class="mobile-gate-card mobile-setup-card"
      >
        <span class="mobile-gate-kicker">SUPABASE ONLY</span>
        <h1>连接你的云端空间</h1>
        <p>连接、登录和选择 Space 是三个独立步骤；这里不会自动创建远端空间。</p>
        <label
          ><span>连接名称</span
          ><input v-model="state.setup.profileName" autocomplete="off" /></label
        ><label
          ><span>API URL</span
          ><input
            v-model="state.setup.apiUrl"
            type="url"
            inputmode="url"
            placeholder="https://…"
            autocapitalize="none" /></label
        ><label
          ><span>公开 anon key</span
          ><textarea
            v-model="state.setup.anonKey"
            rows="3"
            autocomplete="off"
          ></textarea></label
        ><button
          class="mobile-primary-button"
          type="button"
          :disabled="
            state.setup.sending || !state.setup.apiUrl || !state.setup.anonKey
          "
          @click="controller.testSetupConnection"
        >
          {{ state.setup.tested ? "连接已验证" : "测试连接" }}</button
        ><template v-if="state.setup.tested"
          ><label
            ><span>邮箱</span
            ><input
              v-model="state.setup.email"
              type="email"
              autocomplete="username" /></label
          ><label
            ><span>密码</span
            ><input
              v-model="state.setup.password"
              type="password"
              autocomplete="current-password" /></label
          ><button
            class="mobile-primary-button"
            type="button"
            :disabled="
              state.setup.sending || !state.setup.email || !state.setup.password
            "
            @click="controller.setupSignIn"
          >
            登录并读取已有 Space
          </button></template
        >
      </section>
      <section
        v-else-if="state.boot === 'choose-profile'"
        class="mobile-gate-card"
      >
        <span class="mobile-gate-kicker">选择连接</span>
        <h1>选择 Supabase 配置</h1>
        <p>iOS 只显示 Supabase 配置，其他桌面存储设置会原样保留。</p>
        <button
          v-for="profile in state.profiles"
          :key="profile.id"
          class="mobile-space-option"
          type="button"
          @click="controller.chooseProfile(profile)"
        >
          <span>{{ profile.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ profile.name }}</strong
            ><small>{{ profile.supabase?.api_url }}</small>
          </div>
          <b>›</b>
        </button>
      </section>
      <section v-else-if="state.boot === 'signed-out'" class="mobile-gate-card">
        <span class="mobile-gate-kicker">{{ state.activeProfile?.name }}</span>
        <h1>登录 Supabase</h1>
        <p>会话将由系统凭据库保存，不会写入普通设置或前端存储。</p>
        <label
          ><span>邮箱</span
          ><input
            v-model="state.login.email"
            type="email"
            autocomplete="username"
            aria-label="Supabase 登录邮箱" /></label
        ><label
          ><span>密码</span
          ><input
            v-model="state.login.password"
            type="password"
            autocomplete="current-password"
            aria-label="Supabase 登录密码"
            @keyup.enter="
              state.login.email && state.login.password && controller.signIn()
            " /></label
        ><button
          class="mobile-primary-button"
          type="button"
          :disabled="
            state.login.sending || !state.login.email || !state.login.password
          "
          @click="controller.signIn"
        >
          {{ state.login.sending ? "正在登录…" : "登录" }}
        </button>
      </section>
      <section
        v-else-if="state.boot === 'needs-space'"
        class="mobile-gate-card"
      >
        <span class="mobile-gate-kicker">显式绑定</span>
        <h1>选择存储空间</h1>
        <p>选择账号已有 Space 后才会开始同步，不会自动创建 Space。</p>
        <button
          v-for="space in state.spaces"
          :key="space.id"
          class="mobile-space-option"
          type="button"
          @click="chooseSpace(space)"
        >
          <span>{{ space.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ space.name }}</strong
            ><small>{{ space.messageCount }} 条消息</small>
          </div>
          <b>›</b>
        </button>
        <p v-if="!state.spaces.length" class="mobile-gate-empty">
          当前账号没有可绑定的 Space，请先在已配置的客户端中创建。
        </p>
      </section>
      <section v-else class="mobile-gate-card">
        <span class="mobile-gate-logo">!</span>
        <h1>暂时无法打开</h1>
        <p>{{ state.error || "移动端初始化失败，本机数据没有被删除。" }}</p>
        <button
          class="mobile-primary-button"
          type="button"
          @click="controller.initialize"
        >
          重试
        </button>
      </section>
      <p
        v-if="state.error && state.boot !== 'error'"
        class="mobile-inline-error"
      >
        {{ state.error }}
      </p>
    </main>

    <template v-else>
      <main
        class="mobile-main"
        :inert="activeSheet !== null"
        :aria-hidden="activeSheet ? 'true' : undefined"
      >
        <section
          v-if="activeTab === 'feed'"
          class="mobile-page mobile-feed-page"
          aria-labelledby="mobile-feed-title"
        >
          <header class="mobile-topbar">
            <button
              class="mobile-space-switcher"
              type="button"
              :aria-label="`切换 Supabase 存储空间，${compactSyncTitle}`"
              :disabled="selectionMode || state.busy || state.composer.sending || state.sender.saving"
              @click="openSheet('spaces')"
            >
              <span class="mobile-space-mark">TG</span
              ><span
                ><strong id="mobile-feed-title">{{
                  currentSpace?.name || state.activeProfile?.name
                }}</strong><small class="mobile-space-sync" :class="`is-${syncTone}`" :title="syncDetail" role="status" aria-live="polite">{{ compactSyncTitle }}</small></span
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
            </button>
            <div class="mobile-topbar-actions">
              <button
                class="mobile-icon-button"
                type="button"
                aria-label="搜索消息"
                :aria-expanded="searchOpen"
                @click="searchOpen = !searchOpen; if (!searchOpen) searchQuery = ''"
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.2 4.2" />
                </svg></button
              ><button
                class="mobile-avatar-button"
                type="button"
                aria-label="打开我的账户"
                @click="selectTab('profile')"
              >
                {{ accountInitial }}
              </button>
            </div>
          </header>
          <div v-if="searchOpen" class="mobile-search-wrap">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.2 4.2" /></svg
            ><input
              v-model="searchQuery"
              type="search"
              aria-label="搜索文本、文件名"
              placeholder="搜索文本、文件名"
              autofocus
            /><button
              v-if="searchQuery"
              type="button"
              @pointerdown.prevent
              @click="searchQuery = ''"
            >
              清除
            </button>
          </div>
          <p
            v-if="state.notice || state.error"
            class="mobile-feedback"
            :class="{ 'is-error': state.error }"
          >
            {{ state.error || state.notice }}
          </p>
          <div class="mobile-section-heading">
            <span>{{ selectionMode ? `已选择 ${selectedMessages.length} 条` : searchQuery ? "搜索结果" : "消息" }}</span
            ><small
              >{{ searchQuery.trim() ? (state.search.loading ? "正在搜索…" : `${visibleMessages.length} 条 · 本机索引`) : `${visibleMessages.length} 条` }}</small
            >
          </div>
          <div ref="feedScroller" class="mobile-feed-scroll" @scroll.passive="handleFeedScroll">
          <p v-if="searchQuery.trim()" class="mobile-search-scope">搜索当前空间已同步到本机的消息</p>
          <p v-if="searchQuery.trim() && state.search.error" class="mobile-feedback is-error" role="alert">{{ state.search.error }}</p>
          <button v-if="searchQuery.trim() && (state.search.hasMore || state.search.error)" class="mobile-load-more" type="button" :disabled="state.search.loading" @click="controller.loadMoreSearch">{{ state.search.loading ? "正在搜索…" : state.search.error ? "重试搜索" : "更早的搜索结果" }}</button>
          <button
            v-if="state.hasMoreBefore && !searchQuery"
            class="mobile-load-more"
            type="button"
            :disabled="state.loadingOlder"
            @click="controller.loadOlderMessages"
          >
            {{ state.loadingOlder ? "正在加载更早消息…" : "向上滚动查看更多" }}
          </button>
          <div v-if="visibleMessages.length" class="mobile-message-list">
            <article
              v-for="message in visibleMessages"
              :key="message.filename"
              :data-message-filename="message.filename"
              class="mobile-message-card"
              :class="[`is-${message.kind}`, { 'is-marked': message.marked, 'is-self': isOwnMessage(message, state.settings?.sender_name), 'is-selecting': selectionMode, 'is-selected': selectedFilenames.includes(message.filename) }]"
              @click="openMessage(message)"
              @pointerdown="beginLongPress(message)"
              @pointerup="cancelLongPress"
              @pointerleave="cancelLongPress"
              @pointercancel="cancelLongPress"
              @pointermove="cancelLongPress"
            >
              <header class="mobile-message-header">
                <button v-if="selectionMode" class="mobile-message-select" type="button" :aria-label="`选择消息 ${message.title}`" :aria-pressed="selectedFilenames.includes(message.filename)" :disabled="state.busy" @pointerdown.stop @click.stop="toggleMessageSelection(message)">{{ selectedFilenames.includes(message.filename) ? "✓" : "" }}</button>
                <span>{{ message.source }}</span>
                <time>{{ message.time }}</time>
                <span v-if="message.marked" class="mobile-message-mark" aria-label="已标记">★</span>
                <button v-if="!selectionMode" class="mobile-card-more" type="button" aria-label="更多操作" @pointerdown.stop @click.stop="openActions(message)">•••</button>
              </header>
              <div class="mobile-message-bubble">
              <MobileMessageBody :limit="message.kind === 'text' ? 130 : 260" @before-toggle="beforeMessageToggle" @after-toggle="afterMessageToggle">
              <div
                v-if="message.kind === 'image' || message.kind === 'video'"
                class="mobile-media-preview"
                :class="{
                  'has-image': message.previewUrl,
                  'is-loading': message.previewState === 'loading',
                }"
              >
                <img
                  v-if="message.previewUrl"
                  :src="message.previewUrl"
                  alt=""
                  @error="controller.previewImageFailed(message)"
                /><span v-else class="mobile-media-type">{{
                  message.kind === "video" ? "VIDEO" : "IMAGE"
                }}</span
                ><span v-if="message.kind === 'video'" class="mobile-play-mark"
                  >▶</span
                >
              </div>
              <div
                v-else-if="message.kind === 'audio'"
                class="mobile-file-mark"
              >
                AUDIO
              </div>
              <div v-else-if="message.kind === 'file'" class="mobile-file-mark">
                {{
                  message.originalName
                    .split(".")
                    .pop()
                    ?.slice(0, 4)
                    .toUpperCase()
                }}
              </div>
              <div class="mobile-message-content">
                <div v-if="message.kind !== 'text'" class="mobile-message-title-row">
                  <strong>{{ message.title }}</strong
                  ><span v-if="message.marked" class="mobile-pin-dot"></span>
                </div>
                <MobileText v-if="message.body" :text="message.body" :format="message.format" />
                <small v-if="message.meta" class="mobile-file-meta">{{
                  message.meta
                }}</small
                ><small
                  v-if="previewStatus(message)"
                  class="mobile-preview-status"
                  :class="{ 'is-error': message.previewState === 'failed' }"
                  >{{ previewStatus(message) }}</small
                ><small
                  v-if="message.cached && message.kind !== 'text'"
                  class="mobile-cache-status"
                  >原件已缓存</small
                >
              </div>
              </MobileMessageBody>
              </div>
            </article>
          </div>
          <div v-else class="mobile-empty-state">
            <span>⌕</span
            ><strong>{{
              searchQuery.trim() ? state.search.loading ? "正在搜索…" : state.search.error ? "搜索暂时不可用" : "没有找到相关内容" : "这个空间还没有消息"
            }}</strong>
            <p>
              {{
                searchQuery
                  ? "换个关键词，或者清除搜索条件。"
                  : "发送的内容会先保存到本机，再同步到 Supabase。"
              }}
            </p>
          </div>
          </div>
        </section>
        <section
          v-else-if="activeTab === 'marked'"
          class="mobile-page mobile-marked-page"
        >
          <header class="mobile-page-titlebar">
            <div>
              <small>稍后处理</small>
              <h1>标记</h1>
            </div>
            <span class="mobile-count-stamp">{{
              state.markedTotal
            }}</span>
          </header>
          <div class="mobile-segmented mobile-segmented-two">
            <button
              type="button"
              :class="{ 'is-active': markedFilter === 'pending' }"
              @click="markedFilter = 'pending'"
            >
              待处理</button
            ><button
              type="button"
              :class="{ 'is-active': markedFilter === 'all' }"
              @click="markedFilter = 'all'"
            >
              全部
            </button>
          </div>
          <div class="mobile-tag-strip">
            <button
              type="button"
              :class="{ 'is-active': !activeTag }"
              @click="activeTag = ''"
            >
              全部标签</button
            ><button
              v-for="tag in state.tags"
              :key="tag.id"
              type="button"
              :class="{ 'is-active': activeTag === tag.id }"
              @click="activeTag = tag.id"
            >
              {{ tag.name }}
            </button>
          </div>
          <p v-if="state.markedView.error" class="mobile-feedback is-error" role="alert">{{ state.markedView.error }}</p>
          <div v-if="visibleMarkedItems.length" class="mobile-task-list">
            <article v-for="item in visibleMarkedItems" :key="item.filename">
              <button
                class="mobile-task-body"
                type="button"
                @click="openMessage(item)"
              >
                <strong v-if="item.kind !== 'text'">{{ item.title }}</strong>
                <MobileText v-if="item.body" :text="item.body" :format="item.format" />
                <strong v-else-if="item.kind === 'text'">{{ item.title }}</strong>
                <small><span v-for="tag in state.tags.filter((tag) => item.tagIds.includes(tag.id))" :key="tag.id">{{ tag.name }}</span><span v-if="!item.tagIds.length">未分类</span><i></i>{{ item.dueDate || "无截止日期" }}</small>
              </button>
              <div class="mobile-task-controls">
                <button class="mobile-task-pin" type="button" :aria-label="`取消标记 ${item.title}`" :disabled="state.busy" @click="openUnmarkConfirmation(item)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l-1 6 3 3v2h-6v7l-1 1-1-1v-7H5v-2l3-3-1-6Z" /></svg></button>
                <button class="mobile-task-edit" type="button" :aria-label="`编辑标记 ${item.title}`" @click="openMarkedEditor(item)">编辑</button>
              </div>
            </article>
          </div>
          <div v-else class="mobile-empty-state mobile-empty-compact">
            <span>✓</span><strong>{{ state.markedView.loading ? "正在加载标记…" : state.markedView.error ? "标记暂时无法读取" : markedFilter === 'pending' ? "这里没有待处理标记" : "这里还没有标记" }}</strong>
            <p>在消息操作菜单中可以添加标记。</p>
          </div>
          <button v-if="state.markedView.hasMore || state.markedView.error" class="mobile-load-more" type="button" :disabled="state.markedView.loading" @click="state.markedView.error ? controller.setMarkedFilter(markedFilter === 'pending', activeTag) : controller.loadMoreMarked()">{{ state.markedView.loading ? "正在加载…" : state.markedView.error ? "重试标记列表" : "加载更多标记" }}</button>
        </section>
        <section v-else class="mobile-page mobile-profile-page">
          <header class="mobile-profile-hero">
            <div class="mobile-profile-avatar">{{ accountInitial }}</div>
            <div>
              <small>Transfer Genie</small>
              <h1>{{ profileTitle }}</h1>
              <p>{{ state.account?.email }}</p>
            </div>
            <span class="mobile-account-state">已登录</span>
          </header>
          <section class="mobile-settings-group">
            <h2>云端与存储</h2>
            <button type="button" @click="openSheet('spaces')">
              <span class="mobile-setting-icon is-orange">S</span
              ><span
                ><strong>存储空间</strong
                ><small>{{ currentSpace?.name || state.activeProfile?.name }} · Supabase</small
                ></span
              ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg></button
            ><button type="button" @click="openSheet('transfer')">
              <span class="mobile-setting-icon is-green">↻</span
              ><span
                ><strong>同步与传输</strong
                ><small>{{
                  activeTransfers.length
                    ? `${activeTransfers.length} 个任务进行中`
                    : "查看传输任务与手动同步"
                }}</small></span
              ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg></button
            ><button v-if="syncTone === 'conflict'" type="button" @click="openSheet('conflicts')">
              <span class="mobile-setting-icon is-orange">!</span
              ><span><strong>同步冲突</strong><small>{{ state.syncStatus?.conflict_count || state.syncStatus?.conflictCount || 0 }} 项需要选择保留版本</small></span
              ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg>
            </button
            ><button type="button" @click="controller.refreshAll">
              <span class="mobile-setting-icon is-blue">↓</span
              ><span
                ><strong>立即同步</strong
                ><small>执行 outbox 与 checkpoint 增量补拉</small></span
              ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg>
            </button>
          </section>
          <section class="mobile-settings-group">
            <h2>本机缓存</h2>
            <button type="button" @click="openSheet('cache')">
              <span class="mobile-setting-icon is-charcoal">⌁</span
              ><span
                ><strong>附件缓存</strong
                ><small
                  >{{ cacheSize }} ·
                  {{ state.cache.fileCount }} 个可清理文件</small
                ></span
              ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg>
            </button>
          </section>
          <section class="mobile-settings-group">
            <h2>应用</h2>
            <button type="button" @click="openSheet('sender')">
              <span class="mobile-setting-icon is-charcoal">TG</span>
              <span><strong>发送者名称</strong><small>{{ state.settings?.sender_name }}</small></span>
              <svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg>
            </button>
            <button type="button" @click="openSheet('about')">
              <span class="mobile-setting-icon is-cream">i</span
              ><span
                ><strong>关于 Transfer Genie</strong
                ><small>版本 {{ state.appVersion || "—" }} · iOS</small></span
              ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg>
            </button>
          </section>
          <button
            class="mobile-logout-button"
            type="button"
            :disabled="state.busy || state.composer.sending || state.sender.saving"
            @click="controller.logout"
          >
            退出登录
          </button>
        </section>
      </main>

      <div
        v-if="activeTab === 'feed'"
        class="mobile-feed-dock"
        :inert="activeSheet !== null"
        :aria-hidden="activeSheet ? 'true' : undefined"
      >
        <div v-if="selectionMode" class="mobile-selection-toolbar" role="toolbar" aria-label="消息批量操作">
          <button type="button" :disabled="state.busy" @click="endSelection">取消</button>
          <button type="button" :disabled="state.busy || !selectedMessages.length" @click="applySelection('mark')">标记</button>
          <button type="button" :disabled="state.busy || !selectedMessages.length" @click="applySelection('unmark')">取消标记</button>
          <button class="is-danger" type="button" :disabled="state.busy || !selectedMessages.length" @click="applySelection('delete')">删除</button>
        </div>
        <template v-else>
        <button
          v-if="activeTransfers.length"
          class="mobile-transfer-pill"
          type="button"
          @click="openSheet('transfer')"
        >
          <span class="mobile-transfer-spinner"></span
          ><strong>{{ activeTransfers.length }} 个传输任务</strong
          ><small>{{ activeTransferProgress }}%</small
          ><svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg></button
        ><button
          class="mobile-composer-launcher"
          type="button"
          aria-label="新消息"
          @click="openSheet('composer')"
        >
          <span class="mobile-add-button">＋</span><span>发送消息或文件…</span
          ><span class="mobile-send-orb"
            ><svg viewBox="0 0 24 24">
              <path d="m4 5 16 7-16 7 3-7-3-7Z" />
              <path d="M7 12h8" /></svg
          ></span>
        </button>
        </template>
      </div>
      <nav
        class="mobile-tabbar"
        aria-label="主要导航"
        :inert="activeSheet !== null"
        :aria-hidden="activeSheet ? 'true' : undefined"
      >
        <button
          type="button"
          aria-label="消息"
          :class="{ 'is-active': activeTab === 'feed' }"
          :aria-current="activeTab === 'feed' ? 'page' : undefined"
          @click="selectTab('feed')"
        >
          <svg viewBox="0 0 24 24">
            <path d="M4 5.5h16v11H9l-5 3v-14Z" />
            <path d="M8 10h8M8 13h5" /></svg
          ><span>消息</span></button
        ><button
          type="button"
          aria-label="标记"
          :class="{ 'is-active': activeTab === 'marked' }"
          :aria-current="activeTab === 'marked' ? 'page' : undefined"
          @click="selectTab('marked')"
        >
          <svg viewBox="0 0 24 24">
            <path
              d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3Z"
            /></svg
          ><span>标记</span
          ><i v-if="state.markedTotal">{{
            state.markedTotal
          }}</i></button
        ><button
          type="button"
          aria-label="我的"
          :class="{ 'is-active': activeTab === 'profile' }"
          :aria-current="activeTab === 'profile' ? 'page' : undefined"
          @click="selectTab('profile')"
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20c.6-4 2.7-6 6.5-6s5.9 2 6.5 6" /></svg
          ><span>我的</span>
        </button>
      </nav>

      <div
        v-if="activeSheet"
        class="mobile-sheet-layer"
        role="presentation"
        @click.self="closeSheet"
      >
        <section
          v-if="activeSheet === 'composer'"
          class="mobile-sheet mobile-composer-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-composer-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div>
              <small>发送到 {{ currentSpace?.name }}</small>
              <h2 id="mobile-composer-title">新消息</h2>
            </div>
            <button type="button" aria-label="关闭新消息" :disabled="state.composer.selecting" @click="closeSheet">×</button>
          </header>
          <div class="mobile-composer-content" role="region" aria-label="消息编辑与附件">
          <div class="mobile-composer-format" aria-label="消息格式">
            <button type="button" :aria-pressed="state.composer.format === 'text'" :disabled="state.composer.sending" @click="state.composer.format = 'text'; composerPreview = false">文字</button>
            <button type="button" :aria-pressed="state.composer.format === 'markdown'" :disabled="state.composer.sending" @click="state.composer.format = 'markdown'">Markdown</button>
            <button v-if="state.composer.format === 'markdown'" type="button" :aria-pressed="composerPreview" @click="composerPreview = !composerPreview">{{ composerPreview ? '继续编辑' : '预览' }}</button>
          </div>
          <textarea
            v-show="!composerPreview || state.composer.format !== 'markdown'"
            v-model="state.composer.text"
            :disabled="state.composer.sending"
            rows="6"
            aria-label="消息内容"
            placeholder="输入文字，或加入照片和文件…"
            autofocus
          ></textarea>
          <div v-if="composerPreview && state.composer.format === 'markdown'" class="mobile-compose-preview" aria-label="Markdown 预览"><MobileText v-if="state.composer.text" :text="state.composer.text" format="markdown" /><span v-else>输入内容后可在这里预览。</span></div>
          <div class="mobile-compose-actions">
          <div
            v-if="state.composer.attachments.length"
            class="mobile-attachment-strip"
          >
            <div
              v-for="item in state.composer.attachments"
              :key="item.id"
              :class="[
                `is-${item.previewState}`,
                { 'has-preview': item.previewUrl },
              ]"
              :style="
                item.previewUrl
                  ? { backgroundImage: `url(${item.previewUrl})` }
                  : undefined
              "
            >
              <button
                class="mobile-draft-open"
                type="button"
                :aria-label="`预览附件 ${item.originalName}`"
                :disabled="state.busy || state.composer.sending || state.composer.selecting"
                @click="controller.previewDraftAttachment(item.id)"
              ><span>预览</span></button>
              <span
                v-if="item.previewState === 'loading'"
                class="mobile-draft-preview-status"
                >正在生成预览…</span
              ><span
                v-else-if="item.previewState === 'failed'"
                class="mobile-draft-preview-status is-error"
                >预览失败</span
              ><span
                v-else-if="item.previewState === 'unsupported'"
                class="mobile-draft-file-type"
                >{{
                  item.originalName
                    .split(".")
                    .pop()
                    ?.slice(0, 4)
                    .toUpperCase() || "FILE"
                }}</span
              ><span class="mobile-draft-kind">{{ item.mediaType }}</span
              ><strong>{{ item.originalName }}</strong
              ><small v-if="item.error">{{ item.error }}</small
              ><small v-else-if="item.previewError">{{
                item.previewError
              }}</small
              ><button
                type="button"
                aria-label="移除附件"
                :disabled="state.composer.sending"
                @click="controller.removeAttachment(item.id)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="mobile-compose-tools">
            <button type="button" :disabled="state.busy || state.composer.sending || state.composer.selecting" @click="controller.selectMedia">
              <span>▧</span>照片</button
            ><button type="button" :disabled="state.busy || state.composer.sending || state.composer.selecting" @click="controller.selectDocuments">
              <span>⌑</span>文件</button
            ><button
              type="button"
              :class="{ 'is-selected': state.composer.marked }"
              :disabled="state.composer.sending"
              @click="openMarkSettings('composer')"
            >
              <span>★</span>标记
            </button>
          </div>
          <p v-if="state.composer.marked" class="mobile-composer-mark-summary">已标记 · {{ state.tags.filter((tag) => state.composer.tagIds.includes(tag.id)).map((tag) => tag.name).join('、') || '未分类' }} · {{ state.composer.dueDate || '无截止日期' }}</p>
          <p v-if="state.composer.selecting" class="mobile-draft-preview-status" role="status">正在准备所选附件…</p>
          <p v-if="state.composer.error" class="mobile-inline-error" role="alert">
            {{ state.composer.error }}
          </p>
          <button
            class="mobile-primary-button"
            :class="{ 'is-queued': state.composer.savedLocally }"
            type="button"
            :disabled="
              state.busy || state.composer.selecting ||
              state.composer.sending ||
              (!state.composer.text.trim() &&
                !state.composer.attachments.length)
            "
            @click="sendDraft"
          >
            <span>{{
              state.composer.sending
                ? "正在保存到本机…"
                : state.composer.savedLocally
                  ? "已保存到本机"
                  : "发送"
            }}</span
            ><b v-if="state.composer.savedLocally">✓</b>
          </button>
          </div>
          </div>
        </section>
        <section
          v-else-if="activeSheet === 'actions'"
          class="mobile-sheet mobile-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="消息操作"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <div class="mobile-action-context">
            <small
              >{{ selectedMessage?.source }} ·
              {{ selectedMessage?.time }}</small
            ><strong>{{ selectedMessage?.title }}</strong>
          </div>
          <div class="mobile-action-grid">
            <button type="button" :disabled="state.busy || state.composer.sending" @click="copySelectedText">
              <span>⧉</span>复制</button
            ><button type="button" :disabled="state.busy || state.composer.sending" @click="toggleSelectedMark">
              <span>☆</span
              >{{ selectedMessage?.marked ? "取消标记" : "标记" }}</button
            ><button
              type="button"
              :disabled="state.busy || selectedMessage?.kind === 'text'"
              @click="
                selectedMessage && controller.shareMessage(selectedMessage)
              "
            >
              <span>↗</span>分享
            </button>
          </div>
          <button class="mobile-action-row" type="button" :disabled="state.busy || state.composer.sending" @click="selectedMessage && startSelection(selectedMessage)"><span>多选</span><b>›</b></button>
          <p v-if="state.error" class="mobile-feedback is-error" role="alert">{{ state.error }}</p>
          <button v-if="selectedMessage?.marked" class="mobile-action-row" type="button" :disabled="state.busy" @click="selectedMessage && openMarkedEditor(selectedMessage)"><span>编辑标签与截止日期</span><b>›</b></button>
          <button
            class="mobile-action-row"
            type="button"
            @click="selectedMessage && openMessage(selectedMessage)"
          >
            <span>查看详情</span><b>›</b></button
          ><button
            v-if="selectedMessage?.kind !== 'text'"
            class="mobile-action-row"
            type="button"
            :disabled="state.busy || state.composer.sending"
            @click="deleteSelectedMessage(false)"
          >
            <span>仅移除本地附件缓存</span><b>›</b></button
          ><button
            class="mobile-action-row is-danger"
            type="button"
            :disabled="state.busy || state.composer.sending"
            @click="deleteSelectedMessage(true)"
          >
            <span>删除消息（同步到云端）</span><b>›</b></button
          ><button
            class="mobile-sheet-cancel"
            type="button"
            @click="closeSheet"
          >
            取消
          </button>
        </section>
        <section v-else-if="activeSheet === 'delete-confirm'" class="mobile-sheet mobile-delete-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-delete-title" tabindex="-1">
          <div class="mobile-sheet-grabber"></div>
          <header><div><small>请确认</small><h2 id="mobile-delete-title">删除消息</h2></div><button type="button" aria-label="取消删除" :disabled="state.busy" @click="cancelDeletion">×</button></header>
          <p>{{ deleteConfirmation === 'selection' ? '删除选中的 ' + selectedMessages.length + ' 条消息？' : '删除这条消息？' }} 删除将同步到云端，其他设备也会移除这些消息。</p>
          <p v-if="state.error" class="mobile-feedback is-error" role="alert">{{ state.error }}</p>
          <button class="mobile-primary-button" type="button" :disabled="state.busy" @click="confirmDeletion">{{ state.busy ? '正在删除…' : '确认删除' }}</button>
          <button class="mobile-sheet-cancel" type="button" :disabled="state.busy" @click="cancelDeletion">取消删除</button>
        </section>
        <section
          v-else-if="activeSheet === 'transfer'"
          class="mobile-sheet mobile-transfer-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-transfer-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div>
              <small>本地优先队列</small>
              <h2 id="mobile-transfer-title">同步与传输</h2>
            </div>
            <button type="button" aria-label="关闭同步与传输" @click="closeSheet">×</button>
          </header>
          <div v-if="state.transfers.length" class="mobile-transfer-list">
            <article v-for="item in state.transfers" :key="item.id">
              <div class="mobile-transfer-file">
                {{ item.name.split(".").pop()?.slice(0, 3).toUpperCase() }}
              </div>
              <div>
                <strong>{{ item.name }}</strong
                ><small>{{ item.detail }}</small
                ><span><i :style="{ width: `${item.progress}%` }"></i></span>
              </div>
              <button v-if="item.operationId && ['failed', 'error', 'paused'].includes(item.state)" type="button" :disabled="state.busy" :aria-label="`重试传输 ${item.name}`" @click="controller.retryTransfer(item)">重试</button>
              <b v-else>{{ item.progress >= 100 ? "✓" : `${item.progress}%` }}</b>
            </article>
          </div>
          <p v-else class="mobile-sheet-footnote">当前没有传输记录。</p>
          <button
            class="mobile-primary-button mobile-sheet-refresh"
            type="button"
            :disabled="state.busy"
            @click="controller.refreshAll"
          >
            {{ state.busy ? "正在同步…" : "立即同步" }}
          </button>
        </section>
        <section
          v-else-if="activeSheet === 'spaces'"
          class="mobile-sheet mobile-space-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-space-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div>
              <small>Supabase</small>
              <h2 id="mobile-space-title">选择存储空间</h2>
            </div>
            <button type="button" aria-label="关闭存储空间选择" @click="closeSheet">×</button>
          </header>
          <button
            v-for="space in state.spaces"
            :key="space.id"
            class="mobile-space-option"
            :class="{
              'is-current':
                space.current ||
                space.id === state.activeProfile?.supabase?.space_id,
            }"
            type="button"
            :disabled="state.busy || state.composer.sending || state.sender.saving"
            @click="chooseSpace(space)"
          >
            <span>{{ space.name.slice(0, 1) }}</span>
            <div>
              <strong>{{ space.name }}</strong
              ><small
                >{{ state.account?.email }} ·
                {{ space.messageCount }} 条消息</small
              >
            </div>
            <b>{{ space.current ? "✓" : "" }}</b>
          </button>
          <p class="mobile-sheet-footnote">
            移动端不会自动创建
            Space，只展示当前账号已有空间；有待同步任务时后端会阻止切换。
          </p>
        </section>
        <section
          v-else-if="activeSheet === 'cache'"
          class="mobile-sheet mobile-cache-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-cache-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div>
              <small>当前账号</small>
              <h2 id="mobile-cache-title">附件缓存</h2>
            </div>
            <button type="button" aria-label="关闭缓存管理" @click="closeSheet">
              ×
            </button>
          </header>
          <div class="mobile-cache-meter">
            <span>{{ cacheSize }}</span>
            <div>
              <strong>可安全释放</strong
              ><small
                >{{
                  state.cache.fileCount
                }}
                个文件，只包含已上传且可重新下载的副本</small
              >
            </div>
          </div>
          <div class="mobile-cache-rules">
            <p>保留：待上传原件、冲突、下载中的临时文件。</p>
            <p>清理：当前账号已确认上传的原件副本、下载、预览与播放缓存。</p>
            <p v-if="state.cache.protectedTasks">
              另有 {{ state.cache.protectedTasks }} 个待同步或冲突任务受到保护。
            </p>
          </div>
          <p v-if="state.error" class="mobile-inline-error">
            {{ state.error }}
          </p>
          <button
            class="mobile-primary-button"
            type="button"
            v-if="!cacheConfirmation"
            :disabled="state.cache.clearing || state.busy || !state.cache.fileCount"
            @click="clearCache"
          >
            {{
              state.cache.clearing
                ? "正在清理…"
                : state.cache.fileCount
                  ? `释放 ${cacheSize}`
                  : "没有可清理缓存"
            }}
          </button>
          <div v-if="cacheConfirmation" role="group" aria-label="确认清理缓存">
            <p>将释放 {{ cacheSize }} 可重新下载的附件缓存，待上传文件不会删除。是否继续？</p>
            <button class="mobile-primary-button" type="button" :disabled="state.cache.clearing" @click="confirmCacheClear">{{ state.cache.clearing ? '正在清理…' : '确认清理缓存' }}</button>
            <button class="mobile-sheet-cancel" type="button" :disabled="state.cache.clearing" @click="cacheConfirmation = false">取消清理</button>
          </div>
        </section>
        <section
          v-else-if="activeSheet === 'conflicts'"
          class="mobile-sheet mobile-conflict-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-conflict-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header><div><small>需要你的选择</small><h2 id="mobile-conflict-title">同步冲突</h2></div><button type="button" aria-label="关闭同步冲突" @click="closeSheet">×</button></header>
          <div v-if="state.conflicts.length" class="mobile-conflict-list">
            <article v-for="conflict in state.conflicts" :key="conflict.id">
              <header><strong>{{ conflict.entityType === 'tag' ? '标签冲突' : '消息冲突' }}</strong><small>本机 r{{ conflict.localRevision }} · 云端 r{{ conflict.remoteRevision ?? '—' }}</small></header>
              <div><span>本机</span><p>{{ conflictSummary(conflict, 'local') }}</p></div>
              <div><span>云端</span><p>{{ conflictSummary(conflict, 'remote') }}</p></div>
              <footer><button type="button" :disabled="state.busy" @click="controller.resolveConflict(conflict, 'remote')">采用云端</button><button type="button" :disabled="state.busy" @click="controller.resolveConflict(conflict, 'local')">保留本机</button></footer>
            </article>
          </div>
          <p v-else class="mobile-sheet-footnote">当前没有待处理冲突。</p>
        </section>
        <section
          v-else-if="activeSheet === 'marked-edit'"
          class="mobile-sheet mobile-marked-edit-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-marked-edit-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div><small>{{ markEditorSource === 'composer' ? '为即将发送的内容设置' : markEditorSource === 'selection' ? `已选择 ${selectedMessages.length} 条消息` : selectedMessage?.title }}</small><h2 id="mobile-marked-edit-title">标记设置</h2></div>
            <button type="button" aria-label="关闭编辑标记" @click="closeSheet">×</button>
          </header>
          <label v-if="markEditorSource === 'composer'" class="mobile-mark-enable"><input v-model="markedEnabledDraft" type="checkbox" :disabled="state.busy || savingMark" /> 发送时标记</label>
          <fieldset class="mobile-marked-tag-options" :disabled="!markedEnabledDraft || state.busy || savingMark">
            <legend>标签</legend>
            <button v-for="tag in markedTagOptions" :key="tag.id" type="button" :class="{ 'is-selected': markedTagDraft.includes(tag.id) }" :aria-pressed="markedTagDraft.includes(tag.id)" @click="toggleMarkedTag(tag.id)">{{ tag.name }}<span>{{ markedTagDraft.includes(tag.id) ? "✓" : "＋" }}</span></button>
            <p v-if="!markedTagOptions.length" class="mobile-sheet-footnote">还没有标签，可以在下方新建。</p>
          </fieldset>
          <form class="mobile-new-tag-form" @submit.prevent="addMarkedTag">
            <input v-model="newTagDraft" aria-label="新标签名称" placeholder="新建标签" :disabled="state.busy || savingMark || !markedEnabledDraft" />
            <button type="submit" :disabled="state.busy || savingMark || !markedEnabledDraft || !newTagDraft.trim()">添加</button>
          </form>
          <label class="mobile-due-field" for="mobile-marked-due"><span>截止日期</span><input id="mobile-marked-due" v-model="markedDueDraft" type="date" aria-label="截止日期" :disabled="state.busy || savingMark || !markedEnabledDraft" /></label>
          <p v-if="state.error" class="mobile-feedback is-error" role="alert">{{ state.error }}</p>
          <button class="mobile-primary-button" type="button" :disabled="state.busy || savingMark" @click="saveMarkedMetadata">{{ state.busy || savingMark ? "正在保存…" : "保存标记" }}</button>
        </section>
        <section v-else-if="activeSheet === 'unmark-confirm'" class="mobile-sheet mobile-unmark-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-unmark-title" tabindex="-1">
          <div class="mobile-sheet-grabber"></div>
          <header><div><small>此操作不会删除消息</small><h2 id="mobile-unmark-title">确认取消标记？</h2></div><button type="button" aria-label="关闭确认" :disabled="state.busy" @click="closeSheet">×</button></header>
          <p class="mobile-unmark-copy">{{ unmarkSelection ? `将取消所选 ${selectedMessages.length} 条消息的标记。` : selectedMessage?.title }}</p>
          <p v-if="state.error" class="mobile-feedback is-error" role="alert">{{ state.error }}</p>
          <button class="mobile-primary-button" type="button" :disabled="state.busy" @click="confirmUnmark">{{ state.busy ? '正在处理…' : '确认取消标记' }}</button>
          <button class="mobile-sheet-cancel" type="button" :disabled="state.busy" @click="closeSheet">保留标记</button>
        </section>
        <section
          v-else-if="activeSheet === 'sender'"
          class="mobile-sheet mobile-sender-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-sender-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div><small>本机身份</small><h2 id="mobile-sender-title">发送者名称</h2></div>
            <button type="button" aria-label="关闭发送者名称" @click="closeSheet">×</button>
          </header>
          <form @submit.prevent="saveSenderName">
            <label for="mobile-sender-name">名称</label>
            <input id="mobile-sender-name" v-model="senderNameDraft" aria-label="发送者名称" autocomplete="off" :disabled="state.sender.saving" autofocus />
            <p class="mobile-sheet-footnote">用于区分这台设备发送的消息。更改只影响之后发送的消息，历史消息不会改名。</p>
            <p v-if="state.sender.error" class="mobile-inline-error" role="alert">{{ state.sender.error }}</p>
            <button class="mobile-primary-button" type="submit" :disabled="state.sender.saving || !senderNameDraft.trim()">{{ state.sender.saving ? "正在保存…" : "保存名称" }}</button>
          </form>
        </section>
        <section
          v-else-if="activeSheet === 'about'"
          class="mobile-sheet mobile-about-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-about-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div><small>口袋中转站</small><h2 id="mobile-about-title">关于 Transfer Genie</h2></div>
            <button type="button" aria-label="关闭关于" @click="closeSheet">×</button>
          </header>
          <dl class="mobile-about-facts">
            <div><dt>版本</dt><dd>{{ state.appVersion || "暂时无法读取" }}</dd></div>
            <div><dt>平台</dt><dd>iOS</dd></div>
            <div v-if="mobileDiagnostic"><dt>原生桥接</dt><dd>{{ mobileDiagnostic.platform }} · native={{ mobileDiagnostic.nativePlugin ? "true" : "false" }} · main-thread={{ mobileDiagnostic.mainThread ? "true" : "false" }}</dd></div>
            <div><dt>同步服务</dt><dd>Supabase</dd></div>
            <div><dt>发送者</dt><dd>{{ state.settings?.sender_name }}</dd></div>
          </dl>
          <p class="mobile-sheet-footnote">消息先保存到本机，再同步到云端。未完成的传输会在回到前台后继续处理；离线时可以查看已经缓存的内容。</p>
        </section>
        <section
          v-else
          class="mobile-sheet mobile-detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-detail-title"
          tabindex="-1"
        >
          <div class="mobile-sheet-grabber"></div>
          <header>
            <div>
              <small
                >{{ selectedMessage?.source }} ·
                {{ selectedMessage?.time }}</small
              >
              <h2 id="mobile-detail-title">{{ selectedMessage?.title }}</h2>
            </div>
            <button type="button" aria-label="关闭详情" @click="closeSheet">
              ×
            </button>
          </header>
          <div class="mobile-detail-scroll">
          <div
            v-if="
              selectedMessage &&
              (selectedMessage.kind === 'image' ||
                selectedMessage.kind === 'video')
            "
            class="mobile-detail-preview"
            :class="{
              'has-image': selectedMessage.previewUrl,
              'is-loading': selectedMessage.previewState === 'loading',
            }"
          >
            <img
              v-if="selectedMessage.previewUrl"
              :src="selectedMessage.previewUrl"
              :alt="selectedMessage.originalName"
              @error="controller.previewImageFailed(selectedMessage)"
            /><span v-else class="mobile-media-type">{{
              selectedMessage.kind === "video" ? "VIDEO" : "IMAGE"
            }}</span
            ><button
              v-if="selectedMessage.kind === 'video'"
              class="mobile-media-play"
              type="button"
              aria-label="播放视频"
              :disabled="state.busy"
              @click="controller.previewMessage(selectedMessage)"
            >
              ▶
            </button>
          </div>
          <div
            v-else-if="selectedMessage && selectedMessage.kind !== 'text'"
            class="mobile-document-preview"
          >
            <span>{{
              selectedMessage.kind === "audio"
                ? "AUDIO"
                : selectedMessage.originalName
                    .split(".")
                    .pop()
                    ?.slice(0, 4)
                    .toUpperCase()
            }}</span
            ><strong>{{ selectedMessage.title }}</strong
            ><small>{{ selectedMessage.meta }}</small>
          </div>
          <MobileText v-if="selectedMessage?.body" class="mobile-detail-copy" :text="selectedMessage.body" :format="selectedMessage.format" />
          <div
            v-if="selectedMessage && selectedMessage.kind !== 'text'"
            class="mobile-attachment-feedback"
            role="status"
            aria-live="polite"
          >
            <p v-if="previewStatus(selectedMessage)">
              {{ previewStatus(selectedMessage) }}
            </p>
            <button
              v-if="
                ['failed', 'offline'].includes(
                  selectedMessage.previewState || '',
                )
              "
              type="button"
              :disabled="state.busy"
              @click="controller.retryPreview(selectedMessage)"
            >
              重试预览
            </button>
            <p>{{ attachmentStatus(selectedMessage) }}</p>
            <p v-if="selectedMessage.attachmentError" class="is-error">
              {{ selectedMessage.attachmentError }}
            </p>
          </div>
          </div>
          <div class="mobile-detail-actions">
            <button
              v-if="selectedMessage && selectedMessage.kind !== 'text'"
              type="button"
              :disabled="
                state.busy || selectedMessage.attachmentState === 'unsupported'
              "
              @click="controller.previewMessage(selectedMessage)"
            >
              {{
                selectedMessage.kind === "video" ||
                selectedMessage.kind === "audio"
                  ? "播放"
                  : "系统预览"
              }}</button
            ><button
              v-if="selectedMessage?.kind !== 'text'"
              type="button"
              :disabled="state.busy"
              @click="
                selectedMessage && controller.shareMessage(selectedMessage)
              "
            >
              分享</button
            ><button
              class="mobile-detail-more" type="button"
              :disabled="state.busy"
              @click="activeSheet = 'actions'"
            >
              更多
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
