// CodeSync Pro — In-Browser Monaco IDE Controller
'use strict';

(function () {
  let editor = null;
  let executor = null;
  let currentLanguage = 'cpp';
  let currentTheme = 'vs-dark';
  let activeProblem = null;
  let testcases = [];
  let isExecuting = false;
  let userCustomSnippets = [];
  let errorDecorations = [];
  let currentProblemCode = null;

  const $ = (id) => document.getElementById(id);

  // ── 1. Monaco Editor Initialization ─────────────────────────────────────────
  function initMonaco() {
    // Configure Monaco Environment for Chrome MV3 extension origin
    window.MonacoEnvironment = {
      getWorker: function (workerId, label) {
        let workerPath = 'lib/monaco/vs/assets/editor.worker-lj3bdIIn.js';
        if (label === 'json') workerPath = 'lib/monaco/vs/assets/json.worker-CoJx_OPf.js';
        else if (label === 'css' || label === 'scss' || label === 'less') workerPath = 'lib/monaco/vs/assets/css.worker-URu8fCFR.js';
        else if (label === 'html' || label === 'handlebars' || label === 'razor') workerPath = 'lib/monaco/vs/assets/html.worker-D1SL3iM8.js';
        else if (label === 'typescript' || label === 'javascript') workerPath = 'lib/monaco/vs/assets/ts.worker-BWKtMYOk.js';
        return new Worker(chrome.runtime.getURL(workerPath));
      }
    };

    require.config({ paths: { vs: 'lib/monaco/vs' } });

    require(['vs/editor/editor.main'], async function () {
      // Register custom VS Code themes
      if (typeof MONACO_THEMES !== 'undefined') {
        for (const [themeId, themeData] of Object.entries(MONACO_THEMES)) {
          monaco.editor.defineTheme(themeId, themeData);
        }
      }

      // Register CP Snippets & Full STL Completions
      registerSnippetsAndCompletions();
      registerFormatters();

      // Pre-load user preferences & custom default template before editor creation
      let initialFontSize = 14;
      try {
        const prefData = await chrome.storage.local.get([
          'defaultLanguage',
          'editorTheme',
          'editorFontSize',
          'customSnippets'
        ]).catch(() => ({}));

        if (prefData.customSnippets && Array.isArray(prefData.customSnippets)) {
          userCustomSnippets = prefData.customSnippets;
        }
        if (prefData.defaultLanguage) {
          currentLanguage = prefData.defaultLanguage;
          if ($('lang-select')) $('lang-select').value = currentLanguage;
          const cfg = EDITOR_LANGUAGES.find(l => l.id === currentLanguage) || EDITOR_LANGUAGES[0];
          if ($('lang-dropdown-label')) $('lang-dropdown-label').textContent = cfg.label;
        }
        if (prefData.editorTheme) {
          let themeVal = prefData.editorTheme;
          if (themeVal === 'vscode') themeVal = 'vs-dark';
          else if (themeVal === 'onedark') themeVal = 'one-dark-pro';
          else if (themeVal === 'github') themeVal = 'github-dark';
          currentTheme = themeVal;
          if ($('theme-select')) $('theme-select').value = currentTheme;
          const themeItem = THEME_LIST.find(t => t.id === currentTheme) || { label: currentTheme };
          if ($('theme-dropdown-label')) $('theme-dropdown-label').textContent = themeItem.label;
        }
        if (prefData.editorFontSize) {
          initialFontSize = prefData.editorFontSize;
        }
      } catch (e) {}

      const defaultLangConfig = EDITOR_LANGUAGES.find(l => l.id === currentLanguage) || EDITOR_LANGUAGES[0];
      const initialUserTemplate = await getUserDefaultTemplate(currentLanguage);
      const initialTemplateCode = initialUserTemplate.code || defaultLangConfig.defaultTemplate || '';

      // Create Monaco instance
      const container = $('editor-container');
      
      editor = monaco.editor.create(container, {
        value: initialTemplateCode,
        language: defaultLangConfig.monacoId || 'cpp',
        theme: currentTheme,
        fontSize: initialFontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
        fontLigatures: true,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        minimap: { enabled: true },
        glyphMargin: true,
        matchBrackets: 'never',
        bracketPairColorization: { enabled: false },
        guides: {
          bracketPairs: false,
          bracketPairsHorizontal: false,
          highlightActiveBracketPair: false,
          indentation: true
        },
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        formatOnPaste: false,
        formatOnType: false,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false
        },
        quickSuggestionsDelay: 10,
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: false,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        snippetSuggestions: 'top',
        suggest: {
          filterGraceful: true,
          localityBonus: true,
          shareSuggestSelections: true,
          showWords: true,
          showSnippets: true,
          showClasses: true,
          showFunctions: true,
          showMethods: true,
          showKeywords: true,
          showVariables: true,
          showModules: true,
          showFiles: true
        },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on'
      });

      // Cursor position updates
      editor.onDidChangeCursorPosition(e => {
        const pos = e.position;
        $('editor-cursor-pos').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });

      // Dirty dot & auto-save to storage
      editor.onDidChangeModelContent(() => {
        $('file-dirty-dot').classList.add('active');
        saveEditorDraft();
      });

      // Keyboard Shortcuts
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
        compileSolution();
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        submitSolution();
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
        runAllTestcases();
      });

      // Ctrl+Space to manually trigger Monaco autocomplete suggestions
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      });

      loadEditorDraft();
      loadUserPreferences();
    });
  }

  // ── 2. Register CP Snippets & STL Completions ────────────────────────────────
  function registerSnippetsAndCompletions() {
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
      { name: 'deque', desc: 'Double-ended queue sequence container std::deque' },
      { name: 'numeric', desc: 'Generalized numeric operations (accumulate, iota, gcd, lcm)' },
      { name: 'iomanip', desc: 'Input/output stream formatting manipulators (setprecision, fixed)' },
      { name: 'sstream', desc: 'String stream classes (stringstream)' },
      { name: 'climits', desc: 'C-style integral limits constants (INT_MAX, LLONG_MAX)' },
      { name: 'cassert', desc: 'Diagnostics assert macro' },
      { name: 'cstring', desc: 'C-style byte string handling (memset, memcpy, strlen)' },
      { name: 'random', desc: 'Random number generators and distributions (mt19937)' },
      { name: 'chrono', desc: 'Date and time utilities and clocks' },
      { name: 'tuple', desc: 'Fixed-size collection of heterogeneous values std::tuple' },
      { name: 'bitset', desc: 'Fixed-size sequence of N bits std::bitset' },
      { name: 'utility', desc: 'Various utility components (std::pair, std::move)' },
      { name: 'functional', desc: 'Function objects, hashes, and binders (std::greater)' },
      { name: 'ext/pb_ds/assoc_container.hpp', desc: 'Policy Based Data Structures (pb_ds)' },
      { name: 'ext/pb_ds/tree_policy.hpp', desc: 'PBDS tree policy for order statistics tree' }
    ];

    // Helper: calculate brace depth up to position (to distinguish global scope vs inside function)
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

    // Helper: extract user-defined identifiers & variables from active document
    function extractDocumentVariables(model, langKey) {
      if (!model) return [];
      const text = model.getValue();
      const vars = new Set();
      const reserved = new Set([
        // C/C++ keywords & common tokens
        'main', 'solve', 'if', 'else', 'for', 'while', 'do', 'return', 'int', 'long', 'double', 'float',
        'char', 'bool', 'void', 'auto', 'const', 'constexpr', 'static', 'inline', 'struct', 'class',
        'public', 'private', 'protected', 'virtual', 'override', 'typename', 'template', 'typedef',
        'using', 'namespace', 'std', 'cin', 'cout', 'cerr', 'endl', 'include', 'iostream', 'vector',
        'pair', 'tuple', 'map', 'set', 'unordered_map', 'unordered_set', 'queue', 'stack', 'priority_queue',
        'string', 'size_t', 'int32_t', 'int64_t', 'uint32_t', 'uint64_t', 'nullptr', 'true', 'false',
        'sizeof', 'decltype', 'sort', 'reverse', 'max', 'min', 'swap', 'all', 'sz', 'pb', 'mp',
        'bits', 'stdc', 'h',
        // Java
        'System', 'out', 'println', 'print', 'Scanner', 'String', 'Integer', 'Double', 'Boolean',
        'ArrayList', 'HashMap', 'HashSet', 'Arrays', 'Collections', 'Math',
        // Python
        'def', 'class', 'import', 'from', 'as', 'in', 'is', 'not', 'and', 'or', 'lambda', 'pass',
        'None', 'True', 'False', 'len', 'range', 'print', 'input', 'list', 'dict', 'set', 'str',
        // Rust / Go / JS
        'let', 'mut', 'fn', 'pub', 'use', 'mod', 'impl', 'package', 'func', 'var', 'const',
        'function', 'console', 'log'
      ]);

      const cleanText = text.replace(/^\s*#\s*include.*$/gm, '').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

      // 1. C/C++/Java/C# style declarations: (type) (name1, name2, name3);
      const declRegex = /(?:int|long(?:\s+long)?|double|float|char|bool|string|auto|size_t|int32_t|int64_t|vector<[^>]+>|pair<[^>]+>|map<[^>]+>|set<[^>]+>|queue<[^>]+>|stack<[^>]+>)\s+([^;(){}=]+?)(?:;|=|\()/g;
      let match;
      while ((match = declRegex.exec(cleanText)) !== null) {
        if (match[0].endsWith('(')) continue; // Function declaration
        const names = match[1].split(',');
        for (let raw of names) {
          let clean = raw.trim().replace(/^[*&]/, '').split('[')[0].split('(')[0].trim();
          if (clean && /^[a-zA-Z_]\w*$/.test(clean) && !reserved.has(clean) && clean.length > 0) {
            vars.add(clean);
          }
        }
      }

      // 2. Loop variables: for (int i = 0; ...)
      const forRegex = /for\s*\(\s*(?:int|auto|long(?:\s+long)?|size_t)\s+([a-zA-Z_]\w*)/g;
      while ((match = forRegex.exec(cleanText)) !== null) {
        if (!reserved.has(match[1])) vars.add(match[1].trim());
      }

      // 3. Python variable assignment: x = ...
      const pyAssignRegex = /^\s*([a-zA-Z_]\w*)\s*=(?!=)/gm;
      while ((match = pyAssignRegex.exec(cleanText)) !== null) {
        if (!reserved.has(match[1])) vars.add(match[1].trim());
      }

      // 4. Function parameters in signatures: (int n, int m)
      const paramRegex = /\(([^)]+)\)/g;
      let pMatch;
      while ((pMatch = paramRegex.exec(cleanText)) !== null) {
        const parts = pMatch[1].split(',');
        for (let part of parts) {
          const tokens = part.trim().split(/\s+/);
          if (tokens.length >= 2) {
            const pName = tokens[tokens.length - 1].replace(/^[*&]/, '').trim();
            if (pName && /^[a-zA-Z_]\w*$/.test(pName) && !reserved.has(pName)) {
              vars.add(pName);
            }
          }
        }
      }

      return Array.from(vars);
    }

    // Register completion providers for all supported languages
    const ALL_LANGUAGES = ['cpp', 'c', 'python', 'java', 'rust', 'go', 'javascript', 'csharp', 'kotlin'];

    ALL_LANGUAGES.forEach(langKey => {
      monaco.languages.registerCompletionItemProvider(langKey, {
        triggerCharacters: ['.', ':', '<', '>', '/', '#'],
        provideCompletionItems: function (model, position) {
          try {
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
              if (incDirectiveMatch && calculateBraceDepth(model, position) === 0) {
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
                  { label: '#include <string>', insert: '#include <string>\n', detail: 'std::string' },
                  { label: '#include <cmath>', insert: '#include <cmath>\n', detail: 'Math library' },
                  { label: '#include <map>', insert: '#include <map>\n', detail: 'std::map' },
                  { label: '#include <set>', insert: '#include <set>\n', detail: 'std::set' },
                  { label: '#include <queue>', insert: '#include <queue>\n', detail: 'std::queue & priority_queue' }
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
            const isInputStream = />>\s*\w*$/.test(lineUntilPos);
            const isOutputStream = /<<\s*\w*$/.test(lineUntilPos);
            const isPreprocessor = /^\s*#\s*\w*$/.test(lineUntilPos);

            const braceDepth = (langKey !== 'python') ? calculateBraceDepth(model, position) : 1;
            const isGlobalScope = braceDepth === 0;

            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: Math.max(word.endColumn, position.column)
            };

            // ── Case B: Stream Input (cin >> ) ──
            // ONLY suggest declared variables. NEVER suggest types (long long, pair) or statements.
            if (isInputStream) {
              const userVars = extractDocumentVariables(model, langKey);
              userVars.forEach(v => {
                if (currentWord && !v.toLowerCase().startsWith(currentWord)) return;
                suggestions.push({
                  label: v,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  detail: 'Variable (input destination)',
                  documentation: `Read into variable ${v}`,
                  insertText: v,
                  filterText: v,
                  sortText: '00_' + v,
                  range: range
                });
              });
              return { suggestions };
            }

            // ── Case C: Stream Output (cout << ) ──
            // Suggest variables, endl, and "\n". NEVER suggest types (long long, pair) or statements.
            if (isOutputStream) {
              const userVars = extractDocumentVariables(model, langKey);
              userVars.forEach(v => {
                if (currentWord && !v.toLowerCase().startsWith(currentWord)) return;
                suggestions.push({
                  label: v,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  detail: 'Variable (output)',
                  documentation: `Output variable ${v}`,
                  insertText: v,
                  filterText: v,
                  sortText: '00_' + v,
                  range: range
                });
              });
              if (!currentWord || 'endl'.startsWith(currentWord)) {
                suggestions.push({
                  label: 'endl',
                  kind: monaco.languages.CompletionItemKind.Variable,
                  detail: 'std::endl newline & flush',
                  documentation: 'Inserts a newline character and flushes output stream',
                  insertText: 'endl',
                  filterText: 'endl',
                  sortText: '01_endl',
                  range: range
                });
              }
              if (!currentWord || '\\n'.startsWith(currentWord) || '"\\n"'.startsWith(currentWord)) {
                suggestions.push({
                  label: '"\\n"',
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  detail: 'Fast newline string "\\n"',
                  insertText: '"\\n"',
                  filterText: '\\n',
                  sortText: '02_newline',
                  range: range
                });
              }
              return { suggestions };
            }

            // ── Case D: User Variables in General Code (Inside Functions) ──
            if (!isDotOrArrow && !isPreprocessor && currentWord.length > 0) {
              const userVars = extractDocumentVariables(model, langKey);
              userVars.forEach(v => {
                if (!v.toLowerCase().startsWith(currentWord)) return;
                suggestions.push({
                  label: v,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  detail: 'Local variable / identifier',
                  documentation: `User-defined identifier: ${v}`,
                  insertText: v,
                  filterText: v,
                  sortText: '00_' + v,
                  range: range
                });
              });
            }

            // ── Case E: Language Dictionary Keywords, Types & Methods ──
            const dictMap = (typeof LANGUAGE_DICT_MAP !== 'undefined' ? LANGUAGE_DICT_MAP : (window.LANGUAGE_DICT_MAP || {}));
            const dict = dictMap[langKey] || dictMap.cpp || [];

            if (Array.isArray(dict)) {
              dict.forEach(item => {
                // Context Rules:
                // 1. Member methods (.insert(), .push_back()) ONLY show when typing after . or ->
                if (item.isMemberOnly && !isDotOrArrow) return;
                // 2. When typing after . or ->, DO NOT show keywords/statements/types (no 'int' after 'obj.')
                if (isDotOrArrow && !item.isMemberOnly) return;
                // 3. At global scope (outside functions), hide statements (cin, cout, for, while, return)
                if (isGlobalScope && item.isStatement) return;
                // 4. Preprocessor directives only when typing #
                if (isPreprocessor && !item.label.startsWith('#')) return;

                // Matching Algorithm:
                // - Prefix match on label: item.label starts with currentWord
                // - Acronym match: item.acronym starts with currentWord (e.g. 'vi' for vector<int>, 'pb' for push_back)
                let isMatch = false;
                let isPrefixMatch = false;

                if (currentWord.length === 0) {
                  // Only allow empty prefix if explicit trigger context (. or -> or # or ::)
                  if (isDotOrArrow || isPreprocessor || isScope) {
                    isMatch = true;
                  }
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
                const filterText = item.acronym ? `${item.label} ${item.acronym}` : item.label;

                suggestions.push({
                  label: item.label,
                  kind: kind,
                  detail: item.detail || '',
                  documentation: item.documentation || item.detail || item.label,
                  insertText: item.insertText,
                  filterText: filterText,
                  sortText: sortText,
                  insertTextRules: item.insertText && item.insertText.includes('${')
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : undefined,
                  range: range
                });

                // Dedicated alias suggestion when acronym is defined and matches
                if (item.acronym && currentWord.length > 0) {
                  if (item.acronym.toLowerCase().startsWith(currentWord)) {
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

            // ── Case F: CP Snippets ──
            const cpSnippetsSource = (typeof CP_SNIPPETS !== 'undefined' ? CP_SNIPPETS : (window.CP_SNIPPETS || {}));
            const langSnippets = cpSnippetsSource[langKey] || [];

            if (!isDotOrArrow && !isScope && !isGlobalScope && Array.isArray(langSnippets) && currentWord.length > 0) {
              langSnippets.forEach(snip => {
                const prefixLower = snip.prefix.toLowerCase();
                const matchesPrefix = prefixLower.startsWith(currentWord);
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

            // ── Case G: User Custom Snippets ──
            if (!isDotOrArrow && !isScope && Array.isArray(userCustomSnippets) && currentWord.length > 0) {
              userCustomSnippets.forEach(snip => {
                if (snip.language && snip.language !== langKey && snip.language !== 'all') return;
                const prefixLower = (snip.prefix || '').toLowerCase();
                const matchesPrefix = prefixLower.startsWith(currentWord);
                if (!matchesPrefix) return;

                suggestions.push({
                  label: snip.prefix,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  detail: `User Snippet: ${snip.name || snip.label}`,
                  documentation: snip.code || snip.body,
                  insertText: snip.code || snip.body,
                  filterText: snip.prefix,
                  sortText: '3_' + snip.prefix,
                  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  range: range
                });
              });
            }

            return { suggestions };
          } catch (e) {
            console.error('[CodeSync IntelliSense Error]:', e);
            return { suggestions: [] };
          }
        }
      });
    });
  }

  // ── Code Formatters (C++, Python, Java) ──────────────────────────────────────
  function formatCppCode(code) {
    if (!code) return code;
    const lines = code.split('\n');
    let currentIndent = 0;
    const indentStr = '    ';
    const formatted = [];
    let inBlockComment = false;
    let prevEmpty = false;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // 1. Multi-line block comments (/* ... */)
      // PRESERVE ASCII ART AND BANNER SPACING EXACTLY!
      if (inBlockComment) {
        formatted.push(rawLine);
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/') || (trimmed.indexOf('*/') !== trimmed.length - 2)) {
          // Multi-line block comment opening
          inBlockComment = !trimmed.includes('*/');
          formatted.push(rawLine);
          continue;
        } else {
          // Single-line block comment e.g. /* comment */
          formatted.push(`${indentStr.repeat(currentIndent)}${trimmed}`);
          continue;
        }
      }

      // 2. Empty lines: keep at most one empty line in a row
      if (!trimmed) {
        if (!prevEmpty && formatted.length > 0) {
          formatted.push('');
          prevEmpty = true;
        }
        continue;
      }
      prevEmpty = false;

      // 3. Preprocessor directives (#include, #define, #pragma) - column 0
      if (trimmed.startsWith('#')) {
        formatted.push(trimmed);
        continue;
      }

      // 4. Line comments (pure // line) - keep text intact
      if (trimmed.startsWith('//')) {
        formatted.push(`${indentStr.repeat(currentIndent)}${trimmed}`);
        continue;
      }

      // 5. Separate trailing comment if any
      let codePart = trimmed;
      let commentPart = '';
      let inStr = false;
      let inCh = false;
      let splitIdx = -1;
      for (let c = 0; c < trimmed.length - 1; c++) {
        const ch = trimmed[c];
        if (ch === '"' && (c === 0 || trimmed[c - 1] !== '\\')) inStr = !inStr;
        else if (ch === "'" && (c === 0 || trimmed[c - 1] !== '\\')) inCh = !inCh;
        else if (!inStr && !inCh && ch === '/' && trimmed[c + 1] === '/') {
          splitIdx = c;
          break;
        }
      }
      if (splitIdx !== -1) {
        codePart = trimmed.slice(0, splitIdx).trimEnd();
        commentPart = ' ' + trimmed.slice(splitIdx).trim();
      }

      // 6. Protect string and char literals from operator spacing/regex modifications
      const strings = [];
      let cleanCode = '';
      inStr = false;
      inCh = false;
      let strStart = -1;
      for (let c = 0; c < codePart.length; c++) {
        const ch = codePart[c];
        if (ch === '"' && (c === 0 || codePart[c - 1] !== '\\')) {
          if (!inStr) {
            inStr = true;
            strStart = c;
          } else {
            inStr = false;
            const s = codePart.slice(strStart, c + 1);
            const ph = `__CS_STR_${strings.length}__`;
            strings.push(s);
            cleanCode += ph;
            strStart = -1;
          }
        } else if (ch === "'" && (c === 0 || codePart[c - 1] !== '\\') && !inStr) {
          if (!inCh) {
            inCh = true;
            strStart = c;
          } else {
            inCh = false;
            const s = codePart.slice(strStart, c + 1);
            const ph = `__CS_STR_${strings.length}__`;
            strings.push(s);
            cleanCode += ph;
            strStart = -1;
          }
        } else if (!inStr && !inCh) {
          cleanCode += ch;
        }
      }
      if (strStart !== -1) {
        cleanCode += codePart.slice(strStart);
      }

      // 7. Count braces in cleanCode (strictly outside strings & comments)
      let openBraces = 0;
      let closeBraces = 0;
      for (let c = 0; c < cleanCode.length; c++) {
        if (cleanCode[c] === '{') openBraces++;
        else if (cleanCode[c] === '}') closeBraces++;
      }

      // Leading closing braces (e.g. "}", "} else {", "}},", "};")
      const leadingCloseMatch = cleanCode.match(/^(\}+)/);
      const leadingCloses = leadingCloseMatch ? leadingCloseMatch[1].length : 0;

      // 8. Clean operator spacing (outside strings)
      // Only format operators if not a typedef or tabular line with intentional extra spaces
      const isTabular = /^(typedef|const\s|using\s|#define)\b/.test(cleanCode) && /\s{2,}/.test(cleanCode);
      if (!isTabular) {
        cleanCode = cleanCode
          .replace(/\s*([+\-*%&|^]?=)\s*/g, ' $1 ')
          .replace(/\s*(==|!=|<=|>=)\s*/g, ' $1 ')
          .replace(/\s*(&&|\|\|)\s*/g, ' $1 ')
          .replace(/\s*(<<|>>)\s*/g, ' $1 ')
          .replace(/\s*,\s*/g, ', ')
          .replace(/\s*;\s*/g, '; ')
          .replace(/;\s*$/, ';')
          .replace(/\(\s+/g, '(')
          .replace(/\s+\)/g, ')')
          .replace(/\s*\{\s*$/, ' {')
          .trim();

        // Fix accidental double-operator spacing (e.g. < < or > > or = =)
        cleanCode = cleanCode.replace(/([<>!=]=?)\s+([<>!=]=?)/g, '$1$2');
      } else {
        // Just ensure clean trailing brace
        cleanCode = cleanCode.replace(/\s*\{\s*$/, ' {').trim();
      }

      // Restore protected string/char literals
      for (let s = 0; s < strings.length; s++) {
        cleanCode = cleanCode.replace(`__CS_STR_${s}__`, strings[s]);
      }

      const finalLine = cleanCode + commentPart;

      // 9. Calculate line indentation
      // If the line starts with closing brace(s), indent at (currentIndent - leadingCloses)
      let lineIndent = Math.max(0, currentIndent - leadingCloses);
      if (/^(public|private|protected|case\s+[^:]+|default):/.test(cleanCode)) {
        lineIndent = Math.max(0, currentIndent - 1);
      }

      formatted.push(`${indentStr.repeat(lineIndent)}${finalLine}`);

      // 10. Update currentIndent for the subsequent lines
      currentIndent = Math.max(0, currentIndent + openBraces - closeBraces);
    }

    return formatted.join('\n');
  }

  function formatPythonCode(code) {
    if (!code) return code;
    const lines = code.split('\n');
    const formatted = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (!line.trim()) {
        if (formatted.length > 0 && formatted[formatted.length - 1] !== '') {
          formatted.push('');
        }
        continue;
      }
      formatted.push(line);
    }
    return formatted.join('\n');
  }

  function registerFormatters() {
    const cppLangs = ['cpp', 'c', 'java', 'rust', 'go', 'javascript', 'kotlin', 'csharp'];
    cppLangs.forEach(lang => {
      monaco.languages.registerDocumentFormattingEditProvider(lang, {
        provideDocumentFormattingEdits: function (model) {
          const fullRange = model.getFullModelRange();
          const formatted = formatCppCode(model.getValue());
          return [{ range: fullRange, text: formatted }];
        }
      });
    });

    monaco.languages.registerDocumentFormattingEditProvider('python', {
      provideDocumentFormattingEdits: function (model) {
        const fullRange = model.getFullModelRange();
        const formatted = formatPythonCode(model.getValue());
        return [{ range: fullRange, text: formatted }];
      }
    });
  }

  // ── 3. Template Resolution & Draft Persistence ──────────────────────────────
  function isGenericDefaultTemplate(code) {
    if (!code || !code.trim()) return true;
    const clean = code.trim().replace(/\r\n/g, '\n');

    // 1. Old hardcoded default template
    const oldHardcoded = `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    \n    return 0;\n}`.trim();
    if (clean === oldHardcoded) return true;

    // 2. All built-in EDITOR_LANGUAGES default templates
    if (typeof EDITOR_LANGUAGES !== 'undefined') {
      for (const l of EDITOR_LANGUAGES) {
        if ((l.defaultTemplate || '').trim().replace(/\r\n/g, '\n') === clean) return true;
      }
    }

    // 3. All built-in CP_TEMPLATES
    if (typeof CP_TEMPLATES !== 'undefined') {
      for (const t of CP_TEMPLATES) {
        if ((t.code || '').trim().replace(/\r\n/g, '\n') === clean) return true;
      }
    }

    return false;
  }

  async function getUserDefaultTemplate(targetLangId) {
    try {
      const stored = await chrome.storage.local.get([
        'defaultTemplateId',
        'defaultTemplateCode',
        'defaultTemplateLang',
        'customTemplates'
      ]);

      const customTemplates = stored.customTemplates || [];
      const allTemplates = [
        ...(typeof CP_TEMPLATES !== 'undefined' ? CP_TEMPLATES : []),
        ...customTemplates
      ];

      const targetLang = (targetLangId || currentLanguage || 'cpp').toLowerCase();

      // 1. If user set an explicit default template in Settings or IDE modal
      if (stored.defaultTemplateId) {
        const found = allTemplates.find(t => t.id === stored.defaultTemplateId || t.name === stored.defaultTemplateId);
        if (found && found.code && found.code.trim()) {
          const tplLang = (found.language || 'cpp').toLowerCase();
          const matches = (!targetLangId) ||
                          (targetLang === tplLang) ||
                          (targetLang.startsWith('cpp') && tplLang === 'cpp') ||
                          (targetLang.startsWith('python') && tplLang === 'python') ||
                          (targetLang.startsWith('java') && tplLang === 'java') ||
                          (targetLang.startsWith('js') && tplLang === 'javascript');
          if (matches) {
            return {
              id: found.id,
              name: found.name,
              language: found.language || 'cpp',
              code: found.code
            };
          }
        }
      }

      // 2. Check if defaultTemplateCode is present in storage
      if (stored.defaultTemplateCode && stored.defaultTemplateCode.trim()) {
        const tplLang = (stored.defaultTemplateLang || 'cpp').toLowerCase();
        if (!targetLangId || targetLang === tplLang || (targetLang.startsWith('cpp') && tplLang === 'cpp')) {
          return {
            id: stored.defaultTemplateId || 'custom',
            name: 'Custom Default Template',
            language: stored.defaultTemplateLang || 'cpp',
            code: stored.defaultTemplateCode
          };
        }
      }

      // 3. Check custom templates for this language
      const customForLang = customTemplates.find(t => {
        const tl = (t.language || '').toLowerCase();
        return tl === targetLang || (targetLang.startsWith('cpp') && tl === 'cpp');
      });
      if (customForLang && customForLang.code) {
        return {
          id: customForLang.id,
          name: customForLang.name,
          language: customForLang.language,
          code: customForLang.code
        };
      }

      // 4. Built-in template for CP (mini_cpp)
      if (!targetLangId || targetLang.startsWith('cpp')) {
        const mini = (typeof CP_TEMPLATES !== 'undefined' ? CP_TEMPLATES : []).find(t => t.id === 'mini_cpp');
        if (mini && mini.code) {
          return { id: 'mini_cpp', name: mini.name, language: 'cpp', code: mini.code };
        }
      }

      // 5. Fallback from EDITOR_LANGUAGES
      const langConfig = EDITOR_LANGUAGES.find(l => l.id === (targetLangId || currentLanguage)) || EDITOR_LANGUAGES[0];
      return {
        id: langConfig.id,
        name: langConfig.label,
        language: langConfig.id,
        code: langConfig.defaultTemplate || ''
      };
    } catch (e) {
      console.warn('getUserDefaultTemplate error:', e);
      return { id: 'fallback', name: 'Default', language: 'cpp', code: '' };
    }
  }

  async function loadUserPreferences() {
    try {
      const data = await chrome.storage.local.get(['editorTheme', 'editorFontSize', 'defaultLanguage', 'customSnippets']);
      if (data.customSnippets && Array.isArray(data.customSnippets)) {
        userCustomSnippets = data.customSnippets;
      }
      if (data.editorTheme) {
        let themeVal = data.editorTheme;
        if (themeVal === 'vscode') themeVal = 'vs-dark';
        else if (themeVal === 'onedark') themeVal = 'one-dark-pro';
        else if (themeVal === 'github') themeVal = 'github-dark';
        setTheme(themeVal);
      }
      if (data.defaultLanguage && !activeProblem) {
        await setLanguage(data.defaultLanguage);
      }
      if (data.editorFontSize && editor) {
        editor.updateOptions({ fontSize: data.editorFontSize });
      }
    } catch (e) {
      console.warn('Failed to load user preferences:', e);
    }
  }

  function saveEditorDraft() {
    if (!editor) return;
    const code = editor.getValue();
    const key = activeProblem ? `draft_${activeProblem.platform}_${activeProblem.slug}` : 'draft_scratchpad';
    chrome.storage.local.set({ [key]: code });
  }

  async function loadEditorDraft() {
    if (!editor) return;
    const key = activeProblem ? `draft_${activeProblem.platform}_${activeProblem.slug}` : 'draft_scratchpad';
    const data = await chrome.storage.local.get([key, 'defaultTemplateId', 'customTemplates']);
    const savedDraft = data[key];

    if (savedDraft && savedDraft.trim()) {
      // If we are on standalone scratchpad, check if the saved draft is just a generic built-in template
      if (!activeProblem && isGenericDefaultTemplate(savedDraft)) {
        const userTpl = await getUserDefaultTemplate(currentLanguage);
        if (userTpl && userTpl.code && userTpl.code.trim() !== savedDraft.trim()) {
          editor.setValue(userTpl.code);
          $('file-dirty-dot').classList.remove('active');
          return;
        }
      }
      editor.setValue(savedDraft);
      $('file-dirty-dot').classList.remove('active');
    } else {
      // No saved draft exists! Load user's active default template!
      const userTpl = await getUserDefaultTemplate(currentLanguage);
      if (userTpl && userTpl.code) {
        editor.setValue(userTpl.code);
        $('file-dirty-dot').classList.remove('active');
      }
    }
  }

  // ── 4. Language & Theme Handlers ────────────────────────────────────────────
  const THEME_LIST = [
    { id: 'vs-dark', label: 'VS Code Dark' },
    { id: 'vs', label: 'VS Code Light' },
    { id: 'dracula', label: 'Dracula' },
    { id: 'one-dark-pro', label: 'One Dark Pro' },
    { id: 'github-dark', label: 'GitHub Dark' },
    { id: 'monokai', label: 'Monokai' },
    { id: 'catppuccin', label: 'Catppuccin Mocha' }
  ];

  async function setLanguage(langId) {
    currentLanguage = langId;
    if ($('lang-select')) $('lang-select').value = langId;
    const langConfig = EDITOR_LANGUAGES.find(l => l.id === langId) || EDITOR_LANGUAGES[0];

    if ($('lang-dropdown-label')) $('lang-dropdown-label').textContent = langConfig.label;
    const langMenu = $('lang-dropdown-menu');
    if (langMenu) {
      langMenu.querySelectorAll('.dropdown-item').forEach(item => {
        if (item.dataset.value === langId) item.classList.add('active');
        else item.classList.remove('active');
      });
    }

    if (editor) {
      const model = editor.getModel();
      monaco.editor.setModelLanguage(model, langConfig.monacoId || 'cpp');
      const currentCode = editor.getValue().trim();
      const isDefault = isGenericDefaultTemplate(currentCode);
      if (isDefault) {
        const tpl = await getUserDefaultTemplate(langId);
        editor.setValue(tpl.code || langConfig.defaultTemplate || '');
      }
    }

    // Update tab name
    const ext = LANG_EXT_MAP[langId] || langId;
    if ($('file-tab-name')) $('file-tab-name').textContent = `solution.${ext}`;
  }

  function setTheme(themeId, saveToStorage = true) {
    currentTheme = themeId;
    if ($('theme-select')) $('theme-select').value = themeId;
    const themeItem = THEME_LIST.find(t => t.id === themeId) || { label: themeId };
    if ($('theme-dropdown-label')) $('theme-dropdown-label').textContent = themeItem.label;
    const themeMenu = $('theme-dropdown-menu');
    if (themeMenu) {
      themeMenu.querySelectorAll('.dropdown-item').forEach(item => {
        if (item.dataset.value === themeId) item.classList.add('active');
        else item.classList.remove('active');
      });
    }
    if (editor) monaco.editor.setTheme(currentTheme);
    if (saveToStorage) {
      chrome.storage.local.set({ editorTheme: currentTheme });
    }
  }

  // ── Sound Notification System in IDE ──
  let soundEnabled = true;
  chrome.storage.local.get('soundEnabled', (data) => {
    soundEnabled = data.soundEnabled !== false;
    updateSoundUI(soundEnabled);
  });

  function updateSoundUI(enabled) {
    soundEnabled = enabled;
    const icon = $('sound-icon');
    if (icon) icon.textContent = enabled ? '🔔' : '🔕';
    const btn = $('sound-toggle-btn');
    if (btn) btn.title = enabled ? 'Sound: Enabled (Click to mute)' : 'Sound: Muted (Click to enable)';
  }

  if ($('sound-toggle-btn')) {
    $('sound-toggle-btn').addEventListener('click', async () => {
      soundEnabled = !soundEnabled;
      await chrome.storage.local.set({ soundEnabled });
      updateSoundUI(soundEnabled);
    });
  }

  // ── Bidirectional Theme & Sound Sync from Settings / Popup ──
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.editorTheme && changes.editorTheme.newValue) {
      let newTheme = changes.editorTheme.newValue;
      if (newTheme === 'vs-light') newTheme = 'vs';
      if (newTheme !== currentTheme) {
        setTheme(newTheme, false);
      }
    }
    if (changes.soundEnabled !== undefined) {
      updateSoundUI(changes.soundEnabled.newValue !== false);
    }
  });

  function setupCustomDropdowns() {
    // 1. Language Dropdown
    const langMenu = $('lang-dropdown-menu');
    if (langMenu) {
      langMenu.innerHTML = '';
      EDITOR_LANGUAGES.forEach(lang => {
        const item = document.createElement('div');
        item.className = 'dropdown-item' + (lang.id === currentLanguage ? ' active' : '');
        item.dataset.value = lang.id;
        item.innerHTML = `<span>${lang.label}</span><span class="item-check">✓</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setLanguage(lang.id);
          const dd = $('lang-custom-dropdown');
          if (dd) dd.classList.remove('open');
          const btn = $('lang-dropdown-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        langMenu.appendChild(item);
      });
    }

    const langBtn = $('lang-dropdown-btn');
    if (langBtn) {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = $('lang-custom-dropdown');
        const isOpen = dd.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) {
          dd.classList.add('open');
          langBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    // 2. Theme Dropdown
    const themeMenu = $('theme-dropdown-menu');
    if (themeMenu) {
      themeMenu.innerHTML = '';
      THEME_LIST.forEach(theme => {
        const item = document.createElement('div');
        item.className = 'dropdown-item' + (theme.id === currentTheme ? ' active' : '');
        item.dataset.value = theme.id;
        item.innerHTML = `<span>${theme.label}</span><span class="item-check">✓</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setTheme(theme.id);
          const dd = $('theme-custom-dropdown');
          if (dd) dd.classList.remove('open');
          const btn = $('theme-dropdown-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        themeMenu.appendChild(item);
      });
    }

    const themeBtn = $('theme-dropdown-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = $('theme-custom-dropdown');
        const isOpen = dd.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) {
          dd.classList.add('open');
          themeBtn.setAttribute('aria-expanded', 'true');
        }
      });
    }

    function closeAllDropdowns() {
      document.querySelectorAll('.custom-dropdown').forEach(d => {
        d.classList.remove('open');
        const b = d.querySelector('.custom-dropdown-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }

    document.addEventListener('click', () => closeAllDropdowns());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllDropdowns();
    });

    if ($('lang-select')) $('lang-select').addEventListener('change', (e) => setLanguage(e.target.value));
    if ($('theme-select')) $('theme-select').addEventListener('change', (e) => setTheme(e.target.value));
  }

  $('format-code-btn').addEventListener('click', () => {
    if (!editor) return;
    const model = editor.getModel();
    const lang = currentLanguage || 'cpp';
    const original = model.getValue();
    const formatted = (lang.startsWith('py') ? formatPythonCode(original) : formatCppCode(original));
    if (formatted && formatted !== original) {
      editor.executeEdits('formatter', [{
        range: model.getFullModelRange(),
        text: formatted
      }]);
    }
    const btn = $('format-code-btn');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<span>✓ Formatted</span>';
    btn.style.borderColor = 'var(--green)';
    setTimeout(() => {
      btn.innerHTML = oldHtml;
      btn.style.borderColor = '';
    }, 1200);
  });

  // ── 5. Problem Detection Bridge ─────────────────────────────────────────────
  async function detectProblemFromActiveTab() {
    setVerdict('Detecting active problem...', 'running');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && isCpUrl(tab.url)) {
        await queryTabForProblem(tab);
        return;
      }

      // Query tabs across all windows
      const allTabs = await chrome.tabs.query({});

      // If we already have an activeProblem loaded in IDE, check if its tab is open
      if (activeProblem && activeProblem.url) {
        const cleanProbUrl = activeProblem.url.split('?')[0].split('#')[0].replace(/\/$/, '');
        const currentTab = allTabs.find(t => t.url && t.url.split('?')[0].split('#')[0].replace(/\/$/, '') === cleanProbUrl);
        if (currentTab) {
          await queryTabForProblem(currentTab);
          setVerdict('Ready', 'idle');
          showToast(`Refreshed ${activeProblem.title || 'problem'}`, 'success');
          return;
        }
      }

      // Find any open CP problem tab
      const match = allTabs.find(t => isCpUrl(t.url));
      if (match) {
        await queryTabForProblem(match);
        setVerdict('Ready', 'idle');
        showToast(`Loaded ${activeProblem ? activeProblem.title : 'problem'}`, 'success');
      } else if (activeProblem) {
        // Keep currently loaded problem rather than wiping everything
        setVerdict('Ready', 'idle');
        showToast('Problem is already loaded.', 'info');
      } else {
        resetToScratchpad();
        setVerdict('No problem tab open', 'idle');
        showToast('No active problem tab open in browser. Switched to Scratchpad.', 'info');
      }
    } catch (e) {
      console.warn('Error detecting problem:', e);
      setVerdict('Detection error', 'idle');
    }
  }

  function isCpUrl(url) {
    if (!url) return false;
    if (url.includes('standing') || url.includes('dashboard') || url.includes('announcement')) {
      return false;
    }
    return (url.includes('codeforces.com/') && (url.includes('/problem') || url.includes('/contest/') || url.includes('/gym/'))) ||
           (url.includes('mirror.codeforces.com/') && (url.includes('/problem') || url.includes('/contest/') || url.includes('/gym/'))) ||
           url.includes('atcoder.jp/contests/') ||
           url.includes('cses.fi/problemset/task/');
  }

  async function queryTabForProblem(tab) {
    if (!tab || !tab.url || !isCpUrl(tab.url)) return;
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROBLEM_DATA' }).catch(() => null);
      if (resp && resp.ok && resp.data && resp.data.platform !== 'LC' && resp.data.platform !== 'TP') {
        await loadProblemData(resp.data);
      } else {
        // Construct from URL fallback
        await loadProblemFromUrl(tab.url, tab.title);
      }
    } catch (e) {
      await loadProblemFromUrl(tab.url, tab.title);
    }
  }

  async function loadProblemFromUrl(url, tabTitle) {
    let platform = 'LOCAL';
    let slug = 'problem';
    if (url.includes('codeforces.com') || url.includes('mirror.codeforces.com')) {
      platform = 'CF';
      const m = url.match(/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/) || url.match(/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/);
      if (m) slug = `${m[1]}_${m[2]}`;
    } else if (url.includes('atcoder.jp')) {
      platform = 'AC';
      const m = url.match(/tasks\/([a-zA-Z0-9_-]+)/);
      if (m) slug = m[1];
    } else if (url.includes('cses.fi')) {
      platform = 'CSES';
      const m = url.match(/task\/(\d+)/);
      if (m) slug = m[1];
    } else {
      return;
    }

    await loadProblemData({
      platform,
      title: tabTitle || 'Active Problem',
      url: url,
      slug: slug,
      limits: { timeLimit: '1.00 s', memoryLimit: '512 MB' },
      samples: [],
      statement: ''
    });
  }

  function parsePreText(preEl, ownerDoc) {
    if (!preEl) return '';
    const d = ownerDoc || (preEl.ownerDocument || document);

    // 1. Check for Codeforces .test-example-line elements (modern Codeforces)
    const lines = preEl.querySelectorAll('.test-example-line');
    if (lines.length > 0) {
      return Array.from(lines).map(l => l.textContent).join('\n').trim();
    }

    // 2. Check for li items
    const lis = preEl.querySelectorAll('li');
    if (lis.length > 0) {
      return Array.from(lis).map(l => l.textContent).join('\n').trim();
    }

    // 3. Clone and replace <br> with real newline text nodes (essential for classic Codeforces <br/> lines)
    const clone = preEl.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => {
      br.replaceWith(d.createTextNode('\n'));
    });

    // 4. Check for multiple direct block children (div, p)
    const directBlockChildren = Array.from(clone.children).filter(c => /^(DIV|P|LI)$/i.test(c.tagName));
    if (directBlockChildren.length > 1) {
      return directBlockChildren.map(cd => cd.textContent.trim()).filter(Boolean).join('\n').trim();
    }

    return (clone.textContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  async function loadProblemData(data) {
    if (!data) return;
    if (data.platform === 'LC' || data.platform === 'TP') return;

    // Check if activeProblem already has a valid statement for this problem and new data does not
    if (activeProblem && (activeProblem.url === data.url || (activeProblem.slug && activeProblem.slug === data.slug))) {
      const activeStmt = activeProblem.statement || activeProblem.statementHtml || activeProblem.body || activeProblem.bodyMarkdown;
      const newStmt = data.statement || data.statementHtml || data.body || data.bodyMarkdown;
      if (activeStmt && activeStmt.trim().length > 30 && (!newStmt || newStmt.trim().length <= 30)) {
        data.statement = activeStmt;
        data.statementHtml = activeStmt;
        if (!data.samples || data.samples.length === 0) data.samples = activeProblem.samples || [];
        if (!data.limits) data.limits = activeProblem.limits;
      }
    }

    let stmt = data.statement || data.statementHtml || data.body || data.bodyMarkdown;

    // Fallback 1: Check chrome.storage.local cache
    if (!stmt || stmt.trim().length < 20) {
      try {
        const cacheKeys = [
          data.slug ? `cses_prob_${data.slug}` : null,
          data.id ? `cses_prob_${data.id}` : null,
          data.slug ? `ac_prob_${data.slug}` : null,
          data.contestId && data.index ? `pc_${data.contestId}_${data.index}` : null,
          'current_ide_problem',
          'pendingProblem'
        ].filter(Boolean);
        const storageData = await chrome.storage.local.get(cacheKeys);
        for (const k of cacheKeys) {
          const item = storageData[k];
          if (item) {
            const cachedStmt = item.statement || item.statementHtml || item.body || (item.stmt && (item.stmt.body || item.stmt.bodyMarkdown));
            if (cachedStmt && cachedStmt.trim().length > 20) {
              data.statement = cachedStmt;
              data.statementHtml = cachedStmt;
              stmt = cachedStmt;
              if (!data.samples || data.samples.length === 0) {
                data.samples = item.samples || (item.stmt && item.stmt.samples) || [];
              }
              if (!data.limits) {
                data.limits = item.limits || (item.stmt && { timeLimit: item.stmt.timeLimit, memoryLimit: item.stmt.memoryLimit });
              }
              break;
            }
          }
        }
      } catch (e) {}
    }

    // Fallback 2: Direct URL fetch using extension host permissions
    if ((!stmt || stmt.trim().length < 20) && data.url && data.url.startsWith('http')) {
      try {
        const fetchResp = await fetch(data.url, { credentials: 'omit' }).catch(() => null);
        if (fetchResp && fetchResp.ok) {
          const html = await fetchResp.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');

          if (data.platform === 'CF' || data.url.includes('codeforces.com')) {
            const stmtEl = doc.querySelector('.problem-statement');
            if (stmtEl) {
              stmt = stmtEl.innerHTML;
              data.statement = stmt;
              data.statementHtml = stmt;
              const titleEl = doc.querySelector('.problem-statement .header .title');
              if (titleEl) data.title = titleEl.textContent.trim();

              const timeLimitEl = doc.querySelector('.problem-statement .time-limit, .problem-statement .header .time-limit');
              const memoryLimitEl = doc.querySelector('.problem-statement .memory-limit, .problem-statement .header .memory-limit');
              if (timeLimitEl || memoryLimitEl) {
                data.limits = {
                  timeLimit: timeLimitEl ? timeLimitEl.textContent.replace(/^time limit per test/i, '').trim() : (data.limits?.timeLimit || '1s'),
                  memoryLimit: memoryLimitEl ? memoryLimitEl.textContent.replace(/^memory limit per test/i, '').trim() : (data.limits?.memoryLimit || '256MB')
                };
              }

              if (!data.samples || data.samples.length === 0) {
                const inPres = doc.querySelectorAll('.sample-test .input pre');
                const outPres = doc.querySelectorAll('.sample-test .output pre');
                const foundSamples = [];
                for (let i = 0; i < Math.min(inPres.length, outPres.length); i++) {
                  foundSamples.push({
                    input: parsePreText(inPres[i], doc),
                    output: parsePreText(outPres[i], doc)
                  });
                }
                if (foundSamples.length > 0) data.samples = foundSamples;
              }
            }
          } else if (data.platform === 'AC' || data.url.includes('atcoder.jp')) {
            const stmtEl = doc.querySelector('#task-statement .lang-en') || doc.querySelector('#task-statement');
            if (stmtEl) {
              stmt = stmtEl.innerHTML;
              data.statement = stmt;
              data.statementHtml = stmt;
              const titleEl = doc.querySelector('span.h2, .title, h2');
              if (titleEl && (!data.title || data.title === 'Active Problem')) data.title = titleEl.textContent.trim();

              if (!data.samples || data.samples.length === 0) {
                const foundSamples = [];
                const root = doc.querySelector('#task-statement .lang-en') || doc.querySelector('#task-statement') || doc;
                root.querySelectorAll('.part pre').forEach((pre) => {
                  const header = pre.previousElementSibling ? pre.previousElementSibling.textContent : '';
                  if (header.includes('Sample Input') || header.includes('入力例')) {
                    const input = parsePreText(pre, doc);
                    const nextPart = pre.closest('.part') ? pre.closest('.part').nextElementSibling : null;
                    const nextPre = nextPart ? nextPart.querySelector('pre') : null;
                    const output = nextPre ? parsePreText(nextPre, doc) : '';
                    foundSamples.push({ input, output });
                  }
                });
                if (foundSamples.length > 0) data.samples = foundSamples;
              }
            }
          } else if (data.platform === 'CSES' || data.url.includes('cses.fi')) {
            const titleEl = doc.querySelector('.title-block h1') || doc.querySelector('h1');
            if (titleEl && (!data.title || data.title === 'Active Problem')) {
              data.title = titleEl.textContent.trim();
            }

            const constraintItems = doc.querySelectorAll('ul.task-constraints li');
            let timeLimit = '1.00 s';
            let memoryLimit = '512 MB';
            constraintItems.forEach(li => {
              const text = li.textContent.trim();
              if (/time\s*limit/i.test(text)) timeLimit = text.replace(/time\s*limit:\s*/i, '').trim();
              else if (/memory\s*limit/i.test(text)) memoryLimit = text.replace(/memory\s*limit:\s*/i, '').trim();
            });
            data.limits = { timeLimit, memoryLimit };

            const contentEl = doc.querySelector('.content .md') || doc.querySelector('.content');
            if (contentEl) {
              stmt = contentEl.innerHTML;
              data.statement = stmt;
              data.statementHtml = stmt;
              data.body = stmt;

              if (!data.samples || data.samples.length === 0) {
                const foundSamples = [];
                const preList = contentEl.querySelectorAll('pre');
                for (let i = 0; i < preList.length; i += 2) {
                  const inp = preList[i] ? preList[i].textContent.replace(/\r\n/g, '\n').trim() : '';
                  const out = preList[i + 1] ? preList[i + 1].textContent.replace(/\r\n/g, '\n').trim() : '';
                  if (inp || out) {
                    foundSamples.push({
                      input: inp ? inp + '\n' : '',
                      output: out ? out + '\n' : ''
                    });
                  }
                }
                if (foundSamples.length > 0) data.samples = foundSamples;
              }
            }
          }
        }
      } catch (e) {}
    }

    activeProblem = data;
    // Persist as current_ide_problem so refreshes NEVER lose the problem, statement, or testcases!
    chrome.storage.local.set({
      current_ide_problem: data,
      [`${(data.platform || 'prob').toLowerCase()}_prob_${data.id || data.slug}`]: data
    }).catch(() => {});

    const clearBtn = $('clear-problem-btn');
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    const closeTopBtn = $('close-problem-top-btn');
    if (closeTopBtn) closeTopBtn.style.display = 'inline-flex';

    $('problem-platform').textContent = data.platform || 'CP';
    $('problem-platform').className = `problem-platform-tag ${data.platform}`;
    $('problem-title').textContent = data.title || 'Untitled Problem';
    $('problem-title').href = data.url || '#';

    // Render Statement
    renderStatement(data);

    // Load Samples into Testcases
    testcases = [];
    if (data.samples && Array.isArray(data.samples)) {
      data.samples.forEach((sample, idx) => {
        testcases.push({
          id: idx + 1,
          input: sample.input || '',
          expected: sample.output || '',
          actual: '',
          verdict: null,
          timeMs: null,
          memoryKb: null
        });
      });
    }

    renderTestcases();
    setVerdict('Ready', 'idle');
    loadEditorDraft();
  }

  // ── Clean Statement HTML for LeetCode-style rendering ────────────────────
  function cleanStatementHtml(html, platform) {
    if (!html) return html;

    try {
      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. Convert <script type="math/tex">...</script> to clean code chips first
        const mathScripts = doc.querySelectorAll('script[type*="math/tex"]');
        mathScripts.forEach(script => {
          const tex = (script.textContent || '').trim();
          const chip = doc.createElement('code');
          chip.className = 'lc-code-chip';
          chip.innerHTML = cleanTexToHtml(tex);
          script.replaceWith(chip);
        });

        // 1. Convert KaTeX elements to clean code chips first (extract clean TeX from annotation)
        doc.querySelectorAll('.katex').forEach(katex => {
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
          const chip = doc.createElement('code');
          chip.className = 'lc-code-chip';
          chip.innerHTML = cleanTexToHtml(tex);
          const parentMath = katex.closest('.math, .math-inline, .math-display');
          if (parentMath) {
            parentMath.replaceWith(chip);
          } else {
            katex.replaceWith(chip);
          }
        });

        // 2. Convert unrendered CSES math spans: <span class="math math-inline"> or <span class="math math-display">
        doc.querySelectorAll('span.math, span.math-inline, span.math-display').forEach(span => {
          const tex = (span.textContent || '').trim();
          const chip = doc.createElement('code');
          chip.className = 'lc-code-chip';
          chip.innerHTML = cleanTexToHtml(tex);
          span.replaceWith(chip);
        });

        // 3. Remove ALL MathJax & KaTeX rendered artifacts completely
        // (MathJax generates .MathJax, .MathJax_Preview, .MathJax_Display, .MathJax_SVG, mjx-container)
        doc.querySelectorAll('.MathJax, .MathJax_Preview, .MathJax_Display, .MathJax_SVG, mjx-container, .mjx-math, .mjx-mrow, .katex-html, .katex-mathml').forEach(el => el.remove());

        // 3. Remove all remaining script and style tags
        doc.querySelectorAll('script, style').forEach(el => el.remove());

        // 4. Remove all interactive buttons, copy toolbars, and action links that leak from platforms
        // (e.g. Toph feather-copy button, AtCoder copy buttons, CF copy buttons)
        doc.querySelectorAll('button, .artifact__action, .artifact__actions, .copy-btn, .btn-copy, .clipboard-copy, .btn-action').forEach(el => el.remove());

        // 5. Remove any SVGs that might have leaked from buttons/icons
        doc.querySelectorAll('svg').forEach(el => el.remove());

        // 6. Remove Codeforces header block, limits, property-titles (limits are in top pill bar)
        doc.querySelectorAll('.header, .time-limit, .memory-limit, .input-file, .output-file, .property-title').forEach(el => el.remove());

        // 7. Convert <span class="tex-span"> (Codeforces non-MathJax text math)
        doc.querySelectorAll('.tex-span').forEach(span => {
          if (span.querySelector('.lc-code-chip')) {
            span.replaceWith(...span.childNodes);
            return;
          }
          span.querySelectorAll('sub, .lower-index').forEach(sub => {
            sub.replaceWith(doc.createTextNode(toSubscript(sub.textContent.trim())));
          });
          span.querySelectorAll('sup, .upper-index').forEach(sup => {
            sup.replaceWith(doc.createTextNode(toSuperscript(sup.textContent.trim())));
          });
          let text = span.textContent.trim();
          text = text.replace(/&le;/gi, '≤').replace(/&ge;/gi, '≥').replace(/&ne;/gi, '≠').replace(/&times;/gi, '×').replace(/&hellip;/gi, '…');
          const chip = doc.createElement('code');
          chip.className = 'lc-code-chip';
          chip.textContent = text;
          span.replaceWith(chip);
        });

        // 8. Convert <span class="tex-font-style-tt"> to code chips
        doc.querySelectorAll('.tex-font-style-tt').forEach(span => {
          const chip = doc.createElement('code');
          chip.className = 'lc-code-chip';
          chip.textContent = span.textContent.trim();
          span.replaceWith(chip);
        });

        // 9. Convert AtCoder <var> tags to code chips
        doc.querySelectorAll('var').forEach(varEl => {
          if (varEl.querySelector('.lc-code-chip')) {
            varEl.replaceWith(...varEl.childNodes);
            return;
          }
          const chip = doc.createElement('code');
          chip.className = 'lc-code-chip';
          chip.innerHTML = cleanTexToHtml(varEl.textContent.trim());
          varEl.replaceWith(chip);
        });

        // 10. Remove AtCoder redundant time/memory limit paragraph
        doc.querySelectorAll('p').forEach(p => {
          if (/Time Limit:\s*[^/]+?\/\s*Memory Limit:/i.test(p.textContent)) {
            p.remove();
          }
        });

        html = doc.body.innerHTML;
      }
    } catch (e) {
      console.warn('DOMParser in cleanStatementHtml error:', e);
    }

    // String-level TeX delimiters conversion for math in text nodes
    // $$$ ... $$$ (CF raw formula delimiters)
    html = html.replace(/\$\$\$([^$]+?)\$\$\$/g, function(_, tex) {
      return '<code class="lc-code-chip">' + cleanTexToHtml(tex.trim()) + '</code>';
    });
    // $$ ... $$ (display math)
    html = html.replace(/\$\$([^$]+?)\$\$/g, function(_, tex) {
      return '<code class="lc-code-chip">' + cleanTexToHtml(tex.trim()) + '</code>';
    });
    // $ ... $ (inline math) - avoid matching across multiple lines or empty $
    html = html.replace(/(?<!\$)\$([^$\n<]{1,250})\$(?!\$)/g, function(_, tex) {
      return '<code class="lc-code-chip">' + cleanTexToHtml(tex.trim()) + '</code>';
    });
    // \( ... \) and \[ ... \]
    html = html.replace(/\\\(([\s\S]*?)\\\)/g, function(_, tex) {
      return '<code class="lc-code-chip">' + cleanTexToHtml(tex.trim()) + '</code>';
    });
    html = html.replace(/\\\[([\s\S]*?)\\\]/g, function(_, tex) {
      return '<code class="lc-code-chip">' + cleanTexToHtml(tex.trim()) + '</code>';
    });

    return html;
  }

  // Convert TeX string to readable HTML (subscripts, superscripts, Greek letters, etc.)
  function cleanTexToHtml(tex) {
    if (!tex) return '';

    // Protect literal braces
    tex = tex.replace(/\\{/g, '\u2774').replace(/\\}/g, '\u2775');

    // ── Operators & symbols ──
    tex = tex.replace(/\\le(?:q)?(?![a-zA-Z])/g, '≤').replace(/\\ge(?:q)?(?![a-zA-Z])/g, '≥');
    tex = tex.replace(/\\ne(?:q)?(?![a-zA-Z])/g, '≠').replace(/\\not=/g, '≠');
    tex = tex.replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\div/g, '÷');
    tex = tex.replace(/\\pm/g, '±').replace(/\\mp/g, '∓');
    tex = tex.replace(/\\approx/g, '≈').replace(/\\equiv/g, '≡');
    tex = tex.replace(/\\ldots/g, '…').replace(/\\cdots/g, '⋯').replace(/\\dots/g, '…');
    tex = tex.replace(/\\infty/g, '∞').replace(/\\emptyset/g, '∅');
    tex = tex.replace(/\\to/g, '→').replace(/\\rightarrow/g, '→').replace(/\\leftarrow/g, '←');
    tex = tex.replace(/\\Rightarrow/g, '⇒').replace(/\\Leftarrow/g, '⇐');
    tex = tex.replace(/\\forall/g, '∀').replace(/\\exists/g, '∃');
    tex = tex.replace(/\\in/g, '∈').replace(/\\notin/g, '∉').replace(/\\subset/g, '⊂');
    tex = tex.replace(/\\cup/g, '∪').replace(/\\cap/g, '∩');
    tex = tex.replace(/\\land/g, '∧').replace(/\\lor/g, '∨').replace(/\\lnot/g, '¬').replace(/\\neg/g, '¬');
    tex = tex.replace(/\\oplus/g, '⊕');
    tex = tex.replace(/\\sum/g, '∑').replace(/\\prod/g, '∏');
    tex = tex.replace(/\\lfloor\s*/g, '⌊').replace(/\s*\\rfloor/g, '⌋');
    tex = tex.replace(/\\lceil\s*/g, '⌈').replace(/\s*\\rceil/g, '⌉');
    tex = tex.replace(/\\bmod/g, 'mod').replace(/\\pmod\{([^}]*)\}/g, '(mod $1)');
    tex = tex.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');

    // ── Greek letters ──
    tex = tex.replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ');
    tex = tex.replace(/\\delta/g, 'δ').replace(/\\varepsilon/g, 'ε').replace(/\\epsilon/g, 'ε');
    tex = tex.replace(/\\zeta/g, 'ζ').replace(/\\eta/g, 'η');
    tex = tex.replace(/\\vartheta/g, 'ϑ').replace(/\\theta/g, 'θ');
    tex = tex.replace(/\\iota/g, 'ι').replace(/\\kappa/g, 'κ').replace(/\\lambda/g, 'λ');
    tex = tex.replace(/\\mu/g, 'μ').replace(/\\nu/g, 'ν').replace(/\\xi/g, 'ξ');
    tex = tex.replace(/\\pi/g, 'π').replace(/\\rho/g, 'ρ');
    tex = tex.replace(/\\sigma/g, 'σ').replace(/\\tau/g, 'τ').replace(/\\upsilon/g, 'υ');
    tex = tex.replace(/\\varphi/g, 'φ').replace(/\\phi/g, 'φ');
    tex = tex.replace(/\\chi/g, 'χ').replace(/\\psi/g, 'ψ').replace(/\\omega/g, 'ω');
    tex = tex.replace(/\\Gamma/g, 'Γ').replace(/\\Delta/g, 'Δ').replace(/\\Theta/g, 'Θ');
    tex = tex.replace(/\\Lambda/g, 'Λ').replace(/\\Sigma/g, 'Σ').replace(/\\Phi/g, 'Φ');
    tex = tex.replace(/\\Psi/g, 'Ψ').replace(/\\Omega/g, 'Ω');

    // ── Text / Monospace commands (fix mathtt0 bug) ──
    tex = tex.replace(/\\mathtt\s*\{([^}]*)\}/g, '$1').replace(/\\mathtt\s*([0-9a-zA-Z])/g, '$1');
    tex = tex.replace(/\\texttt\s*\{([^}]*)\}/g, '$1').replace(/\\texttt\s*([0-9a-zA-Z])/g, '$1');
    tex = tex.replace(/\\mathrm\s*\{([^}]*)\}/g, '$1').replace(/\\mathrm\s*([0-9a-zA-Z])/g, '$1');
    tex = tex.replace(/\\textbf\s*\{([^}]*)\}/g, '<strong>$1</strong>').replace(/\\textbf\s*([0-9a-zA-Z])/g, '<strong>$1</strong>');
    tex = tex.replace(/\\mathbf\s*\{([^}]*)\}/g, '<strong>$1</strong>').replace(/\\mathbf\s*([0-9a-zA-Z])/g, '<strong>$1</strong>');
    tex = tex.replace(/\\textit\s*\{([^}]*)\}/g, '<em>$1</em>').replace(/\\textit\s*([0-9a-zA-Z])/g, '<em>$1</em>');
    tex = tex.replace(/\\mathit\s*\{([^}]*)\}/g, '<em>$1</em>').replace(/\\mathit\s*([0-9a-zA-Z])/g, '<em>$1</em>');
    tex = tex.replace(/\\text\s*\{([^}]*)\}/g, '$1').replace(/\\text\s*([0-9a-zA-Z])/g, '$1');
    tex = tex.replace(/\\operatorname\s*\{([^}]*)\}/g, '$1');

    // ── Fractions ──
    tex = tex.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)');

    // ── Superscripts and subscripts → Unicode ──
    tex = tex.replace(/\^{([^}]*)}/g, function(_, exp) {
      return toSuperscript(exp);
    });
    tex = tex.replace(/\^([0-9a-zA-Z])/g, function(_, c) {
      return toSuperscript(c);
    });
    tex = tex.replace(/_{([^}]*)}/g, function(_, sub) {
      return toSubscript(sub);
    });
    tex = tex.replace(/_([0-9a-zA-Z])/g, function(_, c) {
      return toSubscript(c);
    });

    // ── Spacing ──
    tex = tex.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '');
    tex = tex.replace(/\\quad/g, ' ').replace(/\\qquad/g, '  ');
    tex = tex.replace(/\\hspace\{[^}]*\}/g, ' ').replace(/\\vspace\{[^}]*\}/g, '');
    tex = tex.replace(/\\limits/g, '').replace(/\\\\/g, ' ');
    tex = tex.replace(/\\left/g, '').replace(/\\right/g, '');

    // ── Catch-all: remaining \command → just the name ──
    tex = tex.replace(/\\([a-zA-Z]+)/g, '$1');

    // ── Strip TeX grouping braces ──
    tex = tex.replace(/\{/g, '').replace(/\}/g, '');

    // ── Restore literal braces ──
    tex = tex.replace(/\u2774/g, '{').replace(/\u2775/g, '}');

    // ── Collapse whitespace ──
    tex = tex.replace(/\s+/g, ' ');
    return tex.trim();
  }

  // Unicode superscript mapping
  function toSuperscript(str) {
    const sup = {
      '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
      '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾',
      'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ',
      'l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ',
      'x':'ˣ','y':'ʸ','z':'ᶻ'
    };
    let result = '';
    for (const c of str) {
      result += sup[c] || c;
    }
    return result;
  }

  // Unicode subscript mapping
  function toSubscript(str) {
    const sub = {
      '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
      '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎',
      'a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ',
      'p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ'
    };
    let result = '';
    for (const c of str) {
      result += sub[c] || c;
    }
    return result;
  }

  function renderStatement(data) {
    const container = $('statement-body');
    const limits = data.limits || {};
    const platform = (data.platform || 'CP').toUpperCase();

    const platformNames = {
      CF: 'Codeforces',
      AC: 'AtCoder',
      LC: 'LeetCode',
      TP: 'Toph',
      CSES: 'CSES'
    };
    const platformName = platformNames[platform] || platform;

    let diffHtml = '';
    const diff = data.difficulty || data.rating || '';
    if (diff) {
      let diffClass = 'lc-pill-diff';
      const dl = String(diff).toLowerCase();
      if (dl === 'easy' || (typeof diff === 'number' && diff < 1200)) diffClass = 'lc-pill-easy';
      else if (dl === 'medium' || (typeof diff === 'number' && diff >= 1200 && diff < 1900)) diffClass = 'lc-pill-medium';
      else if (dl === 'hard' || (typeof diff === 'number' && diff >= 1900)) diffClass = 'lc-pill-hard';
      diffHtml = `<span class="lc-pill ${diffClass}">${escapeHtml(String(diff))}</span>`;
    }

    let headerHtml = `
      <div class="lc-problem-header">
        <h1 class="lc-problem-title">${escapeHtml(data.title || 'Problem')}</h1>
        <div class="lc-meta-bar">
          <span class="lc-pill lc-pill-${platform.toLowerCase()}">${platformName}</span>
          ${diffHtml}
          ${limits.timeLimit ? `<span class="lc-pill lc-pill-limit">⏱ ${escapeHtml(limits.timeLimit)}</span>` : ''}
          ${limits.memoryLimit ? `<span class="lc-pill lc-pill-limit">💾 ${escapeHtml(limits.memoryLimit)}</span>` : ''}
          ${data.url ? `<a href="${data.url}" target="_blank" class="lc-pill lc-pill-link">↗ Original</a>` : ''}
        </div>
      </div>
    `;

    let stmt = data.statementHtml || data.statement || data.body || data.bodyMarkdown || '';

    // If stmt is truncated (doesn't contain input/constraints), but data has inputSpec or constraints, reconstruct full content:
    if (platform === 'CSES' || data.inputSpec || data.constraints) {
      const lower = (stmt || '').toLowerCase();
      if (!lower.includes('input') && (data.inputSpec || data.constraints)) {
        let full = '';
        if (data.body) full += `<p>${data.body}</p>`;
        if (data.inputSpec) full += `<h1 id="input">Input</h1><p>${data.inputSpec}</p>`;
        if (data.outputSpec) full += `<h1 id="output">Output</h1><p>${data.outputSpec}</p>`;
        if (data.constraints) full += `<h1 id="constraints">Constraints</h1><p>${data.constraints}</p>`;
        if (data.samples && data.samples.length > 0) {
          full += `<h1 id="example">Example</h1>`;
          data.samples.forEach(s => {
            full += `<p>Input:</p><pre>${escapeHtml((s.input || '').trim())}</pre>`;
            full += `<p>Output:</p><pre>${escapeHtml((s.output || '').trim())}</pre>`;
          });
        }
        stmt = full;
      }
    }

    // Clean statement HTML for non-LC platforms (process TeX, MathJax, etc.)
    if (stmt && stmt.trim() && platform !== 'LC') {
      stmt = cleanStatementHtml(stmt, platform);
    }

    if (stmt && stmt.trim()) {
      container.innerHTML = headerHtml + `<div class="statement-content">${stmt}</div>`;
    } else if (data.samples && data.samples.length > 0) {
      // Fallback: render clean samples if full statement body isn't available
      let samplesHtml = '<div class="statement-content">';
      data.samples.forEach((sample, i) => {
        samplesHtml += `
          <div class="lc-example-box" style="margin-bottom: 12px;">
            <div class="lc-example-label">Example ${i + 1}</div>
            <div style="margin-bottom: 6px;"><strong style="color:#94a3b8;">Input:</strong><pre style="margin-top:2px;">${escapeHtml(sample.input)}</pre></div>
            <div><strong style="color:#94a3b8;">Output:</strong><pre style="margin-top:2px;">${escapeHtml(sample.output)}</pre></div>
          </div>
        `;
      });
      samplesHtml += `<p style="margin-top:16px;"><a href="${data.url}" target="_blank" class="lc-pill lc-pill-link">View full problem on ${platformName} ↗</a></p></div>`;
      container.innerHTML = headerHtml + samplesHtml;
    } else {
      container.innerHTML = headerHtml + `<p style="margin-top:16px; padding: 0 4px;"><a href="${data.url}" target="_blank" class="lc-pill lc-pill-link">View full problem on ${platformName} ↗</a></p>`;
    }
  }

  // Listen for background broadcasts
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PROBLEM_DETECTED' && msg.data) {
      if (msg.data.platform === 'LC' || msg.data.platform === 'TP') return;
      // Only enrich if activeProblem is already set to THIS problem!
      // Never auto-hijack an empty scratchpad or a different problem from background tab browsing.
      if (activeProblem && (activeProblem.url === msg.data.url || (activeProblem.slug && activeProblem.slug === msg.data.slug))) {
        const hasActiveStmt = activeProblem.statement && activeProblem.statement.trim().length > 30;
        const hasIncomingStmt = (msg.data.statement && msg.data.statement.trim().length > 30) || (msg.data.statementHtml && msg.data.statementHtml.trim().length > 30);
        if (hasActiveStmt && !hasIncomingStmt) return;
        loadProblemData(msg.data);
      }
    }
  });

  $('refresh-problem-btn').addEventListener('click', detectProblemFromActiveTab);

  // ── 6. CPH Testcase Runner ──────────────────────────────────────────────────
  // ── 6. CPH Testcase Runner ──────────────────────────────────────────────────
  function renderTestcases() {
    const list = $('testcases-list');
    const tcCountBadge = $('testcases-count');
    if (tcCountBadge) tcCountBadge.textContent = testcases.length;

    list.innerHTML = '';

    if (testcases.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state-tests';
      emptyDiv.innerHTML = `<p>No testcases found. Click <strong>+ New Testcase</strong> or open a problem page to auto-extract samples.</p>`;
      list.appendChild(emptyDiv);
    } else {
      testcases.forEach((tc, idx) => {
        const card = document.createElement('div');
        const isRunning = tc.verdict === 'Running...' || tc.verdict === '...';
        const isPassed = tc.verdict === 'AC';
        const isFailed = tc.verdict && !isPassed && !isRunning;
        
        let statusClass = 'idle';
        let verdictLabel = '';
        let verdictClass = 'verdict-idle';

        if (isRunning) {
          statusClass = 'running';
          verdictLabel = 'Running...';
          verdictClass = 'verdict-running';
        } else if (isPassed) {
          statusClass = 'passed';
          verdictLabel = 'Passed';
          verdictClass = 'verdict-passed';
        } else if (isFailed) {
          statusClass = 'failed';
          verdictLabel = tc.verdict === 'WA' ? 'Failed' : (tc.verdict || 'Failed');
          verdictClass = 'verdict-failed';
        }

        const isCollapsed = tc.collapsed === true;
        card.className = `cph-card ${statusClass} ${isCollapsed ? 'is-collapsed' : ''}`;
        card.dataset.idx = idx;

        const timeBadge = tc.timeMs !== null && tc.timeMs !== undefined
          ? `<span class="cph-time-badge">${tc.timeMs}ms</span>`
          : '';

        const caretIcon = isCollapsed
          ? `<svg class="cph-caret-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`
          : `<svg class="cph-caret-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        card.innerHTML = `
          <div class="cph-card-header" data-idx="${idx}">
            <div class="cph-header-left">
              <span class="cph-caret-wrap">${caretIcon}</span>
              <span class="cph-tc-tag">TC ${idx + 1}</span>
              ${verdictLabel ? `<span class="cph-verdict-text ${verdictClass}">${verdictLabel}</span>` : ''}
              ${timeBadge}
            </div>
            <div class="cph-header-right">
              <button class="cph-btn-run" data-idx="${idx}" title="Run testcase">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
              <button class="cph-btn-del" data-idx="${idx}" title="Delete testcase">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
          <div class="cph-card-body" style="display: ${isCollapsed ? 'none' : 'flex'};">
            <div class="cph-field-wrap">
              <div class="cph-field-header">
                <span class="cph-field-label">Input:</span>
                <button class="cph-copy-btn" data-type="in" data-idx="${idx}">Copy</button>
              </div>
              <textarea class="cph-textarea tc-in" data-idx="${idx}" spellcheck="false" placeholder="Test input...">${escapeHtml(tc.input || '')}</textarea>
            </div>

            <div class="cph-field-wrap">
              <div class="cph-field-header">
                <span class="cph-field-label">Expected Output:</span>
                <button class="cph-copy-btn" data-type="exp" data-idx="${idx}">Copy</button>
              </div>
              <textarea class="cph-textarea tc-exp" data-idx="${idx}" spellcheck="false" placeholder="Expected output...">${escapeHtml(tc.expected || '')}</textarea>
            </div>

            ${(tc.actual !== undefined && tc.actual !== '' && tc.verdict !== 'CE' && tc.verdict !== 'Running...' && tc.verdict !== '...') ? `
            <div class="cph-field-wrap">
              <div class="cph-field-header">
                <span class="cph-field-label">Received Output:</span>
                <div class="cph-field-actions">
                  ${isFailed ? `<button class="cph-diff-btn" data-idx="${idx}">Diff</button>` : ''}
                  <button class="cph-copy-btn" data-type="act" data-idx="${idx}">Copy</button>
                </div>
              </div>
              <textarea class="cph-textarea tc-act ${isPassed ? 'act-passed' : 'act-failed'}" readonly spellcheck="false">${escapeHtml(tc.actual)}</textarea>
            </div>` : ''}
          </div>
        `;

        // Accordion header toggle
        const header = card.querySelector('.cph-card-header');
        header.addEventListener('click', (e) => {
          if (e.target.closest('.cph-btn-run') || e.target.closest('.cph-btn-del')) return;
          tc.collapsed = !tc.collapsed;
          const body = card.querySelector('.cph-card-body');
          const caretWrap = card.querySelector('.cph-caret-wrap');
          if (tc.collapsed) {
            body.style.display = 'none';
            card.classList.add('is-collapsed');
            caretWrap.innerHTML = `<svg class="cph-caret-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
          } else {
            body.style.display = 'flex';
            card.classList.remove('is-collapsed');
            caretWrap.innerHTML = `<svg class="cph-caret-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
            card.querySelectorAll('.cph-textarea').forEach(ta => autoFitTextarea(ta));
          }
        });

        // Run single test
        card.querySelector('.cph-btn-run').addEventListener('click', (e) => {
          e.stopPropagation();
          runSingleTestcase(idx);
        });

        // Delete test
        card.querySelector('.cph-btn-del').addEventListener('click', (e) => {
          e.stopPropagation();
          testcases.splice(idx, 1);
          renderTestcases();
        });

        // Copy buttons
        card.querySelectorAll('.cph-copy-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            let textToCopy = '';
            if (type === 'in') textToCopy = tc.input || '';
            else if (type === 'exp') textToCopy = tc.expected || '';
            else if (type === 'act') textToCopy = tc.actual || '';

            navigator.clipboard.writeText(textToCopy).then(() => {
              const oldText = btn.textContent;
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
              setTimeout(() => {
                btn.textContent = oldText;
                btn.classList.remove('copied');
              }, 1200);
            });
          });
        });

        // Diff button
        const diffBtn = card.querySelector('.cph-diff-btn');
        if (diffBtn) {
          diffBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDiffModal(tc.actual, tc.expected);
          });
        }

        // Live input handlers
        const inTa = card.querySelector('.tc-in');
        if (inTa) {
          inTa.addEventListener('input', (e) => {
            tc.input = e.target.value;
            autoFitTextarea(e.target);
          });
        }
        const expTa = card.querySelector('.tc-exp');
        if (expTa) {
          expTa.addEventListener('input', (e) => {
            tc.expected = e.target.value;
            autoFitTextarea(e.target);
          });
        }

        list.appendChild(card);
      });
    }

    // Append "+ New Testcase" wide green button to bottom of scrollable list
    const addTcBtn = document.createElement('button');
    addTcBtn.className = 'btn-cph-new-tc';
    addTcBtn.id = 'add-testcase-btn';
    addTcBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      <span>New Testcase</span>
    `;
    addTcBtn.addEventListener('click', () => {
      testcases.push({
        id: testcases.length + 1,
        input: '',
        expected: '',
        actual: '',
        verdict: null,
        collapsed: false
      });
      renderTestcases();
      setTimeout(() => {
        list.scrollTop = list.scrollHeight;
      }, 10);
    });
    list.appendChild(addTcBtn);

    // Initial textarea sizing & wheel pass-through
    setTimeout(() => {
      list.querySelectorAll('.cph-textarea').forEach(ta => {
        autoFitTextarea(ta);
        ta.addEventListener('wheel', (e) => {
          // If textarea is scrollable, allow user to scroll its content freely
          if (ta.scrollHeight > ta.clientHeight) {
            const isAtTop = ta.scrollTop <= 0 && e.deltaY < 0;
            const isAtBottom = (ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 1) && e.deltaY > 0;
            if (!isAtTop && !isAtBottom) {
              e.stopPropagation();
              return;
            }
          }
          list.scrollTop += e.deltaY;
        }, { passive: true });
      });
    }, 0);

    updateSummaryStats();
  }

  function autoFitTextarea(el) {
    if (!el) return;
    el.style.overflowY = 'auto';
    el.style.height = 'auto';
    const isAct = el.classList.contains('tc-act');
    const minH = isAct ? 64 : 44;
    const maxH = isAct ? 240 : 160;
    const scrollH = el.scrollHeight;
    el.style.height = Math.min(maxH, Math.max(minH, scrollH + 4)) + 'px';
  }

  function updateSummaryStats() {
    const stats = $('cph-summary-stats');
    const localTitle = $('cph-local-title');
    if (localTitle) {
      localTitle.textContent = `Local: ${testcases.length}`;
    }
    if (!stats) return;
    if (testcases.length === 0) {
      stats.textContent = '0 / 0 passed';
      stats.className = 'cph-summary-stats idle';
      return;
    }
    const hasRun = testcases.some(t => t.verdict && t.verdict !== '...' && t.verdict !== 'Running...');
    const passed = testcases.filter(t => t.verdict === 'AC').length;
    stats.textContent = `${passed} / ${testcases.length} passed`;
    if (!hasRun) {
      stats.className = 'cph-summary-stats idle';
    } else if (passed === testcases.length) {
      stats.className = 'cph-summary-stats all-passed';
    } else {
      stats.className = 'cph-summary-stats has-failed';
    }
  }

  function clearAllVerdicts() {
    testcases.forEach(t => {
      t.verdict = null;
      t.actual = '';
      t.timeMs = null;
    });
    renderTestcases();
    setVerdict('Ready', 'idle');
    showOverallVerdict('hide');
    clearEditorErrors();
    updateCompilerView('', []);
  }

  const clearResultsBtn = $('clear-results-btn');
  if (clearResultsBtn) {
    clearResultsBtn.addEventListener('click', clearAllVerdicts);
  }
  const cphRunAllBtn = $('cph-run-all-btn');
  if (cphRunAllBtn) {
    cphRunAllBtn.addEventListener('click', runAllTestcases);
  }
  const headerAddTcBtn = $('header-add-testcase-btn');
  if (headerAddTcBtn) {
    headerAddTcBtn.addEventListener('click', () => {
      testcases.push({
        id: testcases.length + 1,
        input: '',
        expected: '',
        actual: '',
        verdict: null,
        collapsed: false
      });
      renderTestcases();
      const list = $('testcases-list');
      if (list) {
        setTimeout(() => { list.scrollTop = list.scrollHeight; }, 10);
      }
    });
  }

  // ── Error Markers & Highlights in Monaco Editor ─────────────────────────────
  function clearEditorErrors() {
    if (!editor || !window.monaco) return;
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'codesync_errors', []);
    }
    errorDecorations = editor.deltaDecorations(errorDecorations, []);
  }

  function parseStderrLines(stderr) {
    if (!stderr) return [];
    const errors = [];
    const lines = stderr.split('\n');
    for (const line of lines) {
      // GCC / Clang: file:line:col: error: message or file:line: error: message
      const gccMatch = line.match(/(?:^|[^a-zA-Z0-9_.-])(\d+):(?:(\d+):)?\s*(error|fatal error|warning|note):\s*(.*)/i);
      if (gccMatch) {
        errors.push({
          line: parseInt(gccMatch[1], 10),
          col: gccMatch[2] ? parseInt(gccMatch[2], 10) : 1,
          severity: gccMatch[3].toLowerCase().includes('warning') ? 'warning' : 'error',
          message: (gccMatch[4] || line).trim(),
          raw: line
        });
        continue;
      }
      // Python: File "...", line 12, in <module>
      const pyMatch = line.match(/File\s+["'].*?["'],\s+line\s+(\d+)(?:,\s+in\s+(.*))?/i);
      if (pyMatch) {
        errors.push({
          line: parseInt(pyMatch[1], 10),
          col: 1,
          severity: 'error',
          message: line.trim(),
          raw: line
        });
        continue;
      }
      // Python direct SyntaxError
      const pySyntax = line.match(/^(SyntaxError|IndentationError|NameError|TypeError|ValueError):\s*(.*)/i);
      if (pySyntax && errors.length > 0) {
        errors[errors.length - 1].message += ` (${pySyntax[1]}: ${pySyntax[2]})`;
        continue;
      }
      // Java: Main.java:6: error: cannot find symbol
      const javaMatch = line.match(/\.java:(\d+):\s*(error|warning):\s*(.*)/i);
      if (javaMatch) {
        errors.push({
          line: parseInt(javaMatch[1], 10),
          col: 1,
          severity: javaMatch[2].toLowerCase() === 'warning' ? 'warning' : 'error',
          message: javaMatch[3].trim(),
          raw: line
        });
        continue;
      }
      // Rust: --> src/main.rs:6:5
      const rustMatch = line.match(/-->\s*[^:]+:(\d+):(\d+)/);
      if (rustMatch) {
        errors.push({
          line: parseInt(rustMatch[1], 10),
          col: parseInt(rustMatch[2], 10),
          severity: 'error',
          message: line.trim(),
          raw: line
        });
      }
    }
    return errors;
  }

  function updateCompilerView(stderr, parsedErrors) {
    const termPre = $('compiler-terminal-output');
    const problemsWrap = $('compiler-problems-wrap');
    const problemsList = $('compiler-problems-list');
    const summaryText = $('compiler-summary-text');
    const dot = $('compiler-dot');
    const badge = $('compiler-error-count');

    if (!stderr) {
      if (termPre) termPre.textContent = '// Ready. Click Compile (Ctrl+B) or Test (Run) to see compiler output.';
      if (problemsWrap) problemsWrap.style.display = 'none';
      if (summaryText) summaryText.textContent = 'Ready to compile';
      if (dot) dot.className = 'status-indicator-dot idle';
      if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
      return;
    }

    if (termPre) termPre.textContent = stderr;

    const errorCount = (parsedErrors || []).filter(e => e.severity === 'error').length;
    const warnCount = (parsedErrors || []).filter(e => e.severity === 'warning').length;

    if (badge) {
      if (errorCount > 0 || warnCount > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = `${errorCount} Error${errorCount !== 1 ? 's' : ''}`;
      } else {
        badge.style.display = 'none';
      }
    }

    if (errorCount > 0) {
      if (summaryText) summaryText.textContent = `${errorCount} Error${errorCount !== 1 ? 's' : ''}${warnCount > 0 ? `, ${warnCount} Warning${warnCount !== 1 ? 's' : ''}` : ''}`;
      if (dot) dot.className = 'status-indicator-dot error';
    } else if (warnCount > 0) {
      if (summaryText) summaryText.textContent = `0 Errors, ${warnCount} Warning${warnCount !== 1 ? 's' : ''}`;
      if (dot) dot.className = 'status-indicator-dot error';
    } else {
      if (summaryText) summaryText.textContent = 'Compiled cleanly without errors';
      if (dot) dot.className = 'status-indicator-dot success';
    }

    if (parsedErrors && parsedErrors.length > 0 && problemsList) {
      problemsWrap.style.display = 'block';
      problemsList.innerHTML = '';
      parsedErrors.forEach(err => {
        const item = document.createElement('div');
        item.className = `compiler-problem-item ${err.severity}`;
        item.innerHTML = `
          <span class="compiler-problem-loc">Ln ${err.line}, Col ${err.col}</span>
          <span class="compiler-problem-msg"><strong>${err.severity.toUpperCase()}:</strong> ${escapeHtml(err.message)}</span>
        `;
        item.addEventListener('click', () => {
          if (editor) {
            editor.revealLineInCenter(err.line);
            editor.setPosition({ lineNumber: err.line, column: err.col });
            editor.focus();
          }
        });
        problemsList.appendChild(item);
      });
    } else if (problemsWrap) {
      problemsWrap.style.display = 'none';
    }
  }

  function switchRightTab(tabName) {
    const tabBtnTestcases = $('tab-btn-testcases');
    const tabBtnCompiler = $('tab-btn-compiler');
    const viewTestcases = $('cph-testcases-view');
    const viewCompiler = $('cph-compiler-view');

    if (!tabBtnTestcases || !tabBtnCompiler) return;

    if (tabName === 'compiler') {
      tabBtnCompiler.classList.add('active');
      tabBtnTestcases.classList.remove('active');
      if (viewCompiler) {
        viewCompiler.classList.remove('hidden');
        viewCompiler.style.setProperty('display', 'flex', 'important');
      }
      if (viewTestcases) {
        viewTestcases.classList.add('hidden');
        viewTestcases.style.setProperty('display', 'none', 'important');
      }
    } else {
      tabBtnTestcases.classList.add('active');
      tabBtnCompiler.classList.remove('active');
      if (viewTestcases) {
        viewTestcases.classList.remove('hidden');
        viewTestcases.style.setProperty('display', 'flex', 'important');
      }
      if (viewCompiler) {
        viewCompiler.classList.add('hidden');
        viewCompiler.style.setProperty('display', 'none', 'important');
      }
    }
  }

  function showCompilationErrorsInEditor(stderr) {
    if (!editor || !window.monaco || !stderr) return;
    const model = editor.getModel();
    if (!model) return;

    const parsedErrors = parseStderrLines(stderr);
    if (parsedErrors.length === 0) return;

    // Monaco markers (red squiggles on ALL lines)
    const markers = parsedErrors.map(err => ({
      startLineNumber: err.line,
      startColumn: err.col || 1,
      endLineNumber: err.line,
      endColumn: (model.getLineMaxColumn(err.line) || 100),
      message: err.message,
      severity: err.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
    }));
    monaco.editor.setModelMarkers(model, 'codesync_errors', markers);

    // Gutter arrows and line background highlighting on ALL error lines
    const decorations = parsedErrors.map(err => ({
      range: new monaco.Range(err.line, 1, err.line, 1),
      options: {
        isWholeLine: true,
        className: err.severity === 'error' ? 'line-error-highlight' : 'line-warning-highlight',
        glyphMarginClassName: err.severity === 'error' ? 'glyph-error-arrow' : 'glyph-warning-arrow',
        glyphMarginHoverMessage: { value: `**${err.severity.toUpperCase()} (Line ${err.line}):** ${err.message}` }
      }
    }));
    errorDecorations = editor.deltaDecorations(errorDecorations, decorations);

    // Jump / scroll to the first error line
    const firstError = parsedErrors[0];
    if (firstError && firstError.line > 0 && firstError.line <= model.getLineCount()) {
      editor.revealLineInCenter(firstError.line);
      editor.setPosition({ lineNumber: firstError.line, column: firstError.col || 1 });
    }
  }

  function showOverallVerdict(type, title, subtitle, actionConfig = null) {
    const banner = $('overall-verdict-banner');
    if (!banner) return;
    if (!type || type === 'hide') {
      banner.className = 'overall-verdict-banner';
      banner.style.display = 'none';
      return;
    }

    banner.className = `overall-verdict-banner ${type}`;
    banner.style.display = 'flex';
    const icon = type === 'ac' ? '🟢' : type === 'running' ? '⏳' : type === 'ce' ? '⚠️' : type === 'tle' ? '⏱️' : type === 'rte' ? '💥' : '🔴';
    const iconEl = $('ov-icon');
    const titleEl = $('ov-title');
    const subEl = $('ov-subtitle');
    const ovBtn = $('ov-action-btn');

    // Clean title of any trailing emojis so it stays on a single crisp line
    const cleanTitle = (title || '').replace(/[\s❌✅🎉⚠️💥⏱️]+$/u, '').trim();

    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = cleanTitle || title;
    if (subEl) subEl.textContent = subtitle || '';

    if (ovBtn) {
      if (actionConfig && actionConfig.text) {
        ovBtn.textContent = actionConfig.text;
        ovBtn.style.display = 'inline-flex';
        ovBtn.onclick = actionConfig.onClick || null;
      } else {
        ovBtn.style.display = 'none';
        ovBtn.onclick = null;
      }
    }
  }

  // ── 7. Code Execution Engine ────────────────────────────────────────────────
  async function compileSolution() {
    if (isExecuting || !editor) return;
    const code = editor.getValue();
    if (!code.trim()) {
      showToast('No code to compile', 'error');
      return;
    }

    isExecuting = true;
    clearEditorErrors();
    setVerdict('Compiling...', 'running');
    showOverallVerdict('running', 'COMPILING CODE', `Checking syntax & types with ${currentLanguage.toUpperCase()} compiler...`);
    if (!executor) executor = new CodeExecutor();

    try {
      const res = await executor.compile(code, currentLanguage);
      const isCompileError = !res.buildSuccess || res.status === 'CE';
      if (isCompileError) {
        const parsedErrors = parseStderrLines(res.stderr);
        showCompilationErrorsInEditor(res.stderr);
        updateCompilerView(res.stderr, parsedErrors);
        setVerdict('Compilation Error', 'wa');
        
        // Meaningful first error line for the banner
        const firstErrorObj = parsedErrors.find(e => e.severity === 'error') || parsedErrors[0];
        const errorBannerDesc = firstErrorObj
          ? `Line ${firstErrorObj.line}: ${firstErrorObj.message} (${parsedErrors.length} error${parsedErrors.length > 1 ? 's' : ''})`
          : (res.stderr ? res.stderr.split('\n').filter(l => l.trim())[0] : 'Syntax or type errors detected.');
        
        showOverallVerdict('ce', 'COMPILATION FAILED', errorBannerDesc, {
          text: 'View Diagnostics',
          onClick: () => switchRightTab('compiler')
        });
        switchRightTab('compiler');
        showToast(`Compilation failed: ${parsedErrors.length || 1} error(s) detected.`, 'error');
      } else {
        clearEditorErrors();
        updateCompilerView('// Compilation succeeded with 0 errors.\n// Code is syntactically valid and ready to run.', []);
        setVerdict('Compiled Successfully', 'ac');
        showOverallVerdict('ac', 'COMPILED CLEANLY', `0 errors! Code is ready to run and test.`);
        showToast('Code compiled successfully!', 'success');
      }
    } catch (e) {
      setVerdict('Compile Error', 'wa');
      showOverallVerdict('ce', 'COMPILATION ERROR', e.message, {
        text: 'View Diagnostics',
        onClick: () => switchRightTab('compiler')
      });
      showToast('Compilation error: ' + e.message, 'error');
      updateCompilerView(e.message, []);
      switchRightTab('compiler');
    } finally {
      isExecuting = false;
    }
  }

  async function runSingleTestcase(index) {
    if (isExecuting || !editor) return;
    const tc = testcases[index];
    if (!tc) return;

    isExecuting = true;
    clearEditorErrors();
    tc.verdict = 'Running...';
    tc.actual = '';
    renderTestcases();

    setVerdict(`Running Test #${index + 1}...`, 'running');
    showOverallVerdict('running', 'EXECUTING TESTCASE', `Running Test #${index + 1}...`);

    if (!executor) executor = new CodeExecutor();
    const code = editor.getValue();

    try {
      const res = await executor.execute(code, currentLanguage, tc.input);
      tc.timeMs = res.timeMs;
      tc.memoryKb = res.memoryKb;

      const isCompileError = res.status === 'CE' || res.buildSuccess === false || /syntaxerror|compile error|compilation error/i.test(res.stderr || '');
      if (isCompileError) {
        tc.verdict = 'CE';
        tc.actual = ''; // Do NOT trigger received output on compilation error
        tc.collapsed = false;
        showCompilationErrorsInEditor(res.stderr);
        updateCompilerView(res.stderr, parseStderrLines(res.stderr));
        showOverallVerdict('ce', 'COMPILATION ERROR', 'Check editor for red line highlights & syntax error locations', {
          text: 'View Diagnostics',
          onClick: () => switchRightTab('compiler')
        });
        setVerdict('Compilation Error', 'wa');
        switchRightTab('compiler');
      } else if (res.status === 'TLE') {
        tc.verdict = 'TLE';
        tc.actual = res.stderr || 'Time Limit Exceeded';
        tc.collapsed = false;
        showOverallVerdict('tle', 'TIME LIMIT EXCEEDED', `Test #${index + 1} timed out (${executor.timeoutSec || 5}s)`);
        setVerdict(`Test #${index + 1}: TLE`, 'wa');
      } else if (res.status === 'RTE') {
        tc.verdict = 'RTE';
        tc.actual = res.stderr || 'Runtime Error';
        tc.collapsed = false;
        showCompilationErrorsInEditor(res.stderr);
        showOverallVerdict('rte', 'RUNTIME ERROR', `Runtime error on test #${index + 1}: ${res.stderr || 'Process crashed'}`);
        setVerdict(`Test #${index + 1}: RTE`, 'wa');
      } else {
        tc.actual = res.stdout || '';
        const isMatch = compareOutputs(tc.actual, tc.expected);
        tc.verdict = isMatch ? 'AC' : 'WA';
        if (!isMatch) tc.collapsed = false;
        if (isMatch) {
          showOverallVerdict('ac', 'TESTCASE ACCEPTED', `Test #${index + 1} passed matching expected output.`);
          setVerdict(`Test #${index + 1}: AC`, 'ac');
        } else {
          showOverallVerdict('wa', 'WRONG ANSWER', `Test #${index + 1} output mismatch.`, {
            text: '🔍 View Diff',
            onClick: () => showDiffModal(tc.actual, tc.expected)
          });
          setVerdict(`Test #${index + 1}: WA`, 'wa');
        }
      }
    } catch (e) {
      tc.verdict = 'RTE';
      tc.actual = e.message;
      tc.collapsed = false;
      setVerdict('Execution Error', 'wa');
      showOverallVerdict('rte', 'RUNTIME ERROR', e.message);
    } finally {
      isExecuting = false;
      renderTestcases();
    }
  }

  async function runAllTestcases() {
    if (isExecuting || !editor) return;
    if (testcases.length === 0) {
      showToast('No testcases to run. Click + Add Testcase first.', 'info');
      return;
    }

    isExecuting = true;
    clearEditorErrors();
    setVerdict(`Running ${testcases.length} tests...`, 'running');
    showOverallVerdict('running', 'EXECUTING TESTCASES', `Testing ${testcases.length} testcase(s)...`);

    testcases.forEach(t => {
      t.verdict = 'Running...';
      t.actual = '';
    });
    renderTestcases();

    if (!executor) executor = new CodeExecutor();
    const code = editor.getValue();

    try {
      // Execute testcases with controlled concurrency pool (max 2 parallel) to guarantee fast & stable execution without 429 rate limits
      const queue = testcases.map((tc, idx) => ({ tc, idx }));
      let hadCompileError = false;
      let lastCompileStderr = '';

      const worker = async () => {
        while (queue.length > 0) {
          if (hadCompileError) break;
          const item = queue.shift();
          if (!item) break;
          const { tc, idx } = item;

          try {
            const res = await executor.execute(code, currentLanguage, tc.input);
            tc.timeMs = res.timeMs;
            tc.memoryKb = res.memoryKb;

            const isCe = res.status === 'CE' || res.buildSuccess === false || /syntaxerror|compile error|compilation error/i.test(res.stderr || '');
            if (isCe) {
              tc.verdict = 'CE';
              tc.actual = ''; // Do NOT trigger received output on compilation error
              lastCompileStderr = res.stderr || 'Compilation Error';
              hadCompileError = true;
            } else if (res.status === 'TLE') {
              tc.verdict = 'TLE';
              tc.actual = res.stderr || 'Time Limit Exceeded';
              tc.collapsed = false;
            } else if (res.status === 'RTE') {
              tc.verdict = 'RTE';
              tc.actual = res.stderr || 'Runtime Error';
              tc.collapsed = false;
            } else {
              tc.actual = res.stdout || '';
              const isMatch = compareOutputs(tc.actual, tc.expected);
              tc.verdict = isMatch ? 'AC' : 'WA';
              if (!isMatch) tc.collapsed = false;
            }
          } catch (err) {
            tc.verdict = 'RTE';
            tc.actual = err.message || 'Execution error';
            tc.collapsed = false;
          }
          // Real-time render: update UI as each testcase completes
          renderTestcases();
        }
      };

      const concurrency = Math.min(2, testcases.length);
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      if (hadCompileError && lastCompileStderr) {
        testcases.forEach(t => {
          if (t.verdict === 'Running...' || t.verdict === 'CE') {
            t.verdict = 'CE';
            t.actual = '';
          }
        });
        renderTestcases();

        const parsedErrors = parseStderrLines(lastCompileStderr);
        showCompilationErrorsInEditor(lastCompileStderr);
        updateCompilerView(lastCompileStderr, parsedErrors);
        setVerdict('Compilation Error', 'wa');
        const firstErrorObj = parsedErrors.find(e => e.severity === 'error') || parsedErrors[0];
        const errorBannerDesc = firstErrorObj
          ? `Line ${firstErrorObj.line}: ${firstErrorObj.message} (${parsedErrors.length} error${parsedErrors.length > 1 ? 's' : ''})`
          : 'Compiler reported syntax or type errors.';
        showOverallVerdict('ce', 'COMPILATION FAILED', errorBannerDesc, {
          text: 'View Diagnostics',
          onClick: () => switchRightTab('compiler')
        });
        switchRightTab('compiler');
      } else {
        const passedCount = testcases.filter(t => t.verdict === 'AC').length;
        const allPassed = passedCount === testcases.length;
        if (allPassed) {
          setVerdict(`All ${testcases.length} Tests Passed! 🎉`, 'ac');
          showOverallVerdict('ac', 'ALL TESTS ACCEPTED', `All ${testcases.length} of ${testcases.length} testcases passed successfully!`);
          showToast('All testcases accepted! Ready to submit.', 'success');
        } else {
          const firstFailIdx = testcases.findIndex(t => t.verdict !== 'AC');
          const failCase = testcases[firstFailIdx];
          const failVerdict = failCase ? failCase.verdict : 'WA';
          setVerdict(`${passedCount}/${testcases.length} Passed`, 'wa');
          const verdictTitle = failVerdict === 'TLE' ? 'TIME LIMIT EXCEEDED' : failVerdict === 'RTE' ? 'RUNTIME ERROR' : 'WRONG ANSWER';
          const actionOpt = (failVerdict === 'WA' && failCase) ? {
            text: '🔍 View Diff',
            onClick: () => showDiffModal(failCase.actual, failCase.expected)
          } : null;
          showOverallVerdict(failVerdict.toLowerCase(), verdictTitle, `${passedCount} of ${testcases.length} testcases passed. Test #${firstFailIdx + 1} failed.`, actionOpt);
        }
      }
    } catch (outerErr) {
      setVerdict('Execution Error', 'wa');
      showOverallVerdict('rte', 'EXECUTION ERROR', outerErr.message || 'Unknown error');
    } finally {
      isExecuting = false;
      renderTestcases();
    }
  }

  function compareOutputs(actual, expected) {
    if (actual === undefined || actual === null) actual = '';
    if (expected === undefined || expected === null) expected = '';
    const norm = (s) => (s || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
      .trim();
    const a = norm(actual);
    const e = norm(expected);
    return a === e;
  }

  $('compile-btn').addEventListener('click', compileSolution);
  $('run-all-tests-btn').addEventListener('click', runAllTestcases);

  // Right Panel Tabs: Testcases vs Compiler Diagnostics
  const tabBtnTestcases = $('tab-btn-testcases');
  const tabBtnCompiler = $('tab-btn-compiler');
  if (tabBtnTestcases) tabBtnTestcases.addEventListener('click', () => switchRightTab('testcases'));
  if (tabBtnCompiler) tabBtnCompiler.addEventListener('click', () => switchRightTab('compiler'));
  const clearCompilerBtn = $('clear-compiler-output-btn');
  if (clearCompilerBtn) {
    clearCompilerBtn.addEventListener('click', clearAllVerdicts);
  }
  const ovActionBtn = $('ov-action-btn');
  if (ovActionBtn) {
    ovActionBtn.addEventListener('click', () => switchRightTab('compiler'));
  }
  // Initialize right panel explicitly to testcases tab so compiler view is hidden on start
  switchRightTab('testcases');

  // ── 8. 1-Click Zero-Delay Auto-Submit ────────────────────────────────────────
  async function submitSolution() {
    if (!editor) return;
    const code = editor.getValue();
    if (!code.trim()) {
      showToast('Cannot submit empty code', 'error');
      return;
    }

    if (activeProblem && (activeProblem.platform === 'LC' || activeProblem.platform === 'TP')) {
      showToast('IDE submission is supported for Codeforces, AtCoder, and CSES only.', 'info');
      setVerdict('Unsupported platform', 'idle');
      return;
    }

    setVerdict('Submitting to platform...', 'running');

    try {
      // Find the problem tab across all windows
      const allTabs = await chrome.tabs.query({});
      let targetTab = null;

      if (activeProblem && activeProblem.url) {
        const cleanActiveUrl = activeProblem.url.split('#')[0].split('?')[0];
        targetTab = allTabs.find(t => t.url && t.url.split('#')[0].split('?')[0] === cleanActiveUrl);
      }

      if (!targetTab) {
        // Fallback: find any open CP problem tab
        targetTab = allTabs.find(t => isCpUrl(t.url));
      }

      if (!targetTab || !targetTab.id) {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(code);
        showToast('Problem tab not found! Code copied to clipboard.', 'info');
        setVerdict('Code copied', 'idle');
        return;
      }

      // Send submit message to the detected problem tab content script
      const resp = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'SUBMIT_CODE',
        code: code,
        language: currentLanguage
      }).catch(() => null);

      if (resp && resp.ok) {
        if (resp.method === 'redirect_to_submit') {
          setVerdict('Submitting...', 'running');
          showToast('Opening platform submit page — 1-click submission in progress...', 'info');
        } else {
          setVerdict('Submitted! Watching verdict...', 'running');
          showToast('Solution submitted directly to problem page!', 'success');
        }
        chrome.storage.local.remove(['pendingProblem', 'last_active_problem']).catch(() => {});
        if (targetTab && targetTab.id) {
          chrome.tabs.update(targetTab.id, { active: true }).catch(() => {});
        }
      } else {
        await navigator.clipboard.writeText(code);
        const errMsg = (resp && resp.error) ? `: ${resp.error}` : '! Paste into problem submit form if needed.';
        showToast('Code copied to clipboard' + errMsg, 'info');
        setVerdict('Code copied', 'idle');
      }
    } catch (e) {
      showToast('Submit error: ' + e.message, 'error');
      setVerdict('Submit failed', 'wa');
    }
  }

  $('submit-code-btn').addEventListener('click', submitSolution);

  function setVerdict(text, state = 'idle') {
    const pill = $('global-verdict');
    const label = $('global-verdict-text');
    if (!pill || !label) return;
    pill.className = `verdict-pill verdict-${state}`;
    pill.title = text;
    label.textContent = text;
  }

  // ── 9. Check Pending / Active Problem on Launch ────────────────────────────
  async function checkPendingProblem() {
    try {
      const data = await chrome.storage.local.get(['pendingProblem', 'current_ide_problem']);

      if (data.pendingProblem) {
        const prob = data.pendingProblem;
        await chrome.storage.local.remove('pendingProblem');

        if (prob.platform !== 'LC' && prob.platform !== 'TP') {
          await chrome.storage.local.set({ current_ide_problem: prob });
          await loadProblemData(prob);
          return true;
        }
      }

      // If user refreshed the IDE page or reopened, restore from current_ide_problem!
      if (data.current_ide_problem) {
        const prob = data.current_ide_problem;
        if (prob.platform !== 'LC' && prob.platform !== 'TP') {
          await loadProblemData(prob);
          return true;
        }
      }

      // If neither was in storage, check active tabs in browser for an open CP problem page!
      try {
        const allTabs = await chrome.tabs.query({});
        const match = allTabs.find(t => isCpUrl(t.url));
        if (match) {
          await queryTabForProblem(match);
          if (activeProblem) return true;
        }
      } catch (err) {}
    } catch (e) {
      console.warn('checkPendingProblem error:', e);
    }
    return false;
  }

  let _lastIdeSoundPlayTime = 0;
  function playNotificationSound() {
    const now = Date.now();
    if (now - _lastIdeSoundPlayTime < 2500) return;
    _lastIdeSoundPlayTime = now;
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

  // Listen for runtime messages to load problem or reset to scratchpad dynamically
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PLAY_SOUND') {
      playNotificationSound();
    } else if (msg.type === 'LOAD_PROBLEM' && msg.data) {
      if (msg.data.platform === 'LC' || msg.data.platform === 'TP') return;
      loadProblemData(msg.data);
      showToast(`Loaded problem: ${msg.data.title || 'Active Problem'}`, 'success');
    } else if (msg.type === 'RESET_SCRATCHPAD') {
      resetToScratchpad();
    }
  });

  // ── Reset to Standalone Scratchpad ──────────────────────────────────────────
  function resetToScratchpad() {
    // If there was an active problem, save its code draft before clearing
    if (activeProblem && editor) {
      saveEditorDraft();
    }

    activeProblem = null;
    testcases = [];
    currentProblemCode = null;
    chrome.storage.local.remove(['pendingProblem', 'current_ide_problem', 'last_active_problem']).catch(() => {});

    const clearBtn = $('clear-problem-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const closeTopBtn = $('close-problem-top-btn');
    if (closeTopBtn) closeTopBtn.style.display = 'none';

    $('problem-platform').textContent = 'CP';
    $('problem-platform').className = 'problem-platform-tag';
    $('problem-title').textContent = 'Scratchpad (Standalone IDE)';
    $('problem-title').href = '#';

    const container = $('statement-body');
    container.innerHTML = `
      <div class="statement-empty">
        <div class="empty-icon">💡</div>
        <h3>No Problem Active</h3>
        <p>Navigate to any problem on <strong>Codeforces</strong>, <strong>AtCoder</strong>, or <strong>CSES</strong>, or click <strong>Refresh</strong> in the toolbar to auto-load the statement & testcases.</p>
        <div class="quick-links">
          <a href="https://codeforces.com/problemset" target="_blank" class="quick-link cf">Codeforces</a>
          <a href="https://atcoder.jp/contests" target="_blank" class="quick-link ac">AtCoder</a>
          <a href="https://cses.fi/problemset" target="_blank" class="quick-link cses">CSES</a>
        </div>
      </div>
    `;

    renderTestcases();
    setVerdict('Scratchpad Ready', 'idle');
    loadEditorDraft();
  }

  // Intercept problem title click to switch to existing problem tab instead of duplicating
  $('problem-title')?.addEventListener('click', async (e) => {
    if (!activeProblem || !activeProblem.url || activeProblem.url === '#') return;
    e.preventDefault();
    try {
      const tabs = await chrome.tabs.query({});
      const cleanTarget = activeProblem.url.split('?')[0].split('#')[0].replace(/\/$/, '');
      const existingTab = tabs.find(t => t.url && t.url.split('?')[0].split('#')[0].replace(/\/$/, '') === cleanTarget);
      if (existingTab) {
        await chrome.tabs.update(existingTab.id, { active: true });
        if (existingTab.windowId) await chrome.windows.update(existingTab.windowId, { focused: true }).catch(() => {});
        return;
      }
    } catch (err) {}
    chrome.tabs.create({ url: activeProblem.url });
  });

  // Intercept quick link clicks in empty state to switch to existing tabs without duplicating
  document.addEventListener('click', async (e) => {
    const qLink = e.target.closest('.quick-link');
    if (qLink && qLink.href) {
      e.preventDefault();
      try {
        const tabs = await chrome.tabs.query({});
        const host = new URL(qLink.href).hostname;
        const existingTab = tabs.find(t => t.url && t.url.includes(host));
        if (existingTab) {
          await chrome.tabs.update(existingTab.id, { active: true });
          if (existingTab.windowId) await chrome.windows.update(existingTab.windowId, { focused: true }).catch(() => {});
          return;
        }
      } catch (err) {}
      chrome.tabs.create({ url: qLink.href });
    }
  });

  if ($('clear-problem-btn')) {
    $('clear-problem-btn').addEventListener('click', () => {
      resetToScratchpad();
      showToast('Closed problem. Switched to Clean Scratchpad.', 'info');
    });
  }

  if ($('close-problem-top-btn')) {
    $('close-problem-top-btn').addEventListener('click', () => {
      resetToScratchpad();
      showToast('Closed problem. Switched to Clean Scratchpad.', 'info');
    });
  }

  // ── Problem Tab Lifetime Monitoring ─────────────────────────────────────────
  async function checkActiveProblemStillOpen() {
    if (!activeProblem || !activeProblem.url) return;
    try {
      const allTabs = await chrome.tabs.query({});
      const stillOpen = allTabs.some(t => {
        if (!t || !t.url) return false;
        const cleanTabUrl = t.url.replace(/\/$/, '');
        const cleanProbUrl = activeProblem.url.replace(/\/$/, '');
        if (cleanProbUrl && cleanTabUrl === cleanProbUrl) return true;
        if (activeProblem.sourceTabId && t.id === activeProblem.sourceTabId && isCpUrl(t.url)) return true;
        if (activeProblem.slug && isCpUrl(t.url) && t.url.includes(activeProblem.slug)) return true;
        return false;
      });

      if (!stillOpen) {
        console.log('[CodeSync IDE] Problem tab closed or navigated away in browser. Resetting to scratchpad.');
        resetToScratchpad();
        showToast('Problem tab was closed. Switched to Scratchpad.', 'info');
      }
    } catch (e) {
      console.warn('checkActiveProblemStillOpen error:', e);
    }
  }

  // Listen for tab closure across the browser
  if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      if (activeProblem) {
        setTimeout(checkActiveProblemStillOpen, 100);
      }
    });
  }

  // Listen for tab navigation (e.g., navigating away from the problem URL)
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (activeProblem && changeInfo.url) {
        checkActiveProblemStillOpen();
      }
    });
  }

  // When switching back to the IDE tab or window, verify problem is still open
  window.addEventListener('focus', () => {
    if (activeProblem) {
      checkActiveProblemStillOpen();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeProblem) {
      checkActiveProblemStillOpen();
    }
  });

  // ── 10. Diff Viewer Modal ───────────────────────────────────────────────────
  function showDiffModal(actual, expected) {
    $('diff-actual').textContent = actual || '(empty)';
    $('diff-expected').textContent = expected || '(empty)';
    $('diff-modal').style.display = 'flex';
  }
  $('close-diff-btn').addEventListener('click', () => { $('diff-modal').style.display = 'none'; });

  // ── 11. Templates & Snippets Modal ──────────────────────────────────────────
  $('snippets-btn').addEventListener('click', () => {
    switchModalSubnav('templates');
    $('snippets-modal').style.display = 'flex';
  });
  $('close-snippets-btn').addEventListener('click', () => { $('snippets-modal').style.display = 'none'; });

  $('subnav-templates').addEventListener('click', () => switchModalSubnav('templates'));
  $('subnav-snippets').addEventListener('click', () => switchModalSubnav('snippets'));
  $('subnav-create').addEventListener('click', () => switchModalSubnav('create'));
  $('subnav-create-snippet').addEventListener('click', () => switchModalSubnav('create-snippet'));

  function switchModalSubnav(view) {
    $('subnav-templates').classList.toggle('active', view === 'templates');
    $('subnav-snippets').classList.toggle('active', view === 'snippets');
    $('subnav-create').classList.toggle('active', view === 'create');
    $('subnav-create-snippet').classList.toggle('active', view === 'create-snippet');

    $('tab-content-templates').style.display = view === 'templates' ? 'block' : 'none';
    $('tab-content-snippets').style.display = view === 'snippets' ? 'block' : 'none';
    $('tab-content-create').style.display = view === 'create' ? 'block' : 'none';
    $('tab-content-create-snippet').style.display = view === 'create-snippet' ? 'block' : 'none';

    if (view === 'templates') renderTemplatesModal();
    if (view === 'snippets') renderSnippetsModal();
  }

  async function renderTemplatesModal() {
    const container = $('templates-list');
    container.innerHTML = '';

    const stored = await chrome.storage.local.get(['customTemplates', 'defaultTemplateId']);
    const customTemplates = stored.customTemplates || [];
    const defaultTemplateId = stored.defaultTemplateId || 'mini_cpp';

    const allTemplates = [
      ...(typeof CP_TEMPLATES !== 'undefined' ? CP_TEMPLATES : []),
      ...customTemplates
    ];

    allTemplates.forEach(tpl => {
      const isDef = tpl.id === defaultTemplateId;
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-header">
          <div class="template-title-wrap">
            <span class="template-title">${escapeHtml(tpl.name)}</span>
            <span class="template-lang-badge">${tpl.language}</span>
            ${isDef ? '<span class="template-default-badge">DEFAULT</span>' : ''}
          </div>
        </div>
        <div class="template-desc">${escapeHtml(tpl.description || 'Custom starter template')}</div>
        <div class="template-actions">
          <button class="btn-sm btn-action btn-apply" data-id="${tpl.id}">⚡ Apply to Editor</button>
          ${!isDef ? `<button class="btn-sm btn-outline btn-set-default" data-id="${tpl.id}">⭐ Set as Default</button>` : ''}
          ${!tpl.isBuiltin ? `<button class="btn-sm btn-outline btn-del-tpl" data-id="${tpl.id}" style="color:var(--red);">🗑️ Delete</button>` : ''}
        </div>
      `;

      card.querySelector('.btn-apply').addEventListener('click', () => {
        applyTemplate(tpl.code);
        $('snippets-modal').style.display = 'none';
      });

      const setDefBtn = card.querySelector('.btn-set-default');
      if (setDefBtn) {
        setDefBtn.addEventListener('click', async () => {
          await chrome.storage.local.set({ 
            defaultTemplateId: tpl.id,
            defaultTemplateCode: tpl.code,
            defaultTemplateLang: tpl.language,
            draft_scratchpad: tpl.code
          });
          if (!activeProblem && editor) {
            editor.setValue(tpl.code);
            $('file-dirty-dot').classList.remove('active');
          }
          showToast(`"${tpl.name}" set as default template!`, 'success');
          renderTemplatesModal();
        });
      }

      const delBtn = card.querySelector('.btn-del-tpl');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (confirm(`Delete custom template "${tpl.name}"?`)) {
            const updated = customTemplates.filter(t => t.id !== tpl.id);
            await chrome.storage.local.set({ customTemplates: updated });
            showToast('Template deleted', 'success');
            renderTemplatesModal();
          }
        });
      }

      container.appendChild(card);
    });
  }

  function applyTemplate(code) {
    if (!editor) return;
    const curVal = editor.getValue().trim();
    if (curVal.length > 0 && !curVal.startsWith('// Write your solution here') && curVal !== code.trim()) {
      if (!confirm('Apply this template? This will replace your current editor content cleanly.')) {
        return;
      }
    }
    editor.setValue(code);
    saveEditorDraft();
    $('file-dirty-dot').classList.remove('active');
    showToast('Template applied cleanly to editor!', 'success');
  }

  async function renderSnippetsModal() {
    const container = $('snippets-body');
    const langKey = currentLanguage === 'cpp' ? 'cpp' : currentLanguage === 'python' ? 'python' : 'cpp';
    const builtinSnippets = (typeof CP_SNIPPETS !== 'undefined' && CP_SNIPPETS[langKey]) || [];

    const stored = await chrome.storage.local.get('customSnippets');
    const customList = stored.customSnippets || [];
    const filteredCustom = customList.filter(s => !s.language || s.language === 'all' || s.language === currentLanguage || s.language === langKey);

    container.innerHTML = '';

    if (filteredCustom.length > 0) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:8px;';
      h.textContent = 'User Custom Snippets';
      container.appendChild(h);

      filteredCustom.forEach(snip => {
        const item = document.createElement('div');
        item.className = 'snippet-item';
        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
            <span class="snippet-title">${escapeHtml(snip.label)}</span>
            <span class="snippet-prefix">${escapeHtml(snip.prefix)}</span>
          </div>
          <button class="btn-del-snip" data-id="${snip.id}" style="background:none; border:none; cursor:pointer; color:var(--red); font-size:14px;" title="Delete Snippet">🗑️</button>
        `;
        item.addEventListener('click', (e) => {
          if (e.target.closest('.btn-del-snip')) return;
          insertSnippetAtCursor(snip.body);
          $('snippets-modal').style.display = 'none';
        });
        const delBtn = item.querySelector('.btn-del-snip');
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete snippet "${snip.label}"?`)) {
            const updated = customList.filter(s => s.id !== snip.id);
            await chrome.storage.local.set({ customSnippets: updated });
            showToast('Snippet deleted', 'success');
            renderSnippetsModal();
          }
        });
        container.appendChild(item);
      });

      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px; background:var(--border); margin:12px 0;';
      container.appendChild(sep);
    }

    const hBuiltin = document.createElement('div');
    hBuiltin.style.cssText = 'font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; margin-bottom:8px;';
    hBuiltin.textContent = 'Standard CP Snippets';
    container.appendChild(hBuiltin);

    builtinSnippets.forEach(snip => {
      const item = document.createElement('div');
      item.className = 'snippet-item';
      item.innerHTML = `
        <span class="snippet-title">${escapeHtml(snip.label)}</span>
        <span class="snippet-prefix">${escapeHtml(snip.prefix)}</span>
      `;
      item.addEventListener('click', () => {
        insertSnippetAtCursor(snip.body);
        $('snippets-modal').style.display = 'none';
      });
      container.appendChild(item);
    });
  }

  function insertSnippetAtCursor(snippetBody) {
    if (!editor) return;
    try {
      const snippetContrib = editor.getContribution('snippetController2');
      if (snippetContrib) {
        snippetContrib.insert(snippetBody);
      } else {
        editor.trigger('keyboard', 'type', { text: snippetBody });
      }
      showToast('Snippet inserted!', 'success');
    } catch (e) {
      editor.trigger('keyboard', 'type', { text: snippetBody });
    }
  }

  // Save Custom Template Handler
  $('save-custom-template-btn').addEventListener('click', async () => {
    const name = $('custom-template-name').value.trim();
    const lang = $('custom-template-lang').value;
    const code = $('custom-template-code').value.trim();
    const isDefault = $('custom-template-default').checked;

    if (!name || !code) {
      showToast('Please enter both template name and code', 'error');
      return;
    }

    const newId = 'custom_' + Date.now();
    const newTpl = {
      id: newId,
      name: name,
      language: lang,
      code: code,
      isBuiltin: false,
      description: `User-defined custom template for ${lang.toUpperCase()}`
    };

    const stored = await chrome.storage.local.get(['customTemplates', 'defaultTemplateId']);
    const list = stored.customTemplates || [];
    list.push(newTpl);

    const updateObj = { customTemplates: list };
    if (isDefault) updateObj.defaultTemplateId = newId;

    await chrome.storage.local.set(updateObj);
    showToast('Custom template saved!', 'success');

    $('custom-template-name').value = '';
    $('custom-template-code').value = '';
    $('custom-template-default').checked = false;
    switchModalSubnav('templates');
  });

  $('cancel-custom-template-btn').addEventListener('click', () => {
    switchModalSubnav('templates');
  });

  // Save Custom Snippet Handler
  $('save-custom-snippet-btn').addEventListener('click', async () => {
    const name = $('custom-snippet-name').value.trim();
    const prefix = $('custom-snippet-prefix').value.trim();
    const lang = $('custom-snippet-lang').value;
    const code = $('custom-snippet-code').value.trim();

    if (!name || !prefix || !code) {
      showToast('Please enter snippet name, trigger prefix, and code', 'error');
      return;
    }

    const newId = 'custom_snip_' + Date.now();
    const newSnip = {
      id: newId,
      label: name,
      prefix: prefix,
      language: lang,
      body: code,
      description: `Custom snippet (${prefix})`
    };

    const stored = await chrome.storage.local.get('customSnippets');
    const list = stored.customSnippets || [];
    list.push(newSnip);

    await chrome.storage.local.set({ customSnippets: list });
    showToast('Custom snippet saved!', 'success');

    $('custom-snippet-name').value = '';
    $('custom-snippet-prefix').value = '';
    $('custom-snippet-code').value = '';
    switchModalSubnav('snippets');
  });

  $('cancel-custom-snippet-btn').addEventListener('click', () => {
    switchModalSubnav('snippets');
  });



  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(msg, type = 'info') {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    t.style.borderColor = type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--border)';
    setTimeout(() => { t.style.display = 'none'; }, 3500);
  }

  // ── 13. Resizable Panels (Gutters) ──────────────────────────────────────────
  function setupResizers() {
    const gutter1 = $('gutter-1');
    const gutter2 = $('gutter-2');
    const statement = $('panel-statement');
    const cph = $('panel-cph');

    let isResizing = false;
    let currentGutter = null;

    [gutter1, gutter2].forEach(g => {
      g.addEventListener('mousedown', (e) => {
        isResizing = true;
        currentGutter = g;
        g.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      if (currentGutter === gutter1) {
        const newWidth = Math.max(200, Math.min(600, e.clientX));
        statement.style.width = `${newWidth}px`;
      } else if (currentGutter === gutter2) {
        const newWidth = Math.max(250, Math.min(650, window.innerWidth - e.clientX));
        cph.style.width = `${newWidth}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        if (currentGutter) currentGutter.classList.remove('dragging');
        document.body.style.cursor = 'default';
        if (editor) editor.layout();
      }
    });

    // Statement panel collapse & expand toggle
    function toggleStatementPanel(show) {
      const isCurrentlyHidden = statement.style.display === 'none';
      const shouldShow = show !== undefined ? show : isCurrentlyHidden;
      if (shouldShow) {
        statement.style.display = 'flex';
        gutter1.style.display = 'block';
        if ($('expand-statement-btn')) $('expand-statement-btn').style.display = 'none';
        $('collapse-statement-btn').textContent = '◀';
      } else {
        statement.style.display = 'none';
        gutter1.style.display = 'none';
        if ($('expand-statement-btn')) $('expand-statement-btn').style.display = 'flex';
        $('collapse-statement-btn').textContent = '▶';
      }
      if (editor) editor.layout();
    }

    $('collapse-statement-btn').addEventListener('click', () => toggleStatementPanel(false));
    if ($('expand-statement-btn')) {
      $('expand-statement-btn').addEventListener('click', () => toggleStatementPanel(true));
    }
  }



  // ── Initialize ─────────────────────────────────────────────────────────────
  setupResizers();
  setupCustomDropdowns();
  initMonaco();
  // Clean up legacy last_active_problem from storage if present
  chrome.storage.local.remove('last_active_problem').catch(() => {});

  checkPendingProblem().then((loaded) => {
    if (!loaded) {
      // Standalone launch without pending problem: ensure clean Scratchpad mode
      resetToScratchpad();
    }
  });
})();

