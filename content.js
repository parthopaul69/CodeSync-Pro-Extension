// CodeforcesSync — Content Script (v4 — Scraper + Instant Sync)
'use strict';

(function () {

  // ── LaTeX → clean text ────────────────────────────────────────────────────
  function cleanTex(tex) {
    tex = tex.replace(/^\$\$\$/, '').replace(/\$\$\$$/, '').trim();

    // ── Literal braces → placeholders (before anything else) ──
    tex = tex.replace(/\\\{/g, '\u2774').replace(/\\\}/g, '\u2775');

    // ── Sizing / delimiter commands → just keep the delimiter ──
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*([()[\]|./])/g, '$1');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\\{/g, '\u2774');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\\}/g, '\u2775');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\lfloor/g, '\u230a');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\rfloor/g, '\u230b');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\lceil/g, '\u2308');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)\s*\\rceil/g, '\u2309');
    tex = tex.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, '');

    // ── Fractions: \frac{a}{b} → a/b  (handles one level of nesting) ──
    var BP = '[^{}]*(?:\\{[^{}]*\\}[^{}]*)*';   // balanced-pair pattern
    var fracRe = new RegExp('\\\\(?:d|t|c)?frac\\s*\\{(' + BP + ')\\}\\s*\\{(' + BP + ')\\}', 'g');
    for (var fi = 0; fi < 3; fi++) tex = tex.replace(fracRe, '$1/$2');

    // ── Binomial: \binom{n}{k} → C(n,k) ──
    var binomRe = new RegExp('\\\\(?:d|t)?binom\\s*\\{(' + BP + ')\\}\\s*\\{(' + BP + ')\\}', 'g');
    tex = tex.replace(binomRe, 'C($1,$2)');

    // ── sqrt: \sqrt[n]{x} → ⁿ√(x),  \sqrt{x} → √(x) ──
    tex = tex.replace(new RegExp('\\\\sqrt\\s*\\[([^\\]]*)\\]\\s*\\{(' + BP + ')\\}', 'g'), '$1√($2)');
    tex = tex.replace(new RegExp('\\\\sqrt\\s*\\{(' + BP + ')\\}', 'g'), '√($1)');

    // ── Modular ──
    tex = tex.replace(new RegExp('\\\\pmod\\s*\\{(' + BP + ')\\}', 'g'), '(mod $1)');

    // ── Formatting / text macros: \mathrm{x} → x ──
    var fmtCmd = '\\\\(?:mathrm|mathbf|mathcal|mathit|mathbb|mathfrak|mathsf|text|textbf|textit|textrm|textsf|texttt|operatorname|bf|it|rm|sf|tt|mbox|hbox)';
    var fmtRe = new RegExp(fmtCmd + '\\s*\\{(' + BP + ')\\}', 'g');
    for (var mi = 0; mi < 2; mi++) tex = tex.replace(fmtRe, '$1');

    // ── Decoration: \overline{x} → x ──
    var decCmd = '\\\\(?:overline|underline|hat|tilde|vec|bar|dot|ddot|widehat|widetilde|overleftarrow|overrightarrow)';
    tex = tex.replace(new RegExp(decCmd + '\\s*\\{(' + BP + ')\\}', 'g'), '$1');

    // ── Relations → real Unicode ──
    tex = tex.replace(/\\leq/g, '\u2264').replace(/\\le(?=[^a-z]|$)/g, '\u2264')
      .replace(/\\geq/g, '\u2265').replace(/\\ge(?=[^a-z]|$)/g, '\u2265')
      .replace(/\\lt(?=[^a-z]|$)/g, '<').replace(/\\gt(?=[^a-z]|$)/g, '>')
      .replace(/\\neq/g, '\u2260').replace(/\\ne(?=[^a-z]|$)/g, '\u2260')
      .replace(/\\equiv/g, '\u2261').replace(/\\approx/g, '\u2248')
      .replace(/\\sim(?=[^a-z]|$)/g, '\u223c').replace(/\\propto/g, '\u221d');

    // ── Arithmetic ──
    tex = tex.replace(/\\times/g, '\u00d7').replace(/\\cdot/g, '\u00b7')
      .replace(/\\div(?=[^a-z]|$)/g, '\u00f7')
      .replace(/\\bmod(?=[^a-z]|$)/g, 'mod').replace(/\\mod(?=[^a-z]|$)/g, 'mod');

    // ── Arrows ──
    tex = tex.replace(/\\rightarrow/g, '\u2192').replace(/\\leftarrow/g, '\u2190')
      .replace(/\\Rightarrow/g, '\u21d2').replace(/\\Leftarrow/g, '\u21d0')
      .replace(/\\leftrightarrow/g, '\u2194').replace(/\\Leftrightarrow/g, '\u21d4')
      .replace(/\\to(?=[^a-z]|$)/g, '\u2192').replace(/\\gets/g, '\u2190')
      .replace(/\\mapsto/g, '\u21a6').replace(/\\implies/g, '\u21d2').replace(/\\iff/g, '\u21d4');

    // ── Set / logic ──
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

    // ── Misc symbols ──
    tex = tex.replace(/\\infty/g, '\u221e').replace(/\\pm/g, '\u00b1').replace(/\\mp/g, '\u2213')
      .replace(/\\dots/g, '\u2026').replace(/\\ldots/g, '\u2026').replace(/\\cdots/g, '\u22ef')
      .replace(/\\lfloor/g, '\u230a').replace(/\\rfloor/g, '\u230b')
      .replace(/\\lceil/g, '\u2308').replace(/\\rceil/g, '\u2309')
      .replace(/\\mid(?=[^a-z]|$)/g, '|').replace(/\\nmid/g, '\u2224')
      .replace(/\\perp/g, '\u22a5').replace(/\\parallel/g, '\u2225');

    // ── Big operators (with optional \limits) ──
    tex = tex.replace(/\\sum(?:\\limits)?/g, '\u03a3').replace(/\\prod(?:\\limits)?/g, '\u03a0')
      .replace(/\\bigcup/g, '\u22c3').replace(/\\bigcap/g, '\u22c2').replace(/\\bigoplus/g, '\u2295');

    // ── Named functions ──
    tex = tex.replace(/\\log/g, 'log').replace(/\\ln/g, 'ln')
      .replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\tan/g, 'tan')
      .replace(/\\exp/g, 'exp').replace(/\\min/g, 'min').replace(/\\max/g, 'max')
      .replace(/\\gcd/g, 'gcd').replace(/\\lcm/g, 'lcm')
      .replace(/\\lim(?:\\limits)?/g, 'lim').replace(/\\det/g, 'det');

    // ── Greek letters ──
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

    // ── Fractions ──
    tex = tex.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)');

    // ── Superscripts and subscripts → Unicode ──
    tex = tex.replace(/\^{([^}]*)}/g, function(_, exp) { return toSuperscript(exp); });
    tex = tex.replace(/\^([0-9a-zA-Z])/g, function(_, c) { return toSuperscript(c); });
    tex = tex.replace(/_{([^}]*)}/g, function(_, sub) { return toSubscript(sub); });
    tex = tex.replace(/_([0-9a-zA-Z])/g, function(_, c) { return toSubscript(c); });

    // ── Spacing commands ──
    tex = tex.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '')
      .replace(/\\quad/g, ' ').replace(/\\qquad/g, '  ')
      .replace(/\\hspace\{[^}]*\}/g, ' ').replace(/\\vspace\{[^}]*\}/g, '');
    tex = tex.replace(/\\limits/g, '');
    tex = tex.replace(/\\\\/g, ' ');

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

  function toSuperscript(str) {
    const sup = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ' };
    return Array.from(str).map(c => sup[c] || c).join('');
  }

  function toSubscript(str) {
    const sub = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
    return Array.from(str).map(c => sub[c] || c).join('');
  }

  function cleanGlobal(str) {
    if (!str) return str;
    return str.replace(/\$\$\$([^$]+)\$\$\$/g, function (_, t) {
      return '`' + cleanTex(t.trim()) + '`';
    });
  }

  // ── DOM → Markdown ────────────────────────────────────────────────────────
  function toMd(el) {
    var out = '';
    var nodes = el.childNodes;
    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni];
      if (node.nodeType === 3) { out += node.textContent; continue; }
      if (node.nodeType !== 1) continue;
      var tag = node.tagName.toLowerCase();
      var cls = typeof node.className === 'string' ? node.className : '';
      if (tag === 'script') {
        var mtype = (node.getAttribute('type') || '').toLowerCase();
        if (mtype === 'math/tex' || mtype === 'math/tex; mode=display') {
          var mTex = node.textContent.trim();
          if (mTex) { out += '`' + cleanTex(mTex) + '`'; }
        }
        continue;
      }
      if (tag === 'style' || tag === 'button') continue;
      if (cls.indexOf('MathJax') >= 0 && cls.indexOf('MathJax_Preview') < 0) continue;
      if (tag === 'br') { out += '\n'; continue; }
      if (tag === 'p') { out += toMd(node) + '\n\n'; continue; }
      if (tag === 'ul' || tag === 'ol') { out += toMd(node) + '\n'; continue; }
      if (tag === 'li') { out += '- ' + toMd(node).trim() + '\n'; continue; }
      if (tag === 'strong' || tag === 'b') { out += '**' + toMd(node) + '**'; continue; }
      if (tag === 'em' || tag === 'i') { out += '*' + toMd(node) + '*'; continue; }
      if (tag === 'sup') { out += '^' + toMd(node); continue; }
      if (cls.indexOf('tex-span') >= 0) {
        var clone = node.cloneNode(true);
        clone.querySelectorAll('sub').forEach(function(s) {
          s.parentNode.replaceChild(document.createTextNode(toSubscript(s.textContent.trim())), s);
        });
        clone.querySelectorAll('sup').forEach(function(s) {
          s.parentNode.replaceChild(document.createTextNode(toSuperscript(s.textContent.trim())), s);
        });
        var cleaned = cleanTex(clone.textContent.trim());
        out += '`' + cleaned + '`';
        continue;
      }
      if (tag === 'tt' || tag === 'code' || cls.indexOf('tex-font-style-tt') >= 0) {
        out += '`' + node.textContent + '`'; continue;
      }
      if (cls.indexOf('tex-font-style-bf') >= 0) { out += '**' + toMd(node) + '**'; continue; }
      if (cls.indexOf('tex-font-style-it') >= 0) { out += '*' + toMd(node) + '*'; continue; }
      if (cls.indexOf('MathJax_Preview') >= 0) {
        // Already handled by script[type=math/tex], skip duplicate
        continue;
      }
      if (tag === 'img') {
        var src = node.getAttribute('src') || '';
        if (src && src[0] === '/') src = 'https://codeforces.com' + src;
        out += '![](' + src + ')'; continue;
      }
      if (cls.indexOf('section-title') >= 0) {
        out += '### ' + node.textContent.trim() + '\n\n'; continue;
      }
      out += toMd(node);
    }
    return out;
  }

  function cleanPre(preEl) {
    if (!preEl) return '';
    var lines = preEl.querySelectorAll('.test-example-line');
    if (lines.length > 0) return Array.from(lines).map(function (l) { return l.textContent; }).join('\n');
    var lis = preEl.querySelectorAll('li');
    if (lis.length > 0) return Array.from(lis).map(function (l) { return l.textContent; }).join('\n');
    var clone = preEl.cloneNode(true);
    clone.querySelectorAll('br').forEach(function(br) {
      if (br.parentNode) br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });
    return (clone.innerText || clone.textContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  function getSection(ps, clsName) {
    var el = ps.querySelector('.' + clsName);
    if (!el) return null;
    var clone = el.cloneNode(true);
    var t = clone.querySelector('.section-title');
    if (t) t.remove();
    return cleanGlobal(toMd(clone).replace(/\n{3,}/g, '\n\n').trim());
  }

  // ── Scrape problem statement from current page ────────────────────────────
  function scrapeProblem() {
    var ps = document.querySelector('.problem-statement');
    if (!ps) return null;

    var timeLimit = null, memLimit = null;
    var tlEl = ps.querySelector('.time-limit');
    var mlEl = ps.querySelector('.memory-limit');
    if (tlEl) {
      var tlC = tlEl.cloneNode(true);
      var tlT = tlC.querySelector('.property-title'); if (tlT) tlT.remove();
      timeLimit = tlC.textContent.trim();
    }
    if (mlEl) {
      var mlC = mlEl.cloneNode(true);
      var mlT = mlC.querySelector('.property-title'); if (mlT) mlT.remove();
      memLimit = mlC.textContent.trim();
    }

    var body = '';
    for (var ci = 0; ci < ps.children.length; ci++) {
      var child = ps.children[ci];
      var cc = typeof child.className === 'string' ? child.className : '';
      if (cc.indexOf('header') >= 0) continue;
      if (cc.indexOf('input-specification') >= 0) break;
      body += toMd(child) + '\n';
    }
    body = cleanGlobal(body.replace(/\n{3,}/g, '\n\n').trim());

    var samples = '';
    var st = ps.querySelector('.sample-tests');
    if (st) {
      var iPres = st.querySelectorAll('.input pre');
      var oPres = st.querySelectorAll('.output pre');
      for (var si = 0; si < iPres.length; si++) {
        var inTxt = cleanPre(iPres[si]);
        var outTxt = oPres[si] ? cleanPre(oPres[si]) : '';
        var lbl = iPres.length > 1 ? ' ' + (si + 1) : '';
        samples += '**Example' + lbl + ':**\n\n```\n' + inTxt + '\n```\n\n';
        samples += '**Output' + lbl + ':**\n\n```\n' + outTxt + '\n```\n\n';
      }
      samples = cleanGlobal(samples.trim());
    }

    return {
      timeLimit: timeLimit, memLimit: memLimit,
      body: body,
      inputSpec: getSection(ps, 'input-specification'),
      outputSpec: getSection(ps, 'output-specification'),
      samples: samples,
      note: getSection(ps, 'note'),
      url: window.location.href
    };
  }

  // ── Scrape SGU/acmsguru problem statement from current page ──────────────
  function scrapeSGUProblem() {
    var ps = document.querySelector('.ttypography');
    if (!ps) return null;

    // Step into line-height wrapper div if present
    var innerDiv = ps.querySelector('div[style*="line-height"]');
    if (innerDiv && innerDiv.tagName.toLowerCase() === 'div') ps = innerDiv;

    // Step into layout table td if present (exactly like offscreen.js)
    var layoutTable = (ps.firstElementChild && ps.firstElementChild.tagName.toLowerCase() === 'table') ? ps.firstElementChild : null;
    if (layoutTable) {
      var mainTd = layoutTable.querySelector('td[valign="top"]') || layoutTable.querySelector('td');
      if (mainTd) ps = mainTd;
    }

    // Extract time/memory limits
    var fullText = ps.textContent || '';
    var tlMatch = fullText.match(/Time\s+limit[^:]*:\s*([0-9.]+\s*(?:sec(?:ond(?:s|\(s\))?)?)?)/i);
    var mlMatch = fullText.match(/Memory\s+limit[^:]*:\s*(\d+\s*(?:KB|kilobytes?))/i);
    var timeLimit = tlMatch ? tlMatch[1].trim() : null;
    var memLimit  = mlMatch ? mlMatch[1].trim() : null;

    // Helper functions exactly like offscreen.js
    function getSectionType(node) {
      if (!node) return null;
      var txt = node.textContent.trim().toLowerCase();
      if (txt.length > 40) return null;
      var norm = txt.replace(/[^a-z()]/g, '');
      if (norm === 'input' || norm === 'inputfile') return 'input';
      if (norm === 'output' || norm === 'outputfile') return 'output';
      if (norm === 'sampleinput' || norm === 'sampleinputfile') return 'sample_input';
      if (norm === 'sampleoutput' || norm === 'sampleoutputfile') return 'sample_output';
      if (norm === 'note') return 'note';
      if (norm === 'examples' || norm === 'example' || norm === 'examples' || norm === 'example(s)') return 'samples';
      return null;
    }

    function nodesToMd(arr) {
      if (!arr.length) return '';
      var tmp = document.createElement('div');
      arr.forEach(function(n) { tmp.appendChild(n.cloneNode(true)); });
      // Remove time/memory limit lines
      Array.from(tmp.querySelectorAll('*')).forEach(function(el) {
        if (/time limit|memory limit/i.test(el.textContent) && el.textContent.length < 200) {
          el.remove();
        }
      });
      return cleanGlobal(toMd(tmp).replace(/\n{3,}/g, '\n\n').trim());
    }

    function stripMeta(s) {
      return s.replace(/(?:Author|Resource|Date)\s*:[\s\S]*/i, '').trim();
    }

    var body = '', inputSpec = '', outputSpec = '', samples = '', note = '';

    var hasFontPre = !!ps.querySelector('font > pre');
    var hasAlignLeftHeaders = !hasFontPre && !!ps.querySelector('div[align="left"]');

    if (hasFontPre) {
      // ── Layout C (e.g. acmsguru100) ──────────────────────────────────
      var bodyNodes = [], inputNodes = [], outputNodes = [], noteNodes = [];
      var curSec = 'body';

      Array.from(ps.childNodes).forEach(function(node) {
        var sec = getSectionType(node);
        if (sec !== null) { curSec = sec; return; }

        if (node.nodeType === 1) {
          var tag = node.tagName.toLowerCase();
          if (tag === 'font') return;
          if (tag === 'h3' || tag === 'h4') return;
          if (tag === 'div' && node.getAttribute('align') === 'center') return;
          var rl = (node.textContent || '').toLowerCase();
          if (rl.match(/time limit|memory limit/) && node.textContent.length < 300) return;
        }
        if (node.nodeType === 3) {
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

        if (node.nodeType === 1) {
          var tag = node.tagName.toLowerCase();
          if (tag === 'div' && node.getAttribute('align') === 'center') return;
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
      var bodyNodes = [], inputNodes = [], outputNodes = [], noteNodes = [];
      var curSec = 'body';

      Array.from(ps.childNodes).forEach(function(node) {
        var sec = getSectionType(node);
        if (sec !== null) { curSec = sec; return; }

        if (node.nodeType === 1) {
          var tag = node.tagName.toLowerCase();
          if (tag === 'div' && node.getAttribute('align') === 'center') return;
          if (tag === 'h3' || tag === 'h4') return;
          var rl = (node.textContent || '').toLowerCase();
          if (rl.match(/time limit|memory limit/) && node.textContent.length < 300) return;

          if (tag === 'table' && (curSec === 'sample_input' || curSec === 'sample_output' || curSec === 'samples')) {
            var pres = Array.from(node.querySelectorAll('pre'));
            if (pres.length >= 2) {
              var startIdx = pres.length >= 4 ? pres.length - 2 : 0;
              var firstText = pres[0].textContent.trim().toLowerCase();
              if (pres.length >= 4 && (firstText.indexOf('sample') >= 0 || firstText.indexOf('input') >= 0)) {
                startIdx = 2;
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

          if (tag === 'pre') {
            var inTxt = node.textContent.trim();
            samples += '**Example:**\n\n```\n' + inTxt + '\n```\n\n';
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
    }

    return {
      timeLimit: timeLimit,
      memLimit:  memLimit,
      body:       body,
      inputSpec:  inputSpec,
      outputSpec: outputSpec,
      samples:    samples.trim(),
      note:       note,
      url: window.location.href
    };
  }

  function isContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // ── Try to scrape if we're on a problem page ──────────────────────────────
  function tryScrapeProblem() {
    var path = window.location.pathname;
    var m = path.match(/\/(contest|gym)\/(\d+)\/problem\/([A-Z0-9]+)/i)
      || path.match(/\/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i)
      || path.match(/\/problemsets\/acmsguru\/problem\/99999\/([a-zA-Z0-9]+)/i);
    if (!m) return;

    var isSgu = path.indexOf('problemsets/acmsguru') >= 0;
    var delay = isSgu ? 500 : 3000;

    // Wait for MathJax to render
    setTimeout(function () {
      try {
        if (!isContextValid()) return;
        var contestId, idx;
        if (isSgu) {
          contestId = 'acmsguru'; idx = m[1];
        } else if (path.indexOf('problemset') >= 0) {
          contestId = m[1]; idx = m[2];
        } else {
          contestId = m[2]; idx = m[3];
        }

        // Same flow for ALL problems: scrape live DOM → CACHE_PROBLEM
        var stmt = (contestId === 'acmsguru') ? scrapeSGUProblem() : scrapeProblem();
        if (!stmt || (!stmt.body && !stmt.inputSpec && !stmt.samples)) return;
        chrome.runtime.sendMessage({
          type: 'CACHE_PROBLEM',
          contestId: String(contestId),
          idx: idx.toUpperCase(),
          stmt: stmt
        });
        console.log('[CodeSync Pro] Cached problem statement for', contestId, idx);
      } catch (e) {}
    }, delay);
  }

  // ── Instant verdict detection ─────────────────────────────────────────────
  var syncCooldown = false;
  function triggerSync() {
    try {
      if (!isContextValid()) return;
      if (syncCooldown) return;
      chrome.storage.local.get('cfEnabled', function (res) {
        try {
          if (!isContextValid()) return;
          if (res.cfEnabled === false) return;
          syncCooldown = true;
          chrome.runtime.sendMessage({ type: 'TRIGGER_POLL' });
          setTimeout(function () { syncCooldown = false; }, 30000);
        } catch (e) {}
      });
    } catch (e) {}
  }

  var ACCEPTED_SEL = '.verdict-accepted,[class*="verdict-Accepted"],td.status-verdict-cell.verdict-accepted';
  var PENDING_SEL = '.verdict-waiting,.verdict-running,[class*="verdict-Running"],[class*="verdict-Waiting"],[class*="verdict-Judging"]';

  function isAccepted() { return !!document.querySelector(ACCEPTED_SEL); }
  function isPending() { return !!document.querySelector(PENDING_SEL); }

  var fastInterval = null;
  function startFastPoll() {
    if (fastInterval) return;
    fastInterval = setInterval(function () {
      try {
        if (!isContextValid()) { stopFastPoll(); return; }
        if (isAccepted()) { triggerSync(); stopFastPoll(); }
        else if (!isPending()) stopFastPoll();
      } catch (e) { stopFastPoll(); }
    }, 2000);
  }
  function stopFastPoll() {
    if (fastInterval) { clearInterval(fastInterval); fastInterval = null; }
  }

  try {
    new MutationObserver(function () {
      try {
        if (!isContextValid()) return;
        if (isAccepted()) triggerSync();
        else if (isPending() && !fastInterval) startFastPoll();
      } catch (e) {}
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  } catch (e) {}

  if (isPending()) startFastPoll();

  try {
    tryScrapeProblem();
  } catch (e) {}

  // Remove legacy "Synced to GitHub" floating badge if present in DOM
  const strayBadge = document.getElementById('codesync-pro-badge');
  if (strayBadge) strayBadge.remove();

  // ── Codeforces Turnstile & Submission Helpers ──────────────────────────────
  // ── Codeforces Turnstile & Submission Helpers ──────────────────────────────
  function showCFSubmitBanner(text, icon = '⚡') {
    let banner = document.getElementById('codesync-cf-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'codesync-cf-banner';
      banner.style.cssText = [
        'position: fixed',
        'top: 18px',
        'left: 50%',
        'transform: translateX(-50%)',
        'z-index: 99999999',
        'background: #161b22',
        'color: #e6edf3',
        'border: 1px solid #30363d',
        'border-left: 4px solid #2f81f7',
        'padding: 12px 22px',
        'border-radius: 6px',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'font-size: 13px',
        'font-weight: 500',
        'box-shadow: 0 8px 24px rgba(0,0,0,0.5)',
        'display: flex',
        'align-items: center',
        'gap: 10px',
        'pointer-events: auto'
      ].join(';');
      document.body.appendChild(banner);
    }
    banner.innerHTML = `<span style="font-size:16px;">${icon}</span><span>${text}</span>`;
  }

  function removeCFSubmitBanner() {
    const banner = document.getElementById('codesync-cf-banner');
    if (banner) banner.remove();
  }

  async function executeCFSubmission(form, code, lang, contestId, idx) {
    try {
      showCFSubmitBanner('Setting up 1-click submission (GNU G++23)...', '⚡');

      const langMap = {
        cpp: ['91', '89', '54', '61', '50'], // 91 is GNU G++23 14.2 (64-bit)
        cpp23: ['91'],
        cpp20: ['91', '89'],
        cpp17: ['91', '89', '54'],
        python: ['31', '40', '70'], // Python 3, PyPy 3
        python312: ['31', '70'],
        java: ['87', '60', '36'], // Java 21, Java 17, Java 8
        rust: ['75'],
        go: ['32'],
        javascript: ['34'],
        kotlin: ['83', '48'],
        csharp: ['88', '79', '9']
      };
      const candidates = langMap[lang] || langMap.cpp;

      // 1. Program Type (Language) Selection - Defaulting to GNU G++23 14.2 (64-bit)
      const langSelect = form.querySelector('select[name="programTypeId"]') || document.querySelector('select[name="programTypeId"]');
      if (langSelect) {
        let matched = false;
        const isCpp = !lang || lang.toLowerCase().startsWith('cpp');

        if (isCpp) {
          // Strictly prioritize option 91 (GNU G++23 14.2)
          const opt91 = langSelect.querySelector('option[value="91"]');
          if (opt91) {
            langSelect.value = '91';
            langSelect.dispatchEvent(new Event('change', { bubbles: true }));
            langSelect.dispatchEvent(new Event('input', { bubbles: true }));
            matched = true;
          }
        }

        if (!matched) {
          for (const cand of candidates) {
            const opt = langSelect.querySelector(`option[value="${cand}"]`);
            if (opt) {
              langSelect.value = cand;
              langSelect.dispatchEvent(new Event('change', { bubbles: true }));
              langSelect.dispatchEvent(new Event('input', { bubbles: true }));
              matched = true;
              break;
            }
          }
        }

        if (!matched && langSelect.options.length > 0) {
          if (isCpp) {
            for (let i = 0; i < langSelect.options.length; i++) {
              const optText = langSelect.options[i].textContent.toLowerCase();
              if (optText.includes('23') && (optText.includes('g++') || optText.includes('c++') || optText.includes('gnu'))) {
                langSelect.selectedIndex = i;
                langSelect.dispatchEvent(new Event('change', { bubbles: true }));
                langSelect.dispatchEvent(new Event('input', { bubbles: true }));
                matched = true;
                break;
              }
            }
          }
          if (!matched) {
            const langKey = (lang || 'cpp').toLowerCase();
            for (let i = 0; i < langSelect.options.length; i++) {
              const optText = langSelect.options[i].textContent.toLowerCase();
              if ((langKey.startsWith('cpp') && (optText.includes('g++') || optText.includes('c++'))) ||
                  (langKey.startsWith('python') && optText.includes('python 3')) ||
                  (langKey.startsWith('java') && optText.includes('java')) ||
                  (langKey === 'rust' && optText.includes('rust')) ||
                  (langKey === 'go' && optText.includes('go')) ||
                  (langKey === 'javascript' && (optText.includes('javascript') || optText.includes('node')))) {
                langSelect.selectedIndex = i;
                langSelect.dispatchEvent(new Event('change', { bubbles: true }));
                langSelect.dispatchEvent(new Event('input', { bubbles: true }));
                break;
              }
            }
          }
        }
      }

      // 2. Ensure Problem Code / Index is set
      if (contestId && idx) {
        const probInput = form.querySelector('input[name="submittedProblemCode"]') ||
                          document.querySelector('input[name="submittedProblemCode"]');
        if (probInput && (!probInput.value || probInput.value.trim() === '')) {
          probInput.value = `${contestId}${idx}`;
          probInput.dispatchEvent(new Event('change', { bubbles: true }));
          probInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const idxSelect = form.querySelector('select[name="submittedProblemIndex"]') ||
                          document.querySelector('select[name="submittedProblemIndex"]');
        if (idxSelect) {
          for (let i = 0; i < idxSelect.options.length; i++) {
            if (idxSelect.options[i].value.toUpperCase() === idx.toUpperCase() ||
                idxSelect.options[i].textContent.trim().toUpperCase().startsWith(idx.toUpperCase())) {
              idxSelect.selectedIndex = i;
              idxSelect.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }

      // 3. Prevent duplicate 'source' parameters in HTTP POST
      // Check if "Switch off editor" is enabled on the page
      const toggleCb = document.getElementById('toggleEditorCheckbox') ||
                       document.querySelector('input[name="toggleEditorCheckbox"]');
      const isSwitchOff = !!(toggleCb && toggleCb.checked);

      // Ensure only ONE textarea in the entire form has name="source"
      const allSourceTas = form.querySelectorAll('textarea[name="source"]');
      if (allSourceTas.length > 1) {
        for (let i = 1; i < allSourceTas.length; i++) {
          allSourceTas[i].removeAttribute('name');
        }
      }

      // Find the single primary target textarea
      let primaryTa = null;
      if (isSwitchOff) {
        primaryTa = document.querySelector('textarea#sourceCodeTextarea') ||
                    document.querySelector('textarea.source-code') ||
                    document.querySelector('textarea#source') ||
                    form.querySelector('textarea');
      } else {
        primaryTa = document.querySelector('textarea#source') ||
                    form.querySelector('textarea[name="source"]') ||
                    form.querySelector('textarea');
      }

      if (primaryTa) {
        primaryTa.name = 'source';
        primaryTa.value = code;
        primaryTa.dispatchEvent(new Event('input', { bubbles: true }));
        primaryTa.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // If Ace editor is enabled (Switch off editor is UNCHECKED), sync into Ace Editor in MAIN world
      if (!isSwitchOff) {
        try {
          const script = document.createElement('script');
          script.textContent = `
            (function() {
              try {
                var edEl = document.querySelector('#editor') || document.querySelector('.ace_editor');
                if (edEl && window.ace) {
                  var ed = window.ace.edit(edEl);
                  if (ed) {
                    ed.setValue(${JSON.stringify(code)}, -1);
                    ed.clearSelection();
                  }
                }
              } catch(e) {}
            })();
          `;
          (document.head || document.documentElement).appendChild(script);
          script.remove();
        } catch(e) {}
      }

      // 4. Ensure sourceCodeConfirmed is set
      let confInput = form.querySelector('input[name="sourceCodeConfirmed"]');
      if (!confInput) {
        confInput = document.createElement('input');
        confInput.type = 'hidden';
        confInput.name = 'sourceCodeConfirmed';
        form.appendChild(confInput);
      }
      confInput.value = 'true';

      // 5. Ensure action is submitSolutionFormSubmitted
      let actionInput = form.querySelector('input[name="action"]');
      if (!actionInput) {
        actionInput = document.createElement('input');
        actionInput.type = 'hidden';
        actionInput.name = 'action';
        form.appendChild(actionInput);
      }
      actionInput.value = 'submitSolutionFormSubmitted';

      // 6. Clear file input
      const fileInput = form.querySelector('input[type="file"][name="sourceFile"]') || form.querySelector('input[type="file"]');
      if (fileInput) {
        try { fileInput.value = ''; } catch(e) {}
      }

      // 7. Cloudflare Turnstile Verification Handling
      const getTurnstileToken = () => {
        // 1. Check all elements (input OR textarea) that could hold Turnstile token
        const els = document.querySelectorAll(
          '[name="cf-turnstile-response"], [name="g-recaptcha-response"], [name*="turnstile"], [name*="recaptcha"]'
        );
        for (const el of els) {
          if (el && el.value && el.value.trim().length > 15) {
            return el.value.trim();
          }
        }
        // 2. Check Turnstile widget visual success state
        const widget = document.querySelector('.cf-turnstile') ||
                       document.querySelector('iframe[src*="challenges.cloudflare.com"]')?.closest('div');
        if (widget && widget.textContent && widget.textContent.toLowerCase().includes('success')) {
          return 'verified_by_widget_success';
        }
        return null;
      };

      const hasTurnstile = () => !!(
        document.querySelector('.cf-turnstile') ||
        document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
        document.querySelector('[name="cf-turnstile-response"]')
      );

      const triggerSubmit = () => {
        const submitBtn = form.querySelector('input[type="submit"].submit') ||
                          form.querySelector('input[type="submit"]') ||
                          form.querySelector('button[type="submit"]') ||
                          document.querySelector('input[type="submit"].submit') ||
                          document.querySelector('input[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.click();
        } else {
          form.submit();
        }
      };

      // Check if already verified immediately!
      let token = getTurnstileToken();
      if (!token && hasTurnstile()) {
        showCFSubmitBanner('Waiting for anti-bot verification (Cloudflare)...', '🛡️');

        // Poll every 150ms up to 10 seconds
        for (let i = 0; i < 65; i++) {
          token = getTurnstileToken();
          if (token) break;
          await new Promise(r => setTimeout(r, 150));
        }

        // If manual click needed
        if (!token) {
          const widget = document.querySelector('.cf-turnstile') ||
                         document.querySelector('iframe[src*="challenges.cloudflare.com"]');
          if (widget) {
            widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          showCFSubmitBanner('Click the verification checkbox above to finish submitting!', '🛡️');

          for (let i = 0; i < 300; i++) {
            token = getTurnstileToken();
            if (token) break;
            await new Promise(r => setTimeout(r, 150));
          }
        }
      }

      showCFSubmitBanner('Anti-bot verified! Submitting solution to Codeforces...', '⚡');
      await new Promise(r => setTimeout(r, 200));

      removeCFSubmitBanner();
      triggerSubmit();
    } catch(err) {
      console.warn('[CodeSync Pro] Submission execution error:', err);
      removeCFSubmitBanner();
    }
  }

  // Handle auto-submit on dedicated submit page if redirected from problem page or IDE
  (async function checkPendingCFSubmit() {
    try {
      let pendingRaw = sessionStorage.getItem('codesync_auto_submit');
      if (!pendingRaw && isContextValid()) {
        const stored = await chrome.storage.local.get(['cf_pending_submit']).catch(() => ({}));
        if (stored && stored.cf_pending_submit) {
          const age = Date.now() - (stored.cf_pending_submit.timestamp || 0);
          if (age < 180000) { // 3 minutes
            pendingRaw = JSON.stringify(stored.cf_pending_submit);
          }
        }
      }

      if (!pendingRaw) return;

      const path = window.location.pathname;
      if (!path.includes('/submit')) return; // Dedicated submit page only

      const pendingData = JSON.parse(pendingRaw);
      const { code, lang, contestId, idx } = pendingData;
      if (!code) return;

      showCFSubmitBanner('CodeSync Pro: Submitting in GNU G++23...', '⚡');

      // Bulletproof form detection via native input.form references (up to 10 seconds)
      let form = null;
      for (let i = 0; i < 50; i++) {
        const sel = document.querySelector('select[name="programTypeId"]');
        if (sel && sel.form) { form = sel.form; break; }
        const ta = document.querySelector('textarea[name="source"]') || document.querySelector('textarea#sourceCodeTextarea') || document.querySelector('textarea');
        if (ta && ta.form) { form = ta.form; break; }
        const btn = document.querySelector('input[type="submit"]');
        if (btn && btn.form) { form = btn.form; break; }
        form = document.querySelector('form.submit-form') ||
               document.querySelector('form.table-form') ||
               document.querySelector('#singlePageSubmitForm') ||
               document.querySelector('form[action*="submit"]') ||
               document.querySelector('form');
        if (form) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (form) {
        // Clear pending submit data once form is located
        sessionStorage.removeItem('codesync_auto_submit');
        if (isContextValid()) {
          chrome.storage.local.remove(['cf_pending_submit']).catch(() => {});
        }
        await executeCFSubmission(form, code, lang, contestId, idx);
      } else {
        removeCFSubmitBanner();
        console.warn('[CodeSync Pro] Submit form not found on submit page.');
      }
    } catch (e) {
      removeCFSubmitBanner();
      console.warn('[CodeSync Pro] Pending submit error:', e);
    }
  })();

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

          if (message.type === 'GET_CF_SOURCE') {
            (async () => {
              try {
                let csrf = '';
                const metaEl = document.querySelector('meta[name="X-Csrf-Token"]');
                if (metaEl) csrf = metaEl.getAttribute('content') || '';
                if (!csrf) {
                  const inputEl = document.querySelector('input[name="csrf_token"]');
                  if (inputEl) csrf = inputEl.value || '';
                }
                if (!csrf) {
                  sendResponse({ ok: false, error: 'NO_CSRF' });
                  return;
                }

                const resp = await fetch(window.location.origin + '/data/submitSource', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                  },
                  body: `submissionId=${message.submissionId}&csrf_token=${csrf}`
                });
                if (!resp.ok) {
                  sendResponse({ ok: false, error: `HTTP ${resp.status}` });
                  return;
                }
                const text = await resp.text();
                const json = JSON.parse(text);
                if (json.source && json.source.trim().length > 0) {
                  sendResponse({ ok: true, source: json.source });
                } else {
                  sendResponse({ ok: false, error: 'Empty source returned' });
                }
              } catch(err) {
                sendResponse({ ok: false, error: err.message });
              }
            })();
            return true; // Keep the message channel open for async response
          }

          if (message.type === 'GET_PROBLEM_DATA') {
            const titleEl = document.querySelector('.problem-statement .header .title');
            const timeLimitEl = document.querySelector('.problem-statement .header .time-limit');
            const memoryLimitEl = document.querySelector('.problem-statement .header .memory-limit');
            const stmtEl = document.querySelector('.problem-statement');

            const samples = [];
            const inputs = document.querySelectorAll('.sample-test .input pre');
            const outputs = document.querySelectorAll('.sample-test .output pre');
            for (let i = 0; i < Math.min(inputs.length, outputs.length); i++) {
              samples.push({
                input: cleanPre(inputs[i]).trim(),
                output: cleanPre(outputs[i]).trim()
              });
            }

            let sanitizedStmt = '';
            if (stmtEl) {
              const clone = stmtEl.cloneNode(true);
              const header = clone.querySelector('.header');
              if (header) header.remove();
              clone.querySelectorAll('.time-limit, .memory-limit, .input-file, .output-file, .property-title, button').forEach(el => el.remove());
              sanitizedStmt = clone.innerHTML;
            }

            sendResponse({
              ok: true,
              data: {
                platform: 'CF',
                title: titleEl ? titleEl.textContent.trim() : document.title,
                url: window.location.href,
                slug: window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_'),
                limits: {
                  timeLimit: timeLimitEl ? timeLimitEl.textContent.trim() : '',
                  memoryLimit: memoryLimitEl ? memoryLimitEl.textContent.trim() : ''
                },
                statement: sanitizedStmt,
                samples: samples
              }
            });
            return false;
          }

          if (message.type === 'TOGGLE_ZEN_MODE') {
            document.querySelectorAll('.tag-box, .roundbox, .rtable').forEach(el => {
              const text = (el.textContent || '').toLowerCase();
              if (text.includes('problem tags') || text.includes('rating') || text.includes('difficulty')) {
                el.style.display = message.enabled ? 'none' : '';
              }
            });
            sendResponse({ ok: true });
            return false;
          }

          if (message.type === 'SUBMIT_CODE') {
            (async () => {
              try {
                const code = message.code;
                const lang = message.language || 'cpp';

                // 1. If ALREADY on a dedicated submit page, submit directly!
                if (window.location.pathname.includes('/submit')) {
                  const sel = document.querySelector('select[name="programTypeId"]');
                  const ta = document.querySelector('textarea[name="source"]') || document.querySelector('textarea#sourceCodeTextarea');
                  const btn = document.querySelector('input[type="submit"]');
                  const form = (sel && sel.form) ||
                               (ta && ta.form) ||
                               (btn && btn.form) ||
                               document.querySelector('form.submit-form') ||
                               document.querySelector('form');
                  if (form) {
                    await executeCFSubmission(form, code, lang);
                    sendResponse({ ok: true, method: 'submitted_on_page' });
                    return;
                  }
                }

                // 2. On a problem page:
                // NEVER submit via the problem page sidebar form. Codeforces strictly requires
                // Cloudflare Turnstile anti-bot verification which only exists on dedicated submit pages.
                // We extract the problem details and navigate to the dedicated submit page for 1-click auto-submit.
                const path = window.location.pathname;
                const m = path.match(/\/(contest|gym)\/(\d+)\/problem\/([A-Z0-9]+)/i) ||
                          path.match(/\/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i) ||
                          path.match(/\/group\/([^/]+)\/contest\/(\d+)\/problem\/([A-Z0-9]+)/i);

                let contestId = null;
                let idx = null;
                let isProblemset = false;
                let isGym = false;
                let groupId = null;

                if (m) {
                  if (path.includes('/problemset/')) {
                    isProblemset = true;
                    contestId = m[1];
                    idx = m[2];
                  } else if (path.includes('/group/')) {
                    groupId = m[1];
                    contestId = m[2];
                    idx = m[3];
                  } else if (path.includes('/gym/')) {
                    isGym = true;
                    contestId = m[2];
                    idx = m[3];
                  } else {
                    contestId = m[2];
                    idx = m[3];
                  }
                } else {
                  // Fallback: title matching
                  const probCodeEl = document.querySelector('.problem-statement .header .title');
                  if (probCodeEl) {
                    const txt = probCodeEl.textContent.trim();
                    const codeMatch = txt.match(/^([0-9]+)([A-Z0-9]+)/i);
                    if (codeMatch) {
                      contestId = codeMatch[1];
                      idx = codeMatch[2];
                      isProblemset = true;
                    }
                  }
                }

                if (contestId && idx) {
                  const pendingData = {
                    code,
                    lang,
                    contestId,
                    idx,
                    timestamp: Date.now()
                  };
                  sessionStorage.setItem('codesync_auto_submit', JSON.stringify(pendingData));
                  if (isContextValid()) {
                    await chrome.storage.local.set({ cf_pending_submit: pendingData }).catch(() => {});
                  }

                  let targetSubmitPage;
                  if (groupId) {
                    targetSubmitPage = `https://codeforces.com/group/${groupId}/contest/${contestId}/submit?submittedProblemIndex=${idx}`;
                  } else if (isGym) {
                    targetSubmitPage = `https://codeforces.com/gym/${contestId}/submit?submittedProblemIndex=${idx}`;
                  } else if (isProblemset) {
                    targetSubmitPage = `https://codeforces.com/problemset/submit?submittedProblemCode=${contestId}${idx}`;
                  } else {
                    targetSubmitPage = `https://codeforces.com/contest/${contestId}/submit?submittedProblemIndex=${idx}`;
                  }

                  window.location.href = targetSubmitPage;
                  sendResponse({ ok: true, method: 'redirect_to_submit' });
                  return;
                }

                sendResponse({ ok: false, error: 'Could not determine Codeforces problem code to submit.' });
              } catch (e) {
                sendResponse({ ok: false, error: e.message });
              }
            })();
            return true;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  function extractCFProblemData() {
    const titleEl = document.querySelector('.problem-statement .header .title');
    const timeLimitEl = document.querySelector('.problem-statement .time-limit') || document.querySelector('.problem-statement .header .time-limit');
    const memoryLimitEl = document.querySelector('.problem-statement .memory-limit') || document.querySelector('.problem-statement .header .memory-limit');
    const stmtEl = document.querySelector('.problem-statement');

    const timeLimit = timeLimitEl ? timeLimitEl.textContent.replace(/^time limit per test/i, '').trim() : '1s';
    const memoryLimit = memoryLimitEl ? memoryLimitEl.textContent.replace(/^memory limit per test/i, '').trim() : '256MB';

    const samples = [];
    const inEls = document.querySelectorAll('.sample-test .input');
    const outEls = document.querySelectorAll('.sample-test .output');
    inEls.forEach((inEl, idx) => {
      const outEl = outEls[idx];
      if (inEl && outEl) {
        const inPre = inEl.querySelector('pre');
        const outPre = outEl.querySelector('pre');
        const input = inPre ? cleanPre(inPre).trim() : '';
        const output = outPre ? cleanPre(outPre).trim() : '';
        samples.push({ input, output });
      }
    });

    let statementHtml = '';
    if (stmtEl) {
      const clone = stmtEl.cloneNode(true);
      const header = clone.querySelector('.header');
      if (header) header.remove();
      clone.querySelectorAll('.time-limit, .memory-limit, .input-file, .output-file, .property-title, button').forEach(el => el.remove());
      statementHtml = clone.innerHTML;
    }

    return {
      platform: 'CF',
      title: titleEl ? titleEl.textContent.trim() : document.title,
      url: window.location.href,
      slug: window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_'),
      limits: { timeLimit, memoryLimit },
      samples: samples,
      statement: statementHtml,
      statementHtml: statementHtml
    };
  }

  function injectIdeFloatingButton() {
    const path = window.location.pathname;
    const isProblemPage = /\/(problemset\/problem|contest\/\d+\/problem|gym\/\d+\/problem|group\/[^/]+\/contest\/\d+\/problem)\//i.test(path);
    if (!isProblemPage || !document.querySelector('.problem-statement') || document.getElementById('codesync-ide-btn')) return;
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
      try {
        if (!isContextValid()) return;
        const problemData = extractCFProblemData();
        btn.innerHTML = '⚡ <span>Opening in CodeSync IDE...</span>';
        setTimeout(() => {
          if (btn) btn.innerHTML = '⚡ <span>Solve in CodeSync IDE</span>';
        }, 2500);
        chrome.runtime.sendMessage({
          type: 'OPEN_IDE',
          problemData: problemData,
          problem: problemData
        });
      } catch (e) {}
    });
    document.body.appendChild(btn);

    // Broadcast problem detected to IDE
    try {
      if (isContextValid()) {
        const problemData = extractCFProblemData();
        if (problemData && problemData.statement) {
          chrome.runtime.sendMessage({
            type: 'PROBLEM_DETECTED',
            data: problemData
          }).catch(() => {});
        }
      }
    } catch (e) {}
  }

  function handleSidebarFormInterception() {
    const path = window.location.pathname;
    if (path.includes('/submit')) return; // Dedicated submit page is handled separately

    // Clean up any stray banner that might linger on a problem page
    removeCFSubmitBanner();

    const sidebarForm = document.querySelector('#sidebar form') ||
                        document.querySelector('.sidebox form') ||
                        document.querySelector('.sidebar-form') ||
                        document.querySelector('form[action*="problem"]');
    if (!sidebarForm) return;

    // Prevent direct sidebar submission from displaying "anti-bot" errors
    sidebarForm.addEventListener('submit', (e) => {
      const fileInput = sidebarForm.querySelector('input[type="file"]');
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        e.preventDefault();
        e.stopPropagation();

        const m = path.match(/\/(contest|gym)\/(\d+)\/problem\/([A-Z0-9]+)/i) ||
                  path.match(/\/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i) ||
                  path.match(/\/group\/([^/]+)\/contest\/(\d+)\/problem\/([A-Z0-9]+)/i);
        if (m) {
          let targetUrl;
          if (path.includes('/problemset/')) {
            targetUrl = `https://codeforces.com/problemset/submit?submittedProblemCode=${m[1]}${m[2]}`;
          } else if (path.includes('/group/')) {
            targetUrl = `https://codeforces.com/group/${m[1]}/contest/${m[2]}/submit?submittedProblemIndex=${m[3]}`;
          } else if (path.includes('/gym/')) {
            targetUrl = `https://codeforces.com/gym/${m[2]}/submit?submittedProblemIndex=${m[3]}`;
          } else {
            targetUrl = `https://codeforces.com/contest/${m[2]}/submit?submittedProblemIndex=${m[3]}`;
          }
          window.location.href = targetUrl;
        }
      }
    }, true);
  }

  setTimeout(injectIdeFloatingButton, 1200);
  setTimeout(handleSidebarFormInterception, 800);

})();
