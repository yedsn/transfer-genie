<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { pluginState as state, pluginAction, refreshPlugins } from './plugin-store';
import PluginTasks from './PluginTasks.vue';
const marketUrl = ref('');
const active = ref('installed');
const props = defineProps<{pluginId?:string}>();
const selectedPlugins = computed(() => state.plugins.filter(plugin => plugin.manifest.id === props.pluginId));
const editingPlugin = ref('');
function openSettings(id:string) {
  const plugin = state.plugins.find(plugin => plugin.manifest.id===id);
  if (plugin?.enabled) document.querySelector<HTMLElement>('[data-settings-nav-target="settings-plugin-'+id+'"]')?.click();
  else editingPlugin.value=id;
}
const search = ref('');
const page = ref(1);
const pageSize = ref(10);
const installedEntries = computed(() => [
  ...state.modules.map(module=>({id:module.id,name:module.displayName || module.id,module,plugin:null as any})),
  ...state.plugins.map(plugin=>({id:plugin.manifest.id,name:plugin.manifest.name,module:null as any,plugin})),
]);
const filteredEntries = computed(() => installedEntries.value.filter(entry => (entry.name+' '+entry.id+' '+(entry.plugin?.source_kind==='external'?'外置':'内置')).toLowerCase().includes(search.value.trim().toLowerCase())));
const filteredMarket = computed(() => state.market.filter(plugin=>(plugin.name+' '+plugin.id+' '+(plugin.description || '')).toLowerCase().includes(search.value.trim().toLowerCase())));
const total = computed(()=>active.value==='installed'?filteredEntries.value.length:filteredMarket.value.length);
const pageCount = computed(()=>Math.max(1,Math.ceil(total.value/pageSize.value)));
const pageEntries = computed(()=>filteredEntries.value.slice((page.value-1)*pageSize.value,page.value*pageSize.value));
const marketEntries = computed(()=>filteredMarket.value.slice((page.value-1)*pageSize.value,page.value*pageSize.value));
watch([search,active,pageSize],()=>{page.value=1;});
watch(pageCount,value=>{page.value=Math.min(page.value,value);});
watch(()=>state.plugins.map(plugin=>plugin.manifest.id+':'+plugin.enabled).join(','),async()=>{
  if (editingPlugin.value && !state.plugins.some(plugin=>plugin.manifest.id===editingPlugin.value && !plugin.enabled)) editingPlugin.value='';
  if (props.pluginId && !state.plugins.some(plugin=>plugin.manifest.id===props.pluginId && plugin.enabled)) {
    await nextTick(); document.querySelector<HTMLElement>('[data-settings-nav-target="settings-section-plugins"]')?.click();
  }
});
const marketNotice = ref('');
const downloads = ref<Record<string, { bytes: number; total: number }>>({});
let disposeProgress: (() => void) | undefined;
let disposed = false;
onMounted(async () => {
  if (props.pluginId) return;
  try {
    const unlisten = await (window as any).__TAURI__?.event?.listen('plugin-download-progress', (event: {payload:{id:string;bytes:number;total:number}}) => {
      downloads.value[event.payload.id] = event.payload;
    });
    if (disposed) unlisten?.(); else disposeProgress = unlisten;
  } catch {}
});
onUnmounted(() => { disposed = true; disposeProgress?.(); });
async function installMarket(id:string) {
  downloads.value[id] = {bytes:0,total:0};
  try { await run('install_market_plugin',{id}); } finally { delete downloads.value[id]; }
}
const runtimeDetails = ref<Record<string,any>>({});
const testResults=ref<Record<string,string>>({});
async function testEnvironment(id:string) {const result=await run('test_plugin_environment',{id}); if(result) testResults.value[id]=result.message;}
const secretDrafts = ref<Record<string,string>>({});
async function saveSecret(plugin:any,key:string) { const draftKey=plugin.manifest.id+':'+key; try { await pluginAction('set_plugin_secret',{id:plugin.manifest.id,key,value:secretDrafts.value[draftKey] || ''}); secretDrafts.value[draftKey]=''; } catch {} }
async function runtime(id:string) { const result=await run('plugin_runtime_status',{id});if(result) runtimeDetails.value[id]=result; }
onMounted(async () => { if (!props.pluginId) { await refreshPlugins(); marketUrl.value = state.marketUrl; } });
async function run(name:string,args?:any) { try { const result = await pluginAction(name,args); if (name==='uninstall_plugin' && props.pluginId) document.querySelector<HTMLElement>('[data-settings-nav-target="settings-section-plugins"]')?.click(); return result; } catch {} }
async function importPackage(directory=false) {
  const path = await (window as any).__TAURI__?.dialog?.open({ directory, multiple:false, filters:directory?undefined:[{name:'插件包',extensions:['zip']}] });
  if (typeof path === 'string') await run('import_plugin',{path});
}
async function configure(plugin:any,enabled=plugin.enabled) { await run('configure_plugin',{id:plugin.manifest.id,enabled,config:JSON.parse(JSON.stringify(plugin.config))}); }
function openModule(id:string) { const section=id==='webdav-sync'?'settings-section-webdav':'settings-section-telegram'; document.querySelector<HTMLElement>('[data-settings-nav-target="'+section+'"]')?.click(); }
function updateField(plugin:any,field:any,event:Event) { const input=event.target as HTMLInputElement; plugin.config[field.key]=field.kind==='boolean'?input.checked:field.kind==='number'?input.valueAsNumber:input.value; }
async function selectDirectory(plugin:any,key:string) {const path=await (window as any).__TAURI__?.dialog?.open({directory:true,multiple:false});if(typeof path==='string'){plugin.config[key]=path;await configure(plugin);}}
async function fetchMarket() { await run('set_plugin_market',{url:marketUrl.value}); const index=await run('fetch_plugin_market'); if(index) { state.market=index.plugins; marketNotice.value=index.from_cache?'当前显示离线缓存：'+(index.refresh_error || '刷新失败'):'市场已更新'; } }
</script>
<template>
  <section class="plugins-panel">
    <div class="plugins-heading"><div><h3>{{ props.pluginId ? selectedPlugins[0]?.manifest.name : '插件管理' }}</h3><p>{{ props.pluginId ? '配置本机插件、空间权限和运行方式。' : '安装插件，为聊天添加新的能力。' }}</p></div><button type="button" @click="refreshPlugins">刷新</button></div>
    <template v-if="!props.pluginId">
    <nav class="plugins-tabs"><button type="button" :class="{active:active==='installed'}" @click="active='installed'">已安装</button><button type="button" :class="{active:active==='market'}" @click="active='market'">插件市场</button></nav>
    <p v-if="state.error" role="alert" class="plugin-error">{{ state.error }}</p>
    <div class="plugin-list-toolbar"><label class="plugin-search"><span aria-hidden="true">⌕</span><input v-model="search" type="search" aria-label="搜索插件" placeholder="搜索插件名称或 ID…" /></label><span>{{ active==='installed'?'已安装':'市场插件' }} {{ total }}</span></div>
    <div v-if="active==='installed'">
      <div class="plugins-tools"><button type="button" :disabled="state.busy" @click="importPackage(false)">导入插件包</button><button type="button" :disabled="state.busy" @click="importPackage(true)">导入插件目录</button></div>
      <div class="plugin-install-list" aria-label="已安装插件">
        <div class="plugin-list-header"><span>插件</span><span>状态与操作</span></div>
        <article v-for="entry in pageEntries" :key="entry.id" class="plugin-install-row" :data-plugin-id="entry.id">
          <div class="plugin-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4m-3 0h6M8 13h1m6 0h1m-7 4h6"/></svg></div>
          <div class="plugin-card-main"><div class="plugin-title"><strong>{{ entry.name }}</strong><code v-if="entry.plugin">v{{ entry.plugin.manifest.version }}</code><span>{{ entry.plugin?.source_kind==='external'?'外置':'内置' }}</span></div><p>{{ entry.plugin ? (entry.plugin.error || (entry.plugin.manifest.runtime.mode==='oneshot'?'按任务运行，无需常驻':'常驻服务')) : (entry.module.lastError || '随应用更新') }}</p></div>
          <div class="plugin-card-actions">
            <template v-if="entry.plugin"><span class="plugin-status" :class="{enabled:entry.plugin.enabled}">{{ entry.plugin.enabled?'已启用':'已停用' }}</span><label class="plugin-switch"><input type="checkbox" :aria-label="'启用 '+entry.name" :checked="entry.plugin.enabled" :disabled="state.busy || !!entry.plugin.error" @change="configure(entry.plugin,($event.target as HTMLInputElement).checked)"/><span></span></label><button type="button" @click="openSettings(entry.id)">{{ entry.plugin.enabled?'设置':'配置' }}</button><button v-if="entry.plugin.source_kind!=='builtin'" type="button" :disabled="state.busy" @click="run('uninstall_plugin',{id:entry.id,keepData:true})">卸载</button></template>
            <template v-else><span class="plugin-status" :class="{enabled:entry.module.enabled}">{{ entry.module.enabled?'已启用':'已停用' }}</span><button type="button" @click="openModule(entry.id)">设置</button></template>
          </div>
        </article>
      </div>
      <p v-if="!pageEntries.length" class="plugin-empty">{{ search ? '没有找到匹配的插件，试试其他名称。' : '还没有安装插件，可导入插件包或前往插件市场。' }}</p>
      <div v-if="editingPlugin" class="plugin-inline-config"><div class="plugins-heading"><strong>插件配置</strong><button type="button" @click="editingPlugin=''">收起配置</button></div><PluginsPanel :plugin-id="editingPlugin" /></div>
    </div>
    <div v-else>
      <label class="plugin-field">索引地址<input v-model="marketUrl" placeholder="https://…/index.json" /></label><button type="button" :disabled="state.busy" @click="fetchMarket">保存并刷新</button>
      <p v-if="!marketUrl">配置插件市场索引地址后可浏览下载，也可以从本地导入插件包。</p><p v-if="marketNotice" role="status">{{ marketNotice }}</p>
      <div class="plugin-store-grid"><article v-for="plugin in marketEntries" :key="plugin.id" class="plugin-card"><div class="plugin-title"><strong>{{ plugin.name }}</strong><code>v{{ plugin.version }}</code></div><p>{{ plugin.description }}</p><p v-if="plugin.unavailable_reason">{{ plugin.unavailable_reason }}</p><button type="button" :disabled="state.busy || !!plugin.unavailable_reason" @click="installMarket(plugin.id)">安装 / 更新</button><p v-if="downloads[plugin.id]" role="status"><progress :value="downloads[plugin.id].bytes" :max="downloads[plugin.id].total || undefined" /> {{ Math.ceil(downloads[plugin.id].bytes / 1024) }} KB</p></article></div>
    </div>
    <p v-if="active==='market' && !marketEntries.length && marketUrl" class="plugin-empty">{{ search ? '没有找到匹配的插件。' : '暂无可安装插件，刷新索引后重试。' }}</p>
    <footer class="plugin-pagination"><span role="status">共 {{ total }} 项 · 第 {{ page }} / {{ pageCount }} 页</span><label>每页 <select v-model.number="pageSize" aria-label="每页插件数量"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option></select> 项</label><div><button type="button" :disabled="page<=1" @click="page--">上一页</button><button type="button" :disabled="page>=pageCount" @click="page++">下一页</button></div></footer>
    </template>
    <template v-else>
    <div>
      <article v-for="plugin in selectedPlugins" :key="plugin.manifest.id" class="plugin-card plugin-settings-card">
        <div class="plugins-heading"><div><strong>{{ plugin.manifest.name }}</strong> <small>{{ plugin.manifest.version }} · {{ plugin.source_kind==='builtin'?'内置':'外置' }}</small><p>{{ plugin.error || (plugin.enabled ? (plugin.manifest.runtime.mode==='oneshot'?'已启用 · 按任务运行':'已启用 · 服务模式') : '已停用') }}</p></div><label><input type="checkbox" :checked="plugin.enabled" :disabled="state.busy || !!plugin.error" @change="configure(plugin,($event.target as HTMLInputElement).checked)" /> 启用</label></div>
        <div v-for="field in plugin.manifest.config_schema" :key="field.key" class="plugin-field"><label>{{ field.label }}</label><input v-if="field.kind !== 'secret'" :value="plugin.config[field.key]" :checked="!!plugin.config[field.key]" @input="updateField(plugin,field,$event)" :type="field.kind==='boolean'?'checkbox':field.kind==='number'?'number':'text'" /><button v-if="field.kind==='directory'" type="button" @click="selectDirectory(plugin,field.key)">选择</button></div>
        <div v-for="field in plugin.manifest.config_schema.filter((field:any)=>field.kind==='secret')" :key="'secret:'+field.key" class="plugin-field"><label>{{ field.label }}</label><input type="password" autocomplete="new-password" v-model="secretDrafts[plugin.manifest.id+':'+field.key]" placeholder="保存在本机系统凭据库，留空保存则删除" /><button type="button" :disabled="state.busy" @click="saveSecret(plugin,field.key)">保存凭据</button></div>
        <div class="plugins-tools"><button type="button" :disabled="state.busy" @click="configure(plugin)">保存配置</button><button v-if="plugin.source_kind!=='builtin'" type="button" :disabled="state.busy" @click="run('uninstall_plugin',{id:plugin.manifest.id,keepData:true})">卸载并保留数据</button></div>
        <label class="plugin-field"><input type="checkbox" :checked="plugin.current_space_allowed" :disabled="state.busy || !plugin.has_current_space" @change="run('set_plugin_space',{id:plugin.manifest.id,allowed:($event.target as HTMLInputElement).checked})" />允许当前存储空间调用</label>
        <small>插件以当前用户权限运行。启用后还需允许当前空间调用。</small>
        <button v-if="plugin.source_kind!=='builtin'" type="button" :disabled="state.busy" @click="run('uninstall_plugin',{id:plugin.manifest.id,keepData:false})">卸载并删除配置、凭据与日志</button>
        <small v-if="plugin.manifest.capabilities?.some((capability:any)=>capability.kind!=='bot')">此插件包含当前版本暂不支持的能力。</small>
        <div class="plugins-tools"><button type="button" :disabled="state.busy" @click="testEnvironment(plugin.manifest.id)">检查环境</button><span role="status">{{ testResults[plugin.manifest.id] }}</span></div>
        <label v-if="plugin.manifest.runtime.mode==='service'" class="plugin-field"><input type="checkbox" :checked="plugin.manifest.runtime.auto_start" @change="run('set_plugin_auto_start',{id:plugin.manifest.id,enabled:($event.target as HTMLInputElement).checked})" />随应用自动启动</label>
        <label v-if="plugin.source_kind!=='builtin' && plugin.available_versions?.length>1" class="plugin-field">切换已安装版本<select value="" @change="run('rollback_plugin',{id:plugin.manifest.id,version:($event.target as HTMLSelectElement).value})"><option value="" disabled>选择版本（切换后需重新启用）</option><option v-for="version in plugin.available_versions.filter((version:string)=>version!==plugin.manifest.version)" :key="version" :value="version">{{ version }}</option></select></label>
        <details @toggle="($event.target as HTMLDetailsElement).open && runtime(plugin.manifest.id)"><summary>运行状态与日志</summary><p>{{ runtimeDetails[plugin.manifest.id]?.running ? '进程运行中' : '当前无空闲常驻进程' }}</p><button type="button" @click="runtime(plugin.manifest.id)">刷新状态</button><pre>{{ runtimeDetails[plugin.manifest.id]?.log || '暂无日志' }}</pre></details>
        <div v-if="plugin.manifest.runtime.mode==='service'" class="plugins-tools"><button type="button" @click="run('plugin_service',{id:plugin.manifest.id,start:true})">启动</button><button type="button" @click="run('plugin_service',{id:plugin.manifest.id,start:false})">停止</button></div>
      </article>
      <PluginTasks v-if="props.pluginId && selectedPlugins.some(plugin=>plugin.manifest.capabilities?.some((capability:any)=>capability.kind==='bot'))" :plugin-id="props.pluginId" />
    </div>
    </template>
  </section>
</template>
<style scoped src="./plugins-panel.css"></style>
<style>.plugin-nav-label{padding:18px 12px 6px;font-size:11px;color:var(--muted)}.plugin-nav-item{padding-left:24px!important}</style>
