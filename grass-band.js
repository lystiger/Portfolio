/* Closing meadow band.
   Replaces the photographic plate and its VP9 loop at the foot of #contact
   with the hero's own meadow: its painted grass, cut from the plate as
   assets/meadow-strip.webp, tiled along the band at the band's height, with
   a gently rolling top edge so it reads as a rise of meadow rather than a
   stripe. A still, drawn once per layout, so it is the same under reduced
   motion and costs nothing per frame.

   The <img> under it stays as the no-JS fallback and is hidden once the
   canvas has drawn. */
(function () {
  var STRIP = 'assets/meadow-strip.webp';
  var STRIP_HEIGHT = 88;
  var ROLL = 0.3;   // the top edge rolls through this fraction of the band
  var TIP_ROOM = 18;  // CSS px kept above the crest for the blade tips

  var canvas, ctx, band, img, strip;

  function draw() {
    if (!strip.complete || !strip.naturalWidth) return;
    var rect = band.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(rect.width * dpr);
    var h = Math.round(rect.height * dpr);
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;

    var pattern = ctx.createPattern(strip, 'repeat-x');
    var k = h / STRIP_HEIGHT;
    pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));

    // Two slow sine swells, so the rise has no visible period.
    function crest(x) {
      var roll = 0.5 + 0.3 * Math.sin(x * 0.006 / dpr) + 0.2 * Math.sin(x * 0.023 / dpr + 1.3);
      return TIP_ROOM * dpr + roll * h * ROLL;   // headroom for the tips
    }
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var x = 0; x <= w + 8; x += 8) ctx.lineTo(x, crest(x));
    ctx.lineTo(w, h);
    ctx.closePath();

    // A fringe of short blade tips along the crest, so the hill line breaks
    // up into grass the way the painting's does instead of ending in a clean
    // curve. Same fill, so the tips take the meadow's own colours. Seeded,
    // so the fringe is the same on every visit.
    var seed = 7;
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    for (var bx = 0; bx < w; bx += (1.5 + rand() * 2.5) * dpr) {
      var base = crest(bx) + 2 * dpr;
      var len = (5 + Math.pow(rand(), 1.4) * 12) * dpr;
      var half = (1 + rand() * 1.5) * dpr;
      var lean = (0.2 + rand() * 0.5) * len;   // rightward, with the wind
      ctx.moveTo(bx - half, base);
      ctx.quadraticCurveTo(bx + lean * 0.3, base - len * 0.6, bx + lean, base - len);
      ctx.quadraticCurveTo(bx + lean * 0.3 + half, base - len * 0.5, bx + half, base);
      ctx.closePath();
    }
    ctx.fillStyle = pattern;
    ctx.fill();

    img.style.visibility = 'hidden';
  }

  // The host may rebuild sections from their templates, so the band is
  // looked up again whenever the canvas is found detached.
  function mount() {
    var section = document.getElementById('contact');
    img = section && section.querySelector('img.horizon-grass');
    if (!img) return false;
    band = img;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'horizon-grass grass-band';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
      strip = new Image();
      strip.onload = function () { if (canvas.isConnected) draw(); };
      strip.src = STRIP;
    }
    if (canvas.previousSibling !== img) img.after(canvas);
    draw();
    return true;
  }

  // The host may build #contact after `load`, so a failed first mount keeps
  // watching rather than giving up.
  function start() {
    window.addEventListener('resize', function () {
      if (canvas && canvas.isConnected) draw();
    }, { passive: true });
    new MutationObserver(function () {
      if (!canvas || !canvas.isConnected) mount();
    }).observe(document.documentElement, { childList: true, subtree: true });
    mount();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
