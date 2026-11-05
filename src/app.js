// Связка: параметры → build() → интерфейс и 3D-сцена. Одна конфигурация на всё (ТЗ п. 4).
import { build, DEFAULTS, PARAMS_VERSION } from "./ramp.js";
import { createScene } from "./scene.js";
import { createUI } from "./ui.js";
import { createDrawings } from "./drawings.js";
import { createShare } from "./share.js";
import { createExport } from "./export.js";

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
let scene = null, playing = false;

const ui = createUI(document.getElementById("app"), {
  onParams(patch) {
    for (const [k, v] of Object.entries(patch)) {
      const x = toNum(v);
      if (k === "freeWidth") state.params.freeWidth = x;
      else if (x != null) state.params[k] = x;
    }
    save(); update();
  },
  onPaint(hex) { state.paint = hex; save(); scene.setPaint(hex); ui.setPaint(hex); },
  onExplode(t) { playing = false; scene.play(false); ui.setPlaying(false); scene.setExplode(t); },
  onPlay() { playing = !playing; scene.play(playing); ui.setPlaying(playing); },
  onXray(on) { scene.setXray(on); },
  onBlueprint(on) { scene.setBlueprint(on); },
  onDims(on) { scene.setDims(on); },
  onLite(on) { scene.setLite(on); },
  onStep(id) { scene.setStep(id); },
  onIsolate(id) { scene.isolate(id); },
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
const theme = () => document.documentElement.dataset.theme || (dark.matches ? "dark" : "light");
scene.setTheme(theme());
dark.addEventListener?.("change", () => scene.setTheme(theme()));
new MutationObserver(() => scene.setTheme(theme())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function update() {
  model = build(state.params);
  scene.setModel(model);
  ui.render(model);
  if (state.selected && !model.parts.some((p) => p.id === state.selected)) state.selected = null;
  scene.highlight(state.selected); ui.setSelected(state.selected);
}

scene.setPaint(state.paint); ui.setPaint(state.paint);
update();
new ResizeObserver(() => scene.resize()).observe(ui.stageEl);
