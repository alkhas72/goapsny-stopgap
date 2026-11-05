// Карта раскроя: инварианты укладки (нет пересечений, внутри листа за вычетом кромки, пропил), партия.
// Запуск: node --test tests/cutlist.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/ramp.js";
import { createCutlist } from "../src/cutlist.js";

const cl = createCutlist();
const EPS = 0.15;   // координаты в выдаче округлены до 0,1 мм

// ---- геометрия для проверок
const segDist = (p, a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const segsCross = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
const inside = (p, poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const c = cross(poly[i], poly[(i + 1) % poly.length], p); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } }
  return true;
};
function polyDist(P, Q) {
  const edges = (X) => X.map((p, i) => [p, X[(i + 1) % X.length]]);
  for (const [a, b] of edges(P)) for (const [c, d] of edges(Q)) if (segsCross(a, b, c, d)) return 0;
  if (inside(P[0], Q) || inside(Q[0], P)) return 0;
  let m = Infinity;
  for (const p of P) for (const [c, d] of edges(Q)) m = Math.min(m, segDist(p, c, d));
  for (const q of Q) for (const [a, b] of edges(P)) m = Math.min(m, segDist(q, a, b));
  return m;
}
const rectGap = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));

function checkPlan(plan, models) {
  const o = plan.opts, k = o.kerf, t = o.edgeTrim, { w: SW, h: SH } = o.sheet;
  // фанера
  for (const sh of plan.sheets) {
    assert.ok(sh.wastePct >= 0 && sh.wastePct < 100, `отходы листа ${sh.wastePct}`);
    for (const p of sh.parts) {
      assert.ok(p.x >= t - EPS && p.y >= t - EPS && p.x + p.w <= SW - t + EPS && p.y + p.h <= SH - t + EPS, `${p.id} вне листа`);
      for (const [x, y] of p.poly) assert.ok(x >= p.x - EPS && x <= p.x + p.w + EPS && y >= p.y - EPS && y <= p.y + p.h + EPS, `${p.id}: контур вне прямоугольника`);
    }
    for (let i = 0; i < sh.parts.length; i++) for (let j = i + 1; j < sh.parts.length; j++) {
      const g = rectGap(sh.parts[i], sh.parts[j]);
      assert.ok(g >= k - EPS, `${sh.parts[i].id} и ${sh.parts[j].id}: зазор ${g} < пропила ${k}`);
    }
    // каждый рез — прямая внутри листа; номера по порядку
    sh.cuts.forEach((c, i) => {
      assert.equal(c.n, i + 1);
      assert.ok(["trim", "rip", "cross", "angle"].includes(c.type), c.type);
      const pts = c.type === "angle" ? [c.from, c.to] : c.dir === "rip" ? [[c.at, c.from], [c.at, c.to]] : [[c.from, c.at], [c.to, c.at]];
      for (const [x, y] of pts) assert.ok(x >= 0 && x <= SW && y >= 0 && y <= SH, `рез ${c.n} вне листа`);
    });
    // резы не проходят сквозь детали: продольный в полосе не задевает чужие детали
    for (const c of sh.cuts.filter((c) => c.dir === "rip" && c.type === "rip")) {
      for (const p of sh.parts) {
        const overlapsY = c.from < p.y + p.h && c.to > p.y;
        if (overlapsY) assert.ok(!(c.at > p.x + EPS && c.at < p.x + p.w - EPS), `рез x=${c.at} проходит через ${p.id}`);
      }
    }
  }
  // доска
  for (const b of plan.boards) {
    assert.ok(b.wastePct >= 0 && b.wastePct < 100);
    const ps = [...b.pieces].sort((p, q) => p.x - q.x);
    ps.forEach((p, i) => {
      assert.ok(p.x >= o.boardTrim - EPS && p.x + p.length <= b.stock.length - o.boardTrim + EPS, `${p.id} вне доски`);
      assert.ok(p.width <= b.stock.width + EPS, `${p.id} шире доски`);
      if (i) assert.ok(p.x - (ps[i - 1].x + ps[i - 1].length) >= k - EPS, `${p.id}: пропил между заготовками`);
      for (const s of p.shapes) for (const [x, y] of s.poly) assert.ok(x >= p.x - EPS && x <= p.x + p.length + EPS && y >= -EPS && y <= p.width + EPS, `${s.id} вне заготовки`);
      if (p.nested) assert.ok(polyDist(p.shapes[0].poly, p.shapes[1].poly) >= k - EPS, `${p.id}: боковины ближе пропила`);
    });
  }
  // все детали учтены: настил, боковины (пара), борт, ребро — каждая ровно один раз
  const ids = new Set();
  const add = (id) => { assert.ok(!ids.has(id), `дубль ${id}`); ids.add(id); };
  plan.sheets.forEach((s) => s.parts.forEach((p) => add(p.id)));
  plan.boards.forEach((b) => b.pieces.forEach((p) => add(p.id)));
  plan.unplaced.forEach((u) => add(u.id));
  models.forEach((m, i) => {
    for (const id of ["ply", "sides", "rear"]) assert.ok(ids.has(`r${i + 1}-${id}`), `нет r${i + 1}-${id}`);
    assert.equal(ids.has(`r${i + 1}-rib`), !!m.dims.rib);
  });
}

const BATCH = [build({ hl: 48, hr: 48 }), build({ hl: 58, hr: 58 }), build({ hl: 98, hr: 98 }), build({ hl: 85, hr: 70 })];

test("партия из 4 пандусов (48, 58, 98 ровные + 85/70 перекос) даёт план", () => {
  const plan = cl.plan(BATCH);
  checkPlan(plan, BATCH);
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.summary.ramps, 4);
  assert.ok(plan.sheets.length >= 1);
  assert.ok(plan.boards.length >= 1);
  // размеры настилов совпадают с формулой (с поворотом или без)
  BATCH.forEach((m, i) => {
    const p = plan.sheets.flatMap((s) => s.parts).find((q) => q.id === `r${i + 1}-ply`);
    const [w, h] = p.rotated ? [p.h, p.w] : [p.w, p.h];
    assert.deepEqual([w, h], [m.dims.ply.width, m.dims.ply.length]);
  });
});

test("перекос: трапеция настила — прямоугольник, затем один косой рез", () => {
  const m = build({ hl: 85, hr: 70 });
  const plan = cl.plan([m]);
  const sh = plan.sheets[0], p = sh.parts[0];
  assert.equal(p.shape, "trapezoid");
  const ang = sh.cuts.filter((c) => c.type === "angle");
  assert.equal(ang.length, 1);
  const [a, b] = [ang[0].from, ang[0].to];
  assert.equal(Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])), m.dims.ply.front);   // 907
  assert.equal(ang[0].angleDeg, 7.3);
  // косой рез идёт после поперечного, отделившего заготовку
  const crossN = sh.cuts.find((c) => c.type === "cross" && c.part === p.id).n;
  assert.ok(ang[0].n > crossN);
  assert.equal(p.area, 900 * (517 + 402) / 2);
});

test("боковины валетом: обе в одном прямоугольнике «основание × высота», размеры как в формуле", () => {
  for (const m of BATCH) {
    const plan = cl.plan([m]);
    const pair = plan.boards[0].pieces.find((p) => p.kind === "sides");
    assert.ok(pair.nested);
    const big = Math.max(m.dims.left.ground, m.dims.right.ground);
    assert.equal(pair.length, big);                        // заготовка не длиннее основания
    assert.ok(pair.width <= Math.max(m.dims.left.height, m.dims.right.height) + plan.opts.kerf + 1);
    assert.equal(plan.boards[0].cuts.filter((c) => c.piece === pair.id && c.type === "diagonal").length, 1);
    assert.ok(pair.deviation < 0.5);
    for (const s of pair.shapes) {
      const xs = s.poly.map((q) => q[0]), ys = s.poly.map((q) => q[1]);
      const side = s.id.endsWith("left") ? m.dims.left : m.dims.right;
      assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - side.ground) <= 0.2, `${s.id} основание`);
      assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - side.height) <= 0.2, `${s.id} высота`);
    }
  }
});

test("узкая доска: пара удлиняется, но не пересекается", () => {
  const m = build({ hl: 98, hr: 98 });   // боковина 80 × 588
  const plan = cl.plan([m], { boardWidth: 81 });
  checkPlan(plan, [m]);
  const pair = plan.boards[0].pieces.find((p) => p.kind === "sides");
  assert.equal(pair.width, 81);
  assert.ok(pair.length > 588);
});

test("высокий пандус: ребро есть, боковины шире доски 150 — честно в «не размещено»", () => {
  const m = build({ hl: 210, hr: 210 });
  const plan = cl.plan([m]);
  checkPlan(plan, [m]);
  const un = plan.unplaced.map((u) => u.id).sort();
  assert.deepEqual(un, ["r1-rear", "r1-rib", "r1-sides"]);
  assert.match(plan.unplaced[0].reason, /составной клин/);
  const wide = cl.plan([m], { boardWidth: 200 });
  checkPlan(wide, [m]);
  assert.equal(wide.unplaced.length, 0);
  assert.ok(wide.boards.flatMap((b) => b.pieces).some((p) => p.kind === "rib"));
});

test("разная толщина доски — разные заготовки", () => {
  const ms = [build({ hl: 98, hr: 98, board: 40 }), build({ hl: 98, hr: 98, board: 50 })];
  const plan = cl.plan(ms);
  checkPlan(plan, ms);
  assert.deepEqual([...new Set(plan.boards.map((b) => b.stock.thickness))].sort(), [40, 50]);
});

test("пропил и кромка учитываются: больше пропил — не меньше листов, детали дальше", () => {
  const ms = Array.from({ length: 6 }, () => build({ hl: 150, hr: 150 }));
  const a = cl.plan(ms, { kerf: 0, edgeTrim: 0 }), b = cl.plan(ms, { kerf: 10, edgeTrim: 30 });
  checkPlan(a, ms); checkPlan(b, ms);
  assert.ok(b.sheets.length >= a.sheets.length);
});

test("деталь больше листа — в «не размещено», а не молча", () => {
  const m = build({ hl: 300, hr: 300 });
  const plan = cl.plan([m], { sheet: { w: 1000, h: 1500 } });
  assert.ok(plan.unplaced.some((u) => u.id === "r1-ply" && /не помещается/.test(u.reason)));
});

test("случайные партии: инварианты держатся", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 60; n++) {
    const ms = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => {
      const hl = 30 + Math.round(rnd() * 2700) / 10;
      const hr = rnd() < 0.5 ? hl : Math.max(25, hl - Math.round(rnd() * 400) / 10);
      return build({ hl, hr, width: 700 + Math.round(rnd() * 300), board: 35 + Math.round(rnd() * 15) });
    });
    const plan = cl.plan(ms, { kerf: 2 + Math.round(rnd() * 3), boardWidth: rnd() < 0.5 ? 150 : 300 });
    checkPlan(plan, ms);
  }
});

test("неверный вход — понятная ошибка", () => {
  assert.throws(() => cl.plan([]), /нет ни одного/);
  assert.throws(() => cl.plan([{ hl: 85 }]), /build\(\)/);
  assert.throws(() => cl.plan(BATCH, { kerf: -1 }), /kerf/);
});
