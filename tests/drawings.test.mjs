// Чертежи (src/drawings.js): контуры деталей совпадают с model.dims, SVG и DXF собраны правильно.
// Запуск: node --test tests/drawings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/ramp.js";
import { createDrawings } from "../src/drawings.js";

const D = createDrawings();
const CASES = [[48, 48], [98, 98], [210, 210], [85, 70], [190, 160]];
const len = (a, b) => Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
const same = (p, q) => p[0] === q[0] && p[1] === q[1];
const get = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);

// длина ребра контура между двумя его вершинами (вершины должны быть соседними)
function edge(pd, a, b) {
  const o = pd.outline, i = o.findIndex((p) => same(p, a)), j = o.findIndex((p) => same(p, b));
  assert.ok(i >= 0 && j >= 0, `${pd.id}: точки размера не на контуре`);
  assert.ok(Math.abs(i - j) === 1 || Math.abs(i - j) === o.length - 1, `${pd.id}: размер не по ребру`);
  return len(a, b);
}

// баланс тегов: каждый открытый закрыт в правильном порядке
function tagsBalanced(svg) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== name) return false; } else stack.push(name);
  }
  return stack.length === 0 && /^<svg[\s>]/.test(svg) && svg.trim().endsWith("</svg>");
}

// DXF как пары «код / значение»
function dxfPairs(s) {
  const lines = s.replace(/\n$/, "").split("\n");
  assert.equal(lines.length % 2, 0, "нечётное число строк");
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = lines[i].trim();
    assert.match(code, /^-?\d+$/, `код группы: «${lines[i]}»`);
    pairs.push([+code, lines[i + 1]]);
  }
  return pairs;
}

for (const [hl, hr] of CASES) {
  const model = build({ hl, hr });
  const d = model.dims;
  const parts = D.partDrawings(model);
  const by = Object.fromEntries(parts.map((p) => [p.id, p]));
  const tag = `${hl}/${hr}`;

  test(`${tag}: детали и их контуры совпадают с model.dims`, () => {
    assert.deepEqual(parts.map((p) => p.id), model.parts.map((p) => p.id));
    for (const pd of parts) {
      assert.ok(pd.outline.every(([u, v]) => Number.isInteger(u) && Number.isInteger(v)), `${pd.id}: не целые мм`);
      assert.ok(pd.qty >= 1 && typeof pd.name === "string");
      assert.equal(pd.material, pd.id === "ply" ? "фанера 18" : `доска ${model.params.board}`);
      for (const dm of pd.dims) {
        assert.equal(edge(pd, dm.from, dm.to), get(d, dm.key), `${pd.id} ${dm.key}`);
        assert.equal(dm.text, String(get(d, dm.key)));
      }
    }
    // боковины и ребро: катеты = высота и длина по земле
    for (const id of ["left", "right", ...(d.rib ? ["rib"] : [])]) {
      const o = by[id].outline;
      assert.equal(o.length, 3);
      assert.equal(edge(by[id], [0, 0], [0, d[id].height]), d[id].height);
      assert.equal(edge(by[id], [0, 0], [d[id].ground, 0]), d[id].ground);
    }
    assert.equal(!!by.rib, hl > 200 || hr > 200);
    // настил
    const W = d.ply.width, keys = by.ply.dims.map((x) => x.key).sort();
    if (model.kind === "skew") {
      assert.deepEqual(keys, ["ply.front", "ply.left", "ply.right", "ply.width"]);
      const [p0, p1, p2, p3] = by.ply.outline;
      assert.equal(len(p3, p0), W);
      assert.equal(len(p0, p1), d.ply.left);
      assert.equal(len(p3, p2), d.ply.right);
      assert.equal(len(p1, p2), d.ply.front);
    } else {
      assert.deepEqual(keys, ["ply.length", "ply.width"]);
      const o = by.ply.outline;
      assert.deepEqual([len(o[0], o[1]), len(o[1], o[2]), len(o[2], o[3]), len(o[3], o[0])], [d.ply.length, W, d.ply.length, W]);
    }
    // задний борт: верх = длина, края = высоты слева и справа
    const r = by.rear.outline;
    assert.equal(len(r[3], r[2]), d.rear.length);
    assert.equal(len(r[0], r[3]), d.rear.left);
    assert.equal(len(r[1], r[2]), d.rear.right);
  });

  test(`${tag}: SVG листа A4 и деталей`, () => {
    const svg = D.toSVG(model, { date: "2026-11-05" });
    assert.ok(tagsBalanced(svg), "теги SVG не сбалансированы");
    assert.match(svg, /width="210mm" height="297mm" viewBox="0 0 210 297"/);
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const pd of parts) {
      assert.ok(svg.includes(`data-part="${pd.id}"`));
      for (const dm of pd.dims) assert.ok(texts.includes(dm.text), `нет размера ${dm.key}=${dm.text}`);
    }
    for (const s of [`Пандус А ${hl} / Б ${hr}`, "уклон 1:6", "доска 40", "2026-11-05", "goapsny.org", "черновик — сверить с мастерской"])
      assert.ok(texts.some((t) => t.includes(s)), `нет «${s}»`);
    assert.ok(!/NaN|undefined|Infinity/.test(svg));
    for (const pd of parts) {
      const one = D.toSVG(model, { part: pd.id });
      assert.ok(tagsBalanced(one));
      for (const dm of pd.dims) assert.ok(one.includes(`>${dm.text}<`));
      assert.ok(!/NaN|undefined|Infinity/.test(one));
    }
  });

  test(`${tag}: DXF R12`, () => {
    const dxf = D.toDXF(model);
    const pairs = dxfPairs(dxf);
    const zeros = pairs.filter(([c]) => c === 0).map(([, v]) => v);
    const count = (v) => zeros.filter((x) => x === v).length;
    assert.equal(count("SECTION"), 3);
    assert.equal(count("ENDSEC"), 3);
    assert.equal(count("TABLE"), count("ENDTAB"));
    assert.equal(zeros[zeros.length - 1], "EOF");
    assert.deepEqual(pairs.filter(([c]) => c === 2).slice(0, 3).map(([, v]) => v), ["HEADER", "TABLES", "LTYPE"]);
    const ver = pairs.findIndex(([c, v]) => c === 9 && v === "$ACADVER");
    assert.deepEqual(pairs[ver + 1], [1, "AC1009"]);
    assert.ok(!/LWPOLYLINE|POLYLINE/.test(dxf));
    for (const L of ["CUT", "DIM"]) assert.ok(pairs.some(([c, v], i) => c === 2 && v === L && pairs[i - 1][1] === "LAYER"));

    // сущности: LINE/TEXT с их слоем (код 8 сразу за типом)
    const ents = [];
    pairs.forEach(([c, v], i) => { if (c === 0 && (v === "LINE" || v === "TEXT")) ents.push({ t: v, layer: pairs[i + 1][1], at: i }); });
    const edges = parts.reduce((s, p) => s + p.outline.length, 0);
    const dims = parts.reduce((s, p) => s + p.dims.length, 0);
    assert.equal(ents.filter((e) => e.t === "LINE" && e.layer === "CUT").length, edges);
    assert.equal(ents.filter((e) => e.t === "LINE" && e.layer === "DIM").length, dims * 7);  // размерная, 2 выносные, 2 стрелки по 2 линии
    assert.equal(ents.filter((e) => e.t === "TEXT").length, dims + parts.length);         // числа + подписи деталей
    assert.ok(ents.every((e) => e.layer === "CUT" || e.layer === "DIM"));
    const nums = ents.filter((e) => e.t === "TEXT").map((e) => pairs.slice(e.at).find(([c]) => c === 1)[1]);
    for (const pd of parts) for (const dm of pd.dims) assert.ok(nums.includes(dm.text));

    // контуры реза: детали рядом, зазор 50 мм, начало в 0,0, все длины рёбер как в контурах
    const cut = ents.filter((e) => e.layer === "CUT" && e.t === "LINE").map((e) => {
      const g = Object.fromEntries(pairs.slice(e.at + 1, e.at + 9));
      return [[+g[10], +g[20]], [+g[11], +g[21]]];
    });
    let k = 0, x = 0;
    for (const pd of parts) {
      const seg = cut.slice(k, k + pd.outline.length); k += pd.outline.length;
      const xs = seg.flat().map((p) => p[0]), ys = seg.flat().map((p) => p[1]);
      assert.equal(Math.min(...xs), x, `${pd.id}: смещение по X`);
      assert.equal(Math.min(...ys), 0, `${pd.id}: низ на 0`);
      seg.forEach(([a, b], j) => assert.equal(len(a, b), len(pd.outline[j], pd.outline[(j + 1) % pd.outline.length])));
      x = Math.max(...xs) + 50;
    }
  });
}

test("лист A4 подбирает стандартный масштаб и не вылезает за поле", () => {
  for (const [hl, hr] of [...CASES, [300, 300], [250, 210], [19, 19]]) {
    const svg = D.toSVG(build({ hl, hr }), { date: "x" });
    assert.match(svg, />1:(5|10|15|20|25)</, `${hl}/${hr}`);
    const xs = [...svg.matchAll(/ (?:x\d?|points)="([^"]+)"/g)].flatMap((m) => m[1].split(/[ ,]/).filter((_, i, a) => a.length === 1 || i % 2 === 0)).map(Number);
    assert.ok(xs.every((v) => v >= 0 && v <= 210), `${hl}/${hr}: за краем листа`);
  }
});
