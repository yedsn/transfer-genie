<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { pluginAction } from './plugin-store';

type ProxyProfile = { id: string; name: string; address: string; authenticated: boolean };
const props = defineProps<{ config: Record<string, any> }>();
const profiles = ref<ProxyProfile[]>([]);
const form = ref<ProxyProfile | null>(null);
const deletion = ref<ProxyProfile | null>(null);
const replacement = ref('');
const auth = ref('keep');
const user = ref('');
const password = ref('');
const status = ref('');
const failed = ref(false);
const busy = ref(false);
const defaultRoute = computed(() => props.config.default_route || 'direct');

async function perform(action: () => Promise<void>) {
  busy.value = true;
  failed.value = false;
  status.value = '';
  try { await action(); }
  catch (error) { failed.value = true; status.value = String(error); }
  finally { busy.value = false; }
}
async function refresh() { profiles.value = await pluginAction('list_download_proxies'); }
onMounted(() => perform(refresh));
function edit(profile?: ProxyProfile) {
  deletion.value = null;
  form.value = profile ? { ...profile } : { id: '', name: '', address: '', authenticated: false };
  auth.value = 'keep';
  user.value = '';
  password.value = '';
  status.value = '';
}
function save() {
  const profile = form.value;
  if (!profile) return;
  void perform(async () => {
    const credentials = auth.value === 'set' ? [user.value, password.value] : auth.value === 'remove' ? ['', ''] : null;
    await pluginAction('save_download_proxy', { id: profile.id || null, name: profile.name, address: profile.address, credentials });
    form.value = null;
    user.value = password.value = '';
    await refresh();
    status.value = '代理已保存';
  });
}
function remove() {
  const profile = deletion.value;
  if (!profile) return;
  void perform(async () => {
    const route = profile.id === defaultRoute.value ? replacement.value : null;
    await pluginAction('remove_download_proxy', { id: profile.id, replacement: route });
    if (route) props.config.default_route = route;
    deletion.value = null;
    await refresh();
    status.value = '代理已删除';
  });
}
function check(proxyId?: string) {
  void perform(async () => {
    status.value = await pluginAction('check_download_settings', proxyId ? { proxyId } : { aria2cPath: props.config.aria2c_path || '' });
  });
}
async function selectAria() {
  const path = await (window as any).__TAURI__?.dialog?.open({ directory: false, multiple: false });
  if (typeof path === 'string') props.config.aria2c_path = path;
}
</script>

<template>
  <div class="download-settings">
    <section class="download-section" aria-label="直链下载">
    <h4>直链下载</h4>
    <label class="download-field">直链下载引擎
      <select v-model="config.download_engine">
        <option value="builtin">内置下载</option><option value="aria2c">aria2c</option>
      </select>
    </label>
    <div v-if="config.download_engine === 'aria2c'" class="download-row">
      <label class="download-field">aria2c 程序路径<input v-model="config.aria2c_path" placeholder="本机程序的绝对路径" /></label>
      <button type="button" @click="selectAria">选择程序</button>
      <button type="button" :disabled="busy" @click="check()">检查 aria2c</button>
    </div>
    </section>
    <section class="download-section" aria-label="下载代理">
    <div class="download-row download-section-header"><h4>下载代理</h4><button type="button" class="proxy-add" :disabled="busy" @click="edit()">新增代理</button></div>
    <label class="download-field">默认出口
      <select v-model="config.default_route" aria-label="默认出口" :disabled="busy">
        <option value="direct">直连</option>
        <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
      </select>
    </label>
    <p class="download-help">代理用于外部文件链接。更改引擎或默认出口后，请保存配置。</p>
    <ul v-if="profiles.length" class="proxy-list">
      <li v-for="profile in profiles" :key="profile.id" class="download-row">
        <span class="proxy-info"><strong>{{ profile.name }} <span v-if="profile.id === defaultRoute" class="proxy-default">默认</span></strong><small>{{ profile.address }}{{ profile.authenticated ? ' · 已配置认证' : '' }}</small></span>
        <div class="proxy-actions">
        <button type="button" :disabled="busy" @click="check(profile.id)">测试连接</button>
        <button type="button" :disabled="busy" @click="edit(profile)">编辑</button>
        <button type="button" :disabled="busy" @click="deletion = profile; replacement = ''; form = null">删除</button>
        </div>
      </li>
    </ul>
    <p v-else-if="!form" class="proxy-empty">暂无代理</p>
    <form v-if="form" class="proxy-form" @submit.prevent="save">
      <h5>{{ form.id ? '编辑代理' : '新增代理' }}</h5>
      <label class="download-field">代理名称<input v-model="form.name" maxlength="48" required /></label>
      <label class="download-field">HTTP 代理地址<input v-model="form.address" placeholder="http://127.0.0.1:7890" required /></label>
      <label class="download-field">认证
        <select v-model="auth"><option value="keep">{{ form.authenticated ? '保留凭据' : '无需认证' }}</option><option value="set">设置用户名和密码</option><option v-if="form.authenticated" value="remove">移除凭据</option></select>
      </label>
      <template v-if="auth === 'set'"><label class="download-field">用户名<input v-model="user" autocomplete="off" required /></label><label class="download-field">密码<input v-model="password" type="password" autocomplete="new-password" /></label></template>
      <div class="download-row"><button type="submit" :disabled="busy">保存代理</button><button type="button" @click="form = null; user = ''; password = ''">取消</button></div>
    </form>
    <div v-if="deletion" class="proxy-form">
      <p>删除「{{ deletion.name }}」？</p>
      <label v-if="deletion.id === defaultRoute" class="download-field">新的默认出口
        <select v-model="replacement"><option value="" disabled>请选择</option><option value="direct">直连</option><option v-for="profile in profiles.filter(p => p.id !== deletion?.id)" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select>
      </label>
      <div class="download-row"><button type="button" :disabled="busy || (deletion.id === defaultRoute && !replacement)" @click="remove">确认删除</button><button type="button" @click="deletion = null">取消</button></div>
    </div>
    </section>
    <p v-if="status || busy" :role="failed ? 'alert' : 'status'" class="download-help">{{ busy ? '正在处理…' : status }}</p>
  </div>
</template>

<style scoped>
.download-settings, .download-section { display: grid; gap: 12px; }
.download-section { padding: 18px var(--settings-padding, 20px); border-top: 1px solid var(--border); }
.download-section h4, .download-settings p, .proxy-list, .proxy-form h5 { margin: 0; }
.download-section h4 { font-size: 14px; font-weight: 650; }
.download-row, .proxy-actions { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
.download-section-header { justify-content: space-between; align-items: center; }
.proxy-info, .download-row .download-field { flex: 1; min-width: min(200px, 100%); }
.download-field, .proxy-info { display: grid; gap: 5px; font-size: 13px; }
.download-field > select { max-width: 320px; }
.download-help, .proxy-info small, .proxy-empty { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.download-settings > .download-help { padding: 0 var(--settings-padding, 20px) 8px; }
.download-settings > [role=alert] { color: var(--status-error, #b54136); }
.proxy-list { list-style: none; padding: 0 12px; border: 1px solid var(--border); border-radius: 9px; }
.proxy-list li { min-height: 56px; padding: 10px 0; align-items: center; justify-content: space-between; }
.proxy-list li + li { border-top: 1px solid var(--border); }
.proxy-default { margin-inline: 4px; padding: 2px 6px; border-radius: 4px; background: var(--panel-soft); color: var(--accent-strong); font-size: 11px; font-weight: 500; }
.proxy-empty { padding: 13px 12px; border: 1px dashed var(--border); border-radius: 8px; }
.proxy-form { display: grid; gap: 12px; min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-soft); }
</style>
