// Сцена и интерфейс конструктора. Вся геометрия берётся из build() в ramp.js:
// 3D, размерные линии, итог и список деталей относятся к одной конфигурации.
import { build, DEFAULTS, PARAMS_VERSION } from "./ramp.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- параметры ----------
const STORE = "goapsny-stopgap:v" + PARAMS_VERSION;
let params = { ...DEFAULTS };
try { Object.assign(params, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(params)); } catch {} };
const num = (v) => { const x = parseFloat(String(v).replace(",", ".")); return Number.isFinite(x) ? x : null; };

// ---------- сцена ----------
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 0.4;
controls.maxDistance = 8;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b1a6, 0.75));
const key = new THREE.DirectionalLight(0xfff3e4, 1.25);
key.position.set(1.6, 2.6, 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 8 });
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.45);
rim.position.set(-2, 1.2, -1.5);
scene.add(rim);

// процедурная текстура древесины
function woodTexture(base, grain, lines, seed) {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < lines; i++) {
    const y0 = rnd() * 512, amp = 2 + rnd() * 6, f = 0.004 + rnd() * 0.01, ph = rnd() * 6;
    g.strokeStyle = grain; g.globalAlpha = 0.08 + rnd() * 0.18; g.lineWidth = 0.6 + rnd() * 1.8;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
const MATS = {
  ply: new THREE.MeshStandardMaterial({ map: woodTexture("#E7D2A8", "#9C7A45", 70, 7), roughness: 0.62, side: THREE.DoubleSide }),
  pine: new THREE.MeshStandardMaterial({ map: woodTexture("#DDB073", "#8A5A26", 110, 3), roughness: 0.7, side: THREE.DoubleSide }),
};

const groundMat = new THREE.MeshStandardMaterial({ color: 0xc9c3ba, roughness: 0.95 });
const stepMat = new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.9 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xece8e2, roughness: 1 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x16273a, roughness: 0.55 });
const laserMat = new THREE.LineBasicMaterial({ color: 0xef705d, depthTest: false, transparent: true });

// мм рампы → метры сцены: X наружу → z, Y вправо → x, Z вверх → y
let W = 900;
const V = ([x, y, z]) => new THREE.Vector3((y - W / 2) / 1000, z / 1000, x / 1000);

const world = new THREE.Group(); scene.add(world);
const partsGroup = new THREE.Group(); world.add(partsGroup);
const context = new THREE.Group(); world.add(context);
const lasers = new THREE.Group(); world.add(lasers);

let model = null, meshes = {}, selected = null, tags = [];

function geometryOf(part) {
  const pos = [], uv = [];
  const P = part.verts.map(V);
  for (const [a, b, c] of part.faces) {
    const A = P[a], B = P[b], C = P[c];
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (const p of [A, B, C]) {
      pos.push(p.x, p.y, p.z);
      // волокна вдоль ската (ось z сцены)
      if (ay >= ax && ay >= az) uv.push(p.z * 2.2, p.x * 2.2);
      else if (ax >= az) uv.push(p.z * 2.2, p.y * 2.2);
      else uv.push(p.x * 2.2, p.y * 2.2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// куда деталь улетает при разборке и в каком порядке (настил первым)
const EXPLODE = {
  ply: { d: [0, 0.32, 0.08], order: 0 },
  rear: { d: [0, 0.14, -0.26], order: 1 },
  rib: { d: [0, 0.18, 0.12], order: 2 },
  left: { d: [-0.26, 0.08, 0.05], order: 3 },
  right: { d: [0.26, 0.08, 0.05], order: 3 },
};

function disposeGroup(g) {
  for (const o of [...g.children]) { g.remove(o); o.geometry?.dispose(); if (o.material && !Object.values(MATS).includes(o.material) && o.material !== laserMat) o.material.dispose?.(); disposeGroup(o); }
}

function rebuild() {
  W = params.width;
  model = build(params);
  disposeGroup(partsGroup); disposeGroup(context); disposeGroup(lasers);
  meshes = {};
  for (const part of model.parts) {
    const mesh = new THREE.Mesh(geometryOf(part), MATS[part.mat].clone());
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.id = part.id;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), new THREE.LineBasicMaterial({ color: 0x3b2a14, transparent: true, opacity: 0.35 }));
    mesh.add(edges); mesh.userData.edges = edges;
    partsGroup.add(mesh); meshes[part.id] = mesh;
  }
  buildContext();
  buildLasers();
  applyXray(); applyExplode(currentExplode); highlight(selected && meshes[selected] ? selected : null);
  renderPanel();
  frameCamera();
}

function buildContext() {
  const { hl, hr } = params, g = (hl - hr) / W, L = model.base;
  const ext = 500, len = L + 900;
  // земля наклонена поперёк: z = g·y
  const gp = new THREE.BufferGeometry();
  const corners = [[-900, -ext], [len, -ext], [len, W + ext], [-900, W + ext]].map(([x, y]) => V([x, y, g * y]));
  gp.setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
  gp.computeVertexNormals();
  const ground = new THREE.Mesh(gp, groundMat); ground.receiveShadow = true; context.add(ground);
  // ступень: верх ровный на высоте порога
  const stepTop = hl, low = Math.min(0, g * (W + ext)) - 20;
  const sw = W + 2 * ext - 200, depth = 900;
  const step = new THREE.Mesh(new THREE.BoxGeometry(sw / 1000, (stepTop - low) / 1000, depth / 1000), stepMat);
  step.position.copy(V([-depth / 2, W / 2, (stepTop + low) / 2]));
  step.receiveShadow = step.castShadow = true; context.add(step);
  // стена и дверь
  const wall = new THREE.Mesh(new THREE.BoxGeometry(sw / 1000, 2.4, 0.12), wallMat);
  wall.position.copy(V([-depth - 60, W / 2, stepTop + 1200])); wall.receiveShadow = true; context.add(wall);
  const door = new THREE.Mesh(new THREE.BoxGeometry(Math.max(W + 60, 800) / 1000, 2.05, 0.04), doorMat);
  door.position.copy(V([-depth + 20, W / 2, stepTop + 1025])); context.add(door);
}

function line(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([V(a), V(b)]);
  const l = new THREE.Line(geo, laserMat); l.renderOrder = 10; lasers.add(l);
}
function buildLasers() {
  const { hl, hr } = params, g = (hl - hr) / W, d = model.dims;
  tags = [];
  const off = 60;
  // высоты в точках А и Б у края ступени
  line([off, 0, 0], [off, 0, hl]); line([off, W, g * W], [off, W, g * W + hr]);
  tags.push({ at: [off, -70, hl / 2], text: `А ${fmt(hl)}`, cls: "point" });
  tags.push({ at: [off, W + 70, g * W + hr / 2], text: `Б ${fmt(hr)}`, cls: "point" });
  // ширина по переднему краю ступени
  const zt = hl + 70;
  line([0, 0, zt], [0, W, zt]);
  tags.push({ at: [0, W / 2, zt + 30], text: `${d.ply.width}` });
  // длина по земле у боковин
  line([0, -60, 0], [d.left.ground, -60, 0]);
  tags.push({ at: [d.left.ground / 2, -120, 0], text: `${d.left.ground}` });
  if (model.kind === "skew") {
    line([0, W + 60, g * W], [d.right.ground, W + 60, g * W]);
    tags.push({ at: [d.right.ground / 2, W + 120, g * W], text: `${d.right.ground}` });
  }
  const box = $("tags"); box.textContent = "";
  for (const t of tags) { const el = document.createElement("div"); el.className = "tag " + (t.cls || ""); el.textContent = t.text; box.append(el); t.el = el; }
}
const fmt = (v) => (Math.round(v * 10) / 10).toString().replace(".", ",");

function frameCamera() {
  const L = model.base / 1000, w = W / 1000;
  const r = Math.max(L, w, 0.6);
  controls.target.set(0, Math.max(params.hl, params.hr) / 2000, L * 0.45);
  // перекадрировать, только когда размер пандуса заметно изменился
  if (!frameCamera.r || Math.abs(r / frameCamera.r - 1) > 0.25) {
    const narrow = (stage.clientWidth < 600 ? 1.6 : 1) * 1.3;
    camera.position.set(controls.target.x + r * 1.1 * narrow, r * 0.85 * narrow, controls.target.z + r * 1.25 * narrow);
    frameCamera.r = r;
  }
  controls.update();
}

// ---------- разборка ----------
let currentExplode = 0;
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function applyExplode(t) {
  currentExplode = t;
  const n = 4;
  for (const [id, mesh] of Object.entries(meshes)) {
    const e = EXPLODE[id] || { d: [0, 0.1, 0], order: 0 };
    const local = Math.min(1, Math.max(0, (t * (1 + n * 0.15) - e.order * 0.15)));
    const k = easeOutBack(local) * (0.6 + Math.max(params.hl, params.hr) / 500);
    mesh.position.set(e.d[0] * k, e.d[1] * k, e.d[2] * k);
  }
  lasers.visible = dimsOn && t < 0.02;
  $("tags").hidden = !lasers.visible;
}
$("explode").addEventListener("input", (e) => { stopPlay(); applyExplode(+e.target.value); });

let playing = false, playT0 = 0;
function stopPlay() { playing = false; $("play").setAttribute("aria-pressed", "false"); }
$("play").addEventListener("click", () => {
  if (playing) return stopPlay();
  playing = true; playT0 = performance.now(); $("play").setAttribute("aria-pressed", "true");
  if (reduceMotion) { const to = currentExplode > 0.5 ? 0 : 1; applyExplode(to); $("explode").value = to; stopPlay(); }
});
function tickPlay(now) {
  if (!playing) return;
  const T = 5200, p = ((now - playT0) % T) / T;           // разборка, пауза, сборка, пауза
  const t = p < 0.35 ? p / 0.35 : p < 0.5 ? 1 : p < 0.85 ? 1 - (p - 0.5) / 0.35 : 0;
  const s = t * t * (3 - 2 * t);
  applyExplode(s); $("explode").value = s.toFixed(2);
}

// ---------- режимы ----------
let xray = false, dimsOn = true;
function applyXray() {
  for (const [id, m] of Object.entries(meshes)) {
    m.material.transparent = xray; m.material.opacity = xray ? (id === "ply" ? 0.18 : 0.55) : 1;
    m.material.depthWrite = !xray; m.userData.edges.material.opacity = xray ? 0.9 : 0.35;
    m.castShadow = !xray;
  }
}
const toggle = (id, fn) => $(id).addEventListener("click", (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", String(on)); fn(on); });
toggle("xray", (on) => { xray = on; applyXray(); });
toggle("dims", (on) => { dimsOn = on; applyExplode(currentExplode); });
toggle("lite", (on) => { renderer.shadowMap.enabled = !on; key.castShadow = !on; resize(); scene.traverse((o) => o.material && (o.material.needsUpdate = true)); });

// ---------- выбор детали ----------
function highlight(id) {
  selected = id;
  for (const [pid, m] of Object.entries(meshes)) {
    m.material.emissive = new THREE.Color(pid === id ? 0xef705d : 0x000000);
    m.material.emissiveIntensity = pid === id ? 0.45 : 0;
  }
  document.querySelectorAll("#parts tr").forEach((tr) => tr.setAttribute("aria-selected", String(tr.dataset.id === id)));
}
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(Object.values(meshes), false)[0];
  highlight(hit ? hit.object.userData.id : null);
  if (hit) showTab("parts");
});

// ---------- панель ----------
const fields = ["freeWidth", "width", "hl", "hr"];
function fillInputs() {
  for (const f of fields) if (document.activeElement !== $(f)) $(f).value = params[f] == null ? "" : String(params[f]).replace(".", ",");
  $("board").value = String(params.board);
}
for (const f of fields) $(f).addEventListener("input", (e) => {
  const v = num(e.target.value);
  if (f === "freeWidth") params.freeWidth = v;
  else if (v != null) params[f] = v;
  save(); rebuild();
});
$("board").addEventListener("change", (e) => { params.board = +e.target.value; save(); rebuild(); });
document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
  const [f, d] = b.dataset.step.split(":");
  params[f] = Math.round((params[f] + +d) * 10) / 10; save(); fillInputs(); rebuild();
}));
$("fitWidth").addEventListener("click", () => { if (params.freeWidth) { params.width = params.freeWidth; save(); fillInputs(); rebuild(); } else $("freeWidth").focus(); });

function renderPanel() {
  const d = model.dims, issues = model.issues;
  $("issues").innerHTML = issues.length
    ? issues.map((i) => `<div class="issue ${i.level}">${i.text}</div>`).join("")
    : `<div class="issue ok">Замер полный, пандус помещается.</div>`;
  const rows = [
    ["Порог А / Б", `${fmt(params.hl)} / ${fmt(params.hr)}`],
    ["Тип", model.kind === "flat" ? "ровный порог" : `перекос ${fmt(Math.abs(params.hl - params.hr))} мм`],
    ["Длина по земле", model.kind === "flat" ? `${d.left.ground}` : `${d.left.ground} слева, ${d.right.ground} справа`],
    ["Уклон настила", d.slope],
    ["Ребро", d.rib ? "есть (порог больше 200)" : "нет"],
  ];
  $("summary").innerHTML = rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td class="mm">${v}</td></tr>`).join("");
  const T = params.board;
  const parts = [
    ["ply", "Настил, фанера 18", model.kind === "flat" ? `${d.ply.width} × ${d.ply.length}` : `${d.ply.width} к порогу; края ${d.ply.left} и ${d.ply.right}; косой рез ${d.ply.front}`, 1],
    ["left", `Боковина левая, доска ${T}`, `высота ${d.left.height}, по земле ${d.left.ground}`, 1],
    ["right", `Боковина правая, доска ${T}`, `высота ${d.right.height}, по земле ${d.right.ground}`, 1],
    ["rear", `Задний борт, доска ${T}`, model.kind === "flat" ? `${d.rear.length} × ${d.rear.left}, фаска ${String(d.rear.bevel).replace(".", ",")}°` : `${d.rear.length}; высота ${d.rear.left} слева, ${d.rear.right} справа`, 1],
  ];
  if (d.rib) parts.push(["rib", `Ребро, доска ${T}`, `высота ${d.rib.height}, по земле ${d.rib.ground}${model.kind === "skew" ? " (на перекосе сверить с мастерской)" : ""}`, 1]);
  $("parts").innerHTML = parts.map(([id, n, s, q]) => `<tr data-id="${id}" aria-selected="${id === selected}" tabindex="0"><td>${n}</td><td class="mm">${s}</td><td class="mm q">${q}</td></tr>`).join("");
  document.querySelectorAll("#parts tr").forEach((tr) => {
    const pick = () => highlight(tr.dataset.id === selected ? null : tr.dataset.id);
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
}

function showTab(name) {
  for (const t of ["measure", "parts", "guide"]) {
    $("tab-" + t).setAttribute("aria-selected", String(t === name));
    $("pane-" + t).hidden = t !== name;
  }
}
for (const t of ["measure", "parts", "guide"]) $("tab-" + t).addEventListener("click", () => showTab(t));

// ---------- цикл ----------
function resize() {
  const r = stage.getBoundingClientRect();
  const lite = $("lite").getAttribute("aria-pressed") === "true";
  renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1 : 2));
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const tmp = new THREE.Vector3();
function placeTags() {
  if ($("tags").hidden) return;
  const r = stage.getBoundingClientRect();
  for (const t of tags) {
    tmp.copy(V(t.at)).applyMatrix4(world.matrixWorld).project(camera);
    const vis = tmp.z < 1;
    t.el.style.display = vis ? "" : "none";
    t.el.style.left = ((tmp.x + 1) / 2) * r.width + "px";
    t.el.style.top = ((1 - tmp.y) / 2) * r.height + "px";
  }
}
function loop(now) {
  tickPlay(now);
  controls.update();
  renderer.render(scene, camera);
  placeTags();
  requestAnimationFrame(loop);
}

fillInputs();
resize();
rebuild();
requestAnimationFrame(loop);
