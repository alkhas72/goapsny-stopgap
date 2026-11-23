// Короткий код конфигурации для ссылки и QR (ТЗ п. 8): «s1.» + base64url компактной двоичной записи.
//
// Формат версии 1 (байты):
//   [флаги] [hl] [hr] [width] [board] [freeWidth]? [R G B]? [CRC-8]
//   флаги: бит 0 — есть freeWidth, бит 1 — есть цвет, бит 2 — значения в сотых мм (иначе в десятых);
//          остальные биты зарезервированы и в v1 должны быть нулями.
//   числа — беззнаковые varint (LEB128) от значения × 10 (или × 100 при бите 2).
// Округления нет: десятые и сотые мм сохраняются точно, больше двух знаков после запятой — ошибка.
// Версия в префиксе («s1», «s2», …): decode разбирает каждую известную версию, старые коды продолжают
// открываться. Версия кода не равна PARAMS_VERSION из ramp.js, но совпадает с ней для v1.
// Чистый модуль: без DOM, без библиотек, единственное объявление верхнего уровня — фабрика.
export function createShare() {
  const VERSION = 1;
  const MAX_MM = 10000;          // 10 м: граница разумности, а не правило изделия (его проверяет validate())
  const NUMS = [["hl", "высота слева"], ["hr", "высота справа"], ["width", "ширина пандуса"], ["board", "толщина доски"]];
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const F_FREE = 1, F_PAINT = 2, F_CENTI = 4, F_KNOWN = 7;

  const fail = (msg) => { throw new Error(msg); };

  function crc8(bytes) {
    let c = 0;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
    return c;
  }

  function toB64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      const chars = Math.ceil(((Math.min(3, bytes.length - i)) * 8) / 6);
      for (let j = 0; j < chars; j++) out += ABC[(n >> (18 - 6 * j)) & 63];
    }
    return out;
  }

  function fromB64(str) {
    if (str.length % 4 === 1) fail("Код конфигурации повреждён: неверная длина.");
    const bytes = [];
    for (let i = 0; i < str.length; i += 4) {
      const chunk = str.slice(i, i + 4);
      let n = 0;
      for (let j = 0; j < 4; j++) {
        const v = j < chunk.length ? ABC.indexOf(chunk[j]) : 0;
        if (v < 0) fail(`Код конфигурации повреждён: недопустимый символ «${chunk[j]}».`);
        n = (n << 6) | v;
      }
      const nb = Math.floor((chunk.length * 6) / 8);
      for (let j = 0; j < nb; j++) bytes.push((n >> (16 - 8 * j)) & 0xff);
    }
    return bytes;
  }

  function pushVarint(out, n) {
    do { let b = n & 0x7f; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0);
  }

  // Число в целых единицах шкалы (10 или 100 на мм); null — если не представимо без округления.
  // Допуск 1e-6 единицы шкалы снимает только шум двоичной дроби (0.1 + 0.2), не цифры пользователя.
  const units = (v, scale) => { const s = v * scale, r = Math.round(s); return Math.abs(s - r) < 1e-6 ? r : null; };

  function checkNum(v, label, optional) {
    if (v == null && optional) return null;
    if (typeof v === "string" && v.trim() !== "") v = Number(v.replace(",", "."));
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`Поле «${label}»: нужно число.`);
    if (!(v > 0)) fail(`Поле «${label}»: значение должно быть больше нуля.`);
    if (v > MAX_MM) fail(`Поле «${label}»: ${v} мм вне допустимого диапазона (до ${MAX_MM} мм).`);
    return v;
  }

  function normPaint(p) {
    if (p == null || p === "") return null;
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(p).trim());
    if (!m) fail(`Цвет «${p}»: ожидается вид #RRGGBB.`);
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return "#" + h.toUpperCase();
  }

  function encode(params) {
    if (!params || typeof params !== "object") fail("Нет параметров для кода конфигурации.");
    const vals = NUMS.map(([k, label]) => checkNum(params[k], label, false));
    const free = checkNum(params.freeWidth, "свободная ширина", true);
    const paint = normPaint(params.paint);
    const all = free == null ? vals : [...vals, free];
    let scale = 10;
    if (all.some((v) => units(v, 10) == null)) {
      scale = 100;
      const bad = all.findIndex((v) => units(v, 100) == null);
      if (bad >= 0) {
        const label = bad < NUMS.length ? NUMS[bad][1] : "свободная ширина";
        fail(`Поле «${label}»: ${all[bad]} — больше двух знаков после запятой; код хранит не точнее 0,01 мм, округлять молча не будем.`);
      }
    }
    const bytes = [(free != null ? F_FREE : 0) | (paint ? F_PAINT : 0) | (scale === 100 ? F_CENTI : 0)];
    for (const v of all) pushVarint(bytes, units(v, scale));
    if (paint) for (let i = 1; i < 7; i += 2) bytes.push(parseInt(paint.slice(i, i + 2), 16));
    bytes.push(crc8(bytes));
    return `s${VERSION}.` + toB64(bytes);
  }

  function decodeV1(bytes) {
    if (bytes.length < 2) fail("Код конфигурации повреждён: слишком короткий.");
    const body = bytes.slice(0, -1);
    if (crc8(body) !== bytes[bytes.length - 1]) fail("Код конфигурации повреждён: контрольная сумма не совпадает. Проверьте, что код скопирован целиком.");
    const flags = body[0];
    if (flags & ~F_KNOWN) fail("Код конфигурации содержит неизвестные флаги: вероятно, он создан более новой версией конструктора.");
    const scale = flags & F_CENTI ? 100 : 10;
    let i = 1;
    const readNum = (label) => {
      let n = 0, mul = 1;
      for (let j = 0; ; j++) {
        if (i >= body.length) fail(`Код конфигурации повреждён: обрывается на поле «${label}».`);
        if (j >= 4) fail(`Код конфигурации повреждён: слишком длинное число в поле «${label}».`);
        const b = body[i++];
        n += (b & 0x7f) * mul; mul *= 128;
        if (!(b & 0x80)) break;
      }
      const v = n / scale;
      if (!(v > 0) || v > MAX_MM) fail(`Код конфигурации: поле «${label}» вне допустимого диапазона (${v} мм).`);
      return v;
    };
    const params = {};
    for (const [k, label] of NUMS) params[k] = readNum(label);
    params.freeWidth = flags & F_FREE ? readNum("свободная ширина") : null;
    params.paint = null;
    if (flags & F_PAINT) {
      if (i + 3 > body.length) fail("Код конфигурации повреждён: обрывается на цвете.");
      params.paint = "#" + body.slice(i, i + 3).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      i += 3;
    }
    if (i !== body.length) fail("Код конфигурации повреждён: лишние данные в конце.");
    return params;
  }

  function decode(str) {
    if (typeof str !== "string" || !str.trim()) fail("Код конфигурации пуст.");
    let s = str.trim().replace(/^#/, "");
    if (/^s\d+-/.test(s)) s = fromHashName(s);
    const m = /^s(\d+)\.([A-Za-z0-9_-]+)$/.exec(s);
    if (!m) fail("Неизвестный формат кода конфигурации: ожидается вид «s1.…».");
    const version = Number(m[1]);
    if (version > VERSION) fail(`Код версии ${version} создан более новой версией конструктора; обновите страницу.`);
    if (version !== 1) fail(`Версия кода ${version} не поддерживается.`);
    return { params: decodeV1(fromB64(m[2])), version };
  }

  // Имя для «#хэша» в claude.ai Artifact: только [A-Za-z0-9-].
  // «s1.» → «s1-»; в данных «-» → «-0», «_» → «-1». Обратимо без потерь.
  function toHashName(code) {
    const m = /^s(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(code || "").trim());
    if (!m) fail("Неизвестный формат кода конфигурации: ожидается вид «s1.…».");
    return `s${m[1]}-` + m[2].replace(/-/g, "-0").replace(/_/g, "-1");
  }

  function fromHashName(name) {
    const m = /^s(\d+)-([A-Za-z0-9-]*)$/.exec(String(name || "").trim().replace(/^#/, ""));
    if (!m || !m[2]) fail("Неизвестный формат имени конфигурации: ожидается вид «s1-…».");
    let out = "";
    const t = m[2];
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== "-") { out += t[i]; continue; }
      const e = t[++i];
      if (e === "0") out += "-";
      else if (e === "1") out += "_";
      else fail("Имя конфигурации повреждено: неверная экранировка «-».");
    }
    return `s${m[1]}.` + out;
  }

  return { encode, decode, toHashName, fromHashName, VERSION };
}
