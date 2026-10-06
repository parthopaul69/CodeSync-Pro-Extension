/**
 * CodeSync Pro - CSES Content Script
 * Handles problem data extraction, 1-click IDE integration, auto-submission,
 * past submission sync, and automated GitHub synchronization for cses.fi.
 */

(function () {
  'use strict';

  function isContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  }

  const path = window.location.pathname;

  // ── Clean up any legacy badges ─────────────────────────────────────────────
  const strayBadge = document.getElementById('codesync-pro-badge');
  if (strayBadge) strayBadge.remove();

  // ── Helper: URL matchers ───────────────────────────────────────────────────
  function getTaskMatch() {
    return path.match(/\/problemset\/task\/(\d+)/i);
  }

  function getSubmitMatch() {
    return path.match(/\/problemset\/submit\/(\d+)/i);
  }

  function getResultMatch() {
    return path.match(/\/problemset\/result\/(\d+)/i);
  }

  // ── Helper: Math & KaTeX Cleanup without triplication ───────────────────────
  function cleanMathInContainer(container, doc) {
    if (!container) return;

    // 1. Process all .katex elements first (extract clean TeX from annotation)
    const katexList = container.querySelectorAll('.katex');
    katexList.forEach(katex => {
      const isDisplay = katex.closest('.math-display') !== null || katex.classList.contains('katex-display');
      const annotation = katex.querySelector('annotation[encoding*="tex"]') || katex.querySelector('annotation');
      let tex = '';
      if (annotation) {
        tex = annotation.textContent.trim();
      } else {
        const htmlEl = katex.querySelector('.katex-html');
        if (htmlEl) {
          tex = htmlEl.textContent.trim();
        } else {
          const clone = katex.cloneNode(true);
          clone.querySelectorAll('.katex-mathml').forEach(m => m.remove());
          tex = clone.textContent.trim();
        }
      }

      const mathSpan = katex.closest('.math, .math-inline, .math-display');
      const replacementText = isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
      const replacement = (doc || document).createTextNode(replacementText);
      if (mathSpan) {
        mathSpan.replaceWith(replacement);
      } else {
        katex.replaceWith(replacement);
      }
    });

    // 2. Process any unrendered math elements (<span class="math ...">)
    container.querySelectorAll('.math, .math-inline, .math-display').forEach(mathEl => {
      const isDisplay = mathEl.classList.contains('math-display');
      const tex = mathEl.textContent.trim();
      const replacementText = isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
      mathEl.replaceWith((doc || document).createTextNode(replacementText));
    });

    // 3. Remove leftover MathML, scripts, styles
    container.querySelectorAll('.katex-mathml, script, style, .task-constraints').forEach(el => el.remove());
  }

  // ── Helper: Parse CSES Problem Statement & Sections ────────────────────────
  function parseCSESContent(contentEl, doc) {
    if (!contentEl) {
      return { body: '', inputSpec: '', outputSpec: '', constraints: '', samples: [], statementHtml: '' };
    }

    const clone = contentEl.cloneNode(true);
    cleanMathInContainer(clone, doc || document);

    let currentSection = 'body';
    const bodyParts = [];
    const inputParts = [];
    const outputParts = [];
    const constraintParts = [];

    Array.from(clone.children).forEach(child => {
      const tag = child.tagName.toLowerCase();
      const text = child.textContent.trim();

      // Heading detection
      if (/^h[1-6]$/.test(tag)) {
        const ht = text.toLowerCase();
        if (/input/i.test(ht)) { currentSection = 'input'; return; }
        if (/output/i.test(ht)) { currentSection = 'output'; return; }
        if (/constraint/i.test(ht)) { currentSection = 'constraints'; return; }
        if (/example/i.test(ht)) { currentSection = 'example'; return; }
      }

      if (tag === 'pre') return; // Handled in sample extraction

      let mdSnippet = '';
      if (tag === 'p') {
        mdSnippet = child.textContent.trim();
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(child.querySelectorAll('li')).map(li => `- ${li.textContent.trim()}`);
        mdSnippet = items.join('\n');
      } else {
        mdSnippet = child.textContent.trim();
      }

      if (!mdSnippet) return;

      if (currentSection === 'body') bodyParts.push(mdSnippet);
      else if (currentSection === 'input') inputParts.push(mdSnippet);
      else if (currentSection === 'output') outputParts.push(mdSnippet);
      else if (currentSection === 'constraints') constraintParts.push(mdSnippet);
    });

    const samples = [];
    const preList = clone.querySelectorAll('pre');
    for (let i = 0; i < preList.length; i += 2) {
      const inp = preList[i] ? preList[i].textContent.trim() : '';
      const out = preList[i + 1] ? preList[i + 1].textContent.trim() : '';
      if (inp || out) {
        samples.push({
          input: inp + (inp.endsWith('\n') ? '' : '\n'),
          output: out + (out.endsWith('\n') ? '' : '\n')
        });
      }
    }

    return {
      body: bodyParts.join('\n\n'),
      inputSpec: inputParts.join('\n\n'),
      outputSpec: outputParts.join('\n\n'),
      constraints: constraintParts.join('\n\n'),
      samples: samples,
      statementHtml: clone.innerHTML
    };
  }

  // ── 1. Extract CSES Problem Metadata from Current Page ─────────────────────
  function extractCSESProblemData() {
    const taskMatch = getTaskMatch();
    if (!taskMatch) return null;
    const taskId = taskMatch[1];

    // Problem Title: Strictly reject "Task" or "CSES"
    let title = '';
    const titleBlockH1 = document.querySelector('.title-block h1');
    if (titleBlockH1 && !/^(task|cses|results?)$/i.test(titleBlockH1.textContent.trim())) {
      title = titleBlockH1.textContent.trim();
    } else {
      const allH1 = document.querySelectorAll('h1');
      for (const h of allH1) {
        const t = h.textContent.trim();
        if (t && !/^(task|cses|results?|submissions?)$/i.test(t)) {
          title = t;
          break;
        }
      }
      if (!title) {
        const dt = document.title.replace(/^CSES\s*-\s*/i, '').replace(/\s*-\s*Results?.*$/i, '').trim();
        if (dt && !/^(task|cses|results?)$/i.test(dt)) {
          title = dt;
        }
      }
    }
    if (!title || /^task$/i.test(title)) title = `CSES Problem ${taskId}`;

    // Category / Section from sidebar navigation
    let category = 'Problem Set';
    const currentLink = document.querySelector('.nav.sidebar a.current');
    if (currentLink) {
      let prev = currentLink.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'H4') {
          const catText = prev.textContent.trim();
          if (catText && !/your submissions/i.test(catText)) {
            category = catText;
          }
          break;
        }
        prev = prev.previousElementSibling;
      }
    }

    // Time & Memory Limits
    let timeLimit = '1.00 s';
    let memoryLimit = '512 MB';
    const constraintItems = document.querySelectorAll('ul.task-constraints li');
    constraintItems.forEach(li => {
      const text = li.textContent.trim();
      if (/time\s*limit/i.test(text)) {
        timeLimit = text.replace(/time\s*limit:\s*/i, '').trim();
      } else if (/memory\s*limit/i.test(text)) {
        memoryLimit = text.replace(/memory\s*limit:\s*/i, '').trim();
      }
    });

    // Content Parsing
    const contentEl = document.querySelector('.content .md') || document.querySelector('.content');
    const parsed = parseCSESContent(contentEl, document);

    return {
      platform: 'CSES',
      id: taskId,
      slug: taskId,
      taskId: taskId,
      title: title,
      category: category,
      limits: {
        timeLimit: timeLimit,
        memoryLimit: memoryLimit
      },
      timeLimit: timeLimit,
      memoryLimit: memoryLimit,
      samples: parsed.samples,
      body: parsed.body,
      inputSpec: parsed.inputSpec,
      outputSpec: parsed.outputSpec,
      constraints: parsed.constraints,
      statement: parsed.statementHtml,
      statementHtml: parsed.statementHtml,
      statementText: (parsed.body + '\n\nInput:\n' + parsed.inputSpec + '\n\nOutput:\n' + parsed.outputSpec + '\n\nConstraints:\n' + parsed.constraints).trim(),
      url: window.location.href.split('#')[0].split('?')[0]
    };
  }

  // ── Helper: Asynchronously fetch & parse task metadata for any taskId ─────
  async function fetchAndParseCSESProblem(taskId) {
    if (!taskId) return null;
    try {
      const res = await fetch(`https://cses.fi/problemset/task/${taskId}`);
      if (!res.ok) return null;
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Problem Title
      let title = '';
      const titleEl = doc.querySelector('.title-block h1') || doc.querySelector('h1');
      if (titleEl && !/^(task|cses|results?)$/i.test(titleEl.textContent.trim())) {
        title = titleEl.textContent.trim();
      } else {
        const dt = doc.title.replace(/^CSES\s*-\s*/i, '').replace(/\s*-\s*Results?.*$/i, '').trim();
        if (dt && !/^(task|cses|results?)$/i.test(dt)) title = dt;
      }
      if (!title || /^task$/i.test(title)) title = `CSES Problem ${taskId}`;

      // Category
      let category = 'Problem Set';
      const currentLink = doc.querySelector('.nav.sidebar a.current');
      if (currentLink) {
        let prev = currentLink.previousElementSibling;
        while (prev) {
          if (prev.tagName === 'H4') {
            const t = prev.textContent.trim();
            if (t && !/your submissions/i.test(t)) category = t;
            break;
          }
          prev = prev.previousElementSibling;
        }
      }

      // Limits
      let timeLimit = '1.00 s';
      let memoryLimit = '512 MB';
      doc.querySelectorAll('ul.task-constraints li').forEach(li => {
        const text = li.textContent.trim();
        if (/time\s*limit/i.test(text)) timeLimit = text.replace(/time\s*limit:\s*/i, '').trim();
        else if (/memory\s*limit/i.test(text)) memoryLimit = text.replace(/memory\s*limit:\s*/i, '').trim();
      });

      // Content
      const contentEl = doc.querySelector('.content .md') || doc.querySelector('.content');
      const parsed = parseCSESContent(contentEl, doc);

      const pData = {
        platform: 'CSES',
        id: taskId,
        slug: taskId,
        taskId: taskId,
        title: title,
        category: category,
        limits: { timeLimit, memoryLimit },
        timeLimit,
        memoryLimit,
        samples: parsed.samples,
        body: parsed.body,
        inputSpec: parsed.inputSpec,
        outputSpec: parsed.outputSpec,
        constraints: parsed.constraints,
        statement: parsed.statementHtml,
        statementHtml: parsed.statementHtml,
        statementText: (parsed.body + '\n\nInput:\n' + parsed.inputSpec + '\n\nOutput:\n' + parsed.outputSpec + '\n\nConstraints:\n' + parsed.constraints).trim(),
        url: `https://cses.fi/problemset/task/${taskId}`
      };

      if (isContextValid()) {
        chrome.storage.local.set({
          [`cses_prob_${taskId}`]: pData
        }).catch(() => {});
      }

      return pData;
    } catch (e) {
      console.warn('[CodeSync Pro] Failed to fetch CSES problem metadata:', e);
      return null;
    }
  }

  // ── 2. Cache Problem Data & Notify IDE on Task Page ────────────────────────
  if (getTaskMatch()) {
    try {
      const pData = extractCSESProblemData();
      if (pData && isContextValid()) {
        chrome.storage.local.set({
          [`cses_prob_${pData.id}`]: pData,
          current_ide_problem: pData,
          last_active_problem: pData
        }).catch(() => {});

        chrome.runtime.sendMessage({
          type: 'PROBLEM_DETECTED',
          data: pData
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // ── 3. Floating Button: ⚡ Solve in CodeSync IDE ─────────────────────────────
  function injectIdeFloatingButton() {
    if (!getTaskMatch()) return;
    if (document.getElementById('codesync-ide-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'codesync-ide-btn';
    btn.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 999999',
      'background: linear-gradient(135deg, #1f6feb, #2f81f7)',
      'color: #ffffff',
      'border: 1px solid rgba(255, 255, 255, 0.2)',
      'border-radius: 9999px',
      'padding: 10px 18px',
      'font-size: 13px',
      'font-weight: 700',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'cursor: pointer',
      'display: flex',
      'align-items: center',
      'gap: 8px',
      'box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(47, 129, 247, 0.4)',
      'transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      'user-select: none'
    ].join(';');

    btn.innerHTML = '<span style="font-size: 15px;">⚡</span><span>Solve in CodeSync IDE</span>';

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(47, 129, 247, 0.6)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(47, 129, 247, 0.4)';
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pData = extractCSESProblemData();
      btn.innerHTML = '<span style="font-size: 15px;">⚡</span><span>Opening in CodeSync IDE...</span>';
      setTimeout(() => {
        if (btn) btn.innerHTML = '<span style="font-size: 15px;">⚡</span><span>Solve in CodeSync IDE</span>';
      }, 2500);

      if (isContextValid()) {
        chrome.runtime.sendMessage({
          type: 'OPEN_IDE',
          problemData: pData,
          problem: pData
        }).catch(() => {});
      }
    });

    document.body.appendChild(btn);
  }

  // ── 4. Language & File Helpers for CSES ─────────────────────────────────────
  const LANG_FILE_NAMES = {
    cpp: 'solution.cpp',
    c: 'solution.c',
    python: 'solution.py',
    java: 'solution.java',
    rust: 'solution.rs',
    javascript: 'solution.js',
    csharp: 'solution.cs',
    go: 'solution.go'
  };

  const LANG_KEYWORDS = {
    cpp: ['C++', 'g++'],
    c: ['C (gcc)'],
    python: ['Python', 'PyPy'],
    java: ['Java'],
    rust: ['Rust'],
    javascript: ['Node', 'JavaScript'],
    csharp: ['C#'],
    go: ['Go']
  };

  function findLangOption(selectEl, lang) {
    if (!selectEl) return null;
    const keywords = LANG_KEYWORDS[lang] || ['C++'];
    for (const kw of keywords) {
      const opt = Array.from(selectEl.options).find(o =>
        o.text.toLowerCase().includes(kw.toLowerCase()) ||
        o.value.toLowerCase().includes(kw.toLowerCase())
      );
      if (opt) return opt.value;
    }
    return selectEl.options.length > 0 ? selectEl.options[0].value : null;
  }

  function setFileInput(inputEl, code, lang) {
    const fileName = LANG_FILE_NAMES[lang] || 'solution.cpp';
    const file = new File([code], fileName, { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── 5. Auto-Submit Form Execution ──────────────────────────────────────────
  function executeCSESSubmit(code, lang) {
    const form = document.querySelector('form[action*="/submit"]') ||
                 document.querySelector('form[enctype*="multipart"]') ||
                 document.querySelector('form');
    if (!form) return false;

    // File Input
    const fileInput = form.querySelector('input[type="file"]');
    if (fileInput) {
      setFileInput(fileInput, code, lang);
    }

    // Textarea (if CSES provides a direct code textarea)
    const textarea = form.querySelector('textarea[name="code"]') ||
                     form.querySelector('textarea[name="source"]') ||
                     form.querySelector('textarea');
    if (textarea) {
      textarea.value = code;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Language Dropdown
    const langSelect = form.querySelector('select[name="lang"]') ||
                       form.querySelector('select[name="language"]') ||
                       form.querySelector('select');
    if (langSelect) {
      const val = findLangOption(langSelect, lang);
      if (val) {
        langSelect.value = val;
        langSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Submit trigger
    const submitBtn = form.querySelector('input[type="submit"]') ||
                      form.querySelector('button[type="submit"]') ||
                      form.querySelector('#submit');
    if (submitBtn) {
      submitBtn.click();
    } else {
      form.submit();
    }
    return true;
  }

  // Check pending auto-submit from sessionStorage
  try {
    const pendingRaw = sessionStorage.getItem('codesync_cses_auto_submit');
    if (pendingRaw) {
      sessionStorage.removeItem('codesync_cses_auto_submit');
      const { code, lang } = JSON.parse(pendingRaw);
      setTimeout(() => {
        executeCSESSubmit(code, lang);
      }, 300);
    }
  } catch (e) {}

  // ── 6. Message Listener for IDE Communication & Scraping Relay ─────────────
  if (isContextValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'FETCH_URL' && message.url) {
        fetch(message.url, { credentials: 'include' })
          .then(async (response) => {
            if (!response.ok) { sendResponse({ ok: false, status: response.status }); return; }
            const buffer = await response.arrayBuffer();
            const text = new TextDecoder('utf-8').decode(buffer);
            sendResponse({ ok: true, text, url: response.url });
          })
          .catch((err) => {
            sendResponse({ ok: false, error: err.message });
          });
        return true;
      }

      if (message.type === 'GET_PROBLEM_DATA') {
        const pData = extractCSESProblemData();
        if (pData) {
          sendResponse({ ok: true, data: pData });
        } else {
          sendResponse({ ok: false });
        }
        return true;
      }

      if (message.type === 'SUBMIT_CODE') {
        const code = message.code;
        const lang = message.language || 'cpp';

        if (getSubmitMatch()) {
          const success = executeCSESSubmit(code, lang);
          sendResponse({ ok: success });
          return true;
        }

        const taskMatch = getTaskMatch();
        if (taskMatch) {
          const taskId = taskMatch[1];
          if (document.querySelector('form input[type="file"]')) {
            const success = executeCSESSubmit(code, lang);
            sendResponse({ ok: success });
            return true;
          }

          sessionStorage.setItem('codesync_cses_auto_submit', JSON.stringify({ code, lang }));
          window.location.href = `https://cses.fi/problemset/submit/${taskId}/`;
          sendResponse({ ok: true, method: 'redirect_to_submit' });
          return true;
        }

        sendResponse({ ok: false, error: 'Not on a CSES problem page' });
        return true;
      }
    });
  }

  // ── 7. Submission Result Watcher & GitHub Sync ──────────────────────────────
  const syncedSubIds = new Set();
  const recordedAttemptSubIds = new Set();
  let isSyncingSubId = null;

  function showSyncedToast(title) {
    if (document.getElementById('codesync-cses-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'codesync-cses-toast';
    toast.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 999999',
      'background: #161b22',
      'border: 1px solid #3fb950',
      'border-radius: 8px',
      'padding: 12px 18px',
      'color: #e6edf3',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'font-size: 13px',
      'display: flex',
      'align-items: center',
      'gap: 10px',
      'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)',
      'transition: opacity 0.3s ease'
    ].join(';');
    toast.innerHTML = `<span style="color:#3fb950;font-size:16px;">✅</span><span><strong>${title}</strong> synced to GitHub!</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  }

  // Strict CSES verdict extractor
  function getCSESSubmissionVerdict(doc = document) {
    let statusText = '';
    let resultText = '';
    let taskId = '';
    let taskTitle = '';
    let compiler = 'C++';

    // 1. Inspect table rows
    const rows = doc.querySelectorAll('tr');
    rows.forEach(tr => {
      const cells = tr.children;
      if (cells.length >= 2) {
        const label = cells[0].textContent.trim().toLowerCase();
        const val = cells[1].textContent.trim();

        if (label === 'status:' || label === 'status') {
          statusText = val.toUpperCase();
        } else if (label === 'result:' || label === 'result') {
          resultText = val.toUpperCase();
        } else if (label === 'task:' || label === 'task') {
          const a = cells[1].querySelector('a[href*="/problemset/task/"]');
          if (a) {
            const m = a.href.match(/\/problemset\/task\/(\d+)/);
            if (m) taskId = m[1];
            taskTitle = a.textContent.trim();
          }
        } else if (label === 'compiler:' || label === 'compiler' || label === 'language:' || label === 'language') {
          compiler = val;
        }
      }
    });

    // Fallback regex on page text if table rows were structured differently
    if (!resultText || !statusText) {
      const bodyText = doc.body ? doc.body.innerText : '';
      if (!statusText) {
        const sm = bodyText.match(/Status:\s*([A-Za-z]+)/i);
        if (sm) statusText = sm[1].trim().toUpperCase();
      }
      if (!resultText) {
        const rm = bodyText.match(/Result:\s*([A-Za-z0-9\s/()]+?)(?:\n|$)/i);
        if (rm) resultText = rm[1].trim().toUpperCase();
      }
    }

    // Check if evaluation is still ongoing
    const isPending = /PENDING|TESTING/i.test(statusText) || /PENDING|TESTING/i.test(resultText);

    // Check if any test case in the test results table has failed
    let hasFailedTest = false;
    const testRows = doc.querySelectorAll('table tr');
    testRows.forEach(tr => {
      const text = tr.innerText || tr.textContent || '';
      if (/^#\d+/i.test(text.trim())) {
        if (/WRONG ANSWER|TIME LIMIT|RUNTIME ERROR|OUTPUT LIMIT/i.test(text)) {
          hasFailedTest = true;
        }
      }
    });

    // Ready state: evaluation finished
    const isReady = (statusText === 'READY' || (!isPending && resultText.length > 0)) && !isPending;

    // Strict Accepted check:
    // Must be ready, must NOT have failed test, and Result must be ACCEPTED
    const isAccepted = isReady && !hasFailedTest && (
      resultText === 'ACCEPTED' ||
      resultText.startsWith('ACCEPTED') ||
      resultText.includes('ACCEPTED (100')
    ) && !/WRONG|TIME LIMIT|RUNTIME|OUTPUT LIMIT|COMPILE ERROR/i.test(resultText);

    return {
      isReady,
      isAccepted,
      status: statusText,
      result: resultText || (isPending ? 'PENDING' : 'UNKNOWN'),
      taskId,
      taskTitle,
      compiler
    };
  }

  // Inject failure badge on result page (never sync, just record attempt)
  function injectFailedResultBadge(subId, verdictResult) {
    // Remove sync button if present
    const syncBtn = document.getElementById('codesync-cses-sync-btn');
    if (syncBtn) syncBtn.remove();

    if (document.getElementById('codesync-cses-failed-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'codesync-cses-failed-badge';
    badge.style.cssText = [
      'margin-top: 14px',
      'margin-bottom: 14px',
      'background: rgba(248, 81, 73, 0.15)',
      'color: #f85149',
      'border: 1px solid rgba(248, 81, 73, 0.4)',
      'border-radius: 6px',
      'padding: 8px 16px',
      'font-size: 13px',
      'font-weight: 600',
      'display: inline-flex',
      'align-items: center',
      'gap: 8px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ].join(';');
    badge.innerHTML = `<span>❌</span><span>${verdictResult || 'Submission Failed'} (Attempt recorded)</span>`;

    const tableEl = document.querySelector('table');
    if (tableEl && tableEl.parentNode) {
      tableEl.parentNode.insertBefore(badge, tableEl);
    } else {
      const content = document.querySelector('.content') || document.body;
      content.prepend(badge);
    }
  }

  function watchResultPage() {
    const resultMatch = getResultMatch();
    if (!resultMatch) return;
    const subId = resultMatch[1];

    let hasSynced = false;
    let intervalId = null;

    // Helper: Build the complete payload for SYNC_CSES
    async function prepareSyncData() {
      // 1. Submitted Code
      let code = '';
      const codeEl = document.querySelector('pre.linenums') ||
                     document.querySelector('pre.prettyprint') ||
                     document.querySelector('.content pre');
      if (codeEl) code = codeEl.innerText;
      if (!code || code.trim().length === 0) return null;

      // 2. Metadata from result table
      let taskId = '';
      let taskTitle = '';
      let compiler = 'C++';
      let runtime = 'N/A';
      let memory = 'N/A';

      const rows = document.querySelectorAll('tr');
      rows.forEach(tr => {
        const text = tr.innerText || '';
        const label = tr.children[0] ? tr.children[0].innerText.toLowerCase() : '';

        // Task link & title (inside table row, NOT the top navbar tab!)
        if (/task/i.test(label)) {
          const a = tr.querySelector('a[href*="/problemset/task/"]');
          if (a) {
            const tm = a.href.match(/\/problemset\/task\/(\d+)/);
            if (tm) taskId = tm[1];
            const tText = a.textContent.trim();
            if (tText && !/^(task|cses)$/i.test(tText)) {
              taskTitle = tText;
            }
          }
        }

        if (/compiler|language/i.test(label) || /compiler:/i.test(text)) {
          compiler = text.replace(/^(compiler|language):\s*/i, '').trim();
        }
      });

      // Fallback taskId from any problem link on page
      if (!taskId) {
        const allTaskLinks = document.querySelectorAll('a[href*="/problemset/task/"]');
        for (const a of allTaskLinks) {
          const tm = a.href.match(/\/problemset\/task\/(\d+)/);
          if (tm) {
            taskId = tm[1];
            const txt = a.textContent.trim();
            if (txt && !/^(task|cses)$/i.test(txt) && !taskTitle) {
              taskTitle = txt;
            }
            break;
          }
        }
      }

      // Check document title
      if (!taskTitle || /^(task|cses)$/i.test(taskTitle)) {
        const dt = document.title.replace(/^CSES\s*-\s*/i, '').replace(/\s*-\s*Results?.*$/i, '').trim();
        if (dt && !/^(task|cses|results?)$/i.test(dt)) taskTitle = dt;
      }

      // 3. Resolve full problem metadata (statement, limits, samples)
      let probData = null;
      if (taskId && isContextValid()) {
        const stored = await chrome.storage.local.get([`cses_prob_${taskId}`, 'last_active_problem']);
        probData = stored[`cses_prob_${taskId}`] || stored.last_active_problem;
      }

      // If statement or title is missing (e.g. solved on another PC), fetch from task page directly
      if (!probData || !probData.body || !probData.title || /^(task|cses)$/i.test(probData.title)) {
        if (taskId) {
          probData = await fetchAndParseCSESProblem(taskId);
        }
      }

      const effectiveTitle = taskTitle || (probData && probData.title) || (taskId ? `Problem ${taskId}` : `Submission ${subId}`);
      const cleanTitle = effectiveTitle.replace(/^(task|cses)$/i, taskId ? `Problem ${taskId}` : 'CSES Problem');

      return {
        subId: subId,
        subUrl: window.location.href.split('#')[0].split('?')[0],
        taskId: taskId || (probData && probData.id) || '',
        title: cleanTitle,
        category: (probData && probData.category) || 'Problem Set',
        code: code,
        language: compiler,
        timeLimit: (probData && probData.timeLimit) || '1.00 s',
        memoryLimit: (probData && probData.memoryLimit) || '512 MB',
        runtime: runtime,
        memory: memory,
        statement: (probData && (probData.body || probData.statement)) || '',
        body: (probData && probData.body) || '',
        inputSpec: (probData && probData.inputSpec) || '',
        outputSpec: (probData && probData.outputSpec) || '',
        constraints: (probData && probData.constraints) || '',
        samples: (probData && probData.samples) || [],
        url: taskId ? `https://cses.fi/problemset/task/${taskId}` : window.location.href
      };
    }

    // Inject sleek "⚡ Sync Submission to GitHub" button directly on result page
    function injectSyncButton() {
      if (document.getElementById('codesync-cses-sync-btn')) return;

      const failedBadge = document.getElementById('codesync-cses-failed-badge');
      if (failedBadge) failedBadge.remove();

      const btn = document.createElement('button');
      btn.id = 'codesync-cses-sync-btn';
      btn.style.cssText = [
        'margin-top: 14px',
        'margin-bottom: 14px',
        'background: #238636',
        'color: #ffffff',
        'border: 1px solid rgba(255, 255, 255, 0.2)',
        'border-radius: 6px',
        'padding: 8px 16px',
        'font-size: 13px',
        'font-weight: 600',
        'cursor: pointer',
        'display: inline-flex',
        'align-items: center',
        'gap: 8px',
        'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2)',
        'transition: all 0.2s ease',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ].join(';');

      btn.innerHTML = '<span>⚡</span><span>Sync Submission to GitHub</span>';

      // Check if already synced in syncLog
      if (isContextValid()) {
        chrome.storage.local.get(['syncLog'], (d) => {
          const syncLog = d.syncLog || [];
          const alreadyDone = syncLog.some(e => e.platform === 'CSES' && String(e.subId) === String(subId));
          if (alreadyDone) {
            syncedSubIds.add(subId);
            hasSynced = true;
            btn.innerHTML = '<span>✅</span><span>Synced to GitHub</span>';
            btn.style.background = '#21262d';
            btn.style.borderColor = '#30363d';
            btn.style.color = '#8b949e';
            btn.style.cursor = 'default';
          }
        });
      }

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (btn.dataset.syncing === 'true' || isSyncingSubId === subId) return;
        btn.dataset.syncing = 'true';
        isSyncingSubId = subId;
        btn.innerHTML = '<span>⏳</span><span>Syncing to GitHub...</span>';

        try {
          const syncPayload = await prepareSyncData();
          if (!syncPayload) {
            btn.innerHTML = '<span>❌</span><span>Code not ready or not found</span>';
            setTimeout(() => { btn.innerHTML = '<span>⚡</span><span>Sync Submission to GitHub</span>'; btn.dataset.syncing = 'false'; isSyncingSubId = null; }, 3000);
            return;
          }

          chrome.runtime.sendMessage({
            type: 'SYNC_CSES',
            data: syncPayload
          }, (resp) => {
            isSyncingSubId = null;
            btn.dataset.syncing = 'false';
            if (resp && resp.ok) {
              syncedSubIds.add(subId);
              hasSynced = true;
              btn.innerHTML = '<span>✅</span><span>Synced to GitHub</span>';
              btn.style.background = '#21262d';
              btn.style.borderColor = '#30363d';
              btn.style.color = '#8b949e';
              btn.style.cursor = 'default';
              if (!resp.skipped) {
                showSyncedToast(syncPayload.title);
              }
            } else {
              btn.innerHTML = `<span>❌</span><span>${resp && resp.error ? resp.error : 'Sync failed'}</span>`;
              setTimeout(() => { btn.innerHTML = '<span>⚡</span><span>Retry Sync to GitHub</span>'; }, 3000);
            }
          });
        } catch (err) {
          isSyncingSubId = null;
          btn.dataset.syncing = 'false';
          btn.innerHTML = '<span>❌</span><span>Error</span>';
          setTimeout(() => { btn.innerHTML = '<span>⚡</span><span>Sync Submission to GitHub</span>'; }, 3000);
        }
      });

      const tableEl = document.querySelector('table');
      if (tableEl && tableEl.parentNode) {
        tableEl.parentNode.insertBefore(btn, tableEl);
      } else {
        const content = document.querySelector('.content') || document.body;
        content.prepend(btn);
      }
    }

    // Automatic Result Watcher
    async function checkVerdict() {
      if (!isContextValid()) return;

      const verdict = getCSESSubmissionVerdict();
      if (!verdict.isReady) {
        // Still pending or testing, keep polling
        return;
      }

      // Evaluation is complete! Clear polling interval immediately.
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      if (!verdict.isAccepted) {
        // Submission failed (Wrong Answer, TLE, RTE, etc.)
        // Never sync to GitHub, record as attempt.
        injectFailedResultBadge(subId, verdict.result);

        if (!recordedAttemptSubIds.has(subId)) {
          recordedAttemptSubIds.add(subId);
          chrome.runtime.sendMessage({
            type: 'RECORD_CSES_ATTEMPT',
            data: {
              subId: subId,
              taskId: verdict.taskId || '',
              verdict: verdict.result,
              title: verdict.taskTitle || '',
              timestamp: Date.now()
            }
          });
        }
        return;
      }

      // Verdict is ACCEPTED!
      injectSyncButton();

      // Record accepted submission as an attempt too (every submission is an attempt!)
      if (!recordedAttemptSubIds.has(subId)) {
        recordedAttemptSubIds.add(subId);
        chrome.runtime.sendMessage({
          type: 'RECORD_CSES_ATTEMPT',
          data: {
            subId: subId,
            taskId: verdict.taskId || '',
            verdict: verdict.result,
            title: verdict.taskTitle || '',
            isAccepted: true,
            timestamp: Date.now()
          }
        });
      }

      if (hasSynced || syncedSubIds.has(subId) || isSyncingSubId === subId) {
        return;
      }

      // Check if already in syncLog
      const stored = await chrome.storage.local.get(['syncLog']);
      const syncLog = stored.syncLog || [];
      const alreadyDone = syncLog.some(e => e.platform === 'CSES' && String(e.subId) === String(subId));
      if (alreadyDone) {
        hasSynced = true;
        syncedSubIds.add(subId);
        const btn = document.getElementById('codesync-cses-sync-btn');
        if (btn) {
          btn.innerHTML = '<span>✅</span><span>Synced to GitHub</span>';
          btn.style.background = '#21262d';
          btn.style.borderColor = '#30363d';
          btn.style.color = '#8b949e';
          btn.style.cursor = 'default';
        }
        return;
      }

      // In-flight locking: prevent concurrent intervals from sending duplicate syncs
      isSyncingSubId = subId;
      const btn = document.getElementById('codesync-cses-sync-btn');
      if (btn) {
        btn.innerHTML = '<span>⏳</span><span>Syncing to GitHub...</span>';
      }

      const syncPayload = await prepareSyncData();
      if (!syncPayload || !syncPayload.code) {
        isSyncingSubId = null;
        return;
      }

      hasSynced = true;
      console.log('[CodeSync Pro] Auto-syncing CSES Accepted:', syncPayload.title);

      chrome.runtime.sendMessage({
        type: 'SYNC_CSES',
        data: syncPayload
      }, (resp) => {
        isSyncingSubId = null;
        if (resp && resp.ok) {
          syncedSubIds.add(subId);
          if (btn) {
            btn.innerHTML = '<span>✅</span><span>Synced to GitHub</span>';
            btn.style.background = '#21262d';
            btn.style.borderColor = '#30363d';
            btn.style.color = '#8b949e';
            btn.style.cursor = 'default';
          }
          if (!resp.skipped) {
            showSyncedToast(syncPayload.title);
          }
        } else {
          hasSynced = false;
          if (btn) {
            btn.innerHTML = `<span>❌</span><span>${resp && resp.error ? resp.error : 'Sync failed'}</span>`;
            setTimeout(() => { btn.innerHTML = '<span>⚡</span><span>Retry Sync to GitHub</span>'; }, 3000);
          }
        }
      });
    }

    checkVerdict();
    intervalId = setInterval(checkVerdict, 1500);
    setTimeout(() => {
      if (intervalId) clearInterval(intervalId);
    }, 45000);
  }

  // ── 8. Task Page: Quick Sync for Past Submissions in Sidebar ────────────────
  function enhanceTaskPageSubmissions() {
    if (!getTaskMatch()) return;

    const sidebar = document.querySelector('.nav.sidebar');
    if (!sidebar) return;

    // Find links under "Your submissions"
    const links = sidebar.querySelectorAll('a[href*="/problemset/result/"]');
    if (!links || links.length === 0) return;

    if (!isContextValid()) return;
    chrome.storage.local.get(['syncLog'], (d) => {
      const syncLog = d.syncLog || [];

      links.forEach(link => {
        const m = link.href.match(/\/problemset\/result\/(\d+)/);
        if (!m) return;
        const subId = m[1];
        if (link.dataset.codesyncEnhanced === 'true') return;
        link.dataset.codesyncEnhanced = 'true';

        const isSynced = syncLog.some(e => e.platform === 'CSES' && String(e.subId) === String(subId));

        const badge = document.createElement('span');
        badge.style.cssText = [
          'margin-left: 6px',
          'font-size: 11px',
          'padding: 1px 6px',
          'border-radius: 4px',
          'cursor: pointer',
          'display: inline-block',
          isSynced ? 'background: #21262d; color: #8b949e;' : 'background: #1f6feb; color: #ffffff;'
        ].join(';');
        badge.textContent = isSynced ? '✓ Synced' : '⚡ Sync';
        badge.title = isSynced ? 'Already synced to GitHub' : 'Click to sync this submission to GitHub';

        if (!isSynced) {
          badge.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            badge.textContent = '⏳ Syncing...';
            try {
              const res = await fetch(`https://cses.fi/problemset/result/${subId}/`);
              if (!res.ok) throw new Error('Failed to load submission');
              const html = await res.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');

              const verdict = getCSESSubmissionVerdict(doc);
              if (!verdict.isAccepted) {
                badge.textContent = `❌ ${verdict.result || 'Failed'}`;
                badge.style.background = '#da3633';
                badge.style.color = '#ffffff';
                setTimeout(() => { badge.textContent = '❌ Not Accepted'; }, 3000);
                return;
              }

              const codeEl = doc.querySelector('pre.linenums') || doc.querySelector('pre.prettyprint') || doc.querySelector('.content pre');
              const code = codeEl ? codeEl.innerText : '';
              if (!code) throw new Error('No code found');

              let compiler = 'C++';
              doc.querySelectorAll('tr').forEach(tr => {
                const label = tr.children[0] ? tr.children[0].innerText.toLowerCase() : '';
                if (/compiler|language/i.test(label)) {
                  compiler = tr.innerText.replace(/^(compiler|language):\s*/i, '').trim();
                }
              });

              const pData = extractCSESProblemData() || {};

              chrome.runtime.sendMessage({
                type: 'SYNC_CSES',
                data: {
                  subId: subId,
                  subUrl: `https://cses.fi/problemset/result/${subId}/`,
                  taskId: pData.taskId || pData.id || '',
                  title: pData.title || `Problem ${pData.taskId}`,
                  category: pData.category || 'Problem Set',
                  code: code,
                  language: compiler,
                  timeLimit: pData.timeLimit || '1.00 s',
                  memoryLimit: pData.memoryLimit || '512 MB',
                  runtime: 'N/A',
                  memory: 'N/A',
                  statement: pData.body || pData.statement || '',
                  body: pData.body || '',
                  inputSpec: pData.inputSpec || '',
                  outputSpec: pData.outputSpec || '',
                  constraints: pData.constraints || '',
                  samples: pData.samples || [],
                  url: window.location.href.split('#')[0].split('?')[0]
                }
              }, (resp) => {
                if (resp && resp.ok) {
                  badge.textContent = '✓ Synced';
                  badge.style.background = '#21262d';
                  badge.style.color = '#8b949e';
                  showSyncedToast(pData.title);
                } else {
                  badge.textContent = '❌ Failed';
                  setTimeout(() => { badge.textContent = '⚡ Sync'; }, 3000);
                }
              });
            } catch (err) {
              badge.textContent = '❌ Failed';
              setTimeout(() => { badge.textContent = '⚡ Sync'; }, 3000);
            }
          });
        }

        link.appendChild(badge);
      });
    });
  }

  // ── 8.5. CSES User Profile & Official Submission Count Sync ───────────────
  function detectAndSyncCSESUserProfile() {
    try {
      const userLink = document.querySelector('.controls a.account[href^="/user/"]') ||
                       document.querySelector('a[href^="/user/"]');
      if (!userLink) return;
      const m = (userLink.getAttribute('href') || '').match(/\/user\/(\d+)/);
      if (!m) return;
      const userId = m[1];
      const username = userLink.textContent.trim();

      // Check if current page is the user profile page itself
      if (window.location.pathname.startsWith(`/user/${userId}`)) {
        const text = document.body.innerText || '';
        const countMatch = text.match(/Submission count:\s*(\d+)/i);
        if (countMatch) {
          const count = parseInt(countMatch[1], 10);
          if (!isNaN(count)) {
            chrome.runtime.sendMessage({
              type: 'UPDATE_CSES_PROFILE',
              data: { userId, username, submissionCount: count }
            }).catch(() => {});
            return;
          }
        }
      }

      // If on any other CSES page, fetch user profile in background
      fetch(`https://cses.fi/user/${userId}`)
        .then(r => r.text())
        .then(html => {
          const match = html.match(/Submission count:<\/td>\s*<td[^>]*>\s*(\d+)/i) ||
                        html.match(/Submission count:\s*(\d+)/i);
          if (match) {
            const count = parseInt(match[1], 10);
            if (!isNaN(count)) {
              chrome.runtime.sendMessage({
                type: 'UPDATE_CSES_PROFILE',
                data: { userId, username, submissionCount: count }
              }).catch(() => {});
            }
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  // ── 9. Initialize ──────────────────────────────────────────────────────────
  setTimeout(injectIdeFloatingButton, 800);
  setTimeout(enhanceTaskPageSubmissions, 1000);
  setTimeout(detectAndSyncCSESUserProfile, 500);
  watchResultPage();

})();
