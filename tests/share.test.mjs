// Код конфигурации для ссылки и QR: точный круговой перенос, версия, понятные ошибки.
// Запуск: node --test tests/share.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createShare } from "../src/share.js";

const sh = createShare();
const base = { hl: 85, hr: 70, width: 900, board: 40, freeWidth: null, paint: null };
const rt = (p) => sh.decode(sh.encode(p));

test("85.5 и прочие десятые переносятся точно", () => {
  const p = { ...base, hl: 85.5, hr: 70.1, freeWidth: 845.3 };
  const r = rt(p);
  assert.equal(r.version, 1);
  assert.deepEqual(r.params, p);
  assert.equal(r.params.hl, 85.5);
});

test("высоты 18,1…300,0 с шагом 0,1 — без округления", () => {
  for (let t = 181; t <= 3000; t++) {
    const v = t / 10;
    const r = rt({ ...base, hl: v, hr: 3181 - t > 180 ? (3181 - t) / 10 : v });
    assert.equal(r.params.hl, v);
  }
});

test("каждая доска 35,0…50,0 с шагом 0,1", () => {
  for (let t = 350; t <= 500; t++) assert.equal(rt({ ...base, board: t / 10 }).params.board, t / 10);
});

test("freeWidth null и число, цвет null и hex", () => {
  assert.equal(rt(base).params.freeWidth, null);
  assert.equal(rt({ ...base, freeWidth: undefined }).params.freeWidth, null);
  assert.equal(rt({ ...base, freeWidth: 845 }).params.freeWidth, 845);
  assert.equal(rt(base).params.paint, null);
  assert.equal(rt({ ...base, paint: "#102C54" }).params.paint, "#102C54");
  assert.equal(rt({ ...base, paint: "102c54" }).params.paint, "#102C54");
  assert.equal(rt({ ...base, paint: "#abc" }).params.paint, "#AABBCC");
});

test("сотые сохраняются точно, больше двух знаков — явная ошибка", () => {
  assert.deepEqual(rt({ ...base, hl: 85.25, freeWidth: 844.75 }).params, { ...base, hl: 85.25, freeWidth: 844.75 });
  assert.throws(() => sh.encode({ ...base, hl: 85.255 }), /высота слева.*двух знаков/);
  assert.throws(() => sh.encode({ ...base, freeWidth: 845.001 }), /свободная ширина/);
  // шум двоичной дроби не считается цифрой пользователя
  assert.equal(rt({ ...base, hl: 85.1 + 0.2 }).params.hl, 85.3);
});

test("перебор комбинаций: decode(encode(p)) === p", () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) {
    const tenth = () => (Math.round(rnd() * 3200) + 1) / 10;   // как parseFloat("85.5"): ровно n/10
    const p = {
      hl: tenth(), hr: tenth(), width: Math.round(400 + rnd() * 1000), board: 35 + Math.round(rnd() * 150) / 10,
      freeWidth: rnd() < 0.3 ? null : (Math.round(rnd() * 15000) + 1) / 10,
      paint: rnd() < 0.3 ? null : "#" + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0").toUpperCase(),
    };
    assert.deepEqual(rt(p).params, p);
  }
});

test("код компактный и URL/QR-безопасный", () => {
  const code = sh.encode({ ...base, freeWidth: 845, paint: "#102C54" });
  assert.match(code, /^s1\.[A-Za-z0-9_-]+$/);
  assert.ok(code.length <= 26, code);
  assert.equal(encodeURIComponent(code), code);
});

test("старый код версии 1 продолжает открываться (зафиксированная строка)", () => {
  const code = sh.encode({ hl: 85.5, hr: 70, width: 900, board: 40, freeWidth: 845, paint: "#102C54" });
  assert.equal(code, GOLDEN);
  assert.deepEqual(sh.decode(GOLDEN), { version: 1, params: { hl: 85.5, hr: 70, width: 900, board: 40, freeWidth: 845, paint: "#102C54" } });
});
const GOLDEN = "s1.A9cGvAWoRpADgkIQLFRa";

test("имя для #хэша: только [A-Za-z0-9-] и обратимо", () => {
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2000; i++) {
    const p = { ...base, hl: (Math.round(rnd() * 3000) + 1) / 10, hr: (Math.round(rnd() * 3000) + 1) / 10, freeWidth: rnd() < 0.5 ? null : (8000 + i) / 10, paint: rnd() < 0.5 ? null : "#" + (i * 2654435761 % 0xffffff).toString(16).padStart(6, "0").toUpperCase() };
    const code = sh.encode(p);
    const name = sh.toHashName(code);
    assert.match(name, /^[A-Za-z0-9-]+$/);
    assert.equal(sh.fromHashName(name), code);
    assert.deepEqual(sh.decode(name).params, p);          // decode принимает и имя
    assert.deepEqual(sh.decode("#" + name).params, p);
  }
});

test("неверный ввод в encode — понятная ошибка", () => {
  assert.throws(() => sh.encode(null), /Нет параметров/);
  assert.throws(() => sh.encode({ ...base, hl: undefined }), /высота слева.*число/);
  assert.throws(() => sh.encode({ ...base, hr: NaN }), /высота справа/);
  assert.throws(() => sh.encode({ ...base, width: 0 }), /больше нуля/);
  assert.throws(() => sh.encode({ ...base, board: -40 }), /больше нуля/);
  assert.throws(() => sh.encode({ ...base, hl: 1e6 }), /диапазона/);
  assert.throws(() => sh.encode({ ...base, paint: "синий" }), /#RRGGBB/);
});

test("неверный код в decode — понятная ошибка на русском", () => {
  const good = sh.encode({ ...base, freeWidth: 845 });
  const cases = [
    ["", /пуст/],
    [null, /пуст/],
    ["hello", /Неизвестный формат/],
    ["s1.", /Неизвестный формат/],
    ["s1.abc=", /Неизвестный формат/],
    ["s9." + good.slice(3), /более новой версией/],
    ["s0." + good.slice(3), /не поддерживается/],
    ["s1.A", /длина/],
    ["s1.AA", /короткий/],
    [good.slice(0, -2), /контрольная|обрывается|короткий/],
    [good.slice(0, -1) + (good.at(-1) === "A" ? "B" : "A"), /контрольная/],
    [good + "AAAA", /контрольная|лишние/],
    ["s1-x-9", /экранировка/],
  ];
  for (const [s, re] of cases) assert.throws(() => sh.decode(s), (e) => e instanceof Error && re.test(e.message) && /[а-я]/i.test(e.message), String(s));
  // испорченный символ в любом месте ловится
  for (let i = 3; i < good.length; i++) {
    const ch = good[i] === "Q" ? "R" : "Q";
    const bad = good.slice(0, i) + ch + good.slice(i + 1);
    let res = null;
    try { res = sh.decode(bad); } catch (e) { assert.match(e.message, /[а-я]/i); continue; }
    assert.notDeepEqual(res.params, sh.decode(good).params, "подмена символа незаметна");
  }
});

test("неизвестные флаги (будущий формат) не читаются молча", () => {
  // флаги 0x08 + корректная CRC
  const crc8 = (bytes) => { let c = 0; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 7) & 255 : (c << 1) & 255; } return c; };
  const body = [8, 0x82, 0x06, 0xbc, 0x05, 0x88, 0x46, 0x90, 0x03];
  const b64 = Buffer.from([...body, crc8(body)]).toString("base64url");
  assert.throws(() => sh.decode("s1." + b64), /неизвестные флаги/);
});
