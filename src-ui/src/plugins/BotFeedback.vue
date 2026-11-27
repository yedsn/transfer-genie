<script setup lang="ts">
import { computed } from 'vue';
import '../utils/format.js';
import { botFeedback, botReplies, feedbackByMessage } from './plugin-store';
import BotMessageIcon from './BotMessageIcon.vue';

const props = defineProps<{ filename: string; visibleFiles: Set<string>; tag?: 'li' | 'aside'; mobile?: boolean }>();
const rows = computed(() => (feedbackByMessage.value.get(props.filename) ?? [])
  .filter(task => {
    const reply = botReplies.value.get(task.task_id);
    return !reply || !props.visibleFiles.has(reply.filename);
  })
  .map(task => ({ id: task.task_id, ...botFeedback(task) })));
const { formatBytes, formatPercent } = (window as any).transferGenieFormat;
</script>

<template>
  <component :is="tag || 'aside'" v-for="row in rows" :key="row.id" class="bot-feedback" :class="{ 'mobile-message-card is-bot': mobile }" :data-status="row.status">
    <div class="bot-feedback-header" :class="{ 'mobile-message-header': mobile }">
      <span><BotMessageIcon :download="row.download" />{{ row.name }}<template v-if="row.device"> · {{ row.device }}</template></span>
    </div>
    <div class="bot-feedback-bubble" :class="{ 'has-transfers': row.transfers.length, 'mobile-message-bubble': mobile }">
      <div role="status">
        <strong>{{ row.title }}</strong>
        <p v-if="row.detail">{{ row.detail }}</p>
      </div>
      <div v-for="file in row.transfers" :key="file.id" class="bot-transfer">
        <div class="bot-transfer-heading">
          <span class="bot-transfer-name" :title="file.name">{{ file.name }}</span>
          <span v-if="file.speed !== null">{{ formatBytes(file.speed) }}/s</span>
        </div>
        <progress :aria-label="file.name + ' 的下载进度'" :value="file.total ? Math.min(file.received, file.total) : undefined" :max="file.total ?? undefined"></progress>
        <div class="bot-transfer-meta">
          <span>{{ formatBytes(file.received) }}<template v-if="file.total"> / {{ formatBytes(file.total) }}</template></span>
          <span v-if="file.total">{{ formatPercent(file.received, file.total) }}</span>
        </div>
      </div>
    </div>
  </component>
</template>

<style scoped>
:global(.legacy-bot-feedback-target) { display: contents; }
.bot-feedback { align-self: flex-start; max-width: 100%; min-width: 0; margin: 0; padding-inline: 8px; list-style: none; text-align: start; }
.bot-feedback-header { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; color: var(--muted); font-size: 11px; }
.bot-feedback-bubble { width: fit-content; max-width: 100%; padding: 8px 11px; border-radius: 7px; background: var(--panel-soft, #f3f3f3); color: var(--ink); font-size: 12px; overflow-wrap: anywhere; }
.bot-feedback-bubble strong { font-weight: 600; }
.bot-feedback-bubble p { margin: 3px 0 0; color: var(--muted); font-size: inherit; line-height: 1.5; white-space: pre-wrap; }
.bot-feedback:is([data-status=running], [data-status=progress]) strong { color: var(--accent-strong); }
.bot-feedback-bubble.has-transfers { width: min(300px, calc(100vw - 52px)); }
.bot-transfer { margin-top: 8px; }
.bot-transfer-heading, .bot-transfer-meta { display: flex; justify-content: space-between; gap: 8px; font-variant-numeric: tabular-nums; }
.bot-transfer-heading > span, .bot-transfer-meta > span { white-space: nowrap; }
.bot-transfer-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bot-transfer progress { display: block; width: 100%; height: 5px; margin: 5px 0; accent-color: var(--accent-strong); }
.bot-transfer-meta { color: var(--muted); font-size: 11px; }
.bot-feedback.mobile-message-card { align-self: stretch; padding-inline: 6px; }
.bot-feedback .mobile-message-header { margin: 0; font-size: calc(10px * var(--mobile-text-scale, 1)); }
.bot-feedback .mobile-message-bubble {
  max-width: 88%; padding: 11px 13px; border-radius: 4px 16px 16px 16px;
  background: var(--bubble-background); font-size: calc(13px * var(--mobile-text-scale, 1));
}
.bot-feedback .mobile-message-bubble.has-transfers { width: min(300px, 88%); }
.bot-feedback .mobile-message-bubble p, .bot-feedback .mobile-message-bubble .bot-transfer-meta { color: var(--mobile-muted); }
.mobile-message-bubble .bot-transfer-meta { font-size: calc(11px * var(--mobile-text-scale, 1)); flex-wrap: wrap; }
.mobile-message-bubble .bot-transfer progress { height: 5px; accent-color: var(--mobile-green); }
.bot-feedback:is([data-status=running], [data-status=progress]) .mobile-message-bubble strong { color: var(--mobile-green); }
</style>
