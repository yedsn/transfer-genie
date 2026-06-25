<script setup lang="ts">
import { useTransferGenieStore } from "./store";

const store = useTransferGenieStore();
</script>

<template>
  <div class="app-vue3-shell" :data-active-tab="store.state.activeTab"></div>
</template>