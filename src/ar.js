// AR-примерка (ТЗ п. 8): модель именно этого пандуса на живой картинке камеры, масштаб 1:1.
// Просмотр и AR — Google <model-viewer> 4.1.0 (WebXR на Android, Scene Viewer, Quick Look на iPhone;
// USDZ для Quick Look model-viewer строит сам из GLB). GLB пишется здесь же, без three.js.
//
// Модель в GLB: метры, ось Y вверх (glTF). Начало координат — середина линии примыкания на земле
// (x = 0, y = W/2, z = земля). Пандус уходит от ступени по +Z, к зрителю; А (левая высота) — слева,
// если смотреть на ступень. Перевод из осей ramp.js: X_gl = (y − W/2), Y_gl = z − земля, Z_gl = x.
// Единственное объявление верхнего уровня — фабрика (файлы склеиваются в один артефакт).
export function createAR() {
  const STR = {
    title: "Примерка в AR",
    showAR: "Показать в AR",
    close: "Закрыть",
    instruction: "Наведите камеру на землю у ступени. Поставьте точку примыкания к краю ступени, поверните пандус вдоль входа. Размер — 1:1, как в замере.",
    fallback: "AR открывается на телефоне в браузере по прямой ссылке на приложение.",
    fallbackIframe: "Здесь камера недоступна. AR открывается на телефоне в браузере по прямой ссылке на приложение.",
    loading: "Загружаем 3D-модель…",
    loadFailed: "Не удалось загрузить 3D-просмотрщик. Проверьте интернет и откройте примерку ещё раз.",
    modelFailed: "Не удалось показать модель пандуса.",
    arFailed: "AR не запустился на этом устройстве.",
    step: "Точка примыкания",
    a: "А", b: "Б", width: "Ширина", length: "Длина", mm: "мм",
    alt: "3D-модель пандуса",
  };
  const MV_VERSION = "4.1.0";
  const MV_URL = `https://cdn.jsdelivr.net/npm/@google/model-viewer@${MV_VERSION}/dist/model-viewer.min.js`;
  const BIRCH = "#D9B98A", PINE = "#C9A06A";
  const ROUGH = { ply: 0.75, pine: 0.8 };
  let mvLoad = null;

  // ---------- GLB ----------
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  function rgba(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) throw new Error(`Цвет «${hex}»: ожидается #RRGGBB.`);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +lin(v / 255).toFixed(5)).concat(1);
  }
  const normPaint = (p) => (p == null || p === "" ? null : "#" + String(p).trim().replace(/^#/, "").toUpperCase());

  // Высота земли под серединой линии примыкания (мм, оси ramp.js): земля линейна поперёк, z = 0 слева
  const groundMid = (model) => (model.kind === "skew" ? (model.params.hl - model.params.hr) / 2 : 0);

  // мм, оси ramp.js → метры, glTF
  function toGL(model) {
    const W = model.params.width, zg = groundMid(model);
    return (p) => [(p[1] - W / 2) / 1000, (p[2] - zg) / 1000, p[0] / 1000];
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // Плоские треугольники: у каждого свои 3 вершины и нормаль грани, наружу от центра детали (детали выпуклые)
  function partGeometry(part, map) {
    const P = part.verts.map(map);
    const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length, s[2] + p[2] / P.length], [0, 0, 0]);
    const pos = [], nor = [];
    for (const f of part.faces) {
      let [a, b, d] = f.map((i) => P[i]);
      let n = cross(sub(b, a), sub(d, a));
      const len = Math.hypot(n[0], n[1], n[2]);
      if (!(len > 1e-12)) continue;                      // вырожденная грань
      n = n.map((v) => v / len);
      const fc = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
      if (dot(n, sub(fc, c)) < 0) { [b, d] = [d, b]; n = n.map((v) => -v); }
      pos.push(...a, ...b, ...d);
      nor.push(...n, ...n, ...n);
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
  }

  // model — результат build() из ramp.js; paint — "#RRGGBB" или null (без покраски)
  function toGLB(model, paint = null) {
    const hex = normPaint(paint);
    const map = toGL(model);
    const mats = [
      { name: hex ? `Фанера, ${hex}` : "Фанера, берёза", pbrMetallicRoughness: { baseColorFactor: rgba(hex || BIRCH), metallicFactor: 0, roughnessFactor: ROUGH.ply } },
      { name: hex ? `Сосна, ${hex}` : "Сосна", pbrMetallicRoughness: { baseColorFactor: rgba(hex || PINE), metallicFactor: 0, roughnessFactor: ROUGH.pine } },
    ];
    const bins = [], bufferViews = [], accessors = [], meshes = [], nodes = [{ name: "Пандус", children: [] }];
    let off = 0;
    const view = (arr, target) => {
      const pad = (4 - (arr.byteLength % 4)) % 4;
      bufferViews.push({ buffer: 0, byteOffset: off, byteLength: arr.byteLength, target });
      bins.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), new Uint8Array(pad));
      off += arr.byteLength + pad;
      return bufferViews.length - 1;
    };
    for (const part of model.parts) {
      const g = partGeometry(part, map);
      const n = g.pos.length / 3;
      if (!n) continue;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = g.pos[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      const idx = new Uint16Array(n).map((_, i) => i);
      accessors.push({ bufferView: view(g.pos, 34962), componentType: 5126, count: n, type: "VEC3", min, max });
      accessors.push({ bufferView: view(g.nor, 34962), componentType: 5126, count: n, type: "VEC3" });
      accessors.push({ bufferView: view(idx, 34963), componentType: 5123, count: n, type: "SCALAR", min: [0], max: [n - 1] });
      const a = accessors.length - 3;
      meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: part.mat === "ply" ? 0 : 1, mode: 4 }] });
      nodes.push({ name: part.name, mesh: meshes.length - 1 });
      nodes[0].children.push(nodes.length - 1);
    }
    const p = model.params;
    const json = {
      asset: { version: "2.0", generator: "GoApsny Stopgap ar.js" },
      scene: 0,
      scenes: [{ name: "Пандус", nodes: [0] }],
      nodes, meshes, materials: mats, accessors, bufferViews,
      buffers: [{ byteLength: off }],
      extras: { units: "m", origin: "середина линии примыкания на земле", params: { hl: p.hl, hr: p.hr, width: p.width, board: p.board }, paint: hex },
    };
    const enc = new TextEncoder();
    let jb = enc.encode(JSON.stringify(json));
    const jpad = (4 - (jb.length % 4)) % 4;
    const total = 12 + 8 + jb.length + jpad + 8 + off;
    const out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jb.length + jpad, true); dv.setUint32(16, 0x4E4F534A, true);
    out.set(jb, 20); out.fill(0x20, 20 + jb.length, 20 + jb.length + jpad);
    let q = 20 + jb.length + jpad;
    dv.setUint32(q, off, true); dv.setUint32(q + 4, 0x004E4942, true); q += 8;
    for (const b of bins) { out.set(b, q); q += b.length; }
    return out;
  }

  // ---------- возможности устройства ----------
  // Синхронная оценка по тем же признакам, что и model-viewer; точный ответ — viewer.canActivateAR после загрузки
  function supported() {
    const res = { webxr: false, sceneViewer: false, quickLook: false, iframe: false, reason: null, message: null };
    if (typeof window === "undefined" || typeof navigator === "undefined") { res.reason = "no-browser"; res.message = STR.fallback; return res; }
    try { res.iframe = window.top !== window.self; } catch { res.iframe = true; }   // чужой родитель: доступ к top запрещён
    const ua = navigator.userAgent || "";
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    res.webxr = !!(navigator.xr && window.XRSession && window.XRSession.prototype && window.XRSession.prototype.requestHitTestSource);
    res.sceneViewer = android && !/firefox/i.test(ua) && !/OculusBrowser/i.test(ua);
    if (ios) {
      const wk = !!(window.webkit && window.webkit.messageHandlers);
      if (!wk) { const a = document.createElement("a"); res.quickLook = !!(a.relList && a.relList.supports && a.relList.supports("ar")); }
      else res.quickLook = /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(ua);
    }
    if (res.iframe) {
      let xrAllowed = true;
      try { const fp = document.featurePolicy || document.permissionsPolicy; if (fp && fp.allowsFeature) xrAllowed = fp.allowsFeature("xr-spatial-tracking"); } catch { xrAllowed = false; }
      if (!xrAllowed) res.webxr = false;
      res.reason = "iframe"; res.message = STR.fallbackIframe;
    } else if (!res.webxr && !res.sceneViewer && !res.quickLook) {
      res.reason = "desktop"; res.message = STR.fallback;
    }
    return res;
  }

  // ---------- загрузка model-viewer ----------
  function loadViewer(url = MV_URL, timeoutMs = 25000) {
    if (typeof customElements !== "undefined" && customElements.get("model-viewer")) return Promise.resolve();
    if (mvLoad) return mvLoad;
    mvLoad = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.type = "module"; s.src = url; s.crossOrigin = "anonymous"; s.dataset.sgar = "model-viewer";
      const t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      s.onerror = () => { clearTimeout(t); reject(new Error("script")); };
      document.head.appendChild(s);
      customElements.whenDefined("model-viewer").then(() => { clearTimeout(t); resolve(); });
    }).catch((e) => { mvLoad = null; document.querySelectorAll('script[data-sgar="model-viewer"]').forEach((n) => n.remove()); throw e; });
    return mvLoad;
  }

  // ---------- оверлей ----------
  const CSS = `
.sgar{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:var(--bg,#F2F2F7);color:var(--label,#000);font:400 15px/1.35 var(--font,-apple-system,system-ui,sans-serif);-webkit-font-smoothing:antialiased}
.sgar:focus{outline:none}
.sgar *{box-sizing:border-box}
.sgar-bar{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 16px 10px;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
.sgar-title{flex:1;margin:0;font-size:17px;font-weight:600;color:var(--title-ink,#16273A)}
.sgar-x{width:44px;height:44px;margin:-6px -8px -6px 0;border:0;border-radius:22px;background:var(--fill,rgba(118,118,128,.12));color:var(--label,#000);font:500 22px/1 system-ui,sans-serif;cursor:pointer}
.sgar-x:focus-visible,.sgar-go:focus-visible{outline:3px solid var(--focus,#C9452F);outline-offset:2px}
.sgar-stage{position:relative;flex:1;min-height:0}
.sgar-stage model-viewer{width:100%;height:100%;display:block;background:var(--stage,radial-gradient(120% 90% at 50% 35%,#fff 0%,#ECEDF2 55%,#DADCE3 100%));--poster-color:transparent}
.sgar-msg{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:var(--label-2,#6C6C70);font-weight:500}
.sgar-hs{border:0;padding:3px 8px;border-radius:8px;background:rgba(22,39,58,.86);color:#fff;font:600 12px/1.2 var(--font,system-ui,sans-serif);white-space:nowrap;pointer-events:none;transform:translateY(-18px)}
.sgar-hs.sgar-step{background:var(--tint,#EF705D);transform:translateY(14px)}
.sgar-hs.sgar-step::before{content:"";position:absolute;left:50%;top:-12px;width:10px;height:10px;margin-left:-5px;border-radius:5px;background:var(--tint,#EF705D);box-shadow:0 0 0 3px #fff}
.sgar-sheet{width:100%;max-width:560px;margin:0 auto;padding:14px 16px calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px}
.sgar-dims{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin:0;border-radius:12px;overflow:hidden;background:var(--sep,rgba(60,60,67,.2))}
.sgar-dims div{background:var(--cell,#fff);padding:8px 6px;text-align:center;min-width:0}
.sgar-dims dt{font-size:12px;color:var(--label-2,#6C6C70)}
.sgar-dims dd{margin:2px 0 0;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.sgar-dims dd small{font-weight:400;font-size:12px;color:var(--label-2,#6C6C70)}
.sgar-hint{margin:0;color:var(--label-2,#6C6C70);font-size:14px}
.sgar-go{min-height:54px;border:0;border-radius:14px;background:var(--prominent,#16273A);color:var(--on-prominent,#fff);font:600 17px/1 var(--font,system-ui,sans-serif);cursor:pointer}
.sgar-go[disabled]{opacity:.4;cursor:default}
.sgar-fb{margin:0;padding:10px 12px;border-radius:12px;background:var(--orange-soft,rgba(255,149,0,.14));font-size:14px;font-weight:500}
@media (min-width:900px){.sgar-sheet{padding-bottom:24px}}
`;
  function injectCSS() {
    if (document.getElementById("sgar-style")) return;
    const st = document.createElement("style");
    st.id = "sgar-style"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ru = (v) => (v == null || v === "" ? "—" : String(v).replace(".", ","));

  // Точки для подписей (метры, glTF): верх настила у порога слева и справа
  function anchors(model) {
    const map = toGL(model), W = model.params.width;
    const ply = model.parts.find((q) => q.id === "ply");
    const topAt = (y) => ply.verts.filter((v) => Math.abs(v[1] - y) < 1e-6).reduce((m, v) => (v[2] > m[2] ? v : m), [0, y, -Infinity]);
    const f = (p) => map(p).map((v) => `${+v.toFixed(4)}m`).join(" ");
    return { a: f(topAt(0)), b: f(topAt(W)) };
  }

  // container — куда смонтировать (по умолчанию document.body); opts: { onClose, scriptUrl, title, src }
  // → { el, viewer, ready: Promise<boolean> (модель показана), activate(), close(), support }
  function open(container, model, paint = null, opts = {}) {
    const host = container || document.body;
    injectCSS();
    const p = model.params, d = model.dims;
    // opts.src — адрес того же GLB по https: нужен Scene Viewer (внешнее приложение не читает blob:)
    const url = opts.src || URL.createObjectURL(new Blob([toGLB(model, paint)], { type: "model/gltf-binary" }));
    const sup = supported();
    const prevFocus = document.activeElement;
    const root = document.createElement("div");
    root.className = "sgar"; root.tabIndex = -1;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "sgar-h");
    const cell = (k, v) => `<div><dt>${esc(k)}</dt><dd>${esc(ru(v))} <small>${STR.mm}</small></dd></div>`;
    root.innerHTML = `
      <div class="sgar-bar"><h2 class="sgar-title" id="sgar-h">${esc(opts.title || STR.title)}</h2>
        <button type="button" class="sgar-x" data-sgar-close aria-label="${esc(STR.close)}">×</button></div>
      <div class="sgar-stage" data-sgar-stage><div class="sgar-msg" data-sgar-msg role="status">${esc(STR.loading)}</div></div>
      <div class="sgar-sheet">
        <dl class="sgar-dims">${cell(STR.a, p.hl)}${cell(STR.b, p.hr)}${cell(STR.width, p.width)}${cell(STR.length, d.totalLen)}</dl>
        <p class="sgar-hint">${esc(STR.instruction)}</p>
        <button type="button" class="sgar-go" data-sgar-go disabled>${esc(STR.showAR)}</button>
        <p class="sgar-fb" data-sgar-fb role="status" hidden></p>
      </div>`;
    host.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const btn = $("[data-sgar-go]"), fb = $("[data-sgar-fb]"), msg = $("[data-sgar-msg]");
    const say = (text) => { fb.textContent = text; fb.hidden = !text; };
    let viewer = null, closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      root.remove();
      if (!opts.src) setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch { /* элемент мог исчезнуть */ }
      if (opts.onClose) opts.onClose();
    }
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    $("[data-sgar-close]").addEventListener("click", close);
    try { root.focus({ preventScroll: true }); } catch { /* старый браузер */ }

    function activate() {
      if (!viewer || !viewer.canActivateAR) { say(sup.message || STR.fallback); return; }
      // AR начинается с того же вида, что и превью спереди: низ пандуса к человеку, ступень дальше
      viewer.cameraOrbit = "0deg 70deg auto";
      viewer.jumpCameraToGoal();
      viewer.activateAR();
    }
    btn.addEventListener("click", activate);

    const ready = loadViewer(opts.scriptUrl).then(() => new Promise((resolve) => {
      if (closed) return resolve(false);
      const a = anchors(model);
      viewer = document.createElement("model-viewer");
      const attrs = {
        src: url, alt: STR.alt, ar: "", "ar-modes": "webxr scene-viewer quick-look", "ar-placement": "floor", "ar-scale": "fixed",
        "camera-controls": "", "camera-target": "0m 0m 0m", "camera-orbit": "-28deg 68deg auto", "interaction-prompt": "none",
        "shadow-intensity": "1", "shadow-softness": "0.8", exposure: "1", "environment-image": "neutral", "touch-action": "none",
      };
      for (const [k, v] of Object.entries(attrs)) viewer.setAttribute(k, v);
      viewer.innerHTML = `
        <button class="sgar-hs sgar-step" slot="hotspot-step" data-position="0m 0m 0m" data-normal="0m 1m 0m" tabindex="-1">${esc(STR.step)}</button>
        <button class="sgar-hs" slot="hotspot-a" data-position="${a.a}" data-normal="0m 1m 0m" tabindex="-1">${esc(STR.a)} ${esc(ru(p.hl))}</button>
        <button class="sgar-hs" slot="hotspot-b" data-position="${a.b}" data-normal="0m 1m 0m" tabindex="-1">${esc(STR.b)} ${esc(ru(p.hr))}</button>
        <div slot="ar-button" hidden></div><div slot="progress-bar"></div>`;
      viewer.addEventListener("load", () => {
        msg.remove();
        // canActivateAR выставляется асинхронно (проверка WebXR) — ждём до 2,5 с
        let tries = 0;
        const check = () => {
          if (closed) return resolve(false);
          const can = !!viewer.canActivateAR;
          if (!can && ++tries < 25) return void setTimeout(check, 100);
          btn.disabled = !can;
          if (!can) say(sup.message || STR.fallback);
          else if (sup.reason === "iframe") say(STR.fallbackIframe);
          resolve(true);
        };
        check();
      }, { once: true });
      viewer.addEventListener("error", () => { msg.textContent = STR.modelFailed; resolve(false); }, { once: true });
      viewer.addEventListener("ar-status", (e) => { if (e.detail && e.detail.status === "failed") say(`${STR.arFailed} ${sup.message || STR.fallback}`); });
      $("[data-sgar-stage]").appendChild(viewer);
    })).catch(() => { if (!closed) msg.textContent = STR.loadFailed; return false; });

    return { el: root, get viewer() { return viewer; }, ready, activate, close, support: sup };
  }

  return { toGLB, open, supported, loadViewer, STR, MV_VERSION };
}
