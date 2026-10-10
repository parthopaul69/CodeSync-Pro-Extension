// CodeSync Pro — Toph Content Script v2.0
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

  // ── URL & Page Inspection ───────────────────────────────────────────────────
  function is404Page() {
    var title = document.title || '';
    if (title.includes('Page Not Found') || title.includes('404')) return true;
    var bText = document.body ? (document.body.innerText || '') : '';
    if (bText.includes('404 Not Found') || bText.includes("We cannot find the page you're looking for")) return true;
    return false;
  }

  function hasRealProblemStatement() {
    if (is404Page()) return false;

    var path = window.location.pathname || '';
    var hash = window.location.hash || '';

    // Non-problem views in arena or main site
    if (hash.includes('standing') || hash.includes('dashboard') || hash.includes('submission') || hash.includes('announcement')) {
      return false;
    }
    if (path === '/arena' && (!hash || hash.includes('standing') || hash.includes('dashboard') || hash === '#!' || hash === '#')) {
      return false;
    }
    if (path.startsWith('/u/') || path.startsWith('/contests') || path.startsWith('/standings') || path.startsWith('/login') || path.startsWith('/register')) {
      return false;
    }

    // Must have a real problem statement container in DOM
    var statementEl = document.querySelector('.artifact, .panel__body, .problem-statement, .problem-body, .pview, article, .arena__problem, .arena__statement');
    var titleEl = document.querySelector('.artifact__caption h1, .pview__head h1, h1.problem-title, .problem-statement h1, .content-section h1, .arena__head h1, h1');
    if (statementEl && titleEl && statementEl.textContent.trim().length > 50) {
      var sText = statementEl.textContent.trim().toLowerCase();
      if (!sText.includes('standings') && !sText.includes('log in') && !sText.includes('sign up')) {
        return true;
      }
    }
    return false;
  }

  function getProblemSlug() {
    if (is404Page()) return null;

    var path = window.location.pathname || '';
    var hash = window.location.hash || '';

    // Ignore non-problem routes
    if (hash.includes('standing') || hash.includes('dashboard') || hash.includes('announcement')) {
      return null;
    }

    // 1. Check direct problem links on page (e.g. on submission page /s/ or table)
    var probLink = document.querySelector('a[href*="/p/"]:not([href="/problems"]):not([href*="standing"]), a[href*="/problems/"]:not([href="/problems"]):not([href*="standing"])');
    if (probLink) {
      var plm = (probLink.getAttribute('href') || '').match(/(?:\/c\/[a-zA-Z0-9_-]+)?\/(?:p|problems)\/([a-zA-Z0-9_-]+)/);
      if (plm && plm[1] && plm[1] !== 'submit' && plm[1] !== 'filter') {
        if (isSubmissionPage() || !hasRealProblemStatement()) {
          return plm[1];
        }
      }
    }

    // 2. Contest arena hash route: #!/p/problem-slug
    if (hash) {
      var hm = hash.match(/#!\/p\/([a-zA-Z0-9_-]+)/) || hash.match(/\/(?:p|problems?)\/([a-zA-Z0-9_-]+)/);
      if (hm && hm[1] && hm[1] !== 'submit' && !hm[1].startsWith('standing')) {
        return hm[1];
      }
    }

    // 3. Direct problem path: /p/problem-slug or /c/contest-slug/p/problem-slug or /problems/slug
    var m = path.match(/\/(?:p|problems?)\/([a-zA-Z0-9_-]+)/);
    if (m && m[1] && m[1] !== 'submit' && m[1] !== 'filter' && m[1] !== 'all') {
      return m[1];
    }

    // 4. Fallback: check active problem link in arena sidebar
    var activeProb = document.querySelector('.arena__nav .active a, a.active[href*="/p/"], li.active a[href*="/p/"], a.active[href*="/problems/"], li.active a[href*="/problems/"]');
    if (activeProb) {
      var am = (activeProb.getAttribute('href') || '').match(/\/(?:p|problems?)\/([a-zA-Z0-9_-]+)/);
      if (am && am[1] && am[1] !== 'submit') return am[1];
    }

    if (probLink) {
      var plm2 = (probLink.getAttribute('href') || '').match(/(?:\/c\/[a-zA-Z0-9_-]+)?\/(?:p|problems)\/([a-zA-Z0-9_-]+)/);
      if (plm2 && plm2[1] && plm2[1] !== 'submit') return plm2[1];
    }

    return null;
  }

  function getContestSlug() {
    var m = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
    if (m && m[1] !== 'contests' && m[1] !== 'host') return m[1];
    var cLink = document.querySelector('a[href^="/c/"]:not([href="/contests"]):not([href="/contests/host"])');
    if (cLink) {
      var cm = (cLink.getAttribute('href') || '').match(/\/c\/([a-zA-Z0-9_-]+)/);
      if (cm && cm[1] && cm[1] !== 'contests' && cm[1] !== 'host') return cm[1];
    }
    var pMatch = window.location.search.match(/(?:practice|contest)=([a-zA-Z0-9_-]+)/);
    if (pMatch) return pMatch[1];
    return null;
  }

  function getContestName() {
    var cLink = document.querySelector('a[href^="/c/"]:not([href="/contests"]):not([href="/contests/host"])');
    if (cLink && cLink.textContent.trim()) return cLink.textContent.trim();
    var cTitle = document.querySelector('.arena__contest-title, .contest-title, .breadcrumb a[href^="/c/"]');
    if (cTitle && cTitle.textContent.trim()) return cTitle.textContent.trim();
    return '';
  }

  function isSubmissionPage() {
    return /\/s\/\d+/.test(window.location.pathname);
  }

  function getSubmissionId() {
    var m = window.location.pathname.match(/\/s\/(\d+)/);
    return m ? m[1] : null;
  }

  // ── Problem Data Extraction ──────────────────────────────────────────────────
  function getProblemTitle() {
    // 1. If on submission page or table, the link to the problem is the most accurate title
    var probLink = document.querySelector('a[href*="/p/"]:not([href="/problems"]):not([href*="standing"])');
    if (probLink && probLink.textContent.trim()) {
      var plText = probLink.textContent.trim().replace(/^[A-Z0-9]\.\s+/, '').trim();
      if (plText && !plText.toLowerCase().includes('standings') && !plText.toLowerCase().includes('problems')) {
        if (isSubmissionPage() || !hasRealProblemStatement()) {
          return plText;
        }
      }
    }

    // 2. In arena, active nav item is most accurate
    var activeItem = document.querySelector('.arena__nav .active, [class*="problem"].active');
    if (activeItem) {
      var itemText = activeItem.textContent.trim().replace(/^[A-Z0-9]\.\s+/, '').trim();
      if (itemText && !itemText.toLowerCase().includes('standings') && !itemText.toLowerCase().includes('dashboard')) return itemText;
    }

    var selectors = [
      '.artifact__caption h1',
      '.pview__head h1',
      'h1.problem-title',
      '.problem-statement h1',
      '.content-section h1',
      '.arena__head h1',
      '.pview h1',
      '.panel__title h1'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        var text = el.textContent.trim();
        text = text.replace(/^[A-Z0-9]\.\s+/, '').replace(/^\d+\.\s+/, '').trim();
        if (text && text !== 'Toph' && !text.includes('Not Found') && !text.includes('Standings')) {
          return text;
        }
      }
    }

    if (probLink && probLink.textContent.trim()) {
      var plFallback = probLink.textContent.trim().replace(/^[A-Z0-9]\.\s+/, '').trim();
      if (plFallback && !plFallback.toLowerCase().includes('standings')) return plFallback;
    }

    var slug = getProblemSlug() || '';
    return slug.split('-').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  function getProblemLimits() {
    var limits = { timeLimit: '', memoryLimit: '' };
    var limitEls = document.querySelectorAll('.pview__limits .pview__limit, .pview__limits .chip, [class*="limit"], .problem-limits span, .limit-info span, td');
    limitEls.forEach(function(el) {
      var text = el.textContent.trim();
      if (/cpu|time/i.test(text)) {
        var match = text.match(/(\d+(?:\.\d+)?\s*(?:s|ms|second)s?)/i);
        if (match && !limits.timeLimit) limits.timeLimit = match[1];
      }
      if (/memory|mem/i.test(text)) {
        var match = text.match(/(\d+\s*(?:MB|KB|GB))/i);
        if (match && !limits.memoryLimit) limits.memoryLimit = match[1];
      }
    });

    if (!limits.timeLimit) {
      var cpuMatch = (document.body.innerText || '').match(/CPU\s*(\d+(?:\.\d+)?\s*(?:s|ms|second)s?)/i);
      if (cpuMatch) limits.timeLimit = cpuMatch[1];
    }
    if (!limits.memoryLimit) {
      var memMatch = (document.body.innerText || '').match(/Memory\s*(\d+\s*(?:MB|KB|GB))/i);
      if (memMatch) limits.memoryLimit = memMatch[1];
    }

    if (!limits.timeLimit) limits.timeLimit = '1s';
    if (!limits.memoryLimit) limits.memoryLimit = '512 MB';

    return limits;
  }

  function getSampleTestCases() {
    var samples = [];
    var sampleBoxes = document.querySelectorAll('.pview__sample, .sample');
    if (sampleBoxes.length > 0) {
      sampleBoxes.forEach(function(box) {
        var cells = box.querySelectorAll('.pview__samplecell, .sample__cell, [class*="samplecell"]');
        var inp = '', out = '';
        if (cells.length >= 2) {
          cells.forEach(function(cell) {
            var label = cell.querySelector('.pview__samplelabel, label, span, strong');
            var pre = cell.querySelector('pre');
            if (label && pre) {
              var lText = label.textContent.toLowerCase();
              if (lText.includes('input')) inp = pre.textContent.trim();
              else if (lText.includes('output')) out = pre.textContent.trim();
            }
          });
        }
        if (!inp && !out) {
          var pres = box.querySelectorAll('pre');
          if (pres.length >= 2) {
            inp = pres[0].textContent.trim();
            out = pres[1].textContent.trim();
          }
        }
        if (inp || out) samples.push({ input: inp, output: out });
      });
      if (samples.length > 0) return samples;
    }

    var sampleSections = document.querySelectorAll('.sample-test, .sample, [class*="sample"], .example, [class*="example"]');
    if (sampleSections.length > 0) {
      sampleSections.forEach(function(section) {
        var pres = section.querySelectorAll('pre');
        if (pres.length >= 2) {
          for (var j = 0; j < pres.length; j += 2) {
            if (pres[j + 1]) {
              samples.push({
                input: pres[j].textContent.trim(),
                output: pres[j + 1].textContent.trim()
              });
            }
          }
        }
      });
      if (samples.length > 0) return samples;
    }

    var allPre = document.querySelectorAll('pre');
    var inputs = [];
    var outputs = [];

    allPre.forEach(function(pre) {
      var prevText = '';
      var prev = pre.previousElementSibling;
      while (prev && !prevText) {
        prevText = (prev.textContent || '').trim().toLowerCase();
        prev = prev.previousElementSibling;
      }
      var parent = pre.parentElement;
      if (parent) {
        var parentHeading = parent.querySelector('h2, h3, h4, strong, b');
        if (parentHeading) {
          prevText = prevText || parentHeading.textContent.trim().toLowerCase();
        }
      }

      if (prevText.includes('sample input') || prevText.includes('input')) {
        inputs.push(pre.textContent.trim());
      } else if (prevText.includes('sample output') || prevText.includes('output')) {
        outputs.push(pre.textContent.trim());
      }
    });

    for (var i = 0; i < Math.min(inputs.length, outputs.length); i++) {
      samples.push({ input: inputs[i], output: outputs[i] });
    }
    return samples;
  }

  function parseTophDomToMd(rootEl) {
    if (!rootEl) return '';
    var clone = rootEl.cloneNode(true);

    // 1. Remove title h1, caption, buttons, actions, forms, svgs
    var toRemove = clone.querySelectorAll('.artifact__caption, h1, .artifact__actions, button, svg, script, style, form');
    toRemove.forEach(function(r) { r.remove(); });

    // 2. Convert KaTeX to pure LaTeX ($...$ or $$...$$)
    var katexEls = clone.querySelectorAll('.katex');
    katexEls.forEach(function(kEl) {
      var ann = kEl.querySelector('annotation[encoding*="tex"]');
      if (ann && ann.textContent.trim()) {
        var tex = ann.textContent.trim();
        var isDisplay = kEl.classList.contains('katex-display') || (kEl.parentElement && kEl.parentElement.classList.contains('katex-display'));
        var mathText = isDisplay ? '\n\n$$' + tex + '$$\n\n' : '$' + tex + '$';
        kEl.replaceWith(document.createTextNode(mathText));
      } else {
        kEl.replaceWith(document.createTextNode(kEl.textContent.trim()));
      }
    });

    var texScripts = clone.querySelectorAll('script[type*="tex"]');
    texScripts.forEach(function(s) {
      var tex = s.textContent.trim();
      if (tex) s.replaceWith(document.createTextNode('$' + tex + '$'));
    });

    // 3. Convert .pview__sectionhead / [role="heading"] to standard Markdown heading markers
    var sectionHeads = clone.querySelectorAll('.pview__sectionhead, [role="heading"], h2, h3, h4');
    sectionHeads.forEach(function(hEl) {
      var title = hEl.textContent.trim();
      hEl.replaceWith(document.createTextNode('\n\n## ' + title + '\n\n'));
    });

    // 4. Convert .pview__sample sample blocks
    var sampleBlocks = clone.querySelectorAll('.pview__sample');
    sampleBlocks.forEach(function(sampleEl) {
      var cells = sampleEl.querySelectorAll('.pview__samplecell');
      var sampleText = '\n';
      cells.forEach(function(cell) {
        var labelEl = cell.querySelector('.pview__samplelabel');
        var preEl = cell.querySelector('pre');
        var label = labelEl ? labelEl.textContent.trim() : '';
        var content = preEl ? preEl.textContent.replace(/\r\n/g, '\n').trim() : '';
        if (label && content) {
          sampleText += '**' + label + '**\n```\n' + content + '\n```\n\n';
        } else if (content) {
          sampleText += '```\n' + content + '\n```\n\n';
        }
      });
      sampleEl.replaceWith(document.createTextNode(sampleText));
    });

    // 5. Standard tags
    clone.querySelectorAll('p').forEach(function(p) {
      p.replaceWith(document.createTextNode('\n\n' + p.textContent.trim() + '\n\n'));
    });
    clone.querySelectorAll('strong, b').forEach(function(b) {
      b.replaceWith(document.createTextNode('**' + b.textContent.trim() + '**'));
    });
    clone.querySelectorAll('em, i').forEach(function(iEl) {
      iEl.replaceWith(document.createTextNode('*' + iEl.textContent.trim() + '*'));
    });
    clone.querySelectorAll('code').forEach(function(c) {
      if (c.parentElement && c.parentElement.tagName.toLowerCase() === 'pre') return;
      c.replaceWith(document.createTextNode('`' + c.textContent.trim() + '`'));
    });
    clone.querySelectorAll('pre').forEach(function(pr) {
      pr.replaceWith(document.createTextNode('\n```\n' + pr.textContent.trim() + '\n```\n'));
    });
    clone.querySelectorAll('br').forEach(function(br) {
      br.replaceWith(document.createTextNode('\n'));
    });
    clone.querySelectorAll('li').forEach(function(li) {
      li.replaceWith(document.createTextNode('\n- ' + li.textContent.trim()));
    });
    clone.querySelectorAll('a').forEach(function(a) {
      var href = a.getAttribute('href');
      var aText = a.textContent.trim();
      if (href && aText && !href.startsWith('#')) {
        a.replaceWith(document.createTextNode('[' + aText + '](' + href + ')'));
      } else {
        a.replaceWith(document.createTextNode(aText));
      }
    });

    var text = clone.textContent || '';
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\r\n/g, '\n');

    // CRITICAL: Strip leading spaces / tabs from non-code lines
    var lines = text.split('\n');
    var inCode = false;
    for (var idx = 0; idx < lines.length; idx++) {
      var l = lines[idx];
      if (l.trim().startsWith('```')) {
        inCode = !inCode;
        lines[idx] = l.trim();
      } else if (!inCode) {
        lines[idx] = l.replace(/^[ \t]+/, '');
      }
    }
    text = lines.join('\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  function getProblemStatement() {
    var selectors = [
      '.artifact__caption ~ .artifact__content',
      '.artifact__content',
      '.panel__body .artifact',
      '.pview .panel__body .artifact',
      '.panel__body',
      '.problem-statement',
      '.problem-body',
      '.content-section .body',
      '.problem-text',
      '.arena__problem',
      '.arena__statement',
      '.arena-content',
      'article',
      '.markdown-body'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim().length > 30) {
        return parseTophDomToMd(el);
      }
    }
    return '';
  }

  // ── Code Extraction ──────────────────────────────────────────────────────────
  function getCode() {
    // 1. CodeMirror 6
    var cmContent = document.querySelector('.cm-content');
    if (cmContent) {
      var lines = cmContent.querySelectorAll('.cm-line');
      if (lines.length > 0) {
        return Array.from(lines).map(function(l) { return l.textContent; }).join('\n');
      }
      return cmContent.textContent || '';
    }

    // 2. CodeMirror 5
    var cm5 = document.querySelector('.CodeMirror');
    if (cm5 && cm5.CodeMirror) {
      return cm5.CodeMirror.getValue();
    }

    // 3. Ace Editor (DOM text layer or window.ace)
    var aceEl = document.querySelector('.ace_editor');
    if (aceEl) {
      var aceLines = aceEl.querySelectorAll('.ace_line');
      if (aceLines.length > 0) {
        return Array.from(aceLines).map(function(l) { return l.textContent; }).join('\n');
      }
      var aceText = aceEl.querySelector('textarea.ace_text-input');
      if (aceText && aceText.value && aceText.value.length > 5) return aceText.value;
      if (window.ace) {
        try {
          var ed = window.ace.edit(aceEl);
          if (ed) return ed.getValue();
        } catch(e) {}
      }
    }

    // 4. Textareas
    var textarea = document.querySelector('textarea[name="source"], textarea.code-editor, textarea#source, textarea[name*="code"]');
    if (textarea && textarea.value && textarea.value.trim().length > 5) return textarea.value;

    // 5. Pre/code blocks (submission view, etc.)
    var codeBlocks = document.querySelectorAll('pre code, pre.code, .source-code pre, .source-viewer pre, .panel__body pre, .artifact pre');
    for (var k = 0; k < codeBlocks.length; k++) {
      var cb = codeBlocks[k];
      if (cb && cb.textContent && cb.textContent.trim().length > 5) {
        if (!cb.closest('.pview__sample, .pview__samplecell, .sample, .sample-test')) {
          return cb.textContent;
        }
      }
    }

    // 6. Generic pre fallback outside sample blocks
    var allPre = document.querySelectorAll('pre');
    for (var p = 0; p < allPre.length; p++) {
      var pr = allPre[p];
      if (pr && pr.textContent && pr.textContent.trim().length > 10) {
        if (!pr.closest('.pview__sample, .pview__samplecell, .sample, .sample-test')) {
          return pr.textContent;
        }
      }
    }

    return null;
  }

  function getLanguage() {
    var selectors = [
      'select[name="language"] option:checked',
      'select[name="languageId"] option:checked',
      'button[class*="language"]',
      '.language-selector button',
      '.language-picker .selected',
      '[data-language]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        var text = (el.textContent || el.getAttribute('data-language') || '').trim().toLowerCase();
        if (text) return text;
      }
    }
    return 'cpp';
  }

  // ── Submission Page Data ─────────────────────────────────────────────────────
  function getSubmissionVerdict() {
    var verdictSelectors = [
      '.verdict',
      '.badge',
      '.label',
      '[class*="verdict"]',
      '[class*="status"]'
    ];
    for (var i = 0; i < verdictSelectors.length; i++) {
      var els = document.querySelectorAll(verdictSelectors[i]);
      for (var j = 0; j < els.length; j++) {
        var text = els[j].textContent.trim().toLowerCase();
        if (text === 'accepted' || text === 'ac') return 'Accepted';
        if (text.includes('wrong answer')) return 'Wrong Answer';
        if (text.includes('time limit') || text.includes('cpu limit')) return 'TLE';
        if (text.includes('memory limit')) return 'MLE';
        if (text.includes('runtime error')) return 'RTE';
        if (text.includes('compilation error')) return 'CE';
      }
    }
    return null;
  }

  function getSubmissionStats() {
    var stats = { runtime: 0, memory: 0, language: '' };
    var allText = document.body.textContent || '';

    var rtMatch = allText.match(/(?:CPU|Time|Runtime)[:\s]*(\d+(?:\.\d+)?)\s*(ms|s)/i);
    if (rtMatch) {
      stats.runtime = rtMatch[2] === 's' ? parseFloat(rtMatch[1]) * 1000 : parseFloat(rtMatch[1]);
    }

    var memMatch = allText.match(/(?:Memory|Mem)[:\s]*(\d+(?:\.\d+)?)\s*(KB|MB|B)/i);
    if (memMatch) {
      stats.memory = memMatch[2] === 'MB' ? parseFloat(memMatch[1]) * 1024 : parseFloat(memMatch[1]);
    }

    var langMatch = allText.match(/(?:Language)[:\s]*([\w+# .]+)/i);
    if (langMatch) stats.language = langMatch[1].trim();

    return stats;
  }

  // ── Verdict Detection via MutationObserver ─────────────────────────────────
  function watchForVerdict() {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        var nodes = mutation.addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          var text = (node.textContent || '').trim().toLowerCase();

          if (text === 'accepted' || text === 'ac' ||
              (node.classList && (node.classList.contains('verdict-ac') ||
               node.classList.contains('text-verdict-ac') ||
               node.classList.contains('badge-success') ||
               node.classList.contains('label-success')))) {
            handleAccepted();
            return;
          }

          var verdictEl = node.querySelector && node.querySelector('.verdict, .badge-success, [class*="verdict-ac"], .text-verdict-ac');
          if (verdictEl) {
            var vText = verdictEl.textContent.trim().toLowerCase();
            if (vText.includes('accepted') || vText === 'ac') {
              handleAccepted();
              return;
            }
          }
        }

        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          var target = mutation.target;
          var targetText = (target.textContent || '').trim().toLowerCase();
          if (targetText === 'accepted' || targetText === 'ac') {
            handleAccepted();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-verdict']
    });

    return observer;
  }

  function handleAccepted() {
    if (!isContextValid()) return;
    if (syncCooldown) return;

    var slug = getProblemSlug();
    var title = getProblemTitle();
    var titleSlug = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
    var effectiveSlug = slug || titleSlug;
    if (!effectiveSlug) return;
    if (lastSyncedSlug === effectiveSlug) return;

    syncCooldown = true;
    lastSyncedSlug = effectiveSlug;

    var proceedWithCode = function(validCode) {
      if (!validCode || validCode.trim().length < 5) {
        syncCooldown = false;
        lastSyncedSlug = null;
        return;
      }

      var language = getLanguage();
      var limits = getProblemLimits();
      var contestSlug = getContestSlug();
      var contestName = getContestName();
      var samples = getSampleTestCases();
      var stats = getSubmissionStats();
      var statement = getProblemStatement();
      var subId = getSubmissionId();

      // If statement not in DOM (e.g. on submission page /s/2122528), check storage cache
      var checkCacheAndSync = function(finalStmt) {
        var data = {
          slug: effectiveSlug,
          title: title,
          code: validCode,
          language: language,
          timeLimit: limits.timeLimit,
          memoryLimit: limits.memoryLimit,
          contestSlug: contestSlug || '',
          contestName: contestName || '',
          category: contestSlug ? 'Contest' : 'Practice',
          runtime: stats.runtime,
          memory: stats.memory,
          url: window.location.href,
          samples: samples,
          statement: finalStmt || '',
          subId: subId || ''
        };

        console.log('[CodeSync Pro] Toph Accepted! Syncing:', title);

        chrome.runtime.sendMessage({ type: 'SYNC_TOPH', data: data }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('[CodeSync Pro] Toph sync message error:', chrome.runtime.lastError.message);
            syncCooldown = false;
            lastSyncedSlug = null;
            return;
          }
          if (response && response.ok) {
            console.log('[CodeSync Pro] Toph sync successful!');
            injectSignatureUnderQuestion();
          } else {
            console.warn('[CodeSync Pro] Toph sync failed:', response && response.error);
            syncCooldown = false;
            lastSyncedSlug = null;
          }
        });

        setTimeout(function() { syncCooldown = false; }, 10000);
      };

      if (!statement || statement.length < 20) {
        chrome.storage.local.get([
          'tp_prob_' + effectiveSlug,
          'tp_prob_' + titleSlug,
          'tp_prob_title_' + (title ? title.toLowerCase().trim() : ''),
          'tp_last_active_problem'
        ], function(stored) {
          var found = stored['tp_prob_' + effectiveSlug] || stored['tp_prob_' + titleSlug] ||
                      stored['tp_prob_title_' + (title ? title.toLowerCase().trim() : '')] ||
                      stored['tp_last_active_problem'];
          var s = '';
          if (found && (found.statement || found.bodyMarkdown || found.body)) {
            s = found.statement || found.bodyMarkdown || found.body;
            if (!limits.timeLimit && found.timeLimit) limits.timeLimit = found.timeLimit;
            if (!limits.memoryLimit && found.memoryLimit) limits.memoryLimit = found.memoryLimit;
            if ((!samples || samples.length === 0) && found.samples) samples = found.samples;
            if (!contestSlug && found.contestSlug) contestSlug = found.contestSlug;
            if (!contestName && found.contestName) contestName = found.contestName;
          }
          checkCacheAndSync(s);
        });
      } else {
        checkCacheAndSync(statement);
      }
    };

    var code = getCode();
    if (!code || code.trim().length < 5) {
      chrome.storage.local.get(['tp_last_submitted_code_' + effectiveSlug, 'tp_last_submitted_code'], function(sc) {
        var fallbackCode = sc['tp_last_submitted_code_' + effectiveSlug] || sc['tp_last_submitted_code'];
        if (fallbackCode && fallbackCode.trim().length >= 5) {
          proceedWithCode(fallbackCode);
        } else {
          syncCooldown = false;
          lastSyncedSlug = null;
        }
      });
      return;
    }
    proceedWithCode(code);
  }

  // Remove legacy "Synced to GitHub" floating badge if present in DOM
  var strayBadge = document.getElementById('codesync-pro-badge');
  if (strayBadge) strayBadge.remove();

  function injectSignatureUnderQuestion() {
    if (document.getElementById('codesync-toph-signature')) return;
    var selectors = [
      '.panel__body .artifact',
      '.pview .panel__body .artifact',
      '.panel__body',
      '.problem-statement',
      '.problem-body',
      '.content-section .body',
      '.problem-text',
      'article',
      '.markdown-body'
    ];
    var container = null;
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) { container = el; break; }
    }
    if (!container) return;

    var sig = document.createElement('div');
    sig.id = 'codesync-toph-signature';
    sig.style.cssText = 'margin-top:24px;padding:12px 0 6px 0;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:8px;font-family:Inter,-apple-system,sans-serif;';
    sig.innerHTML = '<span style="color:#22c55e;font-size:14px;">⚡</span><span>Solved & Synced with <strong style="color:#22c55e;">CodeSync Pro</strong></span>';
    container.appendChild(sig);
  }

  // ── Check if already synced ────────────────────────────────────────────────
  function checkIfAlreadySynced() {
    var slug = getProblemSlug();
    var title = getProblemTitle();
    var titleSlug = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
    if (!slug && !titleSlug) return;

    chrome.storage.local.get(['syncLog', 'ghOwner', 'ghRepo'], function(data) {
      if (chrome.runtime.lastError) return;
      var syncLog = data.syncLog || [];
      var match = syncLog.find(function(entry) {
        if (entry.platform !== 'TP' || !entry.problemCode) return false;
        var pCode = entry.problemCode.toLowerCase();
        return (slug && pCode.includes(slug.toLowerCase())) ||
               (titleSlug && pCode.includes(titleSlug)) ||
               (title && entry.problemName && entry.problemName.toLowerCase() === title.toLowerCase());
      });
      if (match) {
        injectSignatureUnderQuestion();
      }
    });
  }

  // ── Problem detection bridge & Audio for IDE/Side Panel / Smart Sync ──────
  var lastContentSoundPlayTime = 0;
  function playNotificationSound() {
    var now = Date.now();
    if (now - lastContentSoundPlayTime < 2500) return;
    lastContentSoundPlayTime = now;
    chrome.storage.local.get(['soundEnabled'], function(d) {
      if (d && d.soundEnabled === false) return;
      try {
        var url = chrome.runtime.getURL('noti.mp3');
        var audio = new Audio(url);
        audio.volume = 1.0;
        var p = audio.play();
        if (p && p.catch) {
          p.catch(function() {
            try {
              var AudioContextClass = window.AudioContext || window.webkitAudioContext;
              if (!AudioContextClass) return;
              var ctx = new AudioContextClass();
              fetch(url)
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(b) { return ctx.decodeAudioData(b); })
                .then(function(buf) {
                  var src = ctx.createBufferSource();
                  src.buffer = buf;
                  src.connect(ctx.destination);
                  src.start(0);
                }).catch(function() {});
            } catch(e) {}
          });
        }
      } catch(e) {}
    });
  }

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'PLAY_SOUND') {
      playNotificationSound();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'FETCH_URL' && msg.url) {
      fetch(msg.url, { credentials: 'include' })
        .then(function(resp) { return resp.text(); })
        .then(function(text) { sendResponse({ ok: true, text: text }); })
        .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
      return true;
    }

  });

  function detectAndStoreUserHandle() {
    try {
      var links = document.querySelectorAll('a[href^="/u/"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        var m = href.match(/^\/u\/([a-zA-Z0-9_-]+)/);
        if (m && m[1]) {
          var h = m[1].trim();
          var lower = h.toLowerCase();
          if (lower !== 'settings' && lower !== 'notifications' && lower !== 'messages' && lower !== 'logout') {
            chrome.storage.local.get(['tpHandle'], function(res) {
              if (!res || !res.tpHandle) {
                chrome.storage.local.set({ tpHandle: h });
              }
            });
            break;
          }
        }
      }
    } catch(e) {}
  }

  // ── Problem Caching Helper ────────────────────────────────────────────────
  function cacheCurrentProblem() {
    if (!isContextValid()) return;
    if (!hasRealProblemStatement()) return;

    var slug = getProblemSlug();
    var title = getProblemTitle();
    var titleSlug = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
    var statement = getProblemStatement();
    var contestSlug = getContestSlug() || '';
    var contestName = getContestName() || '';

    if (title && statement && statement.length > 30) {
      var probPayload = {
        title: title,
        body: statement,
        statement: statement,
        bodyMarkdown: statement,
        timeLimit: getProblemLimits().timeLimit,
        memoryLimit: getProblemLimits().memoryLimit,
        samples: getSampleTestCases(),
        url: window.location.href,
        contestSlug: contestSlug,
        contestName: contestName,
        slug: slug || titleSlug
      };
      try {
        var toSave = {};
        if (slug) toSave['tp_prob_' + slug] = probPayload;
        if (titleSlug) toSave['tp_prob_' + titleSlug] = probPayload;
        toSave['tp_prob_title_' + title.toLowerCase().trim()] = probPayload;
        if (contestSlug) {
          if (slug) toSave['tp_prob_' + contestSlug + '_' + slug] = probPayload;
          if (titleSlug) toSave['tp_prob_' + contestSlug + '_' + titleSlug] = probPayload;
        }
        toSave['tp_last_active_problem'] = probPayload;
        chrome.storage.local.set(toSave);
      } catch(e) {}
      chrome.runtime.sendMessage({
        type: 'CACHE_TOPH_PROBLEM',
        slug: slug || titleSlug,
        titleSlug: titleSlug,
        title: title,
        contestSlug: contestSlug,
        contestName: contestName,
        stmt: probPayload,
        data: probPayload
      }).catch(function() {});
    }
  }

  // ── Initialize ─────────────────────────────────────────────────────────────
  function init() {
    if (!isContextValid()) return;

    detectAndStoreUserHandle();

    var strayBtn = document.getElementById('codesync-ide-btn');
    if (strayBtn) strayBtn.remove();

    if (hasRealProblemStatement()) {
      checkIfAlreadySynced();
      setTimeout(checkIfAlreadySynced, 1500);
      watchForVerdict();
      cacheCurrentProblem();
    }

    if (isSubmissionPage()) {
      watchForVerdict();
      var verdict = getSubmissionVerdict();
      const isPending = (verdict === 'Queued' || verdict === 'Running' || verdict === 'Judging' || verdict === 'Waiting');
      const isRecentSub = sessionStorage.getItem('toph_submitted') || sessionStorage.getItem('codesync_auto_submit');
      if (verdict === 'Accepted' && isRecentSub) {
        sessionStorage.removeItem('toph_submitted');
        handleAccepted();
      } else if (isPending) {
        var pollCount = 0;
        var pollTimer = setInterval(function() {
          pollCount++;
          var v = getSubmissionVerdict();
          if (v === 'Accepted') {
            clearInterval(pollTimer);
            handleAccepted();
          } else if (v && v !== 'Queued' && v !== 'Running' && v !== 'Judging' && v !== 'Waiting') {
            clearInterval(pollTimer);
          } else if (pollCount > 30) {
            clearInterval(pollTimer);
          }
        }, 1500);
      }
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('hashchange', function() {
    setTimeout(init, 300);
  });
  window.addEventListener('popstate', function() {
    setTimeout(init, 300);
  });

  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    setTimeout(init, 300);
  };
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    setTimeout(init, 300);
  };

  var cacheObserverTimer = null;
  var routeObserver = new MutationObserver(function() {
    var strayBtn = document.getElementById('codesync-ide-btn');
    if (strayBtn) strayBtn.remove();

    if (cacheObserverTimer) clearTimeout(cacheObserverTimer);
    cacheObserverTimer = setTimeout(function() {
      if (hasRealProblemStatement()) {
        cacheCurrentProblem();
        checkIfAlreadySynced();
      }
    }, 400);
  });
  routeObserver.observe(document.body, { childList: true, subtree: true });



})();
