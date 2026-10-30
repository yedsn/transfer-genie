import { computed, reactive, watch } from "vue";

type MobileApi = Record<string, any>;

export interface MobileMessage {
  filename: string;
  messageId?: string | null;
  kind: "text" | "image" | "video" | "audio" | "file";
  sender: string;
  source: string;
  timestampMs: number;
  time: string;
  title: string;
  body?: string;
  format?: "text" | "markdown";
  meta?: string;
  marked: boolean;
  tagIds: string[];
  dueDate?: string | null;
  originalName: string;
  previewUrl?: string;
  previewState?: string;
  previewError?: string;
  cached: boolean;
  attachmentState: "idle" | "downloading" | "cached" | "previewing" | "sharing" | "paused" | "failed" | "unsupported";
  attachmentError?: string;
}

interface DraftAttachment {
  id: string;
  clientId: string;
  path: string;
  originalName: string;
  mediaType: "image" | "video" | "file";
  contentType?: string;
  sizeBytes: number;
  previewUrl?: string;
  previewState: "loading" | "ready" | "failed" | "unsupported";
  previewError?: string;
  previewRequestId?: string;
  error?: string;
  available?: boolean;
}

const previewMode = new URLSearchParams(window.location.search).get("mobile-preview") === "1";
const api = () => (window as any).transferGenieApi as MobileApi;

function editorFormat(value: unknown): "text" | "markdown" {
  return value === "markdown" ? "markdown" : "text";
}

function hasRecoverableDraft(draft: any) {
  return !!draft?.updatedAtMs || !!String(draft?.text || "") || !!draft?.marked ||
    !!String(draft?.dueDate || "") || (Array.isArray(draft?.tagIds) && draft.tagIds.length > 0) ||
    (Array.isArray(draft?.attachments) && draft.attachments.length > 0);
}

function errorText(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return String(value.message || value.error || JSON.stringify(error));
  }
  return String(error || "未知错误");
}

function fileKind(message: any): MobileMessage["kind"] {
  if (message?.kind === "text") return "text";
  const name = String(message?.original_name || message?.originalName || message?.filename || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/.test(name)) return "image";
  if (/\.(mp4|mov|m4v|webm|avi|mkv)$/.test(name)) return "video";
  if (/\.(mp3|m4a|aac|wav|aiff?|flac|ogg|opus)$/.test(name)) return "audio";
  return "file";
}

function formatBytes(value: number) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const amount = size / 1024 ** index;
  return `${amount.toFixed(index === 0 || amount >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatTime(timestampMs: number) {
  if (!timestampMs) return "";
  const date = new Date(timestampMs);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function mapMessage(message: any): MobileMessage {
  const kind = fileKind(message);
  const originalName = String(message?.original_name || message?.originalName || message?.filename || "附件");
  const timestampMs = Number(message?.timestamp_ms || message?.timestampMs || 0);
  const sender = String(message?.sender || "未知设备");
  return {
    filename: String(message?.filename || message?.message_id || crypto.randomUUID()),
    messageId: message?.message_id || message?.messageId || null,
    kind,
    sender,
    source: sender,
    timestampMs,
    time: formatTime(timestampMs),
    title: kind === "text" ? (String(message?.content || "文本消息").split(/\r?\n/)[0].slice(0, 52) || "文本消息") : originalName,
    body: kind === "text" ? String(message?.content || "") : undefined,
    format: message?.format === "markdown" ? "markdown" : "text",
    meta: kind === "text" ? undefined : [originalName.split(".").pop()?.toUpperCase(), formatBytes(Number(message?.size || 0))].filter(Boolean).join(" · "),
    marked: !!message?.marked,
    tagIds: Array.isArray(message?.marked_tag_ids) ? message.marked_tag_ids : [],
    dueDate: message?.marked_due_date || null,
    originalName,
    cached: !!message?.download_exists,
    attachmentState: message?.download_exists ? "cached" : "idle",
  };
}

export function previewStatus(message: MobileMessage) {
  const labels: Record<string, string> = { loading: "正在加载预览…", offline: "预览未缓存，联网后重试", failed: "预览失败，可重试", missing: "暂无预览，打开原件后可补全", unsupported: "此格式暂无缩略预览" };
  return labels[message.previewState || ""] || "";
}

export function attachmentStatus(message: MobileMessage) {
  const labels = { downloading: "正在准备原件，传输进度见同步与传输", previewing: "正在打开系统预览", sharing: "正在打开系统分享", paused: "传输已暂停，回到前台后重试", failed: "打开失败，可重试", unsupported: "系统不支持此格式的预览，可通过分享导出", cached: "原件已缓存，可离线打开", idle: "原件按需下载到本机" };
  return labels[message.attachmentState];
}

export function isOwnMessage(message: MobileMessage, senderName: string) {
  const name = String(senderName || "").trim();
  return message.sender === "我" || (!!name && message.sender === name);
}

function previewFixtures() {
  const now = Date.now();
  return [
    mapMessage({ filename: "preview-text", kind: "text", sender: "Jam", timestamp_ms: now, content: "移动端已经切到真实控制器；浏览器预览仍使用显式 fixture。", marked: true }),
    mapMessage({ filename: "preview-photo.jpg", kind: "file", sender: "Mac", timestamp_ms: now - 1500000, original_name: "IMG_3421.JPG", size: 2516582 }),
    mapMessage({ filename: "preview-plan.pdf", kind: "file", sender: "Mac", timestamp_ms: now - 4200000, original_name: "Transfer Genie 移动端方案.pdf", size: 1887436, marked: true }),
  ].sort(compareMessages);
}

function compareMessages(a: MobileMessage, b: MobileMessage) {
  return a.timestampMs - b.timestampMs || (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0);
}

export function useMobileController() {
  let viewGeneration = 0;
  let feedRead: Promise<void> = Promise.resolve();
  let searchGeneration = 0;
  let markedGeneration = 0;
  let toastTimer: number | undefined;
  const connectionRequestGeneration = new Map<string, number>();
  const state = reactive({
    previewMode,
    boot: "loading" as "loading" | "no-profile" | "choose-profile" | "signed-out" | "needs-space" | "ready" | "error",
    busy: false,
    error: "",
    toast: { id: 0, visible: false, message: "", tone: "success" as "success" | "info" | "error" },
    settings: null as any,
    profiles: [] as any[],
    connectionStates: {} as Record<string, "unknown" | "checking" | "ready" | "signed-out" | "network-error" | "needs-attention" | "disabled">,
    connectionEditor: { profileId: "", name: "", email: "", password: "", sending: false, error: "" },
    activeProfile: null as any,
    account: null as any,
    spaces: [] as any[],
    messages: [] as MobileMessage[],
    markedMessages: [] as MobileMessage[],
    pendingMarkedMessages: [] as MobileMessage[],
    markedTotal: 0,
    pendingMarkedTotal: 0,
    search: { query: "", messages: [] as MobileMessage[], offset: 0, hasMore: false, loading: false, error: "" },
    markedView: { pendingOnly: true, tagId: "", messages: [] as MobileMessage[], offset: 0, hasMore: false, loading: false, error: "" },
    tags: [] as any[],
    hasMoreBefore: false,
    loadingOlder: false,
    syncStatus: null as any,
    transfers: [] as any[],
    conflicts: [] as any[],
    appVersion: "",
    sender: { saving: false, error: "" },
    editorFormat: { saving: false },
    cache: { reclaimableBytes: 0, fileCount: 0, protectedTasks: 0, clearing: false },
    login: { email: "", password: "", sending: false },
    connectionWizard: {
      open: false, step: 1 as 1 | 2 | 3 | 4, mode: "create" as "create" | "repair", originalProfileId: "",
      apiUrl: "", anonKey: "", profileName: "我的 Supabase", email: "", password: "",
      flowId: "", tested: false, sending: false, generation: 0, account: null as any, spaces: [] as any[], selectedSpaceId: "",
      createOpen: false, createName: "", createOperationId: "", createSpaceId: "",
    },
    composer: {
      text: "",
      textClientId: `mobile-text-${crypto.randomUUID()}`,
      format: "text" as "text" | "markdown",
      marked: false,
      tagIds: [] as string[],
      dueDate: "",
      attachments: [] as DraftAttachment[],
      selecting: false,
      sending: false,
      savedLocally: false,
      persistenceReady: false,
      draftPersisted: false,
      draftStatus: "idle" as "idle" | "saving" | "saved" | "restored" | "error",
      draftUpdatedAt: 0,
      error: "",
    },
  });

  const currentSpace = computed(() => {
    const spaceId = state.activeProfile?.supabase?.space_id;
    return state.spaces.find((space) => space.id === spaceId || space.current) || null;
  });
  const selectableProfiles = computed(() => state.profiles.filter((profile: any) => {
    const bindingState = profile?.supabase?.binding_state || "bound";
    return profile.enabled !== false && bindingState === "bound" && !!profile?.supabase?.space_id;
  }));
  const pendingCount = computed(() => Number(state.syncStatus?.pending_count || state.syncStatus?.pendingCount || 0));
  const activeTransfers = computed(() => state.transfers.filter((item) => !["done", "complete", "completed", "saved", "sent", "success", "failed", "error", "cancelled"].includes(item.state)));
  const signedIn = computed(() => !!state.account?.signedIn);

  function dismissToast() {
    window.clearTimeout(toastTimer);
    toastTimer = undefined;
    state.toast.visible = false;
  }

  function showToast(message: string, tone: "success" | "info" | "error" = "success") {
    const normalized = message.trim();
    if (!normalized) return;
    window.clearTimeout(toastTimer);
    state.toast.id += 1;
    state.toast.message = normalized;
    state.toast.tone = tone;
    state.toast.visible = true;
    toastTimer = window.setTimeout(() => {
      state.toast.visible = false;
      toastTimer = undefined;
    }, tone === "error" ? 3200 : 2300);
  }

  function clearFeedback() {
    state.error = "";
    dismissToast();
  }

  function setError(error: unknown) {
    state.error = errorText(error);
    showToast(state.error, "error");
  }

  let draftWrite: Promise<boolean> = Promise.resolve(true);
  let draftSaveTimer: number | undefined;
  let restoringComposerDraft = false;
  let composerMutationVersion = 0;
  let persistedDraftFingerprint = "";

  function composerDraftPayload() {
    return {
      text: state.composer.text,
      textClientId: state.composer.textClientId,
      format: state.composer.format,
      marked: state.composer.marked,
      tagIds: [...state.composer.tagIds],
      dueDate: state.composer.dueDate || null,
      attachments: state.composer.attachments.map((attachment) => ({
        clientId: attachment.clientId,
        path: attachment.path,
        originalName: attachment.originalName,
        mediaType: attachment.mediaType,
        contentType: attachment.contentType || null,
        sizeBytes: attachment.sizeBytes,
      })),
    };
  }

  function composerDraftFingerprint() {
    return JSON.stringify({
      scope: [state.activeProfile?.id, state.account?.userId, state.activeProfile?.supabase?.space_id],
      payload: composerDraftPayload(),
    });
  }

  async function persistComposerDraft(force = false) {
    if (!state.composer.persistenceReady || (!force && (state.composer.sending || state.composer.selecting))) return false;
    if (force) window.clearTimeout(draftSaveTimer);
    const generation = viewGeneration;
    const mutationVersion = composerMutationVersion;
    const payload = composerDraftPayload();
    const fingerprint = composerDraftFingerprint();
    const scope = { profileId: state.activeProfile?.id, userId: state.account?.userId, spaceId: state.activeProfile?.supabase?.space_id };
    const write = async () => {
      if (generation !== viewGeneration || mutationVersion !== composerMutationVersion) return false;
      state.composer.draftPersisted = false;
      state.composer.draftStatus = "saving";
      try {
        if (previewMode) {
          state.composer.draftUpdatedAt = Date.now();
        } else {
          const result = await api().mobileDraft.save(payload, scope);
          if (generation !== viewGeneration || mutationVersion !== composerMutationVersion) return false;
          state.composer.draftUpdatedAt = Number(result?.updatedAtMs || 0);
        }
        const persisted = generation === viewGeneration && mutationVersion === composerMutationVersion;
        if (persisted) {
          persistedDraftFingerprint = fingerprint;
          state.composer.draftPersisted = composerDraftFingerprint() === fingerprint;
          state.composer.draftStatus = state.composer.draftUpdatedAt ? "saved" : "idle";
        }
        return persisted;
      } catch (error) {
        if (generation === viewGeneration) {
          state.composer.draftPersisted = false;
          state.composer.draftStatus = "error";
          state.composer.error = `草稿自动保存失败：${errorText(error)}`;
        }
        return false;
      }
    };
    draftWrite = draftWrite.then(write, write);
    return draftWrite;
  }

  async function persistComposerDraftForNavigation() {
    const snapshot = () => JSON.stringify({
      generation: viewGeneration,
      scope: [state.activeProfile?.id, state.account?.userId, state.activeProfile?.supabase?.space_id],
      payload: composerDraftPayload(),
    });
    const before = snapshot();
    return await persistComposerDraft(true) && snapshot() === before;
  }

  async function restoreComposerDraft() {
    const generation = viewGeneration;
    state.composer.persistenceReady = false;
    state.composer.draftPersisted = false;
    persistedDraftFingerprint = "";
    state.composer.draftStatus = "idle";
    state.composer.draftUpdatedAt = 0;
    if (previewMode) {
      state.composer.persistenceReady = true;
      persistedDraftFingerprint = composerDraftFingerprint();
      state.composer.draftPersisted = true;
      return;
    }
    try {
      const draft = await api().mobileDraft.get();
      if (generation !== viewGeneration) return;
      restoringComposerDraft = true;
      state.composer.text = String(draft?.text || "");
      state.composer.textClientId = String(draft?.textClientId || `mobile-text-${crypto.randomUUID()}`);
      const restored = hasRecoverableDraft(draft);
      state.composer.format = restored
        ? editorFormat(draft?.format)
        : editorFormat(state.settings?.default_editor_format);
      state.composer.marked = !!draft?.marked;
      state.composer.tagIds = Array.isArray(draft?.tagIds) ? [...draft.tagIds] : [];
      state.composer.dueDate = String(draft?.dueDate || "");
      state.composer.attachments = (Array.isArray(draft?.attachments) ? draft.attachments : []).map((item: any) => {
        const available = item?.available !== false;
        return {
          id: crypto.randomUUID(),
          clientId: String(item?.clientId || `mobile-${crypto.randomUUID()}`),
          path: String(item?.path || ""),
          originalName: String(item?.originalName || "附件"),
          mediaType: ["image", "video"].includes(item?.mediaType) ? item.mediaType : "file",
          contentType: item?.contentType || undefined,
          sizeBytes: Number(item?.sizeBytes || 0),
          available,
          previewState: available && ["image", "video"].includes(item?.mediaType) ? "loading" : available ? "unsupported" : "failed",
          previewError: available ? undefined : "原文件已不可用，请移除后重新选择",
          error: available ? undefined : "原文件已不可用，无法发送",
        } as DraftAttachment;
      });
      state.composer.draftUpdatedAt = Number(draft?.updatedAtMs || 0);
      state.composer.draftStatus = restored ? "restored" : "idle";
      state.composer.persistenceReady = true;
      persistedDraftFingerprint = composerDraftFingerprint();
      state.composer.draftPersisted = true;
      restoringComposerDraft = false;
      for (const attachment of state.composer.attachments) {
        if (attachment.available !== false && ["image", "video"].includes(attachment.mediaType)) void loadDraftAttachmentPreview(attachment);
      }
    } catch (error) {
      if (generation === viewGeneration) {
        restoringComposerDraft = false;
        // Do not overwrite an unreadable persisted draft with an empty editor.
        state.composer.persistenceReady = false;
        state.composer.draftPersisted = false;
        state.composer.draftStatus = "error";
        state.composer.error = `草稿恢复失败：${errorText(error)}`;
      }
    }
  }

  async function deactivateComposerPersistence() {
    window.clearTimeout(draftSaveTimer);
    state.composer.persistenceReady = false;
    state.composer.draftPersisted = false;
    persistedDraftFingerprint = "";
    composerMutationVersion += 1;
    await draftWrite;
  }

  watch(
    () => [
      state.composer.text,
      state.composer.format,
      state.composer.marked,
      state.composer.tagIds.join("\u0000"),
      state.composer.dueDate,
      state.composer.attachments.map((item) => `${item.clientId}\u0000${item.path}\u0000${item.available !== false}`).join("\u0001"),
    ],
    (_, previous) => {
      if (restoringComposerDraft) return;
      if (state.composer.persistenceReady && !state.composer.sending && previous) {
        const [previousText, previousFormat] = previous;
        if (state.composer.text !== previousText || state.composer.format !== previousFormat) {
          state.composer.textClientId = `mobile-text-${crypto.randomUUID()}`;
        }
      }
      state.composer.draftPersisted = composerDraftFingerprint() === persistedDraftFingerprint;
      if (!state.composer.persistenceReady || state.composer.sending || state.composer.selecting) return;
      if (state.composer.draftPersisted) return;
      window.clearTimeout(draftSaveTimer);
      state.composer.draftStatus = "idle";
      draftSaveTimer = window.setTimeout(() => void persistComposerDraft(), 350);
    },
    { flush: "sync" },
  );

  async function initialize() {
    window.clearTimeout(draftSaveTimer);
    state.composer.persistenceReady = false;
    state.composer.draftPersisted = false;
    persistedDraftFingerprint = "";
    composerMutationVersion += 1;
    viewGeneration += 1;
    const generation = viewGeneration;
    state.busy = false;
    state.login.sending = false;
    state.editorFormat.saving = false;
    searchGeneration += 1;
    markedGeneration += 1;
    Object.assign(state.search, { query: "", messages: [], offset: 0, hasMore: false, loading: false, error: "" });
    Object.assign(state.markedView, { pendingOnly: true, tagId: "", messages: [], offset: 0, hasMore: false, loading: false, error: "" });
    state.markedTotal = 0;
    state.pendingMarkedTotal = 0;
    state.hasMoreBefore = false;
    state.loadingOlder = false;
    state.messages = [];
    state.markedMessages = [];
    state.pendingMarkedMessages = [];
    state.transfers = [];
    state.conflicts = [];
    state.spaces = [];
    state.tags = [];
    state.syncStatus = null;
    state.account = null;
    state.activeProfile = null;
    state.connectionStates = {};
    state.composer.attachments = [];
    state.composer.text = "";
    state.composer.textClientId = `mobile-text-${crypto.randomUUID()}`;
    state.composer.format = "text";
    state.composer.marked = false;
    state.composer.tagIds = [];
    state.composer.dueDate = "";
    state.composer.selecting = false;
    state.composer.sending = false;
    state.composer.persistenceReady = false;
    state.composer.draftStatus = "idle";
    state.composer.draftUpdatedAt = 0;
    state.composer.error = "";
    clearFeedback();
    state.boot = "loading";
    if (previewMode) {
      state.settings = { sender_name: "Jam", active_storage_profile_id: "preview-profile", default_editor_format: "text" };
      state.activeProfile = { id: "preview-profile", name: "Personal", provider_kind: "supabase", enabled: true, supabase: { api_url: "https://preview.supabase.invalid", space_id: "preview-space", binding_state: "bound" } };
      state.profiles = [state.activeProfile];
      state.connectionStates = { "preview-profile": "ready" };
      state.account = { signedIn: true, email: "preview@example.com", userId: "preview-user" };
      state.spaces = [{ id: "preview-space", name: "Personal Space", current: true, messageCount: 3 }];
      state.messages = previewFixtures();
      state.markedMessages = state.messages.filter((item) => item.marked);
      state.pendingMarkedMessages = state.markedMessages;
      state.markedTotal = state.markedMessages.length;
      state.pendingMarkedTotal = state.pendingMarkedMessages.length;
      state.markedView.messages = state.pendingMarkedMessages;
      state.tags = [{ id: "work", name: "工作" }];
      state.syncStatus = { running: false, pending_count: 1, phase: "idle", last_run_ms: Date.now() };
      state.transfers = [{ id: "preview-upload", name: "产品录屏.mov", detail: "等待云端确认", progress: 64, state: "progress" }];
      state.appVersion = "preview";
      state.boot = "ready";
      state.composer.persistenceReady = true;
      persistedDraftFingerprint = composerDraftFingerprint();
      state.composer.draftPersisted = true;
      return;
    }

    try {
      const settings = await api().settings.getSettings();
      if (generation !== viewGeneration) return;
      state.settings = settings;
      state.profiles = (state.settings?.storage_profiles || []).filter((profile: any) => profile.provider_kind === "supabase");
      state.connectionStates = Object.fromEntries(state.profiles.map((profile: any) => {
        const bindingState = profile?.supabase?.binding_state || "bound";
        const status = profile.enabled === false
          ? "disabled"
          : bindingState !== "bound" || !profile?.supabase?.space_id
            ? "needs-attention"
            : "unknown";
        return [profile.id, status];
      }));
      if (!state.profiles.length) {
        state.connectionWizard.open = true;
        state.boot = "no-profile";
        return;
      }
      state.activeProfile = state.profiles.find((profile: any) => profile.id === state.settings?.active_storage_profile_id) || null;
      if (!state.activeProfile) {
        state.boot = "choose-profile";
        return;
      }
      const bindingState = state.activeProfile?.supabase?.binding_state || "bound";
      if (bindingState !== "bound" || !state.activeProfile?.supabase?.space_id) {
        state.connectionStates[state.activeProfile.id] = "needs-attention";
        state.boot = "needs-space";
        return;
      }
      state.connectionStates[state.activeProfile.id] = "checking";
      try {
        const account = await api().settings.supabaseCurrentUser(state.activeProfile.id);
        if (generation !== viewGeneration) return;
        state.account = account;
      } catch (error) {
        if (generation !== viewGeneration) return;
        state.connectionStates[state.activeProfile.id] = "network-error";
        throw error;
      }
      if (!state.account?.signedIn) {
        state.connectionStates[state.activeProfile.id] = "signed-out";
        state.boot = "signed-out";
        return;
      }
      const boundSpaceId = state.activeProfile?.supabase?.space_id;
      state.spaces = [{ id: boundSpaceId, name: state.activeProfile.name, current: true, messageCount: 0 }];
      state.connectionStates[state.activeProfile.id] = "ready";
      await restoreComposerDraft();
      if (generation !== viewGeneration) return;
      state.boot = "ready";
      const results = await Promise.allSettled([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers(), refreshCache(), loadAppVersion()]);
      if (generation !== viewGeneration) return;
      const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      if (failure) showToast(`部分本机状态暂时无法读取：${errorText(failure.reason)}`, "info");
    } catch (error) {
      if (generation !== viewGeneration) return;
      setError(error);
      state.boot = "error";
    }
  }

  async function loadAppVersion() {
    try { state.appVersion = await api().app.getAppVersion(); } catch { state.appVersion = ""; }
  }

  async function saveSenderName(value: string) {
    if (state.sender.saving || state.boot !== "ready") return false;
    const name = value.trim();
    state.sender.error = "";
    if (!name) { state.sender.error = "请输入发送者名称"; return false; }
    if (name === state.settings?.sender_name) return true;
    if (previewMode) {
      state.settings = { ...state.settings, sender_name: name };
      showToast("浏览器预览已更新名称，不会保存到本机", "info");
      return true;
    }
    const generation = viewGeneration;
    state.sender.saving = true;
    try {
      // Merge with a fresh snapshot rather than overwriting unrelated settings.
      const latest = await api().settings.getSettings();
      if (generation !== viewGeneration) return false;
      const saved = await api().settings.saveSettings({ ...latest, sender_name: name });
      if (generation !== viewGeneration) return false;
      state.settings = saved;
      showToast("发送者名称已保存");
      return true;
    } catch (error) {
      if (generation === viewGeneration) state.sender.error = errorText(error);
      return false;
    } finally { state.sender.saving = false; }
  }

  async function saveDefaultEditorFormat(value: "text" | "markdown") {
    if (state.editorFormat.saving || state.boot !== "ready") return false;
    const format = editorFormat(value);
    if (format === editorFormat(state.settings?.default_editor_format)) return true;
    if (previewMode) {
      state.settings = { ...state.settings, default_editor_format: format };
      showToast("浏览器预览已更新默认格式，不会保存到本机", "info");
      return true;
    }
    const generation = viewGeneration;
    state.editorFormat.saving = true;
    try {
      const latest = await api().settings.getSettings();
      if (generation !== viewGeneration) return false;
      const saved = await api().settings.saveSettings({ ...latest, default_editor_format: format });
      if (generation !== viewGeneration) return false;
      state.settings = saved;
      showToast(format === "markdown" ? "新消息默认使用 Markdown" : "新消息默认使用文本");
      return true;
    } catch (error) {
      if (generation === viewGeneration) showToast("默认格式保存失败：" + errorText(error), "error");
      return false;
    } finally {
      if (generation === viewGeneration) state.editorFormat.saving = false;
    }
  }

  function prepareNewComposer() {
    if (!state.composer.persistenceReady || state.composer.sending ||
        state.composer.draftStatus === "restored" || hasRecoverableDraft(state.composer)) return;
    state.composer.format = editorFormat(state.settings?.default_editor_format);
  }

  async function refreshCache() {
    if (previewMode || state.boot !== "ready") return;
    const generation = viewGeneration;
    const summary = await api().mobileCache.getSummary();
    if (generation === viewGeneration) Object.assign(state.cache, summary, { clearing: false });
  }

  async function clearCache() {
    if (previewMode || state.cache.clearing || state.busy || state.boot !== "ready") return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    state.cache.clearing = true;
    try {
      const before = state.cache.reclaimableBytes;
      const summary = await api().mobileCache.clear();
      if (generation !== viewGeneration) return false;
      Object.assign(state.cache, summary, { clearing: false });
      showToast(before > 0 ? `已释放 ${formatBytes(Number(summary.removedBytes || before))}，待上传文件均已保留` : "当前没有可清理的附件缓存", before > 0 ? "success" : "info");
      await refreshMessages();
      return true;
    } catch (error) { if (generation === viewGeneration) setError(error); return false; }
    finally { if (generation === viewGeneration) { state.cache.clearing = false; state.busy = false; } }
  }

  async function loadSpaces() {
    if (!state.activeProfile) return;
    const generation = viewGeneration;
    const spaces = await api().settings.listSupabaseSpaces(state.activeProfile.id);
    if (generation === viewGeneration) state.spaces = spaces;
  }

  async function refreshMessages() {
    const generation = viewGeneration;
    const read = async () => {
      if (generation !== viewGeneration) return;
      const previousMessages = state.messages;
      const oldest = previousMessages[0];
      let result = await api().message.listWindow({ limit: 50 });
      if (generation !== viewGeneration) return;
      let raws = result?.messages || [];
      // Re-read the loaded range so refresh preserves history and reflects deletions.
      while (oldest && result?.hasMoreBefore && raws.length) {
        const first = mapMessage(raws[0]);
        if (compareMessages(first, oldest) <= 0) break;
        result = await api().message.listWindow({ limit: 50, beforeTimestampMs: first.timestampMs, beforeFilename: first.filename });
        if (generation !== viewGeneration) return;
        const page = result?.messages || [];
        if (!page.length) break;
        raws = [...page, ...raws];
      }
      state.messages = raws.map((raw: any) => {
        const message = mapMessage(raw);
        const previous = previousMessages.find((item) => item.filename === message.filename);
        if (previous?.previewUrl) {
          message.previewUrl = previous.previewUrl;
          message.previewState = previous.previewState;
        }
        return message;
      }).sort(compareMessages);
      state.hasMoreBefore = !!result?.hasMoreBefore;
      void loadPassivePreviews(state.messages);
    };
    feedRead = feedRead.then(read, read);
    await feedRead;
    if (generation !== viewGeneration) return;
    if (state.search.query) await searchMessages(state.search.query);
  }

  async function searchMessages(query: string) {
    searchGeneration += 1;
    Object.assign(state.search, { query: query.trim(), messages: [], offset: 0, hasMore: false, loading: false, error: "" });
    if (state.search.query) await loadMoreSearch();
  }

  async function loadMoreSearch() {
    if (!state.search.query || state.search.loading) return;
    const generation = viewGeneration;
    const request = searchGeneration;
    const query = state.search.query;
    const offset = state.search.offset;
    state.search.loading = true;
    state.search.error = "";
    try {
      // The existing list_messages total is unfiltered; one extra row proves continuation.
      const result = previewMode
        ? { messages: state.messages.filter((message) => `${message.body || ""} ${message.originalName}`.toLowerCase().includes(query.toLowerCase())).slice(offset, offset + 51) }
        : await api().message.searchMessages({ searchQuery: query, limit: 51, offset, onlyMarked: false });
      if (generation !== viewGeneration || request !== searchGeneration) return;
      const rows = result?.messages || [];
      const page = previewMode ? rows.slice(0, 50) : rows.slice(0, 50).map(mapMessage);
      state.search.messages = [...new Map<string, MobileMessage>([...state.search.messages, ...page].map((message: MobileMessage) => [message.filename, message])).values()].sort(compareMessages);
      state.search.offset += Math.min(rows.length, 50);
      state.search.hasMore = rows.length > 50;
      void loadPassivePreviews(state.search.messages);
    } catch (error) {
      if (generation === viewGeneration && request === searchGeneration) state.search.error = errorText(error);
    } finally {
      if (generation === viewGeneration && request === searchGeneration) state.search.loading = false;
    }
  }

  async function loadOlderMessages() {
    const generation = viewGeneration;
    if (state.loadingOlder || !state.hasMoreBefore) return;
    state.loadingOlder = true;
    const read = async () => {
      if (generation !== viewGeneration) return;
      const first = state.messages[0];
      if (!first || !state.hasMoreBefore) return;
      const result = await api().message.listWindow({ limit: 50, beforeTimestampMs: first.timestampMs, beforeFilename: first.filename });
      if (generation !== viewGeneration) return;
      const older = (result?.messages || []).map(mapMessage);
      const merged = new Map<string, MobileMessage>([...older, ...state.messages].map((item) => [item.filename, item]));
      state.messages = [...merged.values()].sort(compareMessages);
      state.hasMoreBefore = !!result?.hasMoreBefore;
      void loadPassivePreviews(state.messages.filter((message) => older.some((item: MobileMessage) => item.filename === message.filename)));
    };
    try {
      feedRead = feedRead.then(read, read);
      await feedRead;
    } catch (error) { if (generation === viewGeneration) setError(error); }
    finally { if (generation === viewGeneration) state.loadingOlder = false; }
  }

  async function loadPassivePreviews(messages: MobileMessage[]) {
    if (!state.activeProfile) return;
    const generation = viewGeneration;
    const endpointId = state.activeProfile.id;
    await Promise.all(messages.filter((message) => message.kind === "image" || message.kind === "video").map(async (message) => {
      if (!message.previewUrl) message.previewState = "loading";
      try {
        const result = await api().message.getMediaPreview({ endpointId, filename: message.filename, originalName: message.originalName });
        if (generation !== viewGeneration) return;
        applyPreviewResult(message, result);
      } catch (error) {
        if (generation !== viewGeneration) return;
        if (!message.previewUrl) message.previewState = /network|connect|timeout|网络|连接|超时/i.test(errorText(error)) ? "offline" : "failed";
        message.previewError = errorText(error);
      }
    }));
  }

  function applyPreviewResult(message: MobileMessage, result: any) {
    if (result?.state === "ready" && result?.path) {
      message.previewUrl = api().path.convertFileSrc(result.path);
      message.previewState = "ready";
      message.previewError = undefined;
    } else if (!message.previewUrl) {
      message.previewState = /尚未生成|不存在/.test(result?.error || "") ? "missing" : result?.state || "failed";
      message.previewError = result?.error;
    }
  }

  async function retryPreview(message: MobileMessage) {
    if (previewMode || message.previewState === "loading") return;
    await loadPassivePreviews([message]);
  }

  function previewImageFailed(message: MobileMessage) {
    message.previewUrl = undefined;
    message.previewState = "failed";
    message.previewError = "预览图片无法显示，可以重试或打开原件";
  }

  async function refreshMarked() {
    const generation = viewGeneration;
    const request = ++markedGeneration;
    state.markedView.loading = true;
    try {
      const [all, pending] = await Promise.all([
        api().marked.getMarkedMessages({ tagId: null, searchQuery: null, limit: 100, offset: 0, pendingOnly: false }),
        api().marked.getMarkedMessages({ tagId: null, searchQuery: null, limit: 100, offset: 0, pendingOnly: true }),
      ]);
      if (generation !== viewGeneration || request !== markedGeneration) return;
      state.markedMessages = (all?.messages || []).map(mapMessage);
      state.pendingMarkedMessages = (pending?.messages || []).map(mapMessage);
      state.markedTotal = Number(all?.total ?? state.markedMessages.length);
      state.pendingMarkedTotal = Number(pending?.total ?? state.pendingMarkedMessages.length);
      const tags = await api().marked.listMarkedTags();
      if (generation !== viewGeneration || request !== markedGeneration) return;
      state.tags = tags;
      await readMarkedPage(request, generation, Math.max(100, state.markedView.offset), false);
    } catch (error) {
      if (generation === viewGeneration && request === markedGeneration) state.markedView.error = errorText(error);
    } finally {
      if (generation === viewGeneration && request === markedGeneration) state.markedView.loading = false;
    }
  }

  async function setMarkedFilter(pendingOnly: boolean, tagId: string) {
    const request = ++markedGeneration;
    Object.assign(state.markedView, { pendingOnly, tagId, messages: [], offset: 0, hasMore: false, loading: false, error: "" });
    await readMarkedPage(request, viewGeneration, 100, false);
  }

  async function loadMoreMarked() {
    if (state.markedView.loading || !state.markedView.hasMore) return;
    await readMarkedPage(markedGeneration, viewGeneration, 100, true);
  }

  async function readMarkedPage(request: number, generation: number, limit: number, append: boolean) {
    const view = state.markedView;
    const offset = append ? view.offset : 0;
    view.loading = true;
    view.error = "";
    try {
      const source = view.pendingOnly ? state.pendingMarkedMessages : state.markedMessages;
      const previewMatches = previewMode ? source.filter((message) => !view.tagId || message.tagIds.includes(view.tagId)) : [];
      const result = previewMode
        ? { messages: previewMatches.slice(offset, offset + limit), has_more: offset + limit < previewMatches.length }
        : await api().marked.getMarkedMessages({ tagId: view.tagId || null, searchQuery: null, limit, offset, pendingOnly: view.pendingOnly });
      if (generation !== viewGeneration || request !== markedGeneration) return;
      const rows = result?.messages || [];
      const page = previewMode ? rows : rows.map(mapMessage);
      view.messages = [...new Map<string, MobileMessage>([...(append ? view.messages : []), ...page].map((message: MobileMessage) => [message.filename, message])).values()];
      view.offset = offset + rows.length;
      view.hasMore = rows.length > 0 && !!result?.has_more;
      if (!previewMode) void loadPassivePreviews(view.messages);
    } catch (error) {
      if (generation === viewGeneration && request === markedGeneration) view.error = errorText(error);
    } finally {
      if (generation === viewGeneration && request === markedGeneration) view.loading = false;
    }
  }

  async function refreshStatus() {
    const generation = viewGeneration;
    const status = await api().sync.getSyncStatus();
    if (generation === viewGeneration) state.syncStatus = status;
  }

  async function loadConflicts() {
    if (previewMode || state.boot !== "ready") return;
    const generation = viewGeneration;
    const conflicts = await api().sync.listConflicts();
    if (generation === viewGeneration) state.conflicts = conflicts || [];
  }

  async function resolveConflict(conflict: any, resolution: "local" | "remote") {
    if (state.busy) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      await api().sync.resolveConflict(conflict.id, resolution);
      if (generation !== viewGeneration) return false;
      await Promise.all([loadConflicts(), refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers()]);
      if (generation !== viewGeneration) return false;
      showToast(resolution === "local" ? "已保留本机版本并重新同步" : "已采用云端版本");
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  function mapTransfer(record: any, direction: string) {
    const total = Number(record?.total || record?.file_size || record?.size || 0);
    const received = Number(record?.received || (record?.status === "complete" ? total : 0));
    const complete = ["complete", "completed", "saved", "sent", "success"].includes(record?.status);
    const labels: Record<string, string> = { pending: "等待云端确认", sending: "正在上传", paused: "已暂停，回到前台后重试", downloading: "正在下载", progress: "传输中", complete: "已完成", error: "失败，可重试" };
    return {
      id: `${direction}-${record?.id || record?.client_id || record?.filename}`,
      operationId: direction === "upload" ? record?.operationId || record?.operation_id || null : null,
      name: record?.original_name || record?.originalName || record?.filename || "附件",
      detail: record?.error || `${direction === "upload" ? "上传" : "下载"} · ${labels[record?.status] || record?.status || "等待"}`,
      progress: complete ? 100 : (total > 0 ? Math.min(99, Math.round(received / total * 100)) : 0),
      state: record?.status || "waiting",
    };
  }

  async function refreshTransfers() {
    const generation = viewGeneration;
    const [operations, downloads] = await Promise.all([api().sync.listPendingOperations(), api().transfer.listDownloadHistory({ limit: 30, offset: 0 })]);
    if (generation !== viewGeneration) return;
    const uploads = (operations || []).filter((item: any) => item.entityType === "attachment" && item.action === "upsert").map((item: any) => ({
      filename: item.entityId, originalName: item.originalName, size: item.size, operationId: item.operationId,
      status: item.state, error: item.lastError,
    }));
    const visibleDownloads = (downloads?.records || []).filter((item: any) => item?.status !== "cache_removed");
    state.transfers = [...uploads.map((item: any) => mapTransfer(item, "upload")), ...visibleDownloads.map((item: any) => mapTransfer(item, "download"))];
  }

  async function retryTransfer(item: any) {
    if (state.busy || !item?.operationId) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      await api().sync.retryPendingOperation(item.operationId);
      if (generation !== viewGeneration) return false;
      await Promise.all([refreshStatus(), refreshTransfers(), refreshMessages()]);
      if (generation !== viewGeneration) return false;
      showToast("已重新提交同步任务");
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function refreshRuntimeState() {
    if (previewMode || state.boot !== "ready") return;
    try { await Promise.all([refreshStatus(), refreshTransfers()]); } catch { /* Keep the last stable UI state. */ }
  }

  async function refreshAfterForeground() {
    if (previewMode || state.boot !== "ready") return;
    const generation = viewGeneration;
    try { await Promise.all([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers()]); }
    catch (error) { if (generation === viewGeneration) setError(error); }
  }

  async function refreshAll() {
    if (state.busy || state.boot !== "ready") return;
    const generation = viewGeneration;
    clearFeedback();
    state.busy = true;
    try {
      await api().sync.refresh();
      if (generation !== viewGeneration) return;
      await Promise.all([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers(), refreshCache(), loadSpaces()]);
    } catch (error) { if (generation === viewGeneration) setError(error); }
    finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function selectMedia() {
    if (state.boot !== "ready" || state.busy || state.composer.sending || state.composer.selecting) return;
    const generation = viewGeneration;
    state.composer.selecting = true;
    state.composer.error = "";
    clearFeedback();
    try {
      const result = await api().mobileIntegration.selectMedia(10);
      if (generation !== viewGeneration) return;
      for (const item of result?.items || []) {
        const attachment: DraftAttachment = {
          ...item,
          id: crypto.randomUUID(),
          clientId: `mobile-${crypto.randomUUID()}`,
          previewState: "loading",
          available: true,
        };
        state.composer.attachments.push(attachment);
        void loadDraftAttachmentPreview(attachment);
      }
      await persistComposerDraft(true);
    } catch (error) {
      if (generation === viewGeneration && !/cancel/i.test(errorText(error))) {
        state.composer.error = errorText(error);
        setError(error);
      }
    } finally { if (generation === viewGeneration) state.composer.selecting = false; }
  }

  async function selectDocuments() {
    if (state.boot !== "ready" || state.busy || state.composer.sending || state.composer.selecting) return;
    const generation = viewGeneration;
    state.composer.selecting = true;
    state.composer.error = "";
    clearFeedback();
    try {
      const result = await api().mobileIntegration.selectDocuments(true);
      if (generation !== viewGeneration) return;
      for (const item of result?.items || []) {
        state.composer.attachments.push({
          ...item,
          id: crypto.randomUUID(),
          clientId: `mobile-${crypto.randomUUID()}`,
          mediaType: "file",
          previewState: "unsupported",
          available: true,
        });
      }
      await persistComposerDraft(true);
    } catch (error) {
      if (generation === viewGeneration && !/cancel/i.test(errorText(error))) {
        state.composer.error = errorText(error);
        setError(error);
      }
    } finally { if (generation === viewGeneration) state.composer.selecting = false; }
  }

  async function previewDraftAttachment(id: string) {
    if (state.busy || state.composer.sending || state.composer.selecting) return;
    const attachment = state.composer.attachments.find((item) => item.id === id);
    if (!attachment) return;
    if (attachment.available === false) {
      attachment.error = "原文件已不可用，请移除后重新选择";
      return;
    }
    if (previewMode) { showToast("浏览器预览不调用 iOS 系统文件操作", "info"); return; }
    const generation = viewGeneration;
    state.busy = true;
    attachment.error = undefined;
    try {
      const result = await api().mobileIntegration.previewFile(attachment.path);
      if (generation === viewGeneration && result?.supported === false)
        attachment.error = "系统不支持此格式的预览，仍可发送原件";
    } catch (error) {
      if (generation === viewGeneration && !/cancel/i.test(errorText(error))) attachment.error = errorText(error);
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function loadDraftAttachmentPreview(attachment: DraftAttachment) {
    try {
      let result: any;
      if (attachment.mediaType === "image") {
        result = await api().mobileIntegration.generateImageThumbnail(attachment.path);
      } else if (attachment.mediaType === "video") {
        const requestId = `draft-${attachment.id}`;
        attachment.previewRequestId = requestId;
        result = await api().mobileIntegration.generateVideoPoster(requestId, attachment.path);
      } else {
        attachment.previewState = "unsupported";
        return;
      }
      const current = state.composer.attachments.find((item) => item.id === attachment.id);
      if (!current) return;
      current.previewUrl = api().path.convertFileSrc(result.path);
      current.previewState = "ready";
      current.previewError = undefined;
    } catch (error) {
      const current = state.composer.attachments.find((item) => item.id === attachment.id);
      if (!current) return;
      current.previewState = "failed";
      current.previewError = errorText(error);
    } finally {
      const current = state.composer.attachments.find((item) => item.id === attachment.id);
      if (current) current.previewRequestId = undefined;
    }
  }

  function removeAttachment(id: string) {
    if (state.composer.sending) return;
    const attachment = state.composer.attachments.find((item) => item.id === id);
    if (attachment?.previewRequestId) {
      void api().mobileIntegration.cancelVideoPoster(attachment.previewRequestId).catch(() => undefined);
    }
    state.composer.attachments = state.composer.attachments.filter((item) => item.id !== id);
    void persistComposerDraft();
  }

  async function sendDraft() {
    if (state.boot !== "ready" || state.busy || state.composer.sending || state.composer.selecting) return false;
    const generation = viewGeneration;
    const text = state.composer.text.trim();
    if (!text && !state.composer.attachments.length) return false;
    const missing = state.composer.attachments.filter((attachment) => attachment.available === false);
    if (missing.length) {
      state.composer.error = `${missing.length} 个草稿附件的原文件已不可用，请移除后重新选择`;
      return false;
    }
    state.composer.sending = true;
    if (!await persistComposerDraft(true)) {
      if (generation === viewGeneration) state.composer.sending = false;
      return false;
    }
    if (generation !== viewGeneration) return false;
    state.composer.savedLocally = false;
    state.composer.error = "";
    clearFeedback();
    let failed = false;
    let localSaveCount = 0;
    const markedOptions = {
      marked: state.composer.marked,
      selectedTagIds: state.composer.marked ? [...state.composer.tagIds] : [],
      dueDate: state.composer.marked ? state.composer.dueDate || null : null,
      createdTags: [],
      deletedTagIds: [],
    };
    try {
      if (text) {
        await api().message.sendText({ text, format: state.composer.format, markedOptions, clientId: state.composer.textClientId });
        if (generation !== viewGeneration) return false;
        localSaveCount += 1;
        state.composer.text = "";
        state.composer.textClientId = `mobile-text-${crypto.randomUUID()}`;
        if (!await persistComposerDraft(true)) return false;
      }
      const remaining: DraftAttachment[] = [];
      for (const attachment of state.composer.attachments) {
        if (generation !== viewGeneration) return false;
        try {
          await api().message.sendFile({ path: attachment.path, clientId: attachment.clientId, markedOptions });
          if (generation !== viewGeneration) return false;
          localSaveCount += 1;
        } catch (error) {
          if (generation !== viewGeneration) return false;
          failed = true;
          remaining.push({ ...attachment, error: errorText(error) });
        }
      }
      state.composer.attachments = remaining;
      if (!failed) {
        state.composer.marked = false;
        state.composer.tagIds = [];
        state.composer.dueDate = "";
      }
      state.composer.savedLocally = localSaveCount > 0;
      if (!await persistComposerDraft(true)) {
        showToast("内容已保存到本机，但草稿状态更新失败；请勿重启，稍后重试保存", "error");
        return false;
      }
      showToast(failed ? "部分内容未保存，请重试失败附件" : "已保存到本机，正在等待云端确认", failed ? "error" : "success");
      // The durable local commit and draft clear above are the send boundary.
      // Feed/status reads may wait on sync or transfer work, especially on a
      // physical iPhone, and must not keep a successfully committed composer
      // disabled or make the user retry the same message.
      void Promise.allSettled([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers()])
        .then((results) => {
          if (generation !== viewGeneration || failed) return;
          if (results.some((result) => result.status === "rejected")) {
            showToast("内容已保存到本机，部分状态将在稍后刷新", "info");
          }
        });
      return !failed;
    } catch (error) {
      if (generation !== viewGeneration) return false;
      state.composer.error = errorText(error);
      setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.composer.sending = false; }
  }

  async function toggleMark(message: MobileMessage) {
    if (state.busy || state.boot !== "ready" || state.composer.sending) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      if (message.marked) await api().message.unmark(message.filename);
      else await api().message.mark(message.filename, message.tagIds, message.dueDate || null);
      if (generation !== viewGeneration) return false;
      await Promise.all([refreshMessages(), refreshMarked(), refreshStatus()]);
      if (generation !== viewGeneration) return false;
      showToast(message.marked ? "已取消标记" : "已标记");
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function copyMessage(message: MobileMessage) {
    if (state.busy || state.boot !== "ready" || state.composer.sending) return false;
    const value = message.body || message.title || "";
    if (!value) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      await navigator.clipboard.writeText(value);
      if (generation !== viewGeneration) return false;
      showToast("已复制到剪贴板");
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function updateMarkedMetadata(message: MobileMessage, tagIds: string[], dueDate: string | null) {
    if (state.boot !== "ready" || state.busy || state.composer.sending) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      await api().message.mark(message.filename, tagIds, dueDate || null);
      if (generation !== viewGeneration) return false;
      await Promise.all([refreshMessages(), refreshMarked(), refreshStatus()]);
      if (generation !== viewGeneration) return false;
      showToast(message.marked ? "标记设置已保存" : "已标记");
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function createMarkedTag(name: string) {
    const normalized = name.trim();
    if (!normalized || state.busy) return null;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      const tag = await api().marked.createMarkedTag(normalized);
      if (generation !== viewGeneration) return null;
      // Creation is already committed; a failed read must not lose its stable ID.
      state.tags = [...state.tags.filter((item) => item.id !== tag.id), tag];
      try {
        const tags = await api().marked.listMarkedTags();
        if (generation !== viewGeneration) return null;
        state.tags = tags;
      } catch {
        if (generation !== viewGeneration) return null;
        showToast("标签已保存，列表暂未刷新；稍后刷新即可", "info");
      }
      return tag;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return null;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function deleteMessage(message: MobileMessage, deleteRemote: boolean) {
    if (state.busy || state.boot !== "ready" || state.composer.sending) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      const result = await api().message.deleteMessages([message.filename], deleteRemote);
      if (generation !== viewGeneration) return false;
      if (result?.failed?.length) throw new Error(result.failed.join("；"));
      if (result?.deleted !== 1) throw new Error("删除结果尚未确认，请刷新后重试");
      await Promise.all([refreshMessages(), refreshMarked(), refreshStatus()]);
      if (generation !== viewGeneration) return false;
      showToast(deleteRemote ? "消息已删除，云端变更等待同步" : "已移除本地附件缓存");
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function applyMessageSelection(messages: MobileMessage[], action: "mark" | "unmark" | "delete", metadata?: { tagIds: string[]; dueDate: string | null }) {
    if (state.busy || state.boot !== "ready" || !messages.length) return null;
    const generation = viewGeneration;
    const targets = [...new Map(messages.map((message) => [message.filename, message])).values()];
    const succeeded: string[] = [];
    const failed: string[] = [];
    state.busy = true;
    clearFeedback();
    try {
      if (action === "delete") {
        const result = await api().message.deleteMessages(targets.map((message) => message.filename), true);
        if (generation !== viewGeneration) return null;
        const failures = new Set<string>(result?.failed || []);
        if (result?.deleted !== targets.length - failures.size) throw new Error("删除结果尚未确认，请刷新后重试");
        for (const message of targets) (failures.has(message.filename) ? failed : succeeded).push(message.filename);
      } else {
        for (const message of targets) {
          if (generation !== viewGeneration) return null;
          try {
            if (action === "mark" && (metadata || !message.marked)) await api().message.mark(message.filename, metadata?.tagIds || message.tagIds, metadata ? metadata.dueDate : message.dueDate || null);
            if (action === "unmark" && message.marked) await api().message.unmark(message.filename);
            if (generation !== viewGeneration) return null;
            succeeded.push(message.filename);
          } catch (error) {
            if (generation !== viewGeneration) return null;
            failed.push(message.filename);
          }
        }
      }
      if (succeeded.length) showToast(`${succeeded.length} 条消息已${action === "delete" ? "删除" : action === "mark" ? "标记" : "取消标记"}`);
      if (failed.length) {
        state.error = `${failed.length} 条消息未完成，已保留选择，请重试`;
        showToast(state.error, "error");
      }
      try {
        await Promise.all([refreshMessages(), refreshMarked(), refreshStatus()]);
      } catch (error) {
        if (generation === viewGeneration) setError(error);
      }
      return generation === viewGeneration ? { succeeded, failed } : null;
    } catch (error) {
      if (generation !== viewGeneration) return null;
      setError(error);
      return { succeeded, failed: targets.map((message) => message.filename).filter((filename) => !succeeded.includes(filename)) };
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function downloadPath(message: MobileMessage, generation: number) {
    message.attachmentState = "downloading";
    const result = await api().message.downloadMessageFile(message.filename, message.originalName, "overwrite", state.activeProfile?.id || null);
    if (generation !== viewGeneration) throw new Error("账号或空间已切换，本次文件操作已取消");
    if (result?.status === "conflict") throw new Error("本地已有同名文件，请先处理文件冲突");
    if (!result?.path) throw new Error("附件下载未返回本地路径");
    message.cached = true;
    message.attachmentState = "cached";
    return result.path;
  }

  async function previewMessage(message: MobileMessage) {
    if (state.busy || message.kind === "text") return;
    clearFeedback();
    if (previewMode) { showToast("浏览器预览不调用 iOS 系统文件操作", "info"); return; }
    const generation = viewGeneration;
    message.attachmentError = undefined;
    state.busy = true;
    try {
      const path = await downloadPath(message, generation);
      if (message.kind === "image" || message.kind === "video") {
        try {
          const preview = await api().message.completeMediaPreview({ endpointId: state.activeProfile.id, filename: message.filename, originalName: message.originalName });
          if (generation !== viewGeneration) return;
          applyPreviewResult(message, preview);
        } catch (error) {
          if (generation !== viewGeneration) return;
          if (!message.previewUrl) message.previewState = "failed";
          message.previewError = errorText(error);
        }
      }
      message.attachmentState = "previewing";
      const result = await api().mobileIntegration.previewFile(path);
      if (generation !== viewGeneration) return;
      message.attachmentState = result?.supported === false ? "unsupported" : "cached";
    } catch (error) {
      if (generation === viewGeneration) {
        message.attachmentState = /暂停/.test(errorText(error)) ? "paused" : "failed";
        message.attachmentError = errorText(error);
        setError(error);
      }
    } finally { if (generation === viewGeneration) { state.busy = false; void refreshRuntimeState(); } }
  }

  async function prepareVideo(message: MobileMessage): Promise<string | null> {
    if (state.busy || message.kind !== "video") return null;
    if (previewMode) { showToast("浏览器预览不下载视频原件", "info"); return null; }
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    message.attachmentError = undefined;
    try {
      const path = await downloadPath(message, generation);
      // An explicit play may repair a historical poster; it must not delay playback.
      if (!message.previewUrl) void api().message.completeMediaPreview({ endpointId: state.activeProfile.id, filename: message.filename, originalName: message.originalName })
        .then((result: any) => { if (generation === viewGeneration) applyPreviewResult(message, result); })
        .catch(() => {});
      return api().path.convertFileSrc(path);
    } catch (error) {
      if (generation === viewGeneration) {
        message.attachmentState = /暂停/.test(errorText(error)) ? "paused" : "failed";
        message.attachmentError = errorText(error);
      }
      return null;
    } finally { if (generation === viewGeneration) { state.busy = false; void refreshRuntimeState(); } }
  }

  async function shareMessage(message: MobileMessage) {
    if (state.busy || message.kind === "text") return;
    clearFeedback();
    if (previewMode) { showToast("浏览器预览不调用 iOS 系统文件操作", "info"); return; }
    const generation = viewGeneration;
    message.attachmentError = undefined;
    state.busy = true;
    try {
      const path = await downloadPath(message, generation);
      message.attachmentState = "sharing";
      await api().mobileIntegration.shareFile(path);
      if (generation === viewGeneration) message.attachmentState = "cached";
    } catch (error) {
      if (generation === viewGeneration) {
        if (/cancel/i.test(errorText(error))) message.attachmentState = message.cached ? "cached" : "idle";
        else {
          message.attachmentState = /暂停/.test(errorText(error)) ? "paused" : "failed";
          message.attachmentError = errorText(error);
          setError(error);
        }
      }
    } finally { if (generation === viewGeneration) { state.busy = false; void refreshRuntimeState(); } }
  }

  async function signIn() {
    if (!state.activeProfile || state.login.sending) return;
    const generation = viewGeneration;
    const profileId = state.activeProfile.id;
    state.login.sending = true;
    clearFeedback();
    try {
      const account = await api().settings.supabaseSignIn({ profileId, email: state.login.email.trim(), password: state.login.password });
      if (generation !== viewGeneration || state.activeProfile?.id !== profileId) return;
      state.account = account;
      state.login.password = "";
      await initialize();
    } catch (error) { if (generation === viewGeneration) setError(error); }
    finally { if (generation === viewGeneration) state.login.sending = false; }
  }

  async function chooseProfile(profile: any) {
    if (profile?.enabled === false || profile?.supabase?.binding_state === "needs_attention" || profile?.supabase?.binding_state === "unbound" || !profile?.supabase?.space_id) return;
    if (state.composer.sending || state.composer.selecting || state.sender.saving) {
      showToast("请等待发送、文件选择或名称保存结束后再切换连接", "info");
      return;
    }
    if (state.busy) return;
    state.busy = true;
    clearFeedback();
    try {
      if (state.boot === "ready" && !await persistComposerDraft(true)) return;
      state.settings = await api().settings.activateStorageProfile(profile.id);
      await initialize();
    } catch (error) { setError(error); } finally { state.busy = false; }
  }

  function connectionFingerprint(profile: any) {
    return [
      profile?.supabase?.api_url?.trim().replace(/\/+$/, "") || "",
      profile?.supabase?.anon_key?.trim() || "",
      profile?.supabase?.space_id?.trim() || "",
      profile?.enabled === false ? "disabled" : "enabled",
    ].join("\u0000");
  }

  async function diagnoseProfile(profile: any) {
    if (!profile?.id || profile.provider_kind !== "supabase") return false;
    const request = (connectionRequestGeneration.get(profile.id) || 0) + 1;
    const fingerprint = connectionFingerprint(profile);
    connectionRequestGeneration.set(profile.id, request);
    state.connectionStates[profile.id] = "checking";
    try {
      const result = await api().settings.testSupabaseConnection(profile.id);
      const current = state.profiles.find((candidate: any) => candidate.id === profile.id);
      if (connectionRequestGeneration.get(profile.id) !== request
        || !current || connectionFingerprint(current) !== fingerprint) return false;
      if (result?.network === false) state.connectionStates[profile.id] = "network-error";
      else if (result?.auth === false) state.connectionStates[profile.id] = "signed-out";
      else if (result?.errorCode || result?.error_code || result?.schema === false || result?.rpc === false || result?.rls === false)
        state.connectionStates[profile.id] = "needs-attention";
      else state.connectionStates[profile.id] = "ready";
      return state.connectionStates[profile.id] === "ready";
    } catch (error) {
      const current = state.profiles.find((candidate: any) => candidate.id === profile.id);
      if (connectionRequestGeneration.get(profile.id) === request
        && current && connectionFingerprint(current) === fingerprint) {
        const message = errorText(error);
        state.connectionStates[profile.id] = /session.?revoked|invalid.?credentials|会话.*失效|请.*登录/i.test(message)
          ? "signed-out"
          : /网络|network|offline|连接/i.test(message)
            ? "network-error"
            : "needs-attention";
      }
      return false;
    }
  }

  async function setProfileEnabled(profile: any, enabled: boolean) {
    if (!profile?.id || state.busy || state.composer.sending || state.composer.selecting || state.sender.saving) return false;
    state.busy = true;
    clearFeedback();
    try {
      if (!enabled && state.activeProfile?.id === profile.id && state.boot === "ready" && !await persistComposerDraft(true)) return false;
      state.settings = await api().settings.setStorageProfileEnabled(profile.id, enabled);
      connectionRequestGeneration.set(profile.id, (connectionRequestGeneration.get(profile.id) || 0) + 1);
      await initialize();
      return true;
    } catch (error) { setError(error); return false; }
    finally { state.busy = false; }
  }

  function beginConnectionEdit(profile: any) {
    Object.assign(state.connectionEditor, { profileId: profile?.id || "", name: profile?.name || "", email: "", password: "", sending: false, error: "" });
  }

  async function renameProfile(name: string) {
    const profileId = state.connectionEditor.profileId;
    const nextName = name.trim();
    if (!profileId || !nextName || state.connectionEditor.sending) return false;
    state.connectionEditor.sending = true; state.connectionEditor.error = "";
    try {
      const latest = await api().settings.getSettings();
      const profile = (latest?.storage_profiles || []).find((candidate: any) => candidate.id === profileId && candidate.provider_kind === "supabase");
      if (!profile) throw new Error("连接已不存在，请关闭后重新打开");
      state.settings = await api().settings.saveStorageProfile({ originalProfileId: profileId, profile: { ...profile, name: nextName } });
      await initialize();
      return true;
    } catch (error) { state.connectionEditor.error = errorText(error); return false; }
    finally { state.connectionEditor.sending = false; }
  }

  async function signInProfile(profile: any, email: string, password: string) {
    if (!profile?.id || !email.trim() || !password || state.connectionEditor.sending) return false;
    const generation = viewGeneration;
    state.connectionEditor.sending = true; state.connectionEditor.error = "";
    try {
      await api().settings.supabaseSignIn({ profileId: profile.id, email: email.trim(), password });
      if (generation !== viewGeneration || !state.profiles.some((candidate: any) => candidate.id === profile.id)) return false;
      state.connectionStates[profile.id] = "ready"; state.connectionEditor.password = "";
      if (state.activeProfile?.id === profile.id) await initialize();
      return true;
    } catch (error) { if (generation === viewGeneration) state.connectionEditor.error = errorText(error); return false; }
    finally { if (generation === viewGeneration) state.connectionEditor.sending = false; }
  }

  async function logoutProfile(profile: any) {
    if (!profile?.id || state.connectionEditor.sending) return false;
    state.connectionEditor.sending = true; state.connectionEditor.error = "";
    try {
      if (state.activeProfile?.id === profile.id && state.boot === "ready" && !await persistComposerDraft(true)) return false;
      await api().settings.supabaseLogout(profile.id);
      state.connectionStates[profile.id] = "signed-out";
      if (state.activeProfile?.id === profile.id) await initialize();
      return true;
    } catch (error) { state.connectionEditor.error = errorText(error); return false; }
    finally { state.connectionEditor.sending = false; }
  }

  async function removeProfile(profile: any, options: { confirmActiveRemoval?: boolean; abandonWork?: boolean } = {}) {
    if (!profile?.id || state.connectionEditor.sending) return false;
    state.connectionEditor.sending = true; state.connectionEditor.error = "";
    try {
      if (state.activeProfile?.id === profile.id && state.boot === "ready" && !await persistComposerDraft(true)) return false;
      state.settings = await api().settings.removeStorageProfile(profile.id, options);
      connectionRequestGeneration.set(profile.id, (connectionRequestGeneration.get(profile.id) || 0) + 1);
      await initialize();
      return true;
    } catch (error) { state.connectionEditor.error = errorText(error); return false; }
    finally { state.connectionEditor.sending = false; }
  }

  async function logout() {
    if (!state.activeProfile || state.busy || state.composer.sending || state.composer.selecting || state.sender.saving) return;
    state.busy = true;
    clearFeedback();
    try { if (!await persistComposerDraft(true)) return; await api().settings.supabaseLogout(state.activeProfile.id); await initialize(); }
    catch (error) { setError(error); } finally { state.busy = false; }
  }

  async function switchSpace(space: any) {
    if (!state.activeProfile || space.current || state.busy || state.composer.sending || state.composer.selecting || state.sender.saving) return;
    state.busy = true;
    clearFeedback();
    try { if (!await persistComposerDraft(true)) return; await api().settings.switchSupabaseSpace({ sourceProfileId: state.activeProfile.id, spaceId: space.id }); await initialize(); }
    catch (error) { setError(error); } finally { state.busy = false; }
  }

  async function testSetupConnection() {
    const wizard = state.connectionWizard;
    const generation = ++wizard.generation;
    const fingerprint = `${wizard.apiUrl.trim().replace(/\/+$/, "")}\u0000${wizard.anonKey.trim()}`;
    wizard.sending = true;
    clearFeedback();
    try {
      await api().settings.testSupabaseDraftConnection({ profileId: null, apiUrl: wizard.apiUrl, anonKey: wizard.anonKey });
      if (generation !== wizard.generation || fingerprint !== `${wizard.apiUrl.trim().replace(/\/+$/, "")}\u0000${wizard.anonKey.trim()}`) return false;
      wizard.tested = true; wizard.step = 2; showToast("连接可用，请继续登录账号"); return true;
    } catch (error) { if (generation === wizard.generation) setError(error); return false; }
    finally { if (generation === wizard.generation) wizard.sending = false; }
  }

  async function setupSignIn() {
    const wizard = state.connectionWizard;
    const generation = ++wizard.generation;
    wizard.sending = true;
    clearFeedback();
    try {
      const result = await api().settings.supabaseDraftSignIn({ flowId: wizard.flowId || null, apiUrl: wizard.apiUrl, anonKey: wizard.anonKey, email: wizard.email, password: wizard.password });
      const flowId = result.profileId;
      if (generation !== wizard.generation) {
        await api().settings.cancelSupabaseBindingFlow(flowId).catch(() => {});
        return false;
      }
      wizard.flowId = flowId;
      const spaces = await api().settings.listSupabaseDraftSpaces(flowId);
      if (generation !== wizard.generation) return false;
      wizard.flowId = flowId; wizard.account = result; wizard.spaces = spaces; wizard.password = ""; wizard.step = 3; return true;
    } catch (error) { if (generation === wizard.generation) setError(error); return false; }
    finally { if (generation === wizard.generation) wizard.sending = false; }
  }

  async function completeSetup(space: any, activate = true) {
    const wizard = state.connectionWizard;
    const generation = ++wizard.generation;
    state.busy = true;
    clearFeedback();
    try {
      const profileId = `supabase-${crypto.randomUUID()}`;
      const updated = await api().settings.completeSupabaseBinding({
        flowId: wizard.flowId,
        originalProfileId: wizard.originalProfileId || null,
        spaceId: space.id,
        profile: { id: profileId, name: wizard.profileName.trim() || space.name, provider_kind: "supabase", enabled: true, supabase: { api_url: wizard.apiUrl.trim(), anon_key: wizard.anonKey.trim(), space_id: space.id, binding_state: "bound" } },
      });
      if (generation !== wizard.generation) return false;
      const savedProfile = (updated.storage_profiles || []).find((item: any) => item.provider_kind === "supabase" && item.supabase?.space_id === space.id && item.supabase?.api_url?.replace(/\/+$/, "") === wizard.apiUrl.trim().replace(/\/+$/, ""));
      if (!savedProfile) throw new Error("绑定未返回存储空间配置，请重试");

      // Completing the binding consumes the temporary flow. From this point on the
      // saved profile is authoritative, even when the optional activation fails.
      Object.assign(wizard, { open: false, flowId: "", password: "", account: null, spaces: [], selectedSpaceId: "", sending: false });
      state.settings = updated;

      if (activate) {
        try {
          await api().settings.activateStorageProfile(savedProfile.id);
        } catch (error) {
          await initialize();
          state.error = "";
          showToast(`连接“${savedProfile.name}”已保存，但未切换。可稍后从连接卡片重试。${errorText(error) ? ` 原因：${errorText(error)}` : ""}`, "info");
          return true;
        }
      }

      await initialize();
      showToast(activate
        ? `已保存并切换到连接“${savedProfile.name}”`
        : `已保存连接“${savedProfile.name}”，当前连接未切换`);
      return true;
    } catch (error) { if (generation === wizard.generation) setError(error); return false; } finally { state.busy = false; }
  }

  function resetWizardDownstream() {
    const wizard = state.connectionWizard;
    const staleFlowId = wizard.flowId;
    wizard.generation += 1; wizard.tested = false; wizard.step = 1; wizard.flowId = ""; wizard.account = null; wizard.spaces = []; wizard.selectedSpaceId = ""; wizard.password = ""; wizard.sending = false; wizard.createOpen = false; wizard.createName = ""; wizard.createOperationId = ""; wizard.createSpaceId = "";
    if (!previewMode && staleFlowId) void api().settings.cancelSupabaseBindingFlow(staleFlowId).catch(() => undefined);
  }

  function openConnectionWizard() {
    resetWizardDownstream();
    Object.assign(state.connectionWizard, { open: true, mode: "create", originalProfileId: "", apiUrl: "", anonKey: "", profileName: "我的 Supabase", email: "" });
    clearFeedback();
  }

  function openConnectionRepair(profile: any) {
    resetWizardDownstream();
    Object.assign(state.connectionWizard, {
      open: true, mode: "repair", originalProfileId: profile?.id || "",
      apiUrl: profile?.supabase?.api_url || "", anonKey: profile?.supabase?.anon_key || "",
      profileName: profile?.name || "Supabase", email: "",
    });
    clearFeedback();
  }

  async function cancelConnectionWizard() {
    const wizard = state.connectionWizard;
    const flowId = wizard.flowId;
    wizard.generation += 1; wizard.open = false; wizard.flowId = ""; wizard.password = ""; wizard.account = null; wizard.spaces = []; wizard.selectedSpaceId = ""; wizard.sending = false;
    if (!previewMode && flowId) { try { await api().settings.cancelSupabaseBindingFlow(flowId); } catch { /* Expiry is the backend fallback. */ } }
  }

  function selectWizardSpace(space: any) {
    const wizard = state.connectionWizard;
    if (!space?.id || wizard.sending) return;
    wizard.selectedSpaceId = space.id; wizard.step = 4;
  }

  function backConnectionWizard() {
    const wizard = state.connectionWizard;
    if (wizard.sending) return;
    if (wizard.step === 4) { wizard.step = 3; wizard.selectedSpaceId = ""; return; }
    if (wizard.step === 3) { wizard.step = 2; wizard.spaces = []; wizard.selectedSpaceId = ""; return; }
    if (wizard.step === 2) resetWizardDownstream();
  }

  async function createWizardSpace() {
    const wizard = state.connectionWizard;
    const name = wizard.createName.trim();
    if (!wizard.flowId || !name || wizard.sending) return false;
    if (!wizard.createOperationId) wizard.createOperationId = crypto.randomUUID();
    if (!wizard.createSpaceId) wizard.createSpaceId = crypto.randomUUID();
    const generation = wizard.generation;
    wizard.sending = true; clearFeedback();
    try {
      const space = await api().settings.createSupabaseSpace({ flowId: wizard.flowId, profileId: null, operationId: wizard.createOperationId, spaceId: wizard.createSpaceId, name });
      if (generation !== wizard.generation) return false;
      wizard.spaces = [...wizard.spaces.filter((item: any) => item.id !== space.id), space];
      wizard.createOpen = false; wizard.createName = ""; wizard.createOperationId = ""; wizard.createSpaceId = "";
      wizard.selectedSpaceId = space.id; wizard.step = 4;
      showToast("Space 已在服务端创建；取消向导不会自动删除它", "info");
      return true;
    } catch (error) { if (generation === wizard.generation) setError(error); return false; }
    finally { if (generation === wizard.generation) wizard.sending = false; }
  }

  async function installTransferListeners() {
    if (previewMode) return () => {};
    let disposed = false;
    let feedQueued = false;
    let feedRefreshing = false;
    const refreshFeed = async () => {
      if (disposed || state.boot !== "ready") return;
      feedQueued = true;
      if (feedRefreshing) return;
      feedRefreshing = true;
      try {
        while (feedQueued && !disposed && state.boot === "ready") {
          feedQueued = false;
          await refreshAfterForeground();
        }
      } finally { feedRefreshing = false; }
    };
    let reading = false;
    const unlisteners = await Promise.all(["upload-progress", "download-progress"].map((eventName) => api().event.listen(eventName, async () => {
      if (reading || state.boot !== "ready") return;
      // Progress events carry no Auth user; use them only as hints to read scoped durable state.
      reading = true;
      try { await refreshRuntimeState(); } finally { reading = false; }
    })));
    unlisteners.push(await api().event.listen("supabase-realtime-synced", refreshFeed));
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => { if (typeof unlisten === "function") unlisten(); });
    };
  }

  return {
    state, currentSpace, selectableProfiles, pendingCount, activeTransfers, signedIn, initialize, refreshAll, refreshRuntimeState, refreshAfterForeground, refreshMessages, loadOlderMessages, searchMessages, loadMoreSearch, setMarkedFilter, loadMoreMarked, loadConflicts, resolveConflict, retryTransfer,
    selectMedia, selectDocuments, removeAttachment, sendDraft, prepareNewComposer, persistComposerDraft, persistComposerDraftForNavigation, deactivateComposerPersistence, toggleMark, copyMessage, updateMarkedMetadata, createMarkedTag, deleteMessage, applyMessageSelection, previewMessage, prepareVideo, shareMessage, retryPreview, previewImageFailed, previewDraftAttachment,
    signIn, logout, chooseProfile, diagnoseProfile, setProfileEnabled, beginConnectionEdit, renameProfile, signInProfile, logoutProfile, removeProfile, loadSpaces, switchSpace, testSetupConnection, setupSignIn, completeSetup, resetWizardDownstream, openConnectionWizard, openConnectionRepair, cancelConnectionWizard, selectWizardSpace, backConnectionWizard, createWizardSpace, installTransferListeners, refreshCache, clearCache, clearFeedback, showToast, dismissToast, saveSenderName, saveDefaultEditorFormat,
  };
}
