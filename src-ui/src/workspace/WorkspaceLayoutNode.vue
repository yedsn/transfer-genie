<script setup lang="ts">
import type { ComposerLayoutNode } from "./composer-store";

defineProps<{ node: ComposerLayoutNode }>();
</script>

<template>
  <div
    v-if="node.type === 'split'"
    class="cw-layout-node cw-layout-split"
    :class="'is-' + node.direction"
    :data-layout-direction="node.direction"
  >
    <WorkspaceLayoutNode v-for="(child, index) in node.children" :key="child.type === 'pane' ? child.paneId : index" :node="child">
      <template #pane="{ paneId }">
        <slot name="pane" :pane-id="paneId"></slot>
      </template>
    </WorkspaceLayoutNode>
  </div>
  <slot v-else name="pane" :pane-id="node.paneId"></slot>
</template>
