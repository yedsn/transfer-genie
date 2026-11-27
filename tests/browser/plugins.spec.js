import { test, expect } from '@playwright/test';

test('plugin settings and structured multi-reference call render and send', async ({ page }) => {
  await page.addInitScript(() => {
    const endpoint = { id: 'plugin-test', name: 'Plugin test', url: 'https://example.test/dav', enabled: true };
    const settings = { sender_name: 'Test', refresh_interval_secs: 3600, default_editor_format: 'text', active_storage_profile_id: endpoint.id, webdav_endpoints: [endpoint], storage_profiles: [{ ...endpoint, provider_kind: 'webdav', webdav: { url: endpoint.url } }], send: {}, telegram: {}, ai: {}, speech_to_text: {}, backup: {} };
    const plugin = { manifest: { id: 'image-downloader', name: '图片下载', version: '1.0.0', capabilities:[{kind:'bot'}], runtime: { mode: 'oneshot' }, config_schema: [{ key: 'download_dir', label: '下载目录', kind: 'directory' }] }, config: { download_dir: 'D:/Downloads' }, source_kind: 'builtin', enabled: true, has_current_space:true, current_space_allowed:false };
    const fixture = window.__pluginTest = { sends: [], messages: [], contexts: [], tasks: [], events: [], listeners: {} };
    let installed = [plugin];
    plugin.instance_id='pc-image';
    const proxies = [];
    window.__TAURI__ = { core: { invoke: async (command, args) => {
      if (command === 'get_settings') return structuredClone(settings);
      if (command === 'get_bot_scope') return 'account-space';
      if (command === 'list_plugins') return structuredClone(installed);
      if (command === 'list_bot_tasks') return [
        {task_id:'image-task',target_instance_id:'pc-image',text:'下载引用图片',created_at_ms:Date.now(),status:'running',can_cancel:true},
        ...Array.from({length:11}, (_,index) => ({task_id:'history-'+index,target_instance_id:'pc-image',text:'历史任务 '+index,created_at_ms:Date.now()-1000*(index+1),status:'succeeded'})),
        {task_id:'other-task',target_instance_id:'other-instance',text:'其他插件任务',created_at_ms:Date.now(),status:'running'},
        ...structuredClone(fixture.tasks),
      ];
      if (command === 'configure_plugin') { const entry=installed.find(plugin=>plugin.manifest.id===args.id); entry.enabled=args.enabled; entry.config=args.config; return null; }
      if (command === 'list_download_proxies') return structuredClone(proxies);
      if (command === 'save_download_proxy') { proxies.push({id:'company',name:args.name,address:args.address,authenticated:false}); return null; }
      if (command === 'check_download_settings') return '代理连接成功';
      if (command === 'remove_download_proxy') { proxies.splice(proxies.findIndex(profile=>profile.id===args.id),1); plugin.config.default_route=args.replacement || 'direct'; return null; }
      if (command === 'import_plugin') { installed.push({...structuredClone(plugin),enabled:false,source_kind:'external',manifest:{...structuredClone(plugin.manifest),id:'echo-bot',name:'Echo Bot'}}); return null; }
      if (command === 'uninstall_plugin') { installed = installed.filter(plugin=>plugin.manifest.id!==args.id); return null; }
      if (command === 'list_integration_modules') return [{ id: 'webdav-sync', displayName: 'WebDAV Sync', enabled: true, running: true }];
      if (command === 'set_plugin_space') { plugin.current_space_allowed=args.allowed; return null; }
      if (command === 'list_bot_instances') return plugin.current_space_allowed ? [{ instance_id: 'pc-image', name: '图片下载', device_name: 'PC', enabled: true, expires_at_ms: Date.now() + 90000, download_options:{default_route: plugin.config.default_route || 'direct',profiles:[{id:'company',name:'公司代理'}]} }] : [];
      if (command === 'get_message_contexts') return structuredClone(fixture.contexts);
      if (command === 'list_bot_events') return structuredClone(fixture.events);
      if (command === 'get_plugin_market') return '';
      if (command === 'send_text') {
        fixture.sends.push(args);
        const now = Date.now();
        fixture.messages = [
          { filename: 'older.md', sender: 'Test', timestamp_ms: now - 100, kind: 'text', format: 'markdown', content: '# Markdown' },
          { filename: 'sent.txt', sender: 'Test', timestamp_ms: now, kind: 'text', format: 'text', content: args.text },
        ];
        fixture.tasks = [{ task_id: 'sent-task', message_filename: 'sent.txt', target_instance_id: 'pc-image', status: 'waiting_device', pending_delivery: true, created_at_ms: now }];
        return { filename: 'sent.txt', markedTagIds: [] };
      }
      if (command === 'list_messages_window') return { messages: structuredClone(fixture.messages), total: fixture.messages.length, hasMoreBefore: false, hasMoreAfter: false };
      if (command === 'get_sync_status' || command === 'refresh') return { running: false };
      if (command === 'get_app_version') return 'test';
      if (command === 'get_marked_messages' || command === 'list_download_history' || command === 'list_upload_history') return { records: [], total: 0 };
      if (command.startsWith('list_')) return [];
      return null;
    } }, event: { listen: async (name, handler) => { fixture.listeners[name] = handler; return () => {}; }, emit: async () => {} }, dialog: { open: async () => 'fixture.zip', save: async () => null } };
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.transferGenieSendActiveDraft);
  await page.evaluate(() => window.transferGenieVue.activateTab('settings'));
  await page.locator('[data-settings-nav-target="settings-section-plugins"]').click();
  await expect(page.locator('#settings-section-plugins .plugins-panel')).toBeVisible();
  await expect(page.locator('#settings-section-plugins .plugins-panel')).toContainText('WebDAV Sync');
  await expect(page.locator('.plugin-install-row').first()).toContainText('内置');
  await page.screenshot({ path: 'target/playwright/plugins/plugin-management.png' });
  await page.locator('[data-settings-nav-target="settings-plugin-image-downloader"]').click();
  await expect(page.locator('#settings-plugin-image-downloader').getByLabel('下载目录')).toHaveValue('D:/Downloads');
  await page.locator('#settings-plugin-image-downloader').getByRole('button',{name:'前往基本设置'}).click();
  await expect(page.getByPlaceholder('{yyyymmdd}_{filename}.{file_suffix}')).toBeFocused();
  await page.locator('[data-settings-nav-target="settings-plugin-image-downloader"]').click();
  const downloadSettings = page.locator('#settings-plugin-image-downloader .download-settings');
  await downloadSettings.getByRole('button',{name:'新增代理'}).click();
  await downloadSettings.getByLabel('代理名称').fill('公司代理');
  await downloadSettings.getByLabel('HTTP 代理地址').fill('http://127.0.0.1:7890');
  await downloadSettings.getByRole('button',{name:'保存代理'}).click();
  await downloadSettings.getByRole('button',{name:'测试连接'}).click();
  await expect(downloadSettings.getByRole('status')).toHaveText('代理连接成功');
  await downloadSettings.getByLabel('默认出口',{exact:true}).selectOption('company');
  await page.locator('#settings-plugin-image-downloader').getByRole('button',{name:'保存配置'}).click();
  await downloadSettings.getByRole('button',{name:'删除',exact:true}).click();
  await expect(downloadSettings.getByRole('button',{name:'确认删除'})).toBeDisabled();
  await downloadSettings.getByLabel('新的默认出口').selectOption('direct');
  await downloadSettings.getByRole('button',{name:'确认删除'}).click();
  await expect(downloadSettings.getByRole('status')).toHaveText('代理已删除');
  const taskPanel = page.locator('#settings-plugin-image-downloader .plugin-task-panel');
  await expect(taskPanel.locator('.plugin-task-row')).toHaveCount(10);
  await expect(taskPanel.locator('.plugin-task-row').first()).toContainText('下载引用图片');
  await taskPanel.getByRole('button',{name:'下一页'}).click();
  await expect(taskPanel.locator('.plugin-task-row')).toHaveCount(2);
  await expect(taskPanel.getByRole('status')).toHaveText('第 2 / 2 页');
  await taskPanel.getByRole('combobox',{name:'每页任务数量'}).selectOption('20');
  await expect(taskPanel.locator('.plugin-task-row')).toHaveCount(12);
  await expect(taskPanel.getByRole('status')).toHaveText('第 1 / 1 页');
  await expect(taskPanel).not.toContainText('其他插件任务');
  const permission = page.locator('#settings-plugin-image-downloader .plugin-permissions-header').getByRole('switch',{name:'允许当前空间调用'});
  await permission.check();
  await expect(permission).toBeChecked();
  await permission.uncheck();
  await expect(page.locator('.bot-composer')).not.toContainText('机器人任务');
  await page.locator('[data-settings-nav-target="settings-section-plugins"]').click();
  await page.getByRole('button',{name:'导入插件包',exact:true}).click();
  const echoMenu = page.locator('[data-settings-nav-target="settings-plugin-echo-bot"]');
  await expect(echoMenu).toHaveCount(0);
  await page.locator('[data-plugin-id="echo-bot"]').getByRole('button',{name:'配置',exact:true}).click();
  await expect(page.locator('.plugin-inline-config')).toBeVisible();
  await expect(echoMenu).toHaveCount(0);
  await page.getByRole('button',{name:'收起配置',exact:true}).click();
  await page.getByRole('checkbox',{name:'启用 Echo Bot',exact:true}).check();
  await expect(echoMenu).toBeVisible();
  const settingsOrder = await page.evaluate(() => ({
    menu: Array.from(document.querySelectorAll('.settings-nav [data-settings-nav-target]'), button => button.dataset.settingsNavTarget),
    content: Array.from(document.querySelectorAll('.settings-content [data-settings-section]'), section => section.id),
  }));
  expect(settingsOrder.content).toEqual(settingsOrder.menu);
  await echoMenu.click();
  await expect(page.locator('#settings-plugin-echo-bot h3')).toHaveText('Echo Bot');
  await page.locator('#settings-plugin-echo-bot').getByRole('checkbox',{name:'启用 Echo Bot',exact:true}).click();
  await expect(echoMenu).toHaveCount(0);
  await page.getByRole('checkbox',{name:'启用 Echo Bot',exact:true}).check();
  await echoMenu.click();
  await page.locator('#settings-plugin-echo-bot').getByRole('button',{name:'卸载并保留数据',exact:true}).click();
  await expect(echoMenu).toHaveCount(0);
  await expect(page.locator('#settings-plugin-echo-bot')).toHaveCount(0);
  await page.evaluate(()=>{ const state=window.transferGeniePlugins.state; const original=state.plugins[0]; for(let i=1;i<=24;i++) state.plugins.push({...JSON.parse(JSON.stringify(original)),enabled:false,manifest:{...JSON.parse(JSON.stringify(original.manifest)),id:'sample-'+i,name:'Sample '+i}}); });
  const manager=page.locator('#settings-section-plugins');
  await expect(manager.locator('.plugin-install-row')).toHaveCount(10);
  await page.screenshot({ path: 'target/playwright/plugins/plugin-list-pagination.png' });
  await manager.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(manager.locator('.plugin-pagination')).toContainText('第 2 / 3 页');
  await manager.getByRole('searchbox',{name:'搜索插件'}).fill('sample-24');
  await expect(manager.locator('.plugin-install-row')).toHaveCount(1);
  await expect(manager.locator('.plugin-pagination')).toContainText('第 1 / 1 页');
  await manager.getByRole('searchbox',{name:'搜索插件'}).fill('no-match');
  await expect(manager.locator('.plugin-empty')).toContainText('没有找到');
  await manager.getByRole('searchbox',{name:'搜索插件'}).fill('');
  await manager.getByRole('combobox',{name:'每页插件数量'}).selectOption('50');
  await expect(manager.locator('.plugin-install-row')).toHaveCount(26);
  await page.evaluate(()=>{window.transferGenieVue.activateTab('home');const store=window.transferGenieComposerStore;store.setDraftText(store.getActiveDraft().id,'');store.setDraftFormat(store.getActiveDraft().id,'markdown');});
  const richEditor=page.locator('.cw-md-wrap .CodeMirror textarea');
  await page.locator('.cw-md-wrap[data-markdown-ready="true"]').waitFor(); await page.locator('.cw-md-wrap .CodeMirror').click(); await page.keyboard.type('@');
  const mentionMenu = page.getByRole('listbox',{name:'选择机器人'});
  await expect(mentionMenu).toBeVisible();
  await expect.poll(() => page.locator('.cw-md-wrap .CodeMirror').evaluate(element => {
    const anchor = element.CodeMirror.charCoords({line: 0, ch: 0}, 'window');
    const menu = document.querySelector('[role="listbox"][aria-label="选择机器人"]').getBoundingClientRect();
    return Math.abs(menu.left - (anchor.right + 6)) < 2 && (menu.top >= anchor.bottom || menu.bottom <= anchor.top);
  })).toBe(true);
  await page.getByRole('button',{name:'允许当前空间调用',exact:true}).click();
  await expect(page.locator('.bot-mention-menu').getByRole('option')).toContainText('图片下载');
  await page.locator('.bot-mention-menu').getByRole('option').click();
  await expect(page.locator('.cw-md-wrap .CodeMirror')).toContainText('@图片下载（PC）');
  await expect(page.locator('.cw-md-wrap .bot-mention-token')).toHaveCount(1);
  await richEditor.press('Backspace');
  await richEditor.press('Backspace');
  await expect(page.locator('.cw-md-wrap .bot-mention-token')).toHaveCount(0);
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().targetBotInstanceId)).toBeNull();
  await page.evaluate(()=>{const store=window.transferGenieComposerStore;store.setDraftFormat(store.getActiveDraft().id,'text');});
  await page.evaluate(async () => {
    window.transferGenieVue.activateTab('home');
    window.transferGenieComposerStore.clearWorkspaceConfirmed();
    await window.transferGeniePlugins.setScope('plugin-test');
    window.transferGeniePlugins.addReferences([{ filename: 'one.png', kind: 'image', original_name: 'one.png', timestamp_ms: 1 }, { filename: 'two.png', kind: 'image', original_name: 'two.png', timestamp_ms: 2 }]);
    window.transferGeniePlugins.state.target = 'pc-image';
    const store = window.transferGenieComposerStore;
    store.setDraftText(store.getActiveDraft().id, '下载这些图片');
  });
  await expect(page.locator('.bot-reference-list')).toContainText('已引用 2 条消息');
  await page.evaluate(()=>{window.__quoteLocated='';window.transferGenieLocateReference=async filename=>{window.__quoteLocated=filename;return false;};});
  await page.getByRole('button',{name:'定位引用 one.png',exact:true}).click();
  expect(await page.evaluate(()=>window.__quoteLocated)).toBe('one.png');
  await expect(page.locator('.quote-notice')).toContainText('原消息已删除或当前不可用');
  await expect(page.locator('.bot-target-picker')).toHaveCount(0);
  const textEditor = page.locator('.cw-textarea:visible');
  await textEditor.fill('@图');
  await expect(mentionMenu).toBeVisible();
  const firstMenuLeft = (await mentionMenu.boundingBox()).x;
  await textEditor.fill('Download this @图');
  await expect.poll(async () => (await mentionMenu.boundingBox()).x).toBeGreaterThan(firstMenuLeft + 60);
  await textEditor.fill('@图');
  await expect(page.locator('.bot-mention-menu').getByRole('option')).toContainText('图片下载');
  await page.locator('.cw-textarea:visible').press('Enter');
  await page.locator('.cw-textarea:visible').press('Alt+ArrowDown');
  await page.getByRole('menuitemradio',{name:'公司代理'}).click();
  await expect(page.locator('.cw-textarea:visible')).toHaveValue('@图片下载（PC） ');
  await expect(page.locator('.mention-textarea-mirror .bot-mention-token')).toHaveCount(1);
  await page.locator('.cw-textarea:visible').press('Backspace');
  await page.locator('.cw-textarea:visible').press('Backspace');
  await expect(page.locator('.cw-textarea:visible')).toHaveValue('');
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().targetBotInstanceId)).toBeNull();
  await page.locator('.cw-textarea:visible').fill('普通消息');
  expect(await page.evaluate(() => window.transferGeniePlugins.getCallContext().targetBotInstanceId)).toBeNull();
  await page.locator('.cw-textarea:visible').fill('@图');
  await page.locator('.cw-textarea:visible').press('Enter');
  await page.locator('.cw-textarea:visible').press('Alt+ArrowDown');
  await expect(page.getByRole('menuitemradio',{name:/跟随默认/})).toHaveAttribute('aria-checked','true');
  await page.getByRole('menuitemradio',{name:'公司代理'}).click();
  await page.locator('.bot-composer').evaluate(async element => {
    const animations = document.getAnimations().filter(animation => animation.effect?.target instanceof Element && animation.effect.target.contains(element));
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: 'target/playwright/plugins/multiple-references.png' });
  await page.locator('#send-text').click();
  await expect.poll(() => page.evaluate(() => window.__pluginTest.sends.length)).toBe(1);
  const sent = await page.evaluate(() => window.__pluginTest.sends[0]);
  expect(sent.targetBotInstanceId).toBe('pc-image');
  expect(sent.downloadRoute).toBe('company');
  expect(sent.text.slice(sent.mentionStart,sent.mentionStart+sent.mentionText.length)).toBe('@图片下载（PC）');
  expect(sent.references.map(item => item.filename)).toEqual(['one.png', 'two.png']);
  const feedback = page.locator('#message-list .bot-feedback');
  await expect(feedback).toContainText('正在投递');
  await page.evaluate(() => {
    const fixture = window.__pluginTest;
    fixture.tasks[0].pending_delivery = false;
    fixture.listeners['bot-chat-updated']({ payload: { scope: 'account-space' } });
  });
  await expect(feedback).toContainText('等待机器人接单');
  await page.evaluate(() => {
    const fixture = window.__pluginTest;
    fixture.tasks[0].created_at_ms -= 9000;
    fixture.listeners['bot-chat-updated']({ payload: { scope: 'other-space' } });
  });
  await expect(feedback).toContainText('等待机器人接单');
  await page.evaluate(() => window.__pluginTest.listeners['bot-chat-updated']({ payload: { scope: 'account-space' } }));
  await expect(feedback).toContainText('机器人暂未响应');
  await page.evaluate(() => {
    const fixture = window.__pluginTest;
    fixture.tasks[0].status = 'running';
    fixture.listeners['bot-chat-updated']({ payload: { scope: 'account-space' } });
  });
  await expect(feedback).toContainText('正在处理');
  await page.evaluate(() => {
    const fixture = window.__pluginTest;
    fixture.tasks[0].status = 'progress';
    const updates = [
      { transfer_item: { item_id: 'video', name: 'demo.mp4', status: 'downloading', transfer: { received_bytes: 1024 ** 2, total_bytes: 4 * 1024 ** 2, bytes_per_second: 512 * 1024 } } },
      { transfer_item: { item_id: 'archive', name: 'archive.zip', status: 'downloading', transfer: { received_bytes: 64 * 1024, total_bytes: null, bytes_per_second: 32 * 1024 } } },
      { item: { item_id: 'note', name: 'note.txt', status: 'succeeded' } },
    ];
    fixture.events = updates.map(payload => ({ task_id: 'sent-task', kind: 'progress', timestamp_ms: Date.now(), payload }));
    fixture.listeners['bot-chat-updated']({ payload: { scope: 'account-space' } });
  });
  await expect(feedback).toContainText('已处理 1 项');
  await expect(feedback).toContainText('512 KB/s');
  await expect(feedback).toContainText('25.0%');
  await expect(feedback.getByRole('progressbar', { name: 'demo.mp4 的下载进度' })).toHaveAttribute('value', '1048576');
  await expect(feedback.getByRole('progressbar', { name: 'archive.zip 的下载进度' })).not.toHaveAttribute('value');
  await page.evaluate(() => {
    const fixture = window.__pluginTest;
    fixture.events.push({ task_id: 'sent-task', kind: 'progress', timestamp_ms: Date.now(), payload: { item: { item_id: 'video', status: 'succeeded' } } });
    fixture.listeners['bot-chat-updated']({ payload: { scope: 'account-space' } });
  });
  await expect(feedback).toContainText('已处理 2 项');
  await expect(feedback.getByRole('progressbar')).toHaveCount(1);
  await page.evaluate(() => {
    const fixture = window.__pluginTest;
    const timestamp_ms = fixture.messages[1].timestamp_ms + 1;
    fixture.tasks[0].status = 'succeeded';
    fixture.messages.push({ filename: 'reply.txt', sender: '图片下载', timestamp_ms, kind: 'text', content: '下载完成' });
    fixture.contexts.push({ filename: 'reply.txt', task_id: 'sent-task', text: '下载完成' });
    fixture.listeners['bot-chat-updated']({ payload: { scope: 'account-space', messagesChanged: true } });
  });
  await expect(page.locator('#message-list .message-card[data-filename="reply.txt"]')).toContainText('下载完成');
  await expect(feedback).toHaveCount(0);
});

test('mobile multi-selection quotes messages into a structured bot call', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    window.__TAURI__={core:{invoke:async(command)=>{
      if(command==='get_bot_scope') return 'mobile-fixture';
      if(command==='list_bot_tasks') return [
        { task_id:'offline-task', message_filename:'preview-text', target_instance_id:'mac', created_at_ms:Date.now(), status:'waiting_device' },
        { task_id:'mobile-download', message_filename:'preview-plan.pdf', target_instance_id:'pc', created_at_ms:Date.now(), status:'progress' },
      ];
      if(command==='list_bot_events') return [{ task_id:'mobile-download', kind:'progress', timestamp_ms:Date.now(), payload:{ transfer_item:{ item_id:'file', name:'demo.zip', status:'downloading', transfer:{ received_bytes:512, total_bytes:1024, bytes_per_second: 256 } } } }];
      if(command==='get_message_contexts') return [{filename:'preview-photo.jpg',task_id:'reply-task',text:'下载完成',references:[{filename:'preview-plan.pdf',sender:'Mac',kind:'file',original_name:'引用文件.pdf'}]}];
      if(command==='list_bot_instances' && window.__directoryOffline) throw new Error('offline');
      if(command==='list_bot_instances') return [
        {instance_id:'pc',name:'图片下载',device_name:'PC',enabled:true,expires_at_ms:Date.now()+90000,download_options:{default_route:'direct',profiles:[{id:'mobile-proxy',name:'家用代理'}]}},
        {instance_id:'mac',name:'图片下载',device_name:'MacBook',enabled:true,expires_at_ms:Date.now()-90000},
      ];
      if(command.startsWith('list_') || command==='get_message_contexts') return [];
      return null;
    }},event:{listen:async()=>()=>{},emit:async()=>{}}};
  });
  await page.goto('/?mobile-preview=1',{waitUntil:'networkidle'});
  await expect(page.locator('.mobile-message-card').first()).toBeVisible();
  const mobileFeedback = page.locator('.mobile-message-list .bot-feedback');
  await expect(mobileFeedback.filter({ hasText:'目标设备离线' })).toBeVisible();
  const liveReply = mobileFeedback.filter({ hasText:'demo.zip' });
  await expect(liveReply.locator('.mobile-message-bubble')).toContainText('50.0%');
  await expect(liveReply.locator('.mobile-message-header').getByRole('img', { name:'机器人' })).toBeVisible();
  await expect(page.locator('.mobile-message-bubble .bot-message-identity')).toHaveCount(0);
  const quotedCard=page.locator('[data-message-filename="preview-photo.jpg"]');
  await expect(quotedCard).toHaveClass(/is-bot/);
  await expect(quotedCard.locator('.mobile-message-header').getByRole('img', { name:'机器人' })).toBeVisible();
  await expect(quotedCard.locator('.reference-preview')).toContainText('引用文件.pdf');
  await expect(quotedCard.locator('.mobile-message-bubble + .reference-preview')).toBeVisible();
  await page.getByRole('button',{name:'更多操作'}).first().click();
  await page.getByRole('button',{name:'多选',exact:false}).click();
  await page.locator('.mobile-message-select').nth(1).click();
  await page.locator('.mobile-selection-toolbar').getByRole('button',{name:'引用',exact:true}).click();
  await expect(page.locator('.bot-reference-list')).toContainText('已引用 2 条消息');
  await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('@');
  expect(await page.evaluate(()=>window.transferGeniePlugins.state.plugins)).toHaveLength(0);
  await expect(page.locator('.bot-mention-menu').getByRole('option')).toHaveCount(2);
  await page.evaluate(()=>{window.__directoryOffline=true;});
  await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('');
  await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('@');
  await expect(page.locator('.bot-mention-menu').getByRole('alert')).toContainText('目录读取失败');
  await expect(page.locator('.bot-mention-menu').getByRole('option')).toHaveCount(2);
  await page.evaluate(()=>{window.__directoryOffline=false;});
  await page.locator('.bot-mention-menu').getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('.bot-mention-menu').getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.bot-mention-menu').getByRole('option').filter({hasText:'MacBook'})).toContainText('离线');
  await page.getByRole('option').filter({hasText:'PC'}).click();
  await expect(page.getByRole('textbox',{name:'消息内容',exact:true})).toHaveValue('@图片下载（PC） ');
  await page.locator('[data-download-mention]:visible').click();
  await page.getByRole('menuitemradio',{name:'家用代理'}).click();
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().downloadRoute)).toBe('mobile-proxy');
  await page.getByRole('textbox',{name:'消息内容',exact:true}).press('Backspace');
  await page.getByRole('textbox',{name:'消息内容',exact:true}).press('Backspace');
  await expect(page.getByRole('textbox',{name:'消息内容',exact:true})).toHaveValue('');
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().targetBotInstanceId)).toBeNull();
  await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('@');
  await page.locator('.bot-mention-menu').getByRole('option').filter({hasText:'MacBook'}).click();
  const context=await page.evaluate(()=>window.transferGeniePlugins.getCallContext());
  expect(context.references).toHaveLength(2);
  expect(context.targetBotInstanceId).toBe('mac');
  const plainEditor=page.getByRole('textbox',{name:'消息内容',exact:true});
  await plainEditor.fill('');
  await page.locator('.mobile-composer-format').getByRole('button',{name:'Markdown',exact:true}).click();
  const markdownEditor=page.locator('.mobile-composer-sheet [contenteditable="true"]');
  await markdownEditor.click();
  await page.keyboard.type('@');
  await expect.poll(() => markdownEditor.evaluate(element => {
    const text = element.querySelector('p').firstChild;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const anchor = range.getBoundingClientRect();
    const menu = document.querySelector('[role="listbox"][aria-label="选择机器人"]')?.getBoundingClientRect();
    if (!menu) return false;
    const left = Math.max(8, Math.min(anchor.right + 6, innerWidth - menu.width - 8));
    return Math.abs(menu.left - left) < 2 && (menu.top >= anchor.bottom || menu.bottom <= anchor.top);
  })).toBe(true);
  await page.locator('.bot-mention-menu').getByRole('option').filter({hasText:'PC'}).click();
  await expect(markdownEditor.locator('.bot-mention-token')).toHaveText('@图片下载（PC）');
  await markdownEditor.locator('[data-download-mention]').click();
  await page.getByRole('menuitemradio',{name:'直连',exact:true}).click();
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().downloadRoute)).toBe('direct');
  await markdownEditor.focus();
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().targetBotInstanceId)).toBe('pc');
  // A native editor transaction has no DOM input event (e.g. iOS undo).
  await markdownEditor.evaluate(element => {
    element.__botEditorChanges = 0;
    element.addEventListener('bot-editor-change', () => element.__botEditorChanges++);
  });
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => markdownEditor.evaluate(element => element.__botEditorChanges)).toBeGreaterThan(0);
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(markdownEditor).not.toContainText('@图片下载');
  expect(await page.evaluate(()=>window.transferGeniePlugins.getCallContext().targetBotInstanceId)).toBeNull();
  await page.locator('.mobile-composer-sheet').evaluate(async element => {
    const animations = document.getAnimations().filter(animation => animation.effect?.target instanceof Element && (animation.effect.target.contains(element) || element.contains(animation.effect.target)));
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({path:'target/playwright/plugins/mobile-multiple-references.png'});
  const referencedFilename=context.references[0].filename;
  await page.locator('.quote-jump').first().click();
  await expect(page.locator('.mobile-composer-sheet')).toHaveCount(0);
  expect(await page.evaluate(filename=>Array.from(document.querySelectorAll('[data-filename]')).some(node=>node.dataset.filename===filename && node.getBoundingClientRect().top>=0),referencedFilename)).toBe(true);
  await page.locator('.mobile-selection-toolbar').getByRole('button',{name:'取消',exact:true}).click();
  await page.evaluate(() => {
    window.__TRANSFER_GENIE_NATIVE_GESTURE_SPY__ = true;
    window.__botDetailNavigation = [];
    window.transferGenieApi.mobileIntegration.navigateNativePage = async (page, action, requestId) => {
      window.__botDetailNavigation.push(action);
      if (action === 'close') setTimeout(() => window.dispatchEvent(new CustomEvent('transfer-genie-navigation-returned', { detail: { page, requestId } })), 0);
      return { accepted: true };
    };
  });
  await quotedCard.locator('.mobile-message-bubble').click();
  const detail = page.locator('.mobile-detail-sheet');
  await expect(detail.locator('header').getByRole('img', { name:'机器人' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__botDetailNavigation)).toEqual(['prepare', 'show']);
  await detail.getByRole('button', { name:/引用文件[.]pdf/ }).click();
  await expect(detail).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__botDetailNavigation)).toEqual(['prepare', 'show', 'close', 'finish']);
  await expect(page.locator('[data-message-filename="preview-plan.pdf"]')).toBeInViewport();
});
