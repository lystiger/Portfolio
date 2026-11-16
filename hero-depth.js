/* Depth hero.
   Redraws the hero plate as three depths in one full-screen shader: the sky
   far, the hangar and meadow nearer, the figure nearest. The pointer and the
   scroll position shift each depth by a different amount, and a slow wind
   runs through the meadow.

   Layers come from scripts/build-hero-layers.sh, all cut from
   hero-master-bg.jpg itself, so the canvas draws the same picture the <img>
   underneath does and nothing is painted twice. The <img> stays in place as
   the fallback: this module does nothing on phones, under reduced motion or
   without WebGL, and the canvas only fades in once its first frame is drawn.

   History: an R3F/drei/GSAP version of this hero shipped 1.5 MB and framed
   badly in portrait (a4ab79b). This one is three core only, loaded after
   the page, and desktop only; phones keep the letterboxed still. */

const DESKTOP = '(min-width: 769px)';
const REDUCED = '(prefers-reduced-motion: reduce)';
if (window.matchMedia(DESKTOP).matches && !window.matchMedia(REDUCED).matches) {
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

const PLATE_ASPECT = 1376 / 768;
// Zoom past `cover` by this much so the shifted layers never sample past the
// plate's edge. It has to exceed the largest shift below.
const ZOOM = 1.045;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uBack;
  uniform sampler2D uFigure;
  uniform sampler2D uDepth;
  uniform vec2 uScale;     // visible fraction of the plate, per axis
  uniform vec2 uOrigin;    // plate uv of the canvas's bottom-left corner
  uniform vec2 uPointer;   // eased, -1..1
  uniform float uScroll;   // 0 at rest, 1 once the hero has scrolled away
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 uv = uOrigin + vUv * uScale;
    vec2 depthSample = texture2D(uDepth, uv).rg;
    float depth = depthSample.r;
    float meadow = depthSample.g;

    // Far layers move least. Sky lags behind the scroll, so the section reads
    // as deeper than the page around it. Pointer plus scroll stays under the
    // ZOOM margin (~0.021 uv per side) so no layer samples past the plate.
    // The background is one displaced image, so any depth step bends the
    // straight lines across it; keep its spread small and let the separate
    // figure layer carry most of the depth.
    vec2 shift = -uPointer * (0.004 + 0.006 * depth);
    shift.y += uScroll * 0.008 * (1.0 - depth);

    // Wind: a slow wave travelling right to left across the meadow, swelling
    // and dropping in gusts. Kept to a couple of pixels so the painted blades
    // sway rather than smear.
    float gust = 0.55 + 0.45 * sin(uTime * 0.37);
    float wave = sin(uTime * 1.7 + uv.x * 34.0 + uv.y * 9.0);
    shift.x += meadow * gust * wave * 0.0016;

    vec4 back = texture2D(uBack, uv + shift);
    vec4 figure = texture2D(uFigure, uv - uPointer * 0.017);
    gl_FragColor = vec4(mix(back.rgb, figure.rgb, figure.a), 1.0);
    #include <colorspace_fragment>
  }`;

async function start() {
  let THREE;
  try {
    THREE = await import('three');
  } catch (e) {
    return; // CDN unreachable: the still plate is already showing
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-depth';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  } catch (e) {
    return; // no WebGL
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const loader = new THREE.TextureLoader();
  const load = (url, srgb) => loader.loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  });
  let back, figure, depth;
  try {
    [back, figure, depth] = await Promise.all([
      load('assets/hero-depth/back.webp', true),
      load('assets/hero-depth/figure.webp', true),
      load('assets/hero-depth/depth.png', false),
    ]);
  } catch (e) {
    renderer.dispose();
    return;
  }

  const uniforms = {
    uBack: { value: back },
    uFigure: { value: figure },
    uDepth: { value: depth },
    uScale: { value: new THREE.Vector2(1, 1) },
    uOrigin: { value: new THREE.Vector2(0, 0) },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uScroll: { value: 0 },
    uTime: { value: 0 },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false })
  ));

  /* The host re-renders #home from a template and may swap it wholesale, so
     the hero is looked up again whenever the canvas is found detached. */
  let hero = null;
  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) wake();
  });

  function mount() {
    const media = document.querySelector('#home .hero-media');
    if (!media) return false;
    if (canvas.parentNode !== media) media.appendChild(canvas);
    if (hero !== media.parentNode) {
      if (hero) io.unobserve(hero);
      hero = media.parentNode;
      io.observe(hero);
    }
    resize();
    return true;
  }

  // Replicates `object-fit: cover; object-position: right bottom` from
  // .hero-base, zoomed by ZOOM, so the canvas frames the plate as the <img>
  // under it does to within the zoom.
  function resize() {
    if (!hero) return;
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const sx = (aspect > PLATE_ASPECT ? 1 : aspect / PLATE_ASPECT) / ZOOM;
    const sy = (aspect > PLATE_ASPECT ? PLATE_ASPECT / aspect : 1) / ZOOM;
    const pad = (1 - 1 / ZOOM) / 2;
    uniforms.uScale.value.set(sx, sy);
    uniforms.uOrigin.value.set(1 - sx - Math.min(1 - sx, pad), Math.min(1 - sy, pad));
  }

  const target = { x: 0, y: 0 };
  let pointerSeen = false;
  window.addEventListener('pointermove', (e) => {
    pointerSeen = true;
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', wake);

  const clock = new THREE.Timer();
  clock.connect(document);
  let running = false;
  let shown = false;

  function frame(now) {
    if (!visible || document.hidden || !canvas.isConnected) {
      running = false;
      return;
    }
    clock.update(now);
    const t = clock.getElapsed();
    uniforms.uTime.value = t;

    // Until the pointer moves, drift gently so the depth reads on its own.
    const tx = pointerSeen ? target.x : Math.sin(t * 0.21) * 0.35;
    const ty = pointerSeen ? target.y : Math.sin(t * 0.17) * 0.25;
    const p = uniforms.uPointer.value;
    p.x += (tx - p.x) * 0.05;
    p.y += (ty - p.y) * 0.05;

    const height = hero ? hero.offsetHeight : window.innerHeight;
    uniforms.uScroll.value = Math.min(1, Math.max(0, window.scrollY / (height || 1)));

    renderer.render(scene, camera);
    if (!shown) {
      shown = true;
      canvas.classList.add('is-ready');
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running || !visible || document.hidden) return;
    if (!canvas.isConnected && !mount()) return;
    running = true;
    requestAnimationFrame(frame);
  }

  new MutationObserver(() => {
    if (!canvas.isConnected && mount()) {
      // A freshly built hero arrives without the class the fade-in keyed on.
      if (shown) canvas.classList.add('is-ready');
      wake();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (mount()) wake();
}
