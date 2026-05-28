(function bootstrapFeedState(globalScope) {
  if (!globalScope) {
    return;
  }

  function cloneMessages(messages) {
    return Array.isArray(messages) ? messages.slice() : [];
  }

  function normalizeFilename(value) {
    return String(value || '').trim();
  }

  function buildMessageBoundary(message) {
    if (!message || !message.filename) {
      return null;
    }
    return {
      timestamp_ms: message.timestamp_ms || 0,
      filename: message.filename,
    };
  }

  function syncLoadedMessageBoundaries(messages) {
    var list = cloneMessages(messages);
    return {
      oldestLoadedMessageRef: list.length > 0 ? buildMessageBoundary(list[0]) : null,
      newestLoadedMessageRef: list.length > 0 ? buildMessageBoundary(list[list.length - 1]) : null,
    };
  }

  function resetLoadedMessagesState() {
    return {
      lastMessages: [],
      totalMessages: 0,
      hasMoreMessages: false,
      oldestLoadedMessageRef: null,
      newestLoadedMessageRef: null,
    };
  }

  function resolveDeletedFilenames(requestedFilenames, failedFilenames) {
    var failed = new Set(
      (Array.isArray(failedFilenames) ? failedFilenames : [])
        .map(normalizeFilename)
        .filter(Boolean)
    );
    return (Array.isArray(requestedFilenames) ? requestedFilenames : [])
      .map(normalizeFilename)
      .filter(function (filename) {
        return filename && !failed.has(filename);
      });
  }

  function pruneLoadedMessagesState(state, filenames) {
    var currentState = state || {};
    var targets = new Set(
      (Array.isArray(filenames) ? filenames : [])
        .map(normalizeFilename)
        .filter(Boolean)
    );
    var lastMessages = cloneMessages(currentState.lastMessages);
    if (targets.size === 0) {
      return {
        removedCount: 0,
        state: {
          lastMessages: lastMessages,
          totalMessages: Number(currentState.totalMessages || 0),
          hasMoreMessages: !!currentState.hasMoreMessages,
          oldestLoadedMessageRef: currentState.oldestLoadedMessageRef || null,
          newestLoadedMessageRef: currentState.newestLoadedMessageRef || null,
        },
      };
    }

    var nextMessages = lastMessages.filter(function (message) {
      return !targets.has(message.filename);
    });
    var removedCount = lastMessages.length - nextMessages.length;
    var nextTotalMessages = Math.max(0, Number(currentState.totalMessages || 0) - removedCount);
    var boundaries = syncLoadedMessageBoundaries(nextMessages);

    return {
      removedCount: removedCount,
      state: {
        lastMessages: nextMessages,
        totalMessages: nextTotalMessages,
        hasMoreMessages: nextTotalMessages > nextMessages.length,
        oldestLoadedMessageRef: boundaries.oldestLoadedMessageRef,
        newestLoadedMessageRef: boundaries.newestLoadedMessageRef,
      },
    };
  }

  function getCurrentMessageSearchState(rawQuery) {
    var query = String(rawQuery || '').trim();
    var normalizedQuery = query.toLowerCase();
    return {
      rawQuery: query,
      normalizedQuery: normalizedQuery,
      hasQuery: normalizedQuery.length > 0,
    };
  }

  function filterMessagesForSearch(messages, rawQuery) {
    // 后端已执行搜索过滤，前端只需透传
    var list = cloneMessages(messages);
    var searchState = getCurrentMessageSearchState(rawQuery);
    return {
      searchState: searchState,
      messages: list,
    };
  }

  function isMessageSelectionRefreshPaused(selectionMode) {
    return !!selectionMode;
  }

  function areStringArraysEqual(left, right) {
    var a = Array.isArray(left) ? left.slice() : [];
    var b = Array.isArray(right) ? right.slice() : [];
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  function reconcileCheckNewState(state, latestMessages, newerMessages, latestTotal, latestHasMoreBefore) {
    var currentState = state || {};
    var currentMessages = cloneMessages(currentState.lastMessages);
    var nextLatestMessages = cloneMessages(latestMessages);
    var nextNewerMessages = cloneMessages(newerMessages);
    var nextTotalMessages = Number(
      latestTotal != null ? latestTotal : currentState.totalMessages || 0
    );
    var nextHasMoreMessages = !!latestHasMoreBefore;

    if (nextNewerMessages.length === 0) {
      if (currentMessages.length === 0) {
        return {
          stateChanged: false,
          appendedCount: 0,
          shouldRender: false,
          state: {
            lastMessages: currentMessages,
            totalMessages: nextTotalMessages,
            hasMoreMessages: nextHasMoreMessages,
            oldestLoadedMessageRef: null,
            newestLoadedMessageRef: null,
          },
        };
      }

      var latestMap = new Map(
        nextLatestMessages.map(function (message) {
          return [message.filename, message];
        })
      );
      var metadataChanged = false;
      var patchedMessages = currentMessages.map(function (oldMessage) {
        var next = latestMap.get(oldMessage.filename);
        if (!next) {
          return oldMessage;
        }
        var changed =
          oldMessage.marked !== next.marked ||
          oldMessage.local_path !== next.local_path ||
          oldMessage.marked_pinned !== next.marked_pinned ||
          !areStringArraysEqual(oldMessage.marked_tag_ids || [], next.marked_tag_ids || []);
        if (changed) {
          metadataChanged = true;
          return Object.assign({}, oldMessage, next);
        }
        return oldMessage;
      });
      var unchangedBoundaries = syncLoadedMessageBoundaries(patchedMessages);
      return {
        stateChanged: metadataChanged,
        appendedCount: 0,
        shouldRender: metadataChanged,
        state: {
          lastMessages: patchedMessages,
          totalMessages: nextTotalMessages,
          hasMoreMessages: nextHasMoreMessages,
          oldestLoadedMessageRef: unchangedBoundaries.oldestLoadedMessageRef,
          newestLoadedMessageRef: unchangedBoundaries.newestLoadedMessageRef,
        },
      };
    }

    if (currentMessages.length === 0) {
      var initialBoundaries = syncLoadedMessageBoundaries(nextNewerMessages);
      return {
        stateChanged: true,
        appendedCount: nextNewerMessages.length,
        shouldRender: true,
        state: {
          lastMessages: nextNewerMessages,
          totalMessages: nextTotalMessages,
          hasMoreMessages: nextHasMoreMessages,
          oldestLoadedMessageRef: initialBoundaries.oldestLoadedMessageRef,
          newestLoadedMessageRef: initialBoundaries.newestLoadedMessageRef,
        },
      };
    }

    var newerMap = new Map(
      nextNewerMessages.map(function (message) {
        return [message.filename, message];
      })
    );
    var stateChanged = false;
    var updatedMessages = currentMessages.map(function (oldMessage) {
      if (!newerMap.has(oldMessage.filename)) {
        return oldMessage;
      }
      var next = newerMap.get(oldMessage.filename);
      var changed =
        oldMessage.marked !== next.marked ||
        oldMessage.local_path !== next.local_path ||
        oldMessage.marked_pinned !== next.marked_pinned ||
        !areStringArraysEqual(oldMessage.marked_tag_ids || [], next.marked_tag_ids || []);
      if (changed) {
        stateChanged = true;
        return Object.assign({}, oldMessage, next);
      }
      return oldMessage;
    });

    var existingFilenames = new Set(
      updatedMessages.map(function (message) {
        return message.filename;
      })
    );
    var actualNewMessages = nextNewerMessages.filter(function (message) {
      return !existingFilenames.has(message.filename);
    });
    if (actualNewMessages.length > 0) {
      updatedMessages = updatedMessages.concat(actualNewMessages);
      stateChanged = true;
    }

    var boundaries = syncLoadedMessageBoundaries(updatedMessages);
    return {
      stateChanged: stateChanged,
      appendedCount: actualNewMessages.length,
      shouldRender: stateChanged,
      state: {
        lastMessages: updatedMessages,
        totalMessages: nextTotalMessages,
        hasMoreMessages: nextHasMoreMessages,
        oldestLoadedMessageRef: boundaries.oldestLoadedMessageRef,
        newestLoadedMessageRef: boundaries.newestLoadedMessageRef,
      },
    };
  }

  function shouldAutoRefreshTick(input) {
    var state = input || {};
    if (state.isRefreshRunning) {
      return {
        shouldRefresh: false,
        nextCountdownSecs: Number(state.refreshCountdownSecs || 0),
        resetToInterval: false,
      };
    }
    if (!state.hasActiveEndpoint) {
      return {
        shouldRefresh: false,
        nextCountdownSecs: Number(state.intervalSecs || 0),
        resetToInterval: true,
      };
    }
    if (state.hasSearchQuery || state.hasActiveTransfer || state.selectionPaused) {
      return {
        shouldRefresh: false,
        nextCountdownSecs: Number(state.refreshCountdownSecs || 0),
        resetToInterval: false,
      };
    }
    if (state.activeTab === 'marked') {
      return {
        shouldRefresh: false,
        nextCountdownSecs: Number(state.intervalSecs || 0),
        resetToInterval: true,
      };
    }

    var nextCountdownSecs = Math.max(0, Number(state.refreshCountdownSecs || 0) - 1);
    return {
      shouldRefresh: nextCountdownSecs <= 0,
      nextCountdownSecs: nextCountdownSecs <= 0 ? Number(state.intervalSecs || 0) : nextCountdownSecs,
      resetToInterval: nextCountdownSecs <= 0,
    };
  }

  var api = {
    buildMessageBoundary: buildMessageBoundary,
    syncLoadedMessageBoundaries: syncLoadedMessageBoundaries,
    resetLoadedMessagesState: resetLoadedMessagesState,
    resolveDeletedFilenames: resolveDeletedFilenames,
    pruneLoadedMessagesState: pruneLoadedMessagesState,
    getCurrentMessageSearchState: getCurrentMessageSearchState,
    filterMessagesForSearch: filterMessagesForSearch,
    isMessageSelectionRefreshPaused: isMessageSelectionRefreshPaused,
    reconcileCheckNewState: reconcileCheckNewState,
    shouldAutoRefreshTick: shouldAutoRefreshTick,
  };

  globalScope.transferGenieFeedState = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
