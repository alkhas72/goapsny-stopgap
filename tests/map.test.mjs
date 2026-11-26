// Карта пандусов: чистая логика — вид записи, статусы, координаты, точка в заявке, ссылка замера, разметка точки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRampsSource } from "../src/ramps-source.js";
import { createRampLayers } from "../src/ramps-layer.js";
import { createMap } from "../src/map.js";
import { createIntake } from "../src/intake.js";
import { build } from "../src/ramp.js";

const S = createRampsSource({ fetch: null, storage: null, search: "" });
const L = createRampLayers();
const I = createIntake();
const json = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const draft = (patch = {}) => ({ ...I.emptyDraft(new Date("2026-11-05T10:00:00Z")), ...patch });
const request = (patch = {}) => {
  const d = draft({ role: "staff", name: "Аслан Тайный", contact: "+7 940 111-22-33", object: "Школа № 3", address: "Сухум, Мира 1", entrance: "главный",
    free: "1000", hl: "87,5", hr: "70", comment: "секретный комментарий", extraNote: "личная заметка", geo: { lat: 43.0021, lng: 41.0228, src: "gps", acc: 12.4 }, ...patch });
  return I.buildRequest(d, build(I.draftParams(d)), { now: new Date("2026-11-05T11:00:00Z"), photos: [{ step: "overview", kind: "photo" }], paint: { hex: "#102C54", ral: "RAL 5026", name: "Pearl Night Blue" } });
};

test("координаты: конечные числа в градусах, (0, 0) — не точка", () => {
  assert.equal(S.validCoord(43.0015, 41.0234), true);
  assert.equal(S.validCoord(0, 0), false);
  assert.equal(S.validCoord(91, 41), false);
  assert.equal(S.validCoord(43, 181), false);
  assert.equal(S.validCoord("43", 41), false);
  assert.equal(S.validCoord(NaN, 41), false);
});

test("точка объекта: округление, источник, точность; плохая точка → null", () => {
  assert.deepEqual(S.geoPoint({ lat: 43.00151234, lng: "41,0234", src: "gps", acc: 12.4 }), { lat: 43.001512, lng: 41.0234, src: "gps", acc: 12 });
  assert.deepEqual(S.geoPoint({ lat: 43, lng: 41, src: "чужое" }), { lat: 43, lng: 41, src: "tap" });
  assert.equal(S.geoPoint({ lat: 0, lng: 0 }), null);
  assert.equal(S.geoPoint({ lat: "север", lng: 41 }), null);
  assert.equal(S.geoPoint(null), null);
  assert.equal(S.fmtCoord({ lat: 43.0015, lng: 41.0234 }), "43,00150, 41,02340");
  assert.equal(S.fmtCoord(null), "");
});

test("запись: место + блок ramp, поля для слияния с GoApsny", () => {
  const r = S.normalize({ id: "a1", place_id: UUID.toUpperCase(), name: " Школа ", address: "Мира 1", lat: "43.0015", lng: 41.0234, place_status: "yellow",
    status: "installed", hl: 85, hr: "70", width: 900, board: 40, free_width: "1100", paint_hex: "102c54", paint_ral: "RAL 5026", installed_at: "2026-10-12", note: "порог" });
  assert.equal(r.id, "a1");
  assert.equal(r.name, "Школа");
  assert.deepEqual([r.lat, r.lng], [43.0015, 41.0234]);
  assert.equal(r.status, "yellow");                               // доступность места (цвет пина GoApsny)
  assert.equal(r.ramp_type, "portable_available");
  assert.equal(r.ramp.status, "installed");
  assert.deepEqual([r.ramp.hl, r.ramp.hr, r.ramp.width, r.ramp.board, r.ramp.freeWidth], [85, 70, 900, 40, 1100]);
  assert.deepEqual(r.ramp.paint, { hex: "#102C54", ral: "RAL 5026", name: "" });
  assert.equal(r.ramp.installed_at, "2026-10-12T00:00:00.000Z");
  assert.equal(r.source, "registry");
  assert.equal(r.demo, false);
});

test("запись: без координат, без статуса или без id записи нет", () => {
  assert.equal(S.normalize({ id: "a", status: "installed", lat: 0, lng: 0 }), null);
  assert.equal(S.normalize({ id: "a", status: "снесён", lat: 43, lng: 41 }), null);
  assert.equal(S.normalize({ status: "installed", lat: 43, lng: 41 }), null);
  assert.equal(S.normalize(null), null);
  const r = S.normalize({ id: "a", status: "measured", lat: 43, lng: 41, hl: 58 });
  assert.equal(r.ramp.hr, 58);                                    // высота Б не снята — равна А
  assert.equal(r.name, "Без названия");
  assert.equal(r.status, null);
});

test("ramp_type: стоит → portable_available, заявка → portable_on_request, только замер → none", () => {
  assert.equal(S.rampType("installed"), "portable_available");
  assert.equal(S.rampType("ordered"), "portable_on_request");
  assert.equal(S.rampType("measured"), "none");
  const at = (status) => S.normalize({ id: status, status, lat: 43, lng: 41 });
  assert.equal(S.hasPortable(at("installed")), true);
  assert.equal(S.hasPortable(at("ordered")), true);
  assert.equal(S.hasPortable(at("measured")), false);
  // запись GoApsny без блока ramp: состояние берётся из её ramp_type, status остаётся доступностью места
  const g = S.normalize({ id: UUID, name: "Аптека", lat: 43, lng: 41, status: "green", ramp_type: "portable_on_request" });
  assert.equal(g.ramp.status, "ordered");
  assert.equal(g.status, "green");
  assert.equal(S.normalize({ id: UUID, lat: 43, lng: 41, status: "green", ramp_type: "permanent" }), null);
});

test("статусы плана данных GoApsny сводятся к трём состояниям карты", () => {
  for (const s of ["draft", "remeasure", "measured"]) assert.equal(S.statusFromPlan(s), "measured", s);
  for (const s of ["submitted", "production", "ready", "ordered"]) assert.equal(S.statusFromPlan(s), "ordered", s);
  for (const s of ["installed", "service"]) assert.equal(S.statusFromPlan(s), "installed", s);
  for (const s of ["cancelled", "", null, 5]) assert.equal(S.statusFromPlan(s), null);
  assert.equal(S.normalize({ id: "p", lat: 43, lng: 41, status: "red", ramp: { status: "remeasure" } }).ramp.status, "measured");
});

test("реестр GeoJSON: точки [долгота, широта], битые объекты пропускаются", () => {
  const list = S.fromGeoJSON({ type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [41.02, 43.0] }, properties: { id: "x", name: "Школа", status: "ordered", hl: 98 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [41.02] }, properties: { id: "y", status: "ordered" } },
    { type: "Feature", geometry: { type: "LineString", coordinates: [[41, 43], [41.1, 43.1]] }, properties: { id: "z", status: "ordered" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [41.03, 43.01] }, properties: { id: "w" } },
    null,
  ] });
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].lat, list[0].lng], [43, 41.02]);
  assert.deepEqual(S.fromGeoJSON(null), []);
  assert.deepEqual(S.fromGeoJSON({ type: "Feature" }), []);
});

test("данные в репозитории: реестр пуст, примеров ровно три — по одному на статус", () => {
  assert.deepEqual(json("data/ramps.geojson").features, []);
  const demo = S.fromGeoJSON(json("data/ramps.demo.geojson"), { source: "demo", demo: true });
  assert.equal(demo.length, 3);
  assert.deepEqual(demo.map((r) => r.ramp.status).sort(), ["installed", "measured", "ordered"]);
  assert.ok(demo.every((r) => r.demo && r.source === "demo" && /^Пример/.test(r.name)));
  assert.deepEqual(S.counts(demo), { all: 3, installed: 1, ordered: 1, measured: 1 });
});

test("фильтр по статусу, счёт и охват", () => {
  const list = ["installed", "ordered", "ordered", "measured"].map((status, i) => S.normalize({ id: "r" + i, status, lat: 43 + i / 100, lng: 41 + i / 100 }));
  assert.deepEqual(S.byStatus(list, ["ordered"]).map((r) => r.id), ["r1", "r2"]);
  assert.equal(S.byStatus(list, []).length, 0);
  assert.equal(S.byStatus(list).length, 4);
  assert.deepEqual(S.counts(list), { all: 4, installed: 1, ordered: 2, measured: 1 });
  assert.deepEqual(S.bounds(list), [[43, 41], [43.03, 41.03]]);
  assert.equal(S.bounds([]), null);
});

test("заявка мастера несёт точку объекта, uuid и место GoApsny", () => {
  const r = request({ placeId: UUID });
  assert.deepEqual(r.object.geo, { lat: 43.0021, lng: 41.0228, src: "gps", acc: 12 });
  assert.equal(r.object.place_id, UUID);
  assert.match(r.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(r.id, /^r[0-9a-z]+$/);                             // прежний короткий номер не сломан
  const none = request({ geo: null });
  assert.equal("geo" in none.object, false);                      // точка необязательна
  assert.equal(none.object.place_id, null);
  assert.equal("geo" in request({ geo: { lat: 0, lng: 0 } }).object, false);
  assert.equal(request({ placeId: "не uuid" }).object.place_id, null);
  assert.notEqual(I.emptyDraft().uuid, I.emptyDraft().uuid);
  assert.equal(I.stepCheck("who", draft({ role: "staff", name: "А", object: "Школа", address: "Мира 1" }), 0).ok, true);   // точка шаг не держит
});

test("заявка этого устройства → запись «заявка»; личное на карту не попадает", () => {
  const req = request({ placeId: UUID });
  const rec = S.fromRequest(req);
  assert.equal(rec.id, "req:" + req.id);
  assert.equal(rec.place_id, UUID);
  assert.equal(rec.source, "request");
  assert.equal(rec.ramp.status, "ordered");
  assert.equal(rec.ramp_type, "portable_on_request");
  assert.deepEqual([rec.lat, rec.lng], [43.0021, 41.0228]);
  assert.deepEqual([rec.ramp.hl, rec.ramp.hr, rec.ramp.width, rec.ramp.freeWidth], [87.5, 70, 900, 1000]);
  assert.equal(rec.ramp.paint.hex, "#102C54");
  assert.equal(rec.ramp.request_uuid, req.uuid);
  const flat = JSON.stringify(rec);
  for (const secret of ["Аслан", "Тайный", "940", "секретный", "личная заметка", "staff", "Сотрудник", "overview", "measurer", "contact", "photos"]) {
    assert.equal(flat.includes(secret), false, secret);
  }
  assert.equal(rec.ramp.note, "");
  assert.equal(S.fromRequest(request({ geo: null })), null);      // без точки на карту не попадает
  assert.equal(S.fromRequest(null), null);
});

test("черновик с точкой → «замер»; отправленный черновик не двоится с заявкой", () => {
  const d = draft({ name: "Аслан Тайный", contact: "+7 940", comment: "секрет", object: "Библиотека", free: "1000", hl: "58", geo: { lat: 43.0058, lng: 41.0301, src: "tap" } });
  const rec = S.fromDraft(d);
  assert.equal(rec.ramp.status, "measured");
  assert.equal(rec.ramp_type, "none");
  assert.equal(rec.name, "Библиотека");
  assert.deepEqual([rec.ramp.hl, rec.ramp.hr, rec.ramp.width, rec.ramp.freeWidth], [58, 58, 900, 1000]);
  assert.equal(/Аслан|940|секрет/.test(JSON.stringify(rec)), false);
  assert.equal(S.fromDraft(draft({ object: "Без точки" })), null);
  assert.equal(S.fromDraft({ ...d, sent: { id: d.id } }), null);
  const req = S.fromRequest(request()), same = S.fromDraft({ ...draft({ geo: { lat: 43, lng: 41 } }), id: req.ramp.request_id });
  assert.deepEqual(S.merge([req], [same]).map((r) => r.source), ["request"]);
  assert.deepEqual(S.merge([req, req]).length, 1);
});

test("источник: реестр пуст → три примера с пометкой; ?demo=0 их скрывает; заявки устройства видны", async () => {
  const files = { "data/ramps.geojson": json("data/ramps.geojson"), "data/ramps.demo.geojson": json("data/ramps.demo.geojson") };
  const fetchFile = async (u) => (files[u] ? { ok: true, json: async () => files[u] } : { ok: false });
  const store = (obj) => ({ getItem: (k) => (k in obj ? obj[k] : null) });
  const auto = await createRampsSource({ fetch: fetchFile, storage: store({}), search: "" }).load();
  assert.equal(auto.list.length, 3);
  assert.equal(auto.demo, true);
  assert.deepEqual(auto.list.map((r) => r.ramp.status), ["installed", "ordered", "measured"]);
  const off = await createRampsSource({ fetch: fetchFile, storage: store({}), search: "?demo=0" }).load();
  assert.deepEqual([off.list.length, off.demo], [0, false]);
  const mine = createRampsSource({ fetch: fetchFile, storage: store({ [S.SENT_KEY]: JSON.stringify([request()]) }), search: "?demo=0" });
  assert.deepEqual((await mine.list()).map((r) => r.source), ["request"]);
  // реестр не пуст → примеры сами не показываются
  const full = { ...files, "data/ramps.geojson": { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [41, 43] }, properties: { id: "real", status: "installed" } }] } };
  const real = await createRampsSource({ fetch: async (u) => ({ ok: true, json: async () => full[u] }), storage: null, search: "" }).load();
  assert.deepEqual([real.list.length, real.demo], [1, false]);
  // нет сети → пустой список, без исключения
  const down = await createRampsSource({ fetch: async () => { throw new Error("сеть"); }, storage: null, search: "" }).load();
  assert.deepEqual([down.list.length, down.registryOk], [0, false]);
  assert.equal(S.demoMode("?demo=1"), "on");
  assert.equal(S.demoMode("?view=map"), "auto");
});

test("источник заменяется одним адаптером (будущий ramps.place_card из GoApsny)", async () => {
  const src = createRampsSource({ search: "?demo=0", adapters: [async () => [
    { id: UUID, place_id: UUID, name: "Аптека", lat: 43.001, lng: 41.02, status: "green", ramp_type: "portable_available", ramp: { status: "service", hl: 90, hr: 85, width: 900 } },
    { id: "плохая", lat: 0, lng: 0, ramp: { status: "installed" } },
  ], async () => { throw new Error("сбой адаптера"); }] });
  const { list } = await src.load();
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].place_id, list[0].status, list[0].ramp.status, list[0].ramp_type], [UUID, "green", "installed", "portable_available"]);
});

test("что уходит в конструктор и в мастер замера", () => {
  const rec = S.normalize({ id: "a", place_id: UUID, name: "Школа", address: "Мира 1", entrance: "главный", lat: 43, lng: 41, status: "installed", hl: 85, hr: 70, width: 900, board: 40, paint_hex: "#102C54" });
  assert.deepEqual(S.toConstructor(rec), { params: { hl: 85, hr: 70, width: 900, board: 40 }, paint: "#102C54" });
  assert.deepEqual(S.toConstructor(S.normalize({ id: "b", lat: 43, lng: 41, status: "measured", hl: 58, free_width: 1000 })), { params: { hl: 58, hr: 58, freeWidth: 1000 }, paint: null });
  assert.equal(S.toConstructor(S.normalize({ id: "c", lat: 43, lng: 41, status: "measured" })), null);
  assert.deepEqual(S.placeOf(rec), { place_id: UUID, name: "Школа", address: "Мира 1", entrance: "главный", lat: 43, lng: 41 });
  assert.equal(S.placeOf(null), null);
});

test("ссылка замера: ?measure=1&place_id=…&name=…&lat=…&lng=…&return=…", () => {
  const o = { origin: "https://stopgap.example" };
  const q = `?measure=1&place_id=${UUID}&name=${encodeURIComponent("Школа № 3")}&address=${encodeURIComponent("Сухум, Мира 1")}&entrance=${encodeURIComponent("со двора")}&lat=43.00151234&lng=41,0234&return=${encodeURIComponent("https://map.goapsny.org/place/1?x=1")}`;
  assert.deepEqual(S.prefillFromQuery(q, o), {
    place: { place_id: UUID, name: "Школа № 3", address: "Сухум, Мира 1", entrance: "со двора", lat: 43.001512, lng: 41.0234 },
    returnUrl: "https://map.goapsny.org/place/1?x=1",
  });
  assert.equal(S.prefillFromQuery("?view=map&name=x", o), null);                    // без measure=1 это не ссылка замера
  assert.equal(S.prefillFromQuery("?measure=0", o), null);
  assert.deepEqual(S.prefillFromQuery("?measure=1", o), { place: null, returnUrl: null });   // просто открыть мастер
  const bad = S.prefillFromQuery("?measure=1&place_id=42&name=" + "я".repeat(900) + "&lat=0&lng=0", o).place;
  assert.equal(bad.place_id, null);                                                  // не uuid
  assert.equal(bad.name.length, 300);                                                // строки обрезаются
  assert.deepEqual([bad.lat, bad.lng], [null, null]);                                // плохие координаты отбрасываются
  assert.deepEqual([S.prefillFromQuery("?measure=1&lat=95&lng=41&name=a", o).place.lat, S.prefillFromQuery("?measure=1&lat=abc&lng=41&name=a", o).place.lng], [null, null]);
});

test("адрес возврата: только https и только свои узлы", () => {
  const own = "https://stopgap.example";
  for (const ok of ["https://goapsny.org/", "https://map.goapsny.org/place/1", "https://goapsny-mvp.vercel.app/?p=1", "https://stopgap.example/back"]) assert.equal(S.safeReturn(ok, own), ok, ok);
  for (const bad of [
    "http://map.goapsny.org/", "https://evil.example/", "https://goapsny.org.evil.example/", "https://evilgoapsny.org/", "https://goapsny-mvp.vercel.app.evil.example/",
    "https://user:pass@goapsny.org/", "javascript:alert(1)", "//goapsny.org/", "/local", "data:text/html,x", "", null, 42, "https://other.vercel.app/",
  ]) assert.equal(S.safeReturn(bad, own), null, String(bad));
  assert.equal(S.safeReturn("http://localhost:8765/x", "http://localhost:8765"), null);   // свой узел тоже только по https
  // пробные сборки возвращают друг к другу; с боевого адреса возврат на пробную сборку не принимается
  const pv = "https://goapsny-stopgap-ol77k36h2-alkhas72s-projects.vercel.app", mapPv = "https://goapsny-abc123-alkhas72s-projects.vercel.app/?mapper=1";
  assert.equal(S.safeReturn(mapPv, pv), mapPv);
  assert.equal(S.safeReturn(mapPv, own), null);
  assert.equal(S.safeReturn(mapPv, "https://goapsny-stopgap.vercel.app"), null);
  for (const bad of ["https://alkhas72s-projects.vercel.app/", "https://x-alkhas72s-projects.vercel.app.evil.example/", "http://goapsny-abc-alkhas72s-projects.vercel.app/", "https://evil.vercel.app/"]) assert.equal(S.safeReturn(bad, pv), null, bad);
  assert.equal(S.prefillFromQuery("?measure=1&return=" + encodeURIComponent("https://evil.example/"), { origin: own }).returnUrl, null);
  assert.equal(S.prefillFromQuery("?measure=1&return=" + encodeURIComponent("https://stopgap.example/x"), { origin: own }).returnUrl, "https://stopgap.example/x");
});

test("мастер: предзаполнение с карты меняет только поля места", () => {
  const d = I.applyPrefill(draft({ name: "Аслан" }), { place: { place_id: UUID, name: "Школа № 3", address: "Мира 1", entrance: "", lat: 43.0021, lng: 41.0228 }, returnUrl: "https://map.goapsny.org/p/1" });
  assert.deepEqual([d.object, d.address, d.entrance, d.placeId, d.name], ["Школа № 3", "Мира 1", "", UUID, "Аслан"]);
  assert.deepEqual(d.geo, { lat: 43.0021, lng: 41.0228, src: "tap" });
  assert.equal(d.returnUrl, "https://map.goapsny.org/p/1");
  assert.equal(I.hasData(d), true);
  const e = I.applyPrefill(draft(), { place: { place_id: "нет", name: "Аптека", lat: 0, lng: 0 }, returnUrl: "https://evil.example/" });
  assert.deepEqual([e.object, e.geo, e.placeId, e.returnUrl], ["Аптека", null, null, null]);
  const same = draft({ object: "Как было" });
  assert.equal(I.applyPrefill(same, null).object, "Как было");
  assert.equal(I.applyPrefill(same, {}).object, "Как было");
});

test("точка пандуса: пурпурный центр пина GoApsny, кольцо — пандуса ещё нет", () => {
  assert.equal(L.PURPLE, "#7A5AF8");
  assert.deepEqual(L.PIN, { w: 28, h: 36, cx: 14, cy: 14, r: 5.5, stroke: 2.5 });
  // в пине 28×36: тот же круг, что в pinMarkup.ts — cx 14, cy 14, r 5.5, белая обводка 2.5
  assert.equal(L.rampDot({ installed: true, svg: false, ...L.PIN }), '<circle cx="14" cy="14" r="5.5" fill="#7A5AF8" stroke="#FFFFFF" stroke-width="2.5"/>');
  const ring = L.rampDot({ installed: false, svg: false, ...L.PIN });
  assert.equal((ring.match(/<circle/g) || []).length, 2);
  assert.match(ring, /fill="#FFFFFF" stroke="#7A5AF8"/);          // белая середина, пурпурное кольцо
  const svg = L.rampDot({ installed: true, size: 20 });
  assert.match(svg, /^<svg class="gm-dot" width="20" height="20" viewBox="0 0 20 20"/);
  assert.match(svg, /fill="#7A5AF8"/);
  assert.equal(L.isInstalled({ ramp: { status: "installed" } }), true);
  assert.equal(L.isInstalled({ ramp: { status: "ordered" } }), false);
  assert.equal(L.isInstalled({ ramp_type: "portable_available" }), true);
  assert.match(L.markerHTML({ name: "<b>Школа</b>", ramp: { status: "ordered" } }), /&lt;b&gt;Школа&lt;\/b&gt;/);   // имя экранируется
});

test("подложка: OpenStreetMap по умолчанию, Carto — ручной запасной выбор, тёмной нет", () => {
  assert.deepEqual(L.BASE_ORDER, ["osm", "carto"]);
  assert.equal(L.BASES.osm.url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.equal(L.BASES.osm.options.maxZoom, 19);
  assert.equal(L.baseKey(null), "osm");
  assert.equal(L.baseKey("carto"), "carto");
  assert.equal(L.baseKey("dark"), "osm");
  const mem = {}, storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  assert.equal(L.savedBase(storage), null);
  L.saveBase("carto", storage);
  assert.equal(mem["goapsny-stopgap:basemap"], "carto");
  assert.equal(L.savedBase(storage), "carto");
  assert.match(L.NIGHT_FILTER, /invert\(1\)/);                    // «ночь» — фильтр на плитках, не отдельная подложка
});

test("экран карты ходит к движку только через прослойку", () => {
  const src = readFileSync(new URL("../src/map.js", import.meta.url), "utf8");
  assert.equal(/\bL\.(map|marker|tileLayer|circle|divIcon|layerGroup|control)\b/.test(src), false);
  assert.equal(/window\.L\b/.test(src), false);
  for (const act of ["showPoints", "selectPoint", "createView"]) assert.ok(src.includes(act), act);
  assert.ok(readFileSync(new URL("../src/intake.js", import.meta.url), "utf8").includes("placePoint"));
});

test("экран карты: подписи, склонение, фильтр-капсулы и слои", () => {
  const M = createMap({ source: S, layers: L });
  assert.deepEqual([1, 2, 5, 11, 21, 104].map((n) => M.plural(n)), ["пандус", "пандуса", "пандусов", "пандусов", "пандус", "пандуса"]);
  assert.equal(M.fmtMm(87.5), "87,5");
  assert.equal(M.fmtMm(900), "900");
  assert.equal(M.fmtMm(null), "—");
  assert.equal(M.fmtDate("2026-10-12T00:00:00.000Z"), "12.10.2026");
  assert.equal(M.fmtDate(null), "");
  const rec = S.normalize({ id: "a", lat: 43, lng: 41, status: "ordered", hl: 98, hr: 87.5, ordered_at: "2026-11-12" });
  assert.equal(M.subline(rec), "Заявка · А 98 · Б 87,5 мм");
  assert.equal(M.whenText(rec), "Заявка 12.11.2026");
  assert.equal(M.subline(S.normalize({ id: "b", lat: 43, lng: 41, status: "measured" })), "Замер");
  assert.equal(M.T.legend, "пурпурная точка — приставной пандус");
  const all = new Set(S.STATUSES);
  assert.deepEqual([...M.chipPick(all, "measured")], ["measured"]);                 // «Замеры» — один клик
  assert.deepEqual([...M.chipPick(new Set(["measured"]), "measured")].sort(), [...all].sort());   // повторный клик — снова все
  assert.deepEqual([...M.chipPick(new Set(["measured"]), "ordered")], ["ordered"]);
  assert.equal(M.chipPick(new Set(["ordered"]), "all").size, 3);
  assert.equal(M.chipOn(all, "all"), true);
  assert.equal(M.chipOn(all, "measured"), false);
  assert.equal(M.chipOn(new Set(["measured"]), "measured"), true);
  assert.deepEqual([...M.layerToggle(all, "ordered")].sort(), ["installed", "measured"]);
  assert.deepEqual([...M.layerToggle(new Set(["measured"]), "measured")], ["measured"]);   // последний слой не выключается
  assert.deepEqual([...M.layerToggle(new Set(["measured"]), "installed")].sort(), ["installed", "measured"]);
});
