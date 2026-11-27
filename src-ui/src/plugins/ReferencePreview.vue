<script setup lang="ts">
import { computed, ref } from 'vue';
import { isBotReplyContext, pluginState } from './plugin-store';
import { locateQuotedMessage } from './reference-navigation';
import BotMessageIcon from './BotMessageIcon.vue';
const props=defineProps<{filename:string;identityOnly?:boolean;referencesOnly?:boolean}>();
const context = computed(() => pluginState.contexts.find(c => c.filename === props.filename));
const references = computed(() => context.value?.references || []);
const notice=ref('');
async function locate(filename:string){
  notice.value='正在定位原消息…';
  try {
    notice.value=await locateQuotedMessage(filename)?'':'原消息已删除或当前不可用，仍可查看引用摘要';
  }catch{notice.value='暂时无法加载原消息，请稍后重试';}
}
</script>
<template>
  <BotMessageIcon v-if="!props.referencesOnly && isBotReplyContext(context)" :download="context.bot_icon === 'download'" />
  <div v-if="references.length && !props.identityOnly" class="reference-preview">
    <button v-for="reference in references" :key="reference.filename" type="button" @pointerdown.stop @click.stop="locate(reference.filename)">
      <strong>{{ reference.sender || '引用消息' }}</strong>
      <span>{{ reference.kind === 'image' ? '[图片] ' : reference.kind === 'text' ? '' : '[文件] ' }}{{ reference.content?.slice(0,100) || reference.original_name }}</span>
    </button>
    <small v-if="notice" role="status">{{ notice }}</small>
  </div>
</template>
