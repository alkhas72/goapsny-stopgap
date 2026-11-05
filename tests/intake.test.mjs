// «Новый замер»: чистая логика мастера — ввод чисел, шаги, кадры из видео, уменьшение фото, заявка, ответы помощника.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createIntake } from "../src/intake.js";
import { build } from "../src/ramp.js";

const I = createIntake();
const draft = (patch = {}) => ({ ...I.emptyDraft(new Date("2026-11-05T10:00:00Z")), ...patch });

test("ввод числа: запятая и точка, без округления", () => {
  assert.equal(I.parseNum("87,5"), 87.5);
  assert.equal(I.parseNum(" 845.25 "), 845.25);
  assert.equal(I.parseNum("90."), 90);
  assert.equal(I.parseNum(""), null);
  assert.equal(I.parseNum("8а"), undefined);
  assert.equal(I.parseNum("-5"), undefined);
});

test("ширина по умолчанию — min(900, свободная), как есть", () => {
  assert.equal(I.defaultWidth(1000), 900);
  assert.equal(I.defaultWidth(845.5), 845.5);
  assert.deepEqual(I.values(draft({ free: "845,5" })), { freeWidth: 845.5, width: 845.5, hl: null, hr: null });
  assert.equal(I.values(draft({ free: "1000", width: "850" })).width, 850);
});

test("в конструктор уходит только введённое; без Б порог ровный по А", () => {
  assert.deepEqual(I.draftParams(draft()), {});
  assert.deepEqual(I.draftParams(draft({ free: "880" })), { freeWidth: 880, width: 880 });
  assert.deepEqual(I.draftParams(draft({ free: "1000", hl: "87,5" })), { freeWidth: 1000, width: 900, hl: 87.5, hr: 87.5 });
  assert.deepEqual(I.draftParams(draft({ free: "1000", hl: "87", hr: "70" })), { freeWidth: 1000, width: 900, hl: 87, hr: 70 });
});

test("шаг 1: обязательные поля по очереди, контакт и вход необязательны", () => {
  assert.equal(I.stepCheck("who", draft()).reason, I.T.need.role);
  assert.equal(I.stepCheck("who", draft({ role: "auditor" })).reason, I.T.need.name);
  assert.equal(I.stepCheck("who", draft({ role: "auditor", name: "Аслан" })).reason, I.T.need.object);
  assert.equal(I.stepCheck("who", draft({ role: "auditor", name: "Аслан", object: "Школа" })).reason, I.T.need.address);
  assert.equal(I.stepCheck("who", draft({ role: "auditor", name: "Аслан", object: "Школа", address: "Сухум" })).ok, true);
});

test("фото входа обязательно, хотя бы одно", () => {
  assert.equal(I.stepCheck("overview", draft(), 0).ok, false);
  assert.equal(I.stepCheck("overview", draft(), 1).ok, true);
});

test("свободная ширина: пусто — замер неполный, не число — понятная причина", () => {
  assert.equal(I.stepCheck("free", draft()).reason, I.T.need.free);
  assert.equal(I.stepCheck("free", draft({ free: "84 см" })).reason, I.T.need.number);
  assert.equal(I.stepCheck("free", draft({ free: "0" })).reason, I.T.need.positive);
  assert.equal(I.stepCheck("free", draft({ free: "845" })).ok, true);
});

test("ширина шире свободной блокирует шаг текстом validate()", () => {
  const c = I.stepCheck("width", draft({ free: "845", width: "900" }));
  assert.equal(c.ok, false);
  assert.equal(c.rule, true);
  assert.match(c.reason, /Пандус 900 мм шире свободного места 845 мм/);
  assert.equal(I.stepCheck("width", draft({ free: "845" })).ok, true);   // по умолчанию 845
});

test("высоты: ≤18 блокирует, >300 пропускает с предупреждением", () => {
  assert.equal(I.stepCheck("hl", draft()).reason, I.T.need.hl);
  const low = I.stepCheck("hl", draft({ hl: "15" }));
  assert.equal(low.ok, false); assert.match(low.reason, /больше 18 мм/);
  const high = I.stepCheck("hr", draft({ hr: "320" }));
  assert.equal(high.ok, true); assert.match(high.warn, /выше 30 см/);
  assert.equal(I.stepCheck("hr", draft({ hr: "70,5" })).ok, true);
});

test("кадры из видео: 4–6 равномерно, внутри длительности", () => {
  assert.deepEqual(I.frameTimes(2), [0.25, 0.75, 1.25, 1.75]);
  assert.equal(I.frameTimes(5).length, 5);
  const t = I.frameTimes(12);
  assert.equal(t.length, 6);
  assert.deepEqual(t, [1, 3, 5, 7, 9, 11]);
  assert.deepEqual(I.frameTimes(10, 9).length, 6);                 // не больше 6
  assert.deepEqual(I.frameTimes(10, 2).length, 4);                 // не меньше 4
  for (const x of I.frameTimes(0.2)) assert.ok(x >= 0 && x <= 0.15);
  assert.deepEqual(I.frameTimes(0), []);
  assert.deepEqual(I.frameTimes(Infinity), []);
  assert.deepEqual(I.frameTimes(NaN), []);
});

test("уменьшение снимка: длинная сторона ≤ 1280, без увеличения", () => {
  assert.deepEqual(I.fitSize(4032, 3024, 1280), { w: 1280, h: 960, s: 1280 / 4032 });
  assert.deepEqual(I.fitSize(1080, 1920, 1280).h, 1280);
  assert.equal(I.fitSize(1080, 1920, 1280).w, 720);
  assert.deepEqual(I.fitSize(640, 480, 1280), { w: 640, h: 480, s: 1 });
  assert.deepEqual(I.fitSize(0, 480, 1280).w, 0);
});

test("план фото для хранилища уменьшается и укладывается в лимит документа", () => {
  const p = I.DB_PHOTO_PLAN;
  for (let i = 1; i < p.length; i++) assert.ok(p[i].max <= p[i - 1].max && p[i].q <= p[i - 1].q);
  assert.ok(I.PHOTO_DOC_MAX + 2048 < I.DOC_LIMIT);
});

test("заявка: замеры как введены, расчёт из build().dims, без лишних полей", () => {
  const d = draft({ role: "staff", name: " Аслан ", contact: "+7 940 000", object: "Школа № 3", address: "Сухум, Мира 1", entrance: "главный", free: "845,5", hl: "87,5", hr: "70", comment: "ступень сколота" });
  const p = I.draftParams(d);
  const model = build(p);
  const now = new Date("2026-11-05T11:00:00Z");
  const r = I.buildRequest(d, model, { now, photos: [{ step: "overview", kind: "photo" }, { step: "hl", kind: "frame", t: 1.5 }] });
  assert.equal(r.type, "ramp-request");
  assert.equal(r.measurer.name, "Аслан");
  assert.equal(r.roleText, "Сотрудник учреждения");
  assert.deepEqual(r.measure, { freeWidth: 845.5, width: 845.5, hl: 87.5, hr: 70, raw: { freeWidth: "845,5", width: "", hl: "87,5", hr: "70" } });
  assert.deepEqual(r.result.dims, model.dims);
  assert.equal(r.result.totalLen, model.dims.totalLen);
  assert.equal(r.result.kind, "skew");
  assert.equal(r.result.rib, false);
  assert.deepEqual(r.photos, [{ step: "overview", kind: "photo" }, { step: "hl", kind: "frame", t: 1.5 }]);
  assert.equal(r.submittedAt, now.toISOString());
  assert.ok(I.docBytes(r) < I.DOC_LIMIT);
  assert.ok(!("chat" in r) && !("media" in r));
});

test("ответ помощника: предложение числа вырезается в кнопку, неуверенное не принимается", () => {
  const a = I.parseSuggestions("На фото рулетка у левого края, читается 87,5 см? Нет — 87,5 мм.\nПРЕДЛОЖЕНИЕ: hl=87,5");
  assert.equal(a.text, "На фото рулетка у левого края, читается 87,5 см? Нет — 87,5 мм.");
  assert.deepEqual(a.items, [{ key: "hl", raw: "87,5", value: 87.5 }]);
  assert.deepEqual(I.parseSuggestions("ПРЕДЛОЖЕНИЕ: freewidth = 845 мм").items, [{ key: "freeWidth", raw: "845", value: 845 }]);
  assert.deepEqual(I.parseSuggestions("ПРЕДЛОЖЕНИЕ: hl=около 90").items, []);
  assert.equal(I.parseSuggestions("ПРЕДЛОЖЕНИЕ: hl=около 90").text, "");
  assert.deepEqual(I.parseSuggestions("ПРЕДЛОЖЕНИЕ: price=100").items, []);
  assert.deepEqual(I.parseSuggestions("ПРЕДЛОЖЕНИЕ: hr=0").items, []);
});

test("поток: начатая служебная строка не показывается", () => {
  assert.equal(I.visibleStream("Рулетка видна.\nПРЕД"), "Рулетка видна.");
  assert.equal(I.visibleStream("Рулетка видна.\nПРЕДЛОЖЕНИЕ: hl=8"), "Рулетка видна.");
  assert.equal(I.visibleStream("Привет"), "Привет");
});

test("инструкция помощнику: правила, шаг и числа есть; имени, контакта и адреса нет", () => {
  const d = draft({ name: "Аслан Тестов", contact: "+7 940 123", address: "Сухум, Мира 1", free: "845", hl: "87,5" });
  const s = I.buildPrompt(d, "hl", { images: ["1 — фото"] });
  assert.match(s, /Шаг 5 из 8|шаг 5 из 8/i);
  assert.match(s, /1:6/);
  assert.match(s, /30–50 см/);
  assert.match(s, /высота А \(слева\): 87,5 мм/);
  assert.match(s, /свободная ширина: 845 мм/);
  assert.match(s, /прочности, безопасности/);
  assert.match(s, /ПРЕДЛОЖЕНИЕ: <поле>=<число>/);
  assert.doesNotMatch(s, /Аслан|940 123|Мира/);
});

test("черновик: новый пустой, с данными — предлагается продолжить", () => {
  assert.equal(I.hasData(draft()), false);
  assert.equal(I.hasData(draft({ free: "845" })), true);
  assert.equal(I.hasData(draft({ free: "845", sent: { id: "x" } })), false);
  assert.match(I.newId(1730800000000, () => 0.5), /^r[0-9a-z]+$/);
});

test("первый незаполненный шаг", () => {
  const ok = draft({ role: "other", name: "А", object: "Б", address: "В", free: "900", hl: "90", hr: "90" });
  assert.equal(I.firstBlocked(ok, { overview: 1 }), I.STEPS.length);
  assert.equal(I.firstBlocked(ok, { overview: 0 }), 1);
  assert.equal(I.firstBlocked(draft(), {}), 0);
});

test("тайм-аут хранилища", async () => {
  await assert.rejects(I.withTimeout(new Promise(() => {}), 20), (e) => e.code === "timeout");
  assert.equal(await I.withTimeout(Promise.resolve(5), 20), 5);
});

// Палитра — одна на всё приложение: src/paints.js
import { createPaints } from "../src/paints.js";
const PAINTS = createPaints().list();

test("покраска для заявки: hex и RAL из списка конструктора, без покраски — null", () => {
  assert.equal(PAINTS.length, 15);
  assert.deepEqual(I.paintRecord("#1c542d"), { hex: "#1C542D", ral: "RAL 6035", name: "Pearl Emerald Green" });   // по умолчанию — та же палитра
  assert.deepEqual(I.paintRecord("#312E3D"), { hex: "#312E3D", ral: "RAL 300 20 10", name: "Heron Blue" });
  assert.deepEqual(I.paintRecord("#102c54", PAINTS), { hex: "#102C54", ral: "RAL 5026", name: "Pearl Night Blue" });
  assert.deepEqual(I.paintRecord("F39F18", PAINTS), { hex: "#F39F18", ral: "RAL 1037", name: "Sun Yellow" });
  assert.deepEqual(I.paintRecord(null, PAINTS), { hex: null, ral: "Без покраски", name: "Натуральное дерево" });
  assert.deepEqual(I.paintRecord("", PAINTS), { hex: null, ral: "Без покраски", name: "Натуральное дерево" });
  assert.deepEqual(I.paintRecord("#123456", PAINTS), { hex: "#123456", ral: "", name: "" });
  const d = draft({ free: "900", hl: "87" }), model = build(I.draftParams(d));
  assert.deepEqual(I.buildRequest(d, model, { paint: I.paintRecord("#D53032", PAINTS) }).paint, { hex: "#D53032", ral: "RAL 3018", name: "Strawberry Red" });
  assert.deepEqual(I.buildRequest(d, model, { paint: I.paintRecord(null, PAINTS) }).paint, { hex: null, ral: "Без покраски", name: "Натуральное дерево" });
  assert.equal(I.buildRequest(d, model).paint.hex, null);
});

test("ссылка «Примерить в AR»: числа как введены, покраска без # или raw", () => {
  const u = new URL(I.arUrl({ hl: "87,5", hr: "70", width: "845", board: 40 }, "#102C54"));
  assert.equal(u.origin + u.pathname, "https://goapsny-stopgap.vercel.app/ar");
  assert.deepEqual(Object.fromEntries(u.searchParams), { hl: "87,5", hr: "70", width: "845", board: "40", paint: "102C54" });
  assert.equal(new URL(I.arUrl({ hl: "90", hr: "90", width: "900", board: 40 }, null)).searchParams.get("paint"), "raw");
  assert.equal(new URL(I.arUrl({ hl: "90" }, "not-a-colour")).searchParams.get("paint"), "raw");
  assert.equal(I.arUrl({ hl: " 90 ", hr: "", width: null, board: 45 }, "f39f18", "http://localhost:8772/"), "http://localhost:8772/ar?hl=90&board=45&paint=F39F18");
  // из черновика: Б = А, если не введена; ширина по умолчанию — из расчёта; доска — из конструктора
  const d = draft({ free: "845,5", hl: "87,5" }), model = build(I.draftParams(d));
  assert.deepEqual(I.arValues(d, model), { hl: "87,5", hr: "87,5", width: "845,5", board: model.params.board });
});
