// CodeSync Pro — AtCoder Content Script v3.0
'use strict';

(function () {
  var syncCooldown = false;
  var lastSyncedPath = null;

  function isContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function getContestInfo() {
    var path = window.location.pathname;
    var m = path.match(/\/contests\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getProblemId() {
    var path = window.location.pathname;
    var m = path.match(/\/tasks\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function isOnSubmissionPage() {
    return /\/contests\/[^/]+\/submissions\/\d+/.test(window.location.pathname);
  }

  function isOnSubmissionsListPage() {
    var path = window.location.pathname;
    return /\/contests\/[^/]+\/submissions(?:\/me|\/?$)/.test(path);
  }

  function isOnTaskPage() {
    return /\/contests\/[^/]+\/tasks\/[^/]+/.test(window.location.pathname);
  }

  function getSubmissionId() {
    var m = window.location.pathname.match(/\/submissions\/(\d+)/);
    return m ? m[1] : null;
  }

  function getTextFromLabeledRow(labelText) {
    var rows = document.querySelectorAll('table tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('th, td');
      if (cells.length >= 2) {
        var header = cells[0].textContent.trim();
        if (header.toLowerCase().includes(labelText.toLowerCase())) {
          return cells[1].textContent.trim();
        }
      }
    }
    return null;
  }

  function isAccepted() {
    var verdictEl = document.querySelector('.label-success, .badge-success');
    if (verdictEl && verdictEl.textContent.trim() === 'AC') return true;

    var cells = document.querySelectorAll('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].textContent.trim() === 'AC') {
        var parent = cells[i].closest('tr');
        if (parent) {
          if (cells[i].className && (cells[i].className.includes('success') || cells[i].className.includes('AC'))) return true;
          var subId = getSubmissionId();
          if (subId && parent.innerHTML.includes(subId)) return true;
        }
      }
    }

    var h1 = document.querySelector('h1');
    if (h1 && h1.textContent.includes('AC')) return true;

    var spans = document.querySelectorAll('span');
    for (var j = 0; j < spans.length; j++) {
      if (spans[j].textContent.trim() === 'AC' &&
          (spans[j].style.color || spans[j].className).toString().includes('green')) return true;
    }
    return false;
  }

  // ── Scrape problem DOM (exactly like CF does) ─────────────────────────────
  // Called when user is on a task page — reads everything from the DOM, no extra fetch
  function scrapeProblemFromDOM() {
    // Get title
    var titleEl = document.querySelector('.h2') || document.querySelector('h2');
    var title = '';
    if (titleEl) {
      var clone = titleEl.cloneNode(true);
      // Remove any editorial/link buttons inside
      var garbage = clone.querySelectorAll('a, button, .btn');
      garbage.forEach(function(el) { el.remove(); });
      title = clone.textContent.replace(/\s+/g, ' ').trim();
      if (title.includes(' - AtCoder')) title = title.split(' - AtCoder')[0].trim();
    }
    if (!title) {
      var titleTag = document.querySelector('title');
      if (titleTag) {
        title = titleTag.textContent.replace(/ - AtCoder.*/, '').trim();
      }
    }

    // Time + memory limits
    var timeLimit = '';
    var memoryLimit = '';
    var pTags = document.querySelectorAll('p');
    for (var pi = 0; pi < pTags.length; pi++) {
      var ptxt = pTags[pi].textContent || '';
      if (ptxt.includes('Time Limit') && ptxt.includes('Memory Limit')) {
        var parts = ptxt.split('/');
        for (var part of parts) {
          if (part.includes('Time Limit')) timeLimit = part.replace('Time Limit:', '').trim();
          else if (part.includes('Memory Limit')) memoryLimit = part.replace('Memory Limit:', '').trim();
        }
        break;
      }
    }

    // Problem statement container (prefer English)
    var container = document.querySelector('#task-statement .lang-en') ||
                    document.querySelector('#task-statement') ||
                    document.body;

    // Section-by-section extraction, identical to offscreen.js parseACProblem
    var h3s = Array.from(container.querySelectorAll('h3'));
    var problemStatement = '';
    var constraints = '';
    var inputSpec = '';
    var outputSpec = '';
    var samples = [];
    var notes = '';

    function nodeToText(el) {
      // Simple text extraction that preserves structure
      return el.innerText || el.textContent || '';
    }

    if (h3s.length > 0) {
      h3s.forEach(function(h3) {
        var heading = h3.textContent.trim().toLowerCase();
        // Collect siblings until next h3
        var wrapper = document.createElement('div');
        var sibling = h3.nextSibling;
        while (sibling) {
          if (sibling.nodeType === 1 && (sibling.tagName.toLowerCase() === 'h3' || sibling.querySelector && sibling.querySelector('h3'))) break;
          wrapper.appendChild(sibling.cloneNode(true));
          sibling = sibling.nextSibling;
        }
        var content = (wrapper.innerText || wrapper.textContent || '').trim();

        if (heading.includes('problem statement') || heading === 'statement' || heading === 'task' || heading === 'problem') {
          problemStatement = content;
        } else if (heading.includes('constraints') || heading === 'constraint') {
          constraints = content;
        } else if (heading.includes('sample input') || heading.includes('sample in') || heading.includes('input example') || heading.includes('input example #')) {
          var num = parseInt(heading.replace(/[^0-9]/g, ''));
          if (!isNaN(num)) {
            if (!samples[num - 1]) samples[num - 1] = {};
            samples[num - 1].input = content;
          }
        } else if (heading.includes('sample output') || heading.includes('sample out') || heading.includes('output example') || heading.includes('output example #')) {
          var num = parseInt(heading.replace(/[^0-9]/g, ''));
          if (!isNaN(num)) {
            if (!samples[num - 1]) samples[num - 1] = {};
            samples[num - 1].output = content;
          }
        } else if (heading.includes('input') && !heading.includes('example') && !heading.includes('sample')) {
          inputSpec = content;
        } else if (heading.includes('output') && !heading.includes('example') && !heading.includes('sample')) {
          outputSpec = content;
        } else if (heading.includes('note') || heading.includes('hint') || heading.includes('explanation') || heading.includes('explanatory') || heading.includes('notice')) {
          notes += (notes ? '\n\n' : '') + content;
        }
      });
    } else {
      // Fallback: take all text
      problemStatement = (container.innerText || container.textContent || '').trim();
    }

    // Build samples markdown
    var samplesMd = '';
    var filtered = samples.filter(Boolean);
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (s && (s.input || s.output)) {
        var label = filtered.length > 1 ? ' ' + (i + 1) : '';
        samplesMd += '**Sample Input' + label + ':**\n\n```\n' + (s.input || '') + '\n```\n\n';
        samplesMd += '**Sample Output' + label + ':**\n\n```\n' + (s.output || '') + '\n```\n\n';
      }
    }
    samplesMd = samplesMd.trim();

    return {
      title: title,
      body: problemStatement,
      constraints: constraints,
      inputSpec: inputSpec,
      outputSpec: outputSpec,
      samples: samplesMd,
      note: notes,
      timeLimit: timeLimit,
      memoryLimit: memoryLimit
    };
  }

  // ── Cache the problem when user visits task page (exactly like CF) ─────────
  // ── Cache the problem when user visits task page ───────────────────────────
  // Fetch the raw HTML of this page (server HTML, no MathJax rendering mess)
  // then let the background offscreen parser handle it — exactly like CF caches
  // problem statements when you visit the problem page.
  async function scrapeTaskPageAndCache() {
    try {
      if (!isContextValid()) return;
      if (!isOnTaskPage()) return;
      const settings = await chrome.storage.local.get('acEnabled');
      if (!isContextValid()) return;
      if (settings.acEnabled === false) return;

      var contestId = getContestInfo() || '';
      var problemId = getProblemId() || '';
      if (!contestId || !problemId) return;

      // Use the already loaded DOM directly! This is 100% immune to Cloudflare blocks and network failures.
      var rawHtml = document.documentElement.outerHTML;

      if (!rawHtml) return;

      chrome.runtime.sendMessage({
        type: 'CACHE_AC_PROBLEM',
        contestId: contestId,
        problemId: problemId,
        html: rawHtml   // send raw HTML — offscreen parser will extract structured content
      }, function(response) {
        try {
          if (chrome.runtime.lastError) {
            console.warn('[CodeSync AC] CACHE_AC_PROBLEM warning:', chrome.runtime.lastError.message);
            return;
          }
          console.log('[CodeSync AC] Problem cached successfully for', problemId);
        } catch (e) {}
      });
    } catch (e) {}
  }


  // ── Instant sync on submission page ───────────────────────────────────────
  async function scrapeAndSync() {
    try {
      if (!isContextValid()) return;
      if (!isOnSubmissionPage()) return;
      if (syncCooldown) return;
      if (window.location.pathname === lastSyncedPath) return;
      if (!isAccepted()) return;

      syncCooldown = true;
      lastSyncedPath = window.location.pathname;
      setTimeout(function () { syncCooldown = false; }, 60000);

      const settings = await chrome.storage.local.get('acEnabled');
      if (!isContextValid()) { syncCooldown = false; lastSyncedPath = null; return; }
      if (settings.acEnabled === false) { syncCooldown = false; lastSyncedPath = null; return; }

      var contestId = getContestInfo() || '';
      var submissionId = getSubmissionId() || '';

      var contestNameEl = document.querySelector('.contest-name, h1, .navbar-brand');
      var contestName = contestNameEl ? contestNameEl.textContent.trim() : contestId;
      contestName = contestName.replace(/AtCoder\s*/i, '').trim() || contestId;

      var problemLink = document.querySelector('a[href*="/tasks/"]');
      var problemId = '';
      var problemName = '';
      var taskUrl = '';
      if (problemLink) {
        var href = problemLink.getAttribute('href') || '';
        var taskM = href.match(/\/tasks\/([^/?#]+)/);
        problemId = taskM ? taskM[1] : '';
        problemName = problemLink.textContent.trim();
        taskUrl = new URL(href, window.location.origin).href;
      }

      // Try to fetch the task page HTML from within the content script
      // (runs in browser context — no Cloudflare block)
      var taskHtml = '';
      if (taskUrl) {
        try {
          var taskResp = await fetch(taskUrl, { credentials: 'include' });
          if (taskResp.ok) {
            taskHtml = await taskResp.text();
          }
        } catch (e) {
          console.warn('[CodeSync AC] Could not fetch task page, will use cache:', e.message);
        }
      }

      var language = getTextFromLabeledRow('Language') || 'cpp';
      var timeText = getTextFromLabeledRow('Exec Time') || getTextFromLabeledRow('Execution Time') || '0';
      var memText = getTextFromLabeledRow('Memory') || '0';
      var timeMs = parseInt(timeText.replace(/[^0-9]/g, '')) || 0;
      var memKb = parseInt(memText.replace(/[^0-9]/g, '')) || 0;

      var codeEl = document.querySelector('#submission-code') ||
                   document.querySelector('pre.prettyprint') ||
                   document.querySelector('.linenums');
      var code = '';
      if (codeEl) {
        var lines = codeEl.querySelectorAll('li');
        if (lines.length > 0) {
          code = Array.from(lines).map(function(l) { return l.textContent; }).join('\n');
        } else {
          code = codeEl.innerText || codeEl.textContent || '';
        }
      }

      chrome.runtime.sendMessage({
        type: 'SYNC_AC',
        data: {
          contestId: contestId,
          contestName: contestName,
          problemId: problemId,
          problemName: problemName || problemId,
          language: language,
          code: code,
          timeMs: timeMs,
          memoryKb: memKb,
          submissionId: submissionId,
          url: window.location.href,
          taskHtml: taskHtml  // full page HTML fetched from browser context
        }
      }, function(response) {
        try {
          if (chrome.runtime.lastError) {
            console.error('[CodeSync AC] Message error:', chrome.runtime.lastError.message);
            return;
          }
          if (response && response.ok) {
            console.log('[CodeSync AC] Sync successful');
          } else if (response) {
            console.error('[CodeSync AC] Sync failed:', response.error);
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ── Watch submissions list page (e.g. /contests/.../submissions/me) ────────
  var syncedSubmissionIds = new Set();
  var checkListTimer = null;

  async function handleSubmissionsListPage() {
    try {
      if (!isContextValid()) return;
      if (!isOnSubmissionsListPage()) return;

      var rows = document.querySelectorAll('.table-responsive table tbody tr, table.table tbody tr, table tbody tr');
      if (!rows || rows.length === 0) return;

      var topRow = rows[0];
      var subLink = topRow.querySelector('a[href*="/submissions/"]');
      if (!subLink) return;

      var href = subLink.getAttribute('href') || '';
      var subMatch = href.match(/\/submissions\/(\d+)/);
      if (!subMatch) return;
      var subId = subMatch[1];

      if (syncedSubmissionIds.has(subId)) return;
      try {
        if (sessionStorage.getItem('codesync_synced_ac_' + subId)) {
          syncedSubmissionIds.add(subId);
          return;
        }
      } catch(e) {}

      var rowText = (topRow.innerText || topRow.textContent || '').trim();
      var labelSuccess = topRow.querySelector('.label-success, .badge-success');
      var isAc = (labelSuccess && labelSuccess.textContent.trim() === 'AC') ||
                 Array.from(topRow.querySelectorAll('td, span')).some(function(el) {
                   return el.textContent.trim() === 'AC';
                 });

      var isJudging = /WJ|\d+\s*\/\s*\d+|Judging/i.test(rowText);

      if (isAc) {
        syncedSubmissionIds.add(subId);
        try { sessionStorage.setItem('codesync_synced_ac_' + subId, '1'); } catch(e) {}

        const settings = await chrome.storage.local.get('acEnabled');
        if (!isContextValid() || settings.acEnabled === false) return;

        var subDetailUrl = new URL(href, window.location.origin).href;
        var subResp = await fetch(subDetailUrl, { credentials: 'include' });
        if (!subResp.ok) return;
        var subHtml = await subResp.text();

        var parser = new DOMParser();
        var subDoc = parser.parseFromString(subHtml, 'text/html');

        var codeEl = subDoc.querySelector('#submission-code') ||
                     subDoc.querySelector('pre.prettyprint') ||
                     subDoc.querySelector('.linenums');
        var code = '';
        if (codeEl) {
          var lines = codeEl.querySelectorAll('li');
          if (lines.length > 0) {
            code = Array.from(lines).map(function(l) { return l.textContent; }).join('\n');
          } else {
            code = codeEl.innerText || codeEl.textContent || '';
          }
        }
        if (!code) return;

        var contestId = getContestInfo() || '';
        var contestNameEl = document.querySelector('.contest-name, h1, .navbar-brand') || subDoc.querySelector('.contest-name, h1, .navbar-brand');
        var contestName = contestNameEl ? contestNameEl.textContent.trim() : contestId;
        contestName = contestName.replace(/AtCoder\s*/i, '').trim() || contestId;

        var problemLink = topRow.querySelector('a[href*="/tasks/"]') || subDoc.querySelector('a[href*="/tasks/"]');
        var problemId = '';
        var problemName = '';
        var taskUrl = '';
        if (problemLink) {
          var taskHref = problemLink.getAttribute('href') || '';
          var taskM = taskHref.match(/\/tasks\/([^/?#]+)/);
          problemId = taskM ? taskM[1] : '';
          problemName = problemLink.textContent.trim();
          taskUrl = new URL(taskHref, window.location.origin).href;
        }

        var taskHtml = '';
        if (taskUrl) {
          try {
            var taskResp = await fetch(taskUrl, { credentials: 'include' });
            if (taskResp.ok) {
              taskHtml = await taskResp.text();
            }
          } catch(e) {}
        }

        function getSubText(labelText) {
          var sRows = subDoc.querySelectorAll('table tr');
          for (var i = 0; i < sRows.length; i++) {
            var cells = sRows[i].querySelectorAll('th, td');
            if (cells.length >= 2 && cells[0].textContent.toLowerCase().includes(labelText.toLowerCase())) {
              return cells[1].textContent.trim();
            }
          }
          return null;
        }

        var language = getSubText('Language') || 'cpp';
        var timeText = getSubText('Exec Time') || getSubText('Execution Time') || '0';
        var memText = getSubText('Memory') || '0';
        var timeMs = parseInt(timeText.replace(/[^0-9]/g, '')) || 0;
        var memKb = parseInt(memText.replace(/[^0-9]/g, '')) || 0;

        chrome.runtime.sendMessage({
          type: 'SYNC_AC',
          data: {
            contestId: contestId,
            contestName: contestName,
            problemId: problemId,
            problemName: problemName || problemId,
            language: language,
            code: code,
            timeMs: timeMs,
            memoryKb: memKb,
            submissionId: subId,
            url: subDetailUrl,
            taskHtml: taskHtml
          }
        }, function(response) {
          if (response && response.ok) {
            console.log('[CodeSync AC] Synced from submissions list successfully');
            var badgeCell = topRow.querySelector('.text-center');
            if (badgeCell && !badgeCell.querySelector('.codesync-ac-synced')) {
              var sSpan = document.createElement('span');
              sSpan.className = 'label label-primary codesync-ac-synced';
              sSpan.style.cssText = 'margin-left: 5px; background: #2f81f7; font-size: 11px; padding: 2px 6px; border-radius: 4px;';
              sSpan.textContent = 'Synced';
              badgeCell.appendChild(sSpan);
            }
          }
        });
      } else if (isJudging) {
        if (!checkListTimer) {
          checkListTimer = setTimeout(function() {
            checkListTimer = null;
            handleSubmissionsListPage();
          }, 2000);
        }
      }
    } catch(e) {
      console.warn('[CodeSync AC] Error in handleSubmissionsListPage:', e);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (isOnSubmissionPage()) {
    if (document.readyState === 'complete') {
      setTimeout(scrapeAndSync, 1500);
    } else {
      window.addEventListener('load', function() { setTimeout(scrapeAndSync, 1500); });
    }
  } else if (isOnSubmissionsListPage()) {
    if (document.readyState === 'complete') {
      setTimeout(handleSubmissionsListPage, 1200);
    } else {
      window.addEventListener('load', function() { setTimeout(handleSubmissionsListPage, 1200); });
    }
  } else if (isOnTaskPage()) {
    if (document.readyState === 'complete') {
      setTimeout(scrapeTaskPageAndCache, 1500);
    } else {
      window.addEventListener('load', function() { setTimeout(scrapeTaskPageAndCache, 1500); });
    }
  }

  try {
    var observer = new MutationObserver(function () {
      try {
        if (!isContextValid()) return;
        if (isOnSubmissionPage()) scrapeAndSync();
        else if (isOnSubmissionsListPage()) handleSubmissionsListPage();
        else if (isOnTaskPage()) scrapeTaskPageAndCache();
      } catch (e) {}
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  // ── Audio & FETCH_URL relay ──────────────────────────────────────────────
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
            fetch(message.url, { credentials: 'include' })
              .then(async (response) => {
                if (!response.ok) { sendResponse({ ok: false, status: response.status }); return; }
                const buffer = await response.arrayBuffer();
                const text = new TextDecoder('utf-8').decode(buffer);
                sendResponse({ ok: true, text: text, url: response.url });
              })
              .catch((err) => { sendResponse({ ok: false, error: err.message }); });
            return true;
          }

          if (message.type === 'GET_PROBLEM_DATA') {
            const titleEl = document.querySelector('span.h2') || document.querySelector('title');
            const mainContent = document.getElementById('task-statement');
            const samples = [];
            const pres = document.querySelectorAll('#task-statement pre');
            for (let i = 0; i < pres.length; i += 2) {
              if (pres[i] && pres[i + 1]) {
                samples.push({
                  input: pres[i].innerText.trim(),
                  output: pres[i + 1].innerText.trim()
                });
              }
            }

            sendResponse({
              ok: true,
              data: {
                platform: 'AC',
                title: titleEl ? titleEl.textContent.trim() : document.title,
                url: window.location.href,
                slug: window.location.pathname.split('/').pop(),
                statement: mainContent ? mainContent.innerHTML : '',
                samples: samples
              }
            });
            return false;
          }

          if (message.type === 'SUBMIT_CODE') {
            try {
              const code = message.code;
              const lang = message.language || 'cpp';
              const form = document.querySelector('form[action*="/submit"]');

              if (form) {
                const cm = document.querySelector('.CodeMirror');
                if (cm && cm.CodeMirror) {
                  cm.CodeMirror.setValue(code);
                }

                let sourceArea = document.querySelector('textarea[name="sourceCode"]') ||
                                 document.querySelector('textarea#sourceCode') ||
                                 form.querySelector('textarea[name="sourceCode"]');
                if (!sourceArea) {
                  sourceArea = document.createElement('textarea');
                  sourceArea.name = 'sourceCode';
                  sourceArea.style.display = 'none';
                  form.appendChild(sourceArea);
                }
                sourceArea.value = code;
                sourceArea.dispatchEvent(new Event('input', { bubbles: true }));
                sourceArea.dispatchEvent(new Event('change', { bubbles: true }));

                // Select language if dropdown exists
                const langSelect = form.querySelector('select[name="data.LanguageId"]');
                if (langSelect) {
                  const langKeywords = {
                    cpp: ['C++', 'GCC', 'Clang'],
                    python: ['Python', 'PyPy'],
                    java: ['Java', 'OpenJDK'],
                    rust: ['Rust'],
                    go: ['Go'],
                    javascript: ['JavaScript', 'Node'],
                    kotlin: ['Kotlin'],
                    csharp: ['C#', '.NET']
                  };
                  const kws = langKeywords[lang] || ['C++'];
                  for (const kw of kws) {
                    const opt = Array.from(langSelect.options).find(o => o.text.includes(kw));
                    if (opt) {
                      langSelect.value = opt.value;
                      langSelect.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                }

                const submitBtn = form.querySelector('#submit') || form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');
                if (submitBtn) {
                  submitBtn.click();
                  sendResponse({ ok: true, method: 'form_clicked' });
                } else {
                  form.submit();
                  sendResponse({ ok: true, method: 'form_submitted' });
                }
                return true;
              }

              // Fallback: redirect to submit page if on task page
              const contestId = getContestInfo();
              const problemId = getProblemId();
              if (contestId && problemId) {
                try {
                  sessionStorage.setItem('codesync_auto_submit', JSON.stringify({ code, lang }));
                  window.location.href = `https://atcoder.jp/contests/${contestId}/submit?taskScreenName=${problemId}`;
                  sendResponse({ ok: true, method: 'redirect_to_submit' });
                  return true;
                } catch(e) {}
              }

              sendResponse({ ok: false, error: 'AtCoder submit form not found on this page.' });
            } catch (err) {
              sendResponse({ ok: false, error: err.message });
            }
            return true;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Remove legacy "Synced to GitHub" floating badge if present in DOM
  const strayBadge = document.getElementById('codesync-pro-badge');
  if (strayBadge) strayBadge.remove();

  function extractACProblemData() {
    const titleEl = document.querySelector('span.h2');
    const samples = [];
    document.querySelectorAll('.part pre').forEach((pre) => {
      const header = pre.previousElementSibling ? pre.previousElementSibling.textContent : '';
      if (header.includes('Sample Input') || header.includes('入力例')) {
        const input = pre.innerText.trim();
        const nextPart = pre.closest('.part') ? pre.closest('.part').nextElementSibling : null;
        const nextPre = nextPart ? nextPart.querySelector('pre') : null;
        const output = nextPre ? nextPre.innerText.trim() : '';
        samples.push({ input, output });
      }
    });

    const allText = (document.querySelector('#main-container')?.innerText || '');
    const tlMatch = allText.match(/Time Limit:\s*([^\/\n]+)/i);
    const mlMatch = allText.match(/Memory Limit:\s*([^\n]+)/i);
    const stmtEl = document.querySelector('#task-statement .lang-en') || document.querySelector('#task-statement') || document.querySelector('.part');
    const stmtHtml = stmtEl ? stmtEl.innerHTML : '';

    return {
      platform: 'AC',
      title: titleEl ? titleEl.textContent.trim() : document.title,
      url: window.location.href,
      slug: window.location.pathname.split('/').pop(),
      limits: {
        timeLimit: tlMatch ? tlMatch[1].trim() : '2s',
        memoryLimit: mlMatch ? mlMatch[1].trim() : '1024MB'
      },
      samples: samples,
      statement: stmtHtml,
      statementHtml: stmtHtml
    };
  }

  function injectIdeFloatingButton() {
    const path = window.location.pathname;
    if (!/\/contests\/[^/]+\/tasks\/[^/]+/.test(path)) return;
    if (!document.getElementById('task-statement') || document.getElementById('codesync-ide-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'codesync-ide-btn';
    btn.innerHTML = '⚡ <span>Solve in CodeSync IDE</span>';
    btn.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 999999',
      'background: linear-gradient(135deg, #1f6feb, #2f81f7)',
      'color: #fff',
      'padding: 10px 18px',
      'border-radius: 99px',
      'font-family: Inter, -apple-system, sans-serif',
      'font-size: 12px',
      'font-weight: 700',
      'cursor: pointer',
      'box-shadow: 0 4px 16px rgba(47, 129, 247, 0.4)',
      'display: flex',
      'align-items: center',
      'gap: 8px',
      'transition: transform 0.2s, box-shadow 0.2s'
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.06)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', () => {
      const pData = extractACProblemData();
      btn.innerHTML = '⚡ <span>Opening in CodeSync IDE...</span>';
      setTimeout(() => {
        if (btn) btn.innerHTML = '⚡ <span>Solve in CodeSync IDE</span>';
      }, 2500);
      chrome.runtime.sendMessage({
        type: 'OPEN_IDE',
        problemData: pData,
        problem: pData
      });
    });
    document.body.appendChild(btn);

    const pData = extractACProblemData();
    if (pData && pData.statement && pData.statement.length > 20) {
      chrome.runtime.sendMessage({
        type: 'PROBLEM_DETECTED',
        data: pData
      }).catch(() => {});
    }
  }



  // Handle auto-submit on page load if redirected with pending submission
  try {
    const pending = sessionStorage.getItem('codesync_auto_submit');
    if (pending) {
      sessionStorage.removeItem('codesync_auto_submit');
      const { code, lang } = JSON.parse(pending);
      setTimeout(() => {
        const form = document.querySelector('form[action*="/submit"]');
        if (form) {
          const cm = document.querySelector('.CodeMirror');
          if (cm && cm.CodeMirror) cm.CodeMirror.setValue(code);
          let sa = form.querySelector('textarea[name="sourceCode"]');
          if (!sa) {
            sa = document.createElement('textarea');
            sa.name = 'sourceCode';
            sa.style.display = 'none';
            form.appendChild(sa);
          }
          sa.value = code;
          sa.dispatchEvent(new Event('input', { bubbles: true }));
          sa.dispatchEvent(new Event('change', { bubbles: true }));

          const langSelect = form.querySelector('select[name="data.LanguageId"]');
          if (langSelect && lang) {
            const langKeywords = { cpp: ['C++'], python: ['Python'], java: ['Java'], rust: ['Rust'], go: ['Go'], javascript: ['JavaScript'], kotlin: ['Kotlin'], csharp: ['C#'] };
            const kws = langKeywords[lang] || ['C++'];
            for (const kw of kws) {
              const opt = Array.from(langSelect.options).find(o => o.text.includes(kw));
              if (opt) { langSelect.value = opt.value; langSelect.dispatchEvent(new Event('change', { bubbles: true })); break; }
            }
          }
          const sBtn = form.querySelector('#submit') || form.querySelector('button[type="submit"]');
          if (sBtn) sBtn.click();
        }
      }, 1000);
    }
  } catch(e) {}

  setTimeout(injectIdeFloatingButton, 1200);

})();
