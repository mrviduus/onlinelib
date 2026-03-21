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

export function buildReaderHtml(chapterHtml: string, theme: ReaderTheme = defaultTheme, initialChapterSlug?: string): string {
  const fontFace = buildFontFace(theme.fontFamily)

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
      padding: 16px;
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
    window.addEventListener('load', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'loaded',
        scrollHeight: document.documentElement.scrollHeight
      }));
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

    // Tap detection for immersive mode (touchend, not click — click unreliable in RN WebView)
    var lastTapTime = 0;
    var tapTimeout = null;
    var touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return; // scroll, not tap
      var target = e.target;
      if (target.tagName === 'A' || target.closest('a')) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
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

    document.addEventListener('selectionchange', function() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', text: '' }));
        return;
      }
      var text = sel.toString().trim();
      if (text.length > 300) return;
      var sentence = '';
      try { sentence = extractSentence(sel.anchorNode); } catch(e) {}
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'selection',
        text: text,
        sentence: sentence
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
