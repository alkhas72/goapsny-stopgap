// Данные карты пандусов: один вид записи для всех источников. Экран карты (src/map.js) и слой маркеров
// (src/ramps-layer.js) знают только этот вид, поэтому источник меняется одним адаптером.
//
// Запись = место + блок «пандус», как в плане данных GoApsny (ядро public.places, блок ramps):
//   { id, place_id, name, address, entrance, lat, lng,            ← место (public.places: id uuid, name, lat, lng, address)
//     status: "green" | "yellow" | "red" | "gray" | null,          ← доступность места в GoApsny (цвет пина), у нас необязательна
//     ramp_type: "portable_available" | "portable_on_request" | "none" | "permanent",   ← как в GoApsny (RampType)
//     ramp: { status, hl, hr, width, board, freeWidth, paint: { hex, ral, name } | null,
//             measured_at, ordered_at, installed_at, note, request_id },   ← блок ramps
//     source: "registry" | "request" | "draft" | "demo", demo: boolean }
// ramp.status: measured — замер сделан, ordered — заявка отправлена, installed — пандус стоит.
// ramp_type выводится из ramp.status: стоит → portable_available, заявка → portable_on_request, только замер → none.
// На карте GoApsny пурпурный центр пина ставится при portable_available и portable_on_request (см. data/README.md).
//
// Сейчас источники такие: реестр data/ramps.geojson (в репозитории), заявки этого устройства и текущий черновик
// мастера «Новый замер» (localStorage), у которых есть точка. При слиянии с GoApsny вместо них подставляется
// адаптер к представлению ramps.place_card: createRampsSource({ adapters: [async () => записи] }).
// Единственное объявление верхнего уровня (файлы склеиваются в один артефакт).
export function createRampsSource(opts = {}) {
  const STATUSES = ["installed", "ordered", "measured"];
  const STATUS_T = { installed: "Установлен", ordered: "Заявка", measured: "Замер" };
  const STATUS_MANY = { installed: "Установленные", ordered: "Заявки", measured: "Замеры" };
  const PLACE_STATUSES = ["green", "yellow", "red", "gray"];                                   // public.places.status в GoApsny
  const RAMP_TYPES = ["none", "permanent", "portable_on_request", "portable_available"];       // RampType в GoApsny
  const RAMP_TYPE_OF = { installed: "portable_available", ordered: "portable_on_request", measured: "none" };
  const SENT_KEY = "goapsny-stopgap:intake-sent:v1";
  const DRAFT_KEY = "goapsny-stopgap:intake-draft:v2";
  const REGISTRY_URL = "data/ramps.geojson";
  const DEMO_URL = "data/ramps.demo.geojson";
  const CENTER = [43.0015, 41.0234];             // Сухум, как в «Социальном такси»

  // ---------- чистые функции ----------
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const numOr = (v) => { if (v == null || v === "") return null; const x = typeof v === "number" ? v : Number(String(v).trim().replace(",", ".")); return Number.isFinite(x) ? x : null; };
  const pos = (v) => { const x = numOr(v); return x != null && x > 0 ? x : null; };
  const str = (v, n = 400) => (v == null ? "" : String(v).trim().slice(0, n));
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuidOr = (v) => (typeof v === "string" && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
  const isoOr = (v) => { if (!v) return null; const t = new Date(v); return Number.isFinite(t.getTime()) ? t.toISOString() : null; };
  // Координаты: конечные числа в градусах; (0, 0) считается «не задано»
  function validCoord(lat, lng) {
    return fin(lat) && fin(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
  }
  // Точка объекта в черновике и заявке: { lat, lng, src: "tap" | "gps", acc? }. Плохие координаты → null
  function geoPoint(g) {
    if (!g || typeof g !== "object") return null;
    const lat = numOr(g.lat), lng = numOr(g.lng);
    if (!validCoord(lat, lng)) return null;
    const out = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), src: g.src === "gps" ? "gps" : "tap" };
    const acc = numOr(g.acc);
    if (acc != null && acc >= 0) out.acc = Math.round(acc);
    return out;
  }
  const fmtCoord = (g) => (g && validCoord(g.lat, g.lng) ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`.replace(/\./g, ",") : "");
  function paintOf(hex, ral, name) {
    const h = typeof hex === "string" && /^#?[0-9a-f]{6}$/i.test(hex.trim()) ? "#" + hex.trim().replace(/^#/, "").toUpperCase() : null;
    if (!h && !str(ral) && !str(name)) return null;
    return { hex: h, ral: str(ral, 60), name: str(name, 80) };
  }
  // Статусы плана данных GoApsny (заявка на пандус) → три состояния карты. Свои три проходят как есть.
  // draft, remeasure → замер; submitted … ready → заявка; installed, service → стоит; остальное на карту не идёт
  const PLAN = {
    measured: ["measured", "draft", "remeasure"],
    ordered: ["ordered", "submitted", "accepted", "approved", "review", "in_review", "queued", "production", "in_production", "ready"],
    installed: ["installed", "service"],
  };
  function statusFromPlan(s) {
    const v = typeof s === "string" ? s.trim().toLowerCase() : "";
    for (const k of STATUSES) if (PLAN[k].includes(v)) return k;
    return null;
  }
  // Тип пандуса для GoApsny по состоянию у нас; hasRamp — есть ли что показать пурпурным центром пина
  const rampType = (status) => RAMP_TYPE_OF[status] || "none";
  const hasPortable = (rec) => !!rec && (rec.ramp_type === "portable_available" || rec.ramp_type === "portable_on_request");
  // Любая сырая запись → единый вид; без координат или с неизвестным статусом записи нет (null)
  function normalize(raw, extra = {}) {
    if (!raw || typeof raw !== "object") return null;
    const lat = numOr(raw.lat), lng = numOr(raw.lng);
    if (!validCoord(lat, lng)) return null;
    const r = raw.ramp && typeof raw.ramp === "object" ? raw.ramp : raw;
    // состояние пандуса: своё поле, а у записи из GoApsny без блока ramps — по её ramp_type
    const status = statusFromPlan(r.status) || (raw.ramp_type === "portable_available" ? "installed" : raw.ramp_type === "portable_on_request" ? "ordered" : null);
    if (!status) return null;
    const hl = pos(r.hl), hr = pos(r.hr) ?? hl;
    const id = str(raw.id ?? raw.place_id, 80);
    if (!id) return null;
    const p = r.paint && typeof r.paint === "object" ? paintOf(r.paint.hex, r.paint.ral, r.paint.name) : paintOf(r.paint_hex, r.paint_ral, r.paint_name);
    const source = extra.source || raw.source || "registry";
    // доступность места: в плоской записи (GeoJSON) status занят статусом пандуса, поэтому там поле place_status
    const ps = raw.place_status ?? (r !== raw || !statusFromPlan(raw.status) ? raw.status : null);
    return {
      id, place_id: str(raw.place_id, 80) || null,
      status: PLACE_STATUSES.includes(ps) ? ps : null,
      ramp_type: rampType(status),
      name: str(raw.name, 300) || "Без названия", address: str(raw.address), entrance: str(raw.entrance, 200),
      lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      ramp: {
        status, hl, hr, width: pos(r.width), board: pos(r.board), freeWidth: pos(r.freeWidth ?? r.free_width),
        paint: p,
        measured_at: isoOr(r.measured_at), ordered_at: isoOr(r.ordered_at), installed_at: isoOr(r.installed_at),
        note: str(r.note, 600), request_id: str(r.request_id, 80) || null, request_uuid: uuidOr(r.request_uuid),
      },
      source, demo: !!(extra.demo || raw.demo || source === "demo"),
    };
  }
  // Реестр: GeoJSON FeatureCollection, точки [lng, lat]; свойства описаны в data/README.md
  function fromGeoJSON(fc, extra = {}) {
    const fs = fc && fc.type === "FeatureCollection" && Array.isArray(fc.features) ? fc.features : [];
    const out = [];
    for (const f of fs) {
      const c = f && f.geometry && f.geometry.type === "Point" ? f.geometry.coordinates : null;
      if (!Array.isArray(c)) continue;
      const pr = f.properties || {};
      const rec = normalize({ ...pr, id: pr.place_id ?? pr.id ?? f.id, lng: c[0], lat: c[1] }, extra);
      if (rec) out.push(rec);
    }
    return out;
  }
  // Отправленная заявка мастера (buildRequest в src/intake.js) с точкой объекта → «заявка».
  // На карту идут только место и размеры пандуса. Личное остаётся в заявке: замерщик, контакты, комментарии, фото.
  function fromRequest(req) {
    const g = geoPoint(req && req.object && req.object.geo);
    if (!g || !req.id) return null;
    const p = req.params || {}, m = req.measure || {};
    return normalize({
      id: "req:" + req.id, place_id: uuidOr(req.object.place_id), name: req.object.name, address: req.object.address, entrance: req.object.entrance, lat: g.lat, lng: g.lng,
      ramp: {
        status: "ordered", hl: p.hl ?? m.hl, hr: p.hr ?? m.hr, width: p.width ?? m.width, board: p.board, freeWidth: p.freeWidth ?? m.freeWidth,
        paint: req.paint && req.paint.hex ? req.paint : null,
        measured_at: req.createdAt, ordered_at: req.submittedAt, request_id: req.id, request_uuid: req.uuid,
      },
    }, { source: "request" });
  }
  // Текущий черновик мастера с точкой → «замер» (отправленный черновик уже есть среди заявок)
  function fromDraft(d) {
    if (!d || d.sent) return null;
    const g = geoPoint(d.geo);
    if (!g) return null;
    const hl = pos(d.hl), hr = pos(d.hr) ?? hl, fw = pos(d.free), w = pos(d.width) ?? (fw != null ? Math.min(900, fw) : null);
    return normalize({
      id: "draft:" + (d.id || "current"), place_id: uuidOr(d.placeId), name: str(d.object, 300) || "Черновик замера", address: d.address, entrance: d.entrance, lat: g.lat, lng: g.lng,
      ramp: { status: "measured", hl, hr, width: w, freeWidth: fw, measured_at: d.updatedAt || d.createdAt, request_id: d.id, request_uuid: d.uuid },
    }, { source: "draft" });
  }
  // Место записи для мастера «Новый замер» (кнопка «Замерить здесь»): только то, что описывает место
  function placeOf(rec) {
    if (!rec || !validCoord(rec.lat, rec.lng)) return null;
    return { place_id: uuidOr(rec.place_id), name: str(rec.name, 300), address: str(rec.address), entrance: str(rec.entrance, 200), lat: rec.lat, lng: rec.lng };
  }
  // Куда вернуть человека после заявки: только https и только свои узлы — тот же сайт, goapsny.org с поддоменами,
  // goapsny-mvp.vercel.app. Любой другой адрес → null, чтобы ссылкой нельзя было увести на чужой сайт.
  // Пробные сборки (…-alkhas72s-projects.vercel.app) возвращают друг к другу, только когда сам Stopgap открыт
  // на пробной сборке: имя вида «что-то-alkhas72s-projects» может занять на vercel.app кто угодно, поэтому
  // с боевого адреса такой возврат не принимается.
  const PREVIEW_HOST = /^[a-z0-9-]+-alkhas72s-projects\.vercel\.app$/;
  function safeReturn(v, origin) {
    if (typeof v !== "string" || !v.trim() || v.length > 2000) return null;
    let u; try { u = new URL(v.trim()); } catch { return null; }
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    let own = null; try { own = origin ? new URL(origin) : null; } catch {}
    const mine = !!own && own.protocol === "https:";
    const ok = host === "goapsny.org" || host.endsWith(".goapsny.org") || host === "goapsny-mvp.vercel.app" || (mine && u.origin === own.origin)
      || (mine && PREVIEW_HOST.test(own.hostname.toLowerCase()) && PREVIEW_HOST.test(host));
    return ok ? u.href : null;
  }
  // Ссылка «замерить вход» с карты доступности: ?measure=1&place_id=…&name=…&address=…&entrance=…&lat=…&lng=…&return=…
  // → { place: { place_id, name, address, entrance, lat, lng } | null, returnUrl: string | null }; без measure=1 → null.
  // Строки обрезаются, place_id — только uuid, плохие координаты отбрасываются (lat и lng тогда null).
  function prefillFromQuery(query, { origin } = {}) {
    let q; try { q = new URLSearchParams(typeof query === "string" ? query : ""); } catch { return null; }
    if (q.get("measure") !== "1") return null;
    const lat = numOr(q.get("lat")), lng = numOr(q.get("lng")), geo = validCoord(lat, lng);
    const place = {
      place_id: uuidOr(q.get("place_id")), name: str(q.get("name"), 300), address: str(q.get("address")), entrance: str(q.get("entrance"), 200),
      lat: geo ? +lat.toFixed(6) : null, lng: geo ? +lng.toFixed(6) : null,
    };
    const any = place.place_id || place.name || place.address || place.entrance || geo;
    const own = origin !== undefined ? origin : (typeof location !== "undefined" ? location.origin : null);
    return { place: any ? place : null, returnUrl: safeReturn(q.get("return"), own) };
  }
  const byStatus = (list, statuses) => { const s = new Set(statuses || STATUSES); return (list || []).filter((r) => s.has(r.ramp.status)); };
  function counts(list) {
    const c = { all: 0, installed: 0, ordered: 0, measured: 0 };
    for (const r of list || []) { c.all++; c[r.ramp.status]++; }
    return c;
  }
  // Охват точек: [[южная широта, западная долгота], [северная, восточная]] или null
  function bounds(list) {
    if (!list || !list.length) return null;
    let s = 90, w = 180, n = -90, e = -180;
    for (const r of list) { s = Math.min(s, r.lat); n = Math.max(n, r.lat); w = Math.min(w, r.lng); e = Math.max(e, r.lng); }
    return [[s, w], [n, e]];
  }
  // Что передать в конструктор (handlers.onOpenRamp): только известные размеры; null — «открывать нечего»
  function toConstructor(rec) {
    const r = rec && rec.ramp; if (!r || r.hl == null) return null;
    const params = { hl: r.hl, hr: r.hr ?? r.hl };
    if (r.width != null) params.width = r.width;
    if (r.board != null) params.board = r.board;
    if (r.freeWidth != null) params.freeWidth = r.freeWidth;
    return { params, paint: r.paint ? r.paint.hex : null };
  }
  // Одинаковые места не двоятся: реестр главнее заявки, заявка главнее черновика
  function merge(...lists) {
    const seen = new Set(), reqs = new Set(), out = [];
    for (const l of lists) for (const r of l || []) {
      if (!r || seen.has(r.id)) continue;
      if (r.source !== "registry" && r.ramp.request_id && reqs.has(r.ramp.request_id)) continue;
      seen.add(r.id); if (r.ramp.request_id) reqs.add(r.ramp.request_id);
      out.push(r);
    }
    return out;
  }
  const ORDER = { installed: 0, ordered: 1, measured: 2 };
  const sort = (list) => list.slice().sort((a, b) => ORDER[a.ramp.status] - ORDER[b.ramp.status] || a.name.localeCompare(b.name, "ru"));
  // Показывать ли примеры: ?demo=0 — никогда, ?demo=1 — всегда, иначе только пока реестр пуст
  function demoMode(search) {
    let v = null;
    try { v = new URLSearchParams(search || "").get("demo"); } catch {}
    return v === "0" ? "off" : v === "1" ? "on" : "auto";
  }

  // ---------- источники ----------
  const doFetch = opts.fetch || (typeof fetch === "function" ? (u) => fetch(u, { cache: "no-cache" }) : null);
  const storage = opts.storage !== undefined ? opts.storage : (() => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } })();
  const search = opts.search !== undefined ? opts.search : (typeof location !== "undefined" ? location.search : "");
  const base = opts.base || "";
  async function loadGeo(url, extra) {
    if (!doFetch) return { list: [], ok: false };
    try {
      const res = await doFetch(base + url);
      if (!res || !res.ok) return { list: [], ok: false };
      return { list: fromGeoJSON(await res.json(), extra), ok: true };
    } catch { return { list: [], ok: false }; }
  }
  function local() {
    const out = [];
    if (!storage) return out;
    try { for (const req of JSON.parse(storage.getItem(SENT_KEY) || "[]") || []) { const r = fromRequest(req); if (r) out.push(r); } } catch {}
    try { const r = fromDraft(JSON.parse(storage.getItem(DRAFT_KEY) || "null")); if (r) out.push(r); } catch {}
    return out;
  }
  // Все пандусы с точкой: { list, demo, registryOk }. demo — в списке есть примеры
  async function load() {
    let reg, mine;
    if (Array.isArray(opts.adapters)) {
      const parts = await Promise.all(opts.adapters.map((a) => Promise.resolve().then(a).catch(() => [])));
      reg = { list: parts.flat().map((r) => normalize(r, { source: (r && r.source) || "registry" })).filter(Boolean), ok: true }; mine = [];
    } else { reg = await loadGeo(REGISTRY_URL, { source: "registry" }); mine = local(); }
    const mode = demoMode(search);
    let demo = [];
    if (mode === "on" || (mode === "auto" && reg.list.length === 0)) demo = (await loadGeo(DEMO_URL, { source: "demo", demo: true })).list;
    return { list: sort(merge(reg.list, mine, demo)), demo: demo.length > 0, registryOk: reg.ok };
  }
  const list = () => load().then((x) => x.list);

  return {
    STATUSES, STATUS_T, STATUS_MANY, PLACE_STATUSES, RAMP_TYPES, SENT_KEY, DRAFT_KEY, REGISTRY_URL, DEMO_URL, CENTER,
    validCoord, geoPoint, fmtCoord, uuidOr, statusFromPlan, rampType, hasPortable, placeOf, safeReturn, prefillFromQuery, normalize, fromGeoJSON, fromRequest, fromDraft, byStatus, counts, bounds, toConstructor, merge, sort, demoMode,
    load, list,
  };
}
