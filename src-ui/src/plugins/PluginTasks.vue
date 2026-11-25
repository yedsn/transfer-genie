<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { pluginState as state, pluginAction } from './plugin-store';
const props=defineProps<{pluginId:string}>();
const page=ref(1);
const error=ref('');
const tasks=computed(()=>{
  const instances=new Set(state.plugins.filter(p=>p.manifest.id===props.pluginId).map(p=>p.instance_id));
  state.bots.filter(bot=>bot.plugin_id===props.pluginId).forEach(bot=>instances.add(bot.instance_id));
  return state.tasks.filter(task=>instances.has(task.target_instance_id)).slice().sort((a,b)=>b.created_at_ms-a.created_at_ms);
});
const pages=computed(()=>Math.max(1,Math.ceil(tasks.value.length/10)));
watch(pages,value=>{page.value=Math.min(page.value,value);});
const visible=computed(()=>tasks.value.slice((page.value-1)*10,page.value*10));
function label(value:string){return ({waiting_device:'等待设备',queued:'排队中',running:'执行中',progress:'执行中',cancel_requested:'正在取消',succeeded:'已完成',partial_failed:'部分失败',failed:'失败',cancelled:'已取消',expired:'已过期',interrupted:'执行中断'} as Record<string,string>)[value] || value;}
function events(id:string){return state.events.filter(event=>event.task_id===id).slice().sort((a,b)=>b.timestamp_ms-a.timestamp_ms);}
async function action(name:string,id:string){error.value='';try{await pluginAction(name,{taskId:id});}catch(e){error.value=String(e);}}
</script>
<template>
  <section class="plugin-task-panel" aria-label="机器人任务">
    <header><h4>机器人任务 <small>{{ tasks.length }}</small></h4><span>当前存储空间</span></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!tasks.length" class="task-empty">暂无任务，在聊天中 @ 此机器人即可发起。</p>
    <article v-for="task in visible" :key="task.task_id" class="plugin-task-row">
      <div class="task-heading"><strong>{{ label(task.status) }}</strong><time>{{ new Date(task.created_at_ms).toLocaleString() }}</time></div>
      <p>{{ task.text || '处理引用的消息' }}</p>
      <div class="task-actions"><button v-if="task.can_cancel" type="button" :disabled="state.busy" @click="action('cancel_bot_task',task.task_id)">取消任务</button><button v-if="task.can_retry" type="button" :disabled="state.busy" @click="action('retry_bot_task',task.task_id)">{{ task.status==='interrupted'?'已核实，重新执行':'重试失败项' }}</button></div>
      <details v-if="events(task.task_id).length"><summary>查看进度与结果</summary><div v-for="event in events(task.task_id)" :key="event.event_id" class="task-event"><small>{{ label(event.kind) }}</small><p v-if="event.payload?.error">{{ event.payload.error }}</p><p v-for="item in event.payload?.items || (event.payload?.item ? [event.payload.item] : [])" :key="item.item_id">{{ item.name }} · {{ label(item.status) }} <span>{{ item.error || item.saved_path }}</span></p></div></details>
    </article>
    <footer v-if="pages>1"><button type="button" :disabled="page===1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button type="button" :disabled="page===pages" @click="page++">下一页</button></footer>
  </section>
</template>
<style scoped>
.plugin-task-panel{margin-top:18px;border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}.plugin-task-panel header,.task-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.plugin-task-panel header{padding:16px}.plugin-task-panel h4{margin:0;font-size:14px}.plugin-task-panel header span,.plugin-task-panel small,.task-heading time{font-size:11px;color:var(--muted)}.plugin-task-row{padding:16px;border-top:1px solid var(--border)}.task-heading strong{font-size:12px;font-weight:500}.plugin-task-row p{font-size:13px;line-height:1.6;overflow-wrap:anywhere;margin:10px 0}.task-actions{display:flex;gap:8px}.plugin-task-panel button{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:6px 10px;color:var(--ink);cursor:pointer}.plugin-task-panel button:disabled{opacity:.4;cursor:default}.task-empty{padding:8px 16px 20px;color:var(--muted);font-size:12px}.plugin-task-row details{margin-top:12px;font-size:12px;color:var(--muted)}.task-event{padding:10px 0;border-bottom:1px solid var(--border)}.task-event span{display:block}.plugin-task-panel footer{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:12px;font-size:12px}
</style>
