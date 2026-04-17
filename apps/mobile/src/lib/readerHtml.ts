import { openDyslexicBase64 } from './openDyslexicBase64'

export interface ReaderTheme {
  fontSize: number
  lineHeight: number
  fontFamily: string
  textAlign: string
  backgroundColor: string
  textColor: string
}

const defaultTheme: ReaderTheme = {
  fontSize: 18,
  lineHeight: 1.65,
  fontFamily: 'Georgia, serif',
  textAlign: 'left',
  backgroundColor: '#ffffff',
  textColor: '#111827',
}

function buildFontFace(fontFamily: string): string {
  if (!fontFamily.includes('OpenDyslexic')) return ''
  return `@font-face {
    font-family: 'OpenDyslexic';
    src: url(data:font/woff2;base64,${openDyslexicBase64}) format('woff2');
    font-weight: normal;
    font-style: normal;
  }`
}

export function buildReaderHtml(chapterHtml: string, theme: ReaderTheme = defaultTheme, initialChapterSlug?: string, safeArea?: { top: number; bottom: number }): string {
  const fontFace = buildFontFace(theme.fontFamily)
  const padTop = (safeArea?.top ?? 0) + 16
  const padBottom = (safeArea?.bottom ?? 0) + 16

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    ${fontFace}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${theme.fontFamily};
      font-size: ${theme.fontSize}px;
      line-height: ${theme.lineHeight};
      color: ${theme.textColor};
      background: ${theme.backgroundColor};
      text-align: ${theme.textAlign};
      padding: ${padTop}px 16px ${padBottom}px 16px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      -webkit-text-size-adjust: none;
    }
    /* Aged book edge shadows — matches PWA */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 9999;
      box-shadow:
        inset 80px 0 60px -60px ${theme.backgroundColor.toUpperCase() === '#1A1A2E'
          ? 'rgba(0,0,0,0.7), inset -80px 0 60px -60px rgba(0,0,0,0.7), inset 0 50px 40px -40px rgba(0,0,0,0.5), inset 0 -50px 40px -40px rgba(0,0,0,0.5)'
          : theme.backgroundColor.toUpperCase() === '#F4ECD8'
            ? 'rgba(50,25,10,0.6), inset -80px 0 60px -60px rgba(50,25,10,0.6), inset 0 50px 40px -40px rgba(50,25,10,0.4), inset 0 -50px 40px -40px rgba(50,25,10,0.4)'
            : 'rgba(30,15,5,0.5), inset -80px 0 60px -60px rgba(30,15,5,0.5), inset 0 50px 40px -40px rgba(30,15,5,0.3), inset 0 -50px 40px -40px rgba(30,15,5,0.3)'};
    }
    img { max-width: 100%; height: auto; }
    h1, h2, h3, h4, h5, h6 { margin: 1em 0 0.5em; }
    p { margin: 0.5em 0; }
    a { color: #2563EB; }
    .chapter-separator {
      text-align: center;
      padding: 40px 16px;
      opacity: 0.5;
    }
    .chapter-separator hr {
      border: none;
      border-top: 1px solid currentColor;
      margin-bottom: 12px;
    }

    /* Tap pulse animation for word selection */
    @keyframes tap-pulse {
      0% { background-color: rgba(196,112,75,0.35); }
      100% { background-color: transparent; }
    }
    .tap-pulse {
      animation: tap-pulse 0.6s ease-out;
      border-radius: 2px;
    }

    /* Progress tracking via scroll */
    html { scroll-behavior: smooth; }
  </style>
  <script>
    let lastProgress = 0;
    function reportProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 1;
      if (Math.abs(progress - lastProgress) > 0.005) {
        lastProgress = progress;
        var currentSlug = getCurrentChapterSlug();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'progress',
          progress: progress,
          chapterSlug: currentSlug
        }));
      }
    }
    window.addEventListener('scroll', reportProgress, { passive: true });

    /**
     * Scroll direction detector — drives immersive chrome reveal.
     *
     * Mirrors ElevenReader's pattern: bars stay hidden while the reader
     * moves forward (scrolls down), and reveal as soon as the reader
     * starts going back (scrolls up) to re-read something. This is far
     * more discoverable than the previous tap-only reveal.
     *
     * We track a floating "baseline" that resets whenever the user
     * pivots direction. Crossing the per-direction threshold from that
     * baseline fires a single 'scrollDir' message. Thresholds are
     * asymmetric — easy to reveal (small UP_THRESHOLD), sticky to hide
     * (larger DOWN_THRESHOLD) — to avoid flicker from tiny wobbles.
     */
    var scrollDirBaseline = window.scrollY;
    var scrollDirLast = null; // 'up' | 'down' | null
    var SCROLL_UP_THRESHOLD = 14;
    var SCROLL_DOWN_THRESHOLD = 36;
    function reportScrollDir() {
      var y = window.scrollY;
      var delta = y - scrollDirBaseline;
      if (delta <= -SCROLL_UP_THRESHOLD) {
        scrollDirBaseline = y;
        if (scrollDirLast !== 'up') {
          scrollDirLast = 'up';
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scrollDir', dir: 'up' }));
        }
      } else if (delta >= SCROLL_DOWN_THRESHOLD) {
        scrollDirBaseline = y;
        if (scrollDirLast !== 'down') {
          scrollDirLast = 'down';
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scrollDir', dir: 'down' }));
        }
      } else if ((scrollDirLast === 'up' && delta > 0) || (scrollDirLast === 'down' && delta < 0)) {
        // User pivoted — reset baseline so next threshold is measured
        // from here, not from the far end of the previous run.
        scrollDirBaseline = y;
      }
    }
    window.addEventListener('scroll', reportScrollDir, { passive: true });

    window.addEventListener('load', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'loaded',
        scrollHeight: document.documentElement.scrollHeight
      }));
      setTimeout(checkInfiniteScroll, 100);
    });

    // Infinite scroll
    var infiniteScrollEnabled = false;
    var loadingNext = false;
    function checkInfiniteScroll() {
      if (!infiniteScrollEnabled || loadingNext) return;
      var scrollBottom = window.scrollY + window.innerHeight;
      var docHeight = document.documentElement.scrollHeight;
      if (docHeight - scrollBottom < 400) {
        loadingNext = true;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'requestNextChapter' }));
      }
    }
    window.addEventListener('scroll', checkInfiniteScroll, { passive: true });

    function appendChapter(html, title, slug) {
      var sep = document.createElement('div');
      sep.className = 'chapter-separator';
      sep.innerHTML = '<hr><span>' + title + '</span>';
      document.body.appendChild(sep);
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div);
      if (slug) registerChapter(slug);
      loadingNext = false;
      setTimeout(checkInfiniteScroll, 100);
    }
    function enableInfiniteScroll() { infiniteScrollEnabled = true; }
    function disableInfiniteScroll() { infiniteScrollEnabled = false; loadingNext = false; }

    // In-book search
    var searchMarks = [];
    var searchCurrent = -1;
    function searchInContent(q) {
      clearSearch();
      if (!q || q.length < 2) return;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      var lower = q.toLowerCase();
      while (node = walker.nextNode()) {
        var idx = node.textContent.toLowerCase().indexOf(lower);
        while (idx !== -1) {
          var range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + q.length);
          var mark = document.createElement('mark');
          mark.style.cssText = 'background:#FBBF24;padding:0 1px;border-radius:2px;';
          mark.className = 'search-mark';
          range.surroundContents(mark);
          searchMarks.push(mark);
          node = mark.nextSibling;
          if (!node) break;
          idx = node.textContent.toLowerCase().indexOf(lower);
        }
      }
      if (searchMarks.length > 0) {
        searchCurrent = 0;
        highlightCurrent();
      }
      reportSearchCount();
    }
    function highlightCurrent() {
      searchMarks.forEach(function(m, i) {
        m.style.background = i === searchCurrent ? '#F59E0B' : '#FBBF24';
        m.style.fontWeight = i === searchCurrent ? 'bold' : 'normal';
      });
      if (searchMarks[searchCurrent]) {
        searchMarks[searchCurrent].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    function nextMatch() {
      if (searchMarks.length === 0) return;
      searchCurrent = (searchCurrent + 1) % searchMarks.length;
      highlightCurrent();
      reportSearchCount();
    }
    function prevMatch() {
      if (searchMarks.length === 0) return;
      searchCurrent = (searchCurrent - 1 + searchMarks.length) % searchMarks.length;
      highlightCurrent();
      reportSearchCount();
    }
    function clearSearch() {
      searchMarks.forEach(function(m) {
        var parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
      searchMarks = [];
      searchCurrent = -1;
      reportSearchCount();
    }
    function reportSearchCount() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'search',
        matchCount: searchMarks.length,
        currentMatch: searchCurrent + 1
      }));
    }

    /**
     * Tap-to-word: programmatically select the word under the tap point
     * so single-tap behaves like the web reader (WordPopup + auto-save +
     * auto-TTS). iOS WebView's default is long-press-to-select, which is
     * too friction-heavy for vocab flow. We use caretPositionFromPoint /
     * caretRangeFromPoint to resolve text-node + offset, expand to word
     * boundaries with a unicode letter/number class, then set the native
     * Selection — the existing selectionchange listener handles the
     * rest (pulse, message dispatch, RN-side save + TTS).
     */
    var WORD_RE = /[\p{L}\p{N}'-]/u;
    function wordRangeAtPoint(x, y) {
      var node = null, offset = 0;
      if (document.caretPositionFromPoint) {
        var pos = document.caretPositionFromPoint(x, y);
        if (pos) { node = pos.offsetNode; offset = pos.offset; }
      }
      if (!node && document.caretRangeFromPoint) {
        var r = document.caretRangeFromPoint(x, y);
        if (r) { node = r.startContainer; offset = r.startOffset; }
      }
      if (!node || node.nodeType !== 3) return null;
      var text = node.textContent || '';
      if (!text) return null;
      // Skip vocab-inline-translation nodes (the small italic gloss
      // above an underlined word) — tapping those should select the
      // underlying word, not the translation text.
      var parent = node.parentElement;
      if (parent && parent.classList && parent.classList.contains('vocab-inline-translation')) return null;
      var start = offset;
      var end = offset;
      while (start > 0 && WORD_RE.test(text.charAt(start - 1))) start--;
      while (end < text.length && WORD_RE.test(text.charAt(end))) end++;
      if (start === end) return null;
      // Skip purely numeric "words"
      var candidate = text.slice(start, end);
      if (!/\p{L}/u.test(candidate)) return null;
      if (candidate.length > 40) return null; // sanity cap
      var range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      return range;
    }
    function selectWordAtPoint(x, y) {
      var range = wordRangeAtPoint(x, y);
      if (!range) return false;
      var sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(range);
      // Android WebView does not fire selectionchange for programmatic
      // selection — push the message directly. iOS fires it twice (once
      // here, once from the listener), but the second emit is a no-op
      // because the popup re-renders to the same state.
      dispatchSelection();
      return true;
    }

    var _suppressNextSelectionChange = false;
    function dispatchSelection() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      var text = sel.toString().trim();
      if (!text || text.length > 300) return;
      if (!text.includes(' ') && text.length <= 50) applyTapPulse(sel);
      var sentence = '';
      try { sentence = extractSentence(sel.anchorNode); } catch(e) {}
      var anchor = null;
      try { anchor = getSelectionAnchor(); } catch(e) {}
      _suppressNextSelectionChange = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'selection',
        text: text,
        sentence: sentence,
        anchor: anchor
      }));
    }

    // Tap detection for immersive mode (touchend, not click — click unreliable in RN WebView)
    var lastTapTime = 0;
    var tapTimeout = null;
    var touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      var tx = e.changedTouches[0].clientX;
      var ty = e.changedTouches[0].clientY;
      var dx = tx - touchStartX;
      var dy = ty - touchStartY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return; // scroll, not tap
      var target = e.target;
      if (target.tagName === 'A' || target.closest('a')) return;

      // Dismiss any native multi-word selection first. Single-word
      // selections (ours from a prior tap) should NOT block re-tapping
      // a different word — we'll just re-select below.
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        var txt = sel.toString().trim();
        var isMulti = txt.indexOf(' ') !== -1 || txt.length > 40;
        sel.removeAllRanges();
        if (isMulti) return; // user dismissing a long-press selection
      }

      // Try selecting the word under the tap. If it hits a word, the
      // selectionchange listener takes over (pulse + RN message + save).
      if (selectWordAtPoint(tx, ty)) return;

      // Not on a word — empty space / between paragraphs. Fall back to
      // immersive toggle, keeping double-tap suppression.
      var now = Date.now();
      if (now - lastTapTime < 300) {
        if (tapTimeout) { clearTimeout(tapTimeout); tapTimeout = null; }
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;
      if (tapTimeout) clearTimeout(tapTimeout);
      tapTimeout = setTimeout(function() {
        tapTimeout = null;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }));
      }, 300);
    }, { passive: true });

    // Chapter tracking for progress
    var chapterSlugs = [];
    function registerChapter(slug) {
      chapterSlugs.push({ slug: slug, top: document.body.lastElementChild ? document.body.lastElementChild.offsetTop : 0 });
    }
    function getCurrentChapterSlug() {
      if (chapterSlugs.length === 0) return null;
      var scrollTop = window.scrollY + window.innerHeight * 0.25;
      for (var i = chapterSlugs.length - 1; i >= 0; i--) {
        if (scrollTop >= chapterSlugs[i].top) return chapterSlugs[i].slug;
      }
      return chapterSlugs[0].slug;
    }

    // Text selection
    function extractSentence(node) {
      if (!node) return '';
      var el = node.nodeType === 3 ? node.parentElement : node;
      while (el && !['P','DIV','LI','BLOCKQUOTE','TD','FIGCAPTION'].includes(el.tagName)) {
        el = el.parentElement;
      }
      return el ? el.textContent.trim().substring(0, 500) : '';
    }

    // Highlight rendering
    var HIGHLIGHT_BG = { yellow: 'rgba(254,240,138,0.5)', green: 'rgba(187,247,208,0.5)', pink: 'rgba(251,207,232,0.5)', blue: 'rgba(191,219,254,0.5)' };

    function renderHighlight(id, text, color) {
      if (!text || !color) return;
      var body = document.body;
      var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      var node;
      while (node = walker.nextNode()) {
        var idx = node.textContent.indexOf(text);
        if (idx === -1) continue;
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        var mark = document.createElement('mark');
        mark.dataset.highlightId = id;
        mark.style.backgroundColor = HIGHLIGHT_BG[color] || HIGHLIGHT_BG.yellow;
        mark.style.borderRadius = '2px';
        mark.style.cursor = 'pointer';
        mark.addEventListener('click', function(e) {
          e.stopPropagation();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'highlightTap', highlightId: id }));
        });
        try { range.surroundContents(mark); } catch(e) {}
        break;
      }
    }

    function removeHighlight(id) {
      var marks = document.querySelectorAll('mark[data-highlight-id="' + id + '"]');
      marks.forEach(function(mark) {
        var parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      });
    }

    function getSelectionAnchor() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      var range = sel.getRangeAt(0);
      var text = sel.toString().trim();
      // Get prefix (up to 50 chars before selection)
      var preRange = document.createRange();
      preRange.setStart(document.body, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      var prefix = preRange.toString().slice(-50);
      // Get suffix (up to 50 chars after selection)
      var sufRange = document.createRange();
      sufRange.setStart(range.endContainer, range.endOffset);
      sufRange.setEnd(document.body, document.body.childNodes.length);
      var suffix = sufRange.toString().substring(0, 50);
      return { prefix: prefix, exact: text, suffix: suffix };
    }

    // Vocab word marking by SRS stage
    var VOCAB_STAGE_COLORS = {
      0: 'rgba(59,130,246,0.5)',   // new — blue
      1: 'rgba(234,179,8,0.5)',    // recognition — yellow
      2: 'rgba(234,179,8,0.4)',    // recall
      3: 'rgba(34,197,94,0.4)',    // context — green
      4: 'rgba(34,197,94,0.25)'    // mastered — faint green
    };
    var VOCAB_ATTR = 'data-vocab-mark';

    var _showInlineTranslations = false;

    function setShowInlineTranslations(val) {
      _showInlineTranslations = !!val;
      if (Object.keys(_currentVocabMap).length > 0) markVocabWords(_currentVocabMap);
    }

    function markVocabWords(vocabMap) {
      // vocabMap: {word: {stage, id, translation?}}
      _currentVocabMap = vocabMap || {};
      removeVocabMarks();
      if (!vocabMap || Object.keys(vocabMap).length === 0) return;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(n) {
          var p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.tagName === 'MARK' || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var textNodes = [];
      var node;
      while (node = walker.nextNode()) textNodes.push(node);
      var re = /[\p{L}\p{N}'-]+/gu;
      for (var i = 0; i < textNodes.length; i++) {
        var tn = textNodes[i];
        var text = tn.textContent;
        if (!text || !text.trim()) continue;
        re.lastIndex = 0;
        var match;
        var matches = [];
        while (match = re.exec(text)) {
          var lower = match[0].toLowerCase();
          if (vocabMap[lower]) matches.push({ start: match.index, end: match.index + match[0].length, word: lower });
        }
        if (matches.length === 0) continue;
        var frag = document.createDocumentFragment();
        var lastEnd = 0;
        for (var j = 0; j < matches.length; j++) {
          var m = matches[j];
          if (m.start > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, m.start)));
          var mark = document.createElement('mark');
          mark.setAttribute(VOCAB_ATTR, 'true');
          var entry = vocabMap[m.word];
          var stage = entry.stage;
          mark.style.cssText = 'background:none;color:inherit;padding:0;position:relative;border-bottom:2px solid ' + (VOCAB_STAGE_COLORS[stage] || VOCAB_STAGE_COLORS[0]) + ';';
          mark.textContent = text.slice(m.start, m.end);
          if (_showInlineTranslations && entry.translation) {
            var span = document.createElement('span');
            span.className = 'vocab-inline-translation';
            span.style.cssText = 'position:absolute;left:50%;bottom:calc(100% - 4px);transform:translateX(-50%);white-space:nowrap;font-size:0.5em;font-style:italic;opacity:0.4;line-height:1;pointer-events:none;user-select:none;max-width:150%;overflow:hidden;text-overflow:ellipsis;';
            span.textContent = entry.translation;
            mark.appendChild(span);
          }
          frag.appendChild(mark);
          lastEnd = m.end;
        }
        if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
        tn.parentNode.replaceChild(frag, tn);
      }
    }

    var _currentVocabMap = {};
    function addVocabWord(word, stage) {
      _currentVocabMap[word.toLowerCase()] = { stage: stage };
      markVocabWords(_currentVocabMap);
    }

    function removeVocabMarks() {
      var marks = document.querySelectorAll('mark[' + VOCAB_ATTR + ']');
      marks.forEach(function(mark) {
        var parent = mark.parentNode;
        var wordText = mark.firstChild && mark.firstChild.nodeType === 3 ? mark.firstChild.textContent : mark.textContent;
        parent.replaceChild(document.createTextNode(wordText || ''), mark);
        parent.normalize();
      });
    }

    // Tap pulse: wrap selection in temporary span with animation
    function applyTapPulse(sel) {
      try {
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        var range = sel.getRangeAt(0);
        var span = document.createElement('span');
        span.className = 'tap-pulse';
        range.surroundContents(span);
        setTimeout(function() {
          if (span.parentNode) {
            var parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
            parent.normalize();
          }
        }, 650);
      } catch(e) {}
    }

    document.addEventListener('selectionchange', function() {
      if (_suppressNextSelectionChange) {
        _suppressNextSelectionChange = false;
        return;
      }
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', text: '' }));
        return;
      }
      var text = sel.toString().trim();
      if (text.length > 300) return;
      // Single word pulse
      if (!text.includes(' ') && text.length <= 50) applyTapPulse(sel);
      var sentence = '';
      try { sentence = extractSentence(sel.anchorNode); } catch(e) {}
      var anchor = null;
      try { anchor = getSelectionAnchor(); } catch(e) {}
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'selection',
        text: text,
        sentence: sentence,
        anchor: anchor
      }));
    });
  </script>
</head>
<body>
  ${chapterHtml}
  ${initialChapterSlug ? `<script>registerChapter(${JSON.stringify(initialChapterSlug)});</script>` : ''}
</body>
</html>`
}
