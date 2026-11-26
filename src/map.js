import { createRampsSource } from "./ramps-source.js";
import { createRampLayers } from "./ramps-layer.js";
// НЕ ПОДКЛЮЧЕНО с 2026-11-26: карта одна, это карта доступности GoApsny (решение Алхаса о разделении).
// Приложение этот экран не монтирует и не грузит; файл оставлен как запас и ради чистых функций, которые проверяет tests/map.test.mjs.
// Карта пандусов (компонент ГИС): экран карты поверх конструктора.
// createMap().mount(root, handlers) → { open(), close(), isOpen(), refresh() }
// handlers: onOpenRamp({ params, paint }) — открыть пандус в конструкторе;
//           onIntake(prefill?) — мастер «Новый замер»: без аргумента с кнопки «Замерить вход»,
//             с { place: { place_id, name, address, entrance, lat, lng } } с кнопки «Замерить здесь» у точки;
//           onOpen(), onClose() — приложение перестраивает сцену.
// Данные — src/ramps-source.js (одна запись для всех источников). Движок карты спрятан в src/ramps-layer.js:
// экран зовёт только прослойку createView() — показать точки, выбрать точку, поставить точку.
// Пандус на карте — пурпурная точка, как центр пина на карте доступности GoApsny. Адрес ?view=map открывает карту сразу.
// createMap() без DOM отдаёт чистые функции (их проверяет tests/map.test.mjs). Единственное объявление верхнего уровня.
export function createMap(opts = {}) {
  const SRC = opts.source || createRampsSource(opts.sourceOptions);
  const LAY = opts.layers || createRampLayers();
  const STATUSES = SRC.STATUSES;

  // ---------- все тексты для людей: правятся здесь ----------
  const T = {
    title: "Карта пандусов",
    back: "Назад к конструктору",
    settings: "Слои и подложка",
    me: "Где я",
    zoomIn: "Приблизить", zoomOut: "Отдалить",
    mapAria: "Карта: пандусы отмечены пурпурными точками",
    legend: "пурпурная точка — приставной пандус",
    filtersAria: "Что показать на карте",
    chips: { all: "Все", installed: "Стоят", ordered: "Заявки", measured: "Замеры" },
    listAria: "Список пандусов",
    listMicro: "На карте",
    listHidden: "скрыты фильтром",
    demoBadge: "Примеры",
    demoNote: "Реестр пока пуст. Это три примера, таких пандусов нет.",
    demoTag: "пример",
    add: "Замерить вход",
    grabUp: "Развернуть список", grabDown: "Свернуть список",
    empty: {
      title: "Здесь пока пусто",
      text: "На карту попадают пандусы с точкой: реестр, заявки и замеры с этого устройства. Отметьте точку в мастере на шаге «Объект».",
      filtered: "Под этот фильтр ничего не попало.",
      showAll: "Показать все",
    },
    card: {
      aria: "Пандус",
      close: "Закрыть карточку",
      hl: "Высота А", hr: "Высота Б", width: "Ширина", free: "Проём",
      paint: "Покраска", raw: "без покраски",
      open: "Открыть в конструкторе",
      measure: "Замерить здесь",
      noDims: "Размеры ещё не сняты: открывать в конструкторе нечего.",
      when: { installed: "Установлен", ordered: "Заявка", measured: "Замер" },
      source: { demo: "Пример для показа карты. Такого пандуса нет.", request: "Заявка с этого устройства.", draft: "Черновик замера с этого устройства." },
      entrance: "вход",
    },
    set: {
      title: "Карта",
      base: "Подложка", layers: "Слои", data: "Данные",
      layerSub: { installed: "пандус стоит", ordered: "пандус заказан", measured: "снят только порог" },
      dots: "Сплошная точка — пандус стоит. Кольцо — пандуса ещё нет.",
      baseNote: "Основная подложка — OpenStreetMap. Carto — запасная, если основная не отвечает.",
      dataText: "Реестр data/ramps.geojson, заявки и замеры с этого устройства.",
      dataDemo: "Реестр пуст, поэтому показаны три примера.",
      done: "Готово",
    },
    fail: { title: "Карта не загрузилась", text: "Проверьте сеть. Список пандусов работает и без карты.", retry: "Повторить" },
    toast: {
      geoNone: "Геолокация здесь недоступна.", geoDenied: "Нет доступа к геолокации.", geoFail: "Не удалось определить место.",
      tilesDown: "Подложка не отвечает. В настройках карты есть запасная.",
    },
    mm: "мм",
  };

  // ---------- чистые функции ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plural = (n, one = "пандус", few = "пандуса", many = "пандусов") => {
    const a = Math.abs(n) % 100, b = a % 10;
    return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  };
  const fmtMm = (v) => (v == null ? "—" : String(+(+v).toFixed(1)).replace(".", ","));
  const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
  // Вторая строка в списке: «Заявка · А 98 · Б 98 мм»
  function subline(rec) {
    const r = rec.ramp, parts = [SRC.STATUS_T[r.status]];
    if (r.hl != null) parts.push(`А ${fmtMm(r.hl)}`, `Б ${fmtMm(r.hr ?? r.hl)} ${T.mm}`);
    return parts.join(" · ");
  }
  const whenText = (rec) => { const r = rec.ramp, dt = fmtDate(r.status === "installed" ? r.installed_at : r.status === "ordered" ? r.ordered_at : r.measured_at); return dt ? `${T.card.when[r.status]} ${dt}` : ""; };
  // Фильтр: капсула статуса показывает только его; повторное нажатие или «Все» возвращают всё
  function chipPick(visible, key) {
    const cur = [...visible];
    if (key === "all" || (cur.length === 1 && cur[0] === key)) return new Set(STATUSES);
    return new Set([key]);
  }
  const chipOn = (visible, key) => (key === "all" ? visible.size === STATUSES.length : visible.size < STATUSES.length && visible.has(key));
  // Слой в настройках: включить или выключить один статус; последний включённый не выключается
  function layerToggle(visible, key) {
    const s = new Set(visible);
    if (s.has(key)) { if (s.size > 1) s.delete(key); } else s.add(key);
    return s;
  }

  // ---------- экран ----------
  function mount(root, handlers) {
    const h = handlers || {};
    const doc = document;
    const mqWide = matchMedia("(min-width: 820px)");
    const mqCalm = matchMedia("(prefers-reduced-motion: reduce)");
    const P = 'style="fill:none;stroke:currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    const ICON = {
      back: `<path d="M14.5 5.5 8 12l6.5 6.5" ${P}/>`,
      chev: `<path d="M9.5 5.5 16 12l-6.5 6.5" ${P}/>`,
      arrow: `<path d="M5 12h14M13 6l6 6-6 6" ${P}/>`,
      layers: `<path d="m12 3.5 8.5 4.6L12 12.7 3.5 8.1z" ${P}/><path d="m3.8 12.4 8.2 4.4 8.2-4.4M3.8 16.4l8.2 4.4 8.2-4.4" ${P}/>`,
      me: `<path d="M20.2 3.8 3.9 10.5l6.8 2.8 2.8 6.8z" ${P}/>`,
      plus: `<path d="M12 5.5v13M5.5 12h13" ${P}/>`,
      minus: `<path d="M5.5 12h13" ${P}/>`,
      close: `<path d="M7 7l10 10M17 7 7 17" ${P}/>`,
      check: `<path d="M5.5 12.5 10 17 18.5 7.5" ${P}/>`,
    };
    const icon = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[n]}</svg>`;
    const dot = (installed, size = 18) => LAY.rampDot({ installed, size });

    const box = doc.createElement("section");
    box.className = "gm"; box.hidden = true; box.tabIndex = -1; box.setAttribute("aria-label", T.title);
    box.innerHTML = `
      <div class="gm-map" data-gm-map role="application" aria-label="${esc(T.mapAria)}"></div>
      <div class="gm-fail" data-gm-fail hidden>
        <p class="gm-fail-t">${esc(T.fail.title)}</p><p class="gm-fail-s">${esc(T.fail.text)}</p>
        <button type="button" class="btn-plain gm-btn" data-gm-retry><span>${esc(T.fail.retry)}</span></button>
      </div>
      <div class="gm-top" data-gm-top>
        <div class="gm-bar">
          <button type="button" class="gm-round" data-gm-close aria-label="${esc(T.back)}" title="${esc(T.back)}">${icon("back")}</button>
          <p class="gm-pill" role="status"><span class="gm-pill-dot" aria-hidden="true"></span><span class="gm-pill-t">${esc(T.title)}</span><span class="gm-pill-n" data-gm-n></span></p>
          <button type="button" class="gm-round" data-gm-settings aria-label="${esc(T.settings)}" title="${esc(T.settings)}" aria-haspopup="dialog">${icon("layers")}</button>
        </div>
        <div class="gm-filters" role="group" aria-label="${esc(T.filtersAria)}" data-gm-filters></div>
      </div>
      <div class="gm-float">
        <p class="gm-legend">${dot(true, 14)}<span>${esc(T.legend)}</span></p>
        <div class="gm-side">
          <div class="gm-zoom">
            <button type="button" class="gm-round" data-gm-zoom="1" aria-label="${esc(T.zoomIn)}" title="${esc(T.zoomIn)}">${icon("plus")}</button>
            <button type="button" class="gm-round" data-gm-zoom="-1" aria-label="${esc(T.zoomOut)}" title="${esc(T.zoomOut)}">${icon("minus")}</button>
          </div>
          <button type="button" class="gm-round gm-me-btn" data-gm-me aria-label="${esc(T.me)}" title="${esc(T.me)}">${icon("me")}</button>
        </div>
      </div>
      <section class="gm-sheet" data-gm-sheet aria-label="${esc(T.listAria)}">
        <button type="button" class="gm-grab" data-gm-grab aria-expanded="false" aria-label="${esc(T.grabUp)}"><span aria-hidden="true"></span></button>
        <header class="gm-head" data-gm-head></header>
        <div class="gm-list" data-gm-list></div>
      </section>
      <section class="gm-card" data-gm-card aria-label="${esc(T.card.aria)}" tabindex="-1"></section>
      <div class="gm-scrim" data-gm-scrim hidden></div>
      <section class="gm-set" data-gm-set role="dialog" aria-modal="true" aria-label="${esc(T.settings)}" tabindex="-1"></section>
      <p class="gm-toast" data-gm-toast role="status" aria-live="polite"></p>`;
    root.appendChild(box);
    const $ = (sel, el = box) => el.querySelector(sel);
    const mapEl = $("[data-gm-map]"), failEl = $("[data-gm-fail]"), topEl = $("[data-gm-top]"), sheet = $("[data-gm-sheet]"), grab = $("[data-gm-grab]"),
      headEl = $("[data-gm-head]"), listEl = $("[data-gm-list]"), card = $("[data-gm-card]"), scrim = $("[data-gm-scrim]"), setEl = $("[data-gm-set]"), toastEl = $("[data-gm-toast]");

    const st = {
      open: false, list: [], demo: false, loaded: false, visible: new Set(STATUSES), sel: null, up: false, settings: false,
      view: null, viewBusy: null, opener: null, hideT: 0, toastT: 0, fitted: false,
    };
    const shown = () => SRC.byStatus(st.list, [...st.visible]);
    const byId = (id) => st.list.find((r) => r.id === id) || null;
    const night = () => doc.documentElement.dataset.mood === "night" || doc.documentElement.dataset.theme === "dark";

    // ---------- отрисовка ----------
    function renderChips() {
      const c = SRC.counts(st.list);
      $("[data-gm-filters]").innerHTML = ["all", ...STATUSES].map((k) =>
        `<button type="button" class="gm-chip gm-chip-${k}" data-gm-chip="${k}" aria-pressed="${chipOn(st.visible, k)}"><span class="gm-chip-dot" aria-hidden="true"></span><span>${esc(T.chips[k])}</span><span class="gm-chip-n">${c[k]}</span></button>`).join("");
    }
    function renderHead() {
      const n = shown().length, hid = st.list.length - n;
      $("[data-gm-n]").textContent = st.loaded ? String(n) : "";
      headEl.innerHTML = `
        <div class="gm-head-t">
          <p class="gm-micro">${esc(T.listMicro)}${st.demo ? `<span class="gm-badge">${esc(T.demoBadge)}</span>` : ""}</p>
          <h2 class="gm-count"><span class="gm-num">${st.loaded ? n : "…"}</span><span class="gm-count-w">${esc(plural(n))}${hid > 0 ? `<span class="gm-count-h"> · ${hid} ${esc(T.listHidden)}</span>` : ""}</span></h2>
        </div>
        <button type="button" class="btn-filled gm-add" data-gm-intake><span>${esc(T.add)}</span>${icon("arrow")}</button>`;
    }
    function renderList() {
      const l = shown();
      if (!st.loaded) { listEl.innerHTML = ""; return; }
      if (!l.length) {
        const filtered = st.list.length > 0;
        listEl.innerHTML = `<div class="gm-empty">
          <span class="gm-empty-dots" aria-hidden="true">${dot(false, 22)}${dot(true, 30)}${dot(false, 16)}</span>
          <p class="gm-empty-t">${esc(T.empty.title)}</p>
          <p class="gm-empty-s">${esc(filtered ? T.empty.filtered : T.empty.text)}</p>
          ${filtered ? `<button type="button" class="btn-plain gm-btn" data-gm-chip="all"><span>${esc(T.empty.showAll)}</span></button>`
            : ""}
        </div>`;
        return;
      }
      listEl.innerHTML = (st.demo ? `<p class="gm-note">${esc(T.demoNote)}</p>` : "") + `<ul class="gm-rows">` + l.map((r, i) =>
        `<li style="--i:${i}"><button type="button" class="gm-row" data-gm-id="${esc(r.id)}" aria-current="${st.sel === r.id}">
          <span class="gm-row-dot" aria-hidden="true">${dot(LAY.isInstalled(r), 18)}</span>
          <span class="gm-row-t"><span class="gm-row-n">${esc(r.name)}</span><span class="gm-row-s">${esc(subline(r))}</span></span>
          ${r.demo ? `<span class="gm-tag">${esc(T.demoTag)}</span>` : ""}${icon("chev", "gm-row-ch")}
        </button></li>`).join("") + `</ul>`;
    }
    function renderCard() {
      const rec = byId(st.sel);
      if (!rec) return;
      const r = rec.ramp, C = T.card, c = SRC.toConstructor(rec);
      const tile = (k, v, unit) => `<div class="gm-tile"><span class="gm-micro">${esc(k)}</span><span class="gm-tile-v"><span class="gm-num">${esc(v)}</span>${unit && v !== "—" ? `<span class="gm-unit">${esc(unit)}</span>` : ""}</span></div>`;
      const wide = r.width != null ? [C.width, fmtMm(r.width)] : [C.free, fmtMm(r.freeWidth)];
      const place = [rec.address, rec.entrance ? `${C.entrance} ${rec.entrance}` : ""].filter(Boolean).join(" · ");
      const paint = r.paint ? [r.paint.ral, r.paint.name].filter(Boolean).join(" · ") || r.paint.hex : C.raw;
      const src = rec.demo ? C.source.demo : C.source[rec.source] || "";
      const when = fmtDate(r.status === "installed" ? r.installed_at : r.status === "ordered" ? r.ordered_at : r.measured_at);
      card.innerHTML = `
        <div class="gm-card-top">
          <span class="gm-status gm-status-${r.status}">${dot(r.status === "installed", 14)}<span>${esc(SRC.STATUS_T[r.status])}</span></span>
          ${rec.demo ? `<span class="gm-badge">${esc(T.demoTag)}</span>` : ""}
          <button type="button" class="gm-x" data-gm-card-close aria-label="${esc(C.close)}" title="${esc(C.close)}">${icon("close")}</button>
        </div>
        <h2 class="gm-name" data-gm-card-h tabindex="-1">${esc(rec.name)}</h2>
        ${place ? `<p class="gm-place">${esc(place)}</p>` : ""}
        <div class="gm-tiles">${tile(C.hl, fmtMm(r.hl), T.mm)}${tile(C.hr, fmtMm(r.hl == null ? null : r.hr ?? r.hl), T.mm)}${tile(wide[0], wide[1], T.mm)}</div>
        <div class="gm-meta">
          <span class="gm-paint"><span class="gm-sw${r.paint && r.paint.hex ? "" : " is-raw"}" style="${r.paint && r.paint.hex ? `background:${esc(r.paint.hex)}` : ""}" aria-hidden="true"></span><span><span class="gm-micro">${esc(C.paint)}</span><span class="gm-meta-v">${esc(paint)}</span></span></span>
          ${when ? `<span class="gm-when"><span class="gm-micro">${esc(T.card.when[r.status])}</span><span class="gm-meta-v">${esc(when)}</span></span>` : ""}
        </div>
        ${r.note ? `<p class="gm-text">${esc(r.note)}</p>` : ""}
        ${src ? `<p class="gm-text gm-text-2">${esc(src)}</p>` : ""}
        ${c ? "" : `<p class="gm-text gm-text-2">${esc(C.noDims)}</p>`}
        <div class="gm-acts">
          ${c ? `<button type="button" class="btn-filled gm-btn gm-cta" data-gm-open><span>${esc(C.open)}</span>${icon("arrow")}</button>` : ""}
          ${rec.demo ? "" : `<button type="button" class="btn-plain gm-btn" data-gm-measure>${icon("plus")}<span>${esc(C.measure)}</span></button>`}
        </div>`;
    }
    function renderSet() {
      const key = LAY.baseKey(LAY.savedBase()), c = SRC.counts(st.list), S = T.set;
      setEl.innerHTML = `
        <span class="gm-set-grab" aria-hidden="true"></span>
        <div class="gm-set-top"><h2 class="gm-set-h" data-gm-set-h tabindex="-1">${esc(S.title)}</h2><button type="button" class="gm-x" data-gm-set-close aria-label="${esc(S.done)}" title="${esc(S.done)}">${icon("close")}</button></div>
        <p class="gm-micro">${esc(S.base)}</p>
        <div class="gm-opts" role="radiogroup" aria-label="${esc(S.base)}">${LAY.BASE_ORDER.map((k) =>
          `<button type="button" class="gm-opt gm-opt-${k}" role="radio" aria-checked="${k === key}" data-gm-base="${k}"><span class="gm-opt-pic" aria-hidden="true"></span><span class="gm-opt-t">${esc(LAY.BASES[k].name)}</span></button>`).join("")}</div>
        <p class="gm-text gm-text-2">${esc(S.baseNote)}</p>
        <p class="gm-micro">${esc(S.layers)}</p>
        <div class="gm-lays">${STATUSES.map((k) =>
          `<button type="button" class="gm-lay" role="switch" aria-checked="${st.visible.has(k)}" data-gm-layer="${k}">
            <span class="gm-row-dot" aria-hidden="true">${dot(k === "installed", 18)}</span>
            <span class="gm-row-t"><span class="gm-row-n">${esc(SRC.STATUS_MANY[k])}<span class="gm-lay-n">${c[k]}</span></span><span class="gm-row-s">${esc(S.layerSub[k])}</span></span>
            <span class="gm-sw-t" aria-hidden="true"><span></span></span>
          </button>`).join("")}</div>
        <p class="gm-text gm-text-2">${esc(S.dots)}</p>
        <p class="gm-micro">${esc(S.data)}</p>
        <p class="gm-text gm-text-2">${esc(S.dataText)}${st.demo ? " " + esc(S.dataDemo) : ""}</p>`;
    }

    // ---------- лист со списком: «выглядывает» или развёрнут ----------
    // Сколько экрана закрыто снизу (лист или карточка): на эту высоту поднимаются легенда, «где я» и подпись карты
    function layout() {
      const wide = mqWide.matches;
      const row = $(".gm-row", listEl), rows = !!row;
      const padB = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      // свёрнутый лист показывает шапку и первую строку списка
      const peek = rows ? row.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + 12 + padB : sheet.offsetHeight;
      box.style.setProperty("--gm-peek", Math.min(peek, sheet.offsetHeight) + "px");
      const cover = wide ? 0 : st.sel ? card.offsetHeight : st.up || !rows ? sheet.offsetHeight : peek;
      box.style.setProperty("--gm-cover", Math.round(cover) + "px");
      return { wide, cover, peek };
    }
    function setUp(on) {
      st.up = !!on; sheet.classList.toggle("is-up", st.up);
      grab.setAttribute("aria-expanded", String(st.up)); grab.setAttribute("aria-label", st.up ? T.grabDown : T.grabUp);
      layout();
    }
    // лист тянется пальцем за ручку и за шапку
    let drag = null;
    const dragStart = (e) => {
      if (mqWide.matches || e.target.closest("[data-gm-intake]")) return;
      const { peek } = layout(), max = Math.max(0, sheet.offsetHeight - peek);
      drag = { y: e.clientY, from: st.up ? 0 : max, max, moved: 0, t: e.timeStamp, id: e.pointerId };
    };
    const dragMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dy));
      if (drag.moved < 6) return;
      sheet.classList.add("is-drag");
      sheet.style.transform = `translateY(${Math.max(-12, Math.min(drag.max, drag.from + dy))}px)`;
    };
    const dragEnd = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y, was = drag; drag = null;
      sheet.classList.remove("is-drag"); sheet.style.transform = "";
      if (was.moved < 6) return;
      st.dragged = e.timeStamp;
      setUp(Math.abs(dy) > 36 ? dy < 0 : st.up);
    };
    for (const el of [grab, headEl]) { el.addEventListener("pointerdown", dragStart); }
    addEventListener("pointermove", dragMove, { passive: true });
    addEventListener("pointerup", dragEnd); addEventListener("pointercancel", dragEnd);

    // ---------- карта: только прослойка из ramps-layer.js ----------
    function applyBase() {
      if (!st.view) return;
      const key = LAY.baseKey(LAY.savedBase());
      box.dataset.base = key;
      st.view.setBase(key).setNight(night());
    }
    function ensureMap() {
      if (st.view) return Promise.resolve(st.view);
      if (st.viewBusy) return st.viewBusy;
      st.viewBusy = LAY.createView(mapEl, {
        center: SRC.CENTER, zoom: 13, base: LAY.baseKey(LAY.savedBase()), night: night(),
        onSelect: (rec) => select(rec.id, { scroll: true }),
        onMapClick: () => { if (st.sel) select(null); else if (st.up && !mqWide.matches) setUp(false); },
        onTilesDown: () => toast(T.toast.tilesDown),
      }).then((view) => { st.view = view; failEl.hidden = true; applyBase(); return view; })
        .catch(() => { st.viewBusy = null; failEl.hidden = false; return null; });
      return st.viewBusy;
    }
    // поля карты: что закрыто шапкой, листом и правой панелью
    function pad() {
      const { wide, cover } = layout();
      return { top: topEl.offsetHeight + 36, left: 40, right: (wide ? sheet.offsetWidth + 32 : 0) + 40, bottom: cover + (wide ? 56 : 72) };
    }
    function fit(animate = true) { if (st.view) st.view.fit(shown(), pad(), { animate, maxZoom: 16 }); }
    function focusOn(rec) { if (st.view && rec) st.view.focus(rec, pad(), { animate: !mqCalm.matches }); }
    function syncLayer() { if (st.view) st.view.showPoints(shown()).selectPoint(st.sel); }

    // ---------- выбор пандуса ----------
    function select(id, { scroll = false, focus = false } = {}) {
      const rec = id ? byId(id) : null;
      st.sel = rec ? rec.id : null;
      box.classList.toggle("has-card", !!rec);
      card.classList.toggle("is-on", !!rec);
      if (rec) { renderCard(); if (focus) requestAnimationFrame(() => $("[data-gm-card-h]", card)?.focus({ preventScroll: true })); }
      for (const b of listEl.querySelectorAll(".gm-row")) b.setAttribute("aria-current", String(b.dataset.gmId === st.sel));
      if (scroll && rec) listEl.querySelector(`.gm-row[aria-current="true"]`)?.scrollIntoView({ block: "nearest" });
      if (st.view) st.view.selectPoint(st.sel);
      layout();
      if (rec) focusOn(rec);
    }
    function renderAll() { renderChips(); renderHead(); renderList(); if (st.settings) renderSet(); if (st.sel && !shown().some((r) => r.id === st.sel)) select(null); else if (st.sel) renderCard(); layout(); }
    function setVisible(set, refit = true) {
      st.visible = set; renderAll(); syncLayer();
      if (refit && !st.sel) fit(!mqCalm.matches);
    }

    // ---------- данные ----------
    async function refresh() {
      const res = await SRC.load();
      st.list = res.list; st.demo = res.demo; st.loaded = true;
      renderAll();
      const view = await ensureMap();
      if (!view || !st.open) return;
      syncLayer();
      if (!st.fitted) { st.fitted = true; view.resize(); fit(false); }
    }

    // ---------- «где я» ----------
    function locate() {
      const btn = $("[data-gm-me]");
      if (!navigator.geolocation) return toast(T.toast.geoNone);
      btn.classList.add("is-busy");
      navigator.geolocation.getCurrentPosition((p) => {
        btn.classList.remove("is-busy");
        const { latitude: lat, longitude: lng, accuracy: acc } = p.coords;
        if (!st.view || !SRC.validCoord(lat, lng)) return;
        st.view.showMe({ lat, lng, acc }).focus({ lat, lng }, pad(), { animate: !mqCalm.matches });
      }, (e) => { btn.classList.remove("is-busy"); toast(e && e.code === 1 ? T.toast.geoDenied : T.toast.geoFail); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    }
    function toast(text) {
      clearTimeout(st.toastT); toastEl.textContent = text; toastEl.classList.add("is-on");
      st.toastT = setTimeout(() => toastEl.classList.remove("is-on"), 3600);
    }

    // ---------- настройки: лист снизу ----------
    function openSettings() {
      st.settings = true; renderSet();
      scrim.hidden = false; void scrim.offsetWidth;
      box.classList.add("has-set");
      requestAnimationFrame(() => $("[data-gm-set-h]", setEl)?.focus({ preventScroll: true }));
    }
    function closeSettings(refocus = true) {
      if (!st.settings) return;
      st.settings = false; box.classList.remove("has-set");
      setTimeout(() => { if (!st.settings) scrim.hidden = true; }, 260);
      if (refocus) $("[data-gm-settings]").focus({ preventScroll: true });
    }

    // ---------- открыть и закрыть экран ----------
    const others = (on) => { for (const el of root.children) if (el !== box) { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); } };
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (st.settings) closeSettings(); else if (st.sel) { const id = st.sel; select(null); listEl.querySelector(`.gm-row[data-gm-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); } else close();
    };
    function open() {
      if (st.open) return;
      st.open = true; st.opener = doc.activeElement;
      clearTimeout(st.hideT);
      box.hidden = false; root.classList.add("is-map");
      void box.offsetWidth; box.classList.add("is-open");
      others(true);
      renderAll();
      refresh();
      doc.addEventListener("keydown", onKey);
      if (typeof h.onOpen === "function") h.onOpen();
      requestAnimationFrame(() => box.focus({ preventScroll: true }));       // следующий Tab — кнопка «назад»
    }
    function close() {
      if (!st.open) return;
      st.open = false;
      closeSettings(false); select(null);
      box.classList.remove("is-open"); root.classList.remove("is-map");
      others(false);
      doc.removeEventListener("keydown", onKey);
      st.hideT = setTimeout(() => { box.hidden = true; scrim.hidden = true; }, mqCalm.matches ? 0 : 340);
      if (typeof h.onClose === "function") h.onClose();
      try { st.opener?.focus?.({ preventScroll: true }); } catch {}
    }

    // ---------- события ----------
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || b.disabled || !box.contains(b)) return;
      if (b.matches("[data-gm-close]")) return close();
      if (b.matches("[data-gm-grab]")) { if (st.dragged && e.timeStamp - st.dragged < 350) return; return setUp(!st.up); }
      if (b.dataset.gmChip) return setVisible(chipPick(st.visible, b.dataset.gmChip));
      if (b.dataset.gmId) return select(b.dataset.gmId, { focus: true });
      if (b.matches("[data-gm-card-close]")) { const id = st.sel; select(null); listEl.querySelector(`.gm-row[data-gm-id="${CSS.escape(id || "")}"]`)?.focus({ preventScroll: true }); return; }
      if (b.matches("[data-gm-open]")) {
        const c = SRC.toConstructor(byId(st.sel)); if (!c) return;
        if (typeof h.onOpenRamp === "function") h.onOpenRamp(c);
        return close();
      }
      if (b.matches("[data-gm-intake]")) { close(); if (typeof h.onIntake === "function") h.onIntake(); return; }
      if (b.matches("[data-gm-measure]")) {
        const place = SRC.placeOf(byId(st.sel));
        close(); if (typeof h.onIntake === "function") h.onIntake(place ? { place } : undefined);
        return;
      }
      if (b.matches("[data-gm-settings]")) return st.settings ? closeSettings() : openSettings();
      if (b.matches("[data-gm-set-close]")) return closeSettings();
      if (b.dataset.gmBase) { LAY.saveBase(b.dataset.gmBase); applyBase(); return renderSet(); }
      if (b.dataset.gmLayer) { setVisible(layerToggle(st.visible, b.dataset.gmLayer)); return; }
      if (b.dataset.gmZoom) { if (st.view) st.view.zoomBy(+b.dataset.gmZoom); return; }
      if (b.matches("[data-gm-me]")) return locate();
      if (b.matches("[data-gm-retry]")) { failEl.hidden = true; return refresh(); }
    });
    scrim.addEventListener("click", () => closeSettings());
    mqWide.addEventListener?.("change", () => { layout(); if (st.view) st.view.resize(); });
    new ResizeObserver(() => { if (st.open) layout(); }).observe(sheet);
    new ResizeObserver(() => { if (st.open && st.sel) layout(); }).observe(card);
    // настроение «ночь» затемняет подложку фильтром; точки и подписи остаются как есть
    new MutationObserver(() => { applyBase(); if (st.settings) renderSet(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-mood", "data-theme"] });

    try { if (new URLSearchParams(location.search).get("view") === "map") setTimeout(open, 0); } catch {}
    return { open, close, isOpen: () => st.open, refresh };
  }

  return { T, source: SRC, layers: LAY, plural, fmtMm, fmtDate, subline, whenText, chipPick, chipOn, layerToggle, mount };
}
