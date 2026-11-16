/* Depth hero.
   Redraws the hero plate as three depths in one full-screen shader: the sky
   far, the hangar and meadow nearer, the figure nearest. The pointer and the
   scroll position shift each depth by a different amount. One wind drives
   the scene: the clouds drift and billow, the meadow sways, and the windsock
   fills and flaps with the same gusts. Every minute or so the plane crosses
   the sky, drawing its contrail, and passes behind the hangar.

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

// Sprite rectangles in plate pixels (x, y from top, width, height); they must
// match the crops in scripts/build-hero-layers.sh.
const PLANE_RECT = [596, 98, 110, 44];
const SOCK_RECT = [1158, 331, 100, 64];
// Flight timing, in seconds.
const FLIGHT = 16;          // right edge to top edge
const TRAIL_FADE = 7;       // contrail lingers this long after
const FIRST_FLIGHT = 3;
const FLIGHT_GAP = [40, 90];

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
  uniform sampler2D uPlane;
  uniform sampler2D uSock;
  uniform vec4 uPlaneRect;
  uniform vec4 uSockRect;
  uniform vec2 uScale;     // visible fraction of the plate, per axis
  uniform vec2 uOrigin;    // plate uv of the canvas's bottom-left corner
  uniform vec2 uPointer;   // eased, -1..1
  uniform float uScroll;   // 0 at rest, 1 once the hero has scrolled away
  uniform float uTime;
  uniform float uFlight;   // seconds since the plane set off, or -1
  varying vec2 vUv;

  const vec2 PLATE = vec2(1376.0, 768.0);
  // The flight line runs through the plane's painted position at the
  // painted heading: in from behind the hangar, out through the top.
  const vec2 FLY_FROM = vec2(1458.0, 376.0);
  const vec2 FLY_TO = vec2(206.0, -25.0);

  // Plate uv (v up) to plate pixels (y down), and back.
  vec2 toPx(vec2 uv) { return vec2(uv.x, 1.0 - uv.y) * PLATE; }

  vec4 sprite(sampler2D tex, vec4 rect, vec2 px) {
    vec2 local = (px - rect.xy) / rect.zw;
    if (any(lessThan(local, vec2(0.0))) || any(greaterThan(local, vec2(1.0)))) return vec4(0.0);
    return texture2D(tex, vec2(local.x, 1.0 - local.y));
  }

  void main() {
    vec2 uv = uOrigin + vUv * uScale;
    vec3 depthSample = texture2D(uDepth, uv).rgb;
    float depth = depthSample.r;
    float meadow = depthSample.g;
    float sky = depthSample.b;
    float t = uTime;
    // One wind for the whole scene, swelling and dropping in gusts.
    float gust = 0.55 + 0.45 * sin(t * 0.37);

    // Far layers move least. Sky lags behind the scroll, so the section reads
    // as deeper than the page around it. The background is one displaced
    // image, so any depth step bends the straight lines across it; keep its
    // spread small and let the separate figure layer carry most of the depth.
    // Every shift below, summed, stays under the ZOOM margin (~0.021 uv per
    // side) so no layer samples past the plate.
    vec2 shift = -uPointer * (0.004 + 0.006 * depth);
    shift.y += uScroll * 0.008 * (1.0 - depth);
    vec2 skyShift = -uPointer * 0.004 + vec2(0.0, uScroll * 0.008);
    vec2 groundShift = -uPointer * (0.004 + 0.006 * 0.65);

    // Clouds: a slow drift one way and back over a couple of minutes, and a
    // billow of a few pixels so their edges churn. Only in open sky.
    vec2 billow = vec2(sin(uv.y * 14.0 + t * 0.19), sin(uv.x * 11.0 - t * 0.15));
    shift += sky * (vec2(0.010 * sin(t * 0.052), 0.0) + 0.0022 * billow);

    // Meadow: a wave travelling across it, stronger toward the front.
    float wave = sin(t * 1.7 + uv.x * 34.0 + uv.y * 9.0);
    float near = mix(0.6, 1.5, clamp((depth - 0.65) / 0.2, 0.0, 1.0));
    shift.x += meadow * near * gust * wave * 0.0016;

    vec3 color = texture2D(uBack, uv + shift).rgb;

    // Contrail and plane, at sky depth, hidden behind the hangar and trees.
    if (uFlight >= 0.0) {
      vec2 px = toPx(uv + skyShift);
      float ground = smoothstep(0.25, 0.45, texture2D(uDepth, uv + skyShift).r);
      vec2 dir = normalize(FLY_TO - FLY_FROM);
      float travelled = length(FLY_TO - FLY_FROM) * min(uFlight / ${FLIGHT.toFixed(1)}, 1.0);
      vec2 nose = FLY_FROM + dir * travelled;
      // The trail leaves the tail, a little below and behind the centre.
      vec2 tail = nose - dir * 50.0 + vec2(0.0, 14.0);
      float behind = dot(tail - px, dir);
      float across = abs(dot(tail - px, vec2(-dir.y, dir.x)));
      // Painted contrails are soft: it starts thin and faint just off the
      // tail, spreads and dissolves along its length, and wavers a little.
      float trailLength = min(travelled, 300.0);
      float width = 2.0 + behind * 0.035;
      across += sin(behind * 0.045 + uFlight * 0.6) * behind * 0.012;
      float fade = 1.0 - clamp((uFlight - ${FLIGHT.toFixed(1)}) / ${TRAIL_FADE.toFixed(1)}, 0.0, 1.0);
      float trail = smoothstep(0.0, 18.0, behind) * (1.0 - smoothstep(0.0, trailLength, behind))
        * (1.0 - smoothstep(0.0, width, across)) * fade * 0.5;
      color = mix(color, vec3(0.95, 0.96, 0.97), trail * (1.0 - ground));

      vec4 plane = sprite(uPlane, vec4(nose - uPlaneRect.zw * 0.5, uPlaneRect.zw), px);
      color = mix(color, plane.rgb, plane.a * (1.0 - ground) * step(uFlight, ${FLIGHT.toFixed(1)}));
    }

    // Windsock: hinged at the pole, a ripple running down it, filling out in
    // the gusts and sagging a little between them.
    {
      vec2 px = toPx(uv + groundShift);
      float along = clamp((px.x - uSockRect.x - 5.0) / (uSockRect.z - 5.0), 0.0, 1.0);
      float ripple = sin(along * 6.5 - t * 7.0) * 1.8 * along * (0.5 + gust);
      float sag = (1.0 - gust) * along * 6.0;
      vec4 sock = sprite(uSock, uSockRect, px - vec2(0.0, ripple + sag));
      color = mix(color, sock.rgb, sock.a);
    }

    vec4 figure = texture2D(uFigure, uv - uPointer * 0.017);
    gl_FragColor = vec4(mix(color, figure.rgb, figure.a), 1.0);
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
  let back, figure, depth, plane, sock;
  try {
    [back, figure, depth, plane, sock] = await Promise.all([
      load('assets/hero-depth/back.webp', true),
      load('assets/hero-depth/figure.webp', true),
      load('assets/hero-depth/depth.png', false),
      load('assets/hero-depth/plane.webp', true),
      load('assets/hero-depth/sock.webp', true),
    ]);
  } catch (e) {
    renderer.dispose();
    return;
  }

  const uniforms = {
    uBack: { value: back },
    uFigure: { value: figure },
    uDepth: { value: depth },
    uPlane: { value: plane },
    uSock: { value: sock },
    uPlaneRect: { value: new THREE.Vector4(...PLANE_RECT) },
    uSockRect: { value: new THREE.Vector4(...SOCK_RECT) },
    uFlight: { value: -1 },
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
  // The scene clock only runs while the hero is drawn, so a flight never
  // happens unseen; the next one is booked once the last trail has faded.
  let flightAt = FIRST_FLIGHT;

  function frame(now) {
    if (!visible || document.hidden || !canvas.isConnected) {
      running = false;
      return;
    }
    clock.update(now);
    // Capped so time scrolled or tabbed away does not count.
    const t = (uniforms.uTime.value += Math.min(clock.getDelta(), 0.1));

    if (t > flightAt + FLIGHT + TRAIL_FADE) {
      flightAt = t + FLIGHT_GAP[0] + Math.random() * (FLIGHT_GAP[1] - FLIGHT_GAP[0]);
    }
    uniforms.uFlight.value = t >= flightAt ? t - flightAt : -1;

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
