<script setup lang="ts">
defineProps<{ pageCount: number; label: string; unit: '项' | '条'; total?: number }>();
const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
</script>

<template>
  <nav class="settings-pagination" :aria-label="label + '分页'">
    <span class="page-status" role="status"><template v-if="total !== undefined">共 {{ total }} {{ unit }} · </template>第 {{ page }} / {{ pageCount }} 页</span>
    <div class="page-controls">
      <label class="page-size">
        <span>每页</span>
        <select v-model.number="pageSize" :aria-label="'每页' + label + '数量'">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
        <span>{{ unit }}</span>
      </label>
      <div class="page-buttons">
        <button type="button" :disabled="page <= 1" @click="page--">上一页</button>
        <button type="button" :disabled="page >= pageCount" @click="page++">下一页</button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.settings-pagination, .page-controls, .page-size, .page-buttons {
  display: flex;
  align-items: center;
}
.settings-pagination {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 12px;
}
.page-controls { flex-wrap: wrap; justify-content: flex-end; gap: 8px 14px; margin-inline-start: auto; }
.page-size { flex-direction: row; gap: 6px; font-size: inherit; }
.page-status, .page-size, .page-buttons { white-space: nowrap; }
.page-buttons { gap: 6px; }
.settings-pagination :is(select, button) {
  min-height: 30px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.settings-pagination button:hover:not(:disabled) { border-color: var(--accent); }
.settings-pagination button:disabled { opacity: .45; cursor: default; }
.settings-pagination :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
