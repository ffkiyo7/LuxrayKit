// PWA 开屏（星尾点亮）。A classic, same-origin script loaded synchronously from index.html so the
// overlay is on screen before the module bundle has run — CSP `script-src 'self'` rules out an
// inline <script>, and a module script would wait behind the bundle.
//
// Plays only when all hold: launched from the home screen (standalone), the first launch of this
// session, and the 开屏动画 preference is on. The preference and theme live in IndexedDB, which
// cannot be read synchronously, so the app mirrors both into localStorage (src/lib/splashMirror.ts
// owns the keys below; splashMirror.test.ts checks they match).
//
// The overlay leaves only when the animation has reached its exit AND the app has signalled
// `luxraykit:app-ready` (App.tsx, once local data has loaded). Anything unexpected — the artwork
// failing to load, the app never becoming ready — removes it instead of leaving it stuck.
(function () {
  var MODE_KEY = 'luxraykit-splash';
  var THEME_KEY = 'luxraykit-theme';
  var SESSION_KEY = 'luxraykit-splash-played';
  var READY_EVENT = 'luxraykit:app-ready';
  var ARTWORK = '/assets/pokemon/artwork/405.png';

  function read(storage, key) {
    try {
      return window[storage].getItem(key);
    } catch (error) {
      return null;
    }
  }

  var standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!standalone || read('localStorage', MODE_KEY) === 'off' || read('sessionStorage', SESSION_KEY)) return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch (error) {
    // Without sessionStorage the splash may replay on a warm resume; harmless.
  }

  var light = read('localStorage', THEME_KEY) === 'light';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Artwork (475×475) positions, as fractions: the tail star's centre, and its tilt.
  var STAR = { x: 0.884, y: 0.665 };
  var STAR_TILT = 27;
  var EXIT_AT = 1500;
  var EXIT_MS = 300;
  var START_TIMEOUT_MS = 900;
  var READY_TIMEOUT_MS = 8000;

  var style = document.createElement('style');
  style.textContent =
    '#lk-splash{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;background:' + (light ? '#fbfbfd' : '#141414') + ';color:' + (light ? '#1c1c1e' : '#f5f5f7') + ';' +
    '--pt:calc(min(100vw,430px)/390);--glow:' + (light ? 'rgb(214 150 0/.35)' : 'rgb(242 194 48/.55)') + ';' +
    "font-family:'Manrope','PingFang SC','Noto Sans SC',system-ui,-apple-system,sans-serif;pointer-events:none;will-change:opacity}" +
    '#lk-splash .st{position:relative;width:calc(250*var(--pt));aspect-ratio:1;margin-top:calc(-60*var(--pt))}' +
    '#lk-splash .st>img{position:absolute;inset:0;width:100%;height:100%;clip-path:circle(0% at 88.4% 66.5%)}' +
    '#lk-splash .sp,#lk-splash .rg,#lk-splash .gl{position:absolute;left:' + STAR.x * 100 + '%;top:' + STAR.y * 100 + '%;' +
    'transform:translate(-50%,-50%) scale(0)}' +
    '#lk-splash .sp{width:calc(64*var(--pt));aspect-ratio:1;filter:drop-shadow(0 0 calc(10*var(--pt)) var(--glow))}' +
    '#lk-splash .sp svg{display:block;width:100%;height:100%;overflow:visible}' +
    '#lk-splash .rg{border-radius:50%;border:calc(2*var(--pt)) solid var(--glow);opacity:0;transform:translate(-50%,-50%)}' +
    '#lk-splash .gl{width:calc(120*var(--pt));aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,var(--glow) 0%,transparent 65%)}' +
    '#lk-splash .wd{text-align:center;margin-top:calc(10*var(--pt));opacity:0}' +
    '#lk-splash .wn{font-size:calc(30*var(--pt));font-weight:800;letter-spacing:-.025em;line-height:1.1}' +
    '#lk-splash .ws{font-size:calc(13*var(--pt));color:' + (light ? '#6e6e73' : '#8e8e93') + ';margin-top:calc(6*var(--pt));letter-spacing:.01em}';
  document.head.appendChild(style);

  // Luxray's tail star, traced from the artwork: four plump arms with concave sides, a slight
  // pinwheel twist, a darker lower half and a sheen on the top arm. Drawn upright.
  function polar(deg, r) {
    var a = (deg * Math.PI) / 180;
    return (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
  }
  var starPath = '';
  for (var i = 0; i < 4; i++) {
    var a = -90 + i * 90;
    var w = a + 48;
    starPath +=
      (i === 0 ? 'M' + polar(a, 50) : '') +
      'C' + polar(a + 16, 34) + ' ' + polar(w - 24, 22) + ' ' + polar(w, 21) +
      'C' + polar(w + 24, 22) + ' ' + polar(a + 74, 34) + ' ' + polar(a + 90, 50);
  }
  starPath += 'Z';
  var starSvg =
    '<svg viewBox="-54 -54 108 108" aria-hidden="true"><defs>' +
    '<linearGradient id="lk-sg" x1="0.8" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#fbd552"/>' +
    '<stop offset="0.55" stop-color="#f3b92f"/><stop offset="1" stop-color="#e8a522"/></linearGradient>' +
    '<clipPath id="lk-sc"><path d="' + starPath + '"/></clipPath>' +
    '<filter id="lk-sb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.8"/></filter></defs>' +
    '<path d="' + starPath + '" fill="url(#lk-sg)"/><g clip-path="url(#lk-sc)">' +
    '<path d="M-60 3 Q0 -2 60 5 L60 60 L-60 60Z" fill="#c9861a" opacity="0.42"/>' +
    '<ellipse cx="5" cy="-24" rx="4.5" ry="13" transform="rotate(8 5 -24)" fill="#fff" opacity="0.45" filter="url(#lk-sb)"/></g>' +
    '<path d="' + starPath + '" fill="none" stroke="#33260a" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  var root = document.createElement('div');
  root.id = 'lk-splash';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="st"><img alt="" decoding="async"><div class="rg"></div><div class="sp">' + starSvg + '</div><div class="gl"></div></div>' +
    '<div class="wd"><div class="wn">LuxrayKit</div><div class="ws">Pokémon Champions 对战助手</div></div>';
  document.body.appendChild(root);

  var stage = root.querySelector('.st');
  var art = root.querySelector('img');
  var ring = root.querySelector('.rg');
  var star = root.querySelector('.sp');
  var glow = root.querySelector('.gl');
  var word = root.querySelector('.wd');

  var appReady = false;
  var removed = false;
  var started = 0;
  var exitFrom = 0;

  function remove() {
    if (removed) return;
    removed = true;
    root.remove();
    style.remove();
  }

  window.addEventListener(READY_EVENT, function () {
    appReady = true;
  }, { once: true });
  // Never outstay a stuck app: the overlay is decoration, not a loading gate.
  window.setTimeout(function () {
    appReady = true;
  }, READY_TIMEOUT_MS);

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function seg(t, a, b) {
    return clamp((t - a) / (b - a));
  }
  function outCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }
  function outBack(p) {
    return 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
  }
  function inOut(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
  function bell(p) {
    return Math.sin(Math.PI * clamp(p));
  }

  function render(t) {
    var pop = seg(t, 100, 400);
    var fly = inOut(seg(t, 400, 750));
    // Quadratic arc from the screen centre, up and over, to the tail tip.
    var x = (1 - fly) * (1 - fly) * 0.5 + 2 * (1 - fly) * fly * 0.78 + fly * fly * STAR.x;
    var y = (1 - fly) * (1 - fly) * 0.52 + 2 * (1 - fly) * fly * 0.18 + fly * fly * STAR.y;
    star.style.left = x * 100 + '%';
    star.style.top = y * 100 + '%';
    // Lands at the artwork's own size and tilt, so the hand-off to the drawn star is invisible.
    var s = t < 100 ? 0 : outBack(pop) * (1.25 - 0.56 * fly);
    star.style.transform = 'translate(-50%,-50%) scale(' + s + ') rotate(' + (pop * 240 + fly * (120 + STAR_TILT)) + 'deg)';
    star.style.opacity = 1 - seg(t, 1000, 1150);

    var r = outCubic(seg(t, 700, 1150)) * 130;
    art.style.clipPath = 'circle(' + r + '% at ' + STAR.x * 100 + '% ' + STAR.y * 100 + '%)';
    ring.style.width = ring.style.height = r * 2 + '%';
    ring.style.opacity = t < 700 ? 0 : (1 - r / 130) * 0.9;
    glow.style.transform = 'translate(-50%,-50%) scale(' + bell(seg(t, 680, 1000)) * 1.6 + ')';

    var wd = outCubic(seg(t, 950, 1300));
    word.style.opacity = wd;
    word.style.transform = 'translateY(' + (1 - wd) * 10 + 'px)';
  }

  function frame(now) {
    if (removed) return;
    var t = now - started;
    if (!exitFrom) {
      render(reduceMotion ? EXIT_AT : Math.min(t, EXIT_AT));
      if (t >= EXIT_AT && appReady) exitFrom = now;
    }
    if (exitFrom) {
      var x = inOut(seg(now - exitFrom, 0, EXIT_MS));
      root.style.opacity = 1 - x;
      stage.style.transform = 'scale(' + (1 + x * 0.06) + ')';
      if (x >= 1) return remove();
    }
    window.requestAnimationFrame(frame);
  }

  function start() {
    if (started || removed) return;
    started = window.performance.now();
    // Reduced motion: the finished frame, held briefly, then the same fade.
    if (reduceMotion) started -= EXIT_AT - 400;
    window.requestAnimationFrame(frame);
  }

  // Start once the artwork (and the wordmark's face) are ready. Both come from the service
  // worker's precache, so this is normally immediate; if the artwork is slow the animation would
  // stutter or play half-empty, so give up and get out of the way instead.
  var timeout = window.setTimeout(remove, START_TIMEOUT_MS);
  art.onerror = remove;
  art.src = ARTWORK;
  var fontReady = document.fonts && document.fonts.load ? document.fonts.load('800 30px Manrope').catch(function () {}) : null;
  Promise.all([art.decode ? art.decode() : Promise.resolve(), fontReady])
    .then(function () {
      window.clearTimeout(timeout);
      start();
    })
    .catch(remove);
})();
