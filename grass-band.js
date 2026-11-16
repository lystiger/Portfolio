/* Closing grass band, drawn.
   Replaces the photographic plate and its VP9 loop at the foot of #contact
   with blades painted the way the hero's meadow is: flat greens, a darker
   ink edge, tips standing clear against the sky instead of fading into a
   masked haze. Two rows; the far one is shorter and takes on the sky's
   colour. The wind leans everything right, the way the hero's windsock
   points, in gusts that travel across the band.

   Canvas 2D, no library, so phones get it too. Under reduced motion it
   draws one still frame. The <img> under it stays as the no-JS fallback
   and is hidden once the canvas has drawn. */
(function () {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SKY = [182, 210, 223];          // section colour at the band's height
  var INK = 'rgba(46, 72, 36, 0.55)'; // blade edge, as on the hero meadow
  var SUN = [204, 212, 122];          // the yellow-green the hero's lit tips take

  // Far row then near row: tip height as a fraction of the band, blade
  // spacing in CSS px, base and tip colours, how far toward the sky colour
  // the row is hazed, and how much of the row's tips catch the sun.
  var ROWS = [
    { min: 0.42, max: 0.72, gap: 4, base: [92, 132, 64], tip: [170, 192, 104], haze: 0.25, sun: 0.3, ink: false },
    { min: 0.58, max: 1.0, gap: 4, base: [52, 92, 40], tip: [130, 168, 70], haze: 0, sun: 0.7, ink: true },
  ];
  // Solid meadow under the roots, so no sky shows between blade bases.
  var GROUND = 0.4;

  var canvas, ctx, band, img, ground, blades = [], width = 0, height = 0, visible = true, running = false;

  // Deterministic, so the band looks the same on every visit and resize.
  function rng(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function mix(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function layout() {
    var rect = band.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Between the rows: fades in from the far row's colour so its top edge
    // reads as more meadow, not as a band.
    ground = ctx.createLinearGradient(0, height * (1 - GROUND), 0, height);
    ground.addColorStop(0, 'rgba(92, 132, 64, 0)');
    ground.addColorStop(0.45, 'rgb(74, 112, 52)');
    ground.addColorStop(1, 'rgb(48, 84, 38)');

    blades = [];
    var rand = rng(7);
    ROWS.forEach(function (row, r) {
      var hazed = function (c) { return [0, 1, 2].map(function (i) { return c[i] + (SKY[i] - c[i]) * row.haze; }); };
      var base = mix(row.base, SKY, row.haze);
      for (var x = -10; x < width + 10; x += row.gap * (0.6 + rand() * 0.8)) {
        var h = height * (row.min + (row.max - row.min) * Math.pow(rand(), 0.7));
        var grad = ctx.createLinearGradient(0, height, 0, height - h);
        grad.addColorStop(0, base);
        grad.addColorStop(1, mix(hazed(row.tip), hazed(SUN), rand() * row.sun));
        blades.push({
          row: r, x: x, h: h,
          w: 2 + rand() * (r ? 4 : 3),
          lean: 0.15 + rand() * 0.35,           // resting lean, rightward
          phase: rand() * Math.PI * 2,
          fill: grad,
          ink: row.ink && rand() < 0.55,
        });
      }
    });
  }

  function blade(b, t) {
    // Gusts travel right; tips swing most, roots not at all.
    var gust = 0.5 + 0.5 * Math.sin(t * 0.5 - b.x * 0.004);
    var sway = (Math.sin(t * 1.9 + b.phase - b.x * 0.02) * 0.12 + gust * 0.22) * (b.row ? 1 : 0.7);
    var bend = (b.lean + sway) * b.h;
    var x0 = b.x, y0 = height + 2;
    var tx = x0 + bend, ty = height - b.h + Math.abs(bend) * 0.25;
    var cx = x0 + bend * 0.15, cy = height - b.h * 0.55;

    ctx.beginPath();
    ctx.moveTo(x0 - b.w, y0);
    ctx.quadraticCurveTo(cx - b.w * 0.6, cy, tx, ty);
    ctx.quadraticCurveTo(cx + b.w * 0.6, cy, x0 + b.w, y0);
    ctx.closePath();
    ctx.fillStyle = b.fill;
    ctx.fill();
    if (b.ink) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    var i = 0;
    for (; i < blades.length && blades[i].row === 0; i++) blade(blades[i], t);
    ctx.fillStyle = ground;
    ctx.fillRect(0, height * (1 - GROUND), width, height * GROUND);
    for (; i < blades.length; i++) blade(blades[i], t);
  }

  function frame(now) {
    if (!visible || document.hidden || !canvas.isConnected) {
      running = false;
      return;
    }
    draw(now / 1000);
    requestAnimationFrame(frame);
  }

  function wake() {
    if (REDUCED || running || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  }

  var io = new IntersectionObserver(function (entries) {
    visible = entries[entries.length - 1].isIntersecting;
    wake();
  });

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
    }
    if (canvas.previousSibling !== img) img.after(canvas);
    io.disconnect();
    io.observe(section);
    layout();
    draw(performance.now() / 1000);
    img.style.visibility = 'hidden';
    return true;
  }

  // The host may build #contact after `load`, so a failed first mount keeps
  // watching rather than giving up.
  function start() {
    window.addEventListener('resize', function () {
      if (!canvas || !canvas.isConnected) return;
      layout();
      draw(performance.now() / 1000);
    }, { passive: true });
    document.addEventListener('visibilitychange', wake);
    new MutationObserver(function () {
      if ((!canvas || !canvas.isConnected) && mount()) wake();
    }).observe(document.documentElement, { childList: true, subtree: true });
    if (mount()) wake();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
