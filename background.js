// CodeSync Pro — Background Service Worker v3.0
'use strict';

const GH_API = 'https://api.github.com';
const CF_API = 'https://codeforces.com/api';

let scraperTabId = null;

async function logDebug(msg) {
  try {
    const { debugLog = [] } = await chrome.storage.local.get('debugLog');
    debugLog.push(`${new Date().toISOString()} - ${msg}`);
    await chrome.storage.local.set({ debugLog: debugLog.slice(-200) });
  } catch(e) {}
}

// ── Auto-clear stale AC problem caches on every service worker start ──────────
// This runs every time the extension reloads — no manual action needed.
// Stale entries have a title but no body/content (from old buggy parse).
(async () => {
  try {
    const data = await chrome.storage.local.get(null);
    const staleKeys = Object.keys(data).filter(k => {
      if (!k.startsWith('ac_prob_')) return false;
      const v = data[k];
      // Keep only entries that actually have content
      return !(v.body || v.bodyMarkdown || v.inputSpec || v.constraints || v.samples);
    });
    if (staleKeys.length > 0) {
      await chrome.storage.local.remove(staleKeys);
      console.log('[CodeSync] Auto-cleared stale AC caches:', staleKeys);
    }
  } catch(e) {}
})();


async function waitForTabToLoad(tabId, maxWaitMs = 8000) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, maxWaitMs);

    function listener(changeTabId, changeInfo) {
      if (changeTabId === tabId && changeInfo.status === 'complete') {
        resolved = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    
    // Check if already complete
    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete' && !resolved) {
        resolved = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

async function fetchViaScraperTab(url) {
  let createdNew = false;
  let tab = null;

  try {
    const existingTabs = await chrome.tabs.query({ url: '*://atcoder.jp/*' });
    if (existingTabs.length > 0) {
      tab = existingTabs[0];
      await logDebug(`fetchViaScraperTab: using existing AtCoder tab ${tab.id}`);
    } else {
      if (scraperTabId !== null) {
        try {
          tab = await chrome.tabs.get(scraperTabId);
          await logDebug(`fetchViaScraperTab: using current scraperTabId ${scraperTabId}`);
        } catch(e) {
          scraperTabId = null;
        }
      }
      if (!tab) {
        await logDebug('fetchViaScraperTab: creating background scraper tab');
        tab = await chrome.tabs.create({ url: 'https://atcoder.jp/', active: false });
        scraperTabId = tab.id;
        createdNew = true;
        await waitForTabToLoad(tab.id, 8000);
      }
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (fetchUrl) => {
        try {
          const response = await fetch(fetchUrl);
          if (!response.ok) return { ok: false, status: response.status };
          const buffer = await response.arrayBuffer();
          const text = new TextDecoder('utf-8').decode(buffer);
          return { ok: true, text, url: response.url };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      args: [url]
    });
    return result;
  } catch (err) {
    await logDebug(`fetchViaScraperTab error: ${err.message}`);
    return null;
  } finally {
    if (createdNew && !isSyncing && tab) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      if (scraperTabId === tab.id) {
        scraperTabId = null;
      }
    }
  }
}

async function fetchViaTab(tabUrlPattern, url) {
  try {
    await logDebug(`fetchViaTab pattern: ${tabUrlPattern}, url: ${url}`);
    let patterns = [tabUrlPattern];
    
    // Normalize patterns to match manifest host permissions exactly
    if (tabUrlPattern.includes('codeforces.com')) {
      patterns = ['https://codeforces.com/*', 'https://mirror.codeforces.com/*'];
    } else if (tabUrlPattern.includes('atcoder.jp')) {
      patterns = ['https://atcoder.jp/*'];
    } else if (tabUrlPattern.includes('leetcode.com')) {
      patterns = ['https://leetcode.com/*'];
    } else if (tabUrlPattern.includes('toph.co')) {
      patterns = ['https://toph.co/*'];
    } else if (tabUrlPattern.includes('cses.fi')) {
      patterns = ['https://cses.fi/*'];
    } else {
      if (tabUrlPattern.includes('://') && !tabUrlPattern.includes('://*.')) {
        patterns.push(tabUrlPattern.replace('://', '://*.'));
      }
    }
    
    let tabs = await chrome.tabs.query({ url: patterns });
    await logDebug(`tabs found: ${tabs.length}`);
    if (tabs.length === 0) {
      return null;
    }
    let tab = tabs[0];
    if (tab.discarded) {
      await logDebug(`Tab ${tab.id} is discarded. Reloading to wake it up.`);
      await chrome.tabs.reload(tab.id);
      // Wait for it to start loading
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Re-query tab to get fresh state
      const freshTabs = await chrome.tabs.query({ url: patterns });
      if (freshTabs.length > 0) {
        tab = freshTabs[0];
      }
    }
    await logDebug(`Query tab info: ID=${tab.id}, URL=${tab.url}, Title=${tab.title}, Discarded=${tab.discarded}`);
    
    let result = null;
    let retries = 3;
    while (retries > 0) {
      try {
        result = await chrome.tabs.sendMessage(tab.id, { type: 'FETCH_URL', url });
        break;
      } catch (err) {
        await logDebug(`sendMessage error (retries left ${retries - 1}): ${err.message}`);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!result) {
      await logDebug(`sendMessage failed. Falling back to executeScript.`);
      try {
        const [{ result: execResult }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (fetchUrl) => {
            try {
              const response = await fetch(fetchUrl);
              if (!response.ok) return { ok: false, status: response.status };
              const buffer = await response.arrayBuffer();
              const text = new TextDecoder('utf-8').decode(buffer);
              return { ok: true, text, url: response.url };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          },
          args: [url]
        });
        result = execResult;
      } catch (execErr) {
        await logDebug(`executeScript fallback exception: ${execErr.message}`);
      }
    }

    if (!result || !result.ok) {
      await logDebug(`No active/responding tab found or request failed. Creating a temporary tab to fetch...`);
      let tempTab = null;
      try {
        const parsedUrl = new URL(url);
        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}/`;
        tempTab = await chrome.tabs.create({ url: baseUrl, active: false });
        // Wait 3.5s for tab loading/content script injection
        await new Promise(resolve => setTimeout(resolve, 3500));
        
        try {
          result = await chrome.tabs.sendMessage(tempTab.id, { type: 'FETCH_URL', url });
        } catch (err) {
          await logDebug(`sendMessage to temp tab failed, trying executeScript: ${err.message}`);
          try {
            const [{ result: execResult }] = await chrome.scripting.executeScript({
              target: { tabId: tempTab.id },
              func: async (fetchUrl) => {
                try {
                  const response = await fetch(fetchUrl);
                  if (!response.ok) return { ok: false, status: response.status };
                  const buffer = await response.arrayBuffer();
                  const text = new TextDecoder('utf-8').decode(buffer);
                  return { ok: true, text, url: response.url };
                } catch (err) {
                  return { ok: false, error: err.message };
                }
              },
              args: [url]
            });
            result = execResult;
          } catch(e) {
            await logDebug(`executeScript on temp tab failed: ${e.message}`);
          }
        }
      } catch (tempErr) {
        await logDebug(`Failed to fetch via temporary tab fallback: ${tempErr.message}`);
      } finally {
        if (tempTab && tempTab.id) {
          await chrome.tabs.remove(tempTab.id).catch(() => {});
        }
      }
    }

    await logDebug(`fetchViaTab final result ok: ${result ? result.ok : 'null'}`);
    if (result && !result.ok) {
      await logDebug(`fetchViaTab error: ${result.error || result.status}`);
    }
    return result;
  } catch (err) {
    console.error(`[CodeSync] Error fetching via tab matching ${tabUrlPattern}:`, err);
    await logDebug(`fetchViaTab exception: ${err.message}`);
    return null;
  }
}

async function fetchCFAPI(apiName, params = {}) {
  const buildUrl = (base) => {
    const u = new URL(`${base}/${apiName}`);
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
    return u.toString();
  };

  const primaryUrl = buildUrl('https://codeforces.com/api');
  const mirrorUrl = buildUrl('https://mirror.codeforces.com/api');
  const urls = [primaryUrl, mirrorUrl];

  // 1. FAST PATH: Direct background fetch first (~200-400ms, no tab overhead)
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.status === 'OK') {
          return data;
        }
        if (data && data.comment) {
          // If Codeforces explicitly rejected (e.g. handle not found), fail fast immediately
          throw new Error(data.comment);
        }
      }
    } catch (e) {
      if (e.message && (e.message.includes('not found') || e.message.includes('handles:'))) {
        throw e;
      }
      await logDebug(`fetchCFAPI direct fetch attempt failed for ${url}: ${e.message}`);
    }
  }

  // 2. FALLBACK PATH: If direct fetch was blocked (e.g. Cloudflare Under Attack), try via open tab
  for (const url of urls) {
    const isMirror = url.includes('mirror.codeforces.com');
    const tabPattern = isMirror ? '*://mirror.codeforces.com/*' : '*://codeforces.com/*';
    const result = await fetchViaTab(tabPattern, url);
    if (result && result.ok) {
      try {
        const data = JSON.parse(result.text);
        if (data && data.status === 'OK') {
          await logDebug(`fetchCFAPI via tab successful for ${apiName}`);
          return data;
        }
        if (data && data.comment) throw new Error(data.comment);
      } catch (e) {
        await logDebug(`fetchCFAPI tab parse error: ${e.message}`);
      }
    }
  }

  // 3. LAST RESORT: Try with credentials (for protected endpoints)
  for (const url of urls) {
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.status === 'OK') return data;
        if (data && data.comment) throw new Error(data.comment);
      }
    } catch(e) { /* ignore */ }
  }

  throw new Error('Codeforces API unavailable (all attempts failed)');
}



let isSyncing = false;
let smartSyncProgress = { done: 0, total: 0, label: '', phase: 'idle', platform: 'all' };


// ─── Token Obfuscation ────────────────────────────────────────────────────────
function obfuscate(str) {
  if (!str) return '';
  return btoa(unescape(encodeURIComponent(str.split('').reverse().join(''))));
}

function deobfuscate(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(escape(atob(str))).split('').reverse().join('');
  } catch(e) {
    return str; // Fallback if already plain text
  }
}

// ─── Failed Queue ─────────────────────────────────────────────────────────────
async function addToFailedQueue(item) {
  try {
    const { failedQueue = [] } = await chrome.storage.local.get('failedQueue');
    // Prevent duplicate entries for the same problem
    const filtered = failedQueue.filter(x => !(x.platform === item.platform && getProblemKey(x) === getProblemKey(item)));
    filtered.unshift({ ...item, timestamp: Date.now(), retryCount: 0 });
    await chrome.storage.local.set({ failedQueue: filtered.slice(0, 200) });
  } catch(e) { console.error('[CodeSync] Failed to add to queue:', e); }
}

function getProblemKey(item) {
  if (item.platform === 'CF') {
    return item.sub && item.sub.problem ? `${item.sub.contestId}${item.sub.problem.index}` : 'unknown';
  }
  if (item.platform === 'AC') {
    if (item.sub) return item.sub.problem_id || String(item.sub.id);
    if (item.data) return item.data.problemId || item.data.problemName || 'unknown';
  }
  if (item.platform === 'LC') {
    if (item.sub) return item.sub.titleSlug || String(item.sub.id);
    if (item.data) return item.data.titleSlug || item.data.title || 'unknown';
  }
  return 'unknown';
}

async function retryFailedQueue() {
  const cfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo']);
  const { failedQueue = [] } = await chrome.storage.local.get('failedQueue');
  if (!failedQueue.length) return { retried: 0, failed: 0 };

  const remaining = [];
  let retried = 0, failed = 0;

  for (const item of failedQueue) {
    if (item.retryCount >= 5) { failed++; continue; }
    try {
      let res;
      if (item.platform === 'CF') {
        res = await syncCF(item.sub, cfg);
      } else if (item.platform === 'AC') {
        if (item.sub) res = await syncAtCoderSubmission(item.sub, cfg);
        else if (item.data) res = await syncAC(item.data, cfg);
      } else if (item.platform === 'LC') {
        if (item.sub) res = await syncLeetCodeSubmission(item.sub, cfg);
        else if (item.data) res = await syncLC(item.data, cfg);
      }
      
      if (res && res.skipped) {
        // Silently skip if filtered out by configuration
      } else {
        retried++;
      }
    } catch(e) {
      remaining.push({ ...item, retryCount: (item.retryCount || 0) + 1, lastError: e.message });
      failed++;
    }
  }

  await chrome.storage.local.set({ failedQueue: remaining });
  return { retried, failed };
}

// ─── Language → Extension ─────────────────────────────────────────────────────
function getExtension(lang) {
  if (!lang) return 'txt';
  const l = lang.toLowerCase().trim();
  // C++ variants (must come before bare 'c' check)
  if (l.includes('c++') || l.includes('g++') || l.includes('clang++') || l === 'cpp') return 'cpp';
  // Python variants
  if (l.includes('python') || l.includes('pypy') || l === 'python3' || l === 'python2') return 'py';
  // Java (must be before javascript)
  if ((l.includes('java') || l === 'java') && !l.includes('javascript') && !l.includes('typescript')) return 'java';
  // JavaScript
  if (l.includes('javascript') || l === 'javascript' || l.includes('node.js') || l === 'nodejs') return 'js';
  // TypeScript
  if (l.includes('typescript') || l === 'typescript') return 'ts';
  // Kotlin
  if (l.includes('kotlin') || l === 'kotlin') return 'kt';
  // Rust
  if (l.includes('rust') || l === 'rust') return 'rs';
  // Go
  if (l === 'go' || l === 'golang' || l.startsWith('go1') || l.includes('go ')) return 'go';
  // C# / Mono
  if (l.includes('c#') || l.includes('csharp') || l.includes('mono')) return 'cs';
  // Pascal
  if (l.includes('pascal')) return 'pas';
  // Haskell
  if (l.includes('haskell')) return 'hs';
  // Ruby
  if (l.includes('ruby') || l === 'ruby') return 'rb';
  // Scala
  if (l.includes('scala') || l === 'scala') return 'scala';
  // PHP
  if (l.includes('php') || l === 'php') return 'php';
  // Swift
  if (l.includes('swift') || l === 'swift') return 'swift';
  // Bash / Shell
  if (l.includes('bash') || l.includes('shell') || l === 'sh') return 'sh';
  // SQL
  if (l.includes('mysql') || l.includes('mssql') || l.includes('oraclesql') || l === 'sql') return 'sql';
  // R
  if (l === 'r' || l.includes('racket')) return (l === 'r' ? 'r' : 'rkt');
  // Erlang
  if (l.includes('erlang')) return 'erl';
  // Elixir
  if (l.includes('elixir')) return 'ex';
  // Dart
  if (l.includes('dart')) return 'dart';
  // C (bare, must be after c++ and c#)
  if (l === 'c' || l.startsWith('gcc') || l.startsWith('clang-c') || l === 'clang') return 'c';
  return 'txt';
}

// ─── Language Filter Validator ──────────────────────────────────────────────
async function isLanguageAllowed(programmingLanguage) {
  const { langFilter = '' } = await chrome.storage.local.get('langFilter');
  if (!langFilter.trim()) return true;
  
  const ext = getExtension(programmingLanguage).toLowerCase();
  const allowed = langFilter.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(ext) || allowed.includes(programmingLanguage.toLowerCase());
}

// ─── Code Header Comment Builder ──────────────────────────────────────────────
function buildCodeHeader(info, ext) {
  const isMl = ['py', 'rb', 'sh', 'pl'].includes(ext);
  const c = isMl ? '#' : '//';
  const line = (label, val) => val != null && val !== '' ? `${c} ${label.padEnd(12)}: ${val}\n` : '';
  const bar = c.repeat(62);
  return `${bar}\n${line('Platform', info.platform)}${line('Problem', info.problemName)}${line('Contest', info.contest)}${line('Difficulty', info.difficulty)}${line('Rating', info.rating)}${line('Tags', info.tags)}${line('URL', info.url)}${line('Language', info.language)}${line('Runtime', info.runtime)}${line('Memory', info.memory)}${line('Date', info.date)}${bar}\n\n`;
}

// ─── GitHub Helpers ───────────────────────────────────────────────────────────
async function ghGet(path, token) {
  const r = await fetch(`${GH_API}${path}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  return { status: r.status, data: await r.json() };
}

async function ghPut(path, token, body) {
  const r = await fetch(`${GH_API}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function ghPost(path, token, body) {
  const r = await fetch(`${GH_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

function b64(str) {
  // Proper UTF-8 → Base64: handles all Unicode characters (≤ ≥ × → etc.)
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}


async function putFile(token, owner, repo, filePath, content, message, dateStr) {
  // Validate token before making any requests
  if (!token || token.trim() === '') {
    throw new Error('GitHub token is missing. Please re-enter it in Settings.');
  }

  const repoPath = `/repos/${owner}/${repo}/contents/${filePath}`;
  let retries = 3;
  let delay = 1000;

  while (retries > 0) {
    try {
      const { status, data } = await ghGet(repoPath, token);

      // Detect auth failure immediately — don't proceed to PUT
      if (status === 401) {
        throw new Error('GitHub token is invalid or expired. Please update it in Settings.');
      }
      if (status === 403) {
        throw new Error('GitHub token lacks repo write permission. Please regenerate it with "repo" scope.');
      }

      const body = {
        message,
        content: b64(content),
        author: { name: owner, email: `${owner}@users.noreply.github.com`, date: dateStr },
        committer: { name: owner, email: `${owner}@users.noreply.github.com`, date: dateStr }
      };
      if (status === 200 && data.sha) body.sha = data.sha;
      return await ghPut(repoPath, token, body);
    } catch (err) {
      // Don't retry auth errors — they won't resolve themselves
      if (err.message && (err.message.includes('invalid or expired') || err.message.includes('write permission') || err.message.includes('missing'))) {
        throw err;
      }
      const isConflict = err.message && (err.message.includes('409') || err.message.includes('422') || err.message.includes('sha'));
      if (isConflict && retries > 1) {
        console.warn(`[CodeSync] putFile conflict for ${filePath}, retrying in ${delay}ms... (Retries left: ${retries - 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries--;
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
}


async function ensureRepo(token, owner, repo) {
  try {
    const { status } = await ghGet(`/repos/${owner}/${repo}`, token);
    if (status === 200) return; // repo exists, all good
    if (status !== 404) return; // unexpected status, continue anyway

    // Repo does not exist — create it
    const { ghRepoPrivate = false } = await chrome.storage.local.get('ghRepoPrivate');
    try {
      await ghPost('/user/repos', token, {
        name: repo,
        private: ghRepoPrivate,
        description: 'Competitive programming solutions synced by CodeSync Pro',
        auto_init: true
      });
    } catch(createErr) {
      // GitHub 422 = repo already exists (race condition or name conflict)
      // GitHub 422 message: "Repository creation failed."
      if (createErr.message && createErr.message.includes('422')) {
        console.log('[CodeSync] ensureRepo: repo already exists (422), continuing...');
        return;
      }
      throw createErr;
    }
  } catch(e) {
    if (e.message && e.message.includes('422')) {
      return;
    }
    console.error('[CodeSync] ensureRepo error:', e.message);
    throw new Error(`Auto-creating repo failed: ${e.message}`);
  }
}

async function updateRootReadme(token, owner, repo) {
  try {
    const data = await chrome.storage.local.get(['syncLog', 'cfHandle', 'acHandle', 'lcUsername', 'tpHandle']);
    const syncLog = data.syncLog || [];

    const cfCount = syncLog.filter(e => e.platform === 'CF').length;
    const acCount = syncLog.filter(e => e.platform === 'AC').length;
    const lcCount = syncLog.filter(e => e.platform === 'LC').length;
    const tpCount = syncLog.filter(e => e.platform === 'TP').length;
    const totalCount = syncLog.length;

    const readmeContent = [
      `# 🚀 Competitive Programming Solutions`,
      ``,
      `> Automatically synced and organized by [CodeSync Pro](https://github.com/parthopaul69/CodeSync-Pro-Extension).`,
      ``,
      `![Total Solved](https://img.shields.io/badge/Total%20Solved-${totalCount}-2f81f7?style=for-the-badge&logo=github)`,
      `![Codeforces](https://img.shields.io/badge/Codeforces-${cfCount}-06b6d4?style=for-the-badge)`,
      `![AtCoder](https://img.shields.io/badge/AtCoder-${acCount}-f472b6?style=for-the-badge)`,
      `![LeetCode](https://img.shields.io/badge/LeetCode-${lcCount}-eab308?style=for-the-badge)`,
      `![Toph](https://img.shields.io/badge/Toph-${tpCount}-22c55e?style=for-the-badge)`,
      ``,
      `## 📊 Solved Stats Overview`,
      ``,
      `| Platform | Profile | Problems Solved |`,
      `| :--- | :--- | :---: |`,
      `| **Codeforces** | ${data.cfHandle ? `[@${data.cfHandle}](https://codeforces.com/profile/${data.cfHandle})` : '—'} | \`${cfCount}\` |`,
      `| **AtCoder** | ${data.acHandle ? `[@${data.acHandle}](https://atcoder.jp/users/${data.acHandle})` : '—'} | \`${acCount}\` |`,
      `| **LeetCode** | ${data.lcUsername ? `[@${data.lcUsername}](https://leetcode.com/${data.lcUsername})` : '—'} | \`${lcCount}\` |`,
      `| **Toph** | ${data.tpHandle ? `[@${data.tpHandle}](https://toph.co/u/${data.tpHandle})` : '—'} | \`${tpCount}\` |`,
      `| **Total** | — | **\`${totalCount}\`** |`,
      ``,
      `## 📁 Repository Structure`,
      ``,
      `\`\`\``,
      `.`,
      `├── Codeforces/          # Solutions by Division / Contest`,
      `├── AtCoder/             # Solutions by Contest (ABC, ARC, AGC)`,
      `├── LeetCode/            # Solutions by Difficulty (Easy, Medium, Hard)`,
      `└── Toph/                # Solutions from Practice & Contests`,
      `\`\`\``,
      ``,
      `---`,
      `*Generated automatically with ❤️ by [CodeSync Pro](https://github.com/parthopaul69/CodeSync-Pro-Extension).*`
    ].join('\n');

    await putFile(token, owner, repo, 'README.md', readmeContent, 'docs: update repository portfolio stats [skip ci]', new Date().toISOString());
  } catch (e) {
    console.warn('[CodeSync] Root README generation skipped:', e.message);
  }
}

function stripDebugStatements(code, lang) {
  if (!code) return '';
  let lines = code.split('\n');
  if (lang === 'cpp') {
    lines = lines.filter(l => !l.trim().startsWith('// DEBUG') && !l.trim().startsWith('/* DEBUG') && !l.includes('cerr <<') && !l.includes('#define dbg'));
  } else if (lang === 'python') {
    lines = lines.filter(l => !l.trim().startsWith('# DEBUG') && !l.includes('print("DEBUG') && !l.includes("print('DEBUG"));
  } else if (lang === 'javascript') {
    lines = lines.filter(l => !l.trim().startsWith('// DEBUG') && !l.includes('console.log("DEBUG') && !l.includes("console.log('DEBUG"));
  }
  return lines.join('\n');
}

// ─── Broadcast Helpers ────────────────────────────────────────────────────────
function broadcastSuccess(platform, problemCode, commitMsg) {
  chrome.runtime.sendMessage({ type: 'SYNC_SUCCESS', platform, problemCode, commitMsg }).catch(() => {});
}

function broadcastError(platform, problemCode, error) {
  chrome.runtime.sendMessage({ type: 'SYNC_ERROR', platform, problemCode, error }).catch(() => {});
}

// ─── Notifications + Sound ────────────────────────────────────────────────────
let lastSoundPlayTime = 0;

async function playSound() {
  const now = Date.now();
  if (now - lastSoundPlayTime < 3000) {
    console.log('[CodeSync] Suppressing duplicate sound play (cooldown).');
    return;
  }
  lastSoundPlayTime = now;

  try {
    const { soundEnabled = true } = await chrome.storage.local.get('soundEnabled');
    if (!soundEnabled) return;
    // Ensure offscreen doc is alive before sending sound message
    await ensureOffscreen();
    // Send with retry
    try {
      await chrome.runtime.sendMessage({ type: 'PLAY_SOUND' });
    } catch(e) {
      await new Promise(r => setTimeout(r, 500));
      chrome.runtime.sendMessage({ type: 'PLAY_SOUND' }).catch(() => {});
    }
  } catch(e) { console.error('[CodeSync] Sound error:', e); }
}

function notifySuccess(platform, problemCode) {
  const label = { CF: '🔵 Codeforces', AC: '🟠 AtCoder', LC: '🟡 LeetCode', TP: '🟢 Toph', CSES: '🔵 CSES' }[platform] || platform;
  chrome.notifications.create(`sync-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: `✅ CodeSync Pro — Uploaded!`,
    message: `[${label}] ${problemCode}`,
    silent: true
  });
  playSound();
}

// ─── Sync Log Helper ──────────────────────────────────────────────────────────
async function appendSyncLog(entry) {
  const { syncLog = [] } = await chrome.storage.local.get('syncLog');
  const key = e => `${e.platform}::${e.problemCode}`;
  const newLog = [entry, ...syncLog.filter(e => key(e) !== key(entry))].slice(0, 5000);
  const totalSynced = newLog.filter(e => !e.skipped).length;
  await chrome.storage.local.set({
    syncLog: newLog,
    totalSynced
  });
}

// ─── Offscreen Helper ─────────────────────────────────────────────────────────
let creatingOffscreen = null;

async function ensureOffscreen() {
  let exists = false;
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    }).catch(() => []);
    exists = contexts.length > 0;
  } else {
    exists = await chrome.offscreen.hasDocument().catch(() => false);
  }

  if (exists) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'PING' });
      if (resp && resp.ok) {
        return;
      }
    } catch (e) {
      await logDebug('ensureOffscreen: PING failed, closing dead document...');
      await chrome.offscreen.closeDocument().catch(() => {});
      // Wait for the document to close completely
      let closeRetries = 20;
      while (closeRetries > 0) {
        const stillExists = await chrome.offscreen.hasDocument().catch(() => false);
        if (!stillExists) break;
        closeRetries--;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = (async () => {
    try {
      try {
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL('offscreen.html'),
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Sync notification sound and HTML parsing'
        });
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('only a single offscreen') || msg.includes('already exists')) {
          await logDebug('ensureOffscreen: creation collision ignored, verifying existing document');
        } else {
          throw err;
        }
      }

      let retries = 100;
      while (retries > 0) {
        try {
          const resp = await chrome.runtime.sendMessage({ type: 'PING' });
          if (resp && resp.ok) {
            return;
          }
        } catch (e) {
          // ignore connection error, wait and retry
        }
        retries--;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Offscreen document failed to initialize and respond to PING.');
    } finally {
      creatingOffscreen = null;
    }
  })();

  await creatingOffscreen;
}

// ─── CODEFORCES Scraping & Sync ────────────────────────────────────────────────
function isCFBlock(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes('just a moment') || t.includes('verify you are human') ||
    t.includes('checking your browser') ||
    t.includes('ddos-guard') || t.includes('cf-browser-verification') ||
    t.includes('turnstile');
}

async function fetchCFPage(url) {
  // Try via open Codeforces tab first
  const isMirror = url.includes('mirror.codeforces.com');
  const tabPattern = isMirror ? '*://mirror.codeforces.com/*' : '*://codeforces.com/*';
  const result = await fetchViaTab(tabPattern, url);
  if (result && result.ok) {
    if (!isCFBlock(result.text)) {
      return result.text;
    }
  }

  // Fallback to service worker background fetch
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) {
    throw new Error(`CF HTTP ${resp.status}: ${resp.statusText}`);
  }
  const buffer = await resp.arrayBuffer();
  const html = new TextDecoder('utf-8').decode(buffer);
  if (isCFBlock(html)) {
    throw new Error('Cloudflare block detected. Please open Codeforces in a tab once.');
  }
  return html;
}

async function fetchCFSource(contestId, submissionId) {
  const cid = contestId === 'acmsguru' ? '99999' : contestId;
  // 1. Try AJAX via any open CF tab
  try {
    const tabs = await chrome.tabs.query({ url: ['*://codeforces.com/*', '*://mirror.codeforces.com/*', '*://*.codeforces.com/*'] });
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      await logDebug(`fetchCFSource: Attempting AJAX via open tab ${tabId}`);
      const ajaxResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: async function (subId) {
          var csrf = '';
          var metaEl = document.querySelector('meta[name="X-Csrf-Token"]');
          if (metaEl) csrf = metaEl.getAttribute('content') || '';
          if (!csrf) {
            var inputEl = document.querySelector('input[name="csrf_token"]');
            if (inputEl) csrf = inputEl.value || '';
          }
          if (!csrf) return { ok: false, err: 'NO_CSRF' };

          var params = 'submissionId=' + encodeURIComponent(subId) +
            '&csrf_token=' + encodeURIComponent(csrf);

          var resp = await fetch(window.location.origin + '/data/submitSource', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: params
          });
          var buffer = await resp.arrayBuffer();
          var text = new TextDecoder('utf-8').decode(buffer);
          return { ok: true, text: text };
        },
        args: [String(submissionId)]
      });

      var res = ajaxResult && ajaxResult[0] && ajaxResult[0].result;
      if (res && res.ok && res.text) {
        try {
          var json = JSON.parse(res.text);
          if (json.source && json.source.trim().length > 0) {
            await logDebug(`fetchCFSource: AJAX via tab successful`);
            return json.source;
          }
        } catch (e) {}
      }
      await logDebug(`fetchCFSource: AJAX via tab failed or returned empty: ${res ? res.err || 'invalid response' : 'null'}`);
    }
  } catch (e) {
    await logDebug(`fetchCFSource: AJAX exception: ${e.message}`);
  }

  // 2. Fallback: fetch submission page HTML via open Codeforces tab
  await logDebug(`fetchCFSource: Falling back to fetchViaTab DOM scraping`);
  const domainOptions = ['codeforces.com', 'mirror.codeforces.com'];
  for (const domain of domainOptions) {
    for (const type of ['contest', 'gym']) {
      try {
        const subUrl = contestId === 'acmsguru' 
          ? `https://${domain}/problemsets/acmsguru/submission/99999/${submissionId}`
          : `https://${domain}/${type}/${cid}/submission/${submissionId}`;
        const tabPattern = '*://*.codeforces.com/*';
        const result = await fetchViaTab(tabPattern, subUrl);
        if (result && result.ok && result.text) {
          await ensureOffscreen();
          const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_CF_SUBMISSION', html: result.text });
          if (parsed && parsed.ok && parsed.code && parsed.code.trim().length > 10) {
            await logDebug(`fetchCFSource: DOM scraping via fetchViaTab successful`);
            return parsed.code.trim();
          }
        }
      } catch (e) {
        await logDebug(`fetchCFSource: fetchViaTab scraping exception for ${type}: ${e.message}`);
      }
    }
  }

  // 3. Fallback: background fetch (if CF is not blocking)
  await logDebug(`fetchCFSource: Falling back to direct background fetch`);
  for (const domain of domainOptions) {
    for (const type of ['contest', 'gym']) {
      try {
        const subUrl = contestId === 'acmsguru' 
          ? `https://${domain}/problemsets/acmsguru/submission/99999/${submissionId}`
          : `https://${domain}/${type}/${cid}/submission/${submissionId}`;
        const resp = await fetch(subUrl);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          const text = new TextDecoder('utf-8').decode(buffer);
          if (!isCFBlock(text)) {
            await ensureOffscreen();
            const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_CF_SUBMISSION', html: text });
            if (parsed && parsed.ok && parsed.code && parsed.code.trim().length > 10) {
              await logDebug(`fetchCFSource: background fetch parsing successful`);
              return parsed.code.trim();
            }
          }
        }
      } catch (e) {
        await logDebug(`fetchCFSource: background fetch exception for ${type}: ${e.message}`);
      }
    }
  }

  throw new Error('Failed to parse submission source code. Please keep codeforces.com open in at least one tab.');
}

async function fetchCFProblemStatement(contestId, idx) {
  const cacheKey = `pc_${contestId}_${idx.toUpperCase()}`;
  try {
    const stored = await chrome.storage.local.get(cacheKey);
    const cached = stored[cacheKey];
    const hasContent = cached && (cached.body || cached.inputSpec || cached.samples);
    if (hasContent) {
      await logDebug(`fetchCFProblemStatement: Using cached statement for ${cacheKey}`);
      return cached;
    } else if (cached) {
      await chrome.storage.local.remove(cacheKey);
      await logDebug(`fetchCFProblemStatement: Cleared stale empty cache for ${cacheKey}`);
    }
  } catch(e) {}

  let html = null;
  let probUrl = '';
  const urls = [];
  if (contestId === 'acmsguru') {
    urls.push(`https://codeforces.com/problemsets/acmsguru/problem/99999/${idx}`);
    urls.push(`https://mirror.codeforces.com/problemsets/acmsguru/problem/99999/${idx}`);
  } else {
    urls.push(`https://codeforces.com/contest/${contestId}/problem/${idx}`);
    urls.push(`https://codeforces.com/gym/${contestId}/problem/${idx}`);
  }

  // (Removed flawed background window fetch for SGU)

  // Try fetching via an open Codeforces tab first to avoid opening new tabs
  for (const urlOption of urls) {
    probUrl = urlOption;
    try {
      const tabPattern = '*://*.codeforces.com/*';
      const result = await fetchViaTab(tabPattern, probUrl);
      if (result && result.ok && result.text) {
        html = result.text;
        break;
      }
    } catch(e) {
      await logDebug(`fetchCFProblemStatement fetchViaTab exception for ${probUrl}: ${e.message}`);
    }
  }

  // Last resort: direct background fetch (works if CF is not blocking)
  if (!html) {
    for (const urlOption of urls) {
      probUrl = urlOption;
      try {
        await logDebug(`fetchCFProblemStatement: background fetch for ${probUrl}`);
        const resp = await fetch(probUrl);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          const text = new TextDecoder('utf-8').decode(buffer);
          if (!isCFBlock(text)) {
            html = text;
            break;
          }
        }
      } catch(e) {
        await logDebug(`fetchCFProblemStatement background fetch exception for ${probUrl}: ${e.message}`);
      }
    }
  }

  if (!html) {
    await logDebug(`fetchCFProblemStatement: no html retrieved for contest ${contestId} problem ${idx}`);
    return null; // Return null so the sync can still proceed without description
  }

  try {
    await ensureOffscreen();
    const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_CF_PROBLEM', html });
    if (parsed && parsed.ok && parsed.stmt &&
        (parsed.stmt.body || parsed.stmt.samples || parsed.stmt.inputSpec || parsed.stmt.timeLimit)) {
      await logDebug(`fetchCFProblemStatement parsed successfully`);
      const stmt = parsed.stmt;
      stmt.url = probUrl;
      await chrome.storage.local.set({ [cacheKey]: stmt });
      return stmt;
    } else {
      await logDebug(`fetchCFProblemStatement: parser returned empty/null stmt. parsed.ok=${parsed && parsed.ok}`);
    }
  } catch(e) {
    console.error('fetchCFProblemStatement offscreen parse error:', e);
  }

  return null;
}

function buildCFReadme(sub, stmt, contestName, ghOwner, ghRepo) {

  const { contestId, problem, programmingLanguage, timeConsumedMillis, memoryConsumedBytes } = sub;
  const idx = problem.index;
  const name = problem.name;
  const rating = problem.rating || 0;
  const tags = (problem.tags || []).join(', ') || 'N/A';
  const isSgu = contestId === 'acmsguru';
  const contestUrl = isSgu ? 'https://codeforces.com/problemsets/acmsguru' : `https://codeforces.com/contest/${contestId}`;
  const url = isSgu ? `https://codeforces.com/problemsets/acmsguru/problem/99999/${idx}` : `https://codeforces.com/contest/${contestId}/problem/${idx}`;
  const memKb = Math.round(memoryConsumedBytes / 1024);

  let md = '';

  if (stmt) {
    md += `| ⏱ Time Limit | 💾 Memory Limit |\n|---|---|\n`;
    md += `| ${stmt.timeLimit || 'N/A'} | ${stmt.memLimit || 'N/A'} |\n\n`;
    md += `---\n\n`;
    if (stmt.body) md += `${stmt.body}\n\n`;
    if (stmt.inputSpec) md += `## Input\n\n${stmt.inputSpec}\n\n`;
    if (stmt.outputSpec) md += `## Output\n\n${stmt.outputSpec}\n\n`;
    if (stmt.samples) md += `## Examples\n\n${stmt.samples}\n\n`;
    if (stmt.note) md += `## Note\n\n${stmt.note}\n\n`;
    md += `---\n\n> 🔗 [View on Codeforces](${stmt.url || url})\n`;
  } else {
    md = `> 🔗 [View on Codeforces](${url})\n`;
  }

  return `# ${idx}. ${name}
 
| Field | Value |
|---|---|
| **Contest** | [${contestId}](${contestUrl}) |
| **Problem** | [${contestId}${idx} — ${name}](${url}) |
| **Rating** | ${rating || 'Gym/Unrated'} |
| **Tags** | ${tags} |
| **Verdict** | ✅ Accepted |
| **Language** | ${programmingLanguage} |
| **Runtime** | ${timeConsumedMillis} ms |
| **Memory** | ${memKb} KB |

---

${md}
---
*Synced by [CodeSync Pro](https://github.com/parthopaul69/CodeSync-Pro-Extension)*
`;
}

function getDivisions(contestName) {
  const n = (contestName || '').toLowerCase();
  const divs = [];
  if (/div(?:ision)?\.?\s*1\b/.test(n)) divs.push('Div. 1');
  if (/div(?:ision)?\.?\s*2\b/.test(n)) divs.push('Div. 2');
  if (/div(?:ision)?\.?\s*3\b/.test(n)) divs.push('Div. 3');
  if (/div(?:ision)?\.?\s*4\b/.test(n)) divs.push('Div. 4');
  if (divs.length === 0) divs.push('Others');
  return divs;
}



async function syncCF(sub, cfg) {
  const rawToken = cfg.ghToken;
  const ghToken = deobfuscate(rawToken);
  const { ghOwner, ghRepo } = cfg;
  const { problem, programmingLanguage, id, timeConsumedMillis, memoryConsumedBytes, creationTimeSeconds } = sub;
  let contestId = sub.contestId || (problem && problem.problemsetName === 'acmsguru' ? 'acmsguru' : '');
  if (contestId && !sub.contestId) {
    sub.contestId = contestId;
  }
  const idx = problem.index;
  const problemFullName = `${contestId}${idx} - ${problem.name}`;
  const safeProblemName = problemFullName.replace(/[<>:"/\\|?*]+/g, '').trim();
  let rating = problem.rating || 0;

  // Language filter check
  const allowed = await isLanguageAllowed(programmingLanguage);
  if (!allowed) {
    console.log('[CodeSync] Skipping CF submission due to language filter:', programmingLanguage);
    await appendSyncLog({
      platform: 'CF',
      problemCode: safeProblemName,
      problemName: problemFullName,
      commitMsg: `Skipped — language filter (${programmingLanguage || 'unknown'})`,
      syncedAt: new Date().toISOString(),
      lang: programmingLanguage || 'unknown',
      skipped: true,
      repoPath: ''
    });
    return { skipped: true, platform: 'CF', problemCode: safeProblemName, reason: `language filter (${programmingLanguage || 'unknown'})` };
  }

  // Try to get rating if missing
  if (rating === 0) {
    try {
      const data = await fetchCFAPI('problemset.problems');
      if (data && data.result) {
        const found = (data.result.problems || []).find(p => p.contestId === contestId && p.index === idx);
        if (found && found.rating) rating = found.rating;
      }
    } catch(e) {}
  }

  // Get contest name with 24h cache
  let contestName = `Contest ${contestId}`;
  try {
    const { contestListCache, contestListTime } = await chrome.storage.local.get(['contestListCache', 'contestListTime']);
    let list = contestListCache;
    if (!list || !contestListTime || Date.now() - contestListTime > 86400000) {
      const data = await fetchCFAPI('contest.list');
      if (data && data.result) {
        list = data.result;
        await chrome.storage.local.set({ contestListCache: list, contestListTime: Date.now() });
      }
    }
    if (list) {
      const found = list.find(c => c.id === Number(contestId));
      if (found && found.name) contestName = found.name;
    }
  } catch(e) { console.error('[CodeSync] Contest name fetch error:', e.message); }

  const divs = getDivisions(contestName);
  const ext = getExtension(programmingLanguage);
  const memKb = Math.round(memoryConsumedBytes / 1024);
  const commitMsg = `[${problemFullName} | ${rating || 'Gym'}] Accepted | Time: ${timeConsumedMillis}ms | Memory: ${memKb}KB`;
  const dateStr = new Date((creationTimeSeconds || Date.now() / 1000) * 1000).toISOString();

  const source = await fetchCFSource(contestId, id);
  const stmt = await fetchCFProblemStatement(contestId, idx);
  const readme = buildCFReadme(sub, stmt, contestName, ghOwner, ghRepo);

  const finalSource = source;

  await ensureRepo(ghToken, ghOwner, ghRepo);

  // Folder system: Codeforces/div/safeProblemName
  for (const div of divs) {
    const base = `Codeforces/${div}/${safeProblemName}`;
    await putFile(ghToken, ghOwner, ghRepo, `${base}/README.md`, readme, commitMsg, dateStr);
    await putFile(ghToken, ghOwner, ghRepo, `${base}/${safeProblemName}.${ext}`, finalSource, commitMsg, dateStr);
  }

  const firstBase = `Codeforces/${divs[0]}/${safeProblemName}`;
  await appendSyncLog({
    platform: 'CF',
    problemCode: safeProblemName,
    problemName: problemFullName,
    rating,
    division: divs[0],
    commitMsg,
    syncedAt: new Date().toISOString(),
    submissionTime: dateStr,
    lang: ext,
    time: timeConsumedMillis,
    memory: memKb,
    repoPath: `https://github.com/${ghOwner}/${ghRepo}/tree/main/${firstBase}`
  });

  return { platform: 'CF', problemCode: safeProblemName, commitMsg };
}

// ─── CF Poll ──────────────────────────────────────────────────────────────────
async function pollCF() {
  const cfg = await chrome.storage.local.get(['cfHandle', 'ghToken', 'ghOwner', 'ghRepo', 'lastSyncedId', 'cfEnabled']);
  if (!cfg.cfHandle || !cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) return;
  if (cfg.cfEnabled === false) return;
  if (isSyncing) return;
  isSyncing = true;

  try {
    const data = await fetchCFAPI('user.status', { handle: cfg.cfHandle, from: '1', count: '20' });
    const subs = data.result;
    if (!subs || subs.length === 0) return;

    if (!cfg.lastSyncedId) {
      await chrome.storage.local.set({ lastSyncedId: String(Math.max(...subs.map(s => s.id))) });
      return;
    }

    const toSync = subs.filter(s => s.verdict === 'OK' && s.id > Number(cfg.lastSyncedId));
    const seen = new Set();
    const unique = [];
    for (const sub of toSync) {
      const cid = sub.contestId || (sub.problem && sub.problem.problemsetName === 'acmsguru' ? 'acmsguru' : '');
      if (cid && !sub.contestId) sub.contestId = cid;
      const key = `${sub.contestId || ''}${sub.problem.index}`;
      if (!seen.has(key)) { seen.add(key); unique.push(sub); }
    }

    for (const sub of [...unique].reverse()) {
      try {
        const res = await syncCF(sub, cfg);
        if (res && res.skipped) {
          // Log skipped
        } else if (res) {
          notifySuccess(res.platform, res.problemCode);
          broadcastSuccess(res.platform, res.problemCode, res.commitMsg);
        }
      } catch(err) {
        console.error('[CodeSync] CF sync failed:', err);
        const codeLabel = sub.problem ? `${sub.contestId}${sub.problem.index} - ${sub.problem.name}` : 'Unknown';
        await addToFailedQueue({ platform: 'CF', sub, lastError: err.message });
        broadcastError('CF', codeLabel, err.message);
      } finally {
        await chrome.storage.local.set({ lastSyncedId: String(sub.id) });
      }
    }
  } catch(e) {
    console.error('[CodeSync] CF poll error:', e.message);
  } finally {
    isSyncing = false;
  }
}

// ─── ATCODER ──────────────────────────────────────────────────────────────────
function cleanKenkooooTitle(title) {
  if (!title) return '';
  return title.replace(/^([A-Z0-9]+)\.\s+/, '$1 - ');
}


async function getACProblemMeta(problemId) {
  try {
    const cacheKey = 'ac_problems_list';
    const cacheTimeKey = 'ac_problems_list_time';
    const stored = await chrome.storage.local.get([cacheKey, cacheTimeKey]);
    
    let list = stored[cacheKey];
    const lastFetch = stored[cacheTimeKey] || 0;
    const now = Date.now();
    
    // Refresh cache if older than 24 hours or if list is empty
    if (!list || !list.length || (now - lastFetch > 24 * 60 * 60 * 1000)) {
      await logDebug('getACProblemMeta: Fetching problems.json from Kenkoooo');
      const resp = await fetch('https://kenkoooo.com/atcoder/resources/problems.json');
      if (resp.ok) {
        list = await resp.json();
        await chrome.storage.local.set({
          [cacheKey]: list,
          [cacheTimeKey]: now
        });
      }
    }
    
    if (list && list.length && problemId) {
      const match = list.find(p => p.id === problemId);
      if (match) return match;
    }
  } catch(e) {
    console.error('[CodeSync] getACProblemMeta error:', e);
  }
  return null;
}

async function fetchACProblemStatement(contestId, problemId, taskHtml = null) {
  const cacheKey = `ac_prob_${contestId}_${problemId}`;
  try {
    const stored = await chrome.storage.local.get(cacheKey);
    const cached = stored[cacheKey];
    // Only use cache if it has a title AND at least some actual content
    const hasContent = cached && cached.title && (
      cached.body || cached.bodyMarkdown || cached.inputSpec || cached.constraints || cached.samples
    );
    if (hasContent) {
      await logDebug(`fetchACProblemStatement: Using cached statement for ${cacheKey}`);
      return cached;
    } else if (cached && cached.title) {
      // Stale entry with title but no content — delete and re-fetch
      await chrome.storage.local.remove(cacheKey);
      await logDebug(`fetchACProblemStatement: Cleared stale empty cache for ${cacheKey}, re-fetching`);
    }
  } catch(e) {}

  const url = `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`;
  let html = null;
  if (taskHtml && taskHtml.includes('task-statement') && !isCFBlock(taskHtml)) {
    html = taskHtml;
  } else if (taskHtml) {
    await logDebug('fetchACProblemStatement: ignored invalid/Cloudflare taskHtml passed from content script');
  }

  // 1. Try to find if any open tab is exactly on the task page and grab its DOM directly (bypasses fetch entirely)
  if (!html) {
    try {
      const taskTabs = await chrome.tabs.query({ url: url });
      if (taskTabs.length > 0) {
        const tab = taskTabs[0];
        await logDebug(`fetchACProblemStatement: found exact open tab ${tab.id} for ${url}, reading DOM directly`);
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.documentElement.outerHTML
        });
        if (result && result.includes('task-statement')) {
          html = result;
          await logDebug(`fetchACProblemStatement: direct DOM read success. len: ${html.length}`);
        }
      }
    } catch(e) {
      await logDebug(`fetchACProblemStatement direct DOM read exception: ${e.message}`);
    }
  }

  if (!html) {
    // Try via open AtCoder tab first (uses browser login session)
    try {
      const tabResult = await fetchViaTab('*://atcoder.jp/*', url);
      if (tabResult && tabResult.ok && tabResult.text) {
        const tempHtml = tabResult.text;
        const finalUrl = tabResult.url || url;
        const isLogin = finalUrl.includes('/login') || finalUrl.includes('/account') || tempHtml.includes('id="username"') || tempHtml.includes('class="form-signin"');
        if (!isLogin && tempHtml.includes('task-statement')) {
          html = tempHtml;
          await logDebug(`fetchACProblemStatement: fetched via tab. len: ${html.length}`);
        }
      }
    } catch(e) { /* ignore, fall through */ }
  }

  // Fallback: plain background fetch (works for public problems)
  if (!html) {
    try {
      await logDebug(`fetchACProblemStatement: plain background fetch for ${url}`);
      const resp = await fetch(url, { credentials: 'include' });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const tempHtml = new TextDecoder('utf-8').decode(buffer);
        const finalUrl = resp.url || url;
        const isLogin = finalUrl.includes('/login') || finalUrl.includes('/account') || tempHtml.includes('id="username"') || tempHtml.includes('class="form-signin"');
        const hasCF = isCFBlock(tempHtml);
        const hasStmt = tempHtml.includes('task-statement');
        await logDebug(`fetchACProblemStatement bg: url=${finalUrl}, len=${tempHtml.length}, isLogin=${isLogin}, hasCF=${hasCF}, hasStmt=${hasStmt}`);
        if (!isLogin && hasStmt) {
          html = tempHtml;
          await logDebug(`fetchACProblemStatement: plain background fetch success. len: ${html.length}`);
        } else {
          await logDebug(`fetchACProblemStatement: background fetch returned invalid page (login/missing statement)`);
        }
      } else {
        await logDebug(`fetchACProblemStatement: plain background fetch failed. status: ${resp.status}`);
      }
    } catch(e) {
      await logDebug(`fetchACProblemStatement: plain background fetch exception: ${e.message}`);
    }
  }

  // Try via scraper tab if still no html
  if (!html) {
    try {
      await logDebug(`fetchACProblemStatement: fetching via scraper tab fallback for ${url}`);
      const tabResult = await fetchViaScraperTab(url);
      if (tabResult && tabResult.ok && tabResult.text) {
        const tempHtml = tabResult.text;
        const finalUrl = tabResult.url || url;
        const isLogin = finalUrl.includes('/login') || finalUrl.includes('/account') || tempHtml.includes('id="username"') || tempHtml.includes('class="form-signin"');
        if (!isLogin && tempHtml.includes('task-statement')) {
          html = tempHtml;
          await logDebug(`fetchACProblemStatement: fetched via scraper tab fallback. len: ${html.length}`);
        }
      }
    } catch(e) {
      await logDebug(`fetchACProblemStatement scraper tab fetch error: ${e.message}`);
    }
  }

  if (!html) {
    await logDebug(`fetchACProblemStatement: no html retrieved for ${url}`);
    throw new Error('Could not fetch AtCoder problem details. Please open atcoder.jp in a browser tab first.');
  }

  try {
    let parsed = null;
    let retries = 3;
    while (retries > 0) {
      try {
        await ensureOffscreen();
        await logDebug(`fetchACProblemStatement: sending PARSE_AC_PROBLEM for ${url} (retries left: ${retries})`);
        parsed = await chrome.runtime.sendMessage({ type: 'PARSE_AC_PROBLEM', html });
        if (!parsed || !parsed.ok || !parsed.stmt || !parsed.stmt.title) {
          const errMsg = parsed && parsed.error ? parsed.error : 'Parsed response is missing title or stmt';
          throw new Error(errMsg);
        }
        break;
      } catch (err) {
        retries--;
        await logDebug(`fetchACProblemStatement PARSE_AC_PROBLEM sendMessage error (retries left ${retries}): ${err.message}`);
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw err;
        }
      }
    }

    await logDebug(`fetchACProblemStatement: PARSE_AC_PROBLEM response: title=${parsed && parsed.stmt && parsed.stmt.title}, body_len=${parsed && parsed.stmt ? (parsed.stmt.body || '').length : 0}`);
    // Accept stmt as long as title is present - body may be empty for simple/old problems
    if (parsed && parsed.ok && parsed.stmt && parsed.stmt.title) {
      await chrome.storage.local.set({ [cacheKey]: parsed.stmt });
      return parsed.stmt;
    } else {
      const errMsg = parsed && parsed.error ? parsed.error : 'Parsed response missing title';
      await logDebug(`fetchACProblemStatement: parse failed: ${errMsg}`);
      throw new Error(`Could not parse AtCoder problem details: ${errMsg}`);
    }
  } catch(e) {
    console.error('[CodeSync] fetchACProblemStatement error:', e);
    await logDebug(`fetchACProblemStatement exception inside messaging: ${e.message}`);
    throw e;
  }
}

function buildACReadme({ contestId, contestName, problemId, problemName, language, timeMs, memoryKb, url, stmt, timeLimit, memoryLimit }) {
  const problemUrl = `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`;

  let md = `# ${problemName}\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| **Platform** | 🟠 AtCoder |\n`;
  md += `| **Contest** | [${contestName || contestId}](https://atcoder.jp/contests/${contestId}) |\n`;
  md += `| **Problem** | [${problemName}](${problemUrl}) |\n`;
  md += `| **Verdict** | ✅ Accepted |\n`;
  md += `| **Language** | ${language} |\n`;
  md += `| **Runtime** | ${timeMs} ms |\n`;
  md += `| **Memory** | ${memoryKb} KB |\n`;
  if (url) {
    md += `| **Submission** | [View Submission](${url}) |\n`;
  }
  md += `\n---\n\n`;

  if (timeLimit || memoryLimit) {
    md += `| ⏱ Time Limit | 💾 Memory Limit |\n|---|---|\n`;
    md += `| ${timeLimit || 'N/A'} | ${memoryLimit || 'N/A'} |\n\n`;
    md += `---\n\n`;
  }

  if (stmt) {
    if (stmt.body) md += `${stmt.body}\n\n`;
    else if (stmt.bodyMarkdown) md += `${stmt.bodyMarkdown}\n\n`; // Fallback for old cache format
    
    if (stmt.constraints) md += `### Constraints\n\n${stmt.constraints}\n\n`;
    if (stmt.inputSpec) md += `## Input\n\n${stmt.inputSpec}\n\n`;
    if (stmt.outputSpec) md += `## Output\n\n${stmt.outputSpec}\n\n`;
    if (stmt.samples) md += `## Examples\n\n${stmt.samples}\n\n`;
    if (stmt.note) md += `## Note\n\n${stmt.note}\n\n`;
    md += `---\n\n`;
  }

  md += `> 🔗 [View on AtCoder](${problemUrl})\n\n`;
  md += `---\n*Synced by [CodeSync Pro](https://github.com/parthopaul69/CodeSync-Pro-Extension)*\n`;
  return md;
}

async function syncAC(data, cfg) {
  const rawToken = cfg.ghToken;
  const ghToken = deobfuscate(rawToken);
  const { ghOwner, ghRepo } = cfg;
  const { contestId, contestName, problemId, problemName, language, code, timeMs, memoryKb, url } = data;

  // Language filter check
  const allowed = await isLanguageAllowed(language);
  if (!allowed) {
    console.log('[CodeSync] Skipping AC submission due to language filter:', language);
    await appendSyncLog({
      platform: 'AC',
      problemCode: problemId,
      problemName: problemName || problemId || 'unknown',
      commitMsg: `Skipped — language filter (${language || 'unknown'})`,
      syncedAt: new Date().toISOString(),
      submissionTime: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
      lang: language || 'unknown',
      skipped: true,
      repoPath: ''
    });
    return { skipped: true, platform: 'AC', problemCode: problemId, reason: `language filter (${language || 'unknown'})` };
  }

  // Fetch statement if missing or use existing
  let actualProblemName = problemName || problemId || 'unknown';
  let timeLimit = '';
  let memoryLimit = '';
  let stmt = null;

  try {
    stmt = await fetchACProblemStatement(contestId, problemId, data.taskHtml);
    if (stmt) {
      if (stmt.title) actualProblemName = stmt.title;
      if (stmt.timeLimit) timeLimit = stmt.timeLimit;
      if (stmt.memoryLimit) memoryLimit = stmt.memoryLimit;
    } else {
      const meta = await getACProblemMeta(problemId);
      if (meta && meta.title) {
        actualProblemName = cleanKenkooooTitle(meta.title);
      }
    }
  } catch (e) {
    await logDebug(`syncAC: fetchACProblemStatement failed: ${e.message}. Falling back to Kenkoooo metadata.`);
    const meta = await getACProblemMeta(problemId);
    if (meta && meta.title) {
      actualProblemName = cleanKenkooooTitle(meta.title);
    }
  }

  const ext = getExtension(language);
  const safeContest = (contestName || contestId || 'others').replace(/[<>:"/\\|?*]+/g, '').trim();
  const safeProblem = actualProblemName.replace(/[<>:"/\\|?*]+/g, '').trim();

  const cid = (contestId || '').toLowerCase();
  const cname = (contestName || '').toLowerCase();
  let category = 'Others';
  if (cid.startsWith('abc') || cname.includes('beginner')) {
    category = 'Beginner';
  } else if (cid.startsWith('arc') || cname.includes('regular')) {
    category = 'Regular';
  } else if (cid.startsWith('agc') || cname.includes('grand')) {
    category = 'Grand';
  }

  const commitMsg = `[${safeProblem} | ${safeContest}] Accepted | Time: ${timeMs}ms | Memory: ${memoryKb}KB`;
  const dateStr = new Date().toISOString();

  const readme = buildACReadme({
    contestId,
    contestName: safeContest,
    problemId,
    problemName: safeProblem,
    language,
    timeMs,
    memoryKb,
    url,
    stmt,
    timeLimit,
    memoryLimit
  });

  const finalSource = code || '// Source not available';

  await ensureRepo(ghToken, ghOwner, ghRepo);

  // Folder system: AtCoder/(category)/(ques)/
  const base = `AtCoder/${category}/${safeProblem}`;
  await putFile(ghToken, ghOwner, ghRepo, `${base}/README.md`, readme, commitMsg, dateStr);
  await putFile(ghToken, ghOwner, ghRepo, `${base}/${safeProblem}.${ext}`, finalSource, commitMsg, dateStr);

  await appendSyncLog({
    platform: 'AC',
    problemCode: problemId,
    problemName: safeProblem,
    contestName: safeContest,
    submissionId: data.submissionId,
    commitMsg,
    syncedAt: new Date().toISOString(),
    submissionTime: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
    lang: ext,
    time: timeMs,
    memory: memoryKb,
    repoPath: `https://github.com/${ghOwner}/${ghRepo}/tree/main/${base}`
  });

  // Immediately record today's accepted solve and submission in activity storage
  // so the streak tick and today count appear without waiting for the API refresh.
  try {
    const ts = data.timestamp ? data.timestamp : Date.now();
    const targetDateStr = new Date(ts).toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
    const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity', 'acSolvedCount']);
    let act = stored.dailyActivity;
    if (typeof act === 'string') { try { act = JSON.parse(act); } catch(e) { act = {}; } }
    act = act || {};
    if (!act.AC) act.AC = {};
    act.AC[targetDateStr] = (act.AC[targetDateStr] || 0) + 1;
    let subAct = stored.dailySubmissionActivity;
    if (typeof subAct === 'string') { try { subAct = JSON.parse(subAct); } catch(e) { subAct = {}; } }
    subAct = subAct || {};
    if (!subAct.AC) subAct.AC = {};
    subAct.AC[targetDateStr] = (subAct.AC[targetDateStr] || 0) + 1;
    const newAcSolvedCount = (stored.acSolvedCount || 0) + 1;
    await chrome.storage.local.set({ dailyActivity: act, dailySubmissionActivity: subAct, acSolvedCount: newAcSolvedCount });
  } catch(e) { console.warn('[CodeSync] Could not update AC daily activity:', e.message); }

  return { platform: 'AC', problemCode: problemId, commitMsg };
}


// ─── LEETCODE ─────────────────────────────────────────────────────────────────
async function fetchLCProblemHtml(titleSlug) {
  const cacheKey = `lc_html_${titleSlug}`;
  try {
    const stored = await chrome.storage.local.get(cacheKey);
    if (stored[cacheKey]) return stored[cacheKey];
  } catch(e) {}

  try {
    const html = await getLCQuestionContent(titleSlug);
    if (html) {
      await chrome.storage.local.set({ [cacheKey]: html });
      return html;
    }
  } catch(e) {
    console.error('[CodeSync] fetchLCProblemHtml error:', e);
  }
  return null;
}

// LeetSync-style README: HTML format with difficulty badge + raw problem HTML content
function buildLCReadme({ title, titleSlug, difficulty, problemHtml }) {
  const problemUrl = `https://leetcode.com/problems/${titleSlug}/`;

  // Difficulty badge colors matching LeetSync exactly
  const diffColor = difficulty === 'Easy' ? 'brightgreen' : difficulty === 'Medium' ? 'orange' : 'red';
  const diffBadge = `<img src='https://img.shields.io/badge/Difficulty-${difficulty}-${diffColor}' alt='Difficulty: ${difficulty}' />`;

  // Build HTML README exactly as LeetSync does:
  // <h2><a href="...">{title}</a></h2> {badge}<hr>{problem HTML content}
  let readme = `<h2><a href="${problemUrl}">${title}</a></h2> ${diffBadge}<hr>${problemHtml || ''}\n\n`;
  readme += `<hr>\n\n<p><em>Synced by <a href="https://github.com/parthopaul69/CodeSync-Pro-Extension">CodeSync Pro</a></em></p>\n`;
  return readme;
}

async function syncLC(data, cfg) {
  const rawToken = cfg.ghToken;
  const ghToken = deobfuscate(rawToken);
  const { ghOwner, ghRepo } = cfg;
  const { titleSlug, title, difficulty, code, language, runtime, memory, runtimePercentile, memoryPercentile, url } = data;

  // Language filter check
  const allowed = await isLanguageAllowed(language);
  if (!allowed) {
    console.log('[CodeSync] Skipping LC submission due to language filter:', language);
    const safeProblem = (title || titleSlug || 'unknown').replace(/[<>:"/\\|?*]+/g, '').trim();
    await appendSyncLog({
      platform: 'LC',
      problemCode: titleSlug || safeProblem,
      problemName: title || safeProblem,
      titleSlug: titleSlug,
      commitMsg: `Skipped — language filter (${language || 'unknown'})`,
      syncedAt: new Date().toISOString(),
      lang: language || 'unknown',
      skipped: true,
      repoPath: ''
    });
    return { skipped: true, platform: 'LC', problemCode: titleSlug || safeProblem };
  }

  // Fetch raw problem HTML (same as LeetSync)
  let problemHtml = data.problemHtml || data.problemMarkdown || '';
  if (!problemHtml && titleSlug) {
    problemHtml = await fetchLCProblemHtml(titleSlug) || '';
  }

  const ext = getExtension(language || 'cpp');

  let diffFolder = 'Easy';
  if (difficulty) {
    const lowerDiff = difficulty.toLowerCase();
    if (lowerDiff.includes('easy')) diffFolder = 'Easy';
    else if (lowerDiff.includes('medium')) diffFolder = 'Medium';
    else if (lowerDiff.includes('hard')) diffFolder = 'Hard';
  }

  // Code file commit message matching LeetSync style
  const rtDisplay = runtime != null ? `${runtime}ms` : 'N/A';
  const memDisplay = memory != null ? `${memory}MB` : 'N/A';
  const rtPct = runtimePercentile != null ? ` (${Number(runtimePercentile).toFixed(2)}%)` : '';
  const memPct = memoryPercentile != null ? ` (${Number(memoryPercentile).toFixed(2)}%)` : '';
  const commitMsg = `Time: ${rtDisplay}${rtPct} | Memory: ${memDisplay}${memPct} | Language: ${language || ext}`;
  const dateStr = new Date().toISOString();
  const targetDateStr = data.timestamp ? new Date(data.timestamp).toLocaleDateString('sv-SE') : new Date().toLocaleDateString('sv-SE');

  const readme = buildLCReadme({
    title: title || titleSlug || 'unknown',
    titleSlug,
    difficulty,
    problemHtml
  });

  const finalSource = code || '// Source not available';

  await ensureRepo(ghToken, ghOwner, ghRepo);

  // Folder system: LeetCode/(difficulty)/(titleSlug)/
  const base = `LeetCode/${diffFolder}/${titleSlug}`;
  await putFile(ghToken, ghOwner, ghRepo, `${base}/README.md`, readme, commitMsg, dateStr);
  await putFile(ghToken, ghOwner, ghRepo, `${base}/${titleSlug}.${ext}`, finalSource, commitMsg, dateStr);

  await appendSyncLog({
    platform: 'LC',
    problemCode: titleSlug,
    problemName: title || titleSlug || 'unknown',
    titleSlug: titleSlug,
    difficulty,
    commitMsg,
    syncedAt: new Date().toISOString(),
    submissionTime: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
    lang: ext,
    time: runtime,
    memory,
    repoPath: `https://github.com/${ghOwner}/${ghRepo}/tree/main/${base}`
  });

  // Immediately record today's accepted solve and submission in activity storage
  // so the streak tick and today count appear without waiting for the LeetCode API to update.
  try {
    const ts = data.timestamp ? data.timestamp : Date.now();
    const targetDateStr = new Date(ts).toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
    const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity', 'lcSolvedCount']);
    let act = stored.dailyActivity;
    if (typeof act === 'string') { try { act = JSON.parse(act); } catch(e) { act = {}; } }
    act = act || {};
    if (!act.LC) act.LC = {};
    act.LC[targetDateStr] = (act.LC[targetDateStr] || 0) + 1;
    let subAct = stored.dailySubmissionActivity;
    if (typeof subAct === 'string') { try { subAct = JSON.parse(subAct); } catch(e) { subAct = {}; } }
    subAct = subAct || {};
    if (!subAct.LC) subAct.LC = {};
    subAct.LC[targetDateStr] = (subAct.LC[targetDateStr] || 0) + 1;
    const newLcSolvedCount = (stored.lcSolvedCount || 0) + 1;
    await chrome.storage.local.set({ dailyActivity: act, dailySubmissionActivity: subAct, lcSolvedCount: newLcSolvedCount });
  } catch(e) { console.warn('[CodeSync] Could not update LC daily activity:', e.message); }

  return { platform: 'LC', problemCode: titleSlug, commitMsg };
}

function parseTophSections(rawTextOrHtml) {
  if (!rawTextOrHtml) return { body: '', inputSpec: '', outputSpec: '', note: '', samples: [] };
  let text = String(rawTextOrHtml);

  // 1. Extract samples if in HTML form
  let samples = [];
  const sampleCellRegex = /<div\b[^>]*class=["']?[^"']*pview__samplecell[^"']*["']?[^>]*>[\s\S]*?<div\b[^>]*class=["']?[^"']*pview__samplelabel[^"']*["']?[^>]*>([\s\S]*?)<\/div>[\s\S]*?<pre\b[^>]*>([\s\S]*?)<\/pre>[\s\S]*?<\/div>/gi;
  let cellMatch;
  let currentInp = null, currentOut = null;
  while ((cellMatch = sampleCellRegex.exec(text)) !== null) {
    const lbl = cellMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const val = cellMatch[2].replace(/<[^>]+>/g, '').replace(/\r\n/g, '\n').trim();
    if (lbl.includes('input')) {
      if (currentInp !== null && currentOut !== null) {
        samples.push({ input: currentInp, output: currentOut });
        currentInp = null; currentOut = null;
      }
      currentInp = val;
    } else if (lbl.includes('output')) {
      currentOut = val;
      if (currentInp !== null) {
        samples.push({ input: currentInp, output: currentOut });
        currentInp = null; currentOut = null;
      }
    }
  }
  if (currentInp !== null || currentOut !== null) {
    samples.push({ input: currentInp || '', output: currentOut || '' });
  }

  // 2. KaTeX preservation: extract annotations
  text = text.replace(/<span\b[^>]*class=["']?[^"']*katex-display[^"']*["']?[^>]*>[\s\S]*?<annotation\b[^>]*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi, '\n\n$$$1$$\n\n');
  text = text.replace(/<span\b[^>]*class=["']?[^"']*katex[^"']*["']?[^>]*>[\s\S]*?<annotation\b[^>]*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/gi, ' $$1$ ');

  // 3. Remove artifact caption, title h1, buttons, actions, and sample boxes
  text = text.replace(/<div\b[^>]*class=["']?[^"']*artifact__caption[^"']*["']?[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '');
  text = text.replace(/<div\b[^>]*class=["']?[^"']*artifact__caption[^"']*["']?[^>]*>[\s\S]*?<\/div>/gi, '');
  text = text.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, '');
  text = text.replace(/<div\b[^>]*class=["']?[^"']*pview__sample\b[\s\S]*?<\/div>\s*<\/div>/gi, '');
  text = text.replace(/<div\b[^>]*class=["']?[^"']*pview__sample\b[\s\S]*?<\/div>/gi, '');
  text = text.replace(/<div\b[^>]*class=["']?[^"']*artifact__actions[^"']*["']?[^>]*>[\s\S]*?<\/div>/gi, '');

  // 4. Convert section headings (both HTML and existing Markdown)
  text = text.replace(/<div\b[^>]*class=["']?[^"']*pview__sectionhead[^"']*["']?[^>]*>([\s\S]*?)<\/div>/gi, '\n\n###SECTION_HEAD###$1###\n\n');
  text = text.replace(/<div\b[^>]*role=["']?heading["']?[^>]*>([\s\S]*?)<\/div>/gi, '\n\n###SECTION_HEAD###$1###\n\n');
  text = text.replace(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi, '\n\n###SECTION_HEAD###$1###\n\n');
  text = text.replace(/^##\s+(Input|Output|Examples?|Notes?|Constraints?)/gim, '\n\n###SECTION_HEAD###$1###\n\n');

  // 5. HTML tags to Markdown
  text = text.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  text = text.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  text = text.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&apos;/g, "'")
             .replace(/&#39;/g, "'")
             .replace(/&amp;/g, '&');

  // Split into sections
  const parts = text.split(/###SECTION_HEAD###/);
  let body = parts[0] || '';
  let inputSpec = '';
  let outputSpec = '';
  let note = '';

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const subParts = p.split('###');
    const h = (subParts[0] || '').trim().toLowerCase();
    const content = (subParts.slice(1).join('###') || '').trim();
    if (h.includes('input')) {
      inputSpec = content;
    } else if (h.includes('output')) {
      outputSpec = content;
    } else if (h.includes('note')) {
      note = content;
    } else if (!h.includes('example') && !h.includes('sample')) {
      body += '\n\n## ' + subParts[0].trim() + '\n\n' + content;
    }
  }

  function cleanLines(s) {
    if (!s) return '';
    const lines = s.split('\n');
    let inCode = false;
    for (let j = 0; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim().startsWith('```')) {
        inCode = !inCode;
        lines[j] = l.trim();
      } else if (!inCode) {
        lines[j] = l.replace(/^[ \t]+/, '');
      }
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  return {
    body: cleanLines(body),
    inputSpec: cleanLines(inputSpec),
    outputSpec: cleanLines(outputSpec),
    note: cleanLines(note),
    samples: samples
  };
}

function buildTophReadme(opts) {
  const {
    slug,
    title,
    timeLimit,
    memoryLimit,
    contestSlug,
    contestName,
    category,
    runtime,
    memory,
    url,
    statement,
    body,
    inputSpec,
    outputSpec,
    note,
    samples,
    tags,
    language,
    subId
  } = opts;

  const probName = title || slug || 'Unknown Problem';
  const probUrl = url || (contestSlug ? `https://toph.co/c/${contestSlug}/p/${slug}` : `https://toph.co/p/${slug}`);
  const contestUrl = contestSlug ? `https://toph.co/c/${contestSlug}` : '';
  const subUrl = subId ? `https://toph.co/s/${subId}` : '';

  let md = `# [${probName}](${probUrl})\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| **Platform** | 🟢 Toph |\n`;
  md += `| **Problem** | [${probName}](${probUrl}) |\n`;
  const contestDisplay = contestName || contestSlug || '';
  md += `| **Contest** | ${contestSlug ? `[${contestDisplay}](${contestUrl})` : 'N/A'} |\n`;
  md += `| **Category** | ${contestSlug ? 'Contest' : (category || 'Practice')} |\n`;
  if (tags && tags !== 'Practice') {
    md += `| **Tags** | ${tags} |\n`;
  }
  md += `| **Verdict** | ✅ Accepted |\n`;
  md += `| **Language** | ${language || 'N/A'} |\n`;
  md += `| **Runtime** | ${runtime || 'N/A'} |\n`;
  md += `| **Memory** | ${memory || 'N/A'} |\n`;
  if (subId) {
    md += `| **Submission** | [${subId}](${subUrl}) |\n`;
  }
  md += `\n---\n\n`;

  if (timeLimit || memoryLimit) {
    md += `| ⏱ Time Limit | 💾 Memory Limit |\n|---|---|\n`;
    md += `| ${timeLimit || '1s'} | ${memoryLimit || '512 MB'} |\n\n`;
    md += `---\n\n`;
  }

  // Parse statement into clean modular sections
  let parsedBody = body || '';
  let parsedInput = inputSpec || '';
  let parsedOutput = outputSpec || '';
  let parsedNote = note || '';
  let parsedSamples = (samples && Array.isArray(samples) && samples.length > 0) ? samples : [];

  if (!parsedBody && statement) {
    const parsed = parseTophSections(statement);
    parsedBody = parsed.body;
    if (parsed.inputSpec && !parsedInput) parsedInput = parsed.inputSpec;
    if (parsed.outputSpec && !parsedOutput) parsedOutput = parsed.outputSpec;
    if (parsed.note && !parsedNote) parsedNote = parsed.note;
    if (parsed.samples && parsed.samples.length > 0 && parsedSamples.length === 0) {
      parsedSamples = parsed.samples;
    }
  }

  if (!parsedBody || parsedBody.includes('Page Not Found') || parsedBody.includes('404 Not Found') || parsedBody.includes('cannot find the page')) {
    parsedBody = `*Problem statement could not be fetched automatically. Please visit [${probName}](${probUrl}) for the full statement.*`;
  }

  md += `## Problem Statement\n\n${parsedBody}\n\n`;

  if (parsedInput) {
    md += `## Input\n\n${parsedInput}\n\n`;
  }

  if (parsedOutput) {
    md += `## Output\n\n${parsedOutput}\n\n`;
  }

  if (parsedSamples.length > 0) {
    md += `## Sample Tests\n\n`;
    parsedSamples.forEach((s, idx) => {
      const num = parsedSamples.length > 1 ? ` ${idx + 1}` : '';
      md += `### Sample Input${num}\n\`\`\`\n${s.input}\n\`\`\`\n\n`;
      md += `### Sample Output${num}\n\`\`\`\n${s.output}\n\`\`\`\n\n`;
    });
  } else if (samples && typeof samples === 'string' && samples.trim()) {
    md += `## Sample Tests\n\n${samples}\n\n`;
  }

  if (parsedNote) {
    md += `## Note\n\n${parsedNote}\n\n`;
  }

  md += `---\n*Synced automatically by [CodeSync Pro](https://github.com/parthopaul69/CP)*\n`;
  return md;
}

async function syncToph(data, cfg) {
  const rawToken = cfg.ghToken;
  const ghToken = deobfuscate(rawToken);
  const { ghOwner, ghRepo } = cfg;
  let { slug, title, code, language, timeLimit, memoryLimit, contestSlug, contestName, category, runtime, memory, url, statement, samples, tags, subId } = data;

  // Language filter check
  const allowed = await isLanguageAllowed(language);
  if (!allowed) {
    console.log('[CodeSync] Skipping Toph submission due to language filter:', language);
    const safeProblem = (title || slug || 'unknown').replace(/[<>:"/\\|?*]+/g, '').trim();
    await appendSyncLog({
      platform: 'TP',
      problemCode: slug || safeProblem,
      problemName: title || safeProblem,
      commitMsg: `Skipped — language filter (${language || 'unknown'})`,
      syncedAt: new Date().toISOString(),
      submissionTime: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
      lang: language || 'unknown',
      skipped: true,
      repoPath: ''
    });
    return { skipped: true, platform: 'TP', problemCode: slug || safeProblem, reason: `language filter (${language || 'unknown'})` };
  }

  // Automatic statement cache resolution if empty or fallback
  if (!statement || statement.length < 20 || statement.includes('Problem statement could not be fetched automatically')) {
    try {
      const titleSlug = (title || slug || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const titleClean = (title || slug || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      const keys = [
        `tp_prob_${slug}`,
        `tp_prob_${titleSlug}`,
        `tp_prob_title_${titleClean}`,
        'tp_last_active_problem'
      ];
      if (contestSlug) {
        keys.unshift(`tp_prob_${contestSlug}_${slug}`);
        keys.unshift(`tp_prob_${contestSlug}_${titleSlug}`);
      }
      const cached = await chrome.storage.local.get(keys);
      let found = null;
      for (const k of keys) {
        if (cached[k]) { found = cached[k]; break; }
      }
      if (found && (found.statement || found.bodyMarkdown || found.body)) {
        statement = found.statement || found.bodyMarkdown || found.body;
        if (found.timeLimit && (!timeLimit || timeLimit === '1s')) timeLimit = found.timeLimit;
        if (found.memoryLimit && (!memoryLimit || memoryLimit === '512 MB')) memoryLimit = found.memoryLimit;
        if (found.samples && (!samples || samples.length === 0)) samples = found.samples;
        if (found.contestSlug && !contestSlug) contestSlug = found.contestSlug;
        if (found.contestName && !contestName) contestName = found.contestName;
      }
    } catch(e) {}
  }

  // Fallback network fetch if statement not in cache
  if (!statement || statement.length < 20 || statement.includes('Problem statement could not be fetched automatically')) {
    try {
      const titleSlug = (title || slug || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const candidateUrls = [];
      if (contestSlug && slug) candidateUrls.push(`https://toph.co/c/${contestSlug}/p/${slug}`);
      if (slug) candidateUrls.push(`https://toph.co/p/${slug}`);
      if (titleSlug && titleSlug !== slug) {
        if (contestSlug) candidateUrls.push(`https://toph.co/c/${contestSlug}/p/${titleSlug}`);
        candidateUrls.push(`https://toph.co/p/${titleSlug}`);
      }

      let probHtml = null;
      let usedUrl = '';
      for (const targetUrl of candidateUrls) {
        const probResult = await fetchViaTab('https://toph.co/*', targetUrl);
        if (probResult && probResult.ok && probResult.text && !probResult.text.includes('Page Not Found') && !probResult.text.includes('404 Not Found') && !probResult.text.includes("cannot find the page")) {
          probHtml = probResult.text;
          usedUrl = targetUrl;
          break;
        } else {
          try {
            const resp = await fetch(targetUrl, { credentials: 'include' });
            if (resp.ok) {
              const txt = await resp.text();
              if (txt && !txt.includes('Page Not Found') && !txt.includes('404 Not Found') && !txt.includes("cannot find the page")) {
                probHtml = txt;
                usedUrl = targetUrl;
                break;
              }
            }
          } catch(fe) {}
        }
      }

      if (probHtml) {
        await ensureOffscreen();
        const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_TOPH_PROBLEM', html: probHtml, url: usedUrl });
        if (parsed && parsed.ok && parsed.stmt) {
          const s = parsed.stmt;
          const sBody = s.bodyMarkdown || s.body || '';
          if (sBody && !sBody.includes('Page Not Found') && !sBody.includes('404 Not Found')) {
            statement = sBody;
            if (s.timeLimit) timeLimit = s.timeLimit;
            if (s.memoryLimit) memoryLimit = s.memoryLimit;
            if (s.samples && (!samples || samples.length === 0)) samples = s.samples;
            if (s.title && !title) title = s.title;
          }
        }
      }
    } catch(e) {}
  }

  const ext = getExtension(language || 'cpp');
  const safeProblemName = (title || slug || 'unknown').replace(/[<>:"/\\|?*]+/g, '').trim();

  let rtDisplay = runtime ? runtime : 'N/A';
  let memDisplay = memory ? memory : 'N/A';

  const commitMsg = `[${safeProblemName}] Accepted | Time: ${rtDisplay} | Memory: ${memDisplay} | Language: ${language}`;
  const dateStr = new Date().toISOString();

  const syncDataWithResolved = {
    ...data,
    statement,
    timeLimit,
    memoryLimit,
    samples,
    contestSlug,
    contestName,
    category: contestSlug ? 'Contest' : (category || 'Practice')
  };

  const readme = buildTophReadme(syncDataWithResolved);
  const finalSource = code || '// Source not available';

  await ensureRepo(ghToken, ghOwner, ghRepo);

  // Push to GitHub under Toph/{category}/{safeProblemName}/
  const effectiveCategory = (contestSlug || category === 'Contest') ? 'Contest' : (category || 'Practice');
  const safeCategory = effectiveCategory.replace(/[<>:"/\\|?*]+/g, '').trim();
  const base = `Toph/${safeCategory}/${safeProblemName}`;
  await putFile(ghToken, ghOwner, ghRepo, `${base}/README.md`, readme, commitMsg, dateStr);
  await putFile(ghToken, ghOwner, ghRepo, `${base}/${slug || 'solution'}.${ext}`, finalSource, commitMsg, dateStr);

  await appendSyncLog({
    platform: 'TP',
    problemCode: slug,
    problemName: title || slug || 'unknown',
    commitMsg,
    syncedAt: new Date().toISOString(),
    submissionTime: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
    lang: ext,
    time: runtime,
    memory,
    repoPath: `https://github.com/${ghOwner}/${ghRepo}/tree/main/${base}`
  });

  // Track daily activity
  try {
    const today = new Date().toISOString().slice(0, 10);
    const actData = await chrome.storage.local.get(['tpDailyActivity']);
    const tpAct = actData.tpDailyActivity || {};
    tpAct[today] = (tpAct[today] || 0) + 1;
    await chrome.storage.local.set({ tpDailyActivity: tpAct });
  } catch(e) {}

  return { platform: 'TP', problemCode: slug, commitMsg };
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseACSubmissionHtmlDirect(html) {
  let code = '';
  const codeMatch = html.match(/<pre[^>]*id="submission-code"[^>]*>([\s\S]*?)<\/pre>/) ||
                    html.match(/<pre[^>]*class="[^"]*prettyprint[^"]*"[^>]*>([\s\S]*?)<\/pre>/) ||
                    html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (codeMatch) {
    let rawCode = codeMatch[1];
    if (rawCode.includes('<li')) {
      const liMatches = rawCode.match(/<li[^>]*>([\s\S]*?)<\/li>/g);
      if (liMatches) {
        code = liMatches.map(li => {
          const content = li.replace(/<[^>]*>/g, '');
          return decodeHtmlEntities(content);
        }).join('\n');
      } else {
        code = decodeHtmlEntities(rawCode.replace(/<[^>]*>/g, ''));
      }
    } else {
      code = decodeHtmlEntities(rawCode.replace(/<[^>]*>/g, ''));
    }
  }

  let timeMs = 0;
  const timeMatch = html.match(/<th[^>]*>\s*(?:Execution Time|実行時間)\s*<\/th>\s*<td[^>]*>\s*(\d+)\s*ms\s*<\/td>/i);
  if (timeMatch) timeMs = parseInt(timeMatch[1]) || 0;

  let memoryKb = 0;
  const memMatch = html.match(/<th[^>]*>\s*(?:Memory|メモリ)\s*<\/th>\s*<td[^>]*>\s*(\d+)\s*(?:KB|KiB|B|kb|kib|b)\s*<\/td>/i);
  if (memMatch) memoryKb = parseInt(memMatch[1]) || 0;

  return { code: code.trim(), timeMs, memoryKb };
}

async function syncAtCoderSubmission(sub, cfg) {
  const url = `https://atcoder.jp/contests/${sub.contest_id}/submissions/${sub.id}`;
  
  let html = null;
  let finalUrl = url;
  const result = await fetchViaTab('*://atcoder.jp/*', url);
  if (result && result.ok) {
    if (result.url) finalUrl = result.url;
    html = result.text;
    await logDebug(`syncAtCoderSubmission fetched via tab. html len: ${html ? html.length : 0}, finalUrl: ${finalUrl}`);
  } else {
    await logDebug(`syncAtCoderSubmission falling back to bg fetch`);
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (resp.ok) {
        finalUrl = resp.url || url;
        const buffer = await resp.arrayBuffer();
        html = new TextDecoder('utf-8').decode(buffer);
      }
      await logDebug(`syncAtCoderSubmission bg fetch len: ${html ? html.length : 0}, final url: ${finalUrl}`);
    } catch(e) { /* ignore */ }
  }

  if (!html || !html.includes('submission-code')) {
    try {
      await logDebug(`syncAtCoderSubmission: fetching via persistent scraper tab for ${url}`);
      const tabResult = await fetchViaScraperTab(url);
      if (tabResult && tabResult.ok && tabResult.text) {
        html = tabResult.text;
        finalUrl = tabResult.url || url;
        await logDebug(`syncAtCoderSubmission scraper tab fetch success. len: ${html ? html.length : 0}`);
      }
    } catch(e) {
      await logDebug(`syncAtCoderSubmission scraper tab fetch error: ${e.message}`);
    }
  }

  if (!html) {
    throw new Error('Failed to fetch AtCoder submission page. Make sure atcoder.jp is open in your browser.');
  }

  // Check if we were redirected to login page (URL-based check only — most reliable)
  if (finalUrl.includes('/login') || finalUrl.includes('/account')) {
    throw new Error('Not logged in to AtCoder. Please open atcoder.jp and log in first.');
  }

  if (isCFBlock(html) && !html.includes('submission-code')) {
    throw new Error('Cloudflare verification required. Please open AtCoder in your browser first.');
  }

  // Check for login form specifically (not just nav links that say 'login')
  if (html.includes('id="username"') || html.includes('id="password"') || html.includes('class="form-signin"')) {
    throw new Error('Not logged in to AtCoder. Please open atcoder.jp and log in first.');
  }

  const parsed = parseACSubmissionHtmlDirect(html);
  if (!parsed || !parsed.code) {
    await logDebug(`syncAtCoderSubmission parse failed. html snippet: ${html ? html.substring(0, 300).replace(/\s+/g, ' ') : 'null'}`);
    throw new Error('Could not extract code from AtCoder submission. The submission may be private or inaccessible.');
  }
  
  const syncData = {
    contestId: sub.contest_id,
    contestName: sub.contest_id.toUpperCase(),
    problemId: sub.problem_id,
    problemName: sub.problem_id,
    language: sub.language,
    code: parsed.code,
    timeMs: parsed.timeMs || sub.execution_time || 0,
    memoryKb: parsed.memoryKb || 0,
    submissionId: sub.id,
    url: url,
    timestamp: sub.epoch_second ? sub.epoch_second * 1000 : undefined
  };
  return await syncAC(syncData, cfg);
}

async function syncLeetCodeSubmission(sub, cfg) {
  let details = await getLCSubmissionCode(sub.id);
  
  // If code fetch failed (old submission ID / rate limit), try getting the latest AC submission for this problem
  if (!details || !details.code) {
    try {
      // Query the submission list filtered by questionSlug for the most recent AC submission
      const q = {
        query: `query submissionList($questionSlug: String!) {
          submissionList(offset: 0, limit: 20, lastKey: null, questionSlug: $questionSlug) {
            submissions {
              id
              lang
              statusDisplay
            }
          }
        }`,
        variables: { questionSlug: sub.titleSlug }
      };
      const r2 = await fetch('https://leetcode.com/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q), credentials: 'include'
      });
      if (r2.ok) {
        const d2 = await r2.json();
        const submissions = d2.data && d2.data.submissionList ? d2.data.submissionList.submissions : [];
        const freshList = submissions.filter(s => s.statusDisplay === 'Accepted');
        if (freshList.length > 0) {
          details = await getLCSubmissionCode(freshList[0].id);
        }
      }
    } catch(e2) { /* ignore */ }
  }


  // If still no code, mark problem as "acknowledged" in syncLog so it won't re-appear
  if (!details || !details.code) {
    const safeName = (sub.title || sub.titleSlug || 'unknown').replace(/[<>:"/\\|?*]+/g, '').trim();
    await appendSyncLog({
      platform: 'LC',
      problemCode: sub.titleSlug || safeName,
      problemName: safeName,
      titleSlug: sub.titleSlug,
      commitMsg: 'Code unavailable — submission too old or access denied',
      syncedAt: new Date().toISOString(),
      submissionTime: sub.timestamp ? new Date(parseInt(sub.timestamp, 10) * 1000).toISOString() : undefined,
      lang: 'unknown',
      skipped: true,
      repoPath: ''
    });
    return { skipped: true, platform: 'LC', problemCode: sub.titleSlug || safeName, reason: 'code unavailable' };
  }

  // Parse runtime/memory: LC API returns strings like "96 ms", "43.5 MB"
  let runtimeMs = 0;
  let memoryMb = 0;
  if (details.runtime) {
    const rtMatch = String(details.runtime).match(/(\d+)/);
    if (rtMatch) runtimeMs = parseInt(rtMatch[1], 10);
  }
  if (details.memory) {
    const memMatch = String(details.memory).match(/(\d+(?:\.\d+)?)/);
    if (memMatch) memoryMb = parseFloat(memMatch[1]);
  }

  const syncData = {
    titleSlug: sub.titleSlug,
    title: sub.title,
    difficulty: details.question ? details.question.difficulty : 'Unknown',
    code: details.code,
    language: details.lang ? (details.lang.name || details.lang.verboseName || 'cpp') : 'cpp',
    runtime: runtimeMs,
    memory: memoryMb,
    url: `https://leetcode.com/submissions/detail/${sub.id}/`,
    timestamp: details.timestamp ? parseInt(details.timestamp, 10) * 1000 : (sub.timestamp ? parseInt(sub.timestamp, 10) * 1000 : undefined)
  };
  return await syncLC(syncData, cfg);
}

async function syncTophSubmission(sub, cfg) {
  const subId = sub.subId || sub.id;
  const url = `https://toph.co/s/${subId}`;
  let html = null;
  const result = await fetchViaTab('*://toph.co/*', url);
  if (result && result.ok) {
    html = result.text;
  } else {
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (resp.ok) {
        html = await resp.text();
      }
    } catch(e) {}
  }

  // Extract real problem URL and contest slug from submission page HTML
  let problemPath = `/p/${sub.slug}`;
  let contestSlug = sub.contestSlug || '';
  let contestName = sub.contestName || '';
  if (html) {
    const cLinkMatch = html.match(/href=["']?\/c\/([a-zA-Z0-9_-]+)(?:\/|\?|["' >])/i);
    if (cLinkMatch && cLinkMatch[1] && cLinkMatch[1] !== 'contests' && cLinkMatch[1] !== 'host') {
      contestSlug = cLinkMatch[1];
    }
    const cNameMatch = html.match(/<a\b[^>]*href=["']?\/c\/[a-zA-Z0-9_-]+["']?[^>]*>([\s\S]*?)<\/a>/i);
    if (cNameMatch && cNameMatch[1]) {
      contestName = decodeHtmlEntities(cNameMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    const probLinkMatch = html.match(/href=["']?(\/(?:c\/([a-zA-Z0-9_-]+)\/)?p\/([a-zA-Z0-9_-]+))["']?/i);
    if (probLinkMatch) {
      problemPath = probLinkMatch[1];
      if (probLinkMatch[2] && !contestSlug) contestSlug = probLinkMatch[2];
      if (probLinkMatch[3] && !sub.slug) sub.slug = probLinkMatch[3];
    }

    const pracMatch = html.match(/(?:practice|contest)=([a-zA-Z0-9_-]+)/i);
    if (pracMatch && !contestSlug) {
      contestSlug = pracMatch[1];
    }
  }

  // Extract code from submission page
  let code = null;
  if (html) {
    const cmMatch = html.match(/<div\b[^>]*class=["']?cm-content["']?[^>]*>([\s\S]*?)<\/div>/i);
    const codeMatch = html.match(/<code\b[^>]*>([\s\S]*?)<\/code>/i) ||
                      html.match(/<pre\b[^>]*class=["']?code["']?[^>]*>([\s\S]*?)<\/pre>/i) ||
                      html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i) ||
                      html.match(/<textarea\b[^>]*name=["']?source["']?[^>]*>([\s\S]*?)<\/textarea>/i);
    if (cmMatch) {
      code = cmMatch[1].replace(/<div\b[^>]*class=["']?cm-line["']?[^>]*>/gi, '').replace(/<\/div>/gi, '\n');
      code = decodeHtmlEntities(code);
    } else if (codeMatch) {
      code = decodeHtmlEntities(codeMatch[1].replace(/<[^>]+>/g, ''));
    }
  }

  // Fetch problem statement & limits if not present
  let statement = '';
  let timeLimit = '1s';
  let memoryLimit = '512 MB';
  let samples = '';
  let tags = 'Practice';
  
  let probTitle = sub.name || sub.title || sub.slug || 'Problem';
  const titleSlug = probTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  const titleUnderscore = probTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  const titleClean = probTitle.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

  // 1. Check storage cache first (checking multi-alias keys)
  try {
    const keysToCheck = [
      `tp_prob_${sub.slug}`,
      `tp_prob_${titleSlug}`,
      `tp_prob_${titleUnderscore}`,
      `tp_prob_title_${titleClean}`,
      'tp_last_active_problem'
    ];
    if (contestSlug) {
      keysToCheck.unshift(`tp_prob_${contestSlug}_${sub.slug}`);
      keysToCheck.unshift(`tp_prob_${contestSlug}_${titleSlug}`);
    }
    const stored = await chrome.storage.local.get(keysToCheck);
    let cachedProb = null;
    for (const k of keysToCheck) {
      if (stored[k]) { cachedProb = stored[k]; break; }
    }

    // Secondary cache fallback: scan all tp_prob_ keys if exact key missed
    if (!cachedProb) {
      const allLocal = await chrome.storage.local.get(null);
      for (const k in allLocal) {
        if (k.startsWith('tp_prob_')) {
          const item = allLocal[k];
          if (item && typeof item === 'object') {
            const iTitle = (item.title || '').toLowerCase().trim();
            const sTitle = probTitle.toLowerCase().trim();
            if ((iTitle && iTitle === sTitle) || (item.slug && (item.slug === sub.slug || item.slug === titleSlug))) {
              if (item.statement || item.bodyMarkdown || item.body) {
                cachedProb = item;
                break;
              }
            }
          }
        }
      }
    }

    if (cachedProb) {
      const cStmt = cachedProb.statement || cachedProb.bodyMarkdown || cachedProb.body || '';
      if (cStmt && !cStmt.includes('Page Not Found') && !cStmt.includes('404 Not Found')) {
        statement = cStmt;
        timeLimit = cachedProb.timeLimit || timeLimit;
        memoryLimit = cachedProb.memoryLimit || memoryLimit;
        samples = cachedProb.samples || '';
        tags = cachedProb.tags || tags;
        if (cachedProb.title) probTitle = cachedProb.title;
        if (cachedProb.contestSlug && !contestSlug) contestSlug = cachedProb.contestSlug;
        if (cachedProb.contestName && !contestName) contestName = cachedProb.contestName;

        // If cached statement has HTML tags, parse and clean immediately
        if (statement.includes('<') && statement.includes('>')) {
          const parsed = parseTophSections(statement);
          statement = parsed.body;
          if (parsed.samples && parsed.samples.length > 0 && (!samples || samples.length === 0)) {
            samples = parsed.samples;
          }
        }
      }
    }
  } catch(e) {}

  // 2. Query open Toph tabs via content script
  if (!statement || statement.length < 20 || statement.includes('Page Not Found') || statement.includes('404 Not Found')) {
    try {
      const tophTabs = await chrome.tabs.query({ url: ['https://toph.co/*'] });
      for (const tab of tophTabs) {
        try {
          const resp = await chrome.tabs.sendMessage(tab.id, {
            type: 'GET_ARENA_PROBLEM',
            slug: sub.slug,
            titleSlug: titleSlug,
            title: probTitle,
            contestSlug: contestSlug
          });
          if (resp && resp.ok) {
            if (resp.data) {
              const d = resp.data;
              const dTitle = (d.title || '').toLowerCase().trim();
              const sTitle = probTitle.toLowerCase().trim();
              if (dTitle === sTitle || d.slug === sub.slug || d.titleSlug === titleSlug || !statement) {
                const tabStmt = d.statement || d.bodyMarkdown || d.body || '';
                if (tabStmt && !tabStmt.includes('Page Not Found') && !tabStmt.includes('404 Not Found')) {
                  statement = tabStmt;
                  timeLimit = d.timeLimit || timeLimit;
                  memoryLimit = d.memoryLimit || memoryLimit;
                  samples = d.samples || samples;
                  tags = d.tags || tags;
                  if (d.title) probTitle = d.title;
                  if (d.contestSlug && !contestSlug) contestSlug = d.contestSlug;
                  if (d.contestName && !contestName) contestName = d.contestName;
                  break;
                }
              }
            } else if (resp.html) {
              await ensureOffscreen();
              const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_TOPH_PROBLEM', html: resp.html, url: resp.url });
              if (parsed && parsed.ok && parsed.stmt) {
                const s = parsed.stmt;
                const sBody = s.bodyMarkdown || s.body || '';
                if (sBody && !sBody.includes('Page Not Found') && !sBody.includes('404 Not Found')) {
                  statement = sBody;
                  timeLimit = s.timeLimit || timeLimit;
                  memoryLimit = s.memoryLimit || memoryLimit;
                  samples = s.samples || '';
                  tags = s.tags || tags;
                  if (s.title) probTitle = s.title;
                  if (resp.contestSlug && !contestSlug) contestSlug = resp.contestSlug;
                  if (resp.contestName && !contestName) contestName = resp.contestName;
                  break;
                }
              }
            }
          }
        } catch(te) {}
      }
    } catch(e) {}
  }

  // 3. Fallback: check activeProblem from IDE session
  if (!statement || statement.length < 20 || statement.includes('Page Not Found') || statement.includes('404 Not Found')) {
    try {
      const storedAct = await chrome.storage.local.get(['activeProblem', 'codesync_active_problem']);
      const actP = storedAct.activeProblem || storedAct.codesync_active_problem;
      if (actP && (actP.platform === 'TP' || (actP.url && actP.url.includes('toph.co')))) {
        const actTitle = (actP.title || '').toLowerCase().trim();
        const sTitle = probTitle.toLowerCase().trim();
        if (actTitle === sTitle || actP.slug === sub.slug || actP.slug === titleSlug) {
          if (actP.statement) statement = actP.statement;
          if (actP.timeLimit) timeLimit = actP.timeLimit;
          if (actP.memoryLimit) memoryLimit = actP.memoryLimit;
          if (actP.samples) samples = actP.samples;
          if (actP.title) probTitle = actP.title;
        }
      }
    } catch(e) {}
  }

  // 4. If not cached or was 404, fetch problem page via tab or HTTP
  const probUrl = `https://toph.co${problemPath}`;
  if (!statement || statement.length < 20 || statement.includes('Page Not Found') || statement.includes('404 Not Found')) {
    try {
      const candidateUrls = [probUrl];
      if (contestSlug) {
        candidateUrls.push(`https://toph.co/c/${contestSlug}/p/${sub.slug}`);
        candidateUrls.push(`https://toph.co/c/${contestSlug}/p/${titleSlug}`);
      }
      if (titleSlug && titleSlug !== sub.slug) {
        candidateUrls.push(`https://toph.co/p/${titleSlug}`);
      }

      let probHtml = null;
      let usedUrl = probUrl;
      for (const targetUrl of candidateUrls) {
        const probResult = await fetchViaTab('https://toph.co/*', targetUrl);
        if (probResult && probResult.ok && probResult.text && !probResult.text.includes('Page Not Found') && !probResult.text.includes('404 Not Found') && !probResult.text.includes("cannot find the page")) {
          probHtml = probResult.text;
          usedUrl = targetUrl;
          break;
        } else {
          try {
            const resp = await fetch(targetUrl, { credentials: 'include' });
            if (resp.ok) {
              const txt = await resp.text();
              if (txt && !txt.includes('Page Not Found') && !txt.includes('404 Not Found') && !txt.includes("cannot find the page")) {
                probHtml = txt;
                usedUrl = targetUrl;
                break;
              }
            }
          } catch(fe) {}
        }
      }

      if (probHtml) {
        // Use offscreen to parse DOM
        await ensureOffscreen();
        const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_TOPH_PROBLEM', html: probHtml, url: usedUrl });
        if (parsed && parsed.ok && parsed.stmt) {
          const s = parsed.stmt;
          const sBody = s.bodyMarkdown || s.body || '';
          if (sBody && !sBody.includes('Page Not Found') && !sBody.includes('404 Not Found')) {
            statement = sBody;
            timeLimit = s.timeLimit || timeLimit;
            memoryLimit = s.memoryLimit || memoryLimit;
            samples = s.samples || '';
            tags = s.tags || tags;
            if (s.title) probTitle = s.title;
          }
        } else {
          // Fallback direct extraction
          const cpuMatch = probHtml.match(/CPU\s*(\d+(?:\.\d+)?\s*(?:s|ms|second)s?)/i);
          if (cpuMatch) timeLimit = cpuMatch[1];
          const memMatch = probHtml.match(/Memory\s*(\d+\s*(?:MB|KB|GB))/i);
          if (memMatch) memoryLimit = memMatch[1];
          const bodyMatch = probHtml.match(/class=["']?panel__body["']?[^>]*>[\s\S]*?<div class=["']?artifact["']?[^>]*>([\s\S]*?)<\/div>/i);
          if (bodyMatch) {
            const rawExtracted = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (!rawExtracted.includes('Page Not Found') && !rawExtracted.includes('404 Not Found')) {
              statement = rawExtracted;
            }
          }
        }
      }
    } catch(e) {
      console.warn('Failed to fetch/parse Toph problem page:', e);
    }
  }

  // Save resolved statement under all aliases for permanent future lookups
  if (statement && !statement.includes('Page Not Found') && !statement.includes('404 Not Found')) {
    try {
      if (statement.includes('<') && statement.includes('>')) {
        const parsed = parseTophSections(statement);
        statement = parsed.body;
        if (parsed.samples && parsed.samples.length > 0 && (!samples || samples.length === 0)) {
          samples = parsed.samples;
        }
      }
      const toCache = { statement, timeLimit, memoryLimit, samples, tags, title: probTitle };
      const cacheObj = {
        [`tp_prob_${sub.slug}`]: toCache,
        [`tp_prob_${titleSlug}`]: toCache,
        [`tp_prob_title_${titleClean}`]: toCache
      };
      if (contestSlug) {
        cacheObj[`tp_prob_${contestSlug}_${sub.slug}`] = toCache;
        cacheObj[`tp_prob_${contestSlug}_${titleSlug}`] = toCache;
      }
      await chrome.storage.local.set(cacheObj);
    } catch(ce) {}
  }

  const effectiveProbUrl = contestSlug ? `https://toph.co/c/${contestSlug}/p/${sub.slug || titleSlug}` : probUrl;

  if (!statement || statement.includes('Page Not Found') || statement.includes('404 Not Found')) {
    statement = `*Problem statement could not be fetched automatically. Please visit [${probTitle}](${effectiveProbUrl}) for the full statement.*`;
  }

  const syncData = {
    slug: sub.slug || titleSlug,
    title: probTitle,
    code: code || '// Source code synced via CodeSync Pro',
    language: sub.language || 'cpp',
    timeLimit: timeLimit,
    memoryLimit: memoryLimit,
    contestSlug: contestSlug || '',
    contestName: contestName || '',
    category: contestSlug ? 'Contest' : (tags.includes('Contest') ? 'Contest' : 'Practice'),
    runtime: sub.runtime || 'N/A',
    memory: sub.memory || 'N/A',
    url: effectiveProbUrl,
    statement: statement,
    samples: samples,
    tags: tags,
    timestamp: sub.timestamp,
    subId: subId
  };

  return await syncToph(syncData, cfg);
}

// ─── CSES Readme & Sync Implementation ──────────────────────────────────────
function buildCSESReadme(data) {
  const {
    taskId,
    title,
    category,
    url,
    subId,
    subUrl,
    language,
    runtime,
    memory,
    timeLimit,
    memoryLimit,
    body,
    inputSpec,
    outputSpec,
    constraints,
    samples,
    statement
  } = data;

  const problemUrl = url || (taskId ? `https://cses.fi/problemset/task/${taskId}` : 'https://cses.fi/problemset/');
  const submissionUrl = subUrl || (subId ? `https://cses.fi/problemset/result/${subId}` : null);
  const codeLabel = taskId ? `${taskId}. ${title}` : title;

  let md = `# ${codeLabel}\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| **Platform** | 🟦 CSES Problem Set |\n`;
  md += `| **Problem** | [${taskId ? `${taskId} — ` : ''}${title}](${problemUrl}) |\n`;
  if (category) {
    md += `| **Category** | ${category} |\n`;
  }
  md += `| **Verdict** | ✅ Accepted |\n`;
  if (language) {
    md += `| **Language** | ${language} |\n`;
  }
  if (runtime && runtime !== 'N/A') {
    md += `| **Runtime** | ${runtime} |\n`;
  }
  if (memory && memory !== 'N/A') {
    md += `| **Memory** | ${memory} |\n`;
  }
  if (submissionUrl) {
    md += `| **Submission** | [View Submission](${submissionUrl}) |\n`;
  }
  md += `\n---\n\n`;

  if (timeLimit || memoryLimit) {
    md += `| ⏱ Time Limit | 💾 Memory Limit |\n|---|---|\n`;
    md += `| ${timeLimit || '1.00 s'} | ${memoryLimit || '512 MB'} |\n\n`;
    md += `---\n\n`;
  }

  // Description / Statement body
  if (body && body.trim()) {
    md += `## Problem Statement\n\n${body.trim()}\n\n`;
  } else if (statement && statement.trim()) {
    md += `## Problem Statement\n\n${statement.trim()}\n\n`;
  }

  if (inputSpec && inputSpec.trim()) {
    md += `## Input\n\n${inputSpec.trim()}\n\n`;
  }

  if (outputSpec && outputSpec.trim()) {
    md += `## Output\n\n${outputSpec.trim()}\n\n`;
  }

  if (constraints && constraints.trim()) {
    md += `## Constraints\n\n${constraints.trim()}\n\n`;
  }

  if (samples && samples.length > 0) {
    md += `## Examples\n\n`;
    samples.forEach((s, idx) => {
      const numStr = samples.length > 1 ? ` ${idx + 1}` : '';
      md += `**Example${numStr}:**\n\n`;
      md += `**Input:**\n\`\`\`\n${(s.input || '').trim()}\n\`\`\`\n\n`;
      md += `**Output:**\n\`\`\`\n${(s.output || '').trim()}\n\`\`\`\n\n`;
    });
  }

  md += `---\n\n`;
  md += `> 🔗 [View on CSES](${problemUrl})\n\n`;
  md += `---\n*Synced by [CodeSync Pro](https://github.com/parthopaul69/CodeSync-Pro-Extension)*\n`;

  return md;
}

const csesSyncingSubIds = new Set();

async function syncCSES(data, cfg) {
  const rawToken = cfg.ghToken;
  const ghToken = deobfuscate(rawToken);
  const { ghOwner, ghRepo } = cfg;
  const { subId, taskId, title, category, code, language, timeLimit, memoryLimit, runtime, memory, statement, body, inputSpec, outputSpec, constraints, samples, url, subUrl } = data;

  const sId = subId ? String(subId) : '';
  let cleanTitle = (title || '').replace(/[<>:"/\\|?*]+/g, '').trim();
  if (!cleanTitle || /^task$/i.test(cleanTitle)) {
    cleanTitle = taskId ? `Problem ${taskId}` : 'CSES Problem';
  }

  // 1. In-flight lock: prevent parallel runs for same subId
  if (sId && csesSyncingSubIds.has(sId)) {
    console.log(`[CodeSync] CSES subId ${sId} already in-flight, skipping duplicate.`);
    return { skipped: true, platform: 'CSES', problemCode: cleanTitle, reason: 'Already in-flight' };
  }
  if (sId) csesSyncingSubIds.add(sId);

  try {
    // 2. Persistent storage deduplication: check if already in syncLog
    const { syncLog = [] } = await chrome.storage.local.get('syncLog');
    const alreadyDone = syncLog.some(e => e.platform === 'CSES' && sId && String(e.subId) === sId);
    if (alreadyDone) {
      console.log(`[CodeSync] CSES subId ${sId} already in syncLog, skipping duplicate.`);
      return { skipped: true, platform: 'CSES', problemCode: cleanTitle, reason: 'Already synced' };
    }

    // Language filter check
    const allowed = await isLanguageAllowed(language);
    if (!allowed) {
      console.log('[CodeSync] Skipping CSES submission due to language filter:', language);
      const safeProblem = (title || taskId || 'unknown').replace(/[<>:"/\\|?*]+/g, '').trim();
      await appendSyncLog({
        platform: 'CSES',
        problemCode: taskId ? `CSES-${taskId}` : safeProblem,
        problemName: title || safeProblem,
        commitMsg: `Skipped — language filter (${language || 'unknown'})`,
        syncedAt: new Date().toISOString(),
        submissionTime: new Date().toISOString(),
        lang: language || 'unknown',
        skipped: true,
        repoPath: ''
      });
      return { skipped: true, platform: 'CSES', problemCode: taskId ? `CSES-${taskId}` : safeProblem, reason: `language filter (${language || 'unknown'})` };
    }

    const ext = getExtension(language);
    const safeCategory = (category || 'Problem Set').replace(/[<>:"/\\|?*]+/g, '').trim();

    const commitMsg = `CSES: ${cleanTitle} - Accepted (${language || 'C++'})`;
    const dateStr = new Date().toISOString();

    const readme = buildCSESReadme({
      title: cleanTitle,
      category: safeCategory,
      taskId,
      url,
      subId,
      subUrl,
      timeLimit,
      memoryLimit,
      statement,
      body,
      inputSpec,
      outputSpec,
      constraints,
      samples,
      language,
      runtime,
      memory
    });

    const finalSource = code || '// Source not available';

    await ensureRepo(ghToken, ghOwner, ghRepo);

    // Folder system: Option B (CSES/taskId - ProblemName/)
    const folderName = taskId ? `${taskId} - ${cleanTitle}` : cleanTitle;
    const base = `CSES/${folderName}`;
    await putFile(ghToken, ghOwner, ghRepo, `${base}/README.md`, readme, commitMsg, dateStr);
    await putFile(ghToken, ghOwner, ghRepo, `${base}/${cleanTitle}.${ext}`, finalSource, commitMsg, dateStr);

    await appendSyncLog({
      platform: 'CSES',
      problemCode: taskId ? `CSES-${taskId}` : cleanTitle,
      problemName: cleanTitle,
      category: safeCategory,
      subId: sId,
      commitMsg,
      syncedAt: new Date().toISOString(),
      submissionTime: new Date().toISOString(),
      lang: ext,
      repoPath: `https://github.com/${ghOwner}/${ghRepo}/tree/main/${base}`
    });

    // Immediately record today's accepted solve and submission in activity storage
    // so the streak tick, graph, and today count appear immediately without delay.
    try {
      const targetDateStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
      const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity', 'csesSolvedCount']);
      let act = stored.dailyActivity;
      if (typeof act === 'string') { try { act = JSON.parse(act); } catch(e) { act = {}; } }
      act = act || {};
      if (!act.CSES) act.CSES = {};
      act.CSES[targetDateStr] = (act.CSES[targetDateStr] || 0) + 1;
      let subAct = stored.dailySubmissionActivity;
      if (typeof subAct === 'string') { try { subAct = JSON.parse(subAct); } catch(e) { subAct = {}; } }
      subAct = subAct || {};
      if (!subAct.CSES) subAct.CSES = {};
      subAct.CSES[targetDateStr] = (subAct.CSES[targetDateStr] || 0) + 1;
      const newCsesSolvedCount = (stored.csesSolvedCount || 0) + 1;
      await chrome.storage.local.set({ dailyActivity: act, dailySubmissionActivity: subAct, csesSolvedCount: newCsesSolvedCount });
    } catch(e) { console.warn('[CodeSync] Could not update CSES daily activity:', e.message); }

    return {
      platform: 'CSES',
      problemCode: taskId ? `CSES-${taskId}` : cleanTitle,
      commitMsg
    };
  } finally {
    if (sId) csesSyncingSubIds.delete(sId);
  }
}

// ─── Smart Sync Helpers ──────────────────────────────────────────────────────
function isAlreadySynced(platform, problemId, titleSlug, syncLog, extraData, subObj) {
  // Normalize to kebab-case (spaces/special chars -> dash)
  const normLC = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  // Stripped (no separators at all) -- catches "twosums" vs "two-sum" edge cases
  const stripLC = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Strip special chars, keep alphanumeric and spaces
  const normPlain = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  return syncLog.some(e => {
    if (e.platform !== platform) return false;

    if (platform === 'CF') {
      const eCode = (e.problemCode || '').toLowerCase();
      const pid = problemId.toLowerCase();
      return eCode.startsWith(pid) || pid.startsWith(eCode.split(' ')[0].replace(/-.*/, ''));
    }
    if (platform === 'AC') {
      // 1. Direct submission ID match
      if (subObj && e.submissionId && String(e.submissionId) === String(subObj.id)) return true;

      const eCode = (e.problemCode || '').toLowerCase();
      const eName = (e.problemName || '').toLowerCase();
      const eRepo = (e.repoPath || '').toLowerCase();
      const eContest = (e.contestName || '').toLowerCase();
      const pid = problemId.toLowerCase(); // e.g. 'abc086_a', 'practice_1'

      // Direct match on problem_id or name
      if (eCode === pid || eName === pid) return true;
      // Handle underscore vs dash separator ('abc134_a' vs 'abc134-a')
      if (eCode === pid.replace(/_/g, '-') || eCode === pid.replace(/-/g, '_')) return true;
      // Stripped alphanumeric match
      if (stripLC(eCode) === stripLC(pid) || stripLC(eName) === stripLC(pid)) return true;
      // Substring match (require min 4 characters to avoid single letter collisions)
      if (eCode && pid && eCode.length >= 4 && pid.length >= 4 && (eCode.includes(pid) || pid.includes(eCode))) return true;
      if (eRepo && pid && pid.length >= 4 && (eRepo.includes(pid) || stripLC(eRepo).includes(stripLC(pid)))) return true;

      // Match using the problems list mapping (extraData from Kenkoooo)
      if (Array.isArray(extraData) && extraData.length > 0) {
        const match = extraData.find(p => p.id && p.id.toLowerCase() === pid);
        if (match) {
          const letter = pid.replace(/^[a-z]+\d+[_-]?/, '').replace(/[_-]/g, ''); // 'a', 'b2', etc.
          const title = (match.title || '').trim();
          const rawName = (match.name || '').trim();

          const candidateStrings = [
            title,
            rawName,
            title.replace(/^[A-Z0-9]+\.\s+/, ''),
            title.replace(/^[A-Z0-9]+\s*-\s*/, ''),
            letter ? (letter + ' - ' + title) : '',
            letter ? (letter + ' - ' + rawName) : '',
            letter ? (letter + '. ' + title) : '',
            letter ? (letter + '. ' + rawName) : '',
            letter ? (letter + ' ' + rawName) : ''
          ].filter(Boolean);

          const eCodeNorm = normLC(eCode);
          const eNameNorm = normLC(eName);
          const eCodeStrip = stripLC(eCode);
          const eNameStrip = stripLC(eName);
          const eRepoStrip = stripLC(eRepo);

          for (const cand of candidateStrings) {
            const cNorm = normLC(cand);
            const cStrip = stripLC(cand);
            if (eCodeNorm === cNorm || eNameNorm === cNorm) return true;
            if (eCodeStrip === cStrip || eNameStrip === cStrip) return true;
            if (cStrip && cStrip.length >= 3 && (eNameStrip.includes(cStrip) || eCodeStrip.includes(cStrip) || eRepoStrip.includes(cStrip) || (eNameStrip.length >= 3 && cStrip.includes(eNameStrip)) || (eCodeStrip.length >= 3 && cStrip.includes(eCodeStrip)))) return true;
            if (cNorm && cNorm.length >= 3 && (eNameNorm.includes(cNorm) || eCodeNorm.includes(cNorm) || (eNameNorm.length >= 3 && cNorm.includes(eNameNorm)))) return true;
          }
        }
      }

      // Fallback matching contest number/slug and problem letter
      const pidContest = pid.replace(/[_-].*/, ''); // 'abc086', 'practice'
      const contestNumMatch = pidContest.match(/\d+/);
      const contestNum = contestNumMatch ? contestNumMatch[0].replace(/^0+/, '') : ''; // '86'
      const letter = pid.replace(/^[a-z]+\d+[_-]?/, '').replace(/[_-]/g, '').toLowerCase(); // 'a'

      const allContext = [eContest, eRepo, eCode, eName].join(' ');
      
      if (contestNum && contestNum.length >= 2) {
        const hasContestNum = allContext.includes(contestNumMatch[0]) || (contestNum && allContext.includes(contestNum));
        if (hasContestNum && letter) {
          const startsWithLetter = (s) => {
            const p = normPlain(s);
            return p === letter || p.startsWith(letter + ' ') || p.startsWith(letter + '-');
          };
          if (startsWithLetter(eCode) || startsWithLetter(eName) || startsWithLetter(eRepo.split('/').pop() || '')) return true;
        }
      }

      if (pidContest === 'practice' && (allContext.includes('practice') || allContext.includes('welcome'))) {
        return true;
      }

      return false;
    }
    if (platform === 'TP') {
      const eCode = (e.problemCode || '').toLowerCase();
      const eName = (e.problemName || '').toLowerCase();
      const pid = problemId.toLowerCase();
      if (eCode === pid || eName === pid) return true;
      if (normLC(eCode) === normLC(pid) || normLC(eName) === normLC(pid)) return true;
      if (stripLC(eCode) === stripLC(pid) || stripLC(eName) === stripLC(pid)) return true;
      if (eCode && (eCode.includes(pid) || pid.includes(eCode))) return true;
      if (e.repoPath && e.repoPath.toLowerCase().includes(pid)) return true;
      return false;
    }
    if (platform === 'LC') {
      if (e.titleSlug && titleSlug && e.titleSlug.toLowerCase() === titleSlug.toLowerCase()) {
        return true;
      }
      const slug = normLC(titleSlug);
      if (!slug) return false;
      // Check against both problemName and problemCode in the log
      const eName = normLC(e.problemName || '');
      const eCode = normLC(e.problemCode || '');
      // Exact kebab match
      if ((eName && (eName === slug || eName.includes(slug) || slug.includes(eName))) ||
          (eCode && (eCode === slug || eCode.includes(slug) || slug.includes(eCode)))) {
        return true;
      }
      // Stripped fallback (no punctuation)
      const slugStripped = stripLC(titleSlug);
      const eNameStripped = stripLC(e.problemName || '');
      const eCodeStripped = stripLC(e.problemCode || '');
      return (eNameStripped && eNameStripped === slugStripped) ||
             (eCodeStripped && eCodeStripped === slugStripped);
    }
    if (platform === 'CSES') {
      const eCode = (e.problemCode || '').toLowerCase();
      const eName = (e.problemName || '').toLowerCase();
      const pid = String(problemId || '').toLowerCase();
      const tSlug = normLC(titleSlug || '');
      if (pid && (eCode === `cses-${pid}` || eCode === pid || eCode.includes(pid))) return true;
      if (eName && (eName === pid || (tSlug && normLC(eName) === tSlug))) return true;
      if (e.repoPath && pid && e.repoPath.toLowerCase().includes(pid)) return true;
      if (tSlug && (normLC(eCode) === tSlug || normLC(eName) === tSlug)) return true;
      return false;
    }
    return false;
  });
}


async function checkLCStatus() {
  try {
    const q = { query: 'query { userStatus { username isSignedIn } }' };
    const r = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
      credentials: 'include'
    });
    if (!r.ok) return null;
    const d = await r.json();
    const status = d.data && d.data.userStatus;
    if (status && status.isSignedIn && status.username) {
      await chrome.storage.local.set({ lcUsername: status.username });
    }
    return status;
  } catch(e) {
    return null;
  }
}

async function getLCSubmissions(username, limit = 300) {
  const allSubmissions = [];
  try {
    let offset = 0;
    const pageSize = 20; // safe limit that LeetCode supports
    let hasNext = true;
    let pageCount = 0;
    
    // Fetch up to 10 pages (200 submissions) to be thorough and cover all solved questions
    while (hasNext && pageCount < 10) {
      const q = {
        query: `query submissionList($offset: Int!, $limit: Int!) {
          submissionList(offset: $offset, limit: $limit) {
            hasNext
            submissions {
              id
              title
              titleSlug
              timestamp
              statusDisplay
            }
          }
        }`,
        variables: { offset, limit: pageSize }
      };
      const r = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q),
        credentials: 'include'
      });
      if (!r.ok) {
        await logDebug(`getLCSubmissions page ${pageCount} HTTP error: ${r.status}`);
        break;
      }
      const d = await r.json();
      if (d.data && d.data.submissionList && Array.isArray(d.data.submissionList.submissions)) {
        const pageSubs = d.data.submissionList.submissions;
        allSubmissions.push(...pageSubs);
        hasNext = d.data.submissionList.hasNext && pageSubs.length === pageSize;
        offset += pageSize;
        pageCount++;
      } else {
        break;
      }
    }

    if (allSubmissions.length > 0) {
      const acSubs = allSubmissions.filter(s => s.statusDisplay === 'Accepted').map(s => ({
        id: s.id,
        title: s.title,
        titleSlug: s.titleSlug,
        timestamp: s.timestamp
      }));
      await logDebug(`getLCSubmissions: retrieved ${acSubs.length} Accepted submissions via paginated submissionList`);
      return acSubs;
    }
  } catch (e) {
    await logDebug(`getLCSubmissions: submissionList query failed, falling back: ${e.message}`);
  }

  // Fallback to recentAcSubmissionList (original query)
  await logDebug('getLCSubmissions: falling back to recentAcSubmissionList');
  const q = {
    query: `query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        titleSlug
        timestamp
      }
    }`,
    variables: { username, limit: 100 }
  };
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(q),
    credentials: 'include'
  });
  if (!r.ok) throw new Error(`LeetCode GraphQL error: ${r.status}`);
  const d = await r.json();
  return d.data ? d.data.recentAcSubmissionList : [];
}

async function getLCSubmissionCode(submissionId) {
  const q = {
    query: `query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        timestamp
        runtime
        memory
        lang {
          name
          verboseName
        }
        question {
          title
          titleSlug
          difficulty
        }
      }
    }`,
    variables: { submissionId: parseInt(submissionId, 10) }
  };
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(q),
    credentials: 'include'
  });
  if (!r.ok) throw new Error(`LeetCode GraphQL details error: ${r.status}`);
  const d = await r.json();
  return d.data ? d.data.submissionDetails : null;
}

async function getLCQuestionContent(titleSlug) {
  const q = {
    query: `query questionContent($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        content
      }
    }`,
    variables: { titleSlug }
  };
  try {
    const r = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
      credentials: 'include'
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.data && d.data.question ? d.data.question.content : null;
  } catch(e) {
    return null;
  }
}


function parseRepoPath(path) {
  const parts = path.split('/');
  if (parts.length < 2) return null;
  const p0 = parts[0].toLowerCase();

  // Match LeetCode
  // LeetCode/${safeProblem}/${file} (length === 3)
  // LeetCode/${difficulty}/${safeProblem}/${file} (length === 4)
  if (p0 === 'leetcode') {
    if (parts.length === 3) {
      const problemName = parts[1];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'LC',
          problemCode: problemName,
          problemName: problemName,
          difficulty: 'N/A',
          lang: ext,
          repoPath: path
        };
      }
    } else if (parts.length >= 4) {
      const difficulty = parts[1];
      const problemName = parts[2];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'LC',
          problemCode: problemName,
          problemName: problemName,
          difficulty: difficulty,
          lang: ext,
          repoPath: path
        };
      }
    }
  }

  // Match AtCoder
  // AtCoder/${safeProblem}/${file} (length === 3)
  // AtCoder/${safeContest}/${safeProblem}/${file} (length === 4)
  // AtCoder/${category}/${safeContest}/${safeProblem}/${file} (length >= 5)
  if (p0 === 'atcoder') {
    if (parts.length === 3) {
      const problemName = parts[1];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'AC',
          problemCode: problemName,
          problemName: problemName,
          contestName: 'Others',
          lang: ext,
          repoPath: path
        };
      }
    } else if (parts.length === 4) {
      const contestOrCategory = parts[1];
      const problemName = parts[2];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'AC',
          problemCode: problemName,
          problemName: problemName,
          contestName: contestOrCategory,
          lang: ext,
          repoPath: path
        };
      }
    } else if (parts.length >= 5) {
      const contest = parts[2];
      const problemName = parts[3];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'AC',
          problemCode: problemName,
          problemName: problemName,
          contestName: contest,
          lang: ext,
          repoPath: path
        };
      }
    }
  }

  // Match Toph
  // Toph/${safeProblem}/${file} (length === 3)
  // Toph/${category}/${safeProblem}/${file} (length >= 4)
  if (p0 === 'toph') {
    if (parts.length === 3) {
      const problemName = parts[1];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'TP',
          problemCode: problemName,
          problemName: problemName,
          category: 'Others',
          lang: ext,
          repoPath: path
        };
      }
    } else if (parts.length >= 4) {
      const category = parts[1];
      const problemName = parts[2];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'TP',
          problemCode: problemName,
          problemName: problemName,
          category: category,
          lang: ext,
          repoPath: path
        };
      }
    }
  }

  // Match Codeforces
  // Codeforces/${div}/${safeProblemName}/${file} (original, length === 4)
  if (p0 === 'codeforces') {
    if (parts.length >= 4) {
      const div = parts[1];
      const problemName = parts[2];
      const file = parts[parts.length - 1];
      if (file.includes('.') && !file.endsWith('.md')) {
        const ext = file.split('.').pop();
        return {
          platform: 'CF',
          problemCode: problemName,
          problemName: problemName,
          division: div,
          lang: ext,
          repoPath: path
        };
      }
    }
  }

  // Match ratingFolder Codeforces: ${ratingFolder}/${div}/${safeProblemName}/${file} (length === 4)
  const isRatingFolder = parseInt(parts[0]) > 0 || parts[0].toLowerCase() === 'unrated';
  if (isRatingFolder && parts.length >= 4 && (parts[1].toLowerCase().startsWith('div') || parts[1].toLowerCase() === 'others')) {
    const rating = parts[0];
    const div = parts[1];
    const problemName = parts[2];
    const file = parts[parts.length - 1];
    if (file.includes('.') && !file.endsWith('.md')) {
      const ext = file.split('.').pop();
      return {
        platform: 'CF',
        problemCode: problemName,
        problemName: problemName,
        rating: parseInt(rating) || 0,
        division: div,
        lang: ext,
        repoPath: path
      };
    }
  }

  // Match Codeforces ratingless div folder: ${div}/${safeProblemName}/${file} (length === 3)
  if (['div1', 'div2', 'div3', 'div4', 'others'].includes(p0) && parts.length >= 3) {
    const div = parts[0];
    const problemName = parts[1];
    const file = parts[parts.length - 1];
    if (file.includes('.') && !file.endsWith('.md')) {
      const ext = file.split('.').pop();
      return {
        platform: 'CF',
        problemCode: problemName,
        problemName: problemName,
        division: div,
        lang: ext,
        repoPath: path
      };
    }
  }

  return null;
}

async function syncLogFromGitHub(ghToken, ghOwner, ghRepo) {
  try {
    const repoCheck = await ghGet(`/repos/${ghOwner}/${ghRepo}`, ghToken);
    if (repoCheck.status !== 200) {
      console.warn('[CodeSync] Repository does not exist or is not accessible:', repoCheck.status);
      return;
    }

    let status, data;
    // Try main branch first
    const resMain = await ghGet(`/repos/${ghOwner}/${ghRepo}/git/trees/main?recursive=1&_t=${Date.now()}`, ghToken);
    status = resMain.status;
    data = resMain.data;
    
    if (status === 404) {
      // Try master branch
      const resMaster = await ghGet(`/repos/${ghOwner}/${ghRepo}/git/trees/master?recursive=1&_t=${Date.now()}`, ghToken);
      status = resMaster.status;
      data = resMaster.data;
    }
    
    if (status !== 200 || !data || !data.tree) {
      // If repo exists but we couldn't get a tree (likely because it has 0 commits / is completely empty),
      // we treat the tree as empty ([]) rather than returning early. This allows the local log to purge successfully.
      console.warn('[CodeSync] Could not fetch repo tree from GitHub, treating as empty:', status);
      data = { tree: [] };
    }
    
    const { syncLog = [] } = await chrome.storage.local.get('syncLog');
    
    // Build set of keys representing problems that exist on GitHub
    const gitHubKeys = new Set();
    const ghPlatformCounts = { CF: 0, AC: 0, LC: 0, TP: 0 };
    for (const item of data.tree) {
      if (item.type === 'blob' && item.path) {
        const parsed = parseRepoPath(item.path);
        if (parsed) {
          gitHubKeys.add(`${parsed.platform}::${parsed.problemCode.toLowerCase()}`);
          ghPlatformCounts[parsed.platform] = (ghPlatformCounts[parsed.platform] || 0) + 1;
        }
      }
    }
    
    let updated = false;
    const newSyncLog = [];
    
    // Purge logic: remove items not on GitHub, unless they are marked skipped or synced recently (within 15 minutes to allow GitHub tree API cache propagation)
    const propagationBuffer = 15 * 60 * 1000; // 15 minutes
    
    const normStr = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const hasMatch = (entry) => {
      const epCode = normStr(entry.problemCode);
      const epName = normStr(entry.problemName);
      if (!epCode && !epName) return false;

      for (const ghKey of gitHubKeys) {
        if (!ghKey.startsWith(`${entry.platform}::`)) continue;
        const ghCode = normStr(ghKey.split('::')[1]);
        if (!ghCode) continue;

        // Exact match of code or name
        if (ghCode === epCode || ghCode === epName) return true;
        
        // Substring / inclusion match (covers cases like "abc086a" in "abc086aproduct" or "123a" in "123asomeproblem")
        if (epCode && (ghCode.includes(epCode) || epCode.includes(ghCode))) return true;
        if (epName && (ghCode.includes(epName) || epName.includes(ghCode))) return true;
      }
      return false;
    };

    // Total file count on GitHub across all platforms
    const totalGhFiles = Object.values(ghPlatformCounts).reduce((a, b) => a + b, 0);
    // If the repo is completely empty (no recognisable problem files at all), purge everything
    // UNLESS the entry was synced very recently (within propagation buffer)
    const repoIsEmpty = totalGhFiles === 0;

    for (const entry of syncLog) {
      const key = `${entry.platform}::${entry.problemCode.toLowerCase()}`;
      const isRecent = entry.syncedAt && !isNaN(new Date(entry.syncedAt).getTime()) && (Date.now() - new Date(entry.syncedAt).getTime() < propagationBuffer);
      
      if (entry.skipped) {
        // Always keep skipped entries — they represent intentional filters
        newSyncLog.push(entry);
      } else if (isRecent) {
        // Keep very recently synced entries regardless (GitHub tree API has ~15min lag)
        newSyncLog.push(entry);
      } else if (!repoIsEmpty && hasMatch(entry)) {
        // Repo has data and this entry matches something on GitHub
        newSyncLog.push(entry);
      } else {
        // Not on GitHub (or repo empty) and not recent → purge
        updated = true;
        console.log(`[CodeSync] Purging local sync log entry missing on GitHub: ${key}`);
      }
    }
    
    // Add logic: if it exists on GitHub but not in newSyncLog, add it
    const newSyncLogKeys = new Set(newSyncLog.map(e => `${e.platform}::${e.problemCode.toLowerCase()}`));
    for (const item of data.tree) {
      if (item.type === 'blob' && item.path) {
        const parsed = parseRepoPath(item.path);
        if (parsed) {
          const key = `${parsed.platform}::${parsed.problemCode.toLowerCase()}`;
          if (!newSyncLogKeys.has(key)) {
            const existingEntry = syncLog.find(e => e.platform === parsed.platform && e.problemCode.toLowerCase() === parsed.problemCode.toLowerCase());
            const preservedSyncedAt = (existingEntry && existingEntry.syncedAt && existingEntry.syncedAt !== '1970-01-01T00:00:00.000Z')
              ? existingEntry.syncedAt
              : ((existingEntry && existingEntry.submissionTime) ? existingEntry.submissionTime : new Date().toISOString());
            newSyncLog.push({
              platform: parsed.platform,
              problemCode: parsed.problemCode,
              problemName: parsed.problemName,
              commitMsg: `Synced from GitHub`,
              syncedAt: preservedSyncedAt,
              syncedFromGitHub: true,
              lang: parsed.lang,
              repoPath: `https://github.com/${ghOwner}/${ghRepo}/tree/main/${parsed.repoPath}`
            });
            newSyncLogKeys.add(key);
            updated = true;
          }
        }
      }
    }
    
    if (updated) {
      const totalSynced = newSyncLog.filter(e => !e.skipped).length;
      await chrome.storage.local.set({ syncLog: newSyncLog, totalSynced });
    }
  } catch(e) {
    console.error('[CodeSync] Error syncing log from GitHub:', e);
  }
}

async function scanUnsynced(platform = 'all') {
  const cfg = await chrome.storage.local.get(['cfHandle', 'acHandle', 'tpHandle', 'syncLog', 'cfEnabled', 'acEnabled', 'lcEnabled', 'tpEnabled', 'csesEnabled', 'ghToken', 'ghOwner', 'ghRepo']);

  // GitHub is required to sync — validate it first
  if (!cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) {
    return { CF: [], AC: [], CSES: [], LC: [], TP: [], errors: { github: 'GitHub not configured. Please add your GitHub token, username and repository in Settings before scanning.' } };
  }

  const token = deobfuscate(cfg.ghToken);
  await syncLogFromGitHub(token, cfg.ghOwner, cfg.ghRepo);
  
  const reloadData = await chrome.storage.local.get('syncLog');
  const syncLog = reloadData.syncLog || [];
  const results = { CF: [], AC: [], CSES: [], LC: [], TP: [], errors: {} };

  const doAll = platform === 'all';
  
  // 1. Codeforces Scan (only when platform is 'all' or 'cf')
  if ((doAll || platform === 'cf') && cfg.cfEnabled !== false && cfg.cfHandle) {
    try {
      // Fetch ALL accepted submissions with pagination
      let from = 1;
      const PAGE = 500;
      const unique = new Map();
      while (true) {
        const data = await fetchCFAPI('user.status', { handle: cfg.cfHandle, from: String(from), count: String(PAGE) });
        const page = data.result || [];
        for (const sub of page) {
          if (sub.verdict === 'OK') {
            const cid = sub.contestId || (sub.problem && sub.problem.problemsetName === 'acmsguru' ? 'acmsguru' : '');
            if (cid && !sub.contestId) sub.contestId = cid;
            const key = `${sub.contestId || ''}${sub.problem.index}`;
            if (!unique.has(key)) unique.set(key, sub);
          }
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }
      for (const [key, sub] of unique.entries()) {
        if (!isAlreadySynced('CF', key, '', syncLog)) {
          results.CF.push({ platform: 'CF', sub, id: key, name: `${key} - ${sub.problem.name}` });
        }
      }
    } catch(e) {
      console.error('CF Scan error:', e);
      results.errors.CF = e.message.includes('unavailable')
        ? 'Codeforces API unavailable — open codeforces.com in a tab first'
        : e.message;
    }
  } else if ((doAll || platform === 'cf') && cfg.cfEnabled !== false && !cfg.cfHandle) {
    results.errors.CF = 'Handle not configured';
  }

  // 2. AtCoder Scan (only when platform is 'all' or 'ac')
  if ((doAll || platform === 'ac') && cfg.acEnabled !== false && cfg.acHandle) {
    try {
      // Warm up Kenkoooo problems list cache
      let problemsList = [];
      try {
        await getACProblemMeta('warmup');
        const stored = await chrome.storage.local.get('ac_problems_list');
        problemsList = stored.ac_problems_list || [];
        if (!problemsList || problemsList.length === 0) {
          const resp = await fetch('https://kenkoooo.com/atcoder/resources/problems.json');
          if (resp.ok) {
            problemsList = await resp.json();
            await chrome.storage.local.set({ ac_problems_list: problemsList, ac_problems_list_time: Date.now() });
          }
        }
      } catch(e) {}
      const probMap = new Map((problemsList || []).map(p => [p.id, p]));

      // Paginate through all submissions (kenkoooo v3: up to 500 per page)
      let allSubs = [];
      let fromSecond = 0;
      while (true) {
        const resp = await fetch(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(cfg.acHandle)}&from_second=${fromSecond}`);
        if (!resp.ok) { results.errors.AC = `AtCoder API HTTP ${resp.status}`; break; }
        const page = await resp.json();
        if (!page || page.length === 0) break;
        allSubs = allSubs.concat(page);
        if (page.length < 500) break;
        fromSecond = page[page.length - 1].epoch_second + 1;
      }
      const unique = new Map();
      for (const sub of allSubs) {
        if (sub.result === 'AC') {
          const prev = unique.get(sub.problem_id);
          if (!prev || sub.id > prev.id) unique.set(sub.problem_id, sub);
        }
      }
      for (const [key, sub] of unique.entries()) {
        if (!isAlreadySynced('AC', key, '', syncLog, problemsList, sub)) {
          const meta = probMap.get(key);
          const cleanName = meta && meta.title ? cleanKenkooooTitle(meta.title) : key;
          results.AC.push({ platform: 'AC', sub, id: key, name: cleanName });
        }
      }
    } catch(e) {
      console.error('AC Scan error:', e);
      results.errors.AC = e.message;
    }
  } else if ((doAll || platform === 'ac') && cfg.acEnabled !== false && !cfg.acHandle) {
    results.errors.AC = 'Username not configured';
  }


  // 3. LeetCode Scan (only when platform is 'all' or 'lc')
  if ((doAll || platform === 'lc') && cfg.lcEnabled !== false) {
    try {
      const status = await checkLCStatus();
      if (status && status.isSignedIn && status.username) {
        // Use recentAcSubmissionList for recent submissions (up to 500 = plenty for most users)
        const lcSubs = await getLCSubmissions(status.username, 500);
        const unique = new Map();
        for (const sub of lcSubs) {
          // Only add first occurrence of each problem (most recent AC submission)
          if (!unique.has(sub.titleSlug)) unique.set(sub.titleSlug, sub);
        }

        for (const [key, sub] of unique.entries()) {
          if (!isAlreadySynced('LC', '', key, syncLog)) {
            results.LC.push({ platform: 'LC', sub, id: key, name: sub.title || key });
          }
        }
      } else {
        results.errors.LC = 'Not signed in (please log into LeetCode)';
      }
    } catch(e) {
      console.error('LC Scan error:', e);
      results.errors.LC = e.message;
    }
  }

  // 4. Toph Scan (only when platform is 'all' or 'tp')
  if ((doAll || platform === 'tp') && cfg.tpEnabled !== false && cfg.tpHandle) {
    try {
      let authorId = cfg.tpAuthorId || null;
      if (!authorId) {
        let uHtml = null;
        const uUrl = `https://toph.co/u/${encodeURIComponent(cfg.tpHandle)}`;
        const userResp = await fetchViaTab('*://toph.co/*', uUrl);
        if (userResp && userResp.ok) uHtml = userResp.text;
        else {
          const r = await fetch(uUrl);
          if (r.ok) uHtml = await r.text();
        }
        if (uHtml) {
          const m = uHtml.match(/\/submissions\/filter\?author=([a-f0-9]{24})/i) ||
                    uHtml.match(/\/accounts\/([a-f0-9]{24})\//i) || 
                    uHtml.match(/"id":\s*"([a-f0-9]{24})"/i) || 
                    uHtml.match(/charts\.[a-zA-Z]+\([^,]+,\s*["']([a-f0-9]{24})["']/i);
          if (m) {
            authorId = m[1];
            await chrome.storage.local.set({ tpAuthorId: authorId });
          }
        }
      }

      if (!authorId) {
        results.errors.TP = `User ${cfg.tpHandle} not found on Toph`;
      } else {
        const unique = new Map();
        let start = 0;
        while (start <= 500) {
          let subHtml = null;
          const sUrl = `https://toph.co/submissions/filter?author=${authorId}&start=${start}`;
          const tabRes = await fetchViaTab('*://toph.co/*', sUrl);
          if (tabRes && tabRes.ok) subHtml = tabRes.text;
          else {
            const subResp = await fetch(sUrl);
            if (subResp.ok) subHtml = await subResp.text();
          }
          if (!subHtml) break;
          const rows = subHtml.split(/<tr\b/i);
          let foundInPage = 0;
          for (const row of rows) {
            if (!row.includes('text-verdict-ac')) continue;
            foundInPage++;
            const subIdMatch = row.match(/id=["']?trSubmission(\d+)/i) || row.match(/<td>(\d+)/i);
            const probMatch = row.match(/<a\s+href=["']?(?:\/c\/([a-z0-9\-_]+))?\/p\/([a-z0-9\-_]+)["']?>([^<]+)<\/a>/i);
            const contestMatch = row.match(/href=["']?\/c\/([a-z0-9\-_]+)["']?>([^<]+)<\/a>/i);
            const contestSlug = (probMatch && probMatch[1]) || (contestMatch ? contestMatch[1] : '');
            const contestName = contestMatch ? contestMatch[2].trim() : '';
            const langMatch = row.match(/<td>([A-Za-z0-9\+\.\#\s]+?)<td class=text-right>/i);
            const timeMatch = row.match(/data-timestamp=["']?(\d+)["']?/i);

            if (probMatch) {
              const slug = probMatch[2] || probMatch[1];
              const title = probMatch[3].trim();
              const subId = subIdMatch ? subIdMatch[1] : null;
              const lang = langMatch ? langMatch[1].trim() : '';
              const ts = timeMatch ? parseInt(timeMatch[1], 10) * 1000 : Date.now();
              if (!unique.has(slug)) {
                unique.set(slug, {
                  id: subId,
                  subId: subId,
                  slug: slug,
                  name: title,
                  title: title,
                  language: lang,
                  timestamp: ts,
                  contestSlug: contestSlug,
                  contestName: contestName,
                  category: contestSlug ? 'Contest' : 'Practice'
                });
              }
            }
          }
          const totalRowsInPage = subHtml.split('<tr id=trSubmission').length - 1;
          if (totalRowsInPage < 50) break;
          start += 50;
        }

        for (const [slug, sub] of unique.entries()) {
          if (!isAlreadySynced('TP', slug, '', syncLog)) {
            results.TP.push({
              platform: 'TP',
              sub: sub,
              id: slug,
              name: sub.name || slug
            });
          }
        }
      }
    } catch(e) {
      console.error('Toph Scan error:', e);
      results.errors.TP = e.message;
    }
  } else if ((doAll || platform === 'tp') && cfg.tpEnabled !== false && !cfg.tpHandle) {
    results.errors.TP = 'Handle not configured';
  }

  // 5. CSES Scan (only when platform is 'all' or 'cses')
  if ((doAll || platform === 'cses') && cfg.csesEnabled !== false) {
    try {
      let pHtml = null;
      const tabRes = await fetchViaTab('*://cses.fi/*', 'https://cses.fi/problemset/');
      if (tabRes && tabRes.ok && tabRes.text) {
        pHtml = tabRes.text;
      } else {
        try {
          const res = await fetch('https://cses.fi/problemset/', { credentials: 'include' });
          if (res.ok) pHtml = await res.text();
        } catch(fe) {}
      }

      // If no open tab or direct fetch didn't see session, briefly open a background tab
      if (!pHtml || !pHtml.includes('task-score') || pHtml.includes('/login')) {
        try {
          const tempTab = await chrome.tabs.create({ url: 'https://cses.fi/problemset/', active: false });
          try {
            await waitForTabToLoad(tempTab.id, 8000);
            const scraperRes = await fetchViaTab('*://cses.fi/*', 'https://cses.fi/problemset/');
            if (scraperRes && scraperRes.ok && scraperRes.text) {
              pHtml = scraperRes.text;
            }
          } finally {
            await chrome.tabs.remove(tempTab.id).catch(() => {});
          }
        } catch(tabErr) {}
      }

      if (pHtml) {
        const taskRegex = /<li class="task">\s*<a href="\/problemset\/task\/(\d+)\/?">([^<]+)<\/a>(?:[\s\S]*?)(<span class="task-score[^>]*>(?:[\s\S]*?<\/span>)?)/gi;
        let match;
        const solvedTasks = [];
        while ((match = taskRegex.exec(pHtml)) !== null) {
          const taskId = match[1];
          const taskName = match[2].trim();
          const spanHtml = match[3] || '';
          if (/full|c100|100\s*\/\s*100|title=["'][^"']*100/i.test(spanHtml)) {
            solvedTasks.push({ taskId, name: taskName });
          }
        }

        if (solvedTasks.length === 0) {
          const isLoggedIn = !pHtml.includes('/login') || pHtml.includes('/logout') || /<a href="\/logout"/i.test(pHtml);
          if (!isLoggedIn) {
            results.errors.CSES = 'Not signed in (open cses.fi in a tab and sign in)';
          }
        }

        for (const t of solvedTasks) {
          if (!isAlreadySynced('CSES', t.taskId, t.name, syncLog)) {
            results.CSES.push({
              platform: 'CSES',
              sub: { taskId: t.taskId, title: t.name },
              id: t.taskId,
              name: `${t.taskId} - ${t.name}`
            });
          }
        }
      } else {
        results.errors.CSES = 'Could not access cses.fi — open cses.fi in a tab first';
      }
    } catch(e) {
      console.error('CSES Scan error:', e);
      results.errors.CSES = e.message;
    }
  }

  return results;
}

async function getLCAllSolvedSlugs(username) {
  try {
    const list = await getLCSubmissions(username, 300);
    return list.map(x => x.titleSlug);
  } catch (e) {
    console.error('getLCAllSolvedSlugs error:', e);
    return [];
  }
}

async function syncCSESByItem(item, cfg) {
  const taskId = item.sub ? (item.sub.taskId || item.id) : item.id;
  const initialTitle = item.sub ? (item.sub.title || item.name) : item.name;

  // 1. Fetch task page
  let taskHtml = null;
  const taskUrl = `https://cses.fi/problemset/task/${taskId}/`;
  const tabRes = await fetchViaTab('*://cses.fi/*', taskUrl);
  if (tabRes && tabRes.ok && tabRes.text) {
    taskHtml = tabRes.text;
  } else {
    try {
      const res = await fetch(taskUrl, { credentials: 'include' });
      if (res.ok) taskHtml = await res.text();
    } catch(e) {}
  }

  if (!taskHtml) {
    throw new Error(`Failed to load CSES task ${taskId}. Please keep cses.fi open in a browser tab.`);
  }

  await ensureOffscreen();
  const parsedTask = await chrome.runtime.sendMessage({
    type: 'PARSE_CSES_TASK',
    html: taskHtml,
    taskId: taskId
  });

  if (!parsedTask || !parsedTask.ok || !parsedTask.task) {
    throw new Error(`Failed to parse CSES task ${taskId}: ${(parsedTask && parsedTask.error) || 'Invalid task page'}`);
  }

  const taskData = parsedTask.task;
  const subId = taskData.subId;
  if (!subId) {
    throw new Error(`No accepted submission found for CSES task ${taskId}. Please ensure you are logged into cses.fi.`);
  }

  // 2. Fetch submission result page
  let resultHtml = null;
  const resultUrl = `https://cses.fi/problemset/result/${subId}/`;
  const subTabRes = await fetchViaTab('*://cses.fi/*', resultUrl);
  if (subTabRes && subTabRes.ok && subTabRes.text) {
    resultHtml = subTabRes.text;
  } else {
    try {
      const res = await fetch(resultUrl, { credentials: 'include' });
      if (res.ok) resultHtml = await res.text();
    } catch(e) {}
  }

  if (!resultHtml) {
    throw new Error(`Failed to load CSES submission ${subId} for task ${taskId}`);
  }

  const parsedSub = await chrome.runtime.sendMessage({
    type: 'PARSE_CSES_RESULT',
    html: resultHtml
  });

  if (!parsedSub || !parsedSub.ok || !parsedSub.result || !parsedSub.result.code) {
    throw new Error(`Failed to extract code for CSES submission ${subId}`);
  }

  const subData = parsedSub.result;
  const v = (subData.verdict || '').toUpperCase();
  const isAccepted = subData.isAccepted !== undefined ? subData.isAccepted : (
    (v === 'ACCEPTED' || v.startsWith('ACCEPTED') || v.includes('ACCEPTED (100')) && !/WRONG|TIME LIMIT|RUNTIME|OUTPUT LIMIT|COMPILE/i.test(v)
  );
  if (!isAccepted) {
    throw new Error(`CSES submission ${subId} for task ${taskId} is not accepted (${subData.verdict || 'Unknown'}). Only accepted submissions can be synced.`);
  }

  const cleanTitle = (taskData.title && !/^(task|cses)$/i.test(taskData.title)) ? taskData.title : (initialTitle || `Problem ${taskId}`);

  const syncPayload = {
    subId: subId,
    subUrl: resultUrl,
    taskId: taskId,
    title: cleanTitle,
    category: taskData.category || 'Problem Set',
    code: subData.code,
    language: subData.compiler || 'C++',
    timeLimit: taskData.timeLimit || '1.00 s',
    memoryLimit: taskData.memoryLimit || '512 MB',
    runtime: subData.runtime || 'N/A',
    memory: subData.memory || 'N/A',
    statement: taskData.statementHtml || taskData.body || '',
    body: taskData.body || '',
    inputSpec: taskData.inputSpec || '',
    outputSpec: taskData.outputSpec || '',
    constraints: taskData.constraints || '',
    samples: taskData.samples || [],
    url: taskUrl
  };

  return await syncCSES(syncPayload, cfg);
}

async function executeSmartSync(items, platform = 'all') {
  if (isSyncing) {
    console.log('[CodeSync] Sync already in progress, ignoring START_SMART_SYNC.');
    return;
  }
  isSyncing = true;
  await chrome.storage.local.set({ activeSyncLogs: [] });

  const createdScraperTabIds = [];

  try {
    const cfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo']);
    let done = 0;
    const total = items.length;
    function broadcast(payload) { chrome.runtime.sendMessage(payload).catch(() => {}); }

    // If there is any AtCoder item in items, make sure we have a scraper tab loaded
    const hasAC = items.some(item => item.platform === 'AC');
    if (hasAC) {
      const existingTabs = await chrome.tabs.query({ url: '*://atcoder.jp/*' });
      if (existingTabs.length === 0) {
        await logDebug('executeSmartSync: opening background AtCoder scraper tab');
        try {
          const tab = await chrome.tabs.create({ url: 'https://atcoder.jp/', active: false });
          scraperTabId = tab.id;
          createdScraperTabIds.push(tab.id);
          await waitForTabToLoad(tab.id, 8000);
          await logDebug(`executeSmartSync: scraper tab ${tab.id} loaded`);
        } catch(e) {
          await logDebug(`executeSmartSync: failed to create scraper tab: ${e.message}`);
        }
      } else {
        await logDebug('executeSmartSync: using existing open AtCoder tab');
      }
    }

    // If there is any Codeforces item in items, make sure we have a Codeforces tab loaded
    const hasCF = items.some(item => item.platform === 'CF');
    if (hasCF) {
      const existingTabs = await chrome.tabs.query({ url: ['*://codeforces.com/*', '*://mirror.codeforces.com/*', '*://*.codeforces.com/*'] });
      if (existingTabs.length === 0) {
        await logDebug('executeSmartSync: opening background Codeforces tab');
        try {
          const tab = await chrome.tabs.create({ url: 'https://codeforces.com/', active: false });
          createdScraperTabIds.push(tab.id);
          await waitForTabToLoad(tab.id, 8000);
          await logDebug(`executeSmartSync: Codeforces tab ${tab.id} loaded`);
        } catch(e) {
          await logDebug(`executeSmartSync: failed to create Codeforces tab: ${e.message}`);
        }
      } else {
        await logDebug('executeSmartSync: using existing open Codeforces tab');
      }
    }

    // If there is any Toph item in items, make sure we have a Toph tab loaded
    const hasTP = items.some(item => item.platform === 'TP');
    if (hasTP) {
      const existingTabs = await chrome.tabs.query({ url: '*://toph.co/*' });
      if (existingTabs.length === 0) {
        await logDebug('executeSmartSync: opening background Toph tab');
        try {
          const tab = await chrome.tabs.create({ url: 'https://toph.co/', active: false });
          createdScraperTabIds.push(tab.id);
          await waitForTabToLoad(tab.id, 8000);
          await logDebug(`executeSmartSync: Toph tab ${tab.id} loaded`);
        } catch(e) {
          await logDebug(`executeSmartSync: failed to create Toph tab: ${e.message}`);
        }
      } else {
        await logDebug('executeSmartSync: using existing open Toph tab');
      }
    }

    // If there is any CSES item in items, make sure we have a CSES tab loaded
    const hasCSES = items.some(item => item.platform === 'CSES');
    if (hasCSES) {
      const existingTabs = await chrome.tabs.query({ url: '*://cses.fi/*' });
      if (existingTabs.length === 0) {
        await logDebug('executeSmartSync: opening background CSES tab');
        try {
          const tab = await chrome.tabs.create({ url: 'https://cses.fi/problemset/', active: false });
          createdScraperTabIds.push(tab.id);
          await waitForTabToLoad(tab.id, 8000);
          await logDebug(`executeSmartSync: CSES tab ${tab.id} loaded`);
        } catch(e) {
          await logDebug(`executeSmartSync: failed to create CSES tab: ${e.message}`);
        }
      } else {
        await logDebug('executeSmartSync: using existing open CSES tab');
      }
    }

    for (const item of items) {
      done++;
      const label = `[${item.platform}] ${item.name}`;
      try {
        smartSyncProgress = { done, total, label, phase: 'syncing', platform };
        broadcast({ type: 'SMART_SYNC_PROGRESS', phase: 'syncing', done, total, label, platform });
        
        let res;
        if (item.platform === 'CF') {
          res = await syncCF(item.sub, cfg);
        } else if (item.platform === 'AC') {
          res = await syncAtCoderSubmission(item.sub, cfg);
        } else if (item.platform === 'LC') {
          res = await syncLeetCodeSubmission(item.sub, cfg);
        } else if (item.platform === 'TP') {
          res = await syncTophSubmission(item.sub, cfg);
        } else if (item.platform === 'CSES') {
          res = await syncCSESByItem(item, cfg);
        }
        
        if (res && res.skipped) {
          const log = { msg: `⚠ ${label} (${res.reason || 'skipped'})`, cls: 'log-warn' };
          const { activeSyncLogs = [] } = await chrome.storage.local.get('activeSyncLogs');
          activeSyncLogs.push(log);
          await chrome.storage.local.set({ activeSyncLogs });

          smartSyncProgress = { done, total, label, phase: 'skipped', error: res.reason || 'skipped', platform };
          broadcast({ type: 'SMART_SYNC_PROGRESS', phase: 'skipped', done, total, label, error: res.reason || 'skipped', platform });
        } else {
          const log = { msg: `✓ ${label}`, cls: 'log-ok' };
          const { activeSyncLogs = [] } = await chrome.storage.local.get('activeSyncLogs');
          activeSyncLogs.push(log);
          await chrome.storage.local.set({ activeSyncLogs });

          smartSyncProgress = { done, total, label, phase: 'success', platform };
          broadcast({ type: 'SMART_SYNC_PROGRESS', phase: 'success', done, total, label, platform });
        }
      } catch(e) {
        console.error('Smart sync failed for', label, e);
        const log = { msg: `✗ ${label}: ${e.message}`, cls: 'log-err' };
        const { activeSyncLogs = [] } = await chrome.storage.local.get('activeSyncLogs');
        activeSyncLogs.push(log);
        await chrome.storage.local.set({ activeSyncLogs });

        smartSyncProgress = { done, total, label, phase: 'error', error: e.message, platform };
        broadcast({ type: 'SMART_SYNC_PROGRESS', phase: 'error', done, total, label, error: e.message, platform });
        if (item.platform === 'CF') {
          await addToFailedQueue({ platform: 'CF', sub: item.sub, lastError: e.message });
        } else if (item.platform === 'AC') {
          await addToFailedQueue({ platform: 'AC', sub: item.sub, lastError: e.message });
        } else if (item.platform === 'LC') {
          await addToFailedQueue({ platform: 'LC', sub: item.sub, lastError: e.message });
        } else if (item.platform === 'TP') {
          await addToFailedQueue({ platform: 'TP', sub: item.sub, lastError: e.message });
        } else if (item.platform === 'CSES') {
          await addToFailedQueue({ platform: 'CSES', sub: item.sub, lastError: e.message });
        }
      }

      // Add a delay between items to prevent API rate-limiting/Turnstile blocks
      if (done < total) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    }
    
    smartSyncProgress = { done: total, total, label: '', phase: 'finished', platform };
    broadcast({ type: 'SMART_SYNC_PROGRESS', phase: 'finished', done: total, total, platform });

    try {
      chrome.notifications.create(`bulk-finished-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `✅ CodeSync Pro — Bulk Sync Complete!`,
        message: `Successfully completed sync for ${platform === 'all' ? 'all platforms' : platform}.`,
        silent: true
      });
      await playSound();
    } catch(soundErr) { /* ignore */ }
  } finally {
    for (const tid of createdScraperTabIds) {
      await chrome.tabs.remove(tid).catch(() => {});
    }
    scraperTabId = null;
    isSyncing = false;
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'SCAN_UNSYNCED') {
    (async () => {
      try {
        const platform = msg.platform || 'all';
        const results = await scanUnsynced(platform);
        sendResponse({ ok: true, results });
      } catch(e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  if (msg.type === 'START_SMART_SYNC') {
    if (isSyncing) {
      sendResponse({ ok: false, error: 'Sync already in progress' });
      return false;
    }
    executeSmartSync(msg.items, msg.platform).catch(err => {
      console.error('[CodeSync] executeSmartSync error:', err);
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_SYNC_STATUS') {
    sendResponse({ isSyncing, progress: smartSyncProgress });
    return false;
  }

  if (msg.type === 'PARSE_AND_CACHE_SGU') {
    (async () => {
      try {
        await ensureOffscreen();
        const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_CF_PROBLEM', html: msg.html });
        if (parsed && parsed.ok && parsed.stmt) {
          const cacheKey = `pc_acmsguru_${msg.idx}`;
          const stmt = parsed.stmt;
          stmt.url = `https://codeforces.com/problemsets/acmsguru/problem/99999/${msg.idx}`;
          await chrome.storage.local.set({ [cacheKey]: stmt });
          await logDebug(`PARSE_AND_CACHE_SGU: successfully cached ${cacheKey}`);
        }
      } catch(e) {
        console.error('PARSE_AND_CACHE_SGU error:', e);
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'CACHE_PROBLEM') {
    const key = `pc_${msg.contestId}_${(msg.idx || '').toUpperCase()}`;
    chrome.storage.local.set({ [key]: msg.stmt }).catch(() => {});

    if (msg.contestId === 'acmsguru' && msg.idx) {
      (async () => {
        try {
          const { syncLog = [] } = await chrome.storage.local.get('syncLog');
          const cleanLog = syncLog.filter(e => {
            const isSguMatch = e.platform === 'CF' && (
              (e.problemCode || '').toLowerCase().includes('acmsguru' + msg.idx.toLowerCase()) ||
              (e.problemCode || '').toLowerCase().includes(msg.idx.toLowerCase())
            );
            return !isSguMatch;
          });
          if (syncLog.length !== cleanLog.length) {
            await chrome.storage.local.set({ syncLog: cleanLog });
            await logDebug(`CACHE_PROBLEM: Cleared SGU ${msg.idx} from syncLog to force re-sync.`);
          }
        } catch(e) {}
      })();
    }

    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'CACHE_AC_PROBLEM') {
    (async () => {
      try {
        const cacheKey = `ac_prob_${msg.contestId}_${msg.problemId}`;
        const stored = await chrome.storage.local.get(cacheKey);
        const storedVal = stored[cacheKey];
        if (storedVal && storedVal.title && (storedVal.body || storedVal.bodyMarkdown || storedVal.inputSpec || storedVal.constraints || storedVal.samples)) {
          sendResponse({ ok: true, cached: true });
          return;
        }
        // content_ac.js v3 sends a pre-parsed stmt object directly
        if (msg.stmt && msg.stmt.title) {
          await chrome.storage.local.set({ [cacheKey]: msg.stmt });
          await logDebug(`CACHE_AC_PROBLEM: cached pre-parsed stmt for ${cacheKey}`);
          sendResponse({ ok: true });
          return;
        }
        // Legacy: content_ac.js sent raw html — parse via offscreen
        if (msg.html) {
          await ensureOffscreen();
          const parsed = await chrome.runtime.sendMessage({ type: 'PARSE_AC_PROBLEM', html: msg.html });
          const parsedStmt = parsed && parsed.stmt;
          if (parsed && parsed.ok && parsedStmt && parsedStmt.title && (parsedStmt.body || parsedStmt.bodyMarkdown || parsedStmt.inputSpec || parsedStmt.constraints || parsedStmt.samples)) {
            await chrome.storage.local.set({ [cacheKey]: parsedStmt });
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'Invalid parsed statement' });
          }
        } else {
          sendResponse({ ok: false, error: 'No stmt or html provided' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'CACHE_TOPH_PROBLEM') {
    (async () => {
      try {
        const payload = msg.stmt || msg.data || msg.problemData || {};
        const toSave = {};
        if (msg.slug) {
          toSave[`tp_prob_${msg.slug}`] = payload;
          if (msg.contestSlug) {
            toSave[`tp_prob_${msg.contestSlug}_${msg.slug}`] = payload;
          }
        }
        if (payload.title) {
          const tClean = payload.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
          const tSlug = payload.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
          toSave[`tp_prob_title_${tClean}`] = payload;
          toSave[`tp_prob_${tSlug}`] = payload;
          if (msg.contestSlug) {
            toSave[`tp_prob_${msg.contestSlug}_${tSlug}`] = payload;
          }
        }
        await chrome.storage.local.set(toSave);
        sendResponse({ ok: true });
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'TRIGGER_POLL') {
    pollCF();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_LC_STATUS') {
    (async () => {
      try {
        const status = await checkLCStatus();
        sendResponse(status);
      } catch(e) {
        sendResponse(null);
      }
    })();
    return true;
  }

  if (msg.type === 'SYNC_AC') {
    (async () => {
      try {
        const cfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo', 'acEnabled']);
        if (!cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) { sendResponse({ ok: false, error: 'GitHub not configured' }); return; }
        if (cfg.acEnabled === false) { sendResponse({ ok: false, error: 'AtCoder sync disabled' }); return; }
        const res = await syncAC(msg.data, cfg);
        if (res && res.skipped) {
          sendResponse({ ok: true, skipped: true });
        } else {
          notifySuccess(res.platform, res.problemCode);
          broadcastSuccess(res.platform, res.problemCode, res.commitMsg);
          sendResponse({ ok: true });
        }
      } catch(e) {
        await addToFailedQueue({ platform: 'AC', data: msg.data, lastError: e.message });
        broadcastError('AC', (msg.data && msg.data.problemName) || 'Unknown', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'SYNC_LC') {
    (async () => {
      try {
        const cfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo', 'lcEnabled']);
        if (!cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) { sendResponse({ ok: false, error: 'GitHub not configured' }); return; }
        if (cfg.lcEnabled === false) { sendResponse({ ok: false, error: 'LeetCode sync disabled' }); return; }
        const res = await syncLC(msg.data, cfg);
        if (res && res.skipped) {
          sendResponse({ ok: true, skipped: true });
        } else {
          notifySuccess(res.platform, res.problemCode);
          broadcastSuccess(res.platform, res.problemCode, res.commitMsg);
          sendResponse({ ok: true });
        }
      } catch(e) {
        await addToFailedQueue({ platform: 'LC', data: msg.data, lastError: e.message });
        broadcastError('LC', (msg.data && msg.data.title) || 'Unknown', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'SYNC_TOPH') {
    (async () => {
      try {
        const cfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo', 'tpEnabled']);
        if (!cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) { sendResponse({ ok: false, error: 'GitHub not configured' }); return; }
        if (cfg.tpEnabled === false) { sendResponse({ ok: false, error: 'Toph sync disabled' }); return; }
        const res = await syncToph(msg.data, cfg);
        if (res && res.skipped) {
          sendResponse({ ok: true, skipped: true });
        } else {
          notifySuccess(res.platform, res.problemCode);
          broadcastSuccess(res.platform, res.problemCode, res.commitMsg);
          sendResponse({ ok: true });
        }
      } catch(e) {
        await addToFailedQueue({ platform: 'TP', data: msg.data, lastError: e.message });
        broadcastError('TP', (msg.data && msg.data.title) || 'Unknown', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'SYNC_CSES') {
    (async () => {
      try {
        const cfg = await chrome.storage.local.get(['ghToken', 'ghOwner', 'ghRepo', 'csesEnabled']);
        if (!cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) { sendResponse({ ok: false, error: 'GitHub not configured' }); return; }
        if (cfg.csesEnabled === false) { sendResponse({ ok: false, error: 'CSES sync disabled' }); return; }
        const res = await syncCSES(msg.data, cfg);
        if (res && res.skipped) {
          sendResponse({ ok: true, skipped: true });
        } else {
          notifySuccess(res.platform, res.problemCode);
          broadcastSuccess(res.platform, res.problemCode, res.commitMsg);
          sendResponse({ ok: true });
        }
      } catch(e) {
        await addToFailedQueue({ platform: 'CSES', data: msg.data, lastError: e.message });
        broadcastError('CSES', (msg.data && msg.data.title) || 'Unknown', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'RECORD_CSES_ATTEMPT') {
    (async () => {
      try {
        const data = msg.data || {};
        const subId = data.subId ? String(data.subId) : '';
        const stored = await chrome.storage.local.get([
          'dailySubmissionActivity',
          'csesAttemptsCount',
          'csesRecordedSubIds',
          'csesEnabled'
        ]);

        if (stored.csesEnabled === false) {
          sendResponse({ ok: false, error: 'CSES disabled' });
          return;
        }

        let recorded = stored.csesRecordedSubIds || [];
        if (subId && recorded.includes(subId)) {
          sendResponse({ ok: true, skipped: true, reason: 'Already recorded' });
          return;
        }
        if (subId) {
          recorded.push(subId);
          if (recorded.length > 500) recorded = recorded.slice(-500);
        }

        const targetDateStr = new Date().toLocaleDateString('sv-SE');
        let subAct = stored.dailySubmissionActivity;
        if (typeof subAct === 'string') { try { subAct = JSON.parse(subAct); } catch(e) { subAct = {}; } }
        subAct = subAct || {};
        if (!subAct.CSES) subAct.CSES = {};
        subAct.CSES[targetDateStr] = (subAct.CSES[targetDateStr] || 0) + 1;

        const newAttempts = (stored.csesAttemptsCount || 0) + 1;

        await chrome.storage.local.set({
          dailySubmissionActivity: subAct,
          csesAttemptsCount: newAttempts,
          csesRecordedSubIds: recorded
        });

        console.log(`[CodeSync] CSES attempt recorded for ${data.title || subId}: ${data.verdict}`);
        sendResponse({ ok: true, attempts: newAttempts });
      } catch(e) {
        console.warn('[CodeSync] Error recording CSES attempt:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'TEST_CONFIG') {
    (async () => {
      try {
        const results = {};
        const ghToken = msg.ghToken; // plain text token sent from options form
        const ghRes = await ghGet(`/repos/${msg.ghOwner}/${msg.ghRepo}`, ghToken);
        
        if (ghRes.status === 404) {
          results.github = 'repo_not_found';
        } else if (ghRes.status === 200) {
          results.github = 'ok';
        } else {
          results.github = `GitHub: ${ghRes.data && ghRes.data.message ? ghRes.data.message : ghRes.status}`;
        }
        
        if (msg.cfHandle) {
          try {
            const d = await fetchCFAPI('user.info', { handles: msg.cfHandle });
            results.cf = d.status === 'OK' ? 'ok' : d.comment;
          } catch(e) { results.cf = e.message; }
        }
        sendResponse({ ok: (results.github === 'ok' || results.github === 'repo_not_found'), results });
      } catch(e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  if (msg.type === 'VALIDATE_CF') {
    (async () => {
      try {
        const d = await fetchCFAPI('user.info', { handles: msg.cfHandle });
        if (d.status === 'OK') {
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: d.comment || 'Invalid handle.' });
        }
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'GET_CF_CONTESTS') {
    (async () => {
      try {
        const d = await fetchCFAPI('contest.list', {});
        sendResponse(d);
      } catch(e) {
        sendResponse({ status: 'FAILED', comment: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'GET_CF_PROFILE') {
    (async () => {
      try {
        const d = await fetchCFAPI('user.status', { handle: msg.handle, from: '1', count: '5000' });
        sendResponse(d);
      } catch(e) {
        sendResponse({ status: 'FAILED', comment: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'FETCH_PROFILE_PAGE') {
    (async () => {
      try {
        const url = msg.url;
        const isMirror = url.includes('mirror.codeforces.com');
        const tabPattern = isMirror ? '*://mirror.codeforces.com/*' : '*://codeforces.com/*';
        const result = await fetchViaTab(tabPattern, url);
        if (result && result.ok) {
          sendResponse({ ok: true, text: result.text });
        } else {
          // fallback to background fetch
          const resp = await fetch(url).catch(() => null);
          if (resp && resp.ok) {
            const text = await resp.text();
            sendResponse({ ok: true, text });
          } else {
            sendResponse({ ok: false, error: 'Tab and background fetch failed' });
          }
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'GET_AC_PROFILE') {
    (async () => {
      try {
        // kenkoooo v3 API — paginate from second=0
        let allSubs = [];
        let fromSecond = 0;
        let pageNum = 0;
        while (true) {
          // Rate limit: Kenkoooo enforces ≤1 req/sec — delay between pages
          if (pageNum > 0) {
            await new Promise(r => setTimeout(r, 1100));
          }
          let r;
          try {
            r = await fetch(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(msg.handle)}&from_second=${fromSecond}`);
          } catch (fetchErr) {
            // Network error on subsequent pages — return what we have
            if (allSubs.length > 0) break;
            throw fetchErr;
          }
          if (!r.ok) {
            // HTTP 429 or other error on subsequent pages — return accumulated data
            if (allSubs.length > 0) break;
            throw new Error(`AtCoder API error: ${r.status}`);
          }
          const page = await r.json();
          if (!page || page.length === 0) break;
          allSubs = allSubs.concat(page);
          // Each page returns up to 500; if less, we're done
          if (page.length < 500) break;
          // Next page starts from last submission's epoch_second + 1
          fromSecond = page[page.length - 1].epoch_second + 1;
          pageNum++;
        }
        sendResponse({ ok: true, submissions: allSubs });
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }


  if (msg.type === 'GET_LC_PROFILE') {
    (async () => {
      try {
        const query = `
          query userProfileCalendar($username: String!) {
            matchedUser(username: $username) {
              userCalendar {
                streak
                submissionCalendar
              }
              submitStatsGlobal {
                acSubmissionNum {
                  difficulty
                  count
                }
                totalSubmissionNum {
                  difficulty
                  count
                  submissions
                }
              }
            }
            recentSubmissionList(username: $username, limit: 50) {
              title
              titleSlug
              timestamp
              statusDisplay
              lang
            }
          }
        `;
        const resp = await fetch('https://leetcode.com/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { username: msg.handle } })
        });
        if (!resp.ok) throw new Error(`LeetCode GraphQL error: ${resp.status}`);
        const d = await resp.json();
        sendResponse({ ok: true, data: d.data });
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'GET_TP_PROFILE') {
    (async () => {
      try {
        const handle = msg.handle;
        if (!handle) {
          sendResponse({ ok: false, error: 'No handle provided' });
          return;
        }
        const profileUrl = `https://toph.co/u/${encodeURIComponent(handle)}`;
        let uHtml = null;
        const uRes = await fetchViaTab('*://toph.co/*', profileUrl);
        if (uRes && uRes.ok) {
          uHtml = uRes.text;
        } else {
          const r = await fetch(profileUrl);
          if (r.ok) uHtml = await r.text();
        }
        if (!uHtml) {
          throw new Error('Failed to load Toph profile page');
        }

        // 1. Author ID
        let authorId = null;
        const m = uHtml.match(/\/submissions\/filter\?author=([a-f0-9]{24})/i) ||
                  uHtml.match(/\/accounts\/([a-f0-9]{24})\//i) ||
                  uHtml.match(/"id":\s*"([a-f0-9]{24})"/i);
        if (m) authorId = m[1];
        if (!authorId) throw new Error(`User ${handle} not found on Toph`);

        // 2. Solutions, Submissions, Contests
        let solutions = 0;
        let submissionsCount = 0;
        let contests = 0;
        const solMatch = uHtml.match(/<div class=["']?value["']?>(\d+)<\/div>\s*<div class=["']?title["']?>Solutions<\/div>/i);
        if (solMatch) solutions = parseInt(solMatch[1], 10);
        const subMatch = uHtml.match(/<div class=["']?value["']?>(\d+)<\/div>\s*<div class=["']?title["']?>Submissions<\/div>/i);
        if (subMatch) submissionsCount = parseInt(subMatch[1], 10);
        const conMatch = uHtml.match(/<div class=["']?value["']?>(\d+)<\/div>\s*<div class=["']?title["']?>Contests<\/div>/i);
        if (conMatch) contests = parseInt(conMatch[1], 10);

        // 3. Activity Map (from charts.activity)
        const activityMap = {};
        const actMatch = uHtml.match(/charts\.activity\(\s*["']activityChart["']\s*,\s*(\{[\s\S]*?\})\s*\)/);
        if (actMatch) {
          try {
            const rawAct = actMatch[1];
            const quoted = rawAct.replace(/(\d+):/g, '"$1":');
            const parsed = JSON.parse(quoted);
            for (const [dayIdx, cnt] of Object.entries(parsed)) {
              if (cnt > 0) activityMap[dayIdx] = cnt;
            }
          } catch(e) {}
        }

        // 4. Category breakdown (e.g. Easy Problems 9/72)
        const categoryCounts = {};
        const catRe = /<div class=["']?fg-1 fs-1 fb-0["']?>([^<]+)<\/div>\s*<div class=["']?text-muted["']?>(\d+)\/(\d+)<\/div>/gi;
        let cMatch;
        while ((cMatch = catRe.exec(uHtml)) !== null) {
          const catName = cMatch[1].trim();
          const solved = parseInt(cMatch[2], 10);
          const totalCat = parseInt(cMatch[3], 10);
          categoryCounts[catName] = { solved, total: totalCat };
        }

        // 5. Verdict Stats API
        let verdicts = { Accepted: 0, WrongAnswer: 0, RuntimeError: 0, CompilationError: 0 };
        try {
          const vUrl = `https://toph.co/api/accounts/${authorId}/verdict_stats`;
          const vRes = await fetch(vUrl);
          if (vRes.ok) {
            const vData = await vRes.json();
            if (vData && vData.counts) {
              verdicts = vData.counts;
              if (vData.total) submissionsCount = Math.max(submissionsCount, vData.total);
            }
          }
        } catch(e) {}

        // 6. Submissions list from filter page (fetch up to 150 recent submissions)
        const submissionsList = [];
        for (const start of [0, 50, 100]) {
          try {
            const sUrl = `https://toph.co/submissions/filter?author=${authorId}&start=${start}`;
            let sHtml = null;
            const sTabRes = await fetchViaTab('*://toph.co/*', sUrl);
            if (sTabRes && sTabRes.ok) sHtml = sTabRes.text;
            else {
              const r = await fetch(sUrl);
              if (r.ok) sHtml = await r.text();
            }
            if (!sHtml) break;
            // Robust extraction: use regex to find all submission rows regardless of quote style
            const rowRegex = /<tr[^>]*id=["']?trSubmission(\d+)["']?[^>]*>([\s\S]*?)(?=<tr[^>]*id=["']?trSubmission|<\/tbody|<\/table|$)/gi;
            let rowMatch;
            let rowsFound = 0;
            while ((rowMatch = rowRegex.exec(sHtml)) !== null) {
              rowsFound++;
              const subId = rowMatch[1];
              const rowContent = rowMatch[2];
              const tsM = rowContent.match(/data-timestamp=["']?(\d+)["']?/);
              const pM = rowContent.match(/href=["']?(?:\/c\/([a-zA-Z0-9_-]+))?\/p\/([a-zA-Z0-9_-]+)["']?>([^<]+)<\/a>/i);
              const cM = rowContent.match(/href=["']?\/c\/([a-zA-Z0-9_-]+)["']?>([^<]+)<\/a>/i);
              const vM = rowContent.match(/class=["']?text-verdict-([a-z]+)["']?>([^<]+)/);
              if (tsM) {
                submissionsList.push({
                  subId: subId,
                  ts: parseInt(tsM[1], 10),
                  slug: pM ? (pM[2] || pM[1]) : '',
                  title: pM ? pM[3].trim() : '',
                  contestSlug: (pM && pM[1]) || (cM ? cM[1] : ''),
                  contestName: cM ? cM[2].trim() : '',
                  verdictCode: vM ? vM[1] : '',
                  verdictText: vM ? vM[2].trim() : ''
                });
              }
            }
            // Stop if no rows found on this page (no more submissions)
            if (rowsFound === 0) break;
          } catch(e) { break; }
        }

        sendResponse({
          ok: true,
          authorId,
          solutions: solutions || verdicts.Accepted || 0,
          submissions: submissionsCount || submissionsList.length || 0,
          contests,
          verdicts,
          activityMap,
          categoryCounts,
          submissionsList
        });
      } catch(e) {
        console.error('GET_TP_PROFILE error:', e);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'OPEN_OR_FOCUS_TAB') {
    openOrFocusTab(msg.url, msg.options).then(res => sendResponse(res)).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'OPEN_IDE') {
    const ideUrl = chrome.runtime.getURL('ide.html');
    let probData = msg.problemData || msg.problem;
    if (probData && (probData.platform === 'LC' || probData.platform === 'TP')) {
      probData = null;
    }
    if (probData) {
      if (sender && sender.tab) {
        probData.sourceTabId = sender.tab.id;
      }
      probData.timestamp = Date.now();
      chrome.storage.local.set({
        pendingProblem: probData,
        current_ide_problem: probData,
        [`${(probData.platform || 'prob').toLowerCase()}_prob_${probData.id || probData.slug}`]: probData
      }).catch(() => {});
    } else {
      // General launch without problem: keep existing loaded problem intact, only clear pending
      chrome.storage.local.remove('pendingProblem').catch(() => {});
    }
    chrome.tabs.query({}, async (tabs) => {
      const existingIdeTab = (tabs || []).find(t => 
        (t.url && (t.url.includes('ide.html') || t.url.endsWith('/ide.html'))) || 
        (t.pendingUrl && t.pendingUrl.includes('ide.html'))
      );
      if (existingIdeTab) {
        await chrome.tabs.update(existingIdeTab.id, { active: true });
        if (existingIdeTab.windowId) await chrome.windows.update(existingIdeTab.windowId, { focused: true }).catch(() => {});
        if (probData) {
          chrome.tabs.sendMessage(existingIdeTab.id, { type: 'LOAD_PROBLEM', data: probData }).catch(() => {});
        }
      } else {
        await chrome.tabs.create({ url: ideUrl });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'OPEN_SIDEPANEL') {
    const ideUrl = chrome.runtime.getURL('ide.html');
    if (chrome.sidePanel && sender.tab && sender.tab.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {
        chrome.tabs.create({ url: ideUrl });
      });
    } else {
      chrome.tabs.create({ url: ideUrl });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'CREATE_REPO') {
    (async () => {
      try {
        await ghPost('/user/repos', msg.ghToken, {
          name: msg.repoName,
          private: msg.isPrivate || false,
          description: 'Competitive programming solutions synced by CodeSync Pro',
          auto_init: true
        });
        sendResponse({ ok: true });
      } catch(e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  if (msg.type === 'RETRY_FAILED') {
    (async () => {
      try {
        const result = await retryFailedQueue();
        sendResponse({ ok: true, ...result });
      } catch(e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }

  if (msg.type === 'BULK_SYNC') {
    (async () => {
      function broadcast(payload) { chrome.runtime.sendMessage(payload).catch(() => {}); }
      try {
        const cfg = await chrome.storage.local.get(['cfHandle', 'ghToken', 'ghOwner', 'ghRepo']);
        if (!cfg.cfHandle || !cfg.ghToken || !cfg.ghOwner || !cfg.ghRepo) {
          broadcast({ type: 'BULK_PROGRESS', phase: 'error', error: 'Not configured.', finished: true, total: 0 }); return;
        }
        broadcast({ type: 'BULK_PROGRESS', phase: 'fetching' });

        const PAGE = 500;
        let from = 1, allSubs = [];
        while (true) {
          let page;
          try {
            const d = await fetchCFAPI('user.status', { handle: cfg.cfHandle, from: from, count: PAGE });
            if (d.status !== 'OK') break;
            page = d.result;
          } catch(e) {
            broadcast({ type: 'BULK_PROGRESS', phase: 'error', error: `CF API: ${e.message}` });
            break;
          }
          if (!page || page.length === 0) break;
          allSubs = allSubs.concat(page);
          if (page.length < PAGE) break;
          from += PAGE;
        }

        const best = new Map();
        for (const sub of allSubs.filter(s => s.verdict === 'OK')) {
          const key = `${sub.contestId}_${sub.problem.index}`;
          const prev = best.get(key);
          if (!prev || sub.timeConsumedMillis < prev.timeConsumedMillis) best.set(key, sub);
        }

        const unique = [...best.values()];
        const total = unique.length;
        if (total === 0) { broadcast({ type: 'BULK_PROGRESS', phase: 'info', message: 'No accepted submissions.', finished: true, total: 0 }); return; }
        broadcast({ type: 'BULK_PROGRESS', phase: 'info', message: `Found ${total} unique problems. Uploading…`, total });

        let done = 0, successCount = 0;
        for (const sub of unique) {
          const label = `${sub.contestId}${sub.problem.index} — ${sub.problem.name}`;
          try {
            const res = await syncCF(sub, cfg);
            done++;
            if (res && res.skipped) {
              broadcast({ type: 'BULK_PROGRESS', phase: 'uploading', done, total, problem: `${label} (skipped: filter)`, finished: done === total });
            } else {
              successCount++;
              broadcast({ type: 'BULK_PROGRESS', phase: 'uploading', done, total, problem: label, finished: done === total });
            }
          } catch(err) {
            done++;
            await addToFailedQueue({ platform: 'CF', sub, lastError: err.message });
            broadcast({ type: 'BULK_PROGRESS', phase: 'error', error: `${label}: ${err.message}`, done, total, finished: done === total });
          }
        }
        if (successCount > 0) {
          chrome.notifications.create(`bulk-${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '✅ CodeSync Pro — Bulk Upload Done!',
            message: `${successCount}/${total} uploaded to GitHub!`,
            silent: true
          });
          await playSound();
        }
      } catch(e) { broadcast({ type: 'BULK_PROGRESS', phase: 'error', error: e.message, finished: true, total: 0 }); }
    })();
    sendResponse({ ok: true });
    return false;
  }
});

// ─── Alarms ───────────────────────────────────────────────────────────────────
chrome.alarms.create('poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'poll') {
    pollCF();
    const cfg = await chrome.storage.local.get(['tpEnabled', 'tpHandle']);
    if (cfg.tpEnabled && cfg.tpHandle) {
      // Toph uses content script detection, no background polling needed
    }
  }
});

// Problem caches are cleared on install (onInstalled) and startup (onStartup).
// They do NOT need to be purged on every service-worker activation.

async function healSyncedAtTimestamps() {
  try {
    const { syncLog = [] } = await chrome.storage.local.get('syncLog');
    if (syncLog.length > 0) {
      let logUpdated = false;
      const cleanLog = syncLog.map(e => {
        let updatedEntry = e;
        if (e.syncedAt === '1970-01-01T00:00:00.000Z') {
          logUpdated = true;
          const healedTime = e.submissionTime || new Date().toISOString();
          updatedEntry = { ...updatedEntry, syncedAt: healedTime };
        }
        if (e.commitMsg && e.commitMsg.startsWith('Synced from GitHub') && !e.syncedFromGitHub) {
          logUpdated = true;
          updatedEntry = { ...updatedEntry, syncedFromGitHub: true };
        }
        return updatedEntry;
      });
      if (logUpdated) {
        await chrome.storage.local.set({ syncLog: cleanLog });
        await logDebug('Healed 1970 syncedAt timestamps in sync log.');
      }
    }
  } catch (e) {
    console.error('[CodeSync] Timestamp healing error:', e);
  }
}

async function cleanAndSyncCSESData() {
  try {
    const data = await chrome.storage.local.get([
      'csesDataSanitizedV3',
      'syncLog',
      'dailyActivity',
      'dailySubmissionActivity',
      'csesSolvedCount',
      'csesAttemptsCount',
      'csesRecordedSubIds'
    ]);

    if (data.csesDataSanitizedV3) return;

    let syncLog = data.syncLog || [];

    // 1. Remove invalid / failed CSES entries (like 18982336 / Repetitions WRONG ANSWER)
    // and deduplicate CSES entries by subId
    const seenCsesSubIds = new Set();
    const seenCsesTasks = new Set();
    const newSyncLog = [];

    for (const item of syncLog) {
      if (item.platform === 'CSES') {
        const sId = String(item.subId || '');
        const pName = String(item.problemName || '').toLowerCase();
        if (sId === '18982336' || (pName.includes('repetitions') && !item.syncedFromGitHub)) {
          continue;
        }
        const pCode = String(item.problemCode || item.problemName || '');
        if ((sId && seenCsesSubIds.has(sId)) || (pCode && seenCsesTasks.has(pCode))) {
          continue;
        }
        if (sId) seenCsesSubIds.add(sId);
        if (pCode) seenCsesTasks.add(pCode);
        newSyncLog.push(item);
      } else {
        newSyncLog.push(item);
      }
    }

    // 2. Count actual valid CSES solves
    const validCsesEntries = newSyncLog.filter(e => e.platform === 'CSES');
    const uniqueCsesProblems = new Set(validCsesEntries.map(e => e.problemCode || e.problemName));
    const validSolvedCount = uniqueCsesProblems.size;

    // 3. Rebuild dailyActivity.CSES from valid syncLog entries
    let act = data.dailyActivity || {};
    if (typeof act === 'string') { try { act = JSON.parse(act); } catch(e) { act = {}; } }
    act.CSES = {};
    for (const entry of validCsesEntries) {
      const rawTime = entry.submissionTime || entry.syncedAt;
      if (rawTime) {
        const dStr = new Date(rawTime).toLocaleDateString('sv-SE');
        act.CSES[dStr] = (act.CSES[dStr] || 0) + 1;
      }
    }

    // 4. Update dailySubmissionActivity.CSES:
    let subAct = data.dailySubmissionActivity || {};
    if (typeof subAct === 'string') { try { subAct = JSON.parse(subAct); } catch(e) { subAct = {}; } }
    if (!subAct.CSES) subAct.CSES = {};

    const todayStr = new Date().toLocaleDateString('sv-SE');
    const currentTodaySolved = act.CSES[todayStr] || 0;
    subAct.CSES[todayStr] = Math.max(subAct.CSES[todayStr] || 0, currentTodaySolved + 1);

    const attemptsCount = Math.max(validSolvedCount + 1, Object.values(subAct.CSES).reduce((a, b) => a + b, 0));

    let recorded = data.csesRecordedSubIds || [];
    if (!recorded.includes('18982336')) recorded.push('18982336');

    await chrome.storage.local.set({
      csesDataSanitizedV3: true,
      syncLog: newSyncLog,
      dailyActivity: act,
      dailySubmissionActivity: subAct,
      csesSolvedCount: validSolvedCount,
      csesAttemptsCount: attemptsCount,
      csesRecordedSubIds: recorded
    });

    console.log('[CodeSync] Sanitized CSES data:', { validSolvedCount, attemptsCount });
  } catch (err) {
    console.error('[CodeSync] Failed to sanitize CSES data:', err);
  }
}

// Run cleanup immediately on load
cleanAndSyncCSESData().catch(() => {});

// ─── Installation Hooks ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await healSyncedAtTimestamps();
    await cleanAndSyncCSESData();
    const data = await chrome.storage.local.get(null);


    // 3. Clear SGU/acmsguru entries from syncLog once to trigger clean re-sync with correct statement text and folder name
    if (!data.sguSyncFixV1) {
      await chrome.storage.local.set({ sguSyncFixV1: true });
      const { syncLog = [] } = await chrome.storage.local.get('syncLog');
      const filteredLog = syncLog.filter(e => {
        const isSgu = e.platform === 'CF' && (
          (e.problemCode || '').toLowerCase().includes('acmsguru') ||
          (e.problemCode || '').toLowerCase().includes('undefined') ||
          (e.problemName || '').toLowerCase().includes('acmsguru') ||
          (e.problemName || '').toLowerCase().includes('undefined')
        );
        return !isSgu;
      });
      if (syncLog.length !== filteredLog.length) {
        await chrome.storage.local.set({ syncLog: filteredLog });
        await logDebug(`Cleared ${syncLog.length - filteredLog.length} SGU entries from syncLog.`);
      }
    }

    // 4. Force clear SGU/acmsguru entries (v11) — new 3-layout parser requires fresh fetch
    if (!data.sguSyncFixV11) {
      await chrome.storage.local.set({ sguSyncFixV11: true });
      const { syncLog = [] } = await chrome.storage.local.get('syncLog');
      const filteredLog = syncLog.filter(e => {
        const isSgu = e.platform === 'CF' && (
          (e.problemCode || '').toLowerCase().includes('acmsguru') ||
          (e.problemCode || '').toLowerCase().includes('undefined') ||
          (e.problemName || '').toLowerCase().includes('acmsguru') ||
          (e.problemName || '').toLowerCase().includes('undefined')
        );
        return !isSgu;
      });
      if (syncLog.length !== filteredLog.length) {
        await chrome.storage.local.set({ syncLog: filteredLog });
        await logDebug(`[sguSyncFixV11] Cleared ${syncLog.length - filteredLog.length} SGU entries for fresh re-sync.`);
      }
      // Also clear all SGU problem-statement caches so new parser runs fresh
      const allStorage = await chrome.storage.local.get(null);
      const sguCacheKeys = Object.keys(allStorage).filter(k => k.startsWith('pc_acmsguru_'));
      if (sguCacheKeys.length > 0) {
        await chrome.storage.local.remove(sguCacheKeys);
        await logDebug(`[sguSyncFixV11] Cleared ${sguCacheKeys.length} SGU statement caches.`);
      }
    }

    // 5. Force clear SGU/acmsguru entries (v15) — force re-sync with active DOM scraper cached statement
    if (!data.sguSyncFixV17) {
      await chrome.storage.local.set({ sguSyncFixV17: true });
      const { syncLog = [] } = await chrome.storage.local.get('syncLog');
      const filteredLog = syncLog.filter(e => {
        const isSgu = e.platform === 'CF' && (
          (e.problemCode || '').toLowerCase().includes('acmsguru') ||
          (e.problemCode || '').toLowerCase().includes('undefined') ||
          (e.problemName || '').toLowerCase().includes('acmsguru') ||
          (e.problemName || '').toLowerCase().includes('undefined')
        );
        return !isSgu;
      });
      if (syncLog.length !== filteredLog.length) {
        await chrome.storage.local.set({ syncLog: filteredLog });
        await logDebug(`[sguSyncFixV17] Cleared ${syncLog.length - filteredLog.length} SGU entries for fresh re-sync.`);
      }
      // Clear SGU cache keys to force re-fetch and re-parse
      const allStorage = await chrome.storage.local.get(null);
      const sguCacheKeys = Object.keys(allStorage).filter(k => k.startsWith('pc_acmsguru_'));
      if (sguCacheKeys.length > 0) {
        await chrome.storage.local.remove(sguCacheKeys);
        await logDebug(`[sguSyncFixV17] Cleared ${sguCacheKeys.length} SGU caches.`);
      }
    }

    // 2. One-time math-fix migration (v3):
    //    Auto-scan + auto-sync ALL CF and AC problems in the background
    //    to overwrite corrupted math symbols on GitHub. Completely automatic.
    if (!data.mathFixMigrationV3) {
      await chrome.storage.local.set({ mathFixMigrationV3: true });
      await logDebug('[MathFix] Scheduling background auto-fix scan in 5s...');

      // Wait 5 seconds for the extension to fully initialize before scanning
      setTimeout(async () => {
        try {
          await logDebug('[MathFix] Starting automatic background re-sync to fix math symbols...');

          // Clear CF/AC sync log so everything appears as unsynced
          const { syncLog: currentLog = [] } = await chrome.storage.local.get('syncLog');
          const lcOnly = currentLog.filter(e => e.platform === 'LC');
          await chrome.storage.local.set({ syncLog: lcOnly });
          await logDebug(`[MathFix] Cleared ${currentLog.length - lcOnly.length} CF/AC entries from sync log.`);

          // Scan all unsynced CF and AC problems
          const results = await scanUnsynced('all');
          const items = [
            ...(results.CF || []),
            ...(results.AC || [])
          ];

          await logDebug(`[MathFix] Found ${items.length} CF/AC problems to re-sync with fixed math.`);

          if (items.length > 0 && !isSyncing) {
            // Run the smart sync in background — this re-uploads all READMEs with correct math
            executeSmartSync(items, 'all').catch(e => {
              logDebug('[MathFix] Background auto-fix sync error: ' + e.message);
            });

            try {
              chrome.notifications.create('math-fix-auto', {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: '🔧 CodeSync Pro — Auto-Fixing Math Symbols',
                message: `Automatically re-syncing ${items.length} problem READMEs with corrected math symbols in background...`,
                silent: true
              });
            } catch (_) {}
          } else if (items.length === 0) {
            await logDebug('[MathFix] No CF/AC problems found to fix (API may be unavailable).');
          }
        } catch (e) {
          await logDebug('[MathFix] Auto-fix error: ' + e.message);
        }
      }, 5000);
    }
  } catch (e) {
    console.error('[CodeSync] onInstalled error:', e);
  }
});

// Also clear stale caches on browser startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    await healSyncedAtTimestamps();
    await cleanAndSyncCSESData();
  } catch (e) {}
});

// Universal single-tab opener and focuser: prevents tab duplication across extension
async function openOrFocusTab(targetUrl, options = {}) {
  try {
    const tabs = await chrome.tabs.query({});
    const cleanTarget = targetUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
    const isExtensionPage = targetUrl.includes('.html');
    const pageName = isExtensionPage ? targetUrl.match(/([a-zA-Z0-9_-]+\.html)/)?.[1] : null;

    let existingTab = tabs.find(t => {
      if (!t || !t.url) return false;
      if (pageName && t.url.includes(pageName)) {
        return true;
      }
      const cleanTabUrl = t.url.split('?')[0].split('#')[0].replace(/\/$/, '');
      return cleanTabUrl === cleanTarget;
    });

    if (existingTab) {
      const updateInfo = { active: true };
      if (isExtensionPage && targetUrl.includes('#') && !existingTab.url.includes(targetUrl.slice(targetUrl.indexOf('#')))) {
        updateInfo.url = targetUrl;
      }
      await chrome.tabs.update(existingTab.id, updateInfo);
      if (existingTab.windowId) {
        await chrome.windows.update(existingTab.windowId, { focused: true }).catch(() => {});
      }
      return { ok: true, tab: existingTab, created: false };
    } else {
      const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
      return { ok: true, tab: newTab, created: true };
    }
  } catch (e) {
    const fallbackTab = await chrome.tabs.create({ url: targetUrl, active: true }).catch(() => null);
    return { ok: !!fallbackTab, tab: fallbackTab, created: true };
  }
}

async function triggerTabIfNeeded(tabUrlPattern, triggerUrl) {
  try {
    const patterns = [tabUrlPattern];
    if (tabUrlPattern.includes('://') && !tabUrlPattern.includes('://*.')) {
      patterns.push(tabUrlPattern.replace('://', '://*.'));
    }
    if (tabUrlPattern.includes('codeforces.com')) {
      patterns.push('*://mirror.codeforces.com/*');
      patterns.push('*://*.codeforces.com/*');
    }
    const tabs = await chrome.tabs.query({ url: patterns });
    if (tabs.length === 0) {
      await logDebug(`triggerTabIfNeeded: no tab open for ${tabUrlPattern}. Triggering tab: ${triggerUrl}`);
      const newTab = await chrome.tabs.create({ url: triggerUrl, active: false });
      await waitForTabToLoad(newTab.id, 8000);
    } else {
      await logDebug(`triggerTabIfNeeded: tab already open for ${tabUrlPattern}`);
    }
  } catch (err) {
    await logDebug(`triggerTabIfNeeded failed for ${tabUrlPattern}: ${err.message}`);
  }
}
