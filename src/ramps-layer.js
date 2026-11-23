// Картографическая часть карты пандусов: загрузка движка, подложки и слой точек.
// Весь Leaflet живёт здесь. Экран (src/map.js) и мастер (src/intake.js) знают только прослойку createView() с тремя
// действиями: showPoints(записи) — показать точки, selectPoint(id) — выбрать точку, placePoint(точка) — поставить точку.
// Сменится движок общей карты (Leaflet → MapLibre) — переписывается только этот файл.
// Для карты на Leaflet есть и готовый слой: createRampLayer(L, { onSelect }) отдаёт обычную L.LayerGroup.
// Точка — центр пина GoApsny: пурпурный круг #7A5AF8 с белой обводкой (src/components/map/pinMarkup.ts в goapsny-mvp).
// Единственное объявление верхнего уровня (файлы склеиваются в один артефакт).
export function createRampLayers(opts = {}) {
  const PURPLE = "#7A5AF8";                                   // пурпурный центр пина GoApsny
  const WHITE = "#FFFFFF";
  const PIN = { w: 28, h: 36, cx: 14, cy: 14, r: 5.5, stroke: 2.5 };   // геометрия пина GoApsny
  const LEAFLET = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/";
  const BASE_KEY = "goapsny-stopgap:basemap";
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const CARTO_ATTR = OSM_ATTR + ' &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
  // Подложки — как в «Социальном такси» (web/src/pages/Map.tsx). Основная — OpenStreetMap во всех настроениях;
  // Carto Voyager — запасной ручной выбор (на части доменов Carto отдаёт плитки со штампом «API KEY REQUIRED»).
  const BASES = {
    osm: { name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", options: { maxZoom: 19, referrerPolicy: "strict-origin-when-cross-origin", attribution: OSM_ATTR } },
    carto: { name: "Carto Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", options: { subdomains: "abcd", maxZoom: 20, attribution: CARTO_ATTR } },
  };
  const BASE_ORDER = ["osm", "carto"];
  // «Ночь» — не отдельная подложка, а фильтр на слое плиток: точки, подписи и «где я» он не задевает
  const NIGHT_FILTER = "invert(1) hue-rotate(180deg) brightness(.92) contrast(.86) saturate(.5)";

  // ---------- чистые функции ----------
  const n2 = (x) => String(+(+x).toFixed(2));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Разметка точки пандуса — она же центр пина GoApsny.
  //   rampDot({ installed, size })                      → отдельный <svg> size×size (маркер Stopgap, список, легенда)
  //   rampDot({ installed, svg: false, cx, cy, r, stroke }) → только круги, чтобы вложить в <svg> пина:
  //     rampDot({ installed, svg: false, ...PIN }) встаёт на место <circle cx="14" cy="14" r="5.5"> пина 28×36.
  // installed: true — пандус стоит (сплошная точка); false — пандуса ещё нет, заявка или замер (кольцо с белой серединой).
  function rampDot({ installed = true, size = 20, svg = true, cx, cy, r, stroke, color = PURPLE } = {}) {
    const sw = stroke ?? size * 0.14;
    const rr = r ?? size / 2 - sw / 2;
    const x = cx ?? size / 2, y = cy ?? size / 2;
    const inner = rr - sw / 2;                                 // видимый радиус цветного круга
    const ring = Math.max(1.4, inner * 0.42);
    const shapes = installed
      ? `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(rr)}" fill="${color}" stroke="${WHITE}" stroke-width="${n2(sw)}"/>`
      : `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(rr)}" fill="${WHITE}" stroke="${WHITE}" stroke-width="${n2(sw)}"/>` +
        `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(inner - ring / 2)}" fill="${WHITE}" stroke="${color}" stroke-width="${n2(ring)}"/>`;
    if (!svg) return shapes;
    return `<svg class="gm-dot" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${n2(size)} ${n2(size)}" aria-hidden="true" focusable="false">${shapes}</svg>`;
  }
  // Стоит ли пандус: по записи карты (ramp.status) или по типу GoApsny (ramp_type)
  const isInstalled = (rec) => !!rec && ((rec.ramp && rec.ramp.status === "installed") || (!rec.ramp && rec.ramp_type === "portable_available"));
  // Содержимое маркера: зона нажатия 44 px, точка 20 px, подпись-капсула над выбранной
  function markerHTML(rec, { size = 20, index = 0 } = {}) {
    return `<span class="gm-pin-dot" style="--i:${index | 0}">${rampDot({ installed: isInstalled(rec), size })}</span>` +
      `<span class="gm-pin-label">${esc(rec && rec.name)}</span>`;
  }
  // Какая подложка сейчас: выбор человека, иначе OpenStreetMap
  function baseKey(saved) { return BASES[saved] ? saved : "osm"; }
  function savedBase(storage) { try { const v = (storage || localStorage).getItem(BASE_KEY); return BASES[v] ? v : null; } catch { return null; } }
  function saveBase(key, storage) { try { (storage || localStorage).setItem(BASE_KEY, key); } catch {} }

  // ---------- Leaflet ----------
  let loading = null;
  // Leaflet (JS и CSS) грузится один раз, при первом открытии карты. Сбой сети не запоминается: можно повторить
  function loadLeaflet() {
    if (typeof window === "undefined") return Promise.reject(new Error("no window"));
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (loading) return loading;
    const base = opts.leaflet || LEAFLET;
    loading = new Promise((res, rej) => {
      if (!document.querySelector("link[data-gm-leaflet]")) {
        const l = document.createElement("link");
        l.rel = "stylesheet"; l.href = base + "leaflet.css"; l.dataset.gmLeaflet = "";
        document.head.insertBefore(l, document.head.querySelector('link[rel="stylesheet"]'));   // раньше своих стилей: map.css главнее
      }
      const s = document.createElement("script");
      s.src = base + "leaflet.js"; s.async = true;
      s.onload = () => (window.L && window.L.map ? res(window.L) : rej(new Error("leaflet")));
      s.onerror = () => { s.remove(); rej(new Error("leaflet")); };
      document.head.appendChild(s);
    }).catch((e) => { loading = null; throw e; });
    return loading;
  }
  const tileLayer = (L, key) => { const b = BASES[key] || BASES.osm; return L.tileLayer(b.url, { ...b.options }); };

  // Слой точек. group.setData(записи) перерисовывает, group.select(id | null) выделяет, group.get(id) отдаёт маркер.
  // Запись — как в src/ramps-source.js: { id, name, lat, lng, ramp: { status }, ramp_type }.
  function createRampLayer(L, { onSelect, size = 20 } = {}) {
    const group = L.layerGroup();
    const byId = new Map();
    let selected = null;
    const paint = (id, on) => {
      const m = byId.get(id); if (!m) return;
      m.setZIndexOffset(on ? 1000 : 0);
      const el = m.getElement(); if (el) { el.classList.toggle("is-on", on); el.setAttribute("aria-pressed", String(on)); }
    };
    group.setData = (list) => {
      group.clearLayers(); byId.clear();
      (list || []).forEach((rec, i) => {
        const on = isInstalled(rec);
        const m = L.marker([rec.lat, rec.lng], {
          icon: L.divIcon({ className: "gm-pin " + (on ? "is-installed" : "is-planned"), html: markerHTML(rec, { size, index: i }), iconSize: [44, 44], iconAnchor: [22, 22] }),
          keyboard: true, riseOnHover: true, title: rec.name || "",
        });
        m.on("add", () => {
          const el = m.getElement(); if (!el) return;
          el.setAttribute("role", "button"); el.setAttribute("aria-label", rec.name || ""); el.removeAttribute("title");
          el.setAttribute("aria-pressed", String(selected === rec.id));
          el.classList.toggle("is-on", selected === rec.id);
        });
        m.on("click keypress", (e) => {
          if (e.type === "keypress" && !["Enter", " "].includes(e.originalEvent && e.originalEvent.key)) return;
          if (typeof onSelect === "function") onSelect(rec);
        });
        byId.set(rec.id, m); group.addLayer(m);
      });
      if (selected && !byId.has(selected)) selected = null;
      return group;
    };
    group.select = (id) => { if (selected && selected !== id) paint(selected, false); selected = id && byId.has(id) ? id : null; if (selected) paint(selected, true); return group; };
    group.get = (id) => byId.get(id) || null;
    return group;
  }

  // ---------- прослойка над движком ----------
  // createView(el, opts) → Promise<view>. Три действия:
  //   view.showPoints(записи)                 показать точки (записи из src/ramps-source.js)
  //   view.selectPoint(id | null)             выбрать точку: она крупнее, со свечением и подписью
  //   view.placePoint({ lat, lng } | null)    поставить (или убрать) точку объекта; её можно двигать
  // Остальное — обслуживание вида: setBase, setNight, fit, focus, zoomBy, showMe, resize, destroy.
  // opts: center [lat, lng], zoom, onSelect(запись), onMapClick(), onPlace({ lat, lng }) — нажатие на карту ставит точку,
  //       onTilesDown() — подложка не отвечает, wheel: false — колесо мыши не масштабирует (карта внутри прокрутки).
  // Поля в fit и focus: { top, right, bottom, left } в пикселях — то, что закрыто интерфейсом.
  function createView(el, o = {}) {
    return loadLeaflet().then((L) => {
      const map = L.map(el, { center: o.center || [43.0015, 41.0234], zoom: o.zoom ?? 13, zoomControl: false, zoomSnap: 0.5, attributionControl: false, scrollWheelZoom: o.wheel !== false });
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      const points = createRampLayer(L, { onSelect: o.onSelect }).addTo(map);
      let base = null, key = null, night = false, errs = 0, loads = 0, me = null, placed = null;
      const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => map.invalidateSize({ pan: false })) : null;
      if (ro) ro.observe(el);
      const applyNight = () => { map.getPane("tilePane").style.filter = night ? NIGHT_FILTER : ""; el.classList.toggle("gm-night", night); };
      const pads = (p = {}) => ({ paddingTopLeft: [p.left || 0, p.top || 0], paddingBottomRight: [p.right || 0, p.bottom || 0] });
      const box = (list) => { let s = 90, w = 180, n = -90, e = -180; for (const r of list) { s = Math.min(s, r.lat); n = Math.max(n, r.lat); w = Math.min(w, r.lng); e = Math.max(e, r.lng); } return [[s, w], [n, e]]; };
      const view = {
        engine: "leaflet",
        showPoints(list) { points.setData(list); return view; },
        selectPoint(id) { points.select(id); return view; },
        placePoint(g, { pan = false } = {}) {
          if (!g) { if (placed) { placed.remove(); placed = null; } return view; }
          if (!placed) {
            placed = L.marker([g.lat, g.lng], {
              icon: L.divIcon({ className: "gm-pin is-planned is-placed", html: `<span class="gm-pin-dot">${rampDot({ installed: false, size: 24 })}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
              draggable: true, keyboard: false, zIndexOffset: 800,
            }).addTo(map);
            placed.on("dragend", () => { const p = placed.getLatLng(); if (typeof o.onPlace === "function") o.onPlace({ lat: p.lat, lng: p.lng }); });
          } else placed.setLatLng([g.lat, g.lng]);
          if (pan) map.setView([g.lat, g.lng], Math.max(map.getZoom(), 17), { animate: true });
          return view;
        },
        setBase(k) {
          k = baseKey(k);
          if (k === key && base) return view;
          if (base) map.removeLayer(base);
          key = k; errs = 0; loads = 0;
          const layer = base = tileLayer(L, k).addTo(map);
          layer.on("tileload", () => { loads++; });
          layer.on("tileerror", () => { if (base === layer && ++errs === 6 && !loads && typeof o.onTilesDown === "function") o.onTilesDown(k); });
          applyNight();
          return view;
        },
        setNight(on) { night = !!on; applyNight(); return view; },
        fit(list, pad, { animate = true, maxZoom = 16 } = {}) {
          if (!list || !list.length) map.setView(o.center || [43.0015, 41.0234], o.zoom ?? 13, { animate });
          else map.fitBounds(box(list), { ...pads(pad), maxZoom, animate });
          return view;
        },
        focus(g, pad, { animate = true, minZoom = 16 } = {}) {
          map.fitBounds([[g.lat, g.lng], [g.lat, g.lng]], { ...pads(pad), maxZoom: Math.max(map.getZoom(), minZoom), animate });
          return view;
        },
        zoomBy(d) { if (d > 0) map.zoomIn(); else map.zoomOut(); return view; },
        showMe(g) {
          if (me) me.remove();
          me = g ? L.layerGroup([
            L.circle([g.lat, g.lng], { radius: Math.min(g.acc || 0, 400), className: "gm-me-acc", stroke: false, interactive: false }),
            L.marker([g.lat, g.lng], { icon: L.divIcon({ className: "gm-me", html: "<span></span>", iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false, keyboard: false, zIndexOffset: 500 }),
          ]).addTo(map) : null;
          return view;
        },
        resize() { map.invalidateSize({ pan: false }); return view; },
        destroy() { if (ro) ro.disconnect(); map.remove(); },
      };
      map.on("click", (e) => {
        if (typeof o.onPlace === "function") o.onPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
        if (typeof o.onMapClick === "function") o.onMapClick();
      });
      view.setBase(o.base);
      if (o.night) view.setNight(true);
      return view;
    });
  }

  return { PURPLE, PIN, LEAFLET, BASE_KEY, BASES, BASE_ORDER, NIGHT_FILTER, rampDot, isInstalled, markerHTML, baseKey, savedBase, saveBase, loadLeaflet, tileLayer, createRampLayer, createView };
}
