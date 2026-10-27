<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const props = defineProps<{ text: string; format?: string }>();
const html = computed(() => DOMPurify.sanitize(marked.parse(props.text, { async: false, gfm: true, breaks: true }), {
  ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "blockquote", "ul", "ol", "li", "pre", "code", "a", "hr", "table", "thead", "tbody", "tr", "th", "td"],
  ALLOWED_ATTR: ["href", "title", "start"],
}));
async function openLink(event: Event) {
  const link = event.target instanceof Element ? event.target.closest('a') : null;
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  const href = link.getAttribute('href') || '';
  if (!/^https?:\/\//i.test(href)) return;
  try {
    await (window as any).transferGenieApi?.settings?.openUrl(href);
  } catch {
    // Keep the app in place if the system browser cannot open the link.
  }
}
</script>

<template>
  <div v-if="format === 'markdown'" class="mobile-markdown" @click="openLink" v-html="html"></div>
  <p v-else class="mobile-plain-text">{{ text }}</p>
</template>
