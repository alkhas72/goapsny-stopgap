// «Как мерить» показом, а не текстом (Алхас, 2026-11-25: «лучше один раз показать, чем сто раз рассказать»).
// Объёмная сцена в виде рендера конструктора: белая ступень, синий пандус, коралловые размеры в белых пилюлях.
// Порядок его словами: рулетка у одного края, потом ширина вдоль ступени, потом рулетка у другого края.
// createHowto().mount(host, opts) ставит проигрыватель в host; нужен глобальный THREE (тот же, что у 3D конструктора).
// Числа в показе условные и в миллиметрах, как в полях ввода. Единственное объявление верхнего уровня.
export function createHowto() {
  const SCENES = [
    { h: "Место", p: "Пандус встанет к ступени, напротив двери.", ms: 3600 },
    { h: "Высота А", p: "Рулетку к левому краю будущего пандуса: от земли до верха ступени.", ms: 4400, slot: "a", val: 85 },
    { h: "Ширина", p: "От точки А вдоль ступени. Не шире прохода между выступами у двери.", ms: 4400, slot: "w", val: 900 },
    { h: "Высота Б", p: "У правого края. Земля с наклоном, поэтому число другое.", ms: 4400, slot: "b", val: 70 },
    { h: "Три числа", p: "Пишите в миллиметрах, без округления: 8,5 см на рулетке это 85.", ms: 4000 },
  ];
  const TXT = {
    aria: "Показ: как мерить ступень для пандуса", steps: "Шаги показа", step: (i, h) => `Шаг ${i}: ${h}`,
    a: "Высота А", w: "Ширина", b: "Высота Б", mm: "мм",
    prev: "Предыдущий шаг", next: "Следующий шаг", play: "Показать", pause: "Пауза",
    fail: "Показ не загрузился. Обновите страницу.",
  };
  const totalMs = SCENES.reduce((s, x) => s + x.ms, 0);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const back = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const mix = (a, b, t) => a + (b - a) * t;
  const ICON = {
    pause: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="4.5" y="3.5" width="4" height="13" rx="1.2"/><rect x="11.5" y="3.5" width="4" height="13" rx="1.2"/></svg>',
    play: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6 3.6v12.8a.8.8 0 0 0 1.2.7l10.4-6.4a.8.8 0 0 0 0-1.4L7.2 2.9A.8.8 0 0 0 6 3.6z"/></svg>',
    prev: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4l6 6-6 6"/></svg>',
  };

  // opts.autoplay — сразу играть (в мастере); без него показ стоит на последнем кадре с кнопкой «Показать» (в листе конструктора)
  function mount(host, opts = {}) {
    const doc = host.ownerDocument, win = doc.defaultView;
    const uid = "hw" + Math.random().toString(36).slice(2, 8);
    host.innerHTML = `<div class="hw">
      <div class="hw-segs" role="tablist" aria-label="${TXT.steps}"></div>
      <div class="hw-stage" role="img" aria-label="${TXT.aria}">
        <div class="hw-pill" data-hw-pill="a"></div><div class="hw-pill" data-hw-pill="w"></div><div class="hw-pill" data-hw-pill="b"></div>
        <button type="button" class="hw-start" data-hw-start aria-label="${TXT.play}" hidden>${ICON.play}</button>
      </div>
      <div class="hw-cap" aria-live="polite"><h3 id="${uid}-h"></h3><p id="${uid}-p"></p></div>
      <div class="hw-nums">
        <div class="hw-num is-empty" data-hw-num="a"><span>${TXT.a}</span><strong>—</strong></div>
        <div class="hw-num is-empty" data-hw-num="w"><span>${TXT.w}</span><strong>—</strong></div>
        <div class="hw-num is-empty" data-hw-num="b"><span>${TXT.b}</span><strong>—</strong></div>
      </div>
      <div class="hw-ctl">
        <button type="button" data-hw-prev aria-label="${TXT.prev}">${ICON.prev}</button>
        <button type="button" class="hw-play" data-hw-play aria-label="${TXT.pause}"></button>
        <button type="button" data-hw-next aria-label="${TXT.next}">${ICON.next}</button>
      </div>
    </div>`;
    const q = (s) => host.querySelector(s);
    const stage = q(".hw-stage"), capH = q(".hw-cap h3"), capP = q(".hw-cap p"), startBtn = q("[data-hw-start]"), playBtn = q("[data-hw-play]");
    const T = win.THREE;
    if (!T) { stage.insertAdjacentHTML("beforeend", `<div class="hw-fail">${TXT.fail}</div>`); return { destroy() { host.innerHTML = ""; }, play() {}, pause() {}, seek() {} }; }

    const slots = { a: q('[data-hw-num="a"]'), w: q('[data-hw-num="w"]'), b: q('[data-hw-num="b"]') };
    const slotShown = {};
    const setSlot = (k, v, on) => {
      const key = `${v}|${on}`; if (slotShown[k] === key) return; slotShown[k] = key;
      const e = slots[k]; e.classList.toggle("is-on", !!on); e.classList.toggle("is-empty", v == null);
      e.querySelector("strong").innerHTML = v == null ? "—" : `${v}<small>${TXT.mm}</small>`;
    };
    const segs = q(".hw-segs");
    const bars = SCENES.map((s, i) => {
      const b = doc.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-label", TXT.step(i + 1, s.h));
      b.innerHTML = "<i><b></b></i>"; b.addEventListener("click", () => { started(); seek(i, 0); }); segs.appendChild(b); return b.querySelector("b");
    });
    const lin = (h) => new T.Color(h).convertSRGBToLinear();

    // ---- мир в сантиметрах: высоты 8,5 и 7, ширина 90, уклон 1:6
    const HA = 8.5, HB = 7, W2 = 45, D = 0, LA = HA * 6, LB = HB * 6;
    const H = (x) => HA + (HB - HA) * (x + W2) / (2 * W2);
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { stage.insertAdjacentHTML("beforeend", `<div class="hw-fail">${TXT.fail}</div>`); return { destroy() { host.innerHTML = ""; }, play() {}, pause() {}, seek() {} }; }
    renderer.setPixelRatio(Math.min(2, win.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    stage.prepend(renderer.domElement);
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, 5, 4000);
    const trash = [];                                     // всё, что надо освободить при закрытии
    const keep = (x) => { trash.push(x); return x; };

    scene.add(new T.HemisphereLight(0xffffff, 0xe6e1d9, .9));
    const key = new T.DirectionalLight(0xfff5ea, 1.05);
    key.position.set(-170, 300, -70); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.normalBias = .4;
    Object.assign(key.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 50, far: 900 });
    scene.add(key);
    const fill = new T.DirectionalLight(0xe2ebff, .3); fill.position.set(200, 90, 220); scene.add(fill);

    // зернистый бетон, как у ступени в конструкторе (зерно по своему счётчику: кадр к кадру одно и то же)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const grain = (() => {
      const c = doc.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 5200; i++) { const v = 228 + rnd() * 27 | 0; g.fillStyle = `rgb(${v},${v},${v - 2})`; g.fillRect(rnd() * 256, rnd() * 256, 1.4, 1.4); }
      const t = keep(new T.CanvasTexture(c)); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3); t.encoding = T.sRGBEncoding; return t;
    })();
    const std = (hex, o = {}) => keep(new T.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: .9, metalness: 0 }, o)));
    const geo = (g) => keep(g);
    const concreteStep = std("#F6F4F0", { map: grain }), concreteSlab = std("#D8D3CB", { map: grain }), stepFace = std("#E6E2DB", { map: grain });
    const add = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m; };

    // земля перед ступенью с едва заметным наклоном, слева ниже; ступень: верх на y = 0, лицо на z = D
    const slab = add(new T.Mesh(geo(new T.BoxGeometry(300, 18, 260)), concreteSlab), false, true);
    slab.rotation.z = Math.atan2(HA - HB, 2 * W2); slab.position.set(0, -(HA + HB) / 2 - 9, 60);
    const step = add(new T.Mesh(geo(new T.BoxGeometry(210, 30, 40)), [stepFace, stepFace, concreteStep, concreteStep, stepFace, stepFace]));
    step.position.set(0, -15, D - 20);
    // пандус: клин с настилом
    const vv = { tl: [-W2, 0, D], tr: [W2, 0, D], fl: [-W2, -HA, D + LA], fr: [W2, -HB, D + LB], bl: [-W2, -HA, D], br: [W2, -HB, D] };
    const quad = (a, b, c, d) => [...vv[a], ...vv[b], ...vv[c], ...vv[a], ...vv[c], ...vv[d]];
    const rampG = geo(new T.BufferGeometry());
    rampG.setAttribute("position", new T.Float32BufferAttribute([...quad("tl", "fl", "fr", "tr"), ...vv.tl, ...vv.bl, ...vv.fl, ...vv.tr, ...vv.fr, ...vv.br, ...quad("fl", "bl", "br", "fr")], 3));
    rampG.addGroup(0, 6, 0); rampG.addGroup(6, 6, 1); rampG.addGroup(12, 6, 1);
    rampG.computeVertexNormals();
    const deckM = keep(new T.MeshPhysicalMaterial({ color: lin("#1E3F72"), roughness: .58, clearcoat: .22, clearcoatRoughness: .3, transparent: true, side: T.DoubleSide }));
    const sideM = keep(new T.MeshPhysicalMaterial({ color: lin("#0B1E3B"), roughness: .58, clearcoat: .22, transparent: true, side: T.DoubleSide }));
    const ramp = add(new T.Mesh(rampG, [deckM, sideM]));
    const ghostEdge = keep(new T.LineDashedMaterial({ color: 0x102c54, dashSize: 2.4, gapSize: 1.8, transparent: true }));
    const outline = new T.LineSegments(geo(new T.EdgesGeometry(rampG)), ghostEdge); outline.computeLineDistances(); ramp.add(outline);

    // коралловые размерные линии; у каждой свой материал, чтобы гасить их по отдельности
    const coral = keep(new T.MeshBasicMaterial({ color: 0xee6a4e, transparent: true, toneMapped: false }));
    const bar = (len, m) => new T.Mesh(geo(new T.BoxGeometry(len, .45, .45)), m);
    function dim(a, b, tickDir) {
      const m = keep(coral.clone()), g = new T.Group(), A = new T.Vector3(...a), B = new T.Vector3(...b), mid = A.clone().add(B).multiplyScalar(.5);
      const line = bar(A.distanceTo(B), m); line.position.copy(mid); line.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), B.clone().sub(A).normalize()); g.add(line);
      for (const p of [A, B]) { const t = bar(4, m); t.position.copy(p); t.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), new T.Vector3(...tickDir)); g.add(t); }
      scene.add(g); return g;
    }
    const dimA = dim([-W2 - 2.5, -HA, D + 1.5], [-W2 - 2.5, 0, D + 1.5], [1, 0, 0]);
    const dimB = dim([W2 + 2.5, -HB, D + 1.5], [W2 + 2.5, 0, D + 1.5], [1, 0, 0]);
    const dimW = dim([-W2, .3, D - 5], [W2, .3, D - 5], [0, 0, 1]);

    // рулетка: жёлтая лента с делениями, тёмный корпус, зацеп
    const tick = doc.createElement("canvas"); tick.width = 32; tick.height = 512;
    { const c = tick.getContext("2d"); c.fillStyle = "#F4D21F"; c.fillRect(0, 0, 32, 512); c.fillStyle = "#1b1b1b";
      for (let i = 0; i < 100; i++) c.fillRect(0, i * 5.12, i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 9, 1.3); }
    const tickTex = keep(new T.CanvasTexture(tick)); tickTex.wrapT = T.RepeatWrapping; tickTex.encoding = T.sRGBEncoding;
    const bladeM = keep(new T.MeshStandardMaterial({ map: tickTex, roughness: .45, metalness: .1, transparent: true }));
    const blade = new T.Mesh(geo(new T.BoxGeometry(2.5, 1, .18).translate(0, .5, 0)), bladeM); blade.castShadow = true;
    const caseM = std("#22252b", { roughness: .45, transparent: true }), caseAccent = std("#F4D21F", { roughness: .5, transparent: true });
    const caseG = new T.Group();
    const shell = new T.Mesh(geo(new T.BoxGeometry(5.2, 5.2, 2.6)), caseM); shell.castShadow = true; caseG.add(shell);
    const disc = new T.Mesh(geo(new T.CylinderGeometry(1.7, 1.7, 2.8, 28)), caseAccent); disc.rotation.x = Math.PI / 2; caseG.add(disc);
    const hook = new T.Mesh(geo(new T.BoxGeometry(3, .7, 1.4)), std("#9AA1AB", { metalness: .6, roughness: .35, transparent: true })); hook.castShadow = true;
    const tape = new T.Group(); tape.add(blade, caseG, hook); scene.add(tape);
    const tapeMats = [bladeM, caseM, caseAccent, hook.material];

    // ---- камера: общий вид, крупно у А, сверху вдоль ступени, крупно у Б, общий вид
    const SHOT = [
      { p: [-150, 150, 215], t: [4, -8, 22], fov: 27 },
      { p: [-92, 30, 66], t: [-W2 + 3, -4, D + 3], fov: 17 },
      { p: [-10, 165, 150], t: [0, -4, D + 6], fov: 30 },
      { p: [92, 30, 66], t: [W2 - 3, -3.5, D + 3], fov: 17 },
      { p: [-150, 150, 215], t: [4, -8, 22], fov: 27 },
    ];
    const vec = (a) => new T.Vector3(...a), P = new T.Vector3(), Q = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
    function camAt(i, t) {
      const from = SHOT[Math.max(0, i - 1)], to = SHOT[i], k = i === 0 ? 1 : ease(span(t, 0, .32));
      P.copy(vec(from.p)).lerp(vec(to.p), k); Q.copy(vec(from.t)).lerp(vec(to.t), k);
      if (i === 0) { const d = 1 - ease(t); P.x -= 26 * d; P.y += 12 * d; P.z += 30 * d; }
      if (i === 4) P.applyAxisAngle(UP, -.12 * ease(span(t, .3, 1)));
      cam.position.copy(P); cam.lookAt(Q); cam.fov = mix(from.fov, to.fov, k); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    }

    // ---- пилюли с числами следят за точками сцены
    const pills = { a: q('[data-hw-pill="a"]'), w: q('[data-hw-pill="w"]'), b: q('[data-hw-pill="b"]') };
    const pillText = { a: (v) => `<b>А</b>${v}<small>${TXT.mm}</small>`, b: (v) => `<b>Б</b>${v}<small>${TXT.mm}</small>`, w: (v) => `${v}<small>${TXT.mm}</small>` };
    const pillShown = {}, R = { w: 1, h: 1 };
    function pill(k, at, v, op, dx = 0, dy = 0) {
      const e = pills[k]; if (op <= .01) { e.style.opacity = 0; return; }
      const pt = vec(at).project(cam);
      if (pillShown[k] !== v) { pillShown[k] = v; e.innerHTML = pillText[k](v); }
      e.style.opacity = op.toFixed(2);
      const hw = e.offsetWidth / 2 + 8, hh = e.offsetHeight / 2 + 8;
      let X = (pt.x + 1) / 2 * R.w + dx, Y = (1 - pt.y) / 2 * R.h + dy; X = Math.max(hw, Math.min(R.w - hw, X)); Y = Math.max(hh, Math.min(R.h - hh, Y));
      e.style.transform = `translate(${X.toFixed(1)}px, ${Y.toFixed(1)}px) translate(-50%, -50%) scale(${mix(.86, 1, Math.min(1, op))})`;
    }
    const setOp = (g, op) => g.traverse((o) => { if (o.material) o.material.opacity = op; o.visible = op > .01; });

    function setTape(kind, g, op) {
      tape.visible = op > .01; if (!tape.visible) return;
      tapeMats.forEach((m) => { m.opacity = op; });
      let len;
      if (kind === "w") {
        len = Math.max(.01, 2 * W2 * g);
        tape.position.set(-W2, .1, D - 2); tape.rotation.set(0, 0, 0);
        caseG.position.set(-3.8, 3.2, 0); caseG.rotation.set(0, Math.PI / 2, 0);
        blade.position.set(0, .1, 0); blade.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
        hook.position.set(len + .3, .9, 0); hook.rotation.set(0, 0, Math.PI / 2);
      } else {
        const x = kind === "a" ? -W2 : W2, h = H(x); len = Math.max(.01, h * g);
        tape.position.set(x, -h, D + .6); tape.rotation.set(0, kind === "a" ? .35 : -.35, 0);
        caseG.position.set(kind === "a" ? 6.5 : -6.5, 2.6, 3.4); caseG.rotation.set(0, 0, 0);
        blade.position.set(0, 0, 0); blade.rotation.set(0, 0, 0);
        hook.position.set(0, len + .35, -.5); hook.rotation.set(0, 0, 0);
      }
      blade.scale.set(1, len, 1); tickTex.repeat.set(1, len / 100);
    }

    function draw(i, t) {
      const sc = SCENES[i];
      if (capH.textContent !== sc.h) { capH.textContent = sc.h; capP.textContent = sc.p; }
      bars.forEach((b, j) => { b.style.width = (j < i ? 100 : j === i ? t * 100 : 0) + "%"; b.parentNode.parentNode.setAttribute("aria-selected", j === i ? "true" : "false"); });
      camAt(i, t);

      // пандус подъезжает к ступени, становится «будущим» (контур), в конце снова настоящий
      let slide = 0, solid = 0;
      if (i === 0) { slide = 1 - back(span(t, .06, .55)); solid = 1 - ease(span(t, .72, .95)); }
      else if (i === 4) solid = ease(span(t, .1, .42));
      ramp.position.z = slide * 110; ramp.visible = !(i === 0 && t < .05);
      deckM.opacity = sideM.opacity = mix(.035, 1, solid); deckM.depthWrite = sideM.depthWrite = solid > .6; ramp.castShadow = solid > .6;
      ghostEdge.opacity = mix(.85, 0, solid);

      // рулетка тянется, число растёт; потом рулетка уходит, остаётся коралловый размер
      let g = 0, op = 0;
      if (sc.slot) { g = ease(span(t, .32, .72)); op = span(t, .26, .32) * (1 - span(t, .84, .92)); }
      setTape(sc.slot || "a", g, op);

      const close = i === 1 || i === 3;                   // крупный план: виден только свой размер
      const shown = (si) => (i > si ? 1 : i === si ? span(t, .8, .9) : 0);
      setOp(dimA, close && i !== 1 ? 0 : shown(1)); setOp(dimW, close ? 0 : shown(2)); setOp(dimB, close && i !== 3 ? 0 : shown(3));

      const live = (si) => (i === si ? Math.round(SCENES[si].val * g) : SCENES[si].val);
      const pop = (si) => (close && i !== si ? 0 : i > si ? 1 : i === si ? span(t, .32, .4) : 0);
      pill("a", i === 1 && t < .84 ? [-W2, -HA + HA * g, D + 1.2] : [-W2 - 2.5, -HA / 2, D + 1.5], live(1), pop(1), -34, 0);
      pill("w", i === 2 && t < .84 ? [mix(-W2, W2, g), 0, D - 2] : [0, .3, D - 5], live(2), pop(2), 0, -18);
      pill("b", i === 3 && t < .84 ? [W2, -HB + HB * g, D + 1.2] : [W2 + 2.5, -HB / 2, D + 1.5], live(3), pop(3), 34, 0);

      SCENES.forEach((s, si) => {
        if (!s.slot) return;
        if (i < si) setSlot(s.slot, null, false);
        else if (i === si) setSlot(s.slot, t < .32 ? null : Math.round(s.val * g), true);
        else setSlot(s.slot, s.val, i === 4 && t > .3);
      });
      renderer.render(scene, cam);
    }

    function resize() {
      const r = stage.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
      R.w = r.width; R.h = r.height; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); return true;
    }

    // ---- ход времени: кадры идут только пока показ играет
    const calm = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cur = 0, at = 0, playing = false, last = 0, raf = 0, dead = false, waiting = !opts.autoplay || calm;
    const paint = () => {
      playBtn.innerHTML = playing ? ICON.pause : ICON.play; playBtn.setAttribute("aria-label", playing ? TXT.pause : TXT.play);
      startBtn.hidden = !waiting;
    };
    const now = () => at / SCENES[cur].ms;
    function frame(ts) {
      raf = 0; if (dead || !playing) return;
      at += Math.min(64, ts - (last || ts)); last = ts;
      if (at >= SCENES[cur].ms) { cur = (cur + 1) % SCENES.length; at = 0; }
      draw(cur, now());
      raf = win.requestAnimationFrame(frame);
    }
    function play() { if (dead || playing) return; playing = true; last = 0; paint(); if (!raf) raf = win.requestAnimationFrame(frame); }
    function pause() { if (!playing) return; playing = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } paint(); }
    function seek(i, t) { cur = (i + SCENES.length) % SCENES.length; at = clamp(t) * SCENES[cur].ms; if (!dead) draw(cur, calm && !playing ? .97 : now()); }
    function started() { if (waiting) { waiting = false; paint(); } }
    playBtn.addEventListener("click", () => { if (waiting) { started(); seek(0, 0); play(); } else if (playing) pause(); else play(); });
    startBtn.addEventListener("click", () => { started(); seek(0, 0); if (!calm) play(); });
    q("[data-hw-prev]").addEventListener("click", () => { started(); seek(cur - 1, 0); });
    q("[data-hw-next]").addEventListener("click", () => { started(); seek(cur + 1, 0); });
    const ro = new win.ResizeObserver(() => { if (!dead && resize()) draw(cur, calm && !playing ? .97 : now()); });
    ro.observe(stage);
    // ушёл с экрана — пауза (лист конструктора длинный, сцена не должна греть телефон зря)
    let io = null, wasPlaying = false;
    if (win.IntersectionObserver) {
      io = new win.IntersectionObserver((es) => {
        const vis = es[es.length - 1].isIntersecting;
        if (!vis && playing) { wasPlaying = true; pause(); } else if (vis && wasPlaying) { wasPlaying = false; play(); }
      });
      io.observe(stage);
    }
    resize(); paint();
    if (waiting) seek(SCENES.length - 1, .97); else { seek(0, 0); play(); }

    function destroy() {
      if (dead) return; dead = true; playing = false;
      if (raf) win.cancelAnimationFrame(raf);
      ro.disconnect(); if (io) io.disconnect();
      for (const x of trash) { try { x.dispose(); } catch {} }
      try { renderer.dispose(); renderer.forceContextLoss(); } catch {}
      host.innerHTML = "";
    }
    return { destroy, play, pause, seek: (i, t) => { started(); pause(); seek(i, t); draw(cur, clamp(t)); }, isPlaying: () => playing };
  }

  return { SCENES, TXT, totalMs, mount };
}
