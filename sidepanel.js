// CodeSync Pro — Side Panel Controller
'use strict';

(function () {
  let editor = null;
  let currentLanguage = 'cpp';
  let activeProblem = null;
  let testcases = [];
  let isExecuting = false;
  let executor = null;

  const $ = (id) => document.getElementById(id);

  function initMonaco() {
    window.MonacoEnvironment = {
      getWorkerUrl: function (workerId, label) {
        return chrome.runtime.getURL('lib/monaco/vs/editor/editor.worker.js');
      }
    };

    require.config({ paths: { vs: 'lib/monaco/vs' } });

    require(['vs/editor/editor.main'], function () {
      if (typeof MONACO_THEMES !== 'undefined') {
        for (const [themeId, themeData] of Object.entries(MONACO_THEMES)) {
          monaco.editor.defineTheme(themeId, themeData);
        }
      }

      registerSnippetsAndCompletions();

      const container = $('editor-container');
      const defaultLangConfig = EDITOR_LANGUAGES.find(l => l.id === currentLanguage) || EDITOR_LANGUAGES[0];

      editor = monaco.editor.create(container, {
        value: defaultLangConfig.defaultTemplate || '',
        language: defaultLangConfig.monacoId || 'cpp',
        theme: 'vs-dark',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
        automaticLayout: true,
        tabSize: 4,
        minimap: { enabled: false }, // disabled for compact sidebar
        lineNumbers: 'on',
        bracketPairColorization: { enabled: true },
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false
        },
        quickSuggestionsDelay: 10,
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: true,
        suggest: {
          filterGraceful: true,
          localityBonus: true
        },
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        wordWrap: 'on'
      });

      editor.onDidChangeCursorPosition(e => {
        const pos = e.position;
        $('editor-cursor-pos').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });

      editor.onDidChangeModelContent(() => {
        $('file-dirty-dot').classList.add('active');
        saveDraft();
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        submitSolution();
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
        runAllTestcases();
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      });

      loadPreferences();
      detectProblem();
    });
  }

  async function loadPreferences() {
    const data = await chrome.storage.local.get(['editorTheme', 'defaultLanguage']);
    if (data.editorTheme && editor) monaco.editor.setTheme(data.editorTheme);
    if (data.defaultLanguage) setLanguage(data.defaultLanguage);
  }

  function saveDraft() {
    if (!editor) return;
    const code = editor.getValue();
    const key = activeProblem ? `draft_${activeProblem.platform}_${activeProblem.slug}` : 'draft_scratchpad';
    chrome.storage.local.set({ [key]: code });
  }

  async function loadDraft() {
    if (!editor) return;
    const key = activeProblem ? `draft_${activeProblem.platform}_${activeProblem.slug}` : 'draft_scratchpad';
    const data = await chrome.storage.local.get(key);
    if (data[key] && data[key].trim()) {
      editor.setValue(data[key]);
      $('file-dirty-dot').classList.remove('active');
    }
  }

  function setLanguage(langId) {
    currentLanguage = langId;
    $('lang-select').value = langId;
    const langConfig = EDITOR_LANGUAGES.find(l => l.id === langId) || EDITOR_LANGUAGES[0];
    if (editor) {
      monaco.editor.setModelLanguage(editor.getModel(), langConfig.monacoId || 'cpp');
      const currentCode = editor.getValue().trim();
      const isDefaultTemplate = currentCode.length === 0 || EDITOR_LANGUAGES.some(l => (l.defaultTemplate || '').trim() === currentCode);
      if (isDefaultTemplate) {
        editor.setValue(langConfig.defaultTemplate || '');
      }
    }
    const ext = LANG_EXT_MAP[langId] || langId;
    $('file-tab-name').textContent = `solution.${ext}`;
  }

  $('lang-select').addEventListener('change', (e) => {
    setLanguage(e.target.value);
  });

  // ── Problem Detection ──────────────────────────────────────────────────────
  async function detectProblem() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROBLEM_DATA' }).catch(() => null);
      if (resp && resp.ok && resp.data && resp.data.platform !== 'LC' && resp.data.platform !== 'TP') {
        loadProblemData(resp.data);
      }
    } catch (e) {
      console.warn('Sidepanel detect problem error:', e);
    }
  }

  function loadProblemData(data) {
    if (!data || data.platform === 'LC' || data.platform === 'TP') return;
    activeProblem = data;
    $('problem-platform').textContent = data.platform || 'CP';
    $('problem-platform').className = `problem-platform-tag ${data.platform}`;
    $('problem-title').textContent = data.title || 'Active Problem';
    $('problem-title').href = data.url || '#';

    testcases = [];
    if (data.samples && Array.isArray(data.samples)) {
      data.samples.forEach((sample, idx) => {
        testcases.push({
          id: idx + 1,
          input: sample.input || '',
          expected: sample.output || '',
          actual: '',
          verdict: null
        });
      });
    }
    renderTestcases();
    loadDraft();
  }

  // Listen for tab updates
  chrome.tabs.onActivated.addListener(() => {
    detectProblem();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') detectProblem();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PROBLEM_DETECTED' && msg.data && msg.data.platform !== 'LC' && msg.data.platform !== 'TP') {
      loadProblemData(msg.data);
    }
  });

  $('refresh-problem-btn').addEventListener('click', detectProblem);

  // Pop-out to full IDE
  $('popout-tab-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_IDE' }).catch(() => {
      chrome.tabs.create({ url: 'ide.html' });
    });
  });

  // ── CPH Runner ─────────────────────────────────────────────────────────────
  function renderTestcases() {
    const list = $('testcases-list');
    if (testcases.length === 0) {
      list.innerHTML = `<div class="empty-state-tests"><p>No tests. Click <strong>+ Add Test</strong>.</p></div>`;
      updateSummaryStats();
      return;
    }

    list.innerHTML = '';
    testcases.forEach((tc, idx) => {
      const card = document.createElement('div');
      card.className = `testcase-card ${tc.verdict ? (tc.verdict === 'AC' ? 'passed' : 'failed') : ''}`;

      let verdictBadge = '';
      if (tc.verdict) {
        const cls = tc.verdict === 'AC' ? 'verdict-badge-ac' : 'verdict-badge-wa';
        verdictBadge = `<span class="testcase-verdict ${cls}">${tc.verdict}</span>`;
      }

      card.innerHTML = `
        <div class="testcase-header">
          <div class="testcase-title"><span>#${idx + 1}</span> ${verdictBadge}</div>
          <div class="testcase-actions">
            <button class="btn-test-action btn-run-single" data-idx="${idx}">▶</button>
            ${tc.verdict && tc.verdict !== 'AC' ? `<button class="btn-test-action btn-diff" data-idx="${idx}">🔍</button>` : ''}
            <button class="btn-test-action btn-del" data-idx="${idx}">✕</button>
          </div>
        </div>
        <div class="testcase-body">
          <div class="testcase-io-group">
            <label>Input:</label>
            <textarea class="testcase-textarea tc-in" data-idx="${idx}">${tc.input}</textarea>
          </div>
          <div class="testcase-io-group">
            <label>Expected:</label>
            <textarea class="testcase-textarea tc-exp" data-idx="${idx}">${tc.expected}</textarea>
          </div>
          ${tc.actual ? `
          <div class="testcase-io-group">
            <label>Output:</label>
            <textarea class="testcase-textarea tc-act" readonly style="color:${tc.verdict === 'AC' ? '#4ade80' : '#f87171'}">${tc.actual}</textarea>
          </div>` : ''}
        </div>
      `;

      card.querySelector('.tc-in').addEventListener('input', (e) => {
        testcases[idx].input = e.target.value;
        autoFitTextarea(e.target);
      });
      card.querySelector('.tc-exp').addEventListener('input', (e) => {
        testcases[idx].expected = e.target.value;
        autoFitTextarea(e.target);
      });
      card.querySelector('.btn-run-single').addEventListener('click', () => { runSingle(idx); });
      card.querySelector('.btn-del').addEventListener('click', () => {
        testcases.splice(idx, 1);
        renderTestcases();
      });
      const diffBtn = card.querySelector('.btn-diff');
      if (diffBtn) {
        diffBtn.addEventListener('click', () => {
          $('diff-actual').textContent = tc.actual || '';
          $('diff-expected').textContent = tc.expected || '';
          $('diff-modal').style.display = 'flex';
        });
      }

      list.appendChild(card);
      setTimeout(() => {
        card.querySelectorAll('.testcase-textarea').forEach(autoFitTextarea);
      }, 0);
    });

    function autoFitTextarea(el) {
      if (!el) return;
      el.style.height = 'auto';
      const h = Math.max(56, el.scrollHeight + 4);
      el.style.height = h + 'px';
    }

    updateSummaryStats();
  }

  function updateSummaryStats() {
    const passed = testcases.filter(t => t.verdict === 'AC').length;
    $('cph-summary-stats').textContent = `${passed}/${testcases.length} Passed`;
  }

  $('add-testcase-btn').addEventListener('click', () => {
    testcases.push({ id: testcases.length + 1, input: '', expected: '', actual: '', verdict: null });
    renderTestcases();
  });

  $('clear-results-btn').addEventListener('click', () => {
    testcases.forEach(t => { t.verdict = null; t.actual = ''; });
    renderTestcases();
  });

  $('close-diff-btn').addEventListener('click', () => {
    $('diff-modal').style.display = 'none';
  });

  async function runSingle(idx) {
    if (isExecuting || !editor) return;
    const tc = testcases[idx];
    isExecuting = true;
    if (!executor) executor = new CodeExecutor();

    try {
      const res = await executor.execute(editor.getValue(), currentLanguage, tc.input);
      tc.actual = res.stdout;
      const isMatch = (tc.actual || '').trim() === (tc.expected || '').trim();
      tc.verdict = res.status === 'CE' ? 'CE' : res.status === 'TLE' ? 'TLE' : res.status === 'RTE' ? 'RTE' : (isMatch ? 'AC' : 'WA');
      renderTestcases();
    } catch (e) {
      tc.verdict = 'RTE';
      tc.actual = e.message;
      renderTestcases();
    } finally {
      isExecuting = false;
    }
  }

  async function runAllTestcases() {
    if (isExecuting || !editor || testcases.length === 0) return;
    isExecuting = true;
    if (!executor) executor = new CodeExecutor();

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      try {
        const res = await executor.execute(editor.getValue(), currentLanguage, tc.input);
        tc.actual = res.stdout;
        const isMatch = (tc.actual || '').trim() === (tc.expected || '').trim();
        tc.verdict = res.status === 'CE' ? 'CE' : res.status === 'TLE' ? 'TLE' : res.status === 'RTE' ? 'RTE' : (isMatch ? 'AC' : 'WA');
      } catch (e) {
        tc.verdict = 'RTE';
        tc.actual = e.message;
      }
      renderTestcases();
    }
    isExecuting = false;
  }

  $('run-all-tests-btn').addEventListener('click', runAllTestcases);

  // Auto-Submit
  async function submitSolution() {
    if (!editor) return;
    const code = editor.getValue();
    if (!code.trim()) return;

    if (activeProblem && (activeProblem.platform === 'LC' || activeProblem.platform === 'TP')) {
      showToast('Submit supported for Codeforces and AtCoder only.', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && (tab.url.includes('leetcode.com') || tab.url.includes('toph.co'))) {
        showToast('Submit supported for Codeforces and AtCoder only.', 'error');
        return;
      }
      if (tab && tab.id) {
        const resp = await chrome.tabs.sendMessage(tab.id, {
          type: 'SUBMIT_CODE',
          code: code,
          language: currentLanguage
        }).catch(() => null);

        if (resp && resp.ok) {
          showToast(resp.method === 'redirect_to_submit' ? 'Submitting to Codeforces (1-click)...' : 'Submitted to page!', 'success');
        } else {
          await navigator.clipboard.writeText(code);
          showToast('Code copied to clipboard!', 'success');
        }
      }
    } catch (e) {
      showToast('Submit error: ' + e.message, 'error');
    }
  }

  $('submit-code-btn').addEventListener('click', submitSolution);

  function showToast(msg, type = 'info') {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    t.style.borderColor = type === 'success' ? 'var(--green)' : 'var(--border)';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  // Resizing vertical split
  const gutter = $('gutter-2');
  const editorPanel = $('panel-editor');
  let isDragging = false;

  gutter.addEventListener('mousedown', (e) => {
    isDragging = true;
    gutter.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const newH = Math.max(150, Math.min(window.innerHeight - 150, e.clientY - 42));
    editorPanel.style.height = `${newH}px`;
    editorPanel.style.flex = 'none';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      gutter.classList.remove('dragging');
      if (editor) editor.layout();
    }
  });

  // ── Register CP Snippets & Full Multi-Language IntelliSense ────────────────
  function registerSnippetsAndCompletions() {
    function calculateBraceDepth(model, position) {
      const text = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });
      let depth = 0;
      let inString = false;
      let inChar = false;
      let inLineComment = false;
      let inBlockComment = false;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inLineComment) {
          if (ch === '\n') inLineComment = false;
          continue;
        }
        if (inBlockComment) {
          if (ch === '*' && next === '/') {
            inBlockComment = false;
            i++;
          }
          continue;
        }
        if (inString) {
          if (ch === '\\') i++;
          else if (ch === '"') inString = false;
          continue;
        }
        if (inChar) {
          if (ch === '\\') i++;
          else if (ch === "'") inChar = false;
          continue;
        }

        if (ch === '/' && next === '/') {
          inLineComment = true;
          i++;
        } else if (ch === '/' && next === '*') {
          inBlockComment = true;
          i++;
        } else if (ch === '"') {
          inString = true;
        } else if (ch === "'") {
          inChar = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth = Math.max(0, depth - 1);
        }
      }
      return depth;
    }

    const CPP_HEADERS = [
      { name: 'bits/stdc++.h', desc: 'Standard C++ library master include (all STL)' },
      { name: 'iostream', desc: 'Standard input/output stream objects (cin, cout)' },
      { name: 'vector', desc: 'Dynamic sequence container std::vector' },
      { name: 'string', desc: 'String container std::string and string utilities' },
      { name: 'algorithm', desc: 'STL algorithms (sort, min, max, binary_search, reverse)' },
      { name: 'cmath', desc: 'C-style math functions (sqrt, pow, abs, ceil, floor)' },
      { name: 'map', desc: 'Ordered associative key-value map std::map' },
      { name: 'set', desc: 'Ordered set of unique keys std::set' },
      { name: 'unordered_map', desc: 'Hash-table based associative container std::unordered_map' },
      { name: 'unordered_set', desc: 'Hash-table based set container std::unordered_set' },
      { name: 'queue', desc: 'FIFO queue and std::priority_queue container adaptor' },
      { name: 'stack', desc: 'LIFO stack container adaptor std::stack' },
      { name: 'deque', desc: 'Double-ended queue sequence container std::deque' }
    ];

    const ALL_LANGUAGES = ['cpp', 'c', 'python', 'java', 'rust', 'go', 'javascript', 'csharp', 'kotlin'];

    ALL_LANGUAGES.forEach(langKey => {
      monaco.languages.registerCompletionItemProvider(langKey, {
        triggerCharacters: ['.', ':', '<', '>', '/', '#', '"'],
        provideCompletionItems: function (model, position) {
          const lineContent = model.getLineContent(position.lineNumber);
          const lineUntilPos = lineContent.substring(0, position.column - 1);
          const lineAfterPos = lineContent.substring(position.column - 1);
          const word = model.getWordUntilPosition(position);
          const currentWord = (word.word || '').toLowerCase();

          const suggestions = [];

          // ── Case A: C/C++ Header includes ──
          if (langKey === 'cpp' || langKey === 'c') {
            const incAngleMatch = lineUntilPos.match(/#\s*include\s*<([^>]*)$/);
            const incQuoteMatch = lineUntilPos.match(/#\s*include\s*"([^"]*)$/);
            if (incAngleMatch || incQuoteMatch) {
              const typedPrefix = (incAngleMatch ? incAngleMatch[1] : incQuoteMatch[1]).toLowerCase();
              const hasClosing = incAngleMatch ? lineAfterPos.trim().startsWith('>') : lineAfterPos.trim().startsWith('"');
              const startCol = position.column - typedPrefix.length;
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: startCol,
                endColumn: Math.max(startCol + typedPrefix.length, position.column)
              };

              CPP_HEADERS.forEach(h => {
                if (typedPrefix && !h.name.toLowerCase().startsWith(typedPrefix)) return;
                const closingChar = incAngleMatch ? '>' : '"';
                const insertTxt = hasClosing ? h.name : (h.name + closingChar);
                suggestions.push({
                  label: h.name,
                  kind: monaco.languages.CompletionItemKind.File,
                  detail: h.desc,
                  documentation: `C++ Standard Header: <${h.name}>`,
                  insertText: insertTxt,
                  filterText: h.name,
                  range: range
                });
              });

              return { suggestions };
            }

            const incDirectiveMatch = lineUntilPos.match(/^\s*(#\s*\w*)$/);
            if (incDirectiveMatch) {
              const typedDirective = incDirectiveMatch[1].replace(/\s+/g, '').toLowerCase();
              const startCol = lineContent.indexOf('#') + 1;
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: startCol,
                endColumn: Math.max(startCol + typedDirective.length, position.column)
              };

              const COMMON_INC_SNIPPETS = [
                { label: '#include <bits/stdc++.h>', insert: '#include <bits/stdc++.h>\n', detail: 'All standard headers' },
                { label: '#include <iostream>', insert: '#include <iostream>\n', detail: 'Input/output stream' },
                { label: '#include <vector>', insert: '#include <vector>\n', detail: 'std::vector dynamic array' },
                { label: '#include <algorithm>', insert: '#include <algorithm>\n', detail: 'STL algorithms' },
                { label: '#include <string>', insert: '#include <string>\n', detail: 'std::string' }
              ];

              COMMON_INC_SNIPPETS.forEach(snip => {
                if (typedDirective && !snip.label.replace(/\s+/g, '').toLowerCase().startsWith(typedDirective)) return;
                suggestions.push({
                  label: snip.label,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  detail: snip.detail,
                  insertText: snip.insert,
                  filterText: snip.label,
                  range: range
                });
              });

              return { suggestions };
            }
          }

          // ── Context Analysis ──
          const isDotOrArrow = /(?:\.|\->)\s*\w*$/.test(lineUntilPos);
          const isScope = /::\s*\w*$/.test(lineUntilPos);
          const isStreamContext = /(?:>>|<<)\s*\w*$/.test(lineUntilPos);
          const isPreprocessor = /^\s*#\s*\w*$/.test(lineUntilPos);

          const braceDepth = (langKey !== 'python') ? calculateBraceDepth(model, position) : 1;
          const isGlobalScope = braceDepth === 0;

          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: Math.max(word.endColumn, position.column)
          };

          const dictMap = (typeof LANGUAGE_DICT_MAP !== 'undefined' ? LANGUAGE_DICT_MAP : (window.LANGUAGE_DICT_MAP || {}));
          const dict = dictMap[langKey] || dictMap.cpp || [];

          if (Array.isArray(dict)) {
            dict.forEach(item => {
              if (item.isMemberOnly && !isDotOrArrow) return;
              if (isDotOrArrow && !item.isMemberOnly) return;
              if (isGlobalScope && item.isStatement) return;
              if (isPreprocessor && !item.label.startsWith('#')) return;
              if (isStreamContext && (item.isStatement || item.kind === 'Snippet' || item.label.startsWith('using'))) return;

              let isMatch = false;
              let isPrefixMatch = false;

              if (currentWord.length === 0) {
                isMatch = true;
              } else {
                const labelLower = item.label.toLowerCase();
                if (labelLower.startsWith(currentWord)) {
                  isMatch = true;
                  isPrefixMatch = true;
                } else if (item.acronym && item.acronym.toLowerCase().startsWith(currentWord)) {
                  isMatch = true;
                }
              }

              if (!isMatch) return;

              let kind = monaco.languages.CompletionItemKind.Keyword;
              if (item.kind === 'Class') kind = monaco.languages.CompletionItemKind.Class;
              else if (item.kind === 'Method') kind = monaco.languages.CompletionItemKind.Method;
              else if (item.kind === 'Function') kind = monaco.languages.CompletionItemKind.Function;
              else if (item.kind === 'Snippet') kind = monaco.languages.CompletionItemKind.Snippet;
              else if (item.kind === 'Variable') kind = monaco.languages.CompletionItemKind.Variable;
              else if (item.kind === 'Constant') kind = monaco.languages.CompletionItemKind.Constant;
              else if (item.kind === 'Field' || item.kind === 'Property') kind = monaco.languages.CompletionItemKind.Field;

              const priority = typeof item.priority === 'number' ? item.priority : 2;
              const sortPrefix = (isPrefixMatch ? '0' : '1') + priority + '_';
              const sortText = sortPrefix + item.label;

              suggestions.push({
                label: item.label,
                kind: kind,
                detail: item.detail || '',
                documentation: item.documentation || item.detail || item.label,
                insertText: item.insertText,
                filterText: item.label,
                sortText: sortText,
                insertTextRules: item.insertText && item.insertText.includes('${')
                  ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  : undefined,
                range: range
              });

              // Dedicated alias suggestion when acronym is defined and matches
              if (item.acronym && !isDotOrArrow) {
                const acronymMatches = currentWord.length === 0 || item.acronym.toLowerCase().startsWith(currentWord);
                if (acronymMatches) {
                  suggestions.push({
                    label: item.acronym,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    detail: `${item.label} (alias)`,
                    documentation: item.documentation || item.detail || item.label,
                    insertText: item.insertText,
                    filterText: item.acronym,
                    sortText: '0' + priority + '_' + item.acronym,
                    insertTextRules: item.insertText && item.insertText.includes('${')
                      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                      : undefined,
                    range: range
                  });
                }
              }
            });
          }

          // CP Snippets
          const cpSnippetsSource = (typeof CP_SNIPPETS !== 'undefined' ? CP_SNIPPETS : (window.CP_SNIPPETS || {}));
          const langSnippets = cpSnippetsSource[langKey] || [];

          if (!isDotOrArrow && !isScope && !isStreamContext && !isGlobalScope && Array.isArray(langSnippets)) {
            langSnippets.forEach(snip => {
              const prefixLower = snip.prefix.toLowerCase();
              const matchesPrefix = currentWord.length === 0 || prefixLower.startsWith(currentWord);
              if (!matchesPrefix) return;

              suggestions.push({
                label: snip.prefix,
                kind: monaco.languages.CompletionItemKind.Snippet,
                detail: `CP Snippet: ${snip.label}`,
                documentation: snip.body,
                insertText: snip.body,
                filterText: snip.prefix,
                sortText: '2_' + snip.prefix,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range
              });
            });
          }

          return { suggestions };
        }
      });
    });
  }

  // Initialize
  initMonaco();
})();
