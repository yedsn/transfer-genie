const fs = require('fs');
const path = 'frontend/main.js';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `      const existingFilenames = new Set(lastMessages.map(msg => msg.filename));
      const actualNewMessages = newMessages.filter(msg => !existingFilenames.has(msg.filename));
      
      if (actualNewMessages.length > 0) {
        // 有新消息，添加到列表末尾（最新消息在后面）
        lastMessages = [...lastMessages, ...actualNewMessages];
        totalMessages = result.total || 0;
        hasMoreMessages = result.has_more || false;
        
        // 如果当前在底部，自动滚动到底部显示新消息
        const autoScroll = isMessageListAtBottom();
        renderMessages(lastMessages, { scrollToBottom: autoScroll });
      } else {`;

const newCode = `      // 找出真正的新消息以及需要更新状态的消息
      const newMessagesMap = new Map(newMessages.map(msg => [msg.filename, msg]));
      let stateChanged = false;
      
      // 1. 更新现有消息的状态（标记状态、下载状态等）
      lastMessages = lastMessages.map(oldMsg => {
        if (newMessagesMap.has(oldMsg.filename)) {
          const newMsg = newMessagesMap.get(oldMsg.filename);
          // 检查是否有属性变更
          if (oldMsg.marked !== newMsg.marked || oldMsg.download_exists !== newMsg.download_exists) {
            stateChanged = true;
            return { ...oldMsg, ...newMsg };
          }
        }
        return oldMsg;
      });

      // 2. 找出真正的新消息（不在当前列表中的）
      const existingFilenames = new Set(lastMessages.map(msg => msg.filename));
      const actualNewMessages = newMessages.filter(msg => !existingFilenames.has(msg.filename));
      
      if (actualNewMessages.length > 0 || stateChanged) {
        // 有新消息，添加到列表末尾（最新消息在后面）
        if (actualNewMessages.length > 0) {
          lastMessages = [...lastMessages, ...actualNewMessages];
        }
        totalMessages = result.total || 0;
        hasMoreMessages = result.has_more || false;
        
        // 如果当前在底部，或者由于状态更新触发，自动滚动/重新渲染
        const autoScroll = isMessageListAtBottom() || stateChanged;
        renderMessages(lastMessages, { scrollToBottom: autoScroll });
      } else {`;

// Standardize line endings for matching
const contentNorm = content.replace(/\r\n/g, '\n');
const oldCodeNorm = oldCode.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldCodeNorm)) {
    const updatedContentNorm = contentNorm.replace(oldCodeNorm, newCode);
    const finalContent = content.includes('\r\n') ? updatedContentNorm.replace(/\n/g, '\r\n') : updatedContentNorm;
    fs.writeFileSync(path, finalContent);
    console.log('Successfully updated frontend/main.js');
} else {
    console.error('Could not find the code block in frontend/main.js');
}