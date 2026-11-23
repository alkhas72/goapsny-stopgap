// Связка: параметры → build() → интерфейс и 3D-сцена. Одна конфигурация на всё (ТЗ п. 4).
import { build, DEFAULTS, PARAMS_VERSION } from "./ramp.js";
import { createScene } from "./scene.js";
import { createUI } from "./ui.js";
import { createDrawings } from "./drawings.js";
import { createShare } from "./share.js";
import { createExport } from "./export.js";
import { createIntake } from "./intake.js";
import { createMood } from "./mood.js";
import { createMap } from "./map.js";

const STORE = "goapsny-stopgap:v" + PARAMS_VERSION;
const state = { params: { ...DEFAULTS }, paint: "#102C54", selected: null };
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch {}
// Код конфигурации в адресе (#s1-...) открывает тот же пандус: он главнее сохранённого
const SHARE = createShare(), DRW = createDrawings(), EXP = createExport();
try {
  const hn = (location.hash || "").replace(/^#/, "");
  if (/^s\d+-/.test(hn)) { const { params } = SHARE.decode(hn); const { paint, ...rest } = params; state.params = { ...DEFAULTS, ...rest }; state.paint = paint; }
} catch {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ params: state.params, paint: state.paint })); } catch {} };
const toNum = (v) => { if (v == null || v === "") return null; const x = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")); return Number.isFinite(x) ? x : null; };

let model = build(state.params);
let scene = null, playing = false, isoId = null;
// «Живая» оболочка (по умолчанию): настроения, витрина телефона, карта пандусов
const LIVING = document.documentElement.dataset.skin === "living";
const MOOD = LIVING ? createMood() : null;
// корпус телефона на витрине оживает, пока идёт сборка: приложение сообщает об этом родительской странице
const island = (on) => { if (window.parent !== window) try { window.parent.postMessage({ stopgap: "island", on: !!on }, location.origin); } catch {} };

// Один путь для замеров: и конструктор, и мастер «Новый замер» меняют параметры здесь
function onParams(patch) {
  for (const [k, v] of Object.entries(patch)) {
    const x = toNum(v);
    if (k === "freeWidth") state.params.freeWidth = x;
    else if (x != null) state.params[k] = x;
  }
  save(); update();
}
// Один путь для покраски: и конструктор, и мастер перекрашивают модель здесь
function onPaint(hex) { state.paint = hex || null; save(); scene.setPaint(state.paint); ui.setPaint(state.paint); }

const ui = createUI(document.getElementById("app"), {
  onParams,
  onIntake(prefill) { intake.open(prefill); },
  onMap() { gmap.open(); },
  onMood(at) { MOOD?.cycle(at); },
  onShell(to) { if (window.parent !== window) try { window.parent.postMessage({ stopgap: "shell", to }, location.origin); } catch {} },
  onPaint,
  onExplode(t) { playing = false; scene.play(false); ui.setPlaying(false); scene.setExplode(t); island(false); },
  onPlay() { playing = !playing; scene.play(playing); ui.setPlaying(playing); island(playing); },
  onXray(on) { scene.setXray(on); },
  onBlueprint(on) { scene.setBlueprint(on); },
  onDims(on) { scene.setDims(on); },
  onLite(on) { scene.setLite(on); },
  onStep(id) { scene.setStep(id); },
  onIsolate(id) { isoId = id || null; scene.isolate(id); },
  onSpin(on) { scene.setSpin(on); },
  onSection(on) { scene.setSection(on); },
  async onExport(kind) {
    const p = model.params, base = `pandus-${String(p.hl).replace(".", ",")}-${String(p.hr).replace(".", ",")}`;
    const svg = DRW.toSVG(model);
    const data = kind === "zip" ? EXP.zip([{ name: base + ".svg", data: svg }, { name: base + ".dxf", data: DRW.toDXF(model) }]) : svg;
    ui.exportNote("");
    const r = await EXP.save(base + (kind === "zip" ? ".zip" : ".svg"), data);
    ui.exportNote(r === "saved" ? "" : r === "declined" ? "Сохранение отменено." : "Скачивание здесь недоступно.");
  },
  onSelect(id) { state.selected = id; scene.highlight(id); ui.setSelected(id); },
});

scene = createScene(ui.stageEl, {
  onPick(id) { state.selected = id; scene.highlight(id); ui.setSelected(id); },
  onExplodeProgress(t) { ui.setExplode(t); },
});

const dark = matchMedia("(prefers-color-scheme: dark)");
// сиреневая оболочка (?skin=violet) светлая при любой теме системы
const theme = () => document.documentElement.dataset.skin === "violet" ? "light" : document.documentElement.dataset.theme || (dark.matches ? "dark" : "light");
scene.setTheme(theme());
dark.addEventListener?.("change", () => scene.setTheme(theme()));
new MutationObserver(() => scene.setTheme(theme())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
if (MOOD) { scene.setMood?.(MOOD.get()); ui.setMood?.(MOOD.get()); MOOD.onChange((m) => { scene.setMood?.(m); ui.setMood?.(m); }); }

function update() {
  model = build(state.params);
  scene.setModel(model);
  ui.render(model);
  if (state.selected && !model.parts.some((p) => p.id === state.selected)) state.selected = null;
  scene.highlight(state.selected); ui.setSelected(state.selected);
}

scene.setPaint(state.paint); ui.setPaint(state.paint);
update();
const intake = createIntake().mount(document.getElementById("app"), {
  onParams,
  onPaint,
  getPaint: () => state.paint,
  getModel: () => model,
  save: (name, data) => EXP.save(name, data),
  // сцена сжимается или расширяется: заново навести камеру на тот же вид (изоляция сохраняется)
  onOpen() { requestAnimationFrame(() => { scene.resize(); scene.isolate(isoId); }); },
  onClose() { requestAnimationFrame(() => { scene.resize(); scene.isolate(isoId); }); },
});
// Карта пандусов: открыть пандус с карты в конструкторе — тем же путём, что и код конфигурации
const MAP = createMap();
const gmap = MAP.mount(document.getElementById("app"), {
  onOpenRamp({ params, paint } = {}) {
    if (params) state.params = { ...DEFAULTS, ...state.params, ...params };
    if (paint !== undefined) { state.paint = paint || null; scene.setPaint(state.paint); ui.setPaint(state.paint); }
    save(); update();
  },
  // «Замерить вход» на карте: мастер открывается сразу, место с карты уже подставлено
  onIntake(prefill) { intake.open(prefill); },
  onOpen() { requestAnimationFrame(() => scene.resize()); },
  onClose() { requestAnimationFrame(() => { scene.resize(); scene.isolate(isoId); }); },
});
// Витрина на компьютере открывает разделы приложения своими кнопками
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.stopgap !== "go") return;
  const to = e.data.to;
  if (to !== "intake" && intake.isOpen()) intake.close();
  if (to !== "map" && gmap.isOpen()) gmap.close();
  if (to === "map") gmap.open(); else if (to === "intake") intake.open();
});
// Вход в замер в один клик (договор с картой доступности GoApsny):
// ?measure=1&place_id=…&name=…&address=…&lat=…&lng=…&return=… сразу открывает мастер с подставленным местом
try {
  const pf = MAP.source.prefillFromQuery(location.search, { origin: location.origin });
  if (pf) setTimeout(() => intake.open(pf), 0);
} catch {}
new ResizeObserver(() => scene.resize()).observe(ui.stageEl);
addEventListener("hashchange", () => {
  try {
    const hn = (location.hash || "").replace(/^#/, "");
    if (!/^s\d+-/.test(hn)) return;
    const { params } = SHARE.decode(hn); const { paint, ...rest } = params;
    state.params = { ...DEFAULTS, ...rest }; state.paint = paint;
    save(); scene.setPaint(paint); ui.setPaint(paint); update();
  } catch {}
});

// Сиреневая оболочка (?skin=violet): круг нажатия под пальцем
if (document.documentElement.dataset.skin === "violet" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("button, [role=radio], a")) return;
    const r = document.createElement("span");
    r.className = "v-rip"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
    document.body.appendChild(r);
    r.addEventListener("animationend", () => r.remove());
  }, { passive: true });
}
