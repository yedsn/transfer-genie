<script setup lang="ts">
import { computed, ref } from 'vue';
import { pluginState } from './plugin-store';
import { locateQuotedMessage } from './reference-navigation';
const props=defineProps<{filename:string;identityOnly?:boolean;referencesOnly?:boolean}>();
const references=computed(()=>pluginState.contexts.find(c=>c.filename===props.filename)?.references||[]);
const isBotReply=computed(()=>{const context=pluginState.contexts.find(c=>c.filename===props.filename);return !!context?.task_id && !context?.target_bot_instance_id && typeof context?.text==='string';});
const notice=ref('');
async function locate(filename:string){
  notice.value='正在定位原消息…';
  try {
    notice.value=await locateQuotedMessage(filename)?'':'原消息已删除或当前不可用，仍可查看引用摘要';
  }catch{notice.value='暂时无法加载原消息，请稍后重试';}
}
</script>
<template><span v-if="isBotReply && !props.referencesOnly" class="bot-message-identity" role="img" aria-label="机器人" title="机器人"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M11 3a1 1 0 0 1 2 0v3h4a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4h4V3ZM8.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM9 16a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H9Z" clip-rule="evenodd"/><rect x="0" y="10" width="2" height="7" rx="1"/><rect x="22" y="10" width="2" height="7" rx="1"/></svg></span><div v-if="references.length && !props.identityOnly" class="reference-preview"><button v-for="reference in references" :key="reference.filename" type="button" @click.stop="locate(reference.filename)"><strong>{{ reference.sender || '引用消息' }}</strong><span>{{ reference.kind==='image'?'[图片] ':reference.kind==='text'?'':'[文件] ' }}{{ reference.content?.slice(0,100) || reference.original_name }}</span></button><small v-if="notice" role="status">{{ notice }}</small></div></template>
