// Marked page component logic for Transfer Genie

(function(globalScope) {
  if (!globalScope) {
    return;
  }

  const vueBridge = globalScope.transferGenieVue || null;
  if (!vueBridge || !vueBridge.isEnabled) {
    return;
  }

  const markedPageActions = {
    // Marked page navigation
    changeMarkedPage: function(nextPage) {
      if (typeof globalScope.changeMarkedPage === 'function') {
        globalScope.changeMarkedPage(nextPage);
      }
    },

    // Message selection
    toggleMarkedMessageSelection: function(message, checked) {
      if (typeof globalScope.toggleSelectedMarkedMessage === 'function') {
        globalScope.toggleSelectedMarkedMessage(message, checked);
      }
    },

    // Mark message modal
    openMarkMessageModal: function(message) {
      if (typeof globalScope.openMarkMessageModal === 'function') {
        globalScope.openMarkMessageModal(message);
      }
    },

    // Pin toggle
    toggleMarkedMessagePin: function(message) {
      if (typeof globalScope.toggleMarkedMessagePin === 'function') {
        globalScope.toggleMarkedMessagePin(message);
      }
    },

    // Expand/collapse long messages
    toggleMarkedMessageExpanded: function(message) {
      // Toggle expanded state in view model
      message.isCollapsed = !message.isCollapsed;
      message.expandLabel = message.isCollapsed ? '展开' : '收起';
      // Force re-render via Vue
      const store = vueBridge.store;
      if (store && store.markedPage) {
        const msgs = store.markedPage.messages || [];
        const idx = msgs.findIndex(function(m) { return m.key === message.key; });
        if (idx >= 0) {
          msgs[idx] = message;
        }
      }
    },

    // Message actions (reuse from home page)
    toggleMessageMarked: function(message) {
      if (typeof globalScope.toggleMessageMarked === 'function') {
        globalScope.toggleMessageMarked(message);
      }
    },

    copyText: function(message) {
      if (typeof globalScope.downloadTextMessageAsFile === 'function') {
        globalScope.downloadTextMessageAsFile(message);
      }
    },

    downloadTextMessageAsFile: function(message) {
      if (typeof globalScope.downloadTextMessageAsFile === 'function') {
        globalScope.downloadTextMessageAsFile(message);
      }
    },

    downloadMessageFile: function(message) {
      if (typeof globalScope.downloadMessageFile === 'function') {
        globalScope.downloadMessageFile(message);
      }
    },

    openMessagePreview: function(message) {
      if (typeof globalScope.openMessagePreview === 'function') {
        globalScope.openMessagePreview(message);
      }
    },
  };

  // Extend existing actions (don't replace)
  const existingActions = vueBridge.actions || {};
  vueBridge.setActions(Object.assign({}, existingActions, markedPageActions));

  globalScope.transferGenieMarkedPage = {
    actions: markedPageActions,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = markedPageActions;
  }
})(typeof window !== 'undefined' ? window : globalThis);
