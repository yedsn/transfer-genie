// Settings page component logic for Transfer Genie

(function(globalScope) {
  if (!globalScope) {
    return;
  }

  const vueBridge = globalScope.transferGenieVue || null;
  if (!vueBridge || !vueBridge.isEnabled) {
    return;
  }

  const settingsPageActions = {
    // Settings snapshots
    refreshSettingsSnapshots: function() {
      if (typeof globalScope.loadSettingsSnapshots === 'function') {
        globalScope.loadSettingsSnapshots();
      }
    },

    restoreSettingsSnapshot: function(snapshot) {
      if (typeof globalScope.restoreSettingsSnapshotRecord === 'function') {
        globalScope.restoreSettingsSnapshotRecord(snapshot);
      }
    },

    // Settings backup archives
    refreshSettingsBackupArchives: function() {
      if (typeof globalScope.loadSettingsBackupArchives === 'function') {
        globalScope.loadSettingsBackupArchives();
      }
    },

    restoreSettingsBackupArchive: function(record) {
      if (typeof globalScope.restoreSettingsBackupArchiveRecord === 'function') {
        globalScope.restoreSettingsBackupArchiveRecord(record);
      }
    },

    // Auto backup field updates
    updateSettingsAutoBackupField: function(field, value) {
      if (typeof globalScope.updateSettingsAutoBackupField === 'function') {
        globalScope.updateSettingsAutoBackupField(field, value);
      }
    },

    // Settings form field updates
    updateSettingsFormField: function(field, value) {
      if (typeof globalScope.updateSettingsFormField === 'function') {
        globalScope.updateSettingsFormField(field, value);
      }
    },

    // WebDAV endpoint management
    updateSettingsWebdavField: function(endpoint, field, value) {
      if (typeof globalScope.updateVueWebdavEndpointField === 'function') {
        globalScope.updateVueWebdavEndpointField(endpoint, field, value);
      }
    },

    toggleSettingsWebdavEnabled: function(endpoint, checked) {
      if (typeof globalScope.toggleVueWebdavEndpointEnabled === 'function') {
        globalScope.toggleVueWebdavEndpointEnabled(endpoint, checked);
      }
    },

    activateSettingsWebdavEndpoint: function(endpoint, checked) {
      if (typeof globalScope.activateVueWebdavEndpoint === 'function') {
        globalScope.activateVueWebdavEndpoint(endpoint, checked);
      }
    },

    removeSettingsWebdavEndpoint: function(endpoint) {
      if (typeof globalScope.removeVueWebdavEndpoint === 'function') {
        globalScope.removeVueWebdavEndpoint(endpoint);
      }
    },

    testSettingsWebdavEndpoint: function(endpoint) {
      if (typeof globalScope.runVueWebdavSpeedTest === 'function') {
        globalScope.runVueWebdavSpeedTest(endpoint);
      }
    },
  };

  const existingActions = vueBridge.actions || {};
  vueBridge.setActions(Object.assign({}, existingActions, settingsPageActions));

  globalScope.transferGenieSettingsPage = {
    actions: settingsPageActions,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = settingsPageActions;
  }
})(typeof window !== 'undefined' ? window : globalThis);
