export interface ReaderTheme {
  fontSize: number
  lineHeight: number
  fontFamily: string
  backgroundColor: string
  textColor: string
}

const defaultTheme: ReaderTheme = {
  fontSize: 18,
  lineHeight: 1.65,
  fontFamily: 'Georgia, serif',
  backgroundColor: '#ffffff',
  textColor: '#111827',
}

export function buildReaderHtml(chapterHtml: string, theme: ReaderTheme = defaultTheme): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${theme.fontFamily};
      font-size: ${theme.fontSize}px;
      line-height: ${theme.lineHeight};
      color: ${theme.textColor};
      background: ${theme.backgroundColor};
      padding: 16px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      -webkit-text-size-adjust: none;
    }
    img { max-width: 100%; height: auto; }
    h1, h2, h3, h4, h5, h6 { margin: 1em 0 0.5em; }
    p { margin: 0.5em 0; }
    a { color: #2563EB; }

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
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'progress',
          progress: progress
        }));
      }
    }
    window.addEventListener('scroll', reportProgress, { passive: true });
    window.addEventListener('load', () => {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'loaded',
        scrollHeight: document.documentElement.scrollHeight
      }));
    });

    // Text selection → save word
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
      if (text.length > 50 || text.includes(' ')) return; // single words only
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
</body>
</html>`
}
