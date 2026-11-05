// 3D-сцена конструктора: студийный рендер пандуса, разборка на пружинах, X-Ray, Blueprint, разрез,
// лазерные размеры, пошаговая сборка, изоляция детали, поворотный стол.
// Единственное объявление верхнего уровня — createScene (файл склеивается с другими в один скрипт).
// Нужны глобальные THREE r147 UMD: three.min.js, OrbitControls.js; RoomEnvironment.js — желательно (без него проще отражения).
// Геометрия деталей берётся из build() в ramp.js как есть: анимация двигает детали, но не меняет производственные размеры.
export function createScene(container, opts) {
  opts = opts || {};
  const T = window.THREE;

  // ---------- утилиты ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3.2);
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const lin = (h) => new T.Color(h).convertSRGBToLinear();   // r147: цвета материалов задаём в линейном пространстве
  const fmt = (v) => String(+(+v).toFixed(4)).replace(".", ",");   // как введено, без округления (ТЗ п. 3)
  const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduce = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener("change", (e) => { reduce = e.matches; });

  const overlay = document.createElement("div");
  Object.assign(overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", zIndex: "1" });

  // ---------- рендерер ----------
  let renderer = null;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); } catch (err) { renderer = null; }
  if (!renderer || !T.OrbitControls) {
    overlay.textContent = "3D недоступно на этом устройстве: браузер не дал WebGL.";
    Object.assign(overlay.style, { display: "grid", placeItems: "center", font: "500 14px system-ui, sans-serif", color: "#6e6e73", textAlign: "center", padding: "24px" });
    container.appendChild(overlay);
    const noop = () => {};
    return { setModel: noop, setPaint: noop, setExplode: noop, play: noop, setXray: noop, setBlueprint: noop, setDims: noop, setLite: noop, highlight: noop, resize: noop, setTheme: noop, setStep: noop, isolate: noop, setSpin: noop, setSection: noop };
  }
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.VSMShadowMap;             // мягкие студийные тени
  renderer.shadowMap.autoUpdate = false;           // тени пересчитываются, только когда что-то сдвинулось
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", touchAction: "none", outline: "none", WebkitTapHighlightColor: "transparent" });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "3D-модель пандуса");
  container.appendChild(canvas);
  container.appendChild(overlay);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const smallScreen = Math.min(screen.width || 1000, screen.height || 1000) < 700;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.05, 40);
  camera.position.set(2, 1.4, 2.6);
  const controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.8;
  controls.minDistance = 0.3;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.autoRotateSpeed = 0.55;

  // ---------- освещение ----------
  // своя студия для отражений: купол с градиентом и мягкие софтбоксы (над, ключ справа, контровой, заполняющий);
  // только ядро three — RoomEnvironment не нужен
  function studioEnv() {
    const es = new T.Scene();
    const dome = new T.SphereGeometry(10, 32, 16), col = [], pa = dome.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i) / 10, k = y > 0 ? 0.42 + 0.5 * y : 0.42 + 0.3 * y;
      col.push(k, k, k * 1.02);
    }
    dome.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    es.add(new T.Mesh(dome, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const box = (w, h, x, y, z, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k * 0.98), side: T.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
    };
    box(7, 3.2, 0, 7, 0.6, 5.5);      // над головой
    box(3, 4.5, 5.5, 3.2, 4.5, 7);    // ключ справа спереди
    box(10, 2.6, -1, 3.2, -7, 7);     // контровая полоса: мягкий блик по атласной краске
    box(1.2, 5, -7, 2, 2.5, 2.2);     // заполняющий слева
    return es;
  }
  let envTex = null;
  if (T.PMREMGenerator) {
    try {
      const pmrem = new T.PMREMGenerator(renderer);
      const es = studioEnv();
      envTex = pmrem.fromScene(es, 0.02).texture;
      es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      pmrem.dispose();
    } catch (err) { envTex = null; }
  }
  scene.environment = envTex;
  const HEMI_ENV = 0.22, HEMI_NOENV = 1.0;
  const hemi = new T.HemisphereLight(0xffffff, 0xe6e1d9, envTex ? HEMI_ENV : HEMI_NOENV);
  scene.add(hemi);
  const KEY_I = 1.25;
  const key = new T.DirectionalLight(0xfff5ea, KEY_I);
  key.castShadow = true;
  const sm = smallScreen ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.002;
  key.shadow.radius = 9;
  key.shadow.blurSamples = 16;
  scene.add(key, key.target);
  const KEY_DIR = new T.Vector3(0.42, 1, 0.5).normalize();
  const keyDir = KEY_DIR.clone();
  const fill = new T.DirectionalLight(0xe2ebff, 0.38);
  fill.position.set(-2.2, 1.1, 1.4);
  scene.add(fill);

  // ---------- фон: бесшовная циклорама (экранный градиент с виньеткой, вне тонмаппинга) ----------
  const THEMES = {
    light: { a: new T.Color("#FBFBFD"), b: new T.Color("#DCDCE2") },
    dark: { a: new T.Color("#3A3A3F"), b: new T.Color("#121214") },
    bp: { a: new T.Color("#1552B2"), b: new T.Color("#072766") },
  };
  const bgU = { uA: { value: new T.Color() }, uB: { value: new T.Color() }, uAspect: { value: 1 } };
  const bg = new T.Mesh(
    new T.BufferGeometry().setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)),
    new T.ShaderMaterial({
      uniforms: bgU, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `uniform vec3 uA; uniform vec3 uB; uniform float uAspect; varying vec2 vUv;
        void main(){
          vec2 p = vUv - vec2(0.5, 0.56); p.x *= uAspect;
          float r = clamp(length(p) / (0.7 + 0.28*max(uAspect-1.0,0.0)), 0.0, 1.0);
          vec3 c = mix(uA, uB, r*r*(3.0-2.0*r));
          c = mix(c, uB, smoothstep(0.42, 0.0, vUv.y) * 0.3);
          c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  bg.frustumCulled = false;
  bg.renderOrder = -1000;
  scene.add(bg);

  // ---------- процедурные текстуры (только canvas, без сети) ----------
  function tex(c, srgb, repU, repV) {
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = maxAniso;
    t.repeat.set(repU, repV);
    return t;
  }
  // древесина: годичные кольца с изгибом, волокна; бесшовно по обеим осям
  function woodCanvas(w, h, o) {
    const c = mkCanvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
    const r = rng(o.seed), TAU = Math.PI * 2;
    const warp = new Float32Array(w), ph = [r() * TAU, r() * TAU, r() * TAU];
    for (let x = 0; x < w; x++) {
      const u = x / w;
      warp[x] = o.warp * (Math.sin(TAU * u + ph[0]) * 0.6 + Math.sin(TAU * 2 * u + ph[1]) * 0.3 + Math.sin(TAU * 5 * u + ph[2]) * 0.1);
    }
    const rowN = new Float32Array(h);
    for (let y = 0; y < h; y++) rowN[y] = r();
    for (let y = 0; y < h; y++) rowN[y] = (rowN[y] + rowN[(y + 1) % h] + rowN[(y + h - 1) % h]) / 3;
    const phR = r() * TAU;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const vv = (y + warp[x]) / h;
      const s = o.rings * vv + 0.35 * Math.sin(TAU * 2 * vv + phR);
      const f = s - Math.floor(s);
      const late = Math.pow(Math.max(0, Math.sin(f * Math.PI)), o.sharp);
      const fib = (rowN[y] - 0.5) * o.fiber + (r() - 0.5) * o.noise;
      const k = clamp(late * o.contrast + fib, -0.2, 1);
      const i = (y * w + x) * 4;
      d[i] = o.base[0] + (o.dark[0] - o.base[0]) * k;
      d[i + 1] = o.base[1] + (o.dark[1] - o.base[1]) * k;
      d[i + 2] = o.base[2] + (o.dark[2] - o.base[2]) * k;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // торец берёзовой фанеры 18: 13 слоёв шпона, клеевые швы
  function birchEdgeCanvas() {
    const w = 256, h = 208, c = mkCanvas(w, h), g = c.getContext("2d"), r = rng(11), L = 13;
    for (let i = 0; i < L; i++) {
      const y0 = (i * h) / L, y1 = ((i + 1) * h) / L, cross = i % 2 === 1;
      g.fillStyle = cross ? "#D6B987" : "#EAD5B0";
      g.fillRect(0, y0, w, y1 - y0);
      for (let k = 0; k < 90; k++) {
        g.fillStyle = `rgba(120,86,40,${0.05 + r() * 0.08})`;
        if (cross) g.fillRect(r() * w, y0 + 1, 1 + r() * 2, y1 - y0 - 2);
        else g.fillRect(r() * w, y0 + 1 + r() * (y1 - y0 - 3), 10 + r() * 50, 1);
      }
      g.fillStyle = "rgba(92,64,30,0.6)";
      g.fillRect(0, y1 - 1.5, w, 1.5);
    }
    return c;
  }
  // рельеф антискользящей шпатлёвки ALSiUR: мелкое зерно, карта нормалей
  function gritNormalCanvas() {
    const n = 512, H = new Float32Array(n * n), r = rng(5);
    for (let k = 0; k < 9000; k++) {
      const cx = Math.floor(r() * n), cy = Math.floor(r() * n), rad = 0.9 + r() * 2.2, amp = 0.5 + r() * 0.8, R = Math.ceil(rad * 2);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const q = (dx * dx + dy * dy) / (rad * rad);
        if (q < 4) H[((cy + dy + n) % n) * n + ((cx + dx + n) % n)] += amp * Math.exp(-q * 1.6);
      }
    }
    const c = mkCanvas(n, n), g = c.getContext("2d"), img = g.createImageData(n, n), d = img.data, s = 1.6;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (H[y * n + ((x + 1) % n)] - H[y * n + ((x - 1 + n) % n)]) * s;
      const dy = (H[((y + 1) % n) * n + x] - H[((y - 1 + n) % n) * n + x]) * s;
      const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // светлый бетон: мягкие пятна + поры, бесшовный value noise
  function concreteCanvas() {
    const n = 512, c = mkCanvas(n, n), g = c.getContext("2d"), img = g.createImageData(n, n), d = img.data, r = rng(23);
    const lat = (P) => { const a = new Float32Array(P * P); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
    const oct = [[6, lat(6), 0.5], [16, lat(16), 0.3], [48, lat(48), 0.2]];
    const vn = (P, a, x, y) => {
      const fx = (x / n) * P, fy = (y / n) * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x0 = ix % P, y0 = iy % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      const v0 = a[y0 * P + x0] + (a[y0 * P + x1] - a[y0 * P + x0]) * sx, v1 = a[y1 * P + x0] + (a[y1 * P + x1] - a[y1 * P + x0]) * sx;
      return v0 + (v1 - v0) * sy;
    };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0; for (const [P, a, w] of oct) v += vn(P, a, x, y) * w;
      const k = 232 + (v - 0.5) * 26 + (r() - 0.5) * 10, i = (y * n + x) * 4;
      d[i] = k; d[i + 1] = k - 1; d[i + 2] = k - 3; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(90,86,80,${0.08 + r() * 0.18})`;
      g.beginPath(); g.arc(r() * n, r() * n, 0.4 + r() * 1.1, 0, Math.PI * 2); g.fill();
    }
    return c;
  }
  // трафарет «goapsny.org»: белая краска, перемычки в замкнутых буквах, лёгкий распыл
  const TEXT_ASPECT = 1024 / 176;
  function stencilCanvas() {
    const w = 1024, h = 176, c = mkCanvas(w, h), g = c.getContext("2d"), text = "goapsny.org", r = rng(31);
    let fs = 150;
    const font = (s) => `800 ${s}px "Arial Black", "Helvetica Neue", Arial, system-ui, sans-serif`;
    g.font = font(fs);
    fs = Math.floor(fs * Math.min(1, (w * 0.94) / g.measureText(text).width));
    g.font = font(fs);
    g.textBaseline = "middle";
    const tw = g.measureText(text).width, x0 = (w - tw) / 2, yM = h * 0.54;
    g.fillStyle = "#fff";
    g.shadowColor = "rgba(255,255,255,0.4)"; g.shadowBlur = 5;
    g.fillText(text, x0, yM);
    g.shadowBlur = 0; g.fillText(text, x0, yM);
    g.globalCompositeOperation = "destination-out";
    let x = x0;
    for (const ch of text) {
      const cw = g.measureText(ch).width;
      if ("goap".includes(ch)) g.fillRect(x + cw * 0.47, 0, Math.max(4, fs * 0.07), h);
      x += cw;
    }
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.globalCompositeOperation = "source-over";
    return c;
  }

  const TX = {
    pine: tex(woodCanvas(1024, 256, { seed: 3, rings: 9, sharp: 6, contrast: 0.62, warp: 26, fiber: 0.22, noise: 0.08, base: [226, 183, 126], dark: [168, 108, 52] }), true, 1 / 0.9, 1 / 0.22),
    birch: tex(woodCanvas(1024, 512, { seed: 7, rings: 6, sharp: 3, contrast: 0.26, warp: 38, fiber: 0.14, noise: 0.05, base: [228, 202, 160], dark: [190, 146, 92] }), true, 1 / 1.1, 1 / 0.55),
    birchEdge: tex(birchEdgeCanvas(), true, 1 / 0.25, 1),
    grit: tex(gritNormalCanvas(), false, 1 / 0.11, 1 / 0.11),
    concrete: tex(concreteCanvas(), true, 1 / 0.7, 1 / 0.7),
    stencil: tex(stencilCanvas(), true, 1, 1),
  };
  TX.stencil.wrapS = TX.stencil.wrapT = T.ClampToEdgeWrapping;

  // ---------- материалы ----------
  // общий шейдерный слой деталей: френелевская прозрачность (стекло X-Ray), цветной ободок (подсветка, Blueprint),
  // шторка покраски (шаг «finish»), разрез по середине ширины с заливкой сечения (обратные грани = сплошной срез)
  const SECTION_X = { value: 1e4 };                 // x сцены, правее которого деталь срезана
  function fx(mat, capHex) {
    const u = {
      uFres: { value: 0 }, uRim: { value: 0 }, uRimCol: { value: new T.Color(1, 1, 1) },
      uWipe: { value: new T.Vector3(0, 1, 0) }, uSecX: SECTION_X, uCap: { value: 0 }, uCapCol: { value: new T.Color(capHex) },
    };
    mat.userData.u = u;
    mat.side = T.DoubleSide;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = "varying vec3 vGsW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvGsW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "uniform float uFres;\nuniform float uRim;\nuniform vec3 uRimCol;\nuniform vec3 uWipe;\nuniform float uSecX;\nuniform float uCap;\nuniform vec3 uCapCol;\nvarying vec3 vGsW;\n" +
        sh.fragmentShader
          .replace("#include <clipping_planes_fragment>", `if (uWipe.z > 0.5 && (vGsW.z - uWipe.x) * uWipe.y < 0.0) discard;
            if (vGsW.x > uSecX) discard;
            #include <clipping_planes_fragment>`)
          .replace("#include <dithering_fragment>", `float gsFr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
            gl_FragColor.rgb += uRimCol * (uRim * gsFr);
            gl_FragColor.a = clamp(gl_FragColor.a + uFres * gsFr, 0.0, 1.0);
            if (uWipe.z > 0.5) { float gsS = 1.0 - smoothstep(0.0, 0.014, abs(vGsW.z - uWipe.x)); gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.66, 0.56), gsS * 0.9); }
            if (uCap > 0.5 && !gl_FrontFacing) gl_FragColor = vec4(uCapCol, 1.0);
            #ifdef GS_SEC
            gl_FragDepth = gl_FragCoord.z - ((!gl_FrontFacing && uCap > 0.5 && vGsW.x > uSecX - 0.09) ? 4e-6 : 0.0);
            #endif
            #include <dithering_fragment>`);
    };
    mat.customProgramCacheKey = () => "gs-fx-2";
    mat.userData.base = mat.color.clone();
    return mat;
  }
  // тень срезанной половины тоже убирается: своя глубинная карта с тем же разрезом
  const secDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  secDepth.onBeforeCompile = (sh) => {
    sh.uniforms.uSecX = SECTION_X;
    sh.vertexShader = "varying vec3 vGsW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvGsW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "uniform float uSecX;\nvarying vec3 vGsW;\n" + sh.fragmentShader.replace("#include <clipping_planes_fragment>", "if (vGsW.x > uSecX) discard;\n#include <clipping_planes_fragment>");
  };
  secDepth.customProgramCacheKey = () => "gs-sec-depth";
  const GLASS = lin("#DCE9FA");
  const CAP_PLY = "#EF705D", CAP_PINE = "#17345E";
  // заливка сечения (выводится после кодирования — цвета в sRGB): на краске коралл, на дереве тёмно-синий
  const CAP_PAINT_PLY = new T.Color("#EF705D"), CAP_PAINT_PINE = new T.Color("#F3DFCB"), CAP_RAW_PLY = new T.Color("#EF705D"), CAP_RAW_PINE = new T.Color("#17345E");
  const rawMat = (map, rough, cap) => fx(new T.MeshStandardMaterial({ map, color: lin("#E9E2D6"), roughness: rough, metalness: 0, envMapIntensity: 0.6 }), cap);
  const paintMat = (hex, grit, cap) => fx(new T.MeshPhysicalMaterial({
    color: lin(hex), roughness: grit ? 0.58 : 0.45, metalness: 0, clearcoat: grit ? 0.22 : 0.4, clearcoatRoughness: grit ? 0.3 : 0.22,
    envMapIntensity: 0.75, normalMap: grit ? TX.grit : null, normalScale: new T.Vector2(0.55, 0.55),
  }), cap);
  const concreteStep = new T.MeshStandardMaterial({ color: lin("#F1EFEB"), map: TX.concrete, roughness: 0.9, envMapIntensity: 0.5 });
  const concreteSlab = new T.MeshStandardMaterial({ color: lin("#E2DED7"), map: TX.concrete, roughness: 0.94, envMapIntensity: 0.5 });
  const ctxMats = [
    { m: concreteStep, l: lin("#F1EFEB"), d: lin("#77777D") },
    { m: concreteSlab, l: lin("#E2DED7"), d: lin("#5B5B61") },
  ];
  const shadowMat = new T.ShadowMaterial({ opacity: 0.13, depthWrite: false });
  const blobMat = () => new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const floorBlob = blobMat(), rampBlob = blobMat();
  const blobs = [{ m: floorBlob, base: 0.22 }, { m: rampBlob, base: 0.42 }];
  const outlineMat = new T.LineBasicMaterial({ color: lin("#DCEBFF"), transparent: true, opacity: 0, depthWrite: false });
  const gridMat = new T.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uC: { value: new T.Vector2() }, uR: { value: 3 } },
    transparent: true, depthWrite: false, extensions: { derivatives: true },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: `uniform float uK; uniform vec2 uC; uniform float uR; varying vec3 vW;
      float gl(vec2 p, float s){ vec2 q = p/s; vec2 g = abs(fract(q-0.5)-0.5)/fwidth(q); return 1.0-min(min(g.x,g.y),1.0); }
      void main(){
        float a = gl(vW.xz, 0.05)*0.16 + gl(vW.xz, 0.25)*0.42;
        a *= 1.0 - smoothstep(uR*0.35, uR, length(vW.xz-uC));
        gl_FragColor = vec4(0.86, 0.93, 1.0, a*uK);
      }`,
  });
  const laserCore = new T.MeshBasicMaterial({ color: lin("#FF7A66"), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const laserHalo = new T.MeshBasicMaterial({ color: lin("#EF705D"), transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, toneMapped: false });
  const unitCyl = new T.CylinderGeometry(1, 1, 1, 10, 1, false);
  const unitSph = new T.SphereGeometry(1, 14, 10);
  const textMat = new T.MeshStandardMaterial({ map: TX.stencil, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // ---------- граф сцены ----------
  const world = new T.Group(); scene.add(world);
  const partsG = new T.Group(); world.add(partsG);
  const ctxG = new T.Group(); world.add(ctxG);
  const laserG = new T.Group(); world.add(laserG);

  // мм рампы → метры сцены: X наружу → z, Y вправо → x, Z вверх → y
  let W = 900;
  const V = (x, y, z, out) => (out || new T.Vector3()).set((y - W / 2) / 1000, z / 1000, x / 1000);

  // ---------- состояние (всё можно задать до первого setModel) ----------
  let model = null, parts = [], lasers = [];
  const partsById = {}, labelsByKey = {};
  let paint = "#102C54", selected = null, lite = false, dimsOn = true, theme = "light", sectionOn = false, spinOn = false;
  let stepN = null, isoId = null;
  let tgt = 0, drive = 0, playing = false, playT0 = 0;
  const tw = (dur, v) => ({ p: v, to: v, v: v, dur });
  const xK = tw(0.38, 0), bK = tw(0.6, 0), thK = tw(0.45, 0), dimsK = tw(0.28, 0), secK = tw(0.45, 0);
  let needsRender = true, lookDirty = true, time = 0, last = 0, framedR = 0, framedNarrow = null, userMoved = false, firstFrame = true;
  const camAnim = { on: false, t: 0, dur: 0.75, out: false, light: false, p0: new T.Vector3(), p1: new T.Vector3(), t0: new T.Vector3(), t1: new T.Vector3() };
  const sweep = { on: false, t: 0, z0: 0, z1: 1 };
  // разборка поднимает детали: на время кадра камера чуть отъезжает и поднимает взгляд (состояние OrbitControls не трогаем)
  const dolly = { k: 0, lift: 0.15, pos: new T.Vector3(), quat: new T.Quaternion(), tg: new T.Vector3(), on: false };
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpC = new T.Color();
  const C_CORAL = lin("#EF705D"), C_XR_L = lin("#1F3B63"), C_XR_D = lin("#CFE0FF"), C_BP = lin("#E4F0FF"), C_RIM_X = lin("#9EC2FF"), C_RIM_B = lin("#7FD3FF");
  const C_GH_L = lin("#5A6B86"), C_GH_D = lin("#B9C6DA");
  const stepTw = (o, dt) => {
    if (o.p === o.to) return false;
    const d = dt / (reduce ? Math.min(o.dur, 0.18) : o.dur);
    o.p = o.to > o.p ? Math.min(o.to, o.p + d) : Math.max(o.to, o.p - d);
    o.v = ease(o.p);
    return true;
  };
  // r147 вшивает OPAQUE в программу: смена прозрачности требует пересборки (программы кэшируются, второй раз дёшево)
  const setTrans = (m, t) => { if (m.transparent !== t) { m.transparent = t; m.depthWrite = !t; m.needsUpdate = true; } };
  const approach = (v, to, d) => (v === to ? v : to > v ? Math.min(to, v + d) : Math.max(to, v - d));

  // ---------- геометрия деталей ----------
  // невыпуклых граней нет: ориентация треугольников выправляется по центроиду, нормали плоские
  function partGeometry(part, uo, isPly) {
    const P = part.verts.map((p) => V(p[0], p[1], p[2]));
    const c = new T.Vector3();
    for (const p of P) c.add(p);
    c.divideScalar(P.length);
    const e1 = new T.Vector3(), e2 = new T.Vector3(), tris = [];
    for (const f of part.faces) {
      let A = P[f[0]], B = P[f[1]], C = P[f[2]];
      const n = new T.Vector3().crossVectors(e1.subVectors(B, A), e2.subVectors(C, A));
      const area = n.length();
      if (area < 1e-12) continue;
      n.divideScalar(area);
      if (n.dot(e1.subVectors(A, c)) < 0) { const t = B; B = C; C = t; n.negate(); }
      tris.push({ A, B, C, n, area });
    }
    let N = null;
    if (isPly) {
      let best = null;
      for (const t of tris) if (t.n.y > 0 && (!best || t.area > best.area)) best = t;
      N = best ? best.n : new T.Vector3(0, 1, 0);
    }
    const groups = [[], []];
    for (const t of tris) groups[isPly && Math.abs(t.n.dot(N)) < 0.9 ? 1 : 0].push(t);
    const n3 = (groups[0].length + groups[1].length) * 9, abs = new Float32Array(n3), uv = new Float32Array((n3 / 3) * 2);
    let pi = 0, ui = 0;
    const P0 = P[0];
    const out = (grp, gi) => {
      for (const t of grp) {
        const ax = Math.abs(t.n.x), ay = Math.abs(t.n.y), az = Math.abs(t.n.z);
        for (const p of [t.A, t.B, t.C]) {
          abs[pi++] = p.x; abs[pi++] = p.y; abs[pi++] = p.z;
          if (gi === 1) { uv[ui++] = (ax >= az ? p.z : p.x) + uo[0]; uv[ui++] = tmpV.subVectors(p, P0).dot(N) / 0.018; }
          else if (ay >= ax && ay >= az) { uv[ui++] = p.z + uo[0]; uv[ui++] = p.x + uo[1]; }
          else if (ax >= az) { uv[ui++] = p.z + uo[0]; uv[ui++] = p.y + uo[1]; }
          else { uv[ui++] = p.x + uo[0]; uv[ui++] = p.y + uo[1]; }
        }
      }
    };
    out(groups[0], 0); out(groups[1], 1);
    return { abs, uv, center: c, g0: groups[0].length * 3, g1: groups[1].length * 3 };
  }
  function writePositions(q, absArr, center) {
    const a = q.geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) { a[i] = absArr[i] - center.x; a[i + 1] = absArr[i + 1] - center.y; a[i + 2] = absArr[i + 2] - center.z; }
    q.geo.attributes.position.needsUpdate = true;
    q.geo.computeVertexNormals();
    q.geo.computeBoundingSphere();
  }
  function rebuildEdges(q) {
    const old = q.edges.geometry;
    q.edges.geometry = new T.EdgesGeometry(q.geo, 25);
    old.dispose();
  }

  // ---------- окружение: наклонная плита + ступень ----------
  function convexMesh(verts, faces, mat) {
    const P = verts.map((p) => V(p[0], p[1], p[2]));
    const c = new T.Vector3(); for (const p of P) c.add(p); c.divideScalar(P.length);
    const pos = [], uv = [], e1 = new T.Vector3(), e2 = new T.Vector3();
    for (const f of faces) for (let i = 1; i < f.length - 1; i++) {
      let A = P[f[0]], B = P[f[i]], C = P[f[i + 1]];
      const n = new T.Vector3().crossVectors(e1.subVectors(B, A), e2.subVectors(C, A)).normalize();
      if (n.dot(e1.subVectors(A, c)) < 0) { const t = B; B = C; C = t; n.negate(); }
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      for (const p of [A, B, C]) {
        pos.push(p.x, p.y, p.z);
        if (ay >= ax && ay >= az) uv.push(p.x, p.z); else if (ax >= az) uv.push(p.z, p.y); else uv.push(p.x, p.y);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return new T.Mesh(g, mat);
  }
  function roundedBlock(sx, sy, sz, rad, bev) {
    const s = new T.Shape(), w = sx - 2 * bev, d = sz - 2 * bev, r = Math.max(0.002, rad - bev), x0 = -w / 2, y0 = -d / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + d - r); s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
    s.lineTo(x0 + r, y0 + d); s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new T.ExtrudeGeometry(s, { depth: sy - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 6 });
    g.translate(0, 0, bev);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  // мягкая контактная тень: размытые силуэты на холсте (shadowBlur работает и в Safari)
  function blobTexture(wpx, hpx, blur, draw) {
    const c = mkCanvas(wpx, hpx), g = c.getContext("2d"), off = wpx * 3;
    g.shadowColor = "rgba(0,0,0,1)"; g.shadowBlur = blur; g.shadowOffsetX = off;
    g.fillStyle = "#000";
    g.translate(-off, 0);
    draw(g);
    const t = new T.CanvasTexture(c);
    t.flipY = false;
    return t;
  }
  // четырёхугольник c = [(x0,y0),(x0,y1),(x1,y1),(x1,y0)]: u по Y рампы (столбцы холста), v по X (строки)
  function quadGeo(c) {
    const P = c.map((p) => V(p[0], p[1], p[2]));
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]], idx = [0, 2, 1, 0, 3, 2];
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(idx.flatMap((i) => [P[i].x, P[i].y, P[i].z]), 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(idx.flatMap((i) => uvs[i]), 2));
    g.computeVertexNormals();
    return g;
  }
  function lineSet(pairs, mat) {
    const a = [];
    for (const [p, q] of pairs) { const A = V(p[0], p[1], p[2]), B = V(q[0], q[1], q[2]); a.push(A.x, A.y, A.z, B.x, B.y, B.z); }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(a, 3));
    const l = new T.LineSegments(g, mat);
    l.renderOrder = 5;
    return l;
  }

  let floorY = 0, rampLen = 0;
  function buildContext() {
    const p = model.params, g = (p.hl - p.hr) / W;
    const len = Math.max(model.dims.left.ground, model.dims.right.ground, model.base);
    rampLen = len;
    const e = 170, D = 400, xb = -D, xf = len + 240, y0 = -e, y1 = W + e;
    const gz = (y) => g * y;
    const zb = Math.min(gz(y0), gz(y1)) - 45;
    floorY = zb / 1000;
    // плита: ровное основание, верх наклонён как земля — перекос виден по торцам
    const sv = [[xb, y0, zb], [xf, y0, zb], [xf, y1, zb], [xb, y1, zb], [xb, y0, gz(y0)], [xf, y0, gz(y0)], [xf, y1, gz(y1)], [xb, y1, gz(y1)]];
    const slab = convexMesh(sv, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], concreteSlab);
    slab.receiveShadow = true; slab.castShadow = true;
    ctxG.add(slab);
    // ступень: верх ровный на уровне порога, низ утоплен в плиту
    const ins = 18, sy0 = y0 + ins, sy1 = y1 - ins, sx0 = xb + ins;
    const sb = Math.min(gz(sy0), gz(sy1)) - 30;
    const step = new T.Mesh(roundedBlock((sy1 - sy0) / 1000, (p.hl - sb) / 1000, -sx0 / 1000, 0.022, 0.0045), concreteStep);
    step.position.copy(V(sx0 / 2, (sy0 + sy1) / 2, sb));
    step.receiveShadow = true; step.castShadow = true;
    ctxG.add(step);
    // пол-ловушка теней (невидим, кроме тени) + мягкая тень плиты
    const floor = new T.Mesh(new T.PlaneGeometry(30, 30), shadowMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY + 0.0002; floor.receiveShadow = true;
    ctxG.add(floor);
    const M = 420, fx0 = xb - M, fx1 = xf + M, fy0 = y0 - M, fy1 = y1 + M;
    const fw = 256, fh = Math.max(32, Math.round((fw * (fx1 - fx0)) / (fy1 - fy0)));
    const sxp = fw / (fy1 - fy0), syp = fh / (fx1 - fx0);
    if (floorBlob.map) floorBlob.map.dispose();
    floorBlob.map = blobTexture(fw, fh, 80 * sxp, (c) => { c.fillRect((y0 - fy0) * sxp, (xb - fx0) * syp, (y1 - y0) * sxp, (xf - xb) * syp); });
    floorBlob.needsUpdate = true;
    const fb = new T.Mesh(quadGeo([[fx0, fy0, zb + 0.4], [fx0, fy1, zb + 0.4], [fx1, fy1, zb + 0.4], [fx1, fy0, zb + 0.4]]), floorBlob);
    fb.renderOrder = 1;
    ctxG.add(fb);
    // контактная тень пандуса и ступени на плите
    const pw = 512, ph = Math.max(64, Math.round((pw * (xf - xb)) / (y1 - y0)));
    const px = pw / (y1 - y0), py = ph / (xf - xb);
    const ply = model.parts.find((q) => q.id === "ply");
    const foot = ply ? [ply.verts[0], ply.verts[1], ply.verts[5], ply.verts[4]] : [];
    if (rampBlob.map) rampBlob.map.dispose();
    rampBlob.map = blobTexture(pw, ph, 22 * px, (c) => {
      c.globalAlpha = 0.9;
      c.fillRect(0, 0, pw, -xb * py);
      c.globalAlpha = 1;
      if (foot.length) {
        const path = () => { c.beginPath(); foot.forEach((v, i) => { const X = (v[1] - y0) * px, Y = (v[0] - xb) * py; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
        path(); c.fill();
        // внутри следа тень не нужна (её закрывает сам пандус, а в X-Ray и разрезе она мешает): оставляем только ореол
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.shadowColor = "transparent"; c.globalCompositeOperation = "destination-out"; c.globalAlpha = 0.92;
        path(); c.fill();
      }
    });
    rampBlob.needsUpdate = true;
    const ab = new T.Mesh(quadGeo([[xb, y0, gz(y0) + 0.5], [xb, y1, gz(y1) + 0.5], [xf, y1, gz(y1) + 0.5], [xf, y0, gz(y0) + 0.5]]), rampBlob);
    ab.renderOrder = 1;
    ctxG.add(ab);
    // контуры плиты и ступени для Blueprint
    const S = (x, y, z) => [x, y, z];
    ctxG.add(lineSet([
      [S(xb, y0, zb), S(xf, y0, zb)], [S(xf, y0, zb), S(xf, y1, zb)], [S(xf, y1, zb), S(xb, y1, zb)], [S(xb, y1, zb), S(xb, y0, zb)],
      [S(xb, y0, gz(y0)), S(xf, y0, gz(y0))], [S(xf, y0, gz(y0)), S(xf, y1, gz(y1))], [S(xf, y1, gz(y1)), S(xb, y1, gz(y1))], [S(xb, y1, gz(y1)), S(xb, y0, gz(y0))],
      [S(xb, y0, zb), S(xb, y0, gz(y0))], [S(xf, y0, zb), S(xf, y0, gz(y0))], [S(xf, y1, zb), S(xf, y1, gz(y1))], [S(xb, y1, zb), S(xb, y1, gz(y1))],
      [S(sx0, sy0, p.hl), S(0, sy0, p.hl)], [S(0, sy0, p.hl), S(0, sy1, p.hl)], [S(0, sy1, p.hl), S(sx0, sy1, p.hl)], [S(sx0, sy1, p.hl), S(sx0, sy0, p.hl)],
      [S(0, sy0, gz(sy0)), S(0, sy0, p.hl)], [S(0, sy1, gz(sy1)), S(0, sy1, p.hl)], [S(sx0, sy0, gz(sy0)), S(sx0, sy0, p.hl)], [S(sx0, sy1, gz(sy1)), S(sx0, sy1, p.hl)],
      [S(0, sy0, gz(sy0)), S(0, sy1, gz(sy1))],
    ], outlineMat));
    // сетка пола для Blueprint
    const grid = new T.Mesh(new T.PlaneGeometry(14, 14), gridMat);
    grid.rotation.x = -Math.PI / 2; grid.position.set(0, floorY + 0.0006, len / 2000); grid.renderOrder = 2;
    ctxG.add(grid);
    gridMat.uniforms.uC.value.set(0, len / 2000);
    gridMat.uniforms.uR.value = Math.max(2.2, len / 1000 + 1.6);
    // теневая камера по габаритам плиты
    const cz = (xb + xf) / 2000, ext = Math.max((y1 - y0) / 1000, (xf - xb) / 1000) * 0.62 + 0.25;
    key.target.position.set(0, 0, cz);
    placeKey();
    Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 11 });
    key.shadow.camera.updateProjectionMatrix();
  }
  function placeKey() { key.position.copy(key.target.position).addScaledVector(keyDir, 5); }

  // ---------- лазерные размеры ----------
  // группа 'h' — высоты в точках А и Б (видны и на шаге «замер»), 'o' — ширина и длины по земле
  let prevVals = null;
  function buildLasers() {
    const p = model.params, d = model.dims, g = (p.hl - p.hr) / W;
    lasers = [];
    const seen = new Set();
    const seg = (a, b, grp, dot) => {
      const A = V(a[0], a[1], a[2]), B = V(b[0], b[1], b[2]);
      const mid = new T.Vector3().addVectors(A, B).multiplyScalar(0.5), len = A.distanceTo(B);
      const q = new T.Quaternion().setFromUnitVectors(tmpV2.set(0, 1, 0), tmpV.subVectors(B, A).normalize());
      const core = new T.Mesh(unitCyl, laserCore), halo = new T.Mesh(unitCyl, laserHalo);
      for (const m of [core, halo]) { m.position.copy(mid); m.quaternion.copy(q); m.renderOrder = 20; m.frustumCulled = false; laserG.add(m); }
      lasers.push({ core, halo, len, k: 1, grp });
      if (dot) for (const P of [A, B]) {
        const s = new T.Mesh(unitSph, laserCore); s.position.copy(P); s.renderOrder = 21; s.frustumCulled = false; laserG.add(s);
        lasers.push({ core: s, halo: null, len: 0, k: 2.4, grp });
      }
    };
    const tick = (at, ax, L, grp) => seg([at[0] - ax[0] * L, at[1] - ax[1] * L, at[2] - ax[2] * L], [at[0] + ax[0] * L, at[1] + ax[1] * L, at[2] + ax[2] * L], grp, false);
    const tag = (keyName, at, text, grp, letter) => {
      seen.add(keyName);
      let L = labelsByKey[keyName];
      if (!L) {
        const el = document.createElement("div");
        el.className = "gs-dim";
        const b = document.createElement("span");
        Object.assign(b.style, { color: "#EF705D", fontWeight: "700", marginRight: "5px" });
        const t = document.createTextNode("");
        el.append(b, t);
        overlay.appendChild(el);
        L = labelsByKey[keyName] = { el, b, t, at: new T.Vector3(), x: -1e4, y: -1e4, op: -1, sc: 1, pulse: 0, grp, text: null };
      }
      L.grp = grp;
      L.b.textContent = letter || "";
      L.b.style.display = letter ? "" : "none";
      if (L.text !== text) {
        if (L.text != null && prevVals) L.pulse = 1;
        L.t.nodeValue = text; L.text = text;
      }
      V(at[0], at[1], at[2], L.at);
    };
    // высоты А и Б — там, где их меряют: в линии примыкания к ступени (x = 0), на краях пандуса (y = 0 и y = W),
    // от земли до верха ступени. Без выноса вперёд, чтобы картинка не сбивала с толку (Алхас, 2026-11-05).
    const ex = 1.5, ey = 2;
    seg([ex, -ey, -g * ey], [ex, -ey, p.hl], "h", true);
    tick([ex, -ey, -g * ey], [1, 0, 0], 12, "h"); tick([ex, -ey, p.hl], [1, 0, 0], 12, "h");
    tag("A", [ex + 30, -ey - 70, p.hl * 0.55], fmt(p.hl), "h", "А");
    seg([ex, W + ey, g * (W + ey)], [ex, W + ey, p.hl], "h", true);
    tick([ex, W + ey, g * (W + ey)], [1, 0, 0], 12, "h"); tick([ex, W + ey, p.hl], [1, 0, 0], 12, "h");
    tag("B", [ex + 30, W + ey + 70, g * W + (p.hl - g * W) * 0.55], fmt(p.hr), "h", "Б");
    // ширина по краю ступени
    const zw = p.hl + 3, xw = -32;
    seg([xw, 0, zw], [xw, W, zw], "o", false);
    tick([xw, 0, zw], [1, 0, 0], 18, "o"); tick([xw, W, zw], [1, 0, 0], 18, "o");
    tag("W", [xw - 70, W / 2, zw], fmt(p.width), "o");
    // длина по земле вдоль боковин
    const gy = 82;
    seg([0, -gy, -g * gy + 3], [d.left.ground, -gy, -g * gy + 3], "o", false);
    tick([0, -gy, -g * gy + 3], [0, 1, 0], 18, "o"); tick([d.left.ground, -gy, -g * gy + 3], [0, 1, 0], 18, "o");
    tag("GL", [d.left.ground / 2, -gy - 95, g * (-gy - 95)], String(d.left.ground), "o");
    if (model.kind === "skew") {
      const yr = W + gy;
      seg([0, yr, g * yr + 3], [d.right.ground, yr, g * yr + 3], "o", false);
      tick([0, yr, g * yr + 3], [0, 1, 0], 18, "o"); tick([d.right.ground, yr, g * yr + 3], [0, 1, 0], 18, "o");
      tag("GR", [d.right.ground / 2, yr + 95, g * (yr + 95)], String(d.right.ground), "o");
    }
    for (const k of Object.keys(labelsByKey)) if (!seen.has(k)) { labelsByKey[k].el.remove(); delete labelsByKey[k]; }
    prevVals = true;
    styleLabels();
  }
  function styleLabels() {
    const dark = theme === "dark", bp = bK.to > 0.5, narrow = (container.clientWidth || 1000) < 600;
    for (const L of Object.values(labelsByKey)) Object.assign(L.el.style, {
      position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", willChange: "transform, opacity",
      padding: narrow ? "4px 9px" : "5px 11px", borderRadius: "999px",
      font: `600 ${narrow ? 12 : 13}px/1.15 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Golos Text", "Segoe UI", system-ui, sans-serif`,
      letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums",
      color: bp ? "#F2F7FF" : dark ? "#F5F5F7" : "#1D1D1F",
      background: bp ? "rgba(10,40,100,0.55)" : dark ? "rgba(44,44,48,0.66)" : "rgba(255,255,255,0.72)",
      border: bp ? "0.5px solid rgba(220,235,255,0.45)" : dark ? "0.5px solid rgba(255,255,255,0.12)" : "0.5px solid rgba(0,0,0,0.06)",
      boxShadow: dark || bp ? "0 6px 20px rgba(0,0,0,0.28)" : "0 1px 2px rgba(0,0,0,0.05), 0 6px 18px rgba(28,28,40,0.10)",
      backdropFilter: "blur(16px) saturate(180%)", WebkitBackdropFilter: "blur(16px) saturate(180%)",
      transition: "background-color .3s, color .3s, border-color .3s",
    });
  }

  // ---------- детали: создание, плавная смена формы, удаление ----------
  const ORDER = { ply: 0, rear: 1, rib: 2, left: 3, right: 3 };
  const STEP_OF = { left: 2, right: 2, rear: 3, rib: 4, ply: 5 };
  const STEP_IDS = ["measure", "sides", "rear", "rib", "ply", "finish"];
  const MAX_ORDER = 3, ST = 0.26;
  const stagger = (dv, order) => clamp(dv * (1 + MAX_ORDER * ST) - order * ST, 0, 1);

  function setSecDefine(m) {
    const want = sectionOn && renderer.capabilities.isWebGL2;
    m.defines = m.defines || {};
    if (want && !("GS_SEC" in m.defines)) { m.defines.GS_SEC = ""; m.needsUpdate = true; }
    else if (!want && "GS_SEC" in m.defines) { delete m.defines.GS_SEC; m.needsUpdate = true; }
  }
  function makePart(part, built) {
    const isPly = part.mat === "ply";
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(new Float32Array(built.abs.length), 3));
    geo.setAttribute("uv", new T.BufferAttribute(built.uv, 2));
    geo.addGroup(0, built.g0, 0);
    if (built.g1) geo.addGroup(built.g0, built.g1, 1);
    const raw = isPly ? [rawMat(TX.birch, 0.6, CAP_PLY), rawMat(TX.birchEdge, 0.72, CAP_PLY)] : [rawMat(TX.pine, 0.64, CAP_PINE)];
    const pnt = isPly ? [paintMat(paint || "#102C54", true, CAP_PLY), paintMat(paint || "#102C54", false, CAP_PLY)] : [paintMat(paint || "#102C54", false, CAP_PINE)];
    for (const m of [...raw, ...pnt]) setSecDefine(m);
    const mesh = new T.Mesh(geo, paint ? pnt : raw);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = secDepth;
    mesh.userData.id = part.id;
    const skin = new T.Mesh(geo, pnt);                 // слой краски для шторки покраски
    skin.visible = false;
    mesh.add(skin);
    const edgeMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const edges = new T.LineSegments(new T.BufferGeometry(), edgeMat);
    edges.visible = false; edges.renderOrder = 6;
    mesh.add(edges);
    partsG.add(mesh);
    const q = {
      id: part.id, mesh, skin, geo, edges, edgeMat, raw, pnt, text: null, textMat: null, isPly,
      count: built.abs.length, g1: built.g1, center: built.center.clone(), ex: null, order: ORDER[part.id] ?? 1,
      ph: (hash(part.id) % 1000) / 160, s: drive > 0 ? stagger(drive, ORDER[part.id] ?? 1) : 0, v: 0,
      sel: 0, dim: 0, ghost: 0, vis: 1, morph: null, textZ: 0,
    };
    writePositions(q, built.abs, q.center);
    rebuildEdges(q);
    return q;
  }
  function destroyPart(q) {
    partsG.remove(q.mesh);
    q.geo.dispose(); q.edges.geometry.dispose(); q.edgeMat.dispose();
    for (const m of [...q.raw, ...q.pnt]) m.dispose();
    if (q.text) { q.text.geometry.dispose(); q.textMat.dispose(); }
  }
  // Надпись на верхней поверхности настила (Алхас, 2026-11-05): вдоль ската снизу вверх, у левого края,
  // если смотреть на дверь (край А). Верх настила — плоскость z = c − a·x, вдоль ширины горизонтальна.
  function plyStencil(part) {
    const v = part.verts;                                   // [низ у порога, низ у земли, верх у земли, верх у порога] × (y=0, y=W)
    if (!v || v.length < 8) return null;
    const y0 = v[0][1], y1 = v[4][1], wy = Math.abs(y1 - y0);
    const back = v[3], a = (v[3][2] - v[2][2]) / (v[2][0] - v[3][0]);
    if (!(a > 0)) return null;
    const sN = Math.hypot(1, a);
    const runAt = (y) => v[2][0] + (v[6][0] - v[2][0]) * (y - y0) / (y1 - y0) - back[0];
    const margin = 70;                                      // от левого края: боковина 40 + запас
    // длина надписи по скату и высота букв поперёк, на коротком пандусе — меньше
    let w = Math.min(runAt(y0 + margin) * sN * 0.72, 520), h = w / TEXT_ASPECT;
    if (h > wy * 0.16) { h = wy * 0.16; w = h * TEXT_ASPECT; }
    if (!(h > 6)) return null;
    const y = y0 + margin + h / 2, run = runAt(y), off = 0.8;
    const x = back[0] + run * 0.5, z = back[2] - a * run * 0.5;
    return { x: x + off * a / sN, y, z: z + off / sN, w, h, a, sN };
  }
  function setStencil(q, part) {
    if (q.text) { q.mesh.remove(q.text); q.text.geometry.dispose(); q.textMat.dispose(); q.text = null; q.textMat = null; }
    if (part.id !== "ply") return;
    const st0 = plyStencil(part);
    if (!st0) return;
    const s = { cx: st0.x, y: st0.y, cz: st0.z, w: st0.w, h: st0.h };
    q.textMat = textMat.clone();
    q.text = new T.Mesh(new T.PlaneGeometry(s.w / 1000, s.h / 1000), q.textMat);
    {                                                        // строка вверх по скату, верх букв — к левому краю
      const X = new T.Vector3(0, st0.a / st0.sN, -1 / st0.sN), Y = new T.Vector3(-1, 0, 0), Z = new T.Vector3().crossVectors(X, Y);
      q.text.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
    }
    q.text.renderOrder = 3;
    q.text.userData.local = V(s.cx, s.y, s.cz);           // абсолютная точка, локальная считается от текущего центра
    q.textZ = s.cx / 1000;
    q.mesh.add(q.text);
    placeText(q);
  }
  function placeText(q) { if (q.text) q.text.position.copy(q.text.userData.local).sub(q.center); }

  function setModel(m) {
    if (!m || !m.parts || !m.params) return;
    const first = !model;
    model = m;
    W = m.params.width;
    disposeTree(ctxG); disposeTree(laserG);
    const p = m.params, hM = Math.max(p.hl, p.hr) / 1000, Wm = W / 1000, Lm = m.base / 1000;
    const EX = {
      ply: { d: [0, hM + 0.11, 0.035 + Lm * 0.04], r: [-0.035, 0, 0] },
      rear: { d: [0, hM * 0.85 + 0.075, -0.14], r: [-0.1, 0, 0] },
      rib: { d: [0, hM * 0.5 + 0.05, 0.05 + Lm * 0.1], r: [0, 0, 0.045] },
      left: { d: [-(0.12 + Wm * 0.1), 0.025 + hM * 0.15, 0.02], r: [0, 0, 0.07] },
      right: { d: [0.12 + Wm * 0.1, 0.025 + hM * 0.15, 0.02], r: [0, 0, -0.07] },
    };
    dolly.lift = hM * 0.55 + 0.06;
    const next = [], seen = new Set();
    for (const part of m.parts) {
      seen.add(part.id);
      const h = hash(part.id), uo = [(h % 997) / 331, ((h >>> 10) % 997) / 331];
      const built = partGeometry(part, uo, part.mat === "ply");
      let q = partsById[part.id];
      if (q && q.count === built.abs.length && q.g1 === built.g1) {
        // та же топология: плавно перетекаем из текущей формы в новую
        const cur = q.morph ? q.morph.cur : new Float32Array(q.count);
        if (!q.morph) { const a = q.geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) { cur[i] = a[i] + q.center.x; cur[i + 1] = a[i + 1] + q.center.y; cur[i + 2] = a[i + 2] + q.center.z; } }
        q.geo.attributes.uv.array.set(built.uv);
        q.geo.attributes.uv.needsUpdate = true;
        if (first || reduce || !last) {
          q.center.copy(built.center); writePositions(q, built.abs, q.center); rebuildEdges(q); q.morph = null;
        } else {
          q.morph = { from: Float32Array.from(cur), to: built.abs, cur, c0: q.center.clone(), c1: built.center.clone(), t: 0 };
        }
      } else {
        if (q) destroyPart(q);
        q = partsById[part.id] = makePart(part, built);
      }
      q.ex = EX[part.id] || { d: [0, 0.1, 0], r: [0, 0, 0] };
      setStencil(q, part);
      if (q.morph) q.text && q.text.position.copy(q.text.userData.local).sub(q.morph.c1);
      next.push(q);
    }
    for (const id of Object.keys(partsById)) if (!seen.has(id)) { destroyPart(partsById[id]); delete partsById[id]; }
    parts = next;
    buildContext();
    buildLasers();
    lookDirty = true;
    renderer.shadowMap.needsUpdate = true;
    applyParts(0);
    if (stepN != null) frameStep(stepN); else if (isoId) frameIso(); else frameCamera(false, first);
    needsRender = true;
  }
  function stepMorphs(dt) {
    let active = false;
    for (const q of parts) {
      const mo = q.morph;
      if (!mo) continue;
      mo.t = Math.min(1, mo.t + dt / 0.35);
      const e = ease(mo.t);
      q.center.lerpVectors(mo.c0, mo.c1, e);
      for (let i = 0; i < mo.cur.length; i++) mo.cur[i] = mo.from[i] + (mo.to[i] - mo.from[i]) * e;
      writePositions(q, mo.cur, q.center);
      if (mo.t >= 1) { q.morph = null; rebuildEdges(q); placeText(q); }
      active = true;
    }
    return active;
  }
  function disposeTree(g) {
    for (const o of [...g.children]) {
      disposeTree(o);
      g.remove(o);
      if (o.geometry && o.geometry !== unitCyl && o.geometry !== unitSph) o.geometry.dispose();
    }
  }

  // ---------- камера ----------
  const DEG = Math.PI / 180;
  const VIEWS = {
    hero: { az: 36, el: 24 },
    1: { az: 8, el: 20, tz: 0.15, ty: 0.6 },
    2: { az: 74, el: 14, tz: 0.45 },
    3: { az: 16, el: 9, tz: 0.12, ty: 0.5 },
    4: { az: 28, el: 46, tz: 0.4 },
    5: { az: 34, el: 36, tz: 0.42 },
    6: { az: 38, el: 23 },
  };
  function rampBounds() {
    const p = model.params, Lm = Math.max(model.dims.left.ground, model.dims.right.ground) / 1000, Hm = Math.max(p.hl, p.hr) / 1000;
    return { Lm, Wm: W / 1000, Hm, R: 0.5 * Math.hypot(W / 1000 + 0.2, Lm + 0.3, Hm + 0.08) };
  }
  function viewTo(az, el, target, R, scale, dur, glide) {
    const w = container.clientWidth || 1, h = container.clientHeight || 1, aspect = w / h, narrow = w < 600;
    const vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const dist = (R / Math.sin(Math.min(vf, hf) / 2)) * scale * (narrow ? 1.28 : 1);
    camAnim.t1.copy(target);
    camAnim.p1.set(target.x + Math.sin(az * DEG) * Math.cos(el * DEG) * dist, target.y + Math.sin(el * DEG) * dist, target.z + Math.cos(az * DEG) * Math.cos(el * DEG) * dist);
    startCam(dur, glide);
  }
  function startCam(dur, glide) {
    camAnim.light = false;
    if (glide && !reduce) {
      // первый показ: медленный подлёт камеры и проход света
      const off = tmpV.subVectors(camAnim.p1, camAnim.t1);
      const sph = new T.Spherical().setFromVector3(off);
      sph.theta -= 0.62; sph.phi = Math.max(0.35, sph.phi - 0.2); sph.radius *= 1.55;
      camera.position.copy(camAnim.t1).add(tmpV.setFromSpherical(sph));
      controls.target.copy(camAnim.t1).add(tmpV2.set(0, 0.05, 0));
      camAnim.p0.copy(camera.position); camAnim.t0.copy(controls.target);
      camAnim.t = 0; camAnim.dur = 1.8; camAnim.out = true; camAnim.light = true; camAnim.on = true;
      return;
    }
    if (!last || reduce) { camera.position.copy(camAnim.p1); controls.target.copy(camAnim.t1); camAnim.on = false; controls.update(); return; }
    camAnim.p0.copy(camera.position); camAnim.t0.copy(controls.target);
    camAnim.t = 0; camAnim.dur = dur || 0.75; camAnim.out = false; camAnim.on = true;
  }
  function frameCamera(force, glide) {
    if (!model) return;
    const b = rampBounds(), narrow = (container.clientWidth || 1) < 600;
    const target = tmpV2.set(0, b.Hm * 0.3, b.Lm * 0.42).clone();
    const refit = force || glide || !framedR || Math.abs(b.R / framedR - 1) > 0.25 || narrow !== framedNarrow;
    if (refit) {
      framedR = b.R; framedNarrow = narrow; userMoved = false;
      viewTo(VIEWS.hero.az, VIEWS.hero.el, target, b.R, 0.8, 0.8, glide);
    } else {
      camAnim.t1.copy(target);
      camAnim.p1.copy(camera.position).add(tmpV.subVectors(target, controls.target));
      startCam(0.5);
    }
    needsRender = true;
  }
  function frameStep(n) {
    const b = rampBounds(), v = VIEWS[n] || VIEWS.hero;
    const target = new T.Vector3(0, b.Hm * (v.ty ?? 0.3), b.Lm * (v.tz ?? 0.42));
    viewTo(v.az, v.el, target, b.R, n === 2 || n === 3 ? 0.92 : 1.1, 1.0);
    framedR = b.R; userMoved = false;
  }
  function frameIso() {
    const q = partsById[isoId];
    if (!q) return;
    q.mesh.updateMatrixWorld();
    const c = q.geo.boundingSphere.center.clone().applyMatrix4(q.mesh.matrixWorld);
    viewTo(VIEWS.hero.az, 26, c, Math.max(0.12, q.geo.boundingSphere.radius), 1.15, 0.9);
    userMoved = false;
  }
  controls.addEventListener("start", () => { userMoved = true; if (camAnim.on && camAnim.light) { keyDir.copy(KEY_DIR); placeKey(); renderer.shadowMap.needsUpdate = true; } camAnim.on = false; });
  controls.addEventListener("change", () => { needsRender = true; });

  // ---------- внешний вид кадра (без аллокаций) ----------
  const paintActive = () => !!paint && (stepN == null || stepN >= 6);
  function applyLook() {
    const x = xK.v, b = bK.v, th = thK.v, sec = secK.v;
    bgU.uA.value.copy(THEMES.light.a).lerp(THEMES.dark.a, th).lerp(THEMES.bp.a, b);
    bgU.uB.value.copy(THEMES.light.b).lerp(THEMES.dark.b, th).lerp(THEMES.bp.b, b);
    key.intensity = KEY_I * (1 - 0.15 * th) * (1 - b) * (camAnim.light ? 0.55 + 0.45 * easeOut(camAnim.t) : 1);
    hemi.intensity = (lite || !envTex ? HEMI_NOENV : HEMI_ENV) * (1 - 0.5 * b);
    let cast = x < 0.5 && b < 0.5;
    for (const q of parts) {
      const sel = q.sel, dim = q.dim, gh = q.ghost, vis = q.vis;
      let op = 1 + ((q.isPly ? 0.16 : 1) - 1) * x;          // X-Ray: настил стеклом, каркас под ним виден целиком
      op = op + (0.05 - op) * b;
      op = Math.min(op, 1 + (0.07 - 1) * gh) * vis;
      const trans = op < 0.995;
      const fres = trans ? Math.max(x * 0.55, b * 0.3, gh * 0.25) * vis : 0;
      tmpC.copy(C_RIM_X).lerp(C_RIM_B, b).lerp(C_CORAL, sel);
      const rim = Math.max(x * 0.35, b * 0.4, sel * 0.7) * vis;
      for (let si = 0; si < 2; si++) for (const m of si ? q.pnt : q.raw) {
        const u = m.userData.u;
        m.opacity = op; setTrans(m, trans);
        u.uFres.value = fres;
        u.uRimCol.value.copy(tmpC);
        u.uRim.value = rim;
        u.uCap.value = sec > 0.01 && !trans ? 1 : 0;
        u.uCapCol.value.copy(paintActive() || sweep.on ? (q.isPly ? CAP_PAINT_PLY : CAP_PAINT_PINE) : (q.isPly ? CAP_RAW_PLY : CAP_RAW_PINE));
        m.color.copy(m.userData.base).lerp(GLASS, x * (1 - b) * (q.isPly ? 0.85 : 0.12)).multiplyScalar(1 - 0.32 * dim);
        m.emissive.copy(C_CORAL).multiplyScalar(0.42 * sel);
      }
      const eo = Math.max(x * 0.6, b * 0.95, sel * 0.9, gh * 0.45) * vis;
      q.edges.visible = eo > 0.01;
      if (q.edges.visible) {
        q.edgeMat.opacity = eo;
        q.edgeMat.color.copy(th > 0.5 ? C_XR_D : C_XR_L).lerp(C_GH_L, gh * (1 - x)).lerp(C_BP, b).lerp(C_CORAL, sel);
        if (th > 0.5 && gh > 0) q.edgeMat.color.lerp(C_GH_D, gh * (1 - b));
      }
      if (q.text) {
        let to = paintActive() ? 1 : 0;
        if (sweep.on) to = clamp((sweep.z - q.textZ) / 0.08, 0, 1) * (paint ? 1 : 0);
        to *= (1 - x) * (1 - b) * (1 - 0.5 * dim) * (1 - gh) * vis * (1 - sec);
        q.text.visible = to > 0.01;
        q.textMat.opacity = to * 0.94;
      }
      const mv = vis > 0.01;
      if (q.mesh.visible !== mv) { q.mesh.visible = mv; renderer.shadowMap.needsUpdate = true; }
      // в VSM приёмники тоже попадают в карту теней: призраки и стекло не должны ни отбрасывать, ни принимать
      const c = cast && gh < 0.5 && vis > 0.5;
      if (q.mesh.castShadow !== c) { q.mesh.castShadow = c; q.mesh.receiveShadow = c; renderer.shadowMap.needsUpdate = true; }
    }
    for (const c of ctxMats) {
      c.m.color.copy(c.l).lerp(c.d, th);
      const op = 1 + (0.06 - 1) * b;
      c.m.opacity = op; setTrans(c.m, op < 0.995);
    }
    shadowMat.opacity = 0.13 * (1 - b) * (1 + 0.6 * th);
    let minVis = 1;
    for (const q of parts) minVis = Math.min(minVis, q.vis);
    floorBlob.opacity = blobs[0].base * (1 - b) * (1 + 0.5 * th);
    rampBlob.opacity = blobs[1].base * (1 - b) * (1 + 0.5 * th) * minVis * (1 - clamp(lastMaxS * 1.6, 0, 1));
    outlineMat.opacity = b * 0.55;
    gridMat.uniforms.uK.value = b;
    // разрез: плоскость выезжает справа к середине ширины
    const sx = sec > 0.001 ? 0.0005 + (1 - sec) * (W / 2000 + 0.08) : 1e4;
    if (sx !== SECTION_X.value) { SECTION_X.value = sx; renderer.shadowMap.needsUpdate = true; }
  }

  function applyParts(dt) {
    let active = false, maxS = 0;
    const zeta = reduce ? 1 : 0.58, k = 150, c = 2 * Math.sqrt(k) * zeta;
    for (const q of parts) {
      const goal = stepN != null || isoId ? 0 : stagger(drive, q.order);
      if (dt > 0) {
        const n = 3, h = dt / n;
        for (let i = 0; i < n; i++) { const a = k * (goal - q.s) - c * q.v; q.v += a * h; q.s += q.v * h; }
        if (Math.abs(goal - q.s) < 2e-4 && Math.abs(q.v) < 2e-4) { q.s = goal; q.v = 0; } else active = true;
      }
      const s = q.s, bw = reduce ? 0 : clamp(s, 0, 1);
      if (bw > 0.001) active = true;
      if (q.vis > 0.5 && q.ghost < 0.5) maxS = Math.max(maxS, Math.abs(s));
      const bob = Math.sin(time * 1.25 + q.ph) * 0.0055 * bw, ra = Math.sin(time * 0.9 + q.ph * 1.3) * 0.012 * bw, rb = Math.cos(time * 1.05 + q.ph) * 0.01 * bw;
      q.mesh.position.set(q.center.x + q.ex.d[0] * s, q.center.y + q.ex.d[1] * s + bob, q.center.z + q.ex.d[2] * s);
      q.mesh.rotation.set(q.ex.r[0] * s + ra, rb * 0.6, q.ex.r[2] * s + rb);
    }
    if (active) renderer.shadowMap.needsUpdate = true;
    return { active, maxS };
  }

  // лазеры: толщина постоянна на экране, при включении «прорисовываются» из центра
  let wantH = false, wantO = false, lastMaxS = 0;
  function applyLasers() {
    const dk = dimsK.v;
    laserG.visible = dk > 0.002;
    if (!laserG.visible) return;
    const dist = camera.position.distanceTo(controls.target);
    const r = dist * 0.00062 * (camera.fov / 30), e = reduce ? 1 : dk;
    for (const L of lasers) {
      const on = L.grp === "h" ? wantH : wantO;
      L.core.visible = on; if (L.halo) L.halo.visible = on;
      if (!on) continue;
      if (L.halo) {
        L.core.scale.set(r, Math.max(1e-5, L.len * e), r);
        L.halo.scale.set(r * 3.4, Math.max(1e-5, L.len * e), r * 3.4);
      } else L.core.scale.setScalar(r * L.k * e);
    }
    laserCore.opacity = dk;
    laserHalo.opacity = 0.2 * dk;
  }
  function placeLabels(dt) {
    const w = container.clientWidth, h = container.clientHeight;
    let active = false;
    for (const L of Object.values(labelsByKey)) {
      const op = dimsK.v * ((L.grp === "h" ? wantH : wantO) ? 1 : 0);
      if (L.pulse > 0) { L.pulse = Math.max(0, L.pulse - dt / 0.7); active = true; }
      if (op < 0.01) { if (L.op !== 0) { L.el.style.opacity = "0"; L.el.style.visibility = "hidden"; L.op = 0; } continue; }
      tmpV.copy(L.at).project(camera);
      const vis = tmpV.z < 1 && tmpV.z > -1;
      const x = Math.round(((tmpV.x + 1) / 2) * w), y = Math.round(((1 - tmpV.y) / 2) * h);
      const sc = reduce ? 1 : 1 + 0.16 * Math.sin(Math.PI * Math.min(1, (1 - L.pulse) * 1.4)) * (L.pulse > 0 ? 1 : 0);
      if (x !== L.x || y !== L.y || sc !== L.sc) {
        L.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
        L.x = x; L.y = y; L.sc = sc;
      }
      const ring = L.pulse > 0 ? `0 0 0 ${(2 * L.pulse).toFixed(2)}px rgba(239,112,93,${(0.55 * L.pulse).toFixed(2)})` : "";
      if (ring !== L.ring) { L.el.style.outline = ring ? `${(1.5 * L.pulse + 0.5).toFixed(2)}px solid rgba(239,112,93,${(0.7 * L.pulse).toFixed(2)})` : "none"; L.el.style.outlineOffset = "1px"; L.ring = ring; }
      const o = vis ? op : 0;
      if (Math.abs(o - L.op) > 0.004) { L.el.style.opacity = o.toFixed(3); L.el.style.visibility = o > 0.01 ? "visible" : "hidden"; L.op = o; }
    }
    return active;
  }

  // ---------- шторка покраски (шаг «finish») ----------
  function startSweep() {
    if (!paint) return;
    if (reduce) { for (const q of parts) q.mesh.material = q.pnt; return; }
    sweep.on = true; sweep.t = 0; sweep.z0 = -0.06; sweep.z1 = rampLen / 1000 + 0.08; sweep.z = sweep.z0;
    for (const q of parts) { q.mesh.material = q.raw; q.skin.visible = true; }
    setWipe(1);
  }
  function setWipe(on) {
    for (const q of parts) {
      for (const m of q.raw) { m.userData.u.uWipe.value.set(sweep.z, 1, on); }    // дерево: только z > шторки
      for (const m of q.pnt) { m.userData.u.uWipe.value.set(sweep.z, -1, on); }   // краска: только z < шторки
    }
  }
  function stepSweep(dt) {
    if (!sweep.on) return false;
    sweep.t = Math.min(1, sweep.t + dt / 1.1);
    sweep.z = sweep.z0 + (sweep.z1 - sweep.z0) * ease(sweep.t);
    // пнт: оставить z < шторки; дерево: z > шторки
    for (const q of parts) {
      for (const m of q.raw) m.userData.u.uWipe.value.x = sweep.z;
      for (const m of q.pnt) m.userData.u.uWipe.value.x = sweep.z;
    }
    lookDirty = true;
    if (sweep.t >= 1) endSweep();
    return true;
  }
  function endSweep() {
    sweep.on = false;
    setWipe(0);
    for (const q of parts) { q.skin.visible = false; q.mesh.material = paintActive() ? q.pnt : q.raw; }
    lookDirty = true;
  }

  function dollyIn() {
    if (dolly.k < 1e-3) return;
    dolly.on = true;
    dolly.pos.copy(camera.position); dolly.quat.copy(camera.quaternion);
    dolly.tg.copy(controls.target); dolly.tg.y += dolly.lift * dolly.k;
    camera.position.sub(controls.target).multiplyScalar(1 + 0.22 * dolly.k).add(dolly.tg);
    camera.lookAt(dolly.tg);
    camera.updateMatrixWorld();
  }
  function dollyOut() {
    if (!dolly.on) return;
    dolly.on = false;
    camera.position.copy(dolly.pos); camera.quaternion.copy(dolly.quat);
    camera.updateMatrixWorld();
  }

  // ---------- цикл ----------
  const PLAY_T = 5.6;
  let raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now; time += dt;
    let active = false, look = 0;
    if (playing && stepN == null) {
      const ph = (((now - playT0) / 1000) % PLAY_T) / PLAY_T;
      const t = ph < 0.3 ? ph / 0.3 : ph < 0.5 ? 1 : ph < 0.8 ? 1 - (ph - 0.5) / 0.3 : 0;
      tgt = t * t * (3 - 2 * t);
    }
    if (drive !== tgt) { drive = approach(drive, tgt, (playing ? 6 : 1.7) * dt); active = true; }
    if (playing && opts.onExplodeProgress) opts.onExplodeProgress(drive);
    if (stepMorphs(dt)) active = true;
    const pr = applyParts(dt);
    active = active || pr.active;
    if (Math.abs(pr.maxS - lastMaxS) > 1e-3) { lastMaxS = pr.maxS; look = 1; }
    const dk = stepN == null && !isoId ? clamp(pr.maxS, 0, 1.1) : 0;
    if (Math.abs(dk - dolly.k) > 1e-4) { dolly.k += (dk - dolly.k) * (1 - Math.exp(-dt * (reduce ? 30 : 5))); active = true; }
    // какие размеры показывать
    const settled = pr.maxS < 0.02;
    if (stepN === 1) { wantH = true; wantO = false; }
    else if (stepN != null && stepN < 6) { wantH = wantO = false; }
    else { wantH = wantO = dimsOn && settled && !isoId; }
    dimsK.to = wantH || wantO ? 1 : 0;
    look = look | stepTw(xK, dt) | stepTw(bK, dt) | stepTw(thK, dt) | stepTw(secK, dt);
    const dimsAnim = stepTw(dimsK, dt);
    const selOk = selected != null && !!partsById[selected];
    const rate = dt / (reduce ? 0.12 : 0.25), grate = dt / (reduce ? 0.12 : 0.35);
    for (const q of parts) {
      const st = STEP_OF[q.id] ?? 5;
      const sTo = q.id === selected ? 1 : 0, dTo = selOk && q.id !== selected && !isoId ? 1 : 0;
      const gTo = (stepN != null && stepN > 1 && st > stepN) || (isoId && partsById[isoId] && q.id !== isoId) ? 1 : 0;
      const vTo = stepN === 1 ? 0 : 1;
      if (q.sel !== sTo) { q.sel = approach(q.sel, sTo, rate); look = 1; }
      if (q.dim !== dTo) { q.dim = approach(q.dim, dTo, rate); look = 1; }
      if (q.ghost !== gTo) { q.ghost = approach(q.ghost, gTo, grate); look = 1; }
      if (q.vis !== vTo) { q.vis = approach(q.vis, vTo, grate); look = 1; }
    }
    if (stepSweep(dt)) active = true;
    if (camAnim.on) {
      camAnim.t = Math.min(1, camAnim.t + dt / camAnim.dur);
      const e = camAnim.out ? easeOut(camAnim.t) : ease(camAnim.t);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
      if (camAnim.light) {
        // свет проходит по пандусу: ключевой свет доворачивается в рабочее положение
        const a = (1 - e) * 1.1;
        keyDir.set(KEY_DIR.x * Math.cos(a) - KEY_DIR.z * Math.sin(a), KEY_DIR.y, KEY_DIR.x * Math.sin(a) + KEY_DIR.z * Math.cos(a));
        placeKey(); renderer.shadowMap.needsUpdate = true; look = 1;
      }
      if (camAnim.t >= 1) { camAnim.on = false; if (camAnim.light) { camAnim.light = false; keyDir.copy(KEY_DIR); placeKey(); look = 1; } }
      active = true;
    }
    if (look || lookDirty) { applyLook(); lookDirty = false; active = true; }
    if (controls.update()) active = true;
    if (active || dimsAnim || needsRender || firstFrame) {
      dollyIn();
      applyLasers();
      renderer.render(scene, camera);
      if (placeLabels(dt)) needsRender = true; else needsRender = false;
      dollyOut();
      firstFrame = false;
    }
  }
  raf = requestAnimationFrame(loop);

  // ---------- выбор детали касанием (протяжка > 6 px — это вращение, не выбор) ----------
  const ray = new T.Raycaster(), ptr = new T.Vector2();
  let down = null;
  canvas.addEventListener("pointerdown", (e) => { down = down ? { x: e.clientX, y: e.clientY, moved: true } : { x: e.clientX, y: e.clientY, moved: false }; });
  canvas.addEventListener("pointermove", (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true; });
  canvas.addEventListener("pointercancel", () => { down = null; });
  canvas.addEventListener("pointerup", (e) => {
    const d = down; down = null;
    if (!d || d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    const rc = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    dollyIn();
    ray.setFromCamera(ptr, camera);
    dollyOut();
    const pickable = parts.filter((q) => q.mesh.visible && q.ghost < 0.5).map((q) => q.mesh);
    const hit = ray.intersectObjects(pickable, false)[0];
    const id = hit ? hit.object.userData.id : null;
    highlight(id);
    if (opts.onPick) opts.onPick(id);
  });

  // ---------- размер ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!(w > 0 && h > 0)) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bgU.uAspect.value = w / h;
    if (model && stepN == null && !isoId && !camAnim.light && (!userMoved || (w < 600) !== framedNarrow)) frameCamera(!userMoved);
    styleLabels();
    needsRender = true;
  }
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(container);
  else window.addEventListener("resize", resize);
  resize();

  // ---------- API ----------
  function highlight(id) { selected = id == null ? null : id; needsRender = true; }
  return {
    setModel,
    setPaint(hex) {
      paint = hex || null;
      for (const q of parts) {
        if (paint) for (const m of q.pnt) { m.color.set(paint).convertSRGBToLinear(); m.userData.base.copy(m.color); }
        if (!sweep.on) q.mesh.material = paintActive() ? q.pnt : q.raw;
      }
      lookDirty = true; needsRender = true;
    },
    // цель разборки 0..1; авто-цикл останавливает только play(false)
    setExplode(t) { if (!playing) tgt = clamp(+t || 0, 0, 1); },
    play(on) {
      if (on && !playing) {
        playing = true;
        const ph = drive > 0.5 ? 0.5 + (1 - drive) * 0.3 : drive * 0.3;      // продолжить с текущей фазы
        playT0 = performance.now() - ph * PLAY_T * 1000;
      } else if (!on && playing) { playing = false; tgt = drive; }
    },
    setXray(on) { xK.to = on ? 1 : 0; },
    setBlueprint(on) { bK.to = on ? 1 : 0; styleLabels(); },
    setDims(on) { dimsOn = !!on; },
    setLite(on) {
      lite = !!on;
      renderer.shadowMap.enabled = !lite;
      key.castShadow = !lite;
      scene.environment = lite ? null : envTex;
      scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      for (const q of parts) for (const m of [...q.raw, ...q.pnt]) m.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      lookDirty = true;
      resize();
    },
    highlight,
    resize,
    setTheme(t) { theme = t === "dark" ? "dark" : "light"; thK.to = theme === "dark" ? 1 : 0; styleLabels(); },
    // пошаговая сборка: 1 measure, 2 sides, 3 rear, 4 rib, 5 ply, 6 finish; null — свободный конструктор
    setStep(n) {
      if (typeof n === "string") n = STEP_IDS.indexOf(n) + 1 || (Number.isFinite(+n) ? +n : null);
      if (n != null) n = clamp(Math.round(n), 1, 6);
      if (n === 4 && !partsById.rib) return;
      if (n === stepN) return;
      const prev = stepN;
      stepN = n == null ? null : n;
      if (sweep.on) endSweep();
      if (stepN == null) {
        for (const q of parts) q.mesh.material = paintActive() ? q.pnt : q.raw;
        frameCamera(true);
      } else {
        for (const q of parts) {
          const st = STEP_OF[q.id] ?? 5;
          // деталь текущего шага прилетает со своего направления разборки
          if (st === stepN && (prev == null || prev < stepN || prev === 1)) { q.s = 1; q.v = 0; }
          else if (st < stepN && prev == null) { q.s = 0; q.v = 0; }
          q.mesh.material = q.raw;
        }
        if (stepN === 6) startSweep();
        if (model) frameStep(stepN);
      }
      lookDirty = true; needsRender = true;
    },
    // показать одну деталь крупно, остальные — призраки
    isolate(id) {
      isoId = id == null ? null : id;
      if (isoId && partsById[isoId]) { if (model) setTimeout(frameIso, 0); }
      else if (model) { if (stepN != null) frameStep(stepN); else frameCamera(true); }
      needsRender = true;
    },
    setSpin(on) { spinOn = !!on; controls.autoRotate = spinOn; controls.autoRotateSpeed = reduce ? 0.25 : 0.55; needsRender = true; },
    // для проверок: счётчики памяти рендерера
    info() { const m = renderer.info.memory; return { geometries: m.geometries, textures: m.textures, programs: renderer.info.programs ? renderer.info.programs.length : 0, labels: Object.keys(labelsByKey).length, target: controls.target.toArray().map((v) => +v.toFixed(3)), cam: camera.position.toArray().map((v) => +v.toFixed(3)) }; },
    setSection(on) {
      on = !!on;
      if (on === sectionOn) return;
      sectionOn = on; secK.to = on ? 1 : 0;
      // сдвиг глубины заливки сечения (против мерцания совпадающих граней) — только WebGL2
      if (renderer.capabilities.isWebGL2) for (const q of parts) for (const m of [...q.raw, ...q.pnt]) setSecDefine(m);
    },
  };
}
