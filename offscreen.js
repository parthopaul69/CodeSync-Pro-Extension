// CodeSync Pro — Offscreen Document Script v2.0
'use strict';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'PLAY_SOUND') {
    playNotiMp3();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'PARSE_CF_SUBMISSION') {
    try {
      const code = parseCFSubmission(msg.html);
      sendResponse({ ok: true, code });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_CF_PROBLEM') {
    try {
      const stmt = parseCFProblem(msg.html);
      sendResponse({ ok: true, stmt });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_AC_SUBMISSION') {
    try {
      const details = parseACSubmission(msg.html);
      sendResponse({ ok: true, details });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_AC_PROBLEM') {
    try {
      const stmt = parseACProblem(msg.html);
      sendResponse({ ok: true, stmt });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_TOPH_PROBLEM') {
    try {
      const stmt = parseTophProblem(msg.html, msg.url);
      sendResponse({ ok: true, stmt });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_HTML_TO_MD') {
    try {
      const md = parseHtmlToMarkdown(msg.html);
      sendResponse({ ok: true, md });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_CSES_TASK') {
    try {
      const task = parseCSESTask(msg.html, msg.taskId);
      sendResponse({ ok: true, task });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }

  if (msg.type === 'PARSE_CSES_RESULT') {
    try {
      const result = parseCSESResult(msg.html);
      sendResponse({ ok: true, result });
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  }
});

function parseACSubmission(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const codeEl = doc.getElementById('submission-code') ||
                 doc.querySelector('pre.prettyprint') ||
                 doc.querySelector('.linenums');
  if (!codeEl) {
    throw new Error('codeEl not found in HTML. Selector submission-code, pre.prettyprint, linenums all returned null.');
  }
  
  let code = '';
  const lines = codeEl.querySelectorAll('li');
  if (lines.length > 0) {
    code = Array.from(lines).map(li => li.textContent).join('\n');
  } else {
    code = codeEl.innerText || codeEl.textContent || '';
  }

  if (!code.trim()) {
    throw new Error(`codeEl found but code text is empty. innerText: "${codeEl.innerText}", textContent: "${codeEl.textContent}"`);
  }

  let timeMs = 0;
  let memoryKb = 0;
  const ths = doc.querySelectorAll('th');
  for (const th of ths) {
    const text = th.textContent.trim().toLowerCase();
    if (text.includes('execution time')) {
      const val = th.nextElementSibling ? th.nextElementSibling.textContent : '';
      timeMs = parseInt(val) || 0;
    } else if (text.includes('memory')) {
      const val = th.nextElementSibling ? th.nextElementSibling.textContent : '';
      memoryKb = parseInt(val) || 0;
    }
  }

  return { code, timeMs, memoryKb };
}

let offscreenAudioCtx = null;

function playNotiMp3() {
  try {
    const url = chrome.runtime.getURL('noti.mp3');
    const audio = new Audio(url);
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('[CodeSync] HTML5 audio.play() failed in offscreen, trying Web Audio API:', err);
        playViaWebAudio(url);
      });
    }
  } catch (e) {
    console.warn('[CodeSync] HTML5 audio error in offscreen:', e);
    playViaWebAudio(chrome.runtime.getURL('noti.mp3'));
  }
}

async function playViaWebAudio(url) {
  try {
    if (!offscreenAudioCtx || offscreenAudioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      offscreenAudioCtx = new AudioContextClass();
    }
    if (offscreenAudioCtx.state === 'suspended') {
      await offscreenAudioCtx.resume();
    }
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audioBuffer = await offscreenAudioCtx.decodeAudioData(buf);
    const source = offscreenAudioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offscreenAudioCtx.destination);
    source.start(0);
  } catch (err) {
    console.error('[CodeSync] Web Audio playback failed in offscreen:', err);
  }
}

function parseCFSubmission(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const pre = doc.getElementById('program-source-text') || doc.querySelector('.prettyprint');
  if (!pre) return null;
  const lis = pre.querySelectorAll('li');
  if (lis.length > 0) return Array.from(lis).map(li => li.textContent).join('\n');
  return pre.innerText || pre.textContent || null;
}

function parseCFProblem(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  var ps = doc.querySelector('.problem-statement');
  var isSgu = false;
  if (!ps) {
    ps = doc.querySelector('.ttypography');
    if (!ps) return null;
    isSgu = true;
    // Only step into the inner line-height wrapper div (NOT a table)
    var innerDiv = ps.querySelector('div[style*="line-height"]');
    if (innerDiv && innerDiv.tagName && innerDiv.tagName.toLowerCase() === 'div') {
      ps = innerDiv;
    }
  }

  if (isSgu) {
    var layoutTable = (ps.firstElementChild && ps.firstElementChild.tagName.toLowerCase() === 'table') ? ps.firstElementChild : null;
    if (layoutTable) {
      var mainTd = layoutTable.querySelector('td[valign="top"]') || layoutTable.querySelector('td');
      if (mainTd) {
        ps = mainTd;
      }
    }
  }

  var TEXT_NODE = 3;
  var ELEMENT_NODE = 1;

  // ── Convert a DOM element to clean Markdown ──────────────────────
  function toMd(el) {
    var out = '';
    var nodes = el.childNodes;
    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni];

      if (node.nodeType === TEXT_NODE) {
        // Apply cleanGlobal inline so $$$...$$$, $$...$$, $...$ in text nodes
        // are converted immediately (handles raw HTML without MathJax)
        out += cleanGlobal(node.textContent);
        continue;
      }
      if (node.nodeType !== ELEMENT_NODE) continue;

      var tag = node.tagName.toLowerCase();
      var cls = (typeof node.className === 'string') ? node.className : '';

      // Skip navigation/UI chrome — but NOT math/tex scripts
      if (tag === 'script') {
        var mtype = (node.getAttribute('type') || '').toLowerCase();
        if (mtype === 'math/tex' || mtype === 'math/tex; mode=display') {
          var mTex = node.textContent.trim();
          if (mTex) { out += cleanTex(mTex); }
        }
        continue;
      }
      if (tag === 'style' || tag === 'button') continue;
      if (cls.indexOf('MathJax') >= 0 && cls.indexOf('MathJax_Preview') < 0) {
        // Skip duplicate MathJax rendered output; keep the original tex span
        continue;
      }

      if (tag === 'br') { out += '\n'; continue; }
      if (tag === 'p') { out += toMd(node) + '\n\n'; continue; }
      if (tag === 'ul') { out += toMd(node) + '\n'; continue; }
      if (tag === 'ol') { out += toMd(node) + '\n'; continue; }
      if (tag === 'li') { out += '- ' + toMd(node).trim() + '\n'; continue; }

      if (tag === 'strong' || tag === 'b') { out += '**' + toMd(node) + '**'; continue; }
      if (cls.indexOf('tex-span') >= 0) {
        var clone = node.cloneNode(true);
        clone.querySelectorAll('sub').forEach(function(s) {
          s.parentNode.replaceChild(doc.createTextNode(toSubscript(s.textContent.trim())), s);
        });
        clone.querySelectorAll('sup').forEach(function(s) {
          s.parentNode.replaceChild(doc.createTextNode(toSuperscript(s.textContent.trim())), s);
        });
        var cleaned = cleanTex(clone.textContent.trim());
        out += '`' + cleaned + '`';
        continue;
      }

      // Monospace
      if (tag === 'tt' || tag === 'code' || cls.indexOf('tex-font-style-tt') >= 0) {
        out += '`' + node.textContent + '`'; continue;
      }

      // Bold/italic via CF span classes
      if (cls.indexOf('tex-font-style-bf') >= 0) { out += '**' + toMd(node) + '**'; continue; }
      if (cls.indexOf('tex-font-style-it') >= 0) { out += '*' + toMd(node) + '*'; continue; }

      if (cls.indexOf('MathJax_Preview') >= 0) {
        // Already handled by script[type=math/tex] or $$$ block
        continue;
      }

      // Images
      if (tag === 'img') {
        var src = node.getAttribute('src') || '';
        if (src && src.charAt(0) === '/') src = 'https://codeforces.com' + src;
        out += '![](' + src + ')'; continue;
      }

      // Section titles → Markdown heading
      if (cls.indexOf('section-title') >= 0) {
        out += '### ' + node.textContent.trim() + '\n\n'; continue;
      }

      out += toMd(node);
    }
    return out;
  }

  // ── Helper: clean a <pre> block to plain text ────────────────────
  function cleanPre(preEl) {
    if (!preEl) return '';
    var lines = preEl.querySelectorAll('.test-example-line');
    if (lines.length > 0) {
      return Array.from(lines).map(function(l) { return l.textContent; }).join('\n');
    }
    var lis = preEl.querySelectorAll('li');
    if (lis.length > 0) {
      return Array.from(lis).map(function(l) { return l.textContent; }).join('\n');
    }
    // Replace <br> tags with newline text nodes before extracting text
    // (innerText is unreliable in offscreen documents)
    var clone = preEl.cloneNode(true);
    clone.querySelectorAll('br').forEach(function(br) {
      br.parentNode.replaceChild(doc.createTextNode('\n'), br);
    });
    return clone.textContent || '';
  }


  // ── Time / Memory limits ─────────────────────────────────────────
  var timeLimit = null, memLimit = null;
  if (isSgu) {
    var txt = ps.textContent || '';
    var tlMatch = txt.match(/Time\s+limit(?: per test)*:?\s*([0-9.]+)\s*(?:sec|second\(s\))/i);
    if (tlMatch) timeLimit = tlMatch[1].trim() + ' second(s)';
    var mlMatch = txt.match(/Memory\s+limit(?: per test)*:?\s*(\d+)\s*(?:kilobytes|KB|KB\.)/i);
    if (mlMatch) memLimit = mlMatch[1].trim() + ' KB';
  } else {
    var tlEl = ps.querySelector('.time-limit');
    var mlEl = ps.querySelector('.memory-limit');
    if (tlEl) {
      var tlClone = tlEl.cloneNode(true);
      var tlTitle = tlClone.querySelector('.property-title');
      if (tlTitle) tlTitle.parentNode.removeChild(tlTitle);
      timeLimit = tlClone.textContent.trim();
    }
    if (mlEl) {
      var mlClone = mlEl.cloneNode(true);
      var mlTitle = mlClone.querySelector('.property-title');
      if (mlTitle) mlTitle.parentNode.removeChild(mlTitle);
      memLimit = mlClone.textContent.trim();
    }
  }

  var body = '';
  var inputSpec = '';
  var outputSpec = '';
  var note = '';
  var samples = '';

  if (isSgu) {
    // ── Helper: convert array of DOM nodes → Markdown ────────────────
    function nodesToMd(arr) {
      if (!arr.length) return '';
      var tmp = doc.createElement('div');
      arr.forEach(function(n) { tmp.appendChild(n.cloneNode(true)); });
      return toMd(tmp).trim();
    }

    // ── Shared: detect section header (works for bold or plain text) ──
    function getSectionType(node) {
      if (!node) return null;
      var txt = node.textContent.trim().toLowerCase();
      if (txt.length > 30) return null; // headers are short
      var norm = txt.replace(/[^a-z()]/g, '');
      if (norm === 'input' || norm === 'inputfile') return 'input';
      if (norm === 'output' || norm === 'outputfile') return 'output';
      if (norm === 'sampleinput' || norm === 'sampleinputfile') return 'sample_input';
      if (norm === 'sampleoutput' || norm === 'sampleoutputfile') return 'sample_output';
      if (norm === 'note') return 'note';
      if (norm === 'examples' || norm === 'example(s)' || norm === 'example') return 'samples';
      return null;
    }

    // ── Shared: strip author/resource/date trailing metadata ──────────
    function stripMeta(s) {
      return s.replace(/(?:Author|Resource|Date)\s*:[\s\S]*/i, '').trim();
    }

    // ── Detect SGU layout ─────────────────────────────────────────────
    // Layout C: very old SGU — samples are inside <font><pre> pairs
    var hasFontPre = !!ps.querySelector('font > pre');
    // Layout A: modern SGU — sections delimited by div[align=left]
    var hasAlignLeftHeaders = !hasFontPre && !!ps.querySelector('div[align="left"]');

    if (hasFontPre) {
      // ── Layout C (e.g. acmsguru100) ──────────────────────────────────
      // Samples in font>pre pairs; sections split by inline headers
      var bodyNodes = [], inputNodes = [], outputNodes = [], noteNodes = [];
      var curSec = 'body';

      Array.from(ps.childNodes).forEach(function(node) {
        var sec = getSectionType(node);
        if (sec !== null) { curSec = sec; return; }

        if (node.nodeType === ELEMENT_NODE) {
          var tag = node.tagName.toLowerCase();
          if (tag === 'font') return;  // skip sample font>pre blocks
          if (tag === 'h3' || tag === 'h4') return;
          if (tag === 'div' && node.getAttribute('align') === 'center') return;
          var rl = (node.textContent || '').toLowerCase();
          if (rl.match(/time limit|memory limit/) && node.textContent.length < 300) return;
        }
        if (node.nodeType === TEXT_NODE) {
          var t = node.textContent.trim();
          if (!t || t.match(/^\d+\.\s+/) || t.toLowerCase().match(/time limit|memory limit/)) return;
        }
        if (curSec === 'body')   bodyNodes.push(node);
        else if (curSec === 'input')  inputNodes.push(node);
        else if (curSec === 'output') outputNodes.push(node);
        else if (curSec === 'note')   noteNodes.push(node);
      });

      body      = nodesToMd(bodyNodes);
      inputSpec  = nodesToMd(inputNodes);
      outputSpec = nodesToMd(outputNodes);
      note       = nodesToMd(noteNodes);

      // Samples from consecutive font>pre pairs (input, output, input, output …)
      var fontPres = Array.from(ps.querySelectorAll('font > pre'));
      for (var si = 0; si + 1 < fontPres.length; si += 2) {
        samples += '**Example:**\n\n```\n' + fontPres[si].textContent.trim() + '\n```\n\n';
        samples += '**Output:**\n\n```\n' + fontPres[si+1].textContent.trim() + '\n```\n\n';
      }

    } else if (hasAlignLeftHeaders) {
      // ── Layout A (e.g. acmsguru358, acmsguru403) ─────────────────────
      var bodyNodes = [], inputNodes = [], outputNodes = [], noteNodes = [];
      var curSec = 'body';

      Array.from(ps.childNodes).forEach(function(node) {
        var sec = getSectionType(node);
        if (sec !== null) { curSec = sec; return; }

        if (node.nodeType === ELEMENT_NODE) {
          var tag = node.tagName.toLowerCase();
          if (tag === 'div' && node.getAttribute('align') === 'center') return;
          // Parse example table in-place
          if (tag === 'table' && curSec === 'samples') {
            node.querySelectorAll('tr').forEach(function(row) {
              var cols = row.querySelectorAll('td');
              if (cols.length < 2) return;
              var c0 = cols[0].textContent.trim().toLowerCase();
              if (c0.indexOf('sample input') >= 0 || c0.indexOf('sample output') >= 0) return;
              var inPre  = cols[0].querySelector('pre');
              var outPre = cols[1].querySelector('pre');
              var inTxt  = inPre  ? inPre.textContent  : cols[0].textContent;
              var outTxt = outPre ? outPre.textContent : cols[1].textContent;
              samples += '**Example:**\n\n```\n' + inTxt.trim() + '\n```\n\n';
              samples += '**Output:**\n\n```\n' + outTxt.trim() + '\n```\n\n';
            });
            return;
          }
        }
        if (curSec === 'body')   bodyNodes.push(node);
        else if (curSec === 'input')  inputNodes.push(node);
        else if (curSec === 'output') outputNodes.push(node);
        else if (curSec === 'note')   noteNodes.push(node);
      });

      body       = nodesToMd(bodyNodes);
      inputSpec  = nodesToMd(inputNodes);
      outputSpec = nodesToMd(outputNodes);
      note       = nodesToMd(noteNodes);

    } else {
      // ── Layout B (e.g. acmsguru123) ──────────────────────────────────
      // Sections delimited by inline headers; examples in 4-pre-block tables
      var bodyNodes = [], inputNodes = [], outputNodes = [], noteNodes = [];
      var curSec = 'body';

      Array.from(ps.childNodes).forEach(function(node) {
        var sec = getSectionType(node);
        if (sec !== null) { curSec = sec; return; }

        if (node.nodeType === ELEMENT_NODE) {
          var tag = node.tagName.toLowerCase();
          if (tag === 'div' && node.getAttribute('align') === 'center') return;
          if (tag === 'h3' || tag === 'h4') return;
          var rl = (node.textContent || '').toLowerCase();
          if (rl.match(/time limit|memory limit/) && node.textContent.length < 300) return;

          // Example table: find tables whose pre blocks form (header, header, input, output) pairs
          if (tag === 'table' && (curSec === 'sample_input' || curSec === 'sample_output' || curSec === 'samples')) {
            var pres = Array.from(node.querySelectorAll('pre'));
            if (pres.length >= 2) {
              var startIdx = pres.length >= 4 ? pres.length - 2 : 0;
              var firstText = pres[0].textContent.trim().toLowerCase();
              if (pres.length >= 4 && (firstText.indexOf('sample') >= 0 || firstText.indexOf('input') >= 0)) {
                startIdx = 2; // skip header row pres
              }
              for (var pi = startIdx; pi + 1 < pres.length; pi += 2) {
                var inTxt = pres[pi].textContent.trim();
                var outTxt = pres[pi+1].textContent.trim();
                outTxt = stripMeta(outTxt);
                samples += '**Example:**\n\n```\n' + inTxt + '\n```\n\n';
                samples += '**Output:**\n\n```\n' + outTxt + '\n```\n\n';
              }
            }
            return;
          }

          // Collect <pre> blocks that appear directly (not inside a table)
          if (tag === 'pre') {
            if (curSec === 'sample_input' || curSec === 'sample_output' || curSec === 'samples') {
              samples += (curSec === 'sample_output' ? '**Output:**' : '**Example:**') +
                '\n\n```\n' + node.textContent.trim() + '\n```\n\n';
              return;
            }
          }
        }
        if (node.nodeType === TEXT_NODE) {
          var t = node.textContent.trim();
          if (!t || t.match(/^\d+\.\s+/) || t.toLowerCase().match(/^time limit|^memory limit/)) return;
          if (t.match(/(?:Author|Resource|Date)\s*:/i)) {
            t = stripMeta(t);
            if (!t) return;
          }
        }
        if (curSec === 'body')   bodyNodes.push(node);
        else if (curSec === 'input')  inputNodes.push(node);
        else if (curSec === 'output') outputNodes.push(node);
        else if (curSec === 'note')   noteNodes.push(node);
      });

      body       = nodesToMd(bodyNodes);
      inputSpec  = nodesToMd(inputNodes);
      outputSpec = nodesToMd(outputNodes);
      note       = nodesToMd(noteNodes);
    }
  } else {

    // ── Problem body (everything before Input section) ───────────────
    var children = ps.children;
    for (var ci = 0; ci < children.length; ci++) {
      var child = children[ci];
      var cc = (typeof child.className === 'string') ? child.className : '';
      if (cc.indexOf('header') >= 0) continue;
      if (cc.indexOf('input-specification') >= 0) break;
      body += toMd(child) + '\n';
    }

    // ── Input / Output / Note sections ───────────────────────────────
    function getSection(cls) {
      var el = ps.querySelector('.' + cls);
      if (!el) return null;
      var clone = el.cloneNode(true);
      var titleEl = clone.querySelector('.section-title');
      if (titleEl) titleEl.parentNode.removeChild(titleEl);
      return toMd(clone).replace(/\n{3,}/g, '\n\n').trim();
    }
    inputSpec = getSection('input-specification') || '';
    outputSpec = getSection('output-specification') || '';
    note = getSection('note') || '';

    // ── Sample tests ─────────────────────────────────────────────────
    var sampleTests = ps.querySelector('.sample-tests');
    if (sampleTests) {
      var inputPres = sampleTests.querySelectorAll('.input pre');
      var outputPres = sampleTests.querySelectorAll('.output pre');
      for (var si = 0; si < inputPres.length; si++) {
        var inTxt = cleanPre(inputPres[si]);
        var outTxt = outputPres[si] ? cleanPre(outputPres[si]) : '';
        var label = inputPres.length > 1 ? ' ' + (si + 1) : '';
        samples += '**Example' + label + ':**\n\n```\n' + inTxt + '\n```\n\n';
        samples += '**Output' + label + ':**\n\n```\n' + outTxt + '\n```\n\n';
      }
    }
  }

  body = body.replace(/\n{3,}/g, '\n\n').trim();
  inputSpec = inputSpec.replace(/\n{3,}/g, '\n\n').trim();
  outputSpec = outputSpec.replace(/\n{3,}/g, '\n\n').trim();
  samples = samples.replace(/\n{3,}/g, '\n\n').trim();
  note = note.replace(/\n{3,}/g, '\n\n').trim();


  function cleanGlobal(str) {
    if (!str) return str;
    // Handle $$$...$$$  (Codeforces triple-dollar inline/display math)
    str = str.replace(/\$\$\$([^$]+?)\$\$\$/g, function(match, tex) {
      return '`' + cleanTex(tex.trim()) + '`';
    });
    // Handle $$...$$ (double-dollar display math)
    str = str.replace(/\$\$([^$]+?)\$\$/g, function(match, tex) {
      return '`' + cleanTex(tex.trim()) + '`';
    });
    // Handle $...$ single dollar (inline math)
    str = str.replace(/\$([^$\n]{1,200})\$/g, function(match, tex) {
      const cleaned = cleanTex(tex.trim());
      return cleaned ? '`' + cleaned + '`' : match;
    });
    return str;
  }

  return {
    timeLimit,
    memLimit,
    body: cleanGlobal(body),
    inputSpec: cleanGlobal(inputSpec),
    outputSpec: cleanGlobal(outputSpec),
    samples: cleanGlobal(samples),
    note: cleanGlobal(note),
    url: doc.URL || ''
  };
}

// ── LaTeX cleaner ────────────────────────────────────────────────
function cleanTex(tex) {
  if (!tex) return '';
  tex = tex.replace(/\\\{/g, '\u2774').replace(/\\\}/g, '\u2775');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*([()[\]|./])/g, '$1');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\\{/g, '\u2774');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\\}/g, '\u2775');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\lfloor/g, '\u230a');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\rfloor/g, '\u230b');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\lceil/g, '\u2308');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\rceil/g, '\u2309');
  tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, '');

  var BP = '[^{}]*(?:\\{[^{}]*\\}[^{}]*)*';
  var fracRe = new RegExp('\\\\(?:d|t|c)?frac\\s*\\{(' + BP + ')\\}\\s*\\{(' + BP + ')\\}', 'g');
  for (var fi = 0; fi < 3; fi++) tex = tex.replace(fracRe, '$1/$2');

  var binomRe = new RegExp('\\\\(?:d|t)?binom\\s*\\{(' + BP + ')\\}\\s*\\{(' + BP + ')\\}', 'g');
  tex = tex.replace(binomRe, 'C($1,$2)');

  tex = tex.replace(new RegExp('\\\\sqrt\\s*\\[([^\\]]*)\\]\\s*\\{(' + BP + ')\\}', 'g'), '$1\u221a($2)');
  tex = tex.replace(new RegExp('\\\\sqrt\\s*\\{(' + BP + ')\\}', 'g'), '\u221a($1)');
  tex = tex.replace(new RegExp('\\\\pmod\\s*\\{(' + BP + ')\\}', 'g'), '(mod $1)');

  var fmtCmd = '\\\\(?:mathrm|mathbf|mathcal|mathit|mathbb|mathfrak|mathsf|text|textbf|textit|textrm|textsf|texttt|operatorname|bf|it|rm|sf|tt|mbox|hbox)';
  var fmtRe = new RegExp(fmtCmd + '\\s*\\{(' + BP + ')\\}', 'g');
  for (var mi = 0; mi < 2; mi++) tex = tex.replace(fmtRe, '$1');

  var decCmd = '\\\\(?:overline|underline|hat|tilde|vec|bar|dot|ddot|widehat|widetilde|overleftarrow|overrightarrow)';
  tex = tex.replace(new RegExp(decCmd + '\\s*\\{(' + BP + ')\\}', 'g'), '$1');

  tex = tex.replace(/\\leq/g, '\u2264').replace(/\\le(?=[^a-z]|$)/g, '\u2264')
           .replace(/\\geq/g, '\u2265').replace(/\\ge(?=[^a-z]|$)/g, '\u2265')
           .replace(/\\lt(?=[^a-z]|$)/g, '<').replace(/\\gt(?=[^a-z]|$)/g, '>')
           .replace(/\\neq/g, '\u2260').replace(/\\ne(?=[^a-z]|$)/g, '\u2260')
           .replace(/\\equiv/g, '\u2261').replace(/\\approx/g, '\u2248')
           .replace(/\\sim(?=[^a-z]|$)/g, '\u223c').replace(/\\propto/g, '\u221d');

  tex = tex.replace(/\\times/g, '\u00d7').replace(/\\cdot/g, '\u00b7')
           .replace(/\\div(?=[^a-z]|$)/g, '\u00f7')
           .replace(/\\bmod(?=[^a-z]|$)/g, 'mod').replace(/\\mod(?=[^a-z]|$)/g, 'mod');

  tex = tex.replace(/\\rightarrow/g, '\u2192').replace(/\\leftarrow/g, '\u2190')
           .replace(/\\Rightarrow/g, '\u21d2').replace(/\\Leftarrow/g, '\u21d0')
           .replace(/\\leftrightarrow/g, '\u2194').replace(/\\Leftrightarrow/g, '\u21d4')
           .replace(/\\to(?=[^a-z]|$)/g, '\u2192').replace(/\\gets/g, '\u2190')
           .replace(/\\mapsto/g, '\u21a6').replace(/\\implies/g, '\u21d2').replace(/\\iff/g, '\u21d4');

  tex = tex.replace(/\\notin/g, '\u2209').replace(/\\in(?=[^a-z]|$)/g, '\u2208')
           .replace(/\\subseteq/g, '\u2286').replace(/\\subset(?=[^a-z]|$)/g, '\u2282')
           .replace(/\\supseteq/g, '\u2287').replace(/\\supset(?=[^a-z]|$)/g, '\u2283')
           .replace(/\\cup/g, '\u222a').replace(/\\cap/g, '\u2229')
           .replace(/\\emptyset/g, '\u2205').replace(/\\varnothing/g, '\u2205')
           .replace(/\\setminus/g, '\u2216')
           .replace(/\\forall/g, '\u2200').replace(/\\exists/g, '\u2203')
           .replace(/\\land/g, '\u2227').replace(/\\lor/g, '\u2228')
           .replace(/\\lnot/g, '\u00ac').replace(/\\neg/g, '\u00ac')
           .replace(/\\oplus/g, '\u2295').replace(/\\otimes/g, '\u2297');

  tex = tex.replace(/\\infty/g, '\u221e').replace(/\\pm/g, '\u00b1').replace(/\\mp/g, '\u2213')
           .replace(/\\dots/g, '\u2026').replace(/\\ldots/g, '\u2026').replace(/\\cdots/g, '\u22ef')
           .replace(/\\lfloor/g, '\u230a').replace(/\\rfloor/g, '\u230b')
           .replace(/\\lceil/g, '\u2308').replace(/\\rceil/g, '\u2309')
           .replace(/\\mid(?=[^a-z]|$)/g, '|').replace(/\\nmid/g, '\u2224')
           .replace(/\\perp/g, '\u22a5').replace(/\\parallel/g, '\u2225');

  tex = tex.replace(/\\sum(?:\\limits)?/g, '\u03a3').replace(/\\prod(?:\\limits)?/g, '\u03a0')
           .replace(/\\bigcup/g, '\u22c3').replace(/\\bigcap/g, '\u22c2').replace(/\\bigoplus/g, '\u2295');

  tex = tex.replace(/\\log/g, 'log').replace(/\\ln/g, 'ln')
           .replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\tan/g, 'tan')
           .replace(/\\exp/g, 'exp').replace(/\\min/g, 'min').replace(/\\max/g, 'max')
           .replace(/\\gcd/g, 'gcd').replace(/\\lcm/g, 'lcm')
           .replace(/\\lim(?:\\limits)?/g, 'lim').replace(/\\det/g, 'det');

  tex = tex.replace(/\\alpha/g, '\u03b1').replace(/\\beta/g, '\u03b2').replace(/\\gamma/g, '\u03b3')
           .replace(/\\delta/g, '\u03b4').replace(/\\varepsilon/g, '\u03b5').replace(/\\epsilon/g, '\u03b5')
           .replace(/\\zeta/g, '\u03b6').replace(/\\eta/g, '\u03b7')
           .replace(/\\vartheta/g, '\u03d1').replace(/\\theta/g, '\u03b8')
           .replace(/\\iota/g, '\u03b9').replace(/\\kappa/g, '\u03ba').replace(/\\lambda/g, '\u03bb')
           .replace(/\\mu/g, '\u03bc').replace(/\\nu/g, '\u03bd').replace(/\\xi/g, '\u03be')
           .replace(/\\pi/g, '\u03c0').replace(/\\rho/g, '\u03c1')
           .replace(/\\sigma/g, '\u03c3').replace(/\\tau/g, '\u03c4').replace(/\\upsilon/g, '\u03c5')
           .replace(/\\varphi/g, '\u03c6').replace(/\\phi/g, '\u03c6')
           .replace(/\\chi/g, '\u03c7').replace(/\\psi/g, '\u03c8').replace(/\\omega/g, '\u03c9')
           .replace(/\\Gamma/g, '\u0393').replace(/\\Delta/g, '\u0394').replace(/\\Theta/g, '\u0398')
           .replace(/\\Lambda/g, '\u039b').replace(/\\Xi/g, '\u039e').replace(/\\Pi/g, '\u03a0')
           .replace(/\\Sigma/g, '\u03a3').replace(/\\Phi/g, '\u03a6')
           .replace(/\\Psi/g, '\u03a8').replace(/\\Omega/g, '\u03a9');

  // ── Text / Monospace commands (fix mathtt0 bug) ──
  tex = tex.replace(/\\mathtt\s*\{([^}]*)\}/g, '$1').replace(/\\mathtt\s*([0-9a-zA-Z])/g, '$1');
  tex = tex.replace(/\\texttt\s*\{([^}]*)\}/g, '$1').replace(/\\texttt\s*([0-9a-zA-Z])/g, '$1');
  tex = tex.replace(/\\mathrm\s*\{([^}]*)\}/g, '$1').replace(/\\mathrm\s*([0-9a-zA-Z])/g, '$1');
  tex = tex.replace(/\\textbf\s*\{([^}]*)\}/g, '**$1**').replace(/\\textbf\s*([0-9a-zA-Z])/g, '**$1**');
  tex = tex.replace(/\\mathbf\s*\{([^}]*)\}/g, '**$1**').replace(/\\mathbf\s*([0-9a-zA-Z])/g, '**$1**');
  tex = tex.replace(/\\textit\s*\{([^}]*)\}/g, '*$1*').replace(/\\textit\s*([0-9a-zA-Z])/g, '*$1*');
  tex = tex.replace(/\\mathit\s*\{([^}]*)\}/g, '*$1*').replace(/\\mathit\s*([0-9a-zA-Z])/g, '*$1*');
  tex = tex.replace(/\\text\s*\{([^}]*)\}/g, '$1').replace(/\\text\s*([0-9a-zA-Z])/g, '$1');
  tex = tex.replace(/\\operatorname\s*\{([^}]*)\}/g, '$1');

  // ── Superscripts and subscripts → Unicode ──
  tex = tex.replace(/\^{([^}]*)}/g, function(_, exp) { return toSuperscript(exp); });
  tex = tex.replace(/\^([0-9a-zA-Z])/g, function(_, c) { return toSuperscript(c); });
  tex = tex.replace(/_{([^}]*)}/g, function(_, sub) { return toSubscript(sub); });
  tex = tex.replace(/_([0-9a-zA-Z])/g, function(_, c) { return toSubscript(c); });

  tex = tex.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '')
           .replace(/\\quad/g, ' ').replace(/\\qquad/g, '  ')
           .replace(/\\hspace\{[^}]*\}/g, ' ').replace(/\\vspace\{[^}]*\}/g, '');
  tex = tex.replace(/\\limits/g, '');
  tex = tex.replace(/\\\\/g, ' ');
  tex = tex.replace(/\\([a-zA-Z]+)/g, '$1');
  tex = tex.replace(/\{/g, '').replace(/\}/g, '');
  tex = tex.replace(/\u2774/g, '{').replace(/\u2775/g, '}');
  tex = tex.replace(/\s+/g, ' ');
  return tex.trim();
}

function toSuperscript(str) {
  const sup = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ' };
  return Array.from(str).map(c => sup[c] || c).join('');
}

function toSubscript(str) {
  const sub = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
  return Array.from(str).map(c => sub[c] || c).join('');
}

// ── Math cleaner for AtCoder / any \(...\) / $...$ notation ─────────────────
function cleanMath(str) {
  if (!str) return '';
  return str
    .replace(/\\\(([^]*?)\\\)/g, (_, t) => cleanTex(t.trim()))
    .replace(/\\\[([^]*?)\\\]/g, (_, t) => cleanTex(t.trim()))
    .replace(/\$\$([^]*?)\$\$/g, (_, t) => cleanTex(t.trim()))
    .replace(/\$([^$\n]+)\$/g, (_, t) => cleanTex(t.trim()) || _);
}


function parseACProblem(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // ── Title ────────────────────────────────────────────────────────────────────
  let title = '';
  const titleEl = doc.querySelector('.h2') || doc.querySelector('h2') || doc.querySelector('title');
  if (titleEl) {
    const clone = titleEl.cloneNode(true);
    clone.querySelectorAll('a, button, .btn').forEach(el => el.remove());
    title = clone.textContent.replace(/\s+/g, ' ').trim();
    // Strip site name suffix: "A - Welcome to AtCoder - AtCoder Beginner Selection"
    // Only strip the LAST "- AtCoder..." segment so we keep the problem name intact
    title = title.replace(/\s*-\s*AtCoder[^-]*$/, '').trim();
  }

  // ── Time / Memory limits ─────────────────────────────────────────────────────
  let timeLimit = '';
  let memoryLimit = '';
  for (const p of doc.querySelectorAll('p')) {
    const text = p.textContent || '';
    if (text.includes('Time Limit') && text.includes('Memory Limit')) {
      const tMatch = text.match(/Time Limit[:\s]+([\d.]+\s*(?:sec|ms|s))/i);
      const mMatch = text.match(/Memory Limit[:\s]+([\d]+\s*MB)/i);
      if (tMatch) timeLimit = tMatch[1].trim();
      if (mMatch) memoryLimit = mMatch[1].trim();
      if (!timeLimit) {
        const parts = text.split('/');
        for (const part of parts) {
          if (part.includes('Time Limit')) timeLimit = part.replace('Time Limit:', '').replace(/:/g,'').trim();
          else if (part.includes('Memory Limit')) memoryLimit = part.replace('Memory Limit:', '').replace(/:/g,'').trim();
        }
      }
      break;
    }
  }

  // ── Find English statement container ─────────────────────────────────────────
  // AtCoder uses either .lang-en span or the whole #task-statement
  let container = doc.querySelector('#task-statement .lang-en') ||
                  doc.querySelector('#task-statement span.lang-en') ||
                  doc.querySelector('.lang-en') ||
                  doc.querySelector('#task-statement') ||
                  doc.body;

  if (!container) {
    return { title, body: '', constraints: '', inputSpec: '', outputSpec: '', samples: '', note: '', timeLimit, memoryLimit };
  }

  // cleanMath is now a top-level function — used here and in parseHtmlToMarkdown


  // ── Extract sections via AtCoder's h3 headers ───────────────────────────────
  // Since AtCoder's DOM structure can be inconsistent (h3 can be inside <section> 
  // or a sibling to <section>), we find all h3 elements inside the container 
  // and traverse their next siblings to extract the corresponding section contents.
  const h3s = Array.from(container.querySelectorAll('h3'));

  let problemStatement = '';
  let constraints = '';
  let inputSpec = '';
  let outputSpec = '';
  let notes = '';
  const sampleInputs = {};
  const sampleOutputs = {};

  if (h3s.length > 0) {
    for (const h3 of h3s) {
      const heading = h3.textContent.trim().toLowerCase();

      // Collect next siblings of h3 within its parent until we hit another h3
      const wrapper = doc.createElement('div');
      let sib = h3.nextSibling;
      while (sib) {
        if (sib.nodeType === 1 && (sib.tagName.toLowerCase() === 'h3' || sib.querySelector('h3'))) {
          break;
        }
        wrapper.appendChild(sib.cloneNode(true));
        sib = sib.nextSibling;
      }

      const content = parseHtmlToMarkdown(wrapper).trim();
      const pre = wrapper.querySelector('pre');
      const rawText = pre ? pre.textContent.trim() : content;

      if (heading.includes('problem statement') || heading === 'statement' || heading === 'task' || heading === 'problem') {
        problemStatement = content;
      } else if (heading.includes('constraints') || heading === 'constraint') {
        constraints = content;
      } else if (heading.includes('sample input') || heading.includes('sample in') || heading.includes('input example') || heading.includes('input example #')) {
        const num = parseInt(heading.replace(/[^0-9]/g, '')) || 1;
        sampleInputs[num] = rawText;
      } else if (heading.includes('sample output') || heading.includes('sample out') || heading.includes('output example') || heading.includes('output example #')) {
        const num = parseInt(heading.replace(/[^0-9]/g, '')) || 1;
        sampleOutputs[num] = rawText;
      } else if (heading.includes('input') && !heading.includes('example') && !heading.includes('sample')) {
        inputSpec = content;
      } else if (heading.includes('output') && !heading.includes('example') && !heading.includes('sample')) {
        outputSpec = content;
      } else if (heading.includes('note') || heading.includes('hint') || heading.includes('explanation') || heading.includes('explanatory') || heading.includes('notice')) {
        notes += (notes ? '\n\n' : '') + content;
      }
    }
  }

  // ── ALWAYS-SHOW fallback: if no sections matched, dump the whole container ────
  const hasAnySection = problemStatement || constraints || inputSpec || outputSpec || notes ||
    Object.keys(sampleInputs).length > 0;
  if (!hasAnySection) {
    problemStatement = parseHtmlToMarkdown(container).trim();
  }

  // ── Build samples markdown ────────────────────────────────────────────────────
  let samplesMd = '';
  const sampleNums = [...new Set([...Object.keys(sampleInputs), ...Object.keys(sampleOutputs)])]
    .map(Number).sort((a, b) => a - b);
  const multiSample = sampleNums.length > 1;
  for (const num of sampleNums) {
    const label = multiSample ? ` ${num}` : '';
    const inp = sampleInputs[num] || '';
    const out = sampleOutputs[num] || '';
    if (inp || out) {
      samplesMd += `**Sample Input${label}:**\n\n\`\`\`\n${inp}\n\`\`\`\n\n`;
      samplesMd += `**Sample Output${label}:**\n\n\`\`\`\n${out}\n\`\`\`\n\n`;
    }
  }
  samplesMd = samplesMd.trim();

  return {
    title,
    body: cleanMath(problemStatement),
    constraints: cleanMath(constraints),
    inputSpec: cleanMath(inputSpec),
    outputSpec: cleanMath(outputSpec),
    samples: samplesMd,
    note: cleanMath(notes),
    timeLimit,
    memoryLimit
  };
}

function parseTophProblem(html, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Guard against 404 / Page Not Found
  const pageTitle = (doc.title || '').trim();
  const bodyText = (doc.body ? doc.body.textContent : '').trim();
  if (pageTitle.includes('Page Not Found') || pageTitle.includes('404') ||
      (bodyText.includes('Page Not Found') && bodyText.includes("We cannot find the page you're looking for"))) {
    throw new Error('Problem page returned 404 Not Found');
  }

  // 1. Title
  let title = '';
  const titleSelectors = ['.artifact__caption h1', '.pview__head h1', 'h1.problem-title', '.problem-statement h1', '.content-section h1', 'h1'];
  for (let i = 0; i < titleSelectors.length; i++) {
    const el = doc.querySelector(titleSelectors[i]);
    if (el && el.textContent.trim()) {
      title = el.textContent.trim().replace(/^[A-Z]\.\s+/, '').replace(/^\d+\.\s+/, '');
      break;
    }
  }

  // 2. Limits
  let timeLimit = '';
  let memoryLimit = '';
  const limitEls = doc.querySelectorAll('.pview__limits .pview__limit, .pview__limits .chip, [class*="limit"], .problem-limits span, .limit-info span, td');
  limitEls.forEach(el => {
    const text = el.textContent.trim();
    if (/cpu|time/i.test(text)) {
      const match = text.match(/(\d+(?:\.\d+)?\s*(?:s|ms|second)s?)/i);
      if (match && !timeLimit) timeLimit = match[1];
    }
    if (/memory|mem/i.test(text)) {
      const match = text.match(/(\d+\s*(?:MB|KB|GB))/i);
      if (match && !memoryLimit) memoryLimit = match[1];
    }
  });

  // Fallback regex scan on entire HTML if limits still empty
  if (!timeLimit) {
    const cpuMatch = html.match(/CPU\s*(\d+(?:\.\d+)?\s*(?:s|ms|second)s?)/i);
    if (cpuMatch) timeLimit = cpuMatch[1];
  }
  if (!memoryLimit) {
    const memMatch = html.match(/Memory\s*(\d+\s*(?:MB|KB|GB))/i);
    if (memMatch) memoryLimit = memMatch[1];
  }

  timeLimit = timeLimit || '1s';
  memoryLimit = memoryLimit || '512 MB';

  // 3. Problem Statement & KaTeX processing
  let body = '';
  let bodyMarkdown = '';
  let statementEl = null;
  const bodySelectors = [
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
  for (let i = 0; i < bodySelectors.length; i++) {
    const el = doc.querySelector(bodySelectors[i]);
    if (el && el.textContent.trim().length > 20) {
      statementEl = el;
      break;
    }
  }

  if (statementEl) {
    // Clone node so we don't mutate original
    const clonedEl = statementEl.cloneNode(true);

    // Remove caption / title h1, actions, buttons, and sample boxes from body clone
    clonedEl.querySelectorAll('.artifact__caption, h1, .artifact__actions, button, svg, script, style, form, .pview__sample').forEach(el => el.remove());

    // Convert KaTeX formulas into clean LaTeX ($formula$)
    const katexEls = clonedEl.querySelectorAll('.katex');
    katexEls.forEach(kEl => {
      const annotation = kEl.querySelector('annotation[encoding*="tex"]');
      if (annotation && annotation.textContent.trim()) {
        const tex = annotation.textContent.trim();
        const isDisplay = kEl.classList.contains('katex-display') || kEl.parentElement?.classList.contains('katex-display');
        const mathText = isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
        kEl.replaceWith(doc.createTextNode(mathText));
      }
    });

    // Convert section heads to markdown headings
    clonedEl.querySelectorAll('.pview__sectionhead, [role="heading"]').forEach(hEl => {
      const hText = hEl.textContent.trim();
      hEl.replaceWith(doc.createTextNode(`\n\n## ${hText}\n\n`));
    });

    body = clonedEl.innerHTML;
    bodyMarkdown = parseHtmlToMarkdown(clonedEl).trim();
  } else {
    throw new Error('Problem statement element not found in HTML');
  }

  if (bodyMarkdown.includes('Page Not Found') || bodyMarkdown.includes('404 Not Found')) {
    throw new Error('Problem statement contains 404 Not Found error');
  }

  // 4. Samples
  let samples = [];
  const sampleBoxes = doc.querySelectorAll('.pview__sample');
  if (sampleBoxes.length > 0) {
    sampleBoxes.forEach(box => {
      const cells = box.querySelectorAll('.pview__samplecell');
      let inp = '', out = '';
      cells.forEach(cell => {
        const label = cell.querySelector('.pview__samplelabel');
        const pre = cell.querySelector('pre');
        if (label && pre) {
          const lText = label.textContent.toLowerCase();
          if (lText.includes('input')) inp = pre.textContent.trim();
          else if (lText.includes('output')) out = pre.textContent.trim();
        }
      });
      if (inp || out) samples.push({ input: inp, output: out });
    });
  }

  if (samples.length === 0) {
    const sampleSections = doc.querySelectorAll('.sample-test, .sample, [class*="sample"], .example, [class*="example"]');
    if (sampleSections.length > 0) {
      sampleSections.forEach(section => {
        const pres = section.querySelectorAll('pre');
        if (pres.length >= 2) {
          for (let j = 0; j < pres.length; j += 2) {
            if (pres[j + 1]) {
              samples.push({
                input: pres[j].textContent.trim(),
                output: pres[j + 1].textContent.trim()
              });
            }
          }
        }
      });
    }
  }

  if (samples.length === 0) {
    const allPre = doc.querySelectorAll('pre');
    let inputs = [];
    let outputs = [];
    allPre.forEach(pre => {
      let prevText = '';
      let prev = pre.previousElementSibling;
      while (prev && !prevText) {
        prevText = (prev.textContent || '').trim().toLowerCase();
        prev = prev.previousElementSibling;
      }
      const parent = pre.parentElement;
      if (parent) {
        const parentHeading = parent.querySelector('h2, h3, h4, strong, b');
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
    for (let i = 0; i < Math.min(inputs.length, outputs.length); i++) {
      samples.push({ input: inputs[i], output: outputs[i] });
    }
  }
  
  // Format samples as markdown
  let samplesMd = '';
  for (let i = 0; i < samples.length; i++) {
    const label = samples.length > 1 ? ` ${i + 1}` : '';
    samplesMd += `**Sample Input${label}:**\n\n\`\`\`\n${samples[i].input}\n\`\`\`\n\n`;
    samplesMd += `**Sample Output${label}:**\n\n\`\`\`\n${samples[i].output}\n\`\`\`\n\n`;
  }

  // Tags
  const tagEls = doc.querySelectorAll('.pview__flair a[href*="/tags/"], .flair a[href*="/tags/"]');
  const tags = Array.from(tagEls).map(el => el.textContent.trim()).filter(Boolean);
  
  return {
    title,
    body: cleanMath(body),
    bodyMarkdown: cleanMath(bodyMarkdown),
    timeLimit,
    memoryLimit,
    samples: samplesMd.trim(),
    tags: tags.join(', ') || 'Practice',
    url: url || ''
  };
}

function parseHtmlToMarkdown(htmlOrEl) {
  let el;
  if (typeof htmlOrEl === 'string') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlOrEl, 'text/html');
    el = doc.body;
  } else {
    el = htmlOrEl;
  }

  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  function walk(node) {
    if (node.nodeType === TEXT_NODE) {
      // Apply cleanMath on every text node so $..$ / \(..\) inline LaTeX
      // in AtCoder HTML is converted at extraction time (not just at the end)
      return cleanMath(node.textContent);
    }
    if (node.nodeType !== ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();
    
    // Skip non-content tags — but handle math/tex scripts specially!
    if (['style', 'iframe', 'svg', 'noscript', 'head'].includes(tagName)) {
      return '';
    }
    // AtCoder uses <script type="math/tex"> for inline math
    if (tagName === 'script') {
      const mtype = (node.getAttribute('type') || '').toLowerCase();
      if (mtype === 'math/tex' || mtype === 'math/tex; mode=display') {
        const tex = node.textContent.trim();
        return tex ? ' ' + cleanTex(tex) + ' ' : '';
      }
      return ''; // skip other scripts
    }
    // Skip MathJax rendered output (aria-hidden spans) — keep only the source
    if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') {
      return '';
    }

    let childrenText = '';
    for (const child of node.childNodes) {
      childrenText += walk(child);
    }

    switch (tagName) {
      case 'h1':
        return `\n# ${childrenText.trim()}\n`;
      case 'h2':
        return `\n## ${childrenText.trim()}\n`;
      case 'h3':
        return `\n### ${childrenText.trim()}\n`;
      case 'h4':
        return `\n#### ${childrenText.trim()}\n`;
      case 'h5':
        return `\n##### ${childrenText.trim()}\n`;
      case 'h6':
        return `\n###### ${childrenText.trim()}\n`;
      case 'p':
        return `\n${childrenText.trim()}\n`;
      case 'strong':
      case 'b':
        return `**${childrenText}**`;
      case 'em':
      case 'i':
        return `*${childrenText}*`;
      case 'sup':
        return `^${childrenText}`;
      case 'sub':
        return `_${childrenText}`;
      case 'var':
        return ' ' + cleanTex(node.textContent.trim()) + ' ';
      case 'code': {
        const parentTag = node.parentNode && node.parentNode.tagName ? node.parentNode.tagName.toLowerCase() : '';
        if (parentTag === 'pre') {
          return childrenText;
        }
        return `\`${childrenText.trim()}\``;
      }
      case 'pre':
        return `\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n`;
      case 'a': {
        const href = node.getAttribute('href') || '#';
        if (href.startsWith('#') || !childrenText.trim()) return childrenText;
        return `[${childrenText.trim()}](${href})`;
      }
      case 'img': {
        const alt = node.getAttribute('alt') || 'image';
        const src = node.getAttribute('src') || '';
        return src ? `![${alt}](${src})` : '';
      }
      case 'ul':
        return `\n${childrenText}\n`;
      case 'ol':
        return `\n${childrenText}\n`;
      case 'li': {
        const parentTagName = node.parentNode && node.parentNode.tagName ? node.parentNode.tagName.toLowerCase() : '';
        const isOl = parentTagName === 'ol';
        if (isOl) {
          const index = Array.from(node.parentNode.children).indexOf(node) + 1;
          return `${index}. ${childrenText.trim()}\n`;
        }
        return `- ${childrenText.trim()}\n`;
      }
      case 'br':
        return '\n';
      case 'hr':
        return '\n---\n';
      case 'blockquote':
        return `\n> ${childrenText.trim().replace(/\n/g, '\n> ')}\n`;
      case 'div':
      case 'section':
      case 'article':
        return `\n${childrenText.trim()}\n`;
      case 'table':
        return `\n${childrenText.trim()}\n`;
      case 'thead':
      case 'tbody':
        return childrenText;
      case 'tr': {
        const cells = Array.from(node.children).map(c => ` ${walk(c).trim()} `);
        const row = `|${cells.join('|')}|`;
        // Check if this is a header row (th children)
        const isHeader = node.querySelector('th') !== null;
        if (isHeader) {
          const sep = `|${cells.map(() => '---|').join('')}`;
          return `\n${row}\n${sep}\n`;
        }
        return `\n${row}`;
      }
      case 'th':
      case 'td':
        return childrenText.trim();
      case 'span':
        return childrenText;
      default:
        return childrenText;
    }
  }

  let md = walk(el);
  // Clean up excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n');

  let lines = md.split('\n');
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    if (!inCodeBlock) {
      lines[i] = line.trim();
    }
  }
  md = lines.join('\n');

  return md.trim();
}

// ── CSES Parsing Functions ───────────────────────────────────────────────────
function cleanCSESMathInContainer(container, doc) {
  if (!container) return;

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

  container.querySelectorAll('.math, .math-inline, .math-display').forEach(mathEl => {
    const isDisplay = mathEl.classList.contains('math-display');
    const tex = mathEl.textContent.trim();
    const replacementText = isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
    mathEl.replaceWith((doc || document).createTextNode(replacementText));
  });

  container.querySelectorAll('.katex-mathml, script, style, .task-constraints').forEach(el => el.remove());
}

function parseCSESContent(contentEl, doc) {
  if (!contentEl) {
    return { body: '', inputSpec: '', outputSpec: '', constraints: '', samples: [], statementHtml: '' };
  }

  const clone = contentEl.cloneNode(true);
  cleanCSESMathInContainer(clone, doc || document);

  let currentSection = 'body';
  const bodyParts = [];
  const inputParts = [];
  const outputParts = [];
  const constraintParts = [];

  Array.from(clone.children).forEach(child => {
    const tag = child.tagName.toLowerCase();
    const text = child.textContent.trim();

    if (/^h[1-6]$/.test(tag)) {
      const ht = text.toLowerCase();
      if (/input/i.test(ht)) { currentSection = 'input'; return; }
      if (/output/i.test(ht)) { currentSection = 'output'; return; }
      if (/constraint/i.test(ht)) { currentSection = 'constraints'; return; }
      if (/example/i.test(ht)) { currentSection = 'example'; return; }
    }

    if (tag === 'pre') return;

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

function parseCSESTask(html, taskId) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let title = '';
  const titleBlockH1 = doc.querySelector('.title-block h1');
  if (titleBlockH1 && !/^(task|cses|results?)$/i.test(titleBlockH1.textContent.trim())) {
    title = titleBlockH1.textContent.trim();
  } else {
    const allH1 = doc.querySelectorAll('h1');
    for (const h of allH1) {
      const t = h.textContent.trim();
      if (t && !/^(task|cses|results?|submissions?)$/i.test(t)) {
        title = t;
        break;
      }
    }
    if (!title) {
      const dt = doc.title.replace(/^CSES\s*-\s*/i, '').replace(/\s*-\s*Results?.*$/i, '').trim();
      if (dt && !/^(task|cses|results?)$/i.test(dt)) {
        title = dt;
      }
    }
  }
  if (!title || /^task$/i.test(title)) title = taskId ? `Problem ${taskId}` : 'CSES Problem';

  let category = 'Problem Set';
  const currentLink = doc.querySelector('.nav.sidebar a.current');
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

  let timeLimit = '1.00 s';
  let memoryLimit = '512 MB';
  const constraintItems = doc.querySelectorAll('ul.task-constraints li');
  constraintItems.forEach(li => {
    const text = li.textContent.trim();
    if (/time\s*limit/i.test(text)) {
      timeLimit = text.replace(/time\s*limit:\s*/i, '').trim();
    } else if (/memory\s*limit/i.test(text)) {
      memoryLimit = text.replace(/memory\s*limit:\s*/i, '').trim();
    }
  });

  let subId = null;
  const resultLinks = doc.querySelectorAll('a[href*="/result/"], a[href*="/problemset/result/"]');
  for (const a of resultLinks) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/(?:problemset\/)?result\/(\d+)/);
    if (!m) continue;
    const parent = a.closest('li') || a.parentElement;
    const hasFull = parent && (parent.querySelector('.full, .c100') || /full|c100/i.test(parent.innerHTML));
    if (hasFull) {
      subId = m[1];
      break;
    }
  }

  const contentEl = doc.querySelector('.content .md') || doc.querySelector('.content');
  const parsed = parseCSESContent(contentEl, doc);

  return {
    taskId,
    title,
    category,
    timeLimit,
    memoryLimit,
    subId,
    body: parsed.body,
    inputSpec: parsed.inputSpec,
    outputSpec: parsed.outputSpec,
    constraints: parsed.constraints,
    samples: parsed.samples,
    statementHtml: parsed.statementHtml
  };
}

function parseCSESResult(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const codeEl = doc.querySelector('pre.linenums') ||
                 doc.querySelector('pre.prettyprint') ||
                 doc.querySelector('.content pre');
  let code = '';
  if (codeEl) {
    const lines = codeEl.querySelectorAll('li');
    if (lines.length > 0) {
      code = Array.from(lines).map(li => li.textContent).join('\n');
    } else {
      code = codeEl.textContent || codeEl.innerText || '';
    }
  }

  let compiler = 'C++';
  let runtime = 'N/A';
  let memory = 'N/A';
  let statusText = '';
  let resultText = '';

  const rows = doc.querySelectorAll('tr');
  rows.forEach(tr => {
    const text = (tr.innerText || tr.textContent || '').trim();
    const cells = tr.children;
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim().toLowerCase();
      const val = cells[1].textContent.trim();

      if (/compiler|language/i.test(label)) {
        compiler = val;
      }
      if (label === 'status:' || label === 'status') {
        statusText = val.toUpperCase();
      }
      if (label === 'result:' || label === 'result') {
        resultText = val.toUpperCase();
      }
      if (/time/i.test(label) && !/limit/i.test(label)) {
        runtime = val;
      }
      if (/memory/i.test(label) && !/limit/i.test(label)) {
        memory = val;
      }
    }
  });

  let hasFailedTest = false;
  doc.querySelectorAll('table tr').forEach(tr => {
    const text = tr.innerText || tr.textContent || '';
    if (/^#\d+/i.test(text.trim())) {
      if (/WRONG ANSWER|TIME LIMIT|RUNTIME ERROR|OUTPUT LIMIT/i.test(text)) {
        hasFailedTest = true;
      }
    }
  });

  const finalVerdict = resultText || statusText || 'Accepted';
  const isAccepted = !hasFailedTest && (
    finalVerdict === 'ACCEPTED' ||
    finalVerdict.startsWith('ACCEPTED') ||
    finalVerdict.includes('ACCEPTED (100')
  ) && !/WRONG|TIME LIMIT|RUNTIME|OUTPUT LIMIT|COMPILE/i.test(finalVerdict);

  return { code, compiler, verdict: finalVerdict, isAccepted, runtime, memory };
}


