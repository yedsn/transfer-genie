<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ state: any; controller: any; cancellable?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const wizard = computed(() => props.state.connectionWizard);
const selectedSpace = computed(() => wizard.value.spaces.find((space: any) => space.id === wizard.value.selectedSpaceId));
const titles = ["连接服务", "登录账号", "选择空间", "确认绑定"];
const descriptions = [
  "先验证服务地址和公开 Key，不会写入正式配置。",
  "临时会话仅由 Rust 保管，完成绑定前不会保存连接。",
  "选择已有 Space，或明确创建一个新的 Space。",
  "确认后才保存连接；取消不会删除已经显式创建的 Space。",
];
async function cancel() {
  await props.controller.cancelConnectionWizard();
  emit("close");
}
</script>

<template>
  <div class="mobile-connection-wizard">
    <div class="mobile-wizard-progress" aria-label="连接设置进度"><i v-for="step in 4" :key="step" :class="{ 'is-active': step <= wizard.step }"></i></div>
    <span class="mobile-gate-kicker">SUPABASE ONLY · {{ wizard.step }}/4</span>
    <h1>{{ titles[wizard.step - 1] }}</h1>
    <p>{{ descriptions[wizard.step - 1] }}</p>

    <template v-if="wizard.step === 1">
      <label><span>连接名称</span><input v-model="wizard.profileName" autocomplete="off" /></label>
      <label><span>API URL</span><input v-model="wizard.apiUrl" type="url" inputmode="url" placeholder="https://…" autocapitalize="none" @input="controller.resetWizardDownstream" /></label>
      <label><span>公开 Key</span><input v-model="wizard.anonKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Supabase 公开 Key（已遮蔽）" @input="controller.resetWizardDownstream" /></label>
      <button class="mobile-primary-button" type="button" :disabled="wizard.sending || !wizard.apiUrl || !wizard.anonKey" @click="controller.testSetupConnection">{{ wizard.sending ? "正在检查…" : "测试连接并继续" }}</button>
    </template>

    <template v-else-if="wizard.step === 2">
      <label><span>邮箱</span><input v-model="wizard.email" type="email" autocomplete="username" /></label>
      <label><span>密码</span><input v-model="wizard.password" type="password" autocomplete="current-password" @keyup.enter="wizard.email && wizard.password && controller.setupSignIn()" /></label>
      <button class="mobile-primary-button" type="button" :disabled="wizard.sending || !wizard.email || !wizard.password" @click="controller.setupSignIn">{{ wizard.sending ? "正在登录…" : "登录并读取 Space" }}</button>
    </template>

    <template v-else-if="wizard.step === 3">
      <button v-for="space in wizard.spaces" :key="space.id" class="mobile-space-option" type="button" @click="controller.selectWizardSpace(space)"><span>{{ space.name.slice(0,1) }}</span><div><strong>{{ space.name }}</strong><small>{{ space.messageCount || 0 }} 条消息</small></div><b>›</b></button>
      <p v-if="!wizard.spaces.length" class="mobile-gate-empty">当前账号还没有 Space。</p>
      <button v-if="!wizard.createOpen" class="mobile-secondary-button" type="button" @click="wizard.createOpen = true">新建 Space</button>
      <div v-else class="mobile-wizard-create"><label><span>新 Space 名称</span><input v-model="wizard.createName" autocomplete="off" /></label><button class="mobile-primary-button" type="button" :disabled="wizard.sending || !wizard.createName.trim()" @click="controller.createWizardSpace">{{ wizard.sending ? "正在创建…" : "确认创建" }}</button></div>
    </template>

    <template v-else>
      <div class="mobile-wizard-summary"><p><span>连接</span><strong>{{ wizard.profileName }}</strong></p><p><span>服务</span><strong>{{ wizard.apiUrl }}</strong></p><p><span>账号</span><strong>{{ wizard.account?.email }}</strong></p><p><span>Space</span><strong>{{ selectedSpace?.name }}</strong></p></div>
      <button class="mobile-primary-button" type="button" :disabled="state.busy || !selectedSpace" @click="controller.completeSetup(selectedSpace, true)">{{ state.profiles.length ? "保存并切换" : "保存并开始使用" }}</button>
      <button v-if="state.profiles.length" class="mobile-secondary-button" type="button" :disabled="state.busy || !selectedSpace" @click="controller.completeSetup(selectedSpace, false)">仅保存</button>
    </template>

    <p v-if="state.error" class="mobile-feedback is-error" role="alert">{{ state.error }}</p>
    <button v-if="wizard.step > 1" class="mobile-secondary-button" type="button" :disabled="wizard.sending || state.busy" @click="controller.backConnectionWizard">返回上一步</button>
    <!-- Keep input focus until the click commits; iOS keyboard reflow can move
         this button between pointerdown and click if the input blurs first. -->
    <button v-if="cancellable" class="mobile-wizard-cancel" type="button" :disabled="wizard.sending || state.busy" @pointerdown.prevent @click="cancel">取消新增</button>
  </div>
</template>
