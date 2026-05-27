// Home page component logic for Transfer Genie
// This file extends the home-page-shell Vue component with page-specific methods

(function(globalScope) {
  if (!globalScope) {
    return;
  }

  const vueBridge = globalScope.transferGenieVue || null;
  if (!vueBridge || !vueBridge.isEnabled) {
    return;
  }

  // Home page actions are registered via vueBridge.setActions
  // These actions connect Vue components to main.js business logic
  const homePageActions = {
    // Message preview
    openMessagePreview: function(message) {
      if (typeof globalScope.openMessagePreview === 'function') {
        globalScope.openMessagePreview(message);
      }
    },

    // Message actions
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

    openMessageFile: function(message) {
      if (typeof globalScope.openMessageFile === 'function') {
        globalScope.openMessageFile(message);
      }
    },

    downloadMessageFile: function(message) {
      if (typeof globalScope.downloadMessageFile === 'function') {
        globalScope.downloadMessageFile(message);
      }
    },

    saveMessageFileAs: function(message) {
      if (typeof globalScope.saveMessageFileAs === 'function') {
        globalScope.saveMessageFileAs(message);
      }
    },

    deleteSingleMessage: function(message) {
      if (typeof globalScope.deleteSingleMessage === 'function') {
        globalScope.deleteSingleMessage(message);
      }
    },
  };

  // Register home page actions with Vue bridge
  vueBridge.setActions(homePageActions);

  globalScope.transferGenieHomePage = {
    actions: homePageActions,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = homePageActions;
  }
})(typeof window !== 'undefined' ? window : globalThis);
