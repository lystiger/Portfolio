/* Closing meadow band.
   Replaces the photographic plate and its VP9 loop at the foot of #contact
   with the hero's own meadow: its painted grass, cut from the plate as
   assets/meadow-strip.webp, tiled along the band at the band's height, with
   a gently rolling crest broken into blade tips so it reads as a rise of
   meadow rather than a stripe.

   The meadow is painted once per layout onto an offscreen 2D canvas. Where
   WebGL is available and motion is allowed, a small shader shows it with
   the wind in it: gusts sweep left to right, leaning the tips while the
   roots stay put, over a quicker flutter, as in the hero. Otherwise the
   still is copied straight onto the band.

   The <img> under it stays as the no-JS fallback and is hidden once the
   canvas has drawn. */
(function () {
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STRIP = 'assets/meadow-strip.webp';
  var STRIP_HEIGHT = 88;
  var ROLL = 0.3;   // the top edge rolls through this fraction of the band
  var TIP_ROOM = 18;  // CSS px kept above the crest for the blade tips

  var VERTEX = [
    'attribute vec2 p;',
    'varying vec2 vUv;',
    'void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }',
  ].join('\n');
  // vUv.y runs 0 at the foot to 1 at the top. Sway grows with height so the
  // roots hold still, and stays to a few pixels so the paint never smears.
  var FRAGMENT = [
    'precision mediump float;',
    'uniform sampler2D uMeadow;',
    'uniform vec2 uSize;   // CSS px',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'void main() {',
    '  float x = vUv.x * uSize.x;',
    '  float lift = pow(vUv.y, 1.6);',
    '  float gust = 0.55 + 0.45 * sin(uTime * 0.37);',
    '  float sweep = 0.5 + 0.5 * sin(x * 0.005 - uTime * 0.8);',
    '  float flutter = sin(uTime * 1.7 + x * 0.03 + vUv.y * 3.0);',
    '  float push = lift * (gust * sweep * 5.0 + flutter * 1.5);',
    '  gl_FragColor = texture2D(uMeadow, vec2(vUv.x - push / uSize.x, vUv.y));',
    '}',
  ].join('\n');

  var canvas, band, img, strip, meadow, gl, uniforms, texture;
  var visible = true, running = false;

  // Paints the still meadow onto the offscreen canvas at the band's size.
  function paint() {
    if (!strip.complete || !strip.naturalWidth) return false;
    var rect = band.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(rect.width * dpr);
    var h = Math.round(rect.height * dpr);
    if (!w || !h) return false;
    meadow.width = canvas.width = w;
    meadow.height = canvas.height = h;
    var ctx = meadow.getContext('2d');

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
    return true;
  }

  function setupGL() {
    gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) return false;
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    uniforms = {
      size: gl.getUniformLocation(prog, 'uSize'),
      time: gl.getUniformLocation(prog, 'uTime'),
    };
    return true;
  }

  function layout() {
    if (!paint()) return;
    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, meadow);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      gl.uniform2f(uniforms.size, canvas.width / dpr, canvas.height / dpr);
      render(performance.now() / 1000);
      wake();
    } else {
      canvas.getContext('2d').drawImage(meadow, 0, 0);
    }
    img.style.visibility = 'hidden';
  }

  function render(t) {
    gl.uniform1f(uniforms.time, t);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function frame(now) {
    if (!visible || document.hidden || !canvas.isConnected) {
      running = false;
      return;
    }
    render(now / 1000);
    requestAnimationFrame(frame);
  }

  function wake() {
    if (!gl || running || !visible || document.hidden) return;
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
      meadow = document.createElement('canvas');
      if (REDUCED || !setupGL()) canvas.getContext('2d');
      strip = new Image();
      strip.onload = function () { if (canvas.isConnected) layout(); };
      strip.src = STRIP;
    }
    if (canvas.previousSibling !== img) img.after(canvas);
    io.disconnect();
    io.observe(section);
    layout();
    return true;
  }

  // The host may build #contact after `load`, so a failed first mount keeps
  // watching rather than giving up.
  function start() {
    window.addEventListener('resize', function () {
      if (canvas && canvas.isConnected) layout();
    }, { passive: true });
    document.addEventListener('visibilitychange', wake);
    new MutationObserver(function () {
      if (!canvas || !canvas.isConnected) mount();
    }).observe(document.documentElement, { childList: true, subtree: true });
    mount();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
