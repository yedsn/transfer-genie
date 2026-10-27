<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import MobileText from "./MobileText.vue";

defineProps<{ text: string; format?: string }>();
const viewport = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const truncated = ref(false);
let observer: ResizeObserver | undefined;

function measure() {
  truncated.value = !!viewport.value && !!content.value
    && content.value.getBoundingClientRect().height > viewport.value.clientHeight + 1;
}
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (viewport.value) observer.observe(viewport.value);
  if (content.value) observer.observe(content.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="mobile-marked-excerpt" :class="{ 'is-truncated': truncated }">
    <div ref="viewport" class="mobile-marked-excerpt-viewport">
      <div ref="content" class="mobile-marked-excerpt-content">
        <MobileText :text="text" :format="format" />
      </div>
    </div>
    <span v-if="truncated" class="mobile-marked-read-more">查看全文<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7" /></svg></span>
  </div>
</template>
