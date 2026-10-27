<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ limit: number }>();
const emit = defineEmits<{ beforeToggle: [element: HTMLElement]; afterToggle: [] }>();
const root = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const expanded = ref(false);
const overflowing = ref(false);
let observer: ResizeObserver | undefined;

function measure() {
  overflowing.value = !!content.value && content.value.getBoundingClientRect().height > props.limit + 4;
}
async function toggle() {
  if (!root.value) return;
  emit("beforeToggle", root.value);
  expanded.value = !expanded.value;
  await nextTick();
  emit("afterToggle");
}
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (content.value) observer.observe(content.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="mobile-bubble-body" :class="{ 'is-collapsed': !expanded, 'is-overflowing': overflowing }" :style="{ '--mobile-collapse-height': `${limit}px` }">
    <div class="mobile-bubble-viewport">
      <div ref="content" class="mobile-bubble-content"><slot /></div>
    </div>
    <button v-if="overflowing" type="button" class="mobile-message-expand" :aria-expanded="expanded" @pointerdown.stop @click.stop="toggle">
      {{ expanded ? "收起" : "展开更多" }}<span aria-hidden="true">{{ expanded ? "⌃" : "⌄" }}</span>
    </button>
  </div>
</template>
