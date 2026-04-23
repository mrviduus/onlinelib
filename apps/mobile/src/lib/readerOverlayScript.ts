// Vanilla-JS port of apps/web/src/lib/readerOverlay.ts for WebView injection.
// Style matches the rest of readerHtml.ts (var + function, no classes / private
// fields) for max WebView compat across older Android Chromium.
//
// Exposes window.__TSOverlayer on init — a single overlay instance wired to
// the document. Draw palette: highlight (user highlights) + underline (vocab).
// Not yet wired into readerHtml.ts — slice 8a prep. Swap happens in 8b once
// device verification is ready.

export const READER_OVERLAY_SCRIPT = `
(function(){
  if (window.__TSOverlayer) return;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag){ return document.createElementNS(SVG_NS, tag); }

  function Overlayer(){
    var svg = svgEl('svg');
    svg.setAttribute('data-reader-overlay', 'true');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    var map = {};

    function add(key, range, drawFn, options){
      if (map[key]) remove(key);
      if (!range) return;
      var rects = Array.prototype.slice.call(range.getClientRects());
      var element = drawFn(rects, options || {});
      svg.appendChild(element);
      map[key] = { range: range, draw: drawFn, options: options || {}, element: element, rects: rects };
    }
    function remove(key){
      var e = map[key];
      if (!e) return;
      if (e.element.parentNode === svg) svg.removeChild(e.element);
      delete map[key];
    }
    function clear(){
      for (var k in map) if (map.hasOwnProperty(k)) remove(k);
    }
    function redraw(){
      for (var k in map) {
        if (!map.hasOwnProperty(k)) continue;
        var e = map[k];
        if (e.element.parentNode === svg) svg.removeChild(e.element);
        var rects = Array.prototype.slice.call(e.range.getClientRects());
        var next = e.draw(rects, e.options);
        svg.appendChild(next);
        e.element = next;
        e.rects = rects;
      }
    }
    function hitTest(point){
      var keys = Object.keys(map);
      for (var i = keys.length - 1; i >= 0; i--){
        var e = map[keys[i]];
        for (var j = 0; j < e.rects.length; j++){
          var r = e.rects[j];
          if (r.top <= point.y && r.left <= point.x && r.bottom > point.y && r.right > point.x){
            return [keys[i], e.range];
          }
        }
      }
      return [];
    }
    function size(){ var n = 0; for (var k in map) if (map.hasOwnProperty(k)) n++; return n; }

    return { element: svg, add: add, remove: remove, clear: clear, redraw: redraw, hitTest: hitTest, size: size };
  }

  // --- Draw palette ---

  function highlight(rects, options){
    options = options || {};
    var color = options.color || 'yellow';
    var opacity = options.opacity != null ? options.opacity : 0.3;
    var blendMode = options.blendMode || 'multiply';
    var g = svgEl('g');
    g.setAttribute('fill', color);
    g.style.opacity = String(opacity);
    g.style.mixBlendMode = blendMode;
    for (var i = 0; i < rects.length; i++){
      var r = rects[i];
      var el = svgEl('rect');
      el.setAttribute('x', String(r.left));
      el.setAttribute('y', String(r.top));
      el.setAttribute('width', String(r.width));
      el.setAttribute('height', String(r.height));
      g.appendChild(el);
    }
    return g;
  }

  function underline(rects, options){
    options = options || {};
    var color = options.color || 'red';
    var strokeWidth = options.width || 2;
    var g = svgEl('g');
    g.setAttribute('fill', color);
    for (var i = 0; i < rects.length; i++){
      var r = rects[i];
      var el = svgEl('rect');
      el.setAttribute('x', String(r.left));
      el.setAttribute('y', String(r.bottom - strokeWidth));
      el.setAttribute('width', String(r.width));
      el.setAttribute('height', String(strokeWidth));
      g.appendChild(el);
    }
    return g;
  }

  function outline(rects, options){
    options = options || {};
    var color = options.color || 'red';
    var strokeWidth = options.width || 3;
    var radius = options.radius || 3;
    var g = svgEl('g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', color);
    g.setAttribute('stroke-width', String(strokeWidth));
    for (var i = 0; i < rects.length; i++){
      var r = rects[i];
      var el = svgEl('rect');
      el.setAttribute('x', String(r.left));
      el.setAttribute('y', String(r.top));
      el.setAttribute('width', String(r.width));
      el.setAttribute('height', String(r.height));
      el.setAttribute('rx', String(radius));
      g.appendChild(el);
    }
    return g;
  }

  // --- postMessage bridge helper (review item 5) ---
  // Throttle + dedup for WebView ↔ RN bridge. Max 4 msg/sec per type,
  // skip identical payloads. reading-session heartbeats route around this
  // (they use their own 30s interval).
  function makeBridge(postMessageFn, throttleMs){
    var MIN_INTERVAL = throttleMs || 250;
    var last = {}; // type → { ts, json }
    return function send(type, payload){
      var now = Date.now();
      var json = JSON.stringify(payload || {});
      var prev = last[type];
      if (prev && prev.json === json && now - prev.ts < 2000) return false;
      if (prev && now - prev.ts < MIN_INTERVAL && prev.json !== json) {
        // Collapse: replace pending payload, keep original ts so the
        // throttle window advances predictably.
        last[type] = { ts: prev.ts, json: json, pending: true };
        setTimeout(function(){
          var e = last[type];
          if (!e || !e.pending) return;
          e.pending = false;
          e.ts = Date.now();
          try { postMessageFn(JSON.stringify({ type: type, payload: JSON.parse(e.json) })); } catch (_err) {}
        }, MIN_INTERVAL - (now - prev.ts));
        return false;
      }
      last[type] = { ts: now, json: json };
      try { postMessageFn(JSON.stringify({ type: type, payload: payload || {} })); } catch (_err) { return false; }
      return true;
    };
  }

  window.__TSOverlayer = {
    create: Overlayer,
    highlight: highlight,
    underline: underline,
    outline: outline,
    makeBridge: makeBridge,
  };
})();
`
