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

    /* CSS Custom Highlight API — vocab underlines (parity with web). */
    ::highlight(vocab-new) { text-decoration: underline; text-decoration-thickness: 2px; text-decoration-skip-ink: all; text-underline-offset: 0.18em; text-decoration-color: rgba(59,130,246,0.5); }
    ::highlight(vocab-recognition) { text-decoration: underline; text-decoration-thickness: 2px; text-decoration-skip-ink: all; text-underline-offset: 0.18em; text-decoration-color: rgba(234,179,8,0.5); }
    ::highlight(vocab-recall) { text-decoration: underline; text-decoration-thickness: 2px; text-decoration-skip-ink: all; text-underline-offset: 0.18em; text-decoration-color: rgba(234,179,8,0.4); }
    ::highlight(vocab-context) { text-decoration: underline; text-decoration-thickness: 2px; text-decoration-skip-ink: all; text-underline-offset: 0.18em; text-decoration-color: rgba(34,197,94,0.4); }
    ::highlight(vocab-mastered) { text-decoration: underline; text-decoration-thickness: 2px; text-decoration-skip-ink: all; text-underline-offset: 0.18em; text-decoration-color: rgba(34,197,94,0.25); }
    ::highlight(vocab-active) { text-decoration: underline; text-decoration-thickness: 2px; text-decoration-skip-ink: all; text-underline-offset: 0.18em; text-decoration-color: rgba(59,130,246,0.7); }

    .vocab-translation-overlay { position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
    .vocab-translation-overlay__item { position: absolute; top: 0; left: 0; transform: translate3d(0,0,0); white-space: nowrap; font-size: 0.5em; font-style: italic; opacity: 0.5; line-height: 1; pointer-events: none; user-select: none; max-width: 160px; overflow: hidden; text-overflow: ellipsis; will-change: transform; }

    /* Progress tracking via scroll */
    html { scroll-behavior: smooth; }
  </style>
  <script>
    // Diagnostic console forwarder — routes WebView console.log/warn/error
    // and uncaught errors to RN via postMessage. RN surfaces via console.warn
    // in __DEV__. Bug-report Phase 1: lets us see WHY word-tap / selection /
    // highlight-render / TTS fail on device without attaching a remote debugger.
    (function() {
      function post(level, args) {
        try {
          var parts = [];
          for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (typeof a === 'string') parts.push(a);
            else { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }
          }
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log', level: level, msg: parts.join(' ')
          }));
        } catch (e) {}
      }
      var orig = { log: console.log, warn: console.warn, error: console.error };
      console.log = function() { post('log', arguments); orig.log.apply(console, arguments); };
      console.warn = function() { post('warn', arguments); orig.warn.apply(console, arguments); };
      console.error = function() { post('error', arguments); orig.error.apply(console, arguments); };
      window.addEventListener('error', function(e) {
        post('error', ['window.onerror:', e.message, e.filename + ':' + e.lineno + ':' + e.colno]);
      });
      window.addEventListener('unhandledrejection', function(e) {
        post('error', ['unhandledrejection:', e.reason && e.reason.message || String(e.reason)]);
      });
    })();

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
     * starts going back (scrolls up) to re-read something.
     *
     * Design note (user feedback): "one swipe up should be enough".
     * Previously we required an UP threshold of 14px AFTER a baseline
     * reset on pivot — so exiting a down-run actually needed ~20px of
     * upward travel before bars appeared. That felt laggy. Now: once
     * the user has pivoted from a down-run, ANY upward motion reveals
     * bars immediately (no threshold). We still apply a mild UP
     * threshold from the bars-visible state so incidental upward drift
     * while reading doesn't endlessly re-fire the reveal.
     *
     * Thresholds are asymmetric — trivial to reveal, sticky to hide
     * (larger DOWN_THRESHOLD) — to avoid flicker from tiny wobbles
     * while reading.
     */
    var scrollDirBaseline = window.scrollY;
    var scrollDirLast = null; // 'up' | 'down' | null
    var SCROLL_UP_THRESHOLD = 6;
    var SCROLL_DOWN_THRESHOLD = 48;
    function emitScrollDir(dir, y) {
      scrollDirBaseline = y;
      if (scrollDirLast !== dir) {
        scrollDirLast = dir;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scrollDir', dir: dir }));
      }
    }
    function reportScrollDir() {
      var y = window.scrollY;
      var delta = y - scrollDirBaseline;
      if (delta < 0) {
        // Any upward motion while we were scrolling DOWN (or haven't
        // decided yet) reveals bars immediately — one swipe is enough.
        // If bars are already revealed (scrollDirLast === 'up'), wait
        // for the small UP threshold so baseline drifts smoothly with
        // continued upward motion without spamming messages.
        if (scrollDirLast !== 'up' || delta <= -SCROLL_UP_THRESHOLD) {
          emitScrollDir('up', y);
        }
      } else if (delta >= SCROLL_DOWN_THRESHOLD) {
        emitScrollDir('down', y);
      } else if (scrollDirLast === 'up' && delta > 0) {
        // Small downward reflex while bars are visible — reset baseline
        // but don't hide yet; we require the full DOWN threshold from
        // here so a brief wobble doesn't dismiss chrome mid-read.
        scrollDirBaseline = y;
      }
    }
    window.addEventListener('scroll', reportScrollDir, { passive: true });

    window.addEventListener('load', function() {
      console.log('[diag] load event — ua:', navigator.userAgent.slice(0, 80));
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
    var WORD_RE = /[\\p{L}\\p{N}'-]/u;
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
      if (!/\\p{L}/u.test(candidate)) return null;
      // Sanity cap. 40 was rejecting legitimate long compounds like
      // "Unterscheidungsvermögen" / "Schadenfreudegesellschaft" (B-11).
      // 80 is well past any real word but still blocks entire
      // paragraph-blob pathological cases.
      if (candidate.length > 80) return null;
      var range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      return range;
    }
    function selectWordAtPoint(x, y) {
      var range = wordRangeAtPoint(x, y);
      if (!range) { console.log('[diag] wordRangeAtPoint null at', x, y); return false; }
      var text = range.toString().trim();
      if (!text) return false;
      console.log('[diag] selected word:', text);
      // Do NOT touch window.getSelection() here. Android WebView reacts to
      // a programmatic Selection by spawning its own ActionMode (Copy /
      // Share / Select all), which immediately dismisses our RN popup.
      // Instead, post the selection directly from the range — our popup
      // opens, native UI stays silent. Drag-select still uses the normal
      // Selection API flow via selectionchange.
      try { applyTapPulseRange(range); } catch(e) {}
      var sentence = '';
      try { sentence = extractSentence(range.startContainer); } catch(e) {}
      var anchor = null;
      try { anchor = getRangeAnchor(range); } catch(e) {}
      // Long suppression window: we never touch Selection API here, so any
      // selectionchange that fires within ~1.5s of a tap is native noise
      // (Android ActionMode spawn/dismiss) that would wrongly clear our popup.
      _suppressSelectionChangeUntil = Date.now() + 1500;
      _lastDispatchedText = text;
      _lastDispatchWasTap = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'selection',
        text: text,
        sentence: sentence,
        anchor: anchor
      }));
      return true;
    }

    function applyTapPulseRange(range) {
      try {
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

    function getRangeAnchor(range) {
      var text = range.toString().trim();
      var preRange = document.createRange();
      preRange.setStart(document.body, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      var prefix = preRange.toString().slice(-50);
      var sufRange = document.createRange();
      sufRange.setStart(range.endContainer, range.endOffset);
      sufRange.setEnd(document.body, document.body.childNodes.length);
      var suffix = sufRange.toString().substring(0, 50);
      return { prefix: prefix, exact: text, suffix: suffix };
    }

    /**
     * Suppress the selectionchange listener briefly after a programmatic
     * dispatch. iOS WebKit may fire multiple selectionchange events for a
     * single removeAllRanges() + addRange() pair (one for each mutation).
     * A boolean flag only absorbs the first — a later "empty" event would
     * race through and post { text: '' } → RN clears the popup.
     *
     * Timestamp guard absorbs all events inside the window, which covers
     * the typical 50-100ms settle time on iOS 17+ WebKit.
     */
    var _suppressSelectionChangeUntil = 0;
    var _lastDispatchedText = '';
    // When the last dispatch came from the tap path (selectWordAtPoint),
    // we MUST NOT notify the parent of a "selection cleared" event on the
    // next native collapse — there is no selection to clear in the first
    // place (tap doesn't touch window.getSelection). Without this guard
    // the native ActionMode dismiss nukes the WordCard milliseconds after
    // it opens.
    var _lastDispatchWasTap = false;

    function dispatchSelection() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) { console.log('[diag] dispatchSelection: no selection'); return; }
      var text = sel.toString().trim();
      if (!text) { console.log('[diag] dispatchSelection: empty text'); return; }
      if (text.length > 300) { console.log('[diag] dispatchSelection: text too long', text.length); return; }
      if (!text.includes(' ') && text.length <= 50) applyTapPulse(sel);
      var sentence = '';
      try { sentence = extractSentence(sel.anchorNode); } catch(e) {}
      var anchor = null;
      try { anchor = getSelectionAnchor(); } catch(e) {}
      _suppressSelectionChangeUntil = Date.now() + 200;
      _lastDispatchedText = text;
      _lastDispatchWasTap = false;
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
      if (!text || !color) { console.warn('[diag] renderHighlight: missing args', id, !!text, color); return; }
      var body = document.body;
      var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      var node;
      var snippet = text.length > 30 ? text.slice(0, 30) + '…' : text;
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
        try { range.surroundContents(mark); console.log('[diag] renderHighlight matched:', id, snippet); } catch(e) { console.warn('[diag] surroundContents failed:', id, e.message); }
        return;
      }
      console.warn('[diag] renderHighlight NO MATCH:', id, snippet);
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

    // =========================================================
    // Vocab highlight layer — mirrors web's dispatcher design.
    //
    //   new path: CSS.highlights (Range-based, no DOM mutation → survives
    //             chapter innerHTML appends, font changes, resize).
    //   legacy path: <mark data-vocab-mark> wrapper (pre-refactor).
    //
    // Dispatcher per call: feature-detect + runtime killswitch. Exterior API
    // unchanged (markVocabWords / addVocabWord / removeVocabMarks /
    // setShowInlineTranslations) so mobile reader pages need no edits.
    // =========================================================

    var VOCAB_STAGE_COLORS = {
      0: 'rgba(59,130,246,0.5)',   // new — blue
      1: 'rgba(234,179,8,0.5)',    // recognition — yellow
      2: 'rgba(234,179,8,0.4)',    // recall
      3: 'rgba(34,197,94,0.4)',    // context — green
      4: 'rgba(34,197,94,0.25)'    // mastered — faint green
    };
    var VOCAB_ATTR = 'data-vocab-mark';
    var VHL_STAGE_NAMES = { 0: 'vocab-new', 1: 'vocab-recognition', 2: 'vocab-recall', 3: 'vocab-context', 4: 'vocab-mastered' };
    var VHL_MANAGED_NAMES = ['vocab-new','vocab-recognition','vocab-recall','vocab-context','vocab-mastered','vocab-active'];
    var VHL_WORD_RE = /[\\p{L}\\p{N}'-]+/gu;

    var _showInlineTranslations = false;
    var _currentVocabMap = {};
    var _vhlSupport = null;

    function vhlIsSupported() {
      if (_vhlSupport !== null) return _vhlSupport;
      try {
        _vhlSupport = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';
        // Smoke: construct and register+delete a Highlight.
        if (_vhlSupport) { var h = new Highlight(); CSS.highlights.set('__vhl_probe__', h); CSS.highlights.delete('__vhl_probe__'); }
      } catch (e) { _vhlSupport = false; }
      return _vhlSupport;
    }
    function vhlKillswitchSet() {
      try { return !!window.__textstackDisableCustomHighlights; } catch (e) { return false; }
    }
    function vhlUseNew() { return vhlIsSupported() && !vhlKillswitchSet(); }

    // Pure: TreeWalker → Range objects. No DOM mutation. Rejects SCRIPT/STYLE
    // and the translation overlay subtree (data-vocab-overlay).
    function vhlCompute(vocabMap) {
      var out = [];
      if (!vocabMap) return out;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(n) {
          var p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest('[data-vocab-overlay]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var node;
      while (node = walker.nextNode()) {
        var text = node.textContent;
        if (!text || !text.trim()) continue;
        VHL_WORD_RE.lastIndex = 0;
        var m;
        while (m = VHL_WORD_RE.exec(text)) {
          var lower = m[0].toLowerCase();
          var entry = vocabMap[lower];
          if (!entry) continue;
          var range = document.createRange();
          try { range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); }
          catch (e) { continue; }
          out.push({ range: range, stage: entry.stage, key: lower, translation: entry.translation || null });
        }
      }
      return out;
    }

    function vhlSync(matches) {
      if (!vhlIsSupported()) return;
      var groups = {};
      for (var i = 0; i < matches.length; i++) {
        var mm = matches[i];
        var name = VHL_STAGE_NAMES[mm.stage] || VHL_STAGE_NAMES[0];
        if (!groups[name]) groups[name] = [];
        groups[name].push(mm.range);
      }
      for (var n = 0; n < VHL_MANAGED_NAMES.length; n++) {
        var nm = VHL_MANAGED_NAMES[n];
        var ranges = groups[nm] || [];
        if (ranges.length === 0) { try { CSS.highlights.delete(nm); } catch (e) {} continue; }
        try {
          var hl = new Highlight();
          for (var k = 0; k < ranges.length; k++) hl.add(ranges[k]);
          CSS.highlights.set(nm, hl);
        } catch (e) { console.warn('[vhl] sync error', nm, e && e.message); }
      }
    }

    function vhlClear() {
      if (!vhlIsSupported()) return;
      for (var i = 0; i < VHL_MANAGED_NAMES.length; i++) {
        try { CSS.highlights.delete(VHL_MANAGED_NAMES[i]); } catch (e) {}
      }
    }

    // Translation overlay — absolute-positioned spans, one per translatable
    // match. Positions update via RAF on scroll/resize.
    var _vhlOverlayEl = null;
    var _vhlOverlayItems = [];
    var _vhlOverlayRaf = 0;

    function vhlEnsureOverlay() {
      if (_vhlOverlayEl && document.body.contains(_vhlOverlayEl)) return _vhlOverlayEl;
      _vhlOverlayEl = document.createElement('div');
      _vhlOverlayEl.className = 'vocab-translation-overlay';
      _vhlOverlayEl.setAttribute('data-vocab-overlay', 'true');
      document.body.appendChild(_vhlOverlayEl);
      return _vhlOverlayEl;
    }
    function vhlClearOverlay() {
      if (_vhlOverlayEl) _vhlOverlayEl.innerHTML = '';
      _vhlOverlayItems = [];
    }
    function vhlRenderOverlay(matches) {
      vhlClearOverlay();
      if (!_showInlineTranslations) return;
      var overlay = vhlEnsureOverlay();
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        if (!m.translation) continue;
        var span = document.createElement('span');
        span.className = 'vocab-translation-overlay__item';
        span.textContent = m.translation;
        overlay.appendChild(span);
        _vhlOverlayItems.push({ range: m.range, el: span });
      }
      vhlRepositionOverlay();
    }
    function vhlRepositionOverlay() {
      for (var i = 0; i < _vhlOverlayItems.length; i++) {
        var item = _vhlOverlayItems[i];
        var rect;
        try { rect = item.range.getBoundingClientRect(); } catch (e) { item.el.style.display = 'none'; continue; }
        if (!rect || !rect.width || !rect.height) { item.el.style.display = 'none'; continue; }
        item.el.style.display = '';
        var cx = Math.round(rect.left + rect.width / 2 + window.scrollX);
        var topY = Math.round(rect.top + window.scrollY - 2);
        item.el.style.transform = 'translate3d(' + cx + 'px,' + topY + 'px,0) translate(-50%,-100%)';
      }
    }
    function vhlScheduleReposition() {
      if (_vhlOverlayRaf) return;
      _vhlOverlayRaf = requestAnimationFrame(function() {
        _vhlOverlayRaf = 0;
        vhlRepositionOverlay();
      });
    }
    window.addEventListener('scroll', vhlScheduleReposition, { passive: true, capture: true });
    window.addEventListener('resize', vhlScheduleReposition);

    // Legacy <mark> path — preserved as fallback.
    function vhlLegacyMark(vocabMap) {
      vhlLegacyRemove();
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
      var re = /[\\p{L}\\p{N}'-]+/gu;
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
          var mm = matches[j];
          if (mm.start > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, mm.start)));
          var mk = document.createElement('mark');
          mk.setAttribute(VOCAB_ATTR, 'true');
          var entry = vocabMap[mm.word];
          var stage = entry.stage;
          mk.style.cssText = 'background:none;color:inherit;padding:0;position:relative;border-bottom:2px solid ' + (VOCAB_STAGE_COLORS[stage] || VOCAB_STAGE_COLORS[0]) + ';';
          mk.textContent = text.slice(mm.start, mm.end);
          if (_showInlineTranslations && entry.translation) {
            var sp = document.createElement('span');
            sp.className = 'vocab-inline-translation';
            sp.style.cssText = 'position:absolute;left:50%;bottom:calc(100% - 4px);transform:translateX(-50%);white-space:nowrap;font-size:0.5em;font-style:italic;opacity:0.4;line-height:1;pointer-events:none;user-select:none;max-width:150%;overflow:hidden;text-overflow:ellipsis;';
            sp.textContent = entry.translation;
            mk.appendChild(sp);
          }
          frag.appendChild(mk);
          lastEnd = mm.end;
        }
        if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
        tn.parentNode.replaceChild(frag, tn);
      }
    }
    function vhlLegacyRemove() {
      var marks = document.querySelectorAll('mark[' + VOCAB_ATTR + ']');
      marks.forEach(function(mark) {
        var parent = mark.parentNode;
        if (!parent) return;
        var wordText = mark.firstChild && mark.firstChild.nodeType === 3 ? mark.firstChild.textContent : mark.textContent;
        parent.replaceChild(document.createTextNode(wordText || ''), mark);
        parent.normalize();
      });
    }

    // Re-apply vocab marks after DOM mutations (e.g. appendChapter replaces a
    // chunk of body). RAF-debounced, only runs if a vocab map is loaded.
    var _vhlMutRaf = 0;
    var _vhlMutObserver = null;
    function vhlEnsureObserver() {
      if (_vhlMutObserver) return;
      try {
        _vhlMutObserver = new MutationObserver(function() {
          if (_vhlMutRaf) return;
          _vhlMutRaf = requestAnimationFrame(function() {
            _vhlMutRaf = 0;
            if (!_currentVocabMap || Object.keys(_currentVocabMap).length === 0) return;
            try { markVocabWords(_currentVocabMap); } catch (e) { console.warn('[vhl] mutation apply failed', e && e.message); }
          });
        });
        _vhlMutObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      } catch (e) { console.warn('[vhl] observer attach failed', e && e.message); }
    }
    window.addEventListener('load', vhlEnsureObserver);

    // Public API — unchanged signatures for all mobile call sites.
    function setShowInlineTranslations(val) {
      _showInlineTranslations = !!val;
      if (Object.keys(_currentVocabMap).length > 0) markVocabWords(_currentVocabMap);
    }

    function markVocabWords(vocabMap) {
      _currentVocabMap = vocabMap || {};
      // Clear both paths' state before re-applying — covers path switches
      // (e.g. killswitch toggled at runtime) and keeps the DOM clean.
      vhlLegacyRemove();
      vhlClear();
      vhlClearOverlay();
      if (!vocabMap || Object.keys(vocabMap).length === 0) return;
      if (vhlUseNew()) {
        try {
          var matches = vhlCompute(vocabMap);
          vhlSync(matches);
          vhlRenderOverlay(matches);
          return;
        } catch (e) {
          console.warn('[vhl] new path failed → legacy', e && e.message);
          vhlClear();
          vhlClearOverlay();
        }
      }
      vhlLegacyMark(vocabMap);
    }

    function addVocabWord(word, stage) {
      var key = word.toLowerCase();
      var existing = _currentVocabMap[key] || {};
      existing.stage = stage;
      _currentVocabMap[key] = existing;
      markVocabWords(_currentVocabMap);
    }

    function removeVocabMarks() {
      vhlLegacyRemove();
      vhlClear();
      vhlClearOverlay();
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

    console.log('[diag] attaching selectionchange listener');
    document.addEventListener('selectionchange', function() {
      // Inside suppression window — swallow the event entirely. Covers the
      // transient "empty selection" that fires between removeAllRanges and
      // addRange during a programmatic tap-to-select.
      if (Date.now() < _suppressSelectionChangeUntil) return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        // Only notify parent of "selection cleared" when WE previously
        // dispatched a drag-select via this listener. If the last dispatch
        // was a tap, there was no Selection-API selection to begin with,
        // so reporting "empty" would incorrectly tear down the WordCard.
        if (_lastDispatchedText && !_lastDispatchWasTap) {
          console.log('[diag] selectionchange: posting empty (prior drag-select collapsed)');
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', text: '' }));
        }
        _lastDispatchedText = '';
        _lastDispatchWasTap = false;
        return;
      }
      var text = sel.toString().trim();
      if (text.length > 300) return;
      // Drop duplicates — if the user re-selected the exact same text (e.g.
      // iOS magnifier re-firing), don't re-render the popup.
      if (text === _lastDispatchedText) return;
      // Single word pulse
      if (!text.includes(' ') && text.length <= 50) applyTapPulse(sel);
      var sentence = '';
      try { sentence = extractSentence(sel.anchorNode); } catch(e) {}
      var anchor = null;
      try { anchor = getSelectionAnchor(); } catch(e) {}
      _lastDispatchedText = text;
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
