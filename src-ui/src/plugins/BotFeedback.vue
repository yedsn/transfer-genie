<script setup lang="ts">
import { computed } from 'vue';
import '../utils/format.js';
import { botFeedback, botReplies, feedbackByMessage } from './plugin-store';

const props = defineProps<{ filename: string; visibleFiles: Set<string>; tag?: 'li' | 'aside' }>();
const rows = computed(() => (feedbackByMessage.value.get(props.filename) ?? [])
  .filter(task => {
    const reply = botReplies.value.get(task.task_id);
    return !reply || !props.visibleFiles.has(reply.filename);
  })
  .map(task => ({ id: task.task_id, ...botFeedback(task) })));
const { formatBytes, formatPercent } = (window as any).transferGenieFormat;
</script>

<template>
  <component :is="tag || 'aside'" v-for="row in rows" :key="row.id" class="bot-feedback" :data-status="row.status">
    <div class="bot-feedback-header">
      <img v-if="row.download" :src="'icons/download.svg'" alt="" />
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 7V3m-2 0h4M8 12h1m6 0h1m-7 5h6"/></svg>
      <span>{{ row.name }}<template v-if="row.device"> · {{ row.device }}</template></span>
    </div>
    <div class="bot-feedback-bubble" :class="{ 'has-transfers': row.transfers.length }">
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
.bot-feedback-header img, .bot-feedback-header svg { width: 14px; height: 14px; flex: none; }
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
</style>
