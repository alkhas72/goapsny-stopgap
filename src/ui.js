import { createDrawings } from "./drawings.js";
import { createCutlist } from "./cutlist.js";
import { createShare } from "./share.js";
import { createPaints } from "./paints.js";
// Интерфейс конструктора в духе iOS: плавающее «стекло» над 3D, инспектор (компьютер) или шторка с тремя
// положениями (телефон), сгруппированные списки, живая схема замера, чертёж боковины, рассказ «Сборка».
// Все размеры берутся из model.dims и model.params (src/ramp.js); здесь они только выводятся и рисуются.
// Единственное объявление верхнего уровня — createUI: файлы потом склеиваются в один скрипт.
export function createUI(root, handlers) {
  const h = handlers || {};
  let st = null;
  const call = (name, ...a) => {
    if (name === "onParams" && st) { const k = Object.keys(a[0] || {})[0]; st.pendingKey = k; st.pendingRow = k; }
    if (typeof h[name] === "function") h[name](...a);
  };
  const doc = document;

  // ---------- данные ----------
  const PAINTS = createPaints().list();                // палитра OSOKA — src/paints.js (одна на 3D, мастер и AR)
  const MODES = [
    { v: "assembled", t: "Собран" }, { v: "exploded", t: "Разобран" },
    { v: "xray", t: "X-Ray" }, { v: "blueprint", t: "Чертёж" },
  ];
  const BOARDS = [35, 40, 45, 50];
  const STEP_IDS = ["measure", "sides", "rear", "rib", "ply", "finish"];
  const STEP_SHORT = { measure: "Замер", sides: "Боковины", rear: "Борт", rib: "Ребро", ply: "Настил", finish: "Покраска" };

  // ---------- мелочи ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const num = (v) => {                                   // вывод числа как есть, с запятой
    if (v == null || v === "" || !Number.isFinite(+v)) return "";
    return String(+(+v).toFixed(4)).replace(".", ",");
  };
  const parse = (s) => {                                 // ввод: запятая или точка, без округления
    const t = String(s).trim().replace(/\s+/g, "").replace(",", ".");
    if (t === "") return null;
    if (!/^-?\d+(\.\d*)?$/.test(t)) return undefined;
    const x = Number(t.replace(/[.]$/, ""));
    return Number.isFinite(x) ? x : undefined;
  };
  const lum = (hex) => { const n = parseInt(String(hex).slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const slopeTxt = (s) => String(s).replace(".", ",");
  const pad2 = (n) => String(n).padStart(2, "0");
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => Array.from(el.querySelectorAll(sel));

  const ICON = {
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" style="fill:none;stroke:currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    play: '<path d="M8.5 5.6v12.8c0 .8.9 1.3 1.6.9l10.2-6.4c.6-.4.6-1.4 0-1.8L10.1 4.7c-.7-.4-1.6.1-1.6.9z" style="fill:currentColor"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" style="fill:currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" style="fill:currentColor"/>',
    ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.6" style="fill:none;stroke:currentColor" stroke-width="1.7"/><path d="M6.5 8v3M10 8v4.2M13.5 8v3M17 8v4.2" style="stroke:currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 15-14-.3 9.6-5.6 15-13 15" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 19.5 13 11" style="stroke:currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    spin: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.8 3.6v3.6h-3.6M6.2 20.4v-3.6h3.6" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    isolate: '<path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.4" style="fill:currentColor"/>',
    steps: '<path d="M10 6.5h10M10 12h10M10 17.5h10" style="stroke:currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4.2 5.2 5.6 4.5v4M4 12.3c0-.8.6-1.3 1.3-1.3s1.3.5 1.3 1.2c0 1-2.6 2.2-2.6 2.8h2.7M4 16.6c.3-.4.7-.6 1.3-.6.7 0 1.3.4 1.3 1s-.5 1-1.2 1c.8 0 1.3.4 1.3 1.1s-.6 1.1-1.4 1.1c-.6 0-1-.2-1.3-.6" style="fill:none;stroke:currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M7 7l10 10M17 7 7 17" style="stroke:currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    chev: '<path d="M9.5 5.5 16 12l-6.5 6.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    minus: '<path d="M6 12h12" style="stroke:currentColor" stroke-width="2" stroke-linecap="round"/>',
    plus: '<path d="M6 12h12M12 6v12" style="stroke:currentColor" stroke-width="2" stroke-linecap="round"/>',
    warn: '<path d="M10.3 3.9 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" style="fill:currentColor"/><path d="M12 9v5" style="stroke:var(--on-sym)" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.3" style="fill:var(--on-sym)"/>',
    error: '<path d="M8.3 2.5h7.4l5.8 5.8v7.4l-5.8 5.8H8.3l-5.8-5.8V8.3z" style="fill:currentColor"/><path d="M9 9l6 6M15 9l-6 6" style="stroke:var(--on-sym)" stroke-width="2.2" stroke-linecap="round"/>',
    ok: '<circle cx="12" cy="12" r="10" style="fill:currentColor"/><path d="M7.5 12.4 10.5 15.3 16.6 9" style="fill:none;stroke:var(--on-sym)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    one: '<rect x="8" y="8" width="8" height="8" rx="1.5" style="fill:none;stroke:currentColor" stroke-width="1.8"/>',
    many: '<rect x="2.5" y="9" width="6" height="6" rx="1.2" style="fill:none;stroke:currentColor" stroke-width="1.7"/><rect x="9.5" y="4" width="6" height="6" rx="1.2" style="fill:none;stroke:currentColor" stroke-width="1.7"/><rect x="15.5" y="12" width="6" height="6" rx="1.2" style="fill:none;stroke:currentColor" stroke-width="1.7"/>',
    section: '<path d="M4 4l16 16" style="stroke:currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2.4 2.6"/><path d="M5.5 9.5V5.5h4M14.5 18.5h4v-4" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13.5 13.5 4H18a2 2 0 0 1 2 2v4.5L10.5 20H6a2 2 0 0 1-2-2z" style="fill:currentColor" opacity=".28"/>',
    cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" style="fill:none;stroke:currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 7.5 12 12l8-4.5M12 12v9" style="fill:none;stroke:currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    hammer: '<path d="M4 20l8.5-8.5M10.5 6.5l4-3 6 6-3 4z" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const icon = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[n]}</svg>`;

  const segHTML = (cls, label, items) =>
    `<div class="seg ${cls}" role="radiogroup" aria-label="${esc(label)}" style="--n:${items.length}">` +
    `<span class="seg-thumb" aria-hidden="true"></span>` +
    items.map((it) => `<button type="button" role="radio" aria-checked="false" tabindex="-1" data-v="${esc(it.v)}">${esc(it.t)}</button>`).join("") +
    `</div>`;

  const stepperHTML = (key, label, step, unitStep) => `
      <div class="stepper" role="group" aria-label="${esc(label)}: шаг ${unitStep}">
        <button type="button" data-step="${key}:-${step}" aria-label="${esc(label)} меньше на ${unitStep}">${icon("minus")}</button>
        <span class="stepper-div" aria-hidden="true"></span>
        <button type="button" data-step="${key}:${step}" aria-label="${esc(label)} больше на ${unitStep}">${icon("plus")}</button>
      </div>`;
  const bigInput = (key, extra = "") =>
    `<div class="big-input"><input id="ui-${key}" data-key="${key}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" enterkeyhint="done" ${extra}><span class="unit" aria-hidden="true">мм</span></div>`;
  const bigRow = (key, label, sub, step, unitStep, extra) => `
    <div class="row row-big" data-row="${key}">
      <label class="big-label" for="ui-${key}">${esc(label)}${sub ? `<span class="row-sub">${esc(sub)}</span>` : ""}</label>
      <div class="big-line">${bigInput(key, extra)}${step ? stepperHTML(key, label, step, unitStep) : ""}</div>
    </div>`;
  const abCol = (key, letter, side) => `
      <div class="ab-col" data-row="${key}">
        <label class="big-label" for="ui-${key}"><span class="ab-letter" aria-hidden="true">${letter}</span>Высота ${letter}<span class="row-sub ab-side">${side}</span></label>
        ${bigInput(key)}
        ${stepperHTML(key, "Высота " + letter, 1, "1 мм")}
      </div>`;

  // ---------- разметка ----------
  root.classList.add("ui");
  root.innerHTML = `
  <div class="ui-view">
    <section class="ui-split" aria-label="Чертёж рядом с моделью" hidden>
      <div class="ui-split-card">
        <div class="ui-split-head">
          <div><h2 class="t-headline">Чертёж</h2><p class="t-foot c2">Боковина и настил сбоку, мм. Та же конфигурация, что в 3D.</p></div>
        </div>
        <div class="ui-draw ui-draw-lg" data-draw="lg"></div>
        <p class="t-foot c2 ui-draw-cap" data-draw-cap="lg"></p>
        <div class="split-grid">
          <div><h3 class="split-h">Вид сверху</h3><div class="split-plan" data-split-plan></div></div>
          <div><h3 class="split-h">Детали, мм</h3><div class="split-parts" data-split-parts></div></div>
        </div>
      </div>
    </section>
    <div class="ui-stage" role="region" aria-label="3D-модель пандуса"></div>
  </div>

  <header class="ui-title material">
    <div class="ui-brand">GoApsny <span aria-hidden="true">·</span> Stopgap</div>
    <h1 class="t-large">Пандус</h1>
    <p class="ui-tag">Приставной пандус IDLab под ваш вход: замер, расчёт 1:6, сборка</p>
    <p class="ui-sub num-tab" data-sub></p>
    <button type="button" class="ik-entry" data-intake-open>${icon("plus")}<span>Новый замер</span></button>
  </header>

  <div class="ui-tools material" role="toolbar" aria-label="Инструменты модели" aria-orientation="vertical">
    <button type="button" class="tool" data-tool="spin" aria-pressed="false" title="Вращать модель">${icon("spin")}<span>Вращение</span></button>
    <button type="button" class="tool" data-tool="isolate" aria-pressed="false" title="Показать только выбранную деталь" aria-disabled="true">${icon("isolate")}<span>Изолировать</span></button>
    <button type="button" class="tool" data-tool="section" aria-pressed="false" title="Разрез модели">${icon("section")}<span>Разрез</span></button>
    <button type="button" class="tool" data-tool="dims" aria-pressed="true" title="Размерные линии">${icon("ruler")}<span>Размеры</span></button>
    <button type="button" class="tool" data-tool="lite" aria-pressed="false" title="Меньше эффектов, для слабых телефонов">${icon("leaf")}<span>Лёгкий</span></button>
  </div>

  <div class="ui-bottom">
    ${segHTML("seg-modes material", "Вид модели", MODES)}
    <div class="ui-capsule material">
      <button type="button" class="round prominent" data-play aria-pressed="false" aria-label="Запустить сборку и разборку">${icon("play", "i-play")}${icon("pause", "i-pause")}</button>
      <div class="slider-wrap">
        ${icon("one", "s-ico")}
        <input class="slider" data-explode type="range" min="0" max="1" step="0.01" value="0" aria-label="Разборка" aria-valuetext="Собран">
        ${icon("many", "s-ico")}
      </div>
    </div>
  </div>

  <aside class="ui-panel" aria-label="Параметры пандуса">
    <div class="ui-grab ui-dragzone"><button type="button" class="grabber" data-grabber aria-label="Шторка: развернуть или свернуть"></button></div>
    <div class="ui-scroll" data-scroll>
      <div class="ui-main" data-main>
        <div class="ui-head ui-dragzone">
          <div class="ui-head-row">
            <div class="ui-head-text">
              <div class="head-cap">Ширина × длина</div>
              <div class="t-title3 num-tab" data-head-title></div>
              <div class="status" data-status aria-live="polite"></div>
            </div>
            <button type="button" class="btn-prominent" data-story-open>${icon("steps")}<span>Сборка</span></button>
          </div>
          <div class="tiles" data-tiles></div>
        </div>

        <button type="button" class="card-link card-intake" data-intake-open>
          <span class="card-link-ico">${icon("ruler")}</span>
          <span class="card-link-text"><span class="t-headline">Новый замер</span><span class="t-foot c2">Пошагово у входа: фото, свободная ширина, высоты А и Б, заявка на пандус</span></span>
          ${icon("chev", "chev")}
        </button>

        <section class="sec" aria-labelledby="h-measure">
          <h2 class="sec-h" id="h-measure">Замер</h2>
          <div class="group">
            <div class="cell-schema" data-schema role="img" aria-label="Вид сверху: проём, пандус и точки А и Б"></div>
            ${bigRow("freeWidth", "Свободная ширина", "в месте примыкания, обязательно", 0, "", 'placeholder="не измерена" aria-required="true" aria-describedby="f-measure"')}
            ${bigRow("width", "Ширина пандуса", "не больше свободной", 10, "10 мм")}
            <button type="button" class="row row-action" data-fit>Взять по свободной ширине</button>
            <div class="row-ab">${abCol("hl", "А", "слева")}${abCol("hr", "Б", "справа")}</div>
            <div class="row-effect" data-effect aria-live="polite"></div>
            <div class="row row-field">
              <span class="row-label" id="l-board">Доска<span class="row-sub">боковины, мм</span></span>
              ${segHTML("seg-board", "Доска боковин, мм", BOARDS.map((b) => ({ v: b, t: b })))}
            </div>
          </div>
          <p class="sec-f" id="f-measure">Свободная ширина — в месте, где пандус встанет вплотную к ступени, с учётом наличников. Точки А и Б — на краях пандуса, расстояние между ними равно его ширине. Значения вводятся как есть, можно с десятыми.</p>
          <div class="issues" data-issues aria-live="polite"></div>
        </section>

        <button type="button" class="card-link" data-story-open>
          <span class="card-link-ico">${icon("steps")}</span>
          <span class="card-link-text"><span class="t-headline">Как устроен этот пандус</span><span class="t-foot c2" data-story-count></span></span>
          ${icon("chev", "chev")}
        </button>

        <section class="sec" aria-labelledby="h-ramp">
          <h2 class="sec-h" id="h-ramp">Пандус</h2>
          <div class="group" data-summary></div>
          <p class="sec-f">Уклон 1:6 по высокой стороне, фанера 18, резы 90° (верх заднего борта скашивается под уклон), размеры целыми мм.</p>
        </section>

        <section class="sec" aria-labelledby="h-parts">
          <h2 class="sec-h" id="h-parts">Детали</h2>
          <div class="group" data-parts role="list"></div>
          <p class="sec-f">Нажмите на деталь: она подсветится в модели и на чертеже. Черновик, сверить с мастерской.</p>
        </section>

        <section class="sec" aria-labelledby="h-paint">
          <h2 class="sec-h" id="h-paint">Покраска OSOKA</h2>
          <div class="group finish">
            <div class="finish-hero" data-finish-hero aria-hidden="true">
              <span class="finish-sheen"></span>
              <span class="finish-meta"><span>OSOKA UR 305</span><span>2 слоя · ALSiUR</span></span>
            </div>
            <div class="swatch-name" aria-live="polite"><span class="finish-name" data-paint-name></span><span class="finish-ral num-tab" data-paint-ral></span></div>
            <div class="swatches" role="radiogroup" aria-label="Цвет покраски" data-swatches>
              ${PAINTS.map((p, i) => `<button type="button" role="radio" aria-checked="false" tabindex="-1" class="swatch${p.hex ? "" : " swatch-raw"}" data-paint="${p.hex || ""}" data-i="${i}" aria-label="${esc(p.ral + (p.hex ? ", " + p.name : ""))}" style="--sw:${p.hex || "transparent"}"></button>`).join("")}
            </div>
          </div>
          <p class="sec-f">Цвет на экране приблизительный. Финишный слой с наполнителем ALSiUR против скольжения.</p>
        </section>

        <section class="sec" aria-labelledby="h-draw">
          <h2 class="sec-h" id="h-draw">Чертёж</h2>
          <div class="group">
            <div class="ui-draw" data-draw="sm"></div>
            <p class="t-foot c2 ui-draw-cap" data-draw-cap="sm"></p>
          </div>
          <p class="sec-f">Боковина левая и настил 18 мм сбоку, в масштабе.<span data-draw-skewnote> Пунктир — боковина правая.</span> На компьютере режим «Чертёж» открывает его рядом с 3D.</p>
        </section>

        <section class="sec" aria-labelledby="h-shop">
          <h2 class="sec-h" id="h-shop">Для мастерской</h2>
          <div class="group">
            <div class="sheet-prev" data-sheet-prev role="img" aria-label="Лист А4: детали с размерами и штамп"></div>
            <div class="row row-btns">
              <button type="button" class="btn-plain" data-export="svg">${icon("download")}<span>Лист SVG</span></button>
              <button type="button" class="btn-filled" data-export="zip">${icon("download")}<span>SVG + DXF</span></button>
            </div>
            <p class="t-foot c2 export-note" data-export-note aria-live="polite"></p>
          </div>
          <div class="group group-gap">
            <div class="cell-schema cut-prev" data-cut-prev role="img" aria-label="Раскрой листа фанеры"></div>
            <div data-cut-rows></div>
          </div>
          <div class="issues" data-cut-issues></div>
          <div class="group group-gap">
            <div class="row row-kv"><span class="row-label">Код конфигурации<span class="row-sub">открывает этот пандус снова</span></span><code class="kv-v num-tab share-code" data-share-code></code></div>
            <button type="button" class="row row-action" data-copy-code>Скопировать код</button>
          </div>
          <p class="sec-f">Лист А4 в стандартном масштабе, DXF R12 в мм для ЧПУ и CorelDRAW (слои CUT и DIM). Раскрой: лист 1220×2440 и доска 40×150 по прайсу и расчёту; длина доски 3000 и торцовка 10 мм пока допущение, сверить с мастерской.</p>
        </section>

        <section class="sec" aria-labelledby="h-guide">
          <h2 class="sec-h" id="h-guide">Как мерить</h2>
          <div class="group">
            <div class="cell-schema" role="img" aria-label="Вид сверху: дверной проём с наличниками, свободная ширина между ними, пандус у ступени, точки А и Б на краях пандуса">${guideTopSVG()}</div>
            <ol class="steps">
              <li><span class="step-n" aria-hidden="true">1</span><span>Найдите, где пандус встанет к ступени напротив двери.</span></li>
              <li><span class="step-n" aria-hidden="true">2</span><span>Измерьте <b>свободную ширину</b> в этом месте с учётом наличников и других выступов. Это обязательный замер.</span></li>
              <li><span class="step-n" aria-hidden="true">3</span><span>Решите ширину пандуса: не больше свободной ширины, чтобы он встал вплотную.</span></li>
              <li><span class="step-n" aria-hidden="true">4</span><span>Измерьте высоту ступени слева (А) и справа (Б) на краях будущего пандуса. При ширине 90 см между точками 90 см.</span></li>
              <li><span class="step-n" aria-hidden="true">5</span><span>Введите обе высоты и ширину как есть, без округления.</span></li>
            </ol>
          </div>
          <div class="group group-gap">
            <div class="cell-schema" role="img" aria-label="Вид спереди: земля под наклоном. Замер на полной ширине даёт настоящую разницу высот, замер на узкой базе 30–50 сантиметров — меньшую">${guideNarrowSVG()}</div>
            <div class="banner banner-warn banner-in">${icon("warn", "b-ico")}<span>Не мерьте на узкой базе 30–50 см. Если земля наклонена, разница высот выйдет меньше настоящей, и пандус встанет с перекосом.</span></div>
          </div>
          <p class="sec-f">Двух высот у краёв для этой конструкции достаточно. Если свободная ширина не указана, замер считается неполным.</p>
        </section>

        <section class="sec" aria-labelledby="h-made">
          <h2 class="sec-h" id="h-made">Как это сделано</h2>
          <div class="group">
            <div class="row row-info">${icon("hammer", "info-ico")}<span>Формула из расчёта пандусов №1–5, тех, что уже сделаны в мастерской.</span></div>
            <div class="row row-info">${icon("ok", "info-ico info-ok")}<span>Сверена с CAD-движком build123d: 11 сверок размеров и 2 проверки правил.</span></div>
            <div class="row row-info">${icon("ruler", "info-ico")}<span>Размеры деталей целыми мм, резы 90°, скос только у верха заднего борта.</span></div>
            <div class="row row-info">${icon("cube", "info-ico")}<span>3D считается в браузере на three.js, без сервера.</span></div>
          </div>
        </section>
      </div>

      <section class="ui-story" data-story hidden aria-roledescription="пошаговый рассказ" aria-label="Сборка по шагам">
        <div class="story-top ui-dragzone">
          <span class="eyebrow num-tab" data-story-eyebrow></span>
          <button type="button" class="round small" data-story-close aria-label="Выйти из сборки">${icon("close")}</button>
        </div>
        <ol class="story-track ui-dragzone" data-story-track aria-label="Шаги"></ol>
        <div class="story-body" data-story-body>
          <h2 class="story-q" tabindex="-1" data-story-q></h2>
          <p class="story-a" data-story-a></p>
          <div class="group story-spec" data-story-spec></div>
        </div>
        <div class="story-nav">
          <button type="button" class="btn-plain" data-story-back>${icon("back")}<span>Назад</span></button>
          <button type="button" class="btn-filled" data-story-next><span>Далее</span>${icon("chev")}</button>
        </div>
        <p class="t-foot c2 story-hint">Листайте шаги жестом влево-вправо или стрелками на клавиатуре.</p>
      </section>
    </div>
  </aside>`;

  const stageEl = $(".ui-stage");
  const panel = $(".ui-panel");
  const scroller = $("[data-scroll]");
  const slider = $("[data-explode]");
  const playBtn = $("[data-play]");
  const modesEl = $(".seg-modes");
  const boardEl = $(".seg-board");
  const splitEl = $(".ui-split");
  const mqPhone = matchMedia("(max-width: 819.98px)");
  const mqSplit = matchMedia("(min-width: 1100px)");
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");

  st = {
    model: null, mode: "assembled", explode: 0, playing: false, selected: null, paint: "#102C54",
    xray: false, blueprint: false, dims: true, lite: false, spin: false, isolate: false, section: false,
    pendingKey: null, effectTimer: 0,
    story: null, detent: "peek", partsKey: "",
  };

  // ---------- сегменты ----------
  function setSeg(el, v) {
    const btns = $$("button", el);
    let idx = -1;
    btns.forEach((b, i) => {
      const on = String(b.dataset.v) === String(v);
      if (on) idx = i;
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    btns.forEach((b, i) => b.tabIndex = i === (idx < 0 ? 0 : idx) ? 0 : -1);
    el.style.setProperty("--i", Math.max(idx, 0));
    el.classList.toggle("seg-none", idx < 0);
  }
  function segKeys(el, pick) {
    el.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) pick(b.dataset.v); });
    el.addEventListener("keydown", (e) => {
      const k = e.key; if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(k)) return;
      e.preventDefault(); e.stopPropagation();
      const btns = $$("button", el), cur = Math.max(0, btns.indexOf(doc.activeElement));
      const n = btns.length;
      const nx = k === "Home" ? 0 : k === "End" ? n - 1 : (cur + (k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1) + n) % n;
      btns[nx].focus(); pick(btns[nx].dataset.v);
    });
  }

  // ---------- режимы ----------
  function drawBig() {
    if (!st.model || splitEl.hidden) return;
    const w = Math.round($('[data-draw="lg"]').clientWidth) || 620;
    $('[data-draw="lg"]').innerHTML = drawingSVG(st.model, Math.max(360, w), true);
    markSelected();
  }
  function applySplit() {
    const on = st.mode === "blueprint" && mqSplit.matches;
    root.classList.toggle("is-split", on);
    splitEl.hidden = !on;
    if (on) drawBig();
  }
  window.addEventListener("resize", () => drawBig());
  function pickMode(v) {
    st.mode = v; setSeg(modesEl, v);
    const wantX = v === "xray", wantB = v === "blueprint";
    if (st.xray !== wantX) { st.xray = wantX; call("onXray", wantX); }
    if (st.blueprint !== wantB) { st.blueprint = wantB; call("onBlueprint", wantB); }
    if (v === "assembled" || v === "exploded" || v === "xray") { const t = v === "exploded" ? 1 : 0; setExplodeUI(t); call("onExplode", t); }
    applySplit();
  }
  segKeys(modesEl, pickMode);
  mqSplit.addEventListener?.("change", applySplit);

  function setExplodeUI(t) {
    st.explode = Math.min(1, Math.max(0, +t || 0));
    if (doc.activeElement !== slider || !slider.matches(":active")) slider.value = String(st.explode);
    slider.style.setProperty("--p", st.explode * 100 + "%");
    const pct = Math.round(st.explode * 100);
    slider.setAttribute("aria-valuetext", pct === 0 ? "Собран" : pct === 100 ? "Разобран полностью" : `Разборка ${pct} %`);
    if (st.mode === "assembled" || st.mode === "exploded") {
      const m = st.explode > 0.001 ? "exploded" : "assembled";
      if (m !== st.mode) { st.mode = m; setSeg(modesEl, m); }
    }
  }
  slider.addEventListener("input", () => { setExplodeUI(+slider.value); call("onExplode", +slider.value); });
  playBtn.addEventListener("click", () => call("onPlay"));

  // ---------- инструменты ----------
  $(".ui-tools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tool]"); if (!b) return;
    const k = b.dataset.tool;
    if (k === "isolate") {
      if (!st.selected) { flashHint(b); return; }
      st.isolate = !st.isolate; call("onIsolate", st.isolate ? st.selected : null);
    } else {
      st[k] = !st[k];
      call({ spin: "onSpin", section: "onSection", dims: "onDims", lite: "onLite" }[k], st[k]);
    }
    syncTools();
  });
  function flashHint(b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
  function syncTools() {
    for (const k of ["spin", "isolate", "section", "dims", "lite"]) $(`[data-tool="${k}"]`).setAttribute("aria-pressed", st[k] ? "true" : "false");
    const iso = $('[data-tool="isolate"]');
    iso.setAttribute("aria-disabled", st.selected ? "false" : "true");
    iso.title = st.selected ? "Показать только выбранную деталь" : "Сначала выберите деталь в списке или в модели";
  }

  // ---------- поля ввода ----------
  const inputs = $$("input[data-key]");
  for (const inp of inputs) {
    inp.addEventListener("input", () => {
      fitInput(inp);
      const k = inp.dataset.key, v = parse(inp.value);
      inp.closest(".big-input").classList.toggle("bad", v === undefined);
      if (v === undefined) return;
      if (v === null) { if (k === "freeWidth") call("onParams", { freeWidth: null }); return; }
      call("onParams", { [k]: v });
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") inp.blur();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const k = inp.dataset.key; if (k === "freeWidth") return;
        e.preventDefault(); stepParam(k, (e.key === "ArrowUp" ? 1 : -1) * (k === "width" ? 10 : 1));
      }
    });
    inp.addEventListener("blur", () => { inp.closest(".big-input").classList.remove("bad"); syncInputs(); });
  }
  function stepParam(k, d) {
    const p = st.model?.params; if (!p) return;
    const v = parseFloat(((+p[k] || 0) + d).toFixed(6));   // только убирает хвост двоичной арифметики: 85,5 + 1 = 86,5
    call("onParams", { [k]: v });
  }
  root.addEventListener("click", (e) => {
    const s = e.target.closest("[data-step]"); if (!s) return;
    const [k, d] = s.dataset.step.split(":"); stepParam(k, +d);
  });
  $("[data-fit]").addEventListener("click", () => {
    const fw = st.model?.params?.freeWidth; if (fw > 0) call("onParams", { width: fw });
  });
  segKeys(boardEl, (v) => call("onParams", { board: +v }));

  function fitInput(inp) {
    const v = inp.value;
    inp.style.width = v ? `${v.length + 0.35}ch` : `${Math.max(1, inp.placeholder.length) * 0.62 + 0.4}ch`;
  }
  function syncInputs() {
    const p = st.model?.params; if (!p) return;
    for (const inp of inputs) { if (doc.activeElement !== inp) inp.value = num(p[inp.dataset.key]); fitInput(inp); }
  }
  $$(".big-input").forEach((b) => b.addEventListener("click", (e) => { if (e.target === b || e.target.classList.contains("unit")) $("input", b).focus(); }));

  // ---------- детали ----------
  $("[data-parts]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-part]"); if (!b) return;
    const id = b.dataset.part;
    call("onSelect", st.selected === id ? null : id);
  });
  root.addEventListener("click", (e) => {
    const g = e.target.closest("g[data-part], .split-part"); if (!g) return;
    call("onSelect", st.selected === g.dataset.part ? null : g.dataset.part);
  });
  function partDims(id, d, p) {
    const sk = !!d.ply.left;
    if (id === "ply") return sk ? `${num(d.ply.width)} × ${d.ply.left} × 18 · у Б ${d.ply.right}` : `${num(d.ply.width)} × ${d.ply.length} × 18`;
    if (id === "left" || id === "right") return `высота ${d[id].height} · по земле ${d[id].ground} · доска ${num(p.board)}`;
    if (id === "rear") return d.rear.bevel != null ? `${d.rear.length} × ${d.rear.left} · скос ${num(d.rear.bevel)}°` : `${d.rear.length} · высота ${d.rear.left} / ${d.rear.right}`;
    if (id === "rib" && d.rib) return `высота ${d.rib.height} · по земле ${d.rib.ground}`;
    return "";
  }
  const dotStyle = (part) => part.mat === "ply" ? (st.paint ? `background:${st.paint}` : "") : "";
  function renderParts(m) {
    const box = $("[data-parts]");
    const key = m.parts.map((x) => x.id).join(",");
    if (key !== st.partsKey) {
      st.partsKey = key;
      box.innerHTML = m.parts.map((x) => `
        <button type="button" class="row row-part" role="listitem" data-part="${esc(x.id)}" aria-pressed="false">
          <span class="dot dot-${esc(x.mat)}" aria-hidden="true"></span>
          <span class="row-text"><span class="row-title"></span><span class="row-detail num-tab"></span></span>
          <svg class="ico check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" style="fill:none;stroke:currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>`).join("");
    }
    for (const x of m.parts) {
      const row = $(`[data-part="${x.id}"]`, box);
      $(".row-title", row).textContent = x.name;
      $(".row-detail", row).textContent = partDims(x.id, m.dims, m.params);
      $(".dot", row).setAttribute("style", dotStyle(x));
    }
    markSelected();
  }
  function markSelected() {
    $$("[data-part]").forEach((r) => {
      const on = r.dataset.part === st.selected;
      r.classList.toggle("sel", on);
      if (r.tagName === "BUTTON") r.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // ---------- покраска ----------
  $("[data-swatches]").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch"); if (!b) return;
    call("onPaint", b.dataset.paint || null);
  });
  $("[data-swatches]").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const all = $$("[data-swatches] .swatch"), cur = Math.max(0, all.indexOf(doc.activeElement));
    const nx = (cur + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + all.length) % all.length;
    all[nx].focus(); call("onPaint", all[nx].dataset.paint || null);
  });
  function paintInfo() { return PAINTS.find((p) => (p.hex || null) === (st.paint ? st.paint.toUpperCase() : null)) || { hex: st.paint, ral: st.paint || "Без покраски", name: "" }; }
  function syncPaint() {
    const info = paintInfo();
    $$("[data-swatches] .swatch").forEach((b) => {
      const on = (b.dataset.paint || null) === (info.hex || null);
      b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
    });
    $("[data-paint-ral]").textContent = info.hex ? `${info.ral} · ${info.hex}` : "фанера и сосна без покрытия";
    $("[data-paint-name]").textContent = info.hex ? info.name : "Без покраски";
    const hero = $("[data-finish-hero]");
    hero.style.setProperty("--sw", info.hex || "#C9A46E");
    hero.classList.toggle("finish-raw", !info.hex);
    hero.classList.toggle("finish-light", !!info.hex && lum(info.hex) > 0.45);
    if (st.model) { for (const x of st.model.parts) { const d = $(`[data-part="${x.id}"] .dot`); if (d) d.setAttribute("style", dotStyle(x)); } }
    if (st.story === "finish") renderStory();
  }

  // ---------- схема замера (вид сверху) ----------
  function schemaSVG(m) {
    const p = m.params, d = m.dims;
    const W = 340, cx = W / 2;
    const fw = p.freeWidth > 0 ? p.freeWidth : null;
    const wide = fw != null && p.width > fw;
    const bad = fw == null || wide;
    const span = Math.max(fw || 0, p.width, 1);
    const k = 236 / span;
    const ow = (fw || p.width) * k, rw = p.width * k;
    const wallY = 40, depth = Math.max(46, Math.min(118, d.totalLen * k));
    const H = wallY + depth + 52;
    const ol = cx - ow / 2, or = cx + ow / 2, rl = cx - rw / 2, rr = cx + rw / 2;
    const jam = 11;
    const red = "var(--red)";
    const op = fw == null ? `stroke-dasharray="4 3"` : "";
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" aria-hidden="true" focusable="false">`;
    // стена и проём
    s += `<rect x="0" y="0" width="${W}" height="${wallY}" style="fill:var(--sch-wall)"/>`;
    s += `<rect x="${ol}" y="0" width="${ow}" height="${wallY}" style="fill:var(--sch-open)"/>`;
    s += `<rect x="${ol - jam}" y="${wallY - 30}" width="${jam}" height="38" rx="2" style="fill:var(--sch-jamb);${fw == null ? `stroke:${red}` : ""}" ${op}/>`;
    s += `<rect x="${or}" y="${wallY - 30}" width="${jam}" height="38" rx="2" style="fill:var(--sch-jamb);${fw == null ? `stroke:${red}` : ""}" ${op}/>`;
    // свободная ширина
    const fy = 14;
    s += `<g style="stroke:${fw == null ? red : "var(--sch-ink)"}" stroke-width="1.2" ${op}><line x1="${ol + 2}" y1="${fy}" x2="${or - 2}" y2="${fy}"/><path d="M${ol + 2} ${fy - 4}v8M${or - 2} ${fy - 4}v8" stroke-dasharray="none"/></g>`;
    const ftxt = fw == null ? "свободная ширина не измерена" : `свободно ${num(fw)}`;
    s += `<rect x="${cx - (fw == null ? 92 : 46)}" y="${fy + 3}" width="${fw == null ? 184 : 92}" height="17" rx="8.5" style="fill:var(--sch-open)"/>`;
    s += `<text x="${cx}" y="${fy + 15}" text-anchor="middle" class="sch-t" style="fill:${fw == null ? "var(--red-ink)" : "var(--sch-ink)"}">${esc(ftxt)}</text>`;
    // пандус
    s += `<rect x="${rl}" y="${wallY}" width="${rw}" height="${depth}" rx="3" style="fill:${wide ? "var(--red-soft)" : "var(--sch-ramp)"};stroke:${wide ? red : "var(--sch-ramp-edge)"}" stroke-width="1.6"/>`;
    for (let i = 1; i < 6; i++) { const y = wallY + (depth * i) / 6; s += `<line x1="${rl + 4}" y1="${y}" x2="${rr - 4}" y2="${y}" style="stroke:${wide ? red : "var(--sch-ramp-edge)"}" stroke-opacity=".22"/>`; }
    if (wide) {
      s += `<rect x="${rl}" y="${wallY}" width="${Math.max(0, ol - rl)}" height="10" style="fill:${red}" opacity=".85"/><rect x="${or}" y="${wallY}" width="${Math.max(0, rr - or)}" height="10" style="fill:${red}" opacity=".85"/>`;
    }
    s += `<text x="${cx}" y="${wallY + depth / 2 + 4}" text-anchor="middle" class="sch-t sch-b" style="fill:${wide ? "var(--red-ink)" : "var(--sch-ramp-ink)"}">${wide ? "шире проёма" : "пандус"}</text>`;
    // точки А и Б
    const pt = (x, L, val, anchor, dx) =>
      `<circle cx="${x}" cy="${wallY}" r="9.5" style="fill:var(--navy-pt);stroke:var(--cell)" stroke-width="2"/><text x="${x}" y="${wallY + 4}" text-anchor="middle" class="sch-pt">${L}</text>` +
      `<text x="${x + dx}" y="${wallY + 26}" text-anchor="${anchor}" class="sch-t sch-b" style="fill:var(--sch-ink)">${L} ${esc(num(val))}</text>`;
    s += pt(rl, "А", p.hl, rl < 40 ? "start" : "end", rl < 40 ? 4 : -6) + pt(rr, "Б", p.hr, rr > W - 40 ? "end" : "start", rr > W - 40 ? -4 : 6);
    // ширина пандуса
    const dy = wallY + depth + 16;
    s += `<g style="stroke:${wide ? red : "var(--sch-ink)"}" stroke-width="1.2"><line x1="${rl}" y1="${dy}" x2="${rr}" y2="${dy}"/><path d="M${rl} ${dy - 5}v10M${rr} ${dy - 5}v10"/></g>`;
    s += `<text x="${cx}" y="${dy + 20}" text-anchor="middle" class="sch-t" style="fill:${wide ? "var(--red-ink)" : "var(--sch-ink)"}">А–Б = ширина пандуса ${esc(num(p.width))}</text>`;
    s += `</svg>`;
    return { svg: s, bad };
  }

  // ---------- чертёж (вид сбоку) ----------
  function drawingSVG(m, W, big) {
    const d = m.dims, sk = m.kind === "skew";
    const bh = d.left.height, G = d.left.ground, T = 18;
    const plyL = d.ply.left || d.ply.length;
    const Rh = d.right.height, Rg = d.right.ground;
    const off = sk ? bh - Rh : 0;                      // подъём земли справа (только для пропорций рисунка)
    const fs = big ? 13 : 12;
    const padL = big ? 92 : 76, padR = big ? 36 : 22, padT = big ? 56 : 46, padB = big ? 58 : 48;
    const zTop = bh + T + 4, zBot = Math.min(0, off);
    const xMax = Math.max(G, sk ? Rg : 0) + T;
    const s = Math.min((W - padL - padR) / xMax, (big ? 360 : 200) / (zTop - zBot));
    const Hh = padT + (zTop - zBot) * s + padB;
    const X = (x) => padL + x * s, Y = (z) => padT + (zTop - z) * s;
    const hyp = Math.hypot(G, bh), nx = bh / hyp, nz = G / hyp;
    const P = (pts) => pts.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(" ");
    let o = `<svg viewBox="0 0 ${W} ${Hh.toFixed(0)}" width="100%" aria-hidden="true" focusable="false" class="drw${big ? " drw-lg" : ""}" style="font-size:${fs}px">`;
    o += `<defs><pattern id="hatch-${big ? "l" : "s"}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--drw-hatch)" stroke-width="1.2"/></pattern></defs>`;
    // ступень и земля
    const stepW = Math.min(40, padL - 50);
    o += `<rect x="${X(0) - stepW}" y="${Y(bh + T)}" width="${stepW}" height="${Y(0) - Y(bh + T) + 10}" style="fill:url(#hatch-${big ? "l" : "s"});stroke:var(--drw-line)" stroke-width="1"/>`;
    o += `<line x1="${X(0) - stepW}" y1="${Y(0)}" x2="${X(xMax) + 8}" y2="${Y(0)}" style="stroke:var(--drw-line)" stroke-width="1.4"/>`;
    // правая боковина пунктиром
    if (sk) {
      o += `<g data-part="right" class="drw-part"><polygon points="${P([[0, off], [Rg, off], [0, off + Rh]])}" class="drw-dash" style="fill:none;stroke:var(--drw-ink)" stroke-width="1.4" stroke-dasharray="5 4"/>`;
      o += `<line x1="${X(0)}" y1="${Y(off)}" x2="${X(Rg) + 6}" y2="${Y(off)}" style="stroke:var(--drw-line)" stroke-width="1" stroke-dasharray="3 3"/></g>`;
    }
    // левая боковина и настил
    o += `<g data-part="left" class="drw-part"><polygon points="${P([[0, 0], [G, 0], [0, bh]])}" style="fill:var(--drw-pine);stroke:var(--drw-ink)" stroke-width="1.4" stroke-linejoin="round"/></g>`;
    o += `<g data-part="ply" class="drw-part"><polygon points="${P([[0, bh], [G, 0], [G + T * nx, T * nz], [T * nx, bh + T * nz]])}" style="fill:var(--drw-ply);stroke:var(--drw-ink)" stroke-width="1.4" stroke-linejoin="round"/></g>`;
    // размер: высота боковины и +18
    const vx = X(0) - stepW - 14;
    const tick = (x, y) => `<line x1="${x - 5}" y1="${y}" x2="${x + 5}" y2="${y}"/>`;
    o += `<g style="stroke:var(--drw-dim)" stroke-width="1.1"><line x1="${vx}" y1="${Y(0)}" x2="${vx}" y2="${Y(bh + T)}"/>${tick(vx, Y(0))}${tick(vx, Y(bh))}${tick(vx, Y(bh + T))}</g>`;
    o += `<text x="${vx - 8}" y="${(Y(0) + Y(bh)) / 2 + fs * 0.35}" text-anchor="end" class="drw-t drw-b">${bh}</text>`;
    o += `<text x="${vx - 8}" y="${Math.min((Y(bh) + Y(bh + T)) / 2 + fs * 0.35, (Y(0) + Y(bh)) / 2 - fs * 0.85)}" text-anchor="end" class="drw-t drw-acc">+18</text>`;
    // размер: по земле
    const gy = Y(Math.min(0, off)) + 22;
    o += `<g style="stroke:var(--drw-dim)" stroke-width="1.1"><line x1="${X(0)}" y1="${gy}" x2="${X(G)}" y2="${gy}"/><line x1="${X(0)}" y1="${gy - 5}" x2="${X(0)}" y2="${gy + 5}"/><line x1="${X(G)}" y1="${gy - 5}" x2="${X(G)}" y2="${gy + 5}"/></g>`;
    o += `<text x="${(X(0) + X(G)) / 2}" y="${gy + fs + 5}" text-anchor="middle" class="drw-t"><tspan class="drw-b">${G}</tspan> по земле</text>`;
    // размер: настил вдоль ската
    const a = [X(T * nx), Y(bh + T * nz)], b = [X(G + T * nx), Y(T * nz)];
    const dl = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / dl, uy = (b[1] - a[1]) / dl;
    const qx = uy, qy = -ux, gap = 16;
    const a2 = [a[0] + qx * gap, a[1] + qy * gap], b2 = [b[0] + qx * gap, b[1] + qy * gap];
    const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
    o += `<g style="stroke:var(--drw-dim)" stroke-width="1.1"><line x1="${a2[0]}" y1="${a2[1]}" x2="${b2[0]}" y2="${b2[1]}"/>` +
      `<line x1="${a2[0] - qx * 5}" y1="${a2[1] - qy * 5}" x2="${a2[0] + qx * 5}" y2="${a2[1] + qy * 5}"/><line x1="${b2[0] - qx * 5}" y1="${b2[1] - qy * 5}" x2="${b2[0] + qx * 5}" y2="${b2[1] + qy * 5}"/></g>`;
    const mx = (a2[0] + b2[0]) / 2 + qx * 7, my = (a2[1] + b2[1]) / 2 + qy * 7;
    o += `<text transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${ang.toFixed(2)})" text-anchor="middle" class="drw-t">настил <tspan class="drw-b">${plyL}</tspan></text>`;
    // уклон: подпись внутри боковины, у порога, где она выше всего
    const sx = X(G * 0.07) + 2, sz = Y(bh * 0.22);
    if ((bh * 0.78) * s > fs + 4) o += `<text x="${sx.toFixed(1)}" y="${sz.toFixed(1)}" class="drw-t drw-acc">${esc(slopeTxt(d.slope))}</text>`;
    o += `</svg>`;
    return o;
  }
  function drawCaption(m) {
    const d = m.dims, sk = m.kind === "skew";
    return `Боковина А ${d.left.height} × ${d.left.ground}` + (sk ? `, Б ${d.right.height} × ${d.right.ground}` : "") +
      ` · настил ${d.ply.left || d.ply.length}${sk ? ` / ${d.ply.right}` : ""} · уклон ${slopeTxt(d.slope)} · доска ${num(m.params.board)}`;
  }

  // ---------- схемы «Как мерить» (статичные) ----------
  function guideTopSVG() {
    return `<svg viewBox="0 0 340 236" width="100%" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="340" height="44" style="fill:var(--sch-wall)"/>
      <rect x="88" y="0" width="164" height="44" style="fill:var(--sch-open)"/>
      <text x="170" y="14" text-anchor="middle" class="sch-t" style="fill:var(--sch-mut)">дверной проём</text>
      <rect x="76" y="12" width="12" height="40" rx="2" style="fill:var(--sch-jamb)"/><rect x="252" y="12" width="12" height="40" rx="2" style="fill:var(--sch-jamb)"/>
      <text x="70" y="30" text-anchor="end" class="sch-t" style="fill:var(--sch-mut)">наличник</text>
      <g style="stroke:var(--tint-ink)" stroke-width="1.4"><line x1="90" y1="38" x2="250" y2="38"/><path d="M90 33v10M250 33v10"/></g>
      <text x="170" y="31" text-anchor="middle" class="sch-t sch-b" style="fill:var(--tint-ink)">свободная ширина</text>
      <rect x="96" y="44" width="148" height="122" rx="3" style="fill:var(--sch-ramp);stroke:var(--sch-ramp-edge)" stroke-width="1.6"/>
      <text x="170" y="110" text-anchor="middle" class="sch-t sch-b" style="fill:var(--sch-ramp-ink)">пандус</text>
      <circle cx="96" cy="44" r="10" style="fill:var(--navy-pt);stroke:var(--cell)" stroke-width="2"/><text x="96" y="48.5" text-anchor="middle" class="sch-pt">А</text>
      <circle cx="244" cy="44" r="10" style="fill:var(--navy-pt);stroke:var(--cell)" stroke-width="2"/><text x="244" y="48.5" text-anchor="middle" class="sch-pt">Б</text>
      <text x="84" y="72" text-anchor="end" class="sch-t" style="fill:var(--sch-ink)">высота А</text>
      <text x="256" y="72" class="sch-t" style="fill:var(--sch-ink)">высота Б</text>
      <g style="stroke:var(--sch-ink)" stroke-width="1.2"><line x1="96" y1="184" x2="244" y2="184"/><path d="M96 178v12M244 178v12"/></g>
      <text x="170" y="206" text-anchor="middle" class="sch-t sch-b" style="fill:var(--sch-ink)">А–Б = ширина пандуса</text>
      <text x="170" y="226" text-anchor="middle" class="sch-t" style="fill:var(--sch-mut)">при ширине 90 см точки в 90 см друг от друга</text>
    </svg>`;
  }
  function guideNarrowSVG() {
    // земля наклонена: z(x) = 120 - 0.1·x; ступень ровная на y = 34
    const gy = (x) => 132 - (x - 20) * 0.11;
    const bar = (x, cls, w) => `<line x1="${x}" y1="34" x2="${x}" y2="${gy(x).toFixed(1)}" style="stroke:${cls}" stroke-width="${w}" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 340 196" width="100%" aria-hidden="true" focusable="false">
      <rect x="20" y="22" width="300" height="12" rx="2" style="fill:var(--sch-wall)"/>
      <text x="24" y="16" class="sch-t" style="fill:var(--sch-mut)">ступень ровная</text>
      <path d="M20 ${gy(20)} L320 ${gy(320)} L320 150 L20 150 Z" style="fill:var(--sch-ground)"/>
      <line x1="20" y1="${gy(20)}" x2="320" y2="${gy(320)}" style="stroke:var(--sch-ink)" stroke-width="1.6"/>
      <text x="316" y="146" text-anchor="end" class="sch-t" style="fill:var(--sch-mut)">земля под наклоном</text>
      ${bar(40, "var(--navy-pt)", 4)}${bar(300, "var(--navy-pt)", 4)}
      <text x="48" y="96" class="sch-t sch-b" style="fill:var(--sch-ink)">А</text><text x="292" y="80" text-anchor="end" class="sch-t sch-b" style="fill:var(--sch-ink)">Б</text>
      <g stroke-dasharray="4 3">${bar(130, "var(--red)", 2.4)}${bar(210, "var(--red)", 2.4)}</g>
      <g style="stroke:var(--navy-pt)" stroke-width="1.2"><line x1="40" y1="166" x2="300" y2="166"/><path d="M40 161v10M300 161v10"/></g>
      <text x="170" y="161" text-anchor="middle" class="sch-t sch-b" style="fill:var(--sch-ink)">90 см — верная разница</text>
      <g style="stroke:var(--red)" stroke-width="1.2"><line x1="130" y1="184" x2="210" y2="184"/><path d="M130 179v10M210 179v10"/></g>
      <text x="214" y="188" class="sch-t sch-b" style="fill:var(--red-ink)">40 см — меньше</text>
    </svg>`;
  }

  // ---------- рассказ «Сборка» ----------
  function storySteps() {
    const m = st.model; if (!m) return STEP_IDS.filter((x) => x !== "rib");
    return STEP_IDS.filter((x) => x !== "rib" || m.dims.rib);
  }
  function storyContent(id) {
    const m = st.model, d = m.dims, p = m.params, sk = m.kind === "skew";
    const rows = [];
    const r = (k, v) => rows.push([k, v]);
    let q = "", a = "";
    if (id === "measure") {
      q = "Где ставить точки А и Б?";
      a = "На краях будущего пандуса, прямо напротив двери: расстояние между точками равно ширине пандуса. Свободную ширину меряйте в месте примыкания, с наличниками.";
      r("Точка А, слева", `${num(p.hl)} мм`); r("Точка Б, справа", `${num(p.hr)} мм`);
      r("Ширина пандуса", `${num(p.width)} мм`); r("Свободная ширина", p.freeWidth > 0 ? `${num(p.freeWidth)} мм` : "не измерена");
    } else if (id === "sides") {
      q = "Почему боковина ниже порога на 18 мм?";
      a = "Сверху на боковины ляжет фанера 18 мм, и настил выйдет вровень с порогом. Длина по земле — порог, умноженный на 6.";
      r("Левая, высота × по земле", `${d.left.height} × ${d.left.ground}`);
      r("Правая, высота × по земле", `${d.right.height} × ${d.right.ground}`);
      r("Доска", `${num(p.board)} мм`);
    } else if (id === "rear") {
      q = "Что держит пандус у порога?";
      a = "Задний борт между боковинами упирается в ступень и держит каркас в форме. Все резы прямые, 90°.";
      r("Длина", `${d.rear.length} мм`);
      r(sk ? "Высота слева / справа" : "Высота", sk ? `${d.rear.left} / ${d.rear.right} мм` : `${d.rear.left} мм`);
      if (d.rear.bevel != null) r("Скос верха", `${num(d.rear.bevel)}°`);
    } else if (id === "rib") {
      q = "Когда нужно ребро?";
      a = "Только при пороге больше 200 мм. Посередине встаёт третья опора, чтобы фанера не прогибалась.";
      if (d.rib) { r("Высота", `${d.rib.height} мм`); r("По земле", `${d.rib.ground} мм`); }
      r("Порог", `${num(Math.max(p.hl, p.hr))} мм`);
    } else if (id === "ply") {
      q = "Почему уклон 1:6?";
      a = "Это принятый уклон изделия: длина выходит в шесть высот порога, и пандус остаётся переносным. Настил — один лист фанеры 18 мм.";
      r("Настил", sk ? `${num(d.ply.width)} × ${d.ply.left} / ${d.ply.right}` : `${num(d.ply.width)} × ${d.ply.length}`);
      r("Уклон настила", slopeTxt(d.slope)); r("Общая длина", `${d.totalLen} мм`);
    } else if (id === "finish") {
      const pi = paintInfo();
      q = "Чем покрыт пандус?";
      a = "Полиуретан OSOKA UR 305 в два слоя. В финишный слой добавлен наполнитель ALSiUR против скольжения, сверху — трафарет goapsny.org.";
      r("Цвет", pi.hex ? `${pi.ral} · ${pi.name}` : "без покраски"); r("Слоёв", "2");
      r("Против скольжения", "ALSiUR"); r("Трафарет", "goapsny.org");
    }
    return { q, a, rows };
  }
  function renderStory() {
    const box = $("[data-story]");
    if (!st.story || !st.model) return;
    const ids = storySteps(), i = ids.indexOf(st.story), n = ids.length;
    $("[data-story-eyebrow]").textContent = `Шаг ${pad2(i + 1)} из ${pad2(n)}`;
    $("[data-story-track]").innerHTML = ids.map((id, j) =>
      `<li class="${j < i ? "done" : j === i ? "cur" : ""}"><button type="button" data-goto="${id}" aria-label="Шаг ${j + 1}: ${STEP_SHORT[id]}"${j === i ? ' aria-current="step"' : ""}>` +
      `${j === i ? '<span class="here" aria-hidden="true">вы здесь</span>' : ""}<span class="node num-tab" aria-hidden="true">${pad2(j + 1)}</span><span class="lbl" aria-hidden="true">${STEP_SHORT[id]}</span></button></li>`).join("");
    box.style.setProperty("--prog", n > 1 ? i / (n - 1) : 0);
    $("[data-story-track]").style.setProperty("--n", n);
    const c = storyContent(st.story);
    $("[data-story-q]").textContent = c.q;
    $("[data-story-a]").textContent = c.a;
    $("[data-story-spec]").innerHTML = c.rows.map(([k, v]) => `<div class="row row-kv"><span class="c2">${esc(k)}</span><span class="kv-v num-tab">${esc(v)}</span></div>`).join("");
    $("[data-story-back]").disabled = i <= 0;
    const nx = $("[data-story-next]");
    $("span", nx).textContent = i >= n - 1 ? "Готово" : "Далее";
  }
  function openStory(id, notify = true) {
    const ids = storySteps();
    const next = id && ids.includes(id) ? id : id ? ids[0] : null;
    const was = st.story;
    st.story = next;
    $("[data-main]").hidden = !!next;
    $("[data-story]").hidden = !next;
    root.classList.toggle("is-story", !!next);
    if (mqPhone.matches && !!next !== !!was) snap(next ? "medium" : st.detent);
    if (next) {
      renderStory();
      scroller.scrollTop = 0;
    }
    if (notify && next !== was) call("onStep", next);
    if (next && was !== next) requestAnimationFrame(() => { if (notify) $("[data-story-q]").focus({ preventScroll: true }); });
    if (!next && was && notify) $("[data-story-open]").focus({ preventScroll: true });
  }
  function storyMove(dir) {
    if (!st.story) return;
    const ids = storySteps(), i = ids.indexOf(st.story) + dir;
    if (i >= ids.length) { openStory(null); return; }
    if (i < 0) return;
    const body = $("[data-story-body]");
    body.classList.remove("in-l", "in-r"); void body.offsetWidth; body.classList.add(dir > 0 ? "in-r" : "in-l");
    openStory(ids[i]);
  }
  $$("[data-story-open]").forEach((b) => b.addEventListener("click", () => openStory(storySteps()[0])));
  $("[data-story-close]").addEventListener("click", () => openStory(null));
  $("[data-story-back]").addEventListener("click", () => storyMove(-1));
  $("[data-story-next]").addEventListener("click", () => storyMove(1));
  $("[data-story-track]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto]"); if (!b) return;
    const ids = storySteps(), d = ids.indexOf(b.dataset.goto) - ids.indexOf(st.story);
    if (d) { const body = $("[data-story-body]"); body.classList.remove("in-l", "in-r"); void body.offsetWidth; body.classList.add(d > 0 ? "in-r" : "in-l"); }
    openStory(b.dataset.goto);
  });
  doc.addEventListener("keydown", (e) => {
    if (!st.story || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.matches?.("input, textarea, select, [contenteditable]") || t.closest?.('[role="radiogroup"]'))) return;
    if (e.key === "ArrowRight") { e.preventDefault(); storyMove(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); storyMove(-1); }
    else if (e.key === "Escape") { e.preventDefault(); openStory(null); }
  });

  // ---------- шторка (телефон) ----------
  const DET = { peek: 0.25, medium: 0.55, large: 0.9 };
  const detPx = (k) => {
    const H = window.innerHeight;
    if (k === "medium" && st.story) return Math.round(H * 0.6);
    if (k === "peek") return Math.round(Math.max(H * DET.peek, 196));
    return Math.round(H * DET[k]);
  };
  let sheetOff = 0;
  function setSheet(off, live) {
    sheetOff = off;
    const full = detPx("large");
    panel.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
    root.style.setProperty("--sheet-vis", Math.max(0, full - off).toFixed(1) + "px");
    if (!live) {
      const vis = full - off;
      root.style.setProperty("--view-bottom", Math.max(0, Math.min(vis, detPx("medium")) - 20) + "px");
    }
    root.classList.toggle("chrome-hide", full - off > detPx("medium") + 24);
  }
  function snap(k) {
    st.detent = k; root.dataset.detent = k;
    if (!mqPhone.matches) return;
    root.style.setProperty("--sheet-snap", detPx(k) + "px");
    setSheet(detPx("large") - detPx(k), false);
    $("[data-grabber]").setAttribute("aria-label", k === "large" ? "Шторка развёрнута. Свернуть" : "Шторка. Развернуть");
  }
  function layout() {
    if (mqPhone.matches) {
      panel.style.height = detPx("large") + "px";
      root.classList.add("no-anim"); snap(st.detent);
      requestAnimationFrame(() => root.classList.remove("no-anim"));
    } else {
      panel.style.height = ""; panel.style.transform = "";
      root.style.removeProperty("--sheet-vis"); root.style.removeProperty("--view-bottom"); root.style.removeProperty("--sheet-snap");
      root.classList.remove("chrome-hide");
    }
  }
  $("[data-grabber]").addEventListener("click", () => {
    if (dragState.suppress) return;
    snap(st.detent === "peek" ? "medium" : st.detent === "medium" ? "large" : "peek");
  });
  const dragState = { suppress: false };
  let drag = null;
  panel.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || drag) return;
    const t = e.target;
    if (t.closest("input, select, textarea, .slider")) return;
    const phone = mqPhone.matches;
    if (!phone && !st.story) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, off0: sheetOff, axis: null, zone: !!t.closest(".ui-dragzone"), story: !!t.closest("[data-story]"), samples: [[e.clientY, performance.now()]] };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      const ax = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
      if (ax === "y" && (!mqPhone.matches || (st.detent === "large" && !drag.zone && scroller.scrollTop > 0) || (st.detent === "large" && !drag.zone && dy < 0))) { drag = null; return; }
      if (ax === "x" && !drag.story) { drag = null; return; }
      drag.axis = ax;
      try { panel.setPointerCapture(e.pointerId); } catch {}
      if (ax === "y") root.classList.add("is-dragging");
    }
    if (drag.axis === "y") {
      const max = detPx("large") - detPx("peek");
      let off = drag.off0 + dy;
      if (off < 0) off = -Math.sqrt(-off) * 2;
      if (off > max) off = max + Math.sqrt(off - max) * 2;
      setSheet(off, true);
      drag.samples.push([e.clientY, performance.now()]); if (drag.samples.length > 6) drag.samples.shift();
    }
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    root.classList.remove("is-dragging");
    if (!d.axis) return;
    dragState.suppress = true; setTimeout(() => { dragState.suppress = false; }, 60);
    if (d.axis === "y") {
      const [y0, t0] = d.samples[0], [y1, t1] = d.samples[d.samples.length - 1];
      const v = cancel ? 0 : (y1 - y0) / Math.max(1, t1 - t0);
      const full = detPx("large"), proj = full - (sheetOff + v * 220);
      let best = "peek", bd = Infinity;
      for (const k of ["peek", "medium", "large"]) { const dd = Math.abs(detPx(k) - proj); if (dd < bd) { bd = dd; best = k; } }
      snap(best);
    } else if (!cancel) {
      const dx = e.clientX - d.x0;
      if (Math.abs(dx) > 48) storyMove(dx < 0 ? 1 : -1);
    }
  }
  window.addEventListener("pointerup", (e) => endDrag(e, false));
  window.addEventListener("pointercancel", (e) => endDrag(e, true));
  panel.addEventListener("click", (e) => { if (dragState.suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  panel.addEventListener("focusin", (e) => {
    if (mqPhone.matches && st.detent !== "large" && e.target.matches("input[type=text]")) snap("large");
  });
  mqPhone.addEventListener?.("change", layout);
  window.addEventListener("resize", layout);
  window.visualViewport?.addEventListener?.("resize", () => { if (mqPhone.matches && !doc.activeElement?.matches?.("input")) layout(); });

  // ---------- отрисовка ----------
  function effectText(k, a, b) {
    const pa = a.params, pb = b.params, da = a.dims, db = b.dims;
    const L = { hl: "А", hr: "Б", width: "Ширина", board: "Доска", freeWidth: "Свободная ширина" }[k];
    if (!L || pa[k] === pb[k]) return "";
    const dv = (pb[k] ?? 0) - (pa[k] ?? 0);
    const head = k === "freeWidth" || pa[k] == null ? `${L} ${num(pb[k]) || "не измерена"}` : `${L} ${dv > 0 ? "+" : "−"}${num(Math.abs(+dv.toFixed(4)))} мм`;
    const ch = [];
    const pair = (t, x, y) => { if (x !== y && x != null && y != null) ch.push(`${t} ${x} → ${y}`); };
    if (a.kind !== b.kind) ch.push(b.kind === "skew" ? "появился перекос" : "порог стал ровным");
    if (!da.rib !== !db.rib) ch.push(db.rib ? "добавилось ребро" : "ребро не нужно");
    if (k === "hl" || k === "hr") {
      const side = k === "hl" ? "left" : "right", nm = k === "hl" ? "левая" : "правая";
      if (da[side].ground !== db[side].ground) pair(`${nm} боковина`, da[side].ground, db[side].ground + " по земле");
      else pair(`${nm} боковина`, da[side].height, db[side].height + " высота");
      pair("общая длина", da.totalLen, db.totalLen);
    } else if (k === "width") {
      pair("настил", da.ply.width, db.ply.width); pair("задний борт", da.rear.length, db.rear.length);
    } else if (k === "board") {
      pair("задний борт", da.rear.length, db.rear.length);
    } else if (k === "freeWidth") {
      const was = a.issues.some((x) => x.level === "error"), now = b.issues.some((x) => x.level === "error");
      if (!(pb.freeWidth > 0)) ch.push("замер неполный");
      else if (pb.width > pb.freeWidth) ch.push("пандус не помещается");
      else ch.push(was && !now ? "теперь помещается" : "пандус помещается");
    }
    return ch.length ? `${head} → ${ch.slice(0, 2).join(", ")}` : "";
  }
  function showEffect(text) {
    const el = $("[data-effect]");
    clearTimeout(st.effectTimer);
    if (!text) return;
    el.textContent = text;
    el.classList.add("on");
    st.effectTimer = setTimeout(() => el.classList.remove("on"), 4200);
  }
  // ---------- для мастерской: лист А4, раскрой, код ----------
  const DRW = createDrawings(), CUT = createCutlist(), SHARE = createShare();
  function shareCode() {
    const p = st.model ? st.model.params : null;
    if (!p) return "";
    try { return SHARE.toHashName(SHARE.encode({ ...p, paint: st.paint })); } catch (e) { return "⚠ " + (e && e.message || "код не построен"); }
  }
  function cutSVG(sheet) {
    const W = sheet.size.h, H = sheet.size.w;                       // лист кладём горизонтально
    const pt = ([x, y]) => `${y},${x}`;
    let o = `<svg viewBox="-20 -20 ${W + 40} ${H + 40}" width="100%" aria-hidden="true" focusable="false">`;
    o += `<rect x="0" y="0" width="${W}" height="${H}" rx="6" class="cut-sheet"/>`;
    for (const q of sheet.parts) {
      const poly = q.poly || [];
      if (!poly.length) continue;
      o += `<polygon points="${poly.map(pt).join(" ")}" class="cut-part"/>`;
      const cx = poly.reduce((s, v) => s + v[1], 0) / poly.length, cy = poly.reduce((s, v) => s + v[0], 0) / poly.length;
      o += `<text x="${cx.toFixed(0)}" y="${cy.toFixed(0)}" class="cut-t" text-anchor="middle" dominant-baseline="middle">${q.rotated ? q.h + "×" + q.w : q.w + "×" + q.h}</text>`;
    }
    return o + `</svg>`;
  }
  function renderShop(m) {
    let sheetSvg = "";
    try { sheetSvg = DRW.toSVG(m).replace(/ width="[^"]*mm" height="[^"]*mm"/, ' width="100%"'); } catch (e) { sheetSvg = `<p class="t-foot c2">Лист не построен: ${esc(e.message)}</p>`; }
    $("[data-sheet-prev]").innerHTML = sheetSvg;
    let plan = null;
    try { plan = CUT.plan([m]); } catch { plan = null; }
    const rows = [];
    if (plan) {
      const sm = plan.summary;
      $("[data-cut-prev]").innerHTML = plan.sheets[0] ? cutSVG(plan.sheets[0]) : "";
      const pc = (v) => String(v).replace(".", ",") + " %";
      rows.push(["Фанера " + sm.sheet, `отход ${pc(sm.plyWastePct)}`, `${sm.sheets} шт.`]);
      for (const bd of sm.boards) rows.push(["Доска " + bd.stock, `отход ${pc(sm.boardWastePct)}`, `${bd.count} шт.`]);
      rows.push(["Резов всего", `пропил ${sm.kerf} мм`, `${sm.cuts}`]);
      $("[data-cut-issues]").innerHTML = plan.unplaced.map((u) => `<div class="banner banner-warn" role="status">${icon("warn", "b-ico")}<span><b>${esc(u.name)}:</b> ${esc(u.reason)}</span></div>`).join("");
    } else { $("[data-cut-prev]").innerHTML = ""; $("[data-cut-issues]").innerHTML = ""; }
    $("[data-cut-rows]").innerHTML = rows.map(([k, sub, v]) => `<div class="row row-kv"><span class="row-label">${esc(k)}<span class="row-sub num-tab">${esc(sub)}</span></span><span class="kv-v c2 num-tab">${esc(v)}</span></div>`).join("");
    $("[data-share-code]").textContent = shareCode();
  }
  function exportNote(t) { const el = $("[data-export-note]"); el.textContent = t || ""; }

  function render(m) {
    if (!m) return;
    const prev = st.model;
    st.model = m;
    if (prev && st.pendingKey) showEffect(effectText(st.pendingKey, prev, m));
    st.pendingKey = null;
    const p = m.params, d = m.dims, sk = m.kind === "skew";
    // подпись под заголовком
    const diff = +(Math.abs(p.hl - p.hr)).toFixed(4);
    $("[data-sub]").textContent = sk ? `А ${num(p.hl)} · Б ${num(p.hr)} · перекос ${num(diff)} мм` : `ровный ${num(p.hl)} мм`;
    // шапка шторки
    $("[data-head-title]").textContent = `${num(d.ply.width)} × ${d.totalLen} мм`;
    const errs = m.issues.filter((x) => x.level === "error").length, warns = m.issues.length - errs;
    const stt = errs ? ["err", "Есть ошибка в замере"] : warns ? ["warn", "Замер неполный"] : ["ok", "Замер полный"];
    const stEl = $("[data-status]");
    stEl.className = "status status-" + stt[0];
    stEl.innerHTML = `${icon(stt[0] === "err" ? "error" : stt[0] === "warn" ? "warn" : "ok", "st-ico")}<span>${esc(stt[1])}</span>`;
    $("[data-tiles]").innerHTML = [
      ["Уклон", slopeTxt(d.slope)],
      ["Боковина", `${d.left.height}${sk ? ` / ${d.right.height}` : ""}`],
      ["Ребро", d.rib ? "есть" : "нет"],
    ].map(([k, v]) => `<div class="tile"><span class="tile-k">${k}</span><span class="tile-v num-tab">${esc(v)}</span></div>`).join("");
    // схема
    const sc = schemaSVG(m);
    const scEl = $("[data-schema]");
    scEl.innerHTML = sc.svg;
    scEl.setAttribute("aria-label", `Вид сверху: свободная ширина ${p.freeWidth > 0 ? num(p.freeWidth) + " мм" : "не измерена"}, пандус ${num(p.width)} мм, точка А ${num(p.hl)} мм, точка Б ${num(p.hr)} мм`);
    scEl.classList.toggle("is-bad", sc.bad);
    syncInputs();
    $('[data-row="freeWidth"]').classList.toggle("row-missing", !(p.freeWidth > 0));
    const fit = $("[data-fit]");
    fit.disabled = !(p.freeWidth > 0) || p.width === p.freeWidth;
    fit.textContent = p.freeWidth > 0 ? (p.width === p.freeWidth ? `Ширина взята по свободной: ${num(p.freeWidth)} мм` : `Взять по свободной ширине: ${num(p.freeWidth)} мм`) : "Взять по свободной ширине";
    setSeg(boardEl, BOARDS.includes(+p.board) ? +p.board : "");
    // замечания
    $("[data-issues]").innerHTML = m.issues.length
      ? m.issues.map((x) => `<div class="banner banner-${x.level === "error" ? "err" : "warn"}" role="${x.level === "error" ? "alert" : "status"}">${icon(x.level === "error" ? "error" : "warn", "b-ico")}<span>${esc(x.text)}</span></div>`).join("")
      : `<div class="banner banner-ok" role="status">${icon("ok", "b-ico")}<span><b>Замер полный</b> · пандус помещается в свободную ширину</span></div>`;
    // итог
    const ground = sk ? `А ${d.left.ground} · Б ${d.right.ground} мм` : `${d.left.ground} мм`;
    $("[data-summary]").innerHTML = [
      ["Тип", sk ? "Перекос порога" : "Ровный порог"],
      ["Ширина", `${num(d.ply.width)} мм`],
      ["Длина по земле", ground],
      ["Уклон настила", slopeTxt(d.slope)],
      ["Ребро", d.rib ? `есть · высота ${d.rib.height} мм` : "нет · порог до 200 мм"],
      ["Общая длина", `${d.totalLen} мм`],
    ].map(([k, v]) => `<div class="row row-kv"><span>${k}</span><span class="kv-v c2 num-tab">${esc(v)}</span></div>`).join("");
    renderParts(m);
    // чертёж
    $('[data-draw="sm"]').innerHTML = drawingSVG(m, 340, false);
    drawBig();
    $("[data-split-plan]").innerHTML = sc.svg;
    $("[data-split-parts]").innerHTML = m.parts.map((x) => `<button type="button" class="split-part" data-part="${esc(x.id)}"><span class="sp-n">${esc(x.name)}</span><span class="sp-d num-tab">${esc(partDims(x.id, d, p))}</span></button>`).join("");
    $$("[data-draw-cap]").forEach((el) => el.textContent = drawCaption(m));
    $("[data-draw-skewnote]").hidden = !sk;
    renderShop(m);
    markSelected();
    // рассказ
    const ids = storySteps();
    $("[data-story-count]").textContent = `${ids.length} шагов: от замера до покраски`;
    if (st.story && !ids.includes(st.story)) openStory(st.story === "rib" ? "ply" : ids[0]);
    else if (st.story) renderStory();
  }

  function setSelected(id) {
    const prev = st.selected;
    st.selected = id || null;
    markSelected();
    if (st.isolate && prev !== st.selected) {
      if (st.selected) call("onIsolate", st.selected);
      else { st.isolate = false; call("onIsolate", null); }
    }
    syncTools();
  }
  function setPlaying(on) {
    st.playing = !!on;
    playBtn.setAttribute("aria-pressed", on ? "true" : "false");
    playBtn.setAttribute("aria-label", on ? "Остановить анимацию" : "Запустить сборку и разборку");
    root.classList.toggle("is-playing", !!on);
  }
  function setPaint(hex) { st.paint = hex ? String(hex).toUpperCase() : null; syncPaint(); if (st.model) $("[data-share-code]").textContent = shareCode(); }

  $$("[data-intake-open]").forEach((bt) => bt.addEventListener("click", () => call("onIntake")));
  $$("[data-export]").forEach((bt) => bt.addEventListener("click", () => call("onExport", bt.dataset.export)));
  $("[data-copy-code]").addEventListener("click", async () => {
    const code = shareCode(), btn = $("[data-copy-code]");
    let ok = false;
    if (code.startsWith("⚠")) return;
    try { await navigator.clipboard.writeText(code); ok = true; } catch { ok = false; }
    btn.textContent = ok ? "Код скопирован" : "Выделите код и скопируйте вручную";
    setTimeout(() => { btn.textContent = "Скопировать код"; }, 2200);
  });

  // ---------- старт ----------
  setSeg(modesEl, "assembled");
  setExplodeUI(0);
  setPlaying(false);
  syncTools();
  syncPaint();
  applySplit();
  root.dataset.detent = st.detent;
  layout();
  if (mqReduce.matches) root.classList.add("reduce");
  else {
    root.classList.add("intro");
    setTimeout(() => root.classList.remove("intro"), 2600);
  }
  setTimeout(() => root.classList.add("intro-done"), 7000);
  root.addEventListener("pointerdown", () => root.classList.add("intro-done"), { once: true });

  return {
    stageEl,
    render,
    setSelected,
    setExplode: setExplodeUI,
    setPlaying,
    setPaint,
    exportNote,
    setStep: (id) => openStory(id || null, false),
    setMode: (v) => { if (MODES.some((x) => x.v === v)) { st.mode = v; setSeg(modesEl, v); st.xray = v === "xray"; st.blueprint = v === "blueprint"; applySplit(); } },
  };
}
