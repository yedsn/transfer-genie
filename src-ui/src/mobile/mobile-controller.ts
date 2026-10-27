import { computed, reactive } from "vue";

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
}

const previewMode = new URLSearchParams(window.location.search).get("mobile-preview") === "1";
const api = () => (window as any).transferGenieApi as MobileApi;

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
  const state = reactive({
    previewMode,
    boot: "loading" as "loading" | "no-profile" | "choose-profile" | "signed-out" | "needs-space" | "ready" | "error",
    busy: false,
    error: "",
    notice: "",
    settings: null as any,
    profiles: [] as any[],
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
    cache: { reclaimableBytes: 0, fileCount: 0, protectedTasks: 0, clearing: false },
    login: { email: "", password: "", sending: false },
    setup: { apiUrl: "", anonKey: "", profileName: "我的 Supabase", email: "", password: "", flowId: "", tested: false, sending: false },
    composer: {
      text: "",
      format: "text",
      marked: false,
      attachments: [] as DraftAttachment[],
      sending: false,
      savedLocally: false,
      error: "",
    },
  });

  const currentSpace = computed(() => {
    const spaceId = state.activeProfile?.supabase?.space_id;
    return state.spaces.find((space) => space.id === spaceId || space.current) || null;
  });
  const pendingCount = computed(() => Number(state.syncStatus?.pending_count || state.syncStatus?.pendingCount || 0));
  const activeTransfers = computed(() => state.transfers.filter((item) => !["done", "complete", "completed", "saved", "sent", "success", "failed", "error", "cancelled"].includes(item.state)));
  const signedIn = computed(() => !!state.account?.signedIn);

  function clearFeedback() {
    state.error = "";
    state.notice = "";
  }

  function setError(error: unknown) {
    state.error = errorText(error);
    state.notice = "";
  }

  async function initialize() {
    viewGeneration += 1;
    state.busy = false;
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
    state.composer.attachments = [];
    state.composer.text = "";
    clearFeedback();
    state.boot = "loading";
    if (previewMode) {
      state.settings = { sender_name: "Jam" };
      state.activeProfile = { id: "preview-profile", name: "Personal", provider_kind: "supabase", supabase: { space_id: "preview-space" } };
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
      return;
    }

    try {
      state.settings = await api().settings.getSettings();
      state.profiles = (state.settings?.storage_profiles || []).filter((profile: any) => profile.provider_kind === "supabase" && profile.enabled !== false);
      if (!state.profiles.length) {
        state.boot = "no-profile";
        return;
      }
      state.activeProfile = state.profiles.find((profile: any) => profile.id === state.settings?.active_storage_profile_id) || null;
      if (!state.activeProfile) {
        state.boot = "choose-profile";
        return;
      }
      state.account = await api().settings.supabaseCurrentUser(state.activeProfile.id);
      if (!state.account?.signedIn) {
        state.boot = "signed-out";
        return;
      }
      const boundSpaceId = state.activeProfile?.supabase?.space_id;
      try {
        await loadSpaces();
      } catch (error) {
        if (!boundSpaceId) throw error;
        state.spaces = [{ id: boundSpaceId, name: state.activeProfile.name, current: true, messageCount: 0 }];
        state.notice = "当前离线或无法读取空间列表，继续显示本机数据";
      }
      if (!boundSpaceId) {
        state.boot = "needs-space";
        return;
      }
      state.boot = "ready";
      const results = await Promise.allSettled([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers(), refreshCache(), loadAppVersion()]);
      const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      if (failure) state.notice = state.notice || `部分本机状态暂时无法读取：${errorText(failure.reason)}`;
    } catch (error) {
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
      state.notice = "浏览器预览已更新名称，不会保存到本机";
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
      state.notice = "发送者名称已保存，之后发送的消息使用新名称";
      return true;
    } catch (error) {
      if (generation === viewGeneration) state.sender.error = errorText(error);
      return false;
    } finally { state.sender.saving = false; }
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
      state.notice = before > 0 ? `已释放 ${formatBytes(Number(summary.removedBytes || before))}，待上传文件均已保留` : "当前没有可清理的附件缓存";
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
      void loadPassivePreviews(page);
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
      void loadPassivePreviews(older);
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
      state.notice = resolution === "local" ? "已保留本机版本并重新同步" : "已采用云端版本";
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
      state.notice = "已重新提交同步任务";
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
    try { await Promise.all([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers()]); }
    catch (error) { setError(error); }
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
    if (state.composer.sending) return;
    const generation = viewGeneration;
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
        };
        state.composer.attachments.push(attachment);
        void loadDraftAttachmentPreview(attachment);
      }
    } catch (error) {
      if (generation === viewGeneration && !/cancel/i.test(errorText(error))) {
        state.composer.error = errorText(error);
        setError(error);
      }
    }
  }

  async function selectDocuments() {
    if (state.composer.sending) return;
    const generation = viewGeneration;
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
        });
      }
    } catch (error) {
      if (generation === viewGeneration && !/cancel/i.test(errorText(error))) {
        state.composer.error = errorText(error);
        setError(error);
      }
    }
  }

  async function previewDraftAttachment(id: string) {
    if (state.busy || state.composer.sending) return;
    const attachment = state.composer.attachments.find((item) => item.id === id);
    if (!attachment) return;
    if (previewMode) { state.notice = "浏览器预览不调用 iOS 系统文件操作"; return; }
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
  }

  async function sendDraft() {
    if (state.composer.sending) return false;
    const generation = viewGeneration;
    const text = state.composer.text.trim();
    if (!text && !state.composer.attachments.length) return false;
    state.composer.sending = true;
    state.composer.savedLocally = false;
    state.composer.error = "";
    clearFeedback();
    let failed = false;
    let localSaveCount = 0;
    const markedOptions = { marked: state.composer.marked, selectedTagIds: [], dueDate: null, createdTags: [], deletedTagIds: [] };
    try {
      if (text) {
        await api().message.sendText({ text, format: state.composer.format, markedOptions });
        if (generation !== viewGeneration) return false;
        localSaveCount += 1;
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
      if (text && localSaveCount > 0) state.composer.text = "";
      state.composer.attachments = remaining;
      state.composer.savedLocally = localSaveCount > 0;
      state.notice = failed ? "部分内容未保存，请重试失败附件" : "已保存到本机，正在等待云端确认";
      await Promise.all([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers()]);
      return !failed;
    } catch (error) {
      if (generation !== viewGeneration) return false;
      state.composer.error = errorText(error);
      setError(error);
      return false;
    } finally { state.composer.sending = false; }
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
      state.notice = "标记变更已保存到本机，云端变更等待同步";
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
      state.notice = "已复制";
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function updateMarkedMetadata(message: MobileMessage, tagIds: string[], dueDate: string | null) {
    if (!message.marked || state.busy) return false;
    const generation = viewGeneration;
    state.busy = true;
    clearFeedback();
    try {
      await api().message.mark(message.filename, tagIds, dueDate || null);
      if (generation !== viewGeneration) return false;
      await Promise.all([refreshMessages(), refreshMarked(), refreshStatus()]);
      if (generation !== viewGeneration) return false;
      state.notice = "标记信息已保存，等待云端确认";
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
      const tags = await api().marked.listMarkedTags();
      if (generation !== viewGeneration) return null;
      state.tags = tags;
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
      state.notice = deleteRemote ? "删除已保存到本机，云端删除等待同步" : "已移除本地附件缓存";
      return true;
    } catch (error) {
      if (generation === viewGeneration) setError(error);
      return false;
    } finally { if (generation === viewGeneration) state.busy = false; }
  }

  async function applyMessageSelection(messages: MobileMessage[], action: "mark" | "unmark" | "delete") {
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
            if (action === "mark" && !message.marked) await api().message.mark(message.filename, message.tagIds, message.dueDate || null);
            if (action === "unmark" && message.marked) await api().message.unmark(message.filename);
            if (generation !== viewGeneration) return null;
            succeeded.push(message.filename);
          } catch (error) {
            if (generation !== viewGeneration) return null;
            failed.push(message.filename);
          }
        }
      }
      state.notice = `${succeeded.length} 条消息已${action === "delete" ? "删除" : action === "mark" ? "标记" : "取消标记"}，云端变更等待同步`;
      if (failed.length) state.error = `${failed.length} 条消息未完成，已保留选择，请重试`;
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
    if (previewMode) { state.notice = "浏览器预览不调用 iOS 系统文件操作"; return; }
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

  async function shareMessage(message: MobileMessage) {
    if (state.busy || message.kind === "text") return;
    clearFeedback();
    if (previewMode) { state.notice = "浏览器预览不调用 iOS 系统文件操作"; return; }
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
    if (!state.activeProfile) return;
    state.login.sending = true;
    clearFeedback();
    try {
      state.account = await api().settings.supabaseSignIn({ profileId: state.activeProfile.id, email: state.login.email.trim(), password: state.login.password });
      state.login.password = "";
      await initialize();
    } catch (error) { setError(error); } finally { state.login.sending = false; }
  }

  async function chooseProfile(profile: any) {
    if (state.busy || state.composer.sending || state.sender.saving) return;
    state.busy = true;
    clearFeedback();
    try {
      state.settings = await api().settings.saveSettings({ ...state.settings, active_storage_profile_id: profile.id });
      await initialize();
    } catch (error) { setError(error); } finally { state.busy = false; }
  }

  async function logout() {
    if (!state.activeProfile || state.busy || state.composer.sending || state.sender.saving) return;
    state.busy = true;
    clearFeedback();
    try { await api().settings.supabaseLogout(state.activeProfile.id); await initialize(); }
    catch (error) { setError(error); } finally { state.busy = false; }
  }

  async function switchSpace(space: any) {
    if (!state.activeProfile || space.current || state.busy || state.composer.sending || state.sender.saving) return;
    state.busy = true;
    clearFeedback();
    try { await api().settings.switchSupabaseSpace({ sourceProfileId: state.activeProfile.id, spaceId: space.id }); await initialize(); }
    catch (error) { setError(error); } finally { state.busy = false; }
  }

  async function testSetupConnection() {
    state.setup.sending = true;
    clearFeedback();
    try { await api().settings.testSupabaseDraftConnection({ profileId: null, apiUrl: state.setup.apiUrl, anonKey: state.setup.anonKey }); state.setup.tested = true; state.notice = "连接可用，请继续登录账号"; }
    catch (error) { setError(error); } finally { state.setup.sending = false; }
  }

  async function setupSignIn() {
    state.setup.sending = true;
    clearFeedback();
    try {
      const result = await api().settings.supabaseDraftSignIn({ flowId: state.setup.flowId || null, apiUrl: state.setup.apiUrl, anonKey: state.setup.anonKey, email: state.setup.email, password: state.setup.password });
      state.setup.flowId = result.profileId;
      state.account = result;
      state.spaces = await api().settings.listSupabaseDraftSpaces(state.setup.flowId);
      state.setup.password = "";
      state.boot = "needs-space";
    } catch (error) { setError(error); } finally { state.setup.sending = false; }
  }

  async function completeSetup(space: any) {
    state.busy = true;
    clearFeedback();
    try {
      const profileId = `supabase-${crypto.randomUUID()}`;
      const updated = await api().settings.completeSupabaseBinding({
        flowId: state.setup.flowId,
        originalProfileId: null,
        spaceId: space.id,
        profile: { id: profileId, name: state.setup.profileName.trim() || space.name, provider_kind: "supabase", enabled: true, supabase: { api_url: state.setup.apiUrl.trim(), anon_key: state.setup.anonKey.trim(), space_id: space.id } },
      });
      const savedProfile = (updated.storage_profiles || []).find((item: any) => item.provider_kind === "supabase" && item.supabase?.space_id === space.id && item.supabase?.api_url?.replace(/\/+$/, "") === state.setup.apiUrl.trim().replace(/\/+$/, ""));
      if (!savedProfile) throw new Error("绑定未返回存储空间配置，请重试");
      await api().settings.saveSettings({ ...updated, active_storage_profile_id: savedProfile.id });
      state.setup.flowId = "";
      await initialize();
    } catch (error) { setError(error); } finally { state.busy = false; }
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
    state, currentSpace, pendingCount, activeTransfers, signedIn, initialize, refreshAll, refreshRuntimeState, refreshAfterForeground, refreshMessages, loadOlderMessages, searchMessages, loadMoreSearch, setMarkedFilter, loadMoreMarked, loadConflicts, resolveConflict, retryTransfer,
    selectMedia, selectDocuments, removeAttachment, sendDraft, toggleMark, copyMessage, updateMarkedMetadata, createMarkedTag, deleteMessage, applyMessageSelection, previewMessage, shareMessage, retryPreview, previewImageFailed, previewDraftAttachment,
    signIn, logout, chooseProfile, loadSpaces, switchSpace, testSetupConnection, setupSignIn, completeSetup, installTransferListeners, refreshCache, clearCache, clearFeedback, saveSenderName,
  };
}
