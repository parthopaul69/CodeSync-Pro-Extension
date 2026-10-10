// CodeSync Pro — Options Script v4.0
'use strict';

const $ = id => document.getElementById(id);

// ── Token Obfuscation ────────────────────────────────────────────────────────
function obfuscate(str) {
  if (!str) return '';
  return btoa(unescape(encodeURIComponent(str.split('').reverse().join(''))));
}

function deobfuscate(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(escape(atob(str))).split('').reverse().join('');
  } catch(e) {
    return str;
  }
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'cfHandle', 'acHandle', 'tpHandle', 'ghToken', 'ghOwner', 'ghRepo',
    'cfEnabled', 'acEnabled', 'lcEnabled', 'tpEnabled', 'csesEnabled', 'soundEnabled',
    'langFilter', 'ghRepoPrivate', 'autoUpdateStatsCard',
    'editorTheme', 'editorFontSize', 'vimMode', 'defaultLanguage',
    'execApi', 'execApiUrl', 'execApiKey', 'execTimeout',
    'contestPlatforms', 'clistApiKey', 'contestNotify', 'contestNotifyMins'
  ]);

  if (data.cfHandle) $('cf-handle').value = data.cfHandle;
  if (data.acHandle) $('ac-handle').value = data.acHandle;
  if (data.tpHandle) $('tp-handle').value = data.tpHandle;
  if (data.ghToken) $('gh-token').value = deobfuscate(data.ghToken);
  if (data.ghOwner) $('gh-owner').value = data.ghOwner;
  if (data.ghRepo) $('gh-repo').value = data.ghRepo;
  if (data.langFilter !== undefined) $('lang-filter').value = data.langFilter;
  
  $('repo-private').checked = data.ghRepoPrivate === true;
  $('cf-enabled').checked = data.cfEnabled !== false;
  $('ac-enabled').checked = data.acEnabled !== false;
  $('lc-enabled').checked = data.lcEnabled !== false;
  $('tp-enabled').checked = data.tpEnabled !== false;
  if ($('cses-enabled')) $('cses-enabled').checked = data.csesEnabled !== false;
  $('sound-enabled').checked = data.soundEnabled !== false;
  if ($('auto-update-stats-card')) $('auto-update-stats-card').checked = data.autoUpdateStatsCard !== false;
  loadStatsCardPreview();

  // Preferences
  if (data.editorTheme) {
    let themeVal = data.editorTheme;
    if (themeVal === 'vscode') themeVal = 'vs-dark';
    else if (themeVal === 'onedark') themeVal = 'one-dark-pro';
    else if (themeVal === 'github') themeVal = 'github-dark';
    $('editor-theme').value = themeVal;
  }
  if (data.editorFontSize) {
    $('editor-font-size').value = data.editorFontSize;
    $('font-size-val').textContent = data.editorFontSize + 'px';
  }
  $('vim-mode').checked = data.vimMode === true;
  if (data.defaultLanguage) $('default-language').value = data.defaultLanguage;

  // Code Execution
  if (data.execApi) $('exec-api').value = data.execApi;
  if (data.execApiUrl) $('exec-api-url').value = data.execApiUrl;
  if (data.execApiKey) $('exec-api-key').value = deobfuscate(data.execApiKey);
  if (data.execTimeout) {
    $('exec-timeout').value = data.execTimeout;
    $('timeout-val').textContent = data.execTimeout + 's';
  }
  toggleExecApiUrl();

  // Contest Hub
  if (data.contestPlatforms) {
    try {
      const platforms = JSON.parse(data.contestPlatforms);
      document.querySelectorAll('input[name="contestPlatforms"]').forEach(cb => {
        cb.checked = platforms.includes(cb.value);
      });
    } catch(e) {}
  }
  if (data.clistApiKey) $('clist-api-key').value = deobfuscate(data.clistApiKey);
  $('contest-notify').checked = data.contestNotify !== false;
  if (data.contestNotifyMins) $('contest-notify-mins').value = data.contestNotifyMins;
  toggleNotifyMins();
}

function showInfoAlreadySaved(elId) {
  const el = $(elId);
  if (!el) return;
  el.className = 'status-msg info';
  el.style.display = 'flex';
  el.innerHTML = `ℹ️ Already saved — no changes detected.`;
  clearTimeout(el._infoTimer);
  el._infoTimer = setTimeout(() => {
    el.style.display = 'none';
    el.innerHTML = '';
  }, 4000);
}

function showStatus(type, message, elId = 'status-msg') {
  const el = $(elId);
  el.className = `status-msg ${type}`;
  el.style.display = 'flex';
  if (type === 'loading') {
    el.innerHTML = `<div class="spinner"></div> ${message}`;
  } else if (type === 'success') {
    el.innerHTML = `✅ ${message}`;
  } else if (type === 'error') {
    el.innerHTML = `❌ ${message}`;
  }
}

function hideStatus(elId = 'status-msg') {
  const el = $(elId);
  el.className = 'status-msg';
  el.style.display = 'none';
}

// Token visibility toggle
$('toggle-token').addEventListener('click', () => {
  const input = $('gh-token');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  $('toggle-token').textContent = isPassword ? '🙈' : '👁';
});

// UI Handlers
function toggleExecApiUrl() {
  const api = $('exec-api').value;
  $('exec-api-url-group').style.display = api === 'custom' ? 'block' : 'none';
}
$('exec-api').addEventListener('change', toggleExecApiUrl);

$('exec-timeout').addEventListener('input', e => {
  $('timeout-val').textContent = e.target.value + 's';
});

$('editor-font-size').addEventListener('input', e => {
  $('font-size-val').textContent = e.target.value + 'px';
});

function toggleNotifyMins() {
  $('notify-mins-group').style.display = $('contest-notify').checked ? 'block' : 'none';
}
$('contest-notify').addEventListener('change', toggleNotifyMins);

// Create Repo button
$('create-repo-btn').addEventListener('click', async () => {
  const ghOwner = $('gh-owner').value.trim();
  const ghRepo = $('gh-repo').value.trim();
  const ghToken = $('gh-token').value.trim();
  const isPrivate = $('repo-private').checked;

  if (!ghToken) { showStatus('error', 'Please enter your GitHub token first.', 'create-repo-msg'); return; }
  if (!ghRepo) { showStatus('error', 'Please enter a repository name first.', 'create-repo-msg'); return; }

  $('create-repo-btn').disabled = true;
  showStatus('loading', `Creating repository "${ghRepo}"…`, 'create-repo-msg');

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'CREATE_REPO',
      ghToken, repoName: ghRepo, isPrivate
    });
    if (result && result.ok) {
      await chrome.storage.local.set({ ghRepoPrivate: isPrivate });
      showStatus('success', `Repository "${ghRepo}" created successfully! ${isPrivate ? '🔒 Private' : '🌐 Public'}`, 'create-repo-msg');
      setTimeout(() => hideStatus('create-repo-msg'), 4000);
    } else {
      showStatus('error', (result && result.error) || 'Failed to create repository.', 'create-repo-msg');
    }
  } catch(e) {
    showStatus('error', `Error: ${e.message}`, 'create-repo-msg');
  } finally {
    $('create-repo-btn').disabled = false;
  }
});

// Save & Test button
$('save-btn').addEventListener('click', async () => {
  const cfHandle = $('cf-handle').value.trim();
  const acHandle = $('ac-handle').value.trim();
  const tpHandle = $('tp-handle').value.trim();
  const ghToken = $('gh-token').value.trim();
  const ghOwner = $('gh-owner').value.trim();
  const ghRepo = $('gh-repo').value.trim();
  const langFilter = $('lang-filter').value.trim();
  const ghRepoPrivate = $('repo-private').checked;

  if (!ghToken || !ghOwner || !ghRepo) {
    showStatus('error', 'GitHub username, repository name and token are required.');
    return;
  }

  // Detect if nothing changed
  const existing = await chrome.storage.local.get(['cfHandle', 'acHandle', 'tpHandle', 'ghToken', 'ghOwner', 'ghRepo', 'langFilter', 'ghRepoPrivate']);
  const tokenUnchanged = ghToken === deobfuscate(existing.ghToken || '');
  if (
    cfHandle === (existing.cfHandle || '') &&
    acHandle === (existing.acHandle || '') &&
    tpHandle === (existing.tpHandle || '') &&
    tokenUnchanged &&
    ghOwner === (existing.ghOwner || '') &&
    ghRepo === (existing.ghRepo || '') &&
    langFilter === (existing.langFilter || '') &&
    ghRepoPrivate === (existing.ghRepoPrivate || false)
  ) {
    showInfoAlreadySaved('status-msg');
    return;
  }

  const cfEnabled = $('cf-enabled').checked;
  const acEnabled = $('ac-enabled').checked;
  const lcEnabled = $('lc-enabled').checked;
  const tpEnabled = $('tp-enabled').checked;
  const csesEnabled = $('cses-enabled') ? $('cses-enabled').checked : true;
  if (!cfEnabled && !acEnabled && !lcEnabled && !tpEnabled && !csesEnabled) {
    showStatus('error', 'At least one platform must remain enabled.');
    return;
  }

  $('save-btn').disabled = true;
  showStatus('loading', 'Testing connection…');

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'TEST_CONFIG',
      cfHandle, ghToken, ghOwner, ghRepo
    });

    if (result && result.ok) {
      const repoChanged = ghOwner !== (existing.ghOwner || '') || ghRepo !== (existing.ghRepo || '');
      const saveData = {
        cfHandle, acHandle, tpHandle,
        ghToken: obfuscate(ghToken), ghOwner, ghRepo, langFilter, ghRepoPrivate,
        cfEnabled, acEnabled, lcEnabled, tpEnabled, csesEnabled,
        soundEnabled: $('sound-enabled').checked
      };

      if (repoChanged) {
        saveData.syncLog = [];
        saveData.totalSynced = 0;
        saveData.lastSyncedId = '';
      }

      await chrome.storage.local.set(saveData);

      let successMsg = 'Configuration saved!';
      if (result.results) {
        if (result.results.cf === 'ok') successMsg += ' CF Validated!';
        else if (result.results.cf) successMsg += ` CF Warning: ${result.results.cf}`;
        if (result.results.github === 'repo_not_found') {
          successMsg += ' (Repo will be auto-created on first sync)';
        }
      }
      showStatus('success', successMsg);
      setTimeout(() => hideStatus('status-msg'), 4000);
    } else {
      const errMsg = (result && result.error) || (result && result.results && result.results.github) || 'Verification failed.';
      showStatus('error', errMsg);
    }
  } catch(e) {
    showStatus('error', `Error: ${e.message}`);
  } finally {
    $('save-btn').disabled = false;
  }
});

// Save toggles immediately on change
const toggles = ['cf-enabled', 'ac-enabled', 'lc-enabled', 'tp-enabled', 'cses-enabled', 'sound-enabled', 'repo-private', 'vim-mode', 'contest-notify'];
for (const id of toggles) {
  if (!$(id)) continue;
  $(id).addEventListener('change', async () => {
    if (['cf-enabled', 'ac-enabled', 'lc-enabled', 'tp-enabled', 'cses-enabled'].includes(id)) {
      const cfChecked = $('cf-enabled').checked;
      const acChecked = $('ac-enabled').checked;
      const lcChecked = $('lc-enabled').checked;
      const tpChecked = $('tp-enabled').checked;
      const csesChecked = $('cses-enabled') ? $('cses-enabled').checked : true;
      if (!cfChecked && !acChecked && !lcChecked && !tpChecked && !csesChecked) {
        $(id).checked = true;
        showStatus('error', 'At least one platform must remain enabled.');
        setTimeout(() => hideStatus('status-msg'), 4000);
        return;
      }
    }
    const key = id === 'repo-private' ? 'ghRepoPrivate' : id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    await chrome.storage.local.set({ [key]: $(id).checked });
  });
}

// Immediate save for preferences dropdowns
if ($('editor-theme')) {
  $('editor-theme').addEventListener('change', async () => {
    await chrome.storage.local.set({ editorTheme: $('editor-theme').value });
  });
}
if ($('default-language')) {
  $('default-language').addEventListener('change', async () => {
    await chrome.storage.local.set({ defaultLanguage: $('default-language').value });
  });
}

// Listen for real-time changes from IDE or Popup (bidirectional sync)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.editorTheme && $('editor-theme')) {
    let val = changes.editorTheme.newValue || 'vs-dark';
    if (val === 'vs-light') val = 'vs';
    $('editor-theme').value = val;
  }
  if (changes.soundEnabled !== undefined && $('sound-enabled')) {
    $('sound-enabled').checked = changes.soundEnabled.newValue !== false;
  }
  if (changes.defaultLanguage && $('default-language')) {
    $('default-language').value = changes.defaultLanguage.newValue;
  }
});

// Platform Save Buttons
async function savePlatformHandle(platformName, handleId, enabledId, msgId, btnId) {
  const handle = $(handleId).value.trim();
  const enabled = $(enabledId).checked;

  if (!handle) {
    showStatus('error', `Please enter a ${platformName} handle.`, msgId);
    return;
  }

  const handleKey = handleId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const enabledKey = enabledId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const existing = await chrome.storage.local.get([handleKey, enabledKey]);
  
  if (handle === (existing[handleKey] || '') && enabled === (existing[enabledKey] !== false)) {
    showInfoAlreadySaved(msgId);
    return;
  }

  $(btnId).disabled = true;
  showStatus('loading', `Saving ${platformName} handle...`, msgId);

  try {
    if (platformName === 'Codeforces' && handle) {
      const validatePromise = chrome.runtime.sendMessage({ type: 'VALIDATE_CF', cfHandle: handle }).catch(() => null);
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ ok: true, timedOut: true }), 3500));
      const res = await Promise.race([validatePromise, timeoutPromise]);
      if (res && !res.ok && !res.timedOut) {
        const errStr = res.error || '';
        if (errStr.toLowerCase().includes('not found') || errStr.toLowerCase().includes('invalid')) {
          throw new Error('Codeforces handle not found. Please double-check it.');
        }
      }
    }
    
    await chrome.storage.local.set({ [handleKey]: handle, [enabledKey]: enabled });

    const ghCfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo']);
    const ghOk = ghCfg.ghToken && ghCfg.ghOwner && ghCfg.ghRepo;
    const suffix = ghOk ? '' : ' (Note: Configure GitHub to enable sync)';
    showStatus('success', `${platformName} handle saved!${suffix}`, msgId);
    setTimeout(() => hideStatus(msgId), 5000);
  } catch(e) {
    showStatus('error', e.message, msgId);
  } finally {
    $(btnId).disabled = false;
  }
}

$('cf-save-btn').addEventListener('click', () => savePlatformHandle('Codeforces', 'cf-handle', 'cf-enabled', 'cf-status-msg', 'cf-save-btn'));
$('ac-save-btn').addEventListener('click', () => savePlatformHandle('AtCoder', 'ac-handle', 'ac-enabled', 'ac-status-msg', 'ac-save-btn'));
$('tp-save-btn').addEventListener('click', () => savePlatformHandle('Toph', 'tp-handle', 'tp-enabled', 'tp-status-msg', 'tp-save-btn'));

// Preferences Save Button
$('pref-save-btn').addEventListener('click', async () => {
  const langFilter = $('lang-filter').value.trim();
  const soundEnabled = $('sound-enabled').checked;
  const editorTheme = $('editor-theme').value;
  const editorFontSize = parseInt($('editor-font-size').value, 10);
  const vimMode = $('vim-mode').checked;
  const defaultLanguage = $('default-language').value;

  const execApi = $('exec-api').value;
  const execApiUrl = $('exec-api-url').value.trim();
  const execApiKey = $('exec-api-key').value.trim();
  const execTimeout = parseInt($('exec-timeout').value, 10);

  const contestPlatforms = Array.from(document.querySelectorAll('input[name="contestPlatforms"]:checked')).map(cb => cb.value);
  const clistApiKey = $('clist-api-key').value.trim();
  const contestNotify = $('contest-notify').checked;
  const contestNotifyMins = parseInt($('contest-notify-mins').value, 10);

  $('pref-save-btn').disabled = true;
  showStatus('loading', 'Saving all preferences...', 'pref-status-msg');

  try {
    await chrome.storage.local.set({ 
      langFilter, soundEnabled,
      editorTheme, editorFontSize, vimMode, defaultLanguage,
      execApi, execApiUrl, execApiKey: obfuscate(execApiKey), execTimeout,
      contestPlatforms: JSON.stringify(contestPlatforms), clistApiKey: obfuscate(clistApiKey), contestNotify, contestNotifyMins
    });
    showStatus('success', 'Preferences saved successfully!', 'pref-status-msg');
    setTimeout(() => hideStatus('pref-status-msg'), 4000);
  } catch(e) {
    showStatus('error', e.message, 'pref-status-msg');
  } finally {
    $('pref-save-btn').disabled = false;
  }
});

// ── Template Manager in Options ──────────────────────────────────────────────
async function renderOptionsTemplates() {
  const container = $('options-templates-list');
  if (!container) return;
  container.innerHTML = '';

  const stored = await chrome.storage.local.get(['customTemplates', 'defaultTemplateId']);
  const customTemplates = stored.customTemplates || [];
  const defaultTemplateId = stored.defaultTemplateId || 'mini_cpp';

  const allTemplates = [
    ...(typeof CP_TEMPLATES !== 'undefined' ? CP_TEMPLATES : []),
    ...customTemplates
  ];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  allTemplates.forEach(tpl => {
    const isDef = tpl.id === defaultTemplateId;
    const item = document.createElement('div');
    item.className = `template-item ${isDef ? 'is-default' : ''}`;
    item.dataset.id = tpl.id;

    item.innerHTML = `
      <div class="template-main-row">
        <div class="template-info">
          <div class="template-title-row">
            <span class="template-title">${escapeHtml(tpl.name)}</span>
            <span class="badge-lang">${escapeHtml(tpl.language)}</span>
            ${isDef ? `
              <span class="badge-default">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Active Default</span>
              </span>
            ` : ''}
          </div>
          <div class="template-desc">${escapeHtml(tpl.description || 'Custom starter template')}</div>
        </div>
        <div class="template-actions">
          <button type="button" class="btn btn-sm btn-ghost btn-opt-preview" data-id="${tpl.id}" title="Preview template source code">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            <span>View Code</span>
          </button>
          ${!isDef ? `
            <button type="button" class="btn btn-sm btn-secondary btn-opt-def" data-id="${tpl.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>Set as Default</span>
            </button>
          ` : ''}
          ${!tpl.isBuiltin ? `
            <button type="button" class="btn btn-sm btn-danger-ghost btn-opt-del" data-id="${tpl.id}" title="Delete template">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Delete</span>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="template-preview-drawer" id="preview-${tpl.id}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:11px; color:var(--muted); font-family:monospace; text-transform:uppercase;">${escapeHtml(tpl.language)} Template Code</span>
          <button type="button" class="btn-copy-code" data-id="${tpl.id}" style="background:none; border:none; color:var(--accent); font-size:11px; cursor:pointer; font-weight:600; padding:2px 4px;">Copy Code</button>
        </div>
        <pre class="template-code-pre"><code>${escapeHtml(tpl.code || '')}</code></pre>
      </div>
    `;

    // Hook up preview drawer toggle
    const prevBtn = item.querySelector('.btn-opt-preview');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const drawer = item.querySelector(`#preview-${tpl.id}`);
        if (drawer) {
          const isOpen = drawer.classList.toggle('open');
          const btnSpan = prevBtn.querySelector('span');
          if (btnSpan) btnSpan.textContent = isOpen ? 'Hide Code' : 'View Code';
        }
      });
    }

    // Hook up copy code
    const copyBtn = item.querySelector('.btn-copy-code');
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(tpl.code || '');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 1500);
        } catch(err) {}
      });
    }

    const defBtn = item.querySelector('.btn-opt-def');
    if (defBtn) {
      defBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.storage.local.set({ 
          defaultTemplateId: tpl.id,
          defaultTemplateCode: tpl.code,
          defaultTemplateLang: tpl.language,
          draft_scratchpad: tpl.code
        });
        renderOptionsTemplates();
      });
    }

    const delBtn = item.querySelector('.btn-opt-del');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete custom template "${tpl.name}"?`)) {
          const updated = customTemplates.filter(t => t.id !== tpl.id);
          await chrome.storage.local.set({ customTemplates: updated });
          renderOptionsTemplates();
        }
      });
    }

    container.appendChild(item);
  });
}

const addTplBtn = $('options-add-template-btn');
if (addTplBtn) {
  addTplBtn.addEventListener('click', () => {
    $('options-template-modal').style.display = 'block';
  });
}

const cancelTplBtn = $('opt-tpl-cancel-btn');
if (cancelTplBtn) {
  cancelTplBtn.addEventListener('click', () => {
    $('options-template-modal').style.display = 'none';
  });
}

const saveTplBtn = $('opt-tpl-save-btn');
if (saveTplBtn) {
  saveTplBtn.addEventListener('click', async () => {
    const name = $('opt-tpl-name').value.trim();
    const lang = $('opt-tpl-lang').value;
    const code = $('opt-tpl-code').value.trim();
    if (!name || !code) {
      alert('Please enter a template name and code.');
      return;
    }

    const stored = await chrome.storage.local.get('customTemplates');
    const list = stored.customTemplates || [];
    list.push({
      id: 'custom_' + Date.now(),
      name,
      language: lang,
      code,
      isBuiltin: false,
      description: `Custom ${lang.toUpperCase()} template`
    });
    await chrome.storage.local.set({ customTemplates: list });
    $('opt-tpl-name').value = '';
    $('opt-tpl-code').value = '';
    $('options-template-modal').style.display = 'none';
    renderOptionsTemplates();
  });
}

const resetTplBtn = $('options-reset-templates-btn');
if (resetTplBtn) {
  resetTplBtn.addEventListener('click', async () => {
    if (confirm('Reset templates to default recommended templates (including Mini CP Template)?')) {
      await chrome.storage.local.remove(['customTemplates']);
      await chrome.storage.local.set({ defaultTemplateId: 'mini_cpp' });
      renderOptionsTemplates();
    }
  });
}

// Save on Enter key
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (document.activeElement.tagName !== 'BUTTON') {
      const activeId = document.activeElement.id;
      if (activeId === 'cf-handle') $('cf-save-btn').click();
      else if (activeId === 'ac-handle') $('ac-save-btn').click();
      else if (activeId === 'tp-handle') $('tp-save-btn').click();
      else if (activeId === 'gh-owner' || activeId === 'gh-repo' || activeId === 'gh-token') $('save-btn').click();
      else $('pref-save-btn').click();
    }
  }
});

// ─── Stats Card Settings & Preview ────────────────────────────────────────────
async function loadStatsCardPreview() {
  const preview = $('options-stats-card-preview');
  const input = $('options-stats-embed-code');
  if (preview) preview.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATS_CARD_DATA' });
    if (res && res.ok) {
      if (preview) {
        preview.innerHTML = res.svg.replace('<svg ', '<svg style="width:100%;max-width:550px;height:auto;display:block;border-radius:8px;" ');
      }
      if (input) {
        input.value = res.embedCode || '';
      }
    } else {
      if (preview) preview.innerHTML = '<span style="color:var(--text-secondary);font-size:12px;">Configure your GitHub repository to generate the card preview.</span>';
    }
  } catch (err) {
    if (preview) preview.innerHTML = `<span style="color:var(--red);font-size:12px;">Error: ${err.message}</span>`;
  }
}

$('auto-update-stats-card')?.addEventListener('change', async () => {
  const checked = $('auto-update-stats-card').checked;
  await chrome.storage.local.set({ autoUpdateStatsCard: checked });
});

$('options-copy-stats-code-btn')?.addEventListener('click', async () => {
  const input = $('options-stats-embed-code');
  if (!input || !input.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    const btn = $('options-copy-stats-code-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  } catch (err) {
    input.select();
    document.execCommand('copy');
  }
});

$('options-push-card-btn')?.addEventListener('click', async () => {
  const btn = $('options-push-card-btn');
  const msg = $('options-push-card-msg');
  if (!btn) return;
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Pushing to GitHub…';
  if (msg) {
    msg.className = 'status-msg loading';
    msg.textContent = 'Generating vector SVG and committing codesync-stats.svg to GitHub…';
  }

  try {
    const res = await chrome.runtime.sendMessage({ type: 'PUSH_STATS_CARD' });
    if (res && res.ok) {
      if (msg) {
        msg.className = 'status-msg success';
        msg.textContent = 'Successfully committed codesync-stats.svg to GitHub repository root!';
      }
      await loadStatsCardPreview();
    } else {
      if (msg) {
        msg.className = 'status-msg error';
        msg.textContent = res?.error || 'Failed to push stats card.';
      }
    }
  } catch (err) {
    if (msg) {
      msg.className = 'status-msg error';
      msg.textContent = err.message;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
});

loadSettings();
renderOptionsTemplates();

