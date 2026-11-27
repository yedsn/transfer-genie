<script setup lang="ts">
defineProps<{ download?: boolean }>();
</script>

<template>
  <span class="bot-message-identity" role="img" aria-label="机器人" title="机器人">
    <svg v-if="download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M11 3a1 1 0 0 1 2 0v3h4a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4h4V3ZM8.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM9 16a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H9Z" clip-rule="evenodd" />
      <rect x="0" y="10" width="2" height="7" rx="1" />
      <rect x="22" y="10" width="2" height="7" rx="1" />
    </svg>
  </span>
</template>
