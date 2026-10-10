// CodeSync Pro — LeetCode Content Script v2.0
'use strict';

(function () {
  var syncCooldown = false;
  var lastSyncedSlug = null;

  function isContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function getTitleSlug() {
    var m = window.location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getProblemTitle() {
    var selectors = [
      '[data-cy="question-title"]',
      '.text-title-large a',
      '.text-title-large',
      'div[class*="title"] a',
      'h1'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    var slug = getTitleSlug() || '';
    return slug.split('-').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  function getDifficulty() {
    var selectors = [
      '[diff]',
      'div[class*="text-difficulty"]',
      'div[class*="Difficulty"]',
      '[class*="difficulty"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        var text = el.textContent.trim();
        var cls = (el.className || '') + (el.getAttribute('diff') || '');
        if (text === 'Easy' || cls.toLowerCase().includes('easy')) return 'Easy';
        if (text === 'Medium' || cls.toLowerCase().includes('medium')) return 'Medium';
        if (text === 'Hard' || cls.toLowerCase().includes('hard')) return 'Hard';
      }
    }
    return 'Unknown';
  }

  function getLanguage() {
    var selectors = [
      'button[id*="language"]',
      'div[class*="language-select"] button',
      'div[class*="editor"] button',
      '[class*="language"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        var text = el.textContent.trim().toLowerCase();
        if (['c++', 'cpp', 'c', 'java', 'python', 'python3', 'javascript', 'js', 'typescript', 'ts', 'rust', 'go', 'kotlin', 'swift'].includes(text)) {
          return text;
        }
      }
    }
    return 'cpp';
  }

  function getCode() {
    var editor = document.querySelector('.monaco-editor');
    if (editor && editor.textContent) {
      var lines = document.querySelectorAll('.view-lines .view-line');
      if (lines.length > 0) {
        return Array.from(lines).map(function(l) { return l.textContent; }).join('\n');
      }
    }
    return null;
  }

  function getRuntime() {
    var selectors = [
      'span[class*="runtime"]',
      'div[class*="runtime"]',
      '[class*="Runtime"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        var match = el.textContent.match(/(\d+(?:\.\d+)?)\s*ms/);
        if (match) return parseFloat(match[1]) || 0;
      }
    }
    return 0;
  }

  function getMemory() {
    var selectors = [
      'span[class*="memory"]',
      'div[class*="memory"]',
      '[class*="Memory"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        var match = el.textContent.match(/(\d+(?:\.\d+)?)\s*(?:MB|KB|GB)/i);
        if (match) {
          var val = parseFloat(match[1]) || 0;
          if (el.textContent.toLowerCase().includes('kb')) return val / 1024;
          return val;
        }
      }
    }
    return 0;
  }

  function isAccepted() {
    var verdict = document.querySelector('[data-e2e-locator="submission-result"]');
    if (verdict && verdict.textContent.trim().toLowerCase() === 'accepted') return true;

    var greenSpans = document.querySelectorAll('span, div');
    for (var i = 0; i < greenSpans.length; i++) {
      var text = greenSpans[i].textContent.trim().toLowerCase();
      if ((text === 'accepted' || text === 'success') &&
          (greenSpans[i].style.color === 'rgb(44, 187, 93)' ||
           greenSpans[i].className.toString().includes('green') ||
           greenSpans[i].className.toString().includes('success'))) {
        return true;
      }
    }

    var resultPanel = document.querySelector('[class*="ResultPanel"], [class*="result-panel"]');
    if (resultPanel && resultPanel.textContent.toLowerCase().includes('accepted')) return true;
    return false;
  }

  async function trySync() {
    try {
      if (!isContextValid()) return;
      if (!getTitleSlug()) return;
      if (syncCooldown) return;
      if (!isAccepted()) return;

      var slug = getTitleSlug();
      if (slug === lastSyncedSlug) return;

      syncCooldown = true;
      lastSyncedSlug = slug;
      setTimeout(function() { syncCooldown = false; }, 30000);

      const settings = await chrome.storage.local.get('lcEnabled');
      if (!isContextValid()) {
        syncCooldown = false;
        lastSyncedSlug = null;
        return;
      }
      if (settings.lcEnabled === false) {
        syncCooldown = false;
        lastSyncedSlug = null;
        return;
      }

      var title = getProblemTitle();
      var difficulty = getDifficulty();
      var language = getLanguage();
      var code = getCode();
      var runtime = getRuntime();
      var memory = getMemory();

      if (!title || !code) {
        syncCooldown = false;
        lastSyncedSlug = null;
        return;
      }

      chrome.runtime.sendMessage({
        type: 'SYNC_LC',
        data: {
          titleSlug: slug,
          title: title,
          difficulty: difficulty,
          language: language,
          code: code,
          runtime: runtime,
          memory: memory,
          url: window.location.href
        }
      }, function(response) {
        try {
          if (chrome.runtime.lastError) {
            console.error('[CodeSync LC] Message error:', chrome.runtime.lastError.message);
            return;
          }
          if (response && response.ok) {
            console.log('[CodeSync LC] Sync successful:', title);
          } else if (response) {
            console.error('[CodeSync LC] Sync failed:', response.error);
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  try {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.addedNodes.length > 0) {
          setTimeout(function() {
            try {
              if (!isContextValid()) return;
              trySync();
            } catch (e) {}
          }, 500);
          break;
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        try {
          observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
      });
    }
  } catch (e) {}

  setTimeout(trySync, 2000);

  // Remove legacy "Synced to GitHub" floating badge if present in DOM
  const strayBadge = document.getElementById('codesync-pro-badge');
  if (strayBadge) strayBadge.remove();

  let lastContentSoundPlayTime = 0;
  function playNotificationSound() {
    const now = Date.now();
    if (now - lastContentSoundPlayTime < 2500) return;
    lastContentSoundPlayTime = now;
    chrome.storage.local.get(['soundEnabled'], (d) => {
      if (d && d.soundEnabled === false) return;
      try {
        const url = chrome.runtime.getURL('noti.mp3');
        const audio = new Audio(url);
        audio.volume = 1.0;
        const p = audio.play();
        if (p && p.catch) {
          p.catch(() => {
            try {
              const AudioContextClass = window.AudioContext || window.webkitAudioContext;
              if (!AudioContextClass) return;
              const ctx = new AudioContextClass();
              fetch(url)
                .then(r => r.arrayBuffer())
                .then(b => ctx.decodeAudioData(b))
                .then(buf => {
                  const src = ctx.createBufferSource();
                  src.buffer = buf;
                  src.connect(ctx.destination);
                  src.start(0);
                }).catch(() => {});
            } catch(e) {}
          });
        }
      } catch(e) {}
    });
  }

  try {
    if (isContextValid()) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          if (!isContextValid()) return;
          if (message.type === 'PLAY_SOUND') {
            playNotificationSound();
            sendResponse({ ok: true });
            return false;
          }

          if (message.type === 'FETCH_URL') {
            fetch(message.url)
              .then(async (response) => {
                if (!response.ok) {
                  sendResponse({ ok: false, status: response.status });
                  return;
                }
                const buffer = await response.arrayBuffer();
                const text = new TextDecoder('utf-8').decode(buffer);
                sendResponse({ ok: true, text: text, url: response.url });
              })
              .catch((err) => {
                sendResponse({ ok: false, error: err.message });
              });
            return true; // Keep the message channel open for async response
          }

          if (message.type === 'TOGGLE_ZEN_MODE') {
            document.querySelectorAll('[data-track-load="description_content"] div[class*="tag"]').forEach(el => {
              el.style.display = message.enabled ? 'none' : '';
            });
            sendResponse({ ok: true });
            return false;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Clean up any lingering floating IDE button or badge (LeetCode is sync-only)
  setInterval(function() {
    try {
      if (!isContextValid()) return;
      const oldBtn = document.getElementById('codesync-ide-btn');
      if (oldBtn) oldBtn.remove();
      const oldBadge = document.getElementById('codesync-pro-badge');
      if (oldBadge) oldBadge.remove();
    } catch (e) {}
  }, 3000);

})();
