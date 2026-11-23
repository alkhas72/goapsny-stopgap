// Карта раскроя для партии пандусов: фанера (настилы) и доска (боковины, задний борт, ребро).
// Технологический режим: пила Festool с направляющей шиной (ТЗ п. 6). Каждый рез прямой и сквозной:
// сначала продольные полосы (rip) вдоль длинной стороны листа, затем поперечные резы (cross) в полосе,
// косой рез (angle) для трапеции настила на перекосе. Выход и отходы считаются для данных размеров,
// фиксированного выхода «N пандусов с листа» модуль не обещает.
//
// Вход: модели из build() (src/ramp.js), берутся только производственные размеры model.dims и
// толщина доски model.params.board. Формулу пандуса модуль не трогает и не пересчитывает.
// Чистый модуль: без DOM, без библиотек, единственное объявление верхнего уровня — фабрика.
export function createCutlist() {
  const DEFAULTS = {
    // Лист 1220×2440: прайс «Фанера», склад Адлер, на 09.01.2025, стр. 1, строка
    // «Фанера ФЛФ 18 * 1220 * 2440 мм сорт 1/1 LOGO береза Plyterra (1 шт = 2,977 м2)»;
    // тот же лист в IDLab_Kalkulyator_Pandusa.xlsx (A14/B15) и ramp-production-spec.md, п. 2.
    sheet: { w: 1220, h: 2440 },
    kerf: 3,          // пропил Festool (диск ~2,2–3 мм), принят 3 мм
    edgeTrim: 10,     // заводская кромка листа, срезается со всех сторон
    // Доска сосна строганая 40×150: калькулятор (A17 «Доска сосна строганая 40×150 мм») и
    // спецификация п. 2. Длину заготовки ни калькулятор (считает пог. м), ни спецификация не дают:
    // 3000 мм — значение по умолчанию, ПРОВЕРИТЬ у мастерской/поставщика.
    boardLength: 3000,
    boardWidth: 150,
    boardTrim: 10,    // торцовка концов доски (с обеих сторон), допущение, ПРОВЕРИТЬ в цеху
  };

  const r1 = (x) => Math.round(x * 10) / 10;
  const up1 = (x) => Math.ceil(x * 10 - 1e-9) / 10;
  const pct = (used, total) => total > 0 ? r1(Math.max(0, Math.min(99.9, (1 - used / total) * 100))) : 0;
  const deg = (rad) => r1(rad * 180 / Math.PI);
  const polyArea = (pts) => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; s += x0 * y1 - x1 * y0; }
    return Math.abs(s) / 2;
  };
  const shift = (pts, dx, dy = 0) => pts.map(([x, y]) => [r1(x + dx), r1(y + dy)]);

  function resolve(opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const s = o.sheet || DEFAULTS.sheet;
    o.sheet = { w: Math.min(s.w, s.h), h: Math.max(s.w, s.h) };   // w — поперёк, h — вдоль длинной стороны
    for (const k of ["kerf", "edgeTrim", "boardLength", "boardWidth", "boardTrim"]) {
      if (!(Number.isFinite(o[k]) && o[k] >= 0)) throw new Error(`Раскрой: параметр ${k} должен быть неотрицательным числом.`);
    }
    if (!(o.sheet.w > 2 * o.edgeTrim && o.sheet.h > 2 * o.edgeTrim)) throw new Error("Раскрой: лист меньше двойной обрезки кромки.");
    return o;
  }

  // ---- детали одного пандуса из его производственных размеров
  function rampParts(m, ramp) {
    const d = m.dims, p = m.params || {};
    const tag = m.kind === "skew" ? `${p.hl}/${p.hr}` : `${p.hl}`;
    const T = p.board;
    const skew = m.kind === "skew" && d.ply.left !== d.ply.right;
    const W = d.ply.width;
    const ply = skew
      ? { id: `r${ramp}-ply`, ramp, tag, name: `Настил ${tag}`, w: W, h: d.ply.length, shape: "trapezoid",
          left: d.ply.left, right: d.ply.right, front: d.ply.front, area: W * (d.ply.left + d.ply.right) / 2 }
      : { id: `r${ramp}-ply`, ramp, tag, name: `Настил ${tag}`, w: W, h: d.ply.length, shape: "rect", area: W * d.ply.length };
    const bevel = d.rear.bevel != null ? d.rear.bevel : deg(Math.atan(d.left.height / d.left.ground));
    return {
      ply,
      sides: { ramp, tag, T, wedges: [
        { id: `r${ramp}-left`, name: `Боковина левая ${tag}`, ground: d.left.ground, height: d.left.height },
        { id: `r${ramp}-right`, name: `Боковина правая ${tag}`, ground: d.right.ground, height: d.right.height },
      ] },
      rear: { id: `r${ramp}-rear`, ramp, tag, T, name: `Задний борт ${tag}`, length: d.rear.length, hl: d.rear.left, hr: d.rear.right, bevel },
      rib: d.rib ? { id: `r${ramp}-rib`, ramp, tag, T, name: `Ребро ${tag}`, ground: d.rib.ground, height: d.rib.height } : null,
    };
  }

  // ---- фанера: гильотинная укладка полосами (полоса = продольный рез на всю длину листа)
  function packSheets(parts, o) {
    const { w: SW, h: SH } = o.sheet, k = o.kerf, t = o.edgeTrim;
    const xMax = SW - t, yMax = SH - t;
    const sheets = [], unplaced = [];
    const order = [...parts].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area);
    for (const part of order) {
      const orients = [{ a: part.w, b: part.h, rotated: false }];
      if (part.w !== part.h) orients.push({ a: part.h, b: part.w, rotated: true });
      let best = null;
      // 1) в уже открытую полосу (меньше всего лишней ширины)
      sheets.forEach((sh, si) => sh.strips.forEach((st) => {
        for (const or of orients) {
          const y = st.next;
          if (or.a <= st.w && y + or.b <= yMax) {
            const score = st.w - or.a;
            if (!best || score < best.score) best = { score, sh, st, or };
          }
        }
      }));
      // 2) новая полоса на первом листе, где хватает ширины; деталь ставится длинной стороной поперёк
      if (!best) {
        for (const sh of sheets) {
          const x = sh.nextX;
          const fit = orients.filter((or) => x + or.a <= xMax && t + or.b <= yMax).sort((p, q) => q.a - p.a)[0];
          if (fit) { const st = { x, w: fit.a, next: t, parts: [] }; sh.strips.push(st); sh.nextX = x + fit.a + k; best = { sh, st, or: fit }; break; }
        }
      }
      // 3) новый лист
      if (!best) {
        const fit = orients.filter((or) => t + or.a <= xMax && t + or.b <= yMax).sort((p, q) => q.a - p.a)[0];
        if (!fit) {
          unplaced.push({ id: part.id, ramp: part.ramp, name: part.name, size: [part.w, part.h],
            reason: `Деталь ${part.w}×${part.h} не помещается в лист ${SW}×${SH} за вычетом кромки ${t} мм.` });
          continue;
        }
        const sh = { strips: [], nextX: t };
        sheets.push(sh);
        const st = { x: t, w: fit.a, next: t, parts: [] };
        sh.strips.push(st); sh.nextX = t + fit.a + k;
        best = { sh, st, or: fit };
      }
      const { st, or } = best;
      st.parts.push({ part, x: st.x, y: st.next, a: or.a, b: or.b, rotated: or.rotated });
      st.next += or.b + k;
    }
    return { sheets: sheets.map((sh, i) => sheetOut(sh, i, o)), unplaced };
  }

  function sheetOut(sh, index, o) {
    const { w: SW, h: SH } = o.sheet, t = o.edgeTrim;
    const parts = [], cuts = [];
    const cut = (c) => cuts.push({ n: cuts.length + 1, ...c });
    cut({ type: "trim", dir: "rip", at: t, from: 0, to: SH, kerfSide: "-", note: "обрезка заводской кромки (базовая продольная)" });
    cut({ type: "trim", dir: "cross", at: t, from: t, to: SW, kerfSide: "-", note: "обрезка заводской кромки (базовая поперечная)" });
    sh.strips.forEach((st, si) => {
      cut({ type: "rip", dir: "rip", at: st.x + st.w, from: t, to: SH, kerfSide: "+", strip: si + 1, note: `полоса ${si + 1}, ширина ${st.w}` });
      for (const pl of st.parts) {
        const P = pl.part;
        cut({ type: "cross", dir: "cross", at: pl.y + pl.b, from: st.x, to: st.x + st.w, kerfSide: "+", strip: si + 1, part: P.id, note: `${P.name}: длина ${pl.b}` });
        if (pl.a < st.w) cut({ type: "rip", dir: "rip", at: st.x + pl.a, from: pl.y, to: pl.y + pl.b, kerfSide: "+", strip: si + 1, part: P.id, note: `${P.name}: подрезка по ширине до ${pl.a}` });
        // локальные координаты детали: u — поперёк пандуса (0..W), v — вдоль ската (0 — у порога)
        const map = ([u, v]) => pl.rotated ? [pl.x + v, pl.y + u] : [pl.x + u, pl.y + v];
        const out = { id: P.id, ramp: P.ramp, name: P.name, x: pl.x, y: pl.y, w: pl.a, h: pl.b, rotated: pl.rotated, shape: P.shape, area: P.area };
        if (P.shape === "trapezoid") {
          out.poly = [[0, 0], [P.w, 0], [P.w, P.right], [0, P.left]].map(map);
          const from = map([0, P.left]), to = map([P.w, P.right]);
          const angleDeg = deg(Math.atan(Math.abs(P.left - P.right) / P.w));
          out.angleCut = { from, to, angleDeg };
          cut({ type: "angle", dir: "angle", from, to, angleDeg, length: P.front, kerfSide: "offcut", strip: si + 1, part: P.id,
            note: `${P.name}: косой рез передней кромки ${P.front} мм, ${angleDeg}° к заднему краю; пропил в обрезок` });
        } else {
          out.poly = [[0, 0], [P.w, 0], [P.w, P.h], [0, P.h]].map(map);
        }
        parts.push(out);
      }
    });
    const used = parts.reduce((s, p) => s + p.area, 0);
    return { index: index + 1, size: { ...o.sheet }, strips: sh.strips.map((s) => ({ x: s.x, w: s.w, used: s.next - o.kerf - t })),
      parts, cuts, usedArea: r1(used), wastePct: pct(used, SW * SH) };
  }

  // ---- доска: две боковины «валетом» в одном прямоугольнике (один диагональный рез).
  // Боковины — прямоугольные треугольники (катеты: основание по земле a, высота b) с одним уклоном
  // ската (на перекосе тоже: лист плоский), поэтому вторая, развёрнутая на 180°, ложится гипотенузой
  // вдоль линии реза, сдвинутой на пропил. Прямоугольник ≈ основание × высота большей боковины.
  function nestPair(sides, o) {
    const k = o.kerf, BW = o.boardWidth;
    const [w1, w2] = [...sides.wedges].sort((p, q) => q.ground - p.ground || q.height - p.height);
    const a1 = w1.ground, b1 = w1.height, a2 = w2.ground, b2 = w2.height;
    if (b1 > BW) return null;
    const s = b1 / a1, h1 = Math.hypot(a1, b1);
    const c = a1 * b1 + k * h1;                  // линия реза, сдвинутая на пропил: b1·x + a1·y = c
    const Px = (H) => (c - a1 * H) / b1;         // где эта линия выходит на верхнюю кромку y = H
    const Hflush = (c - b1 * (a1 - a2)) / a1;    // при такой ширине вторая боковина упирается в торец заготовки
    let H, px, L, L2;
    if (Hflush <= b1) {                          // разные боковины: зазор под пропил есть сам собой
      H = b1; px = Px(H); L = a1; L2 = px + a2;
      if (L - L2 < 1) L2 = L;                    // рез тоньше 1 мм не делаем
    } else if (Hflush <= BW) {                   // одинаковые: чуть шире заготовка, длина = основание
      H = Hflush; px = Px(H); L = a1; L2 = L;
    } else {                                     // доска узкая: удлинить заготовку
      H = BW; px = Px(H); L = Math.max(a1, up1(px + a2)); L2 = L;
    }
    const g2 = L2 - px;                          // фактическое основание второй боковины
    const tri1 = [[0, 0], [a1, 0], [0, b1]];
    const tri2 = [[r1(px), r1(H)], [r1(L2), r1(H)], [r1(L2), r1(H - g2 * s)]];
    const cuts = [];
    if (H < BW) cuts.push({ type: "rip", dir: "rip", at: r1(H), from: 0, to: L, kerfSide: "+", note: `роспуск заготовки на ширину ${r1(H)}` });
    cuts.push({ type: "diagonal", dir: "angle", from: [0, b1], to: [a1, 0], angleDeg: deg(Math.atan(s)), kerfSide: "+",
      note: `диагональ: ${w1.name} и ${w2.name}, пропил в сторону второй боковины` });
    if (L2 < L) cuts.push({ type: "cross", dir: "cross", at: r1(L2), from: 0, to: r1(H), kerfSide: "+", note: `${w2.name}: торец у порога (отделить от обрезка)` });
    const dev = Math.max(Math.abs(g2 - a2), Math.abs(g2 * s - b2));
    return {
      id: `r${sides.ramp}-sides`, ramp: sides.ramp, T: sides.T, kind: "sides", nested: true,
      name: `Боковины ${sides.tag} (пара валетом)`, length: L, width: r1(H),
      nominal: [{ id: w1.id, ground: a1, height: b1 }, { id: w2.id, ground: a2, height: b2 }],
      shapes: [{ id: w1.id, name: w1.name, poly: tri1 }, { id: w2.id, name: w2.name, poly: tri2 }],
      cuts, deviation: r1(dev),
      note: dev >= 0.5 ? `${w2.name} выходит на ${r1(dev)} мм от номинала: проверить по разметке.` : null,
    };
  }

  function rearPiece(r, o) {
    const hmax = Math.max(r.hl, r.hr);
    if (hmax > o.boardWidth) return null;
    const poly = [[0, 0], [r.length, 0], [r.length, r.hr], [0, r.hl]];
    const cuts = [];
    if (r.hl === r.hr) cuts.push({ type: "bevel", dir: "rip", at: hmax, from: 0, to: r.length, angleDeg: r.bevel, kerfSide: "+", note: `роспуск на ${hmax} с наклоном диска ${r.bevel}° (фаска под фанеру)` });
    else cuts.push({ type: "taper", dir: "angle", from: [0, r.hl], to: [r.length, r.hr], angleDeg: r.bevel, kerfSide: "+", note: `косой роспуск ${r.hl}→${r.hr}, наклон диска ${r.bevel}° (фаска под фанеру)` });
    return { id: r.id, ramp: r.ramp, T: r.T, kind: "rear", nested: false, name: r.name, length: r.length, width: hmax, shapes: [{ id: r.id, name: r.name, poly }], cuts, note: null };
  }

  function ribPiece(r, o) {
    if (r.height > o.boardWidth) return null;
    const cuts = [];
    if (r.height < o.boardWidth) cuts.push({ type: "rip", dir: "rip", at: r.height, from: 0, to: r.ground, kerfSide: "+", note: `роспуск на ${r.height}` });
    cuts.push({ type: "diagonal", dir: "angle", from: [0, r.height], to: [r.ground, 0], angleDeg: deg(Math.atan(r.height / r.ground)), kerfSide: "+", note: "диагональ ребра, второй треугольник — обрезок" });
    return { id: r.id, ramp: r.ramp, T: r.T, kind: "rib", nested: false, name: r.name, length: r.ground, width: r.height,
      shapes: [{ id: r.id, name: r.name, poly: [[0, 0], [r.ground, 0], [0, r.height]] }], cuts, note: null };
  }

  // ---- 1D-раскрой заготовок по длине доски (первая подходящая, по убыванию длины), отдельно по толщине
  function packBoards(pieces, o) {
    const k = o.kerf, t = o.boardTrim, BL = o.boardLength, BW = o.boardWidth;
    const byT = new Map();
    for (const p of pieces) { if (!byT.has(p.T)) byT.set(p.T, []); byT.get(p.T).push(p); }
    const boards = [], unplaced = [];
    for (const [T, list] of [...byT.entries()].sort((a, b) => a[0] - b[0])) {
      const open = [];
      for (const p of [...list].sort((a, b) => b.length - a.length || b.width - a.width)) {
        if (t + p.length > BL - t) {
          unplaced.push({ id: p.id, ramp: p.ramp, name: p.name, size: [p.length, p.width], reason: `Заготовка ${p.length} мм длиннее доски ${BL} мм за вычетом торцовки.` });
          continue;
        }
        let b = open.find((bd) => bd.next + p.length <= BL - t);
        if (!b) { b = { T, next: t, pieces: [] }; open.push(b); }
        b.pieces.push({ ...p, x: b.next });
        b.next += p.length + k;
      }
      boards.push(...open);
    }
    return {
      boards: boards.map((b, i) => {
        const cuts = [];
        const cut = (c) => cuts.push({ n: cuts.length + 1, ...c });
        if (t > 0) cut({ type: "trim", dir: "cross", at: t, from: 0, to: BW, kerfSide: "-", note: "торцовка конца доски" });
        const pieces = b.pieces.map((p) => {
          cut({ type: "cross", dir: "cross", at: p.x + p.length, from: 0, to: BW, kerfSide: "+", piece: p.id, note: `${p.name}: заготовка ${p.length}×${p.width}` });
          for (const c of p.cuts) {
            const m = { ...c, piece: p.id };
            if (c.at != null && c.dir === "cross") m.at = r1(c.at + p.x);
            if (c.from != null && Array.isArray(c.from)) { m.from = shift([c.from], p.x)[0]; m.to = shift([c.to], p.x)[0]; }
            else if (c.dir === "rip") { m.from = r1(c.from + p.x); m.to = r1(c.to + p.x); }
            cut(m);
          }
          return { id: p.id, ramp: p.ramp, kind: p.kind, name: p.name, nested: p.nested, x: p.x, length: p.length, width: p.width,
            shapes: p.shapes.map((s) => ({ ...s, poly: shift(s.poly, p.x) })), deviation: p.deviation ?? 0, note: p.note };
        });
        const used = pieces.reduce((s, p) => s + p.shapes.reduce((q, sh) => q + polyArea(sh.poly), 0), 0);
        const end = b.next;   // за последним пропилом
        return { index: i + 1, stock: { thickness: b.T, width: BW, length: BL }, pieces, cuts,
          usedLength: r1(end - k), offcut: r1(Math.max(0, BL - end)), wastePct: pct(used, BL * BW) };
      }),
      unplaced,
    };
  }

  function plan(models, opts) {
    const o = resolve(opts);
    const list = Array.isArray(models) ? models : [models];
    if (!list.length) throw new Error("Раскрой: нет ни одного пандуса.");
    const plyParts = [], boardPieces = [], unplaced = [];
    list.forEach((m, i) => {
      if (!m || !m.dims || !m.params) throw new Error(`Раскрой: пандус ${i + 1} — ожидается результат build().`);
      const rp = rampParts(m, i + 1);
      plyParts.push(rp.ply);
      const tooWide = (name, id, h) => unplaced.push({ id, ramp: i + 1, name, size: [null, h],
        reason: `Высота ${h} мм больше ширины доски ${o.boardWidth} мм: нужна более широкая доска или составной клин (ТЗ п. 2), размеры — по практике мастерской.` });
      const pair = nestPair(rp.sides, o);
      if (pair) boardPieces.push(pair); else tooWide(`Боковины ${rp.sides.tag}`, `r${i + 1}-sides`, Math.max(...rp.sides.wedges.map((w) => w.height)));
      const rear = rearPiece(rp.rear, o);
      if (rear) boardPieces.push(rear); else tooWide(rp.rear.name, rp.rear.id, Math.max(rp.rear.hl, rp.rear.hr));
      if (rp.rib) { const rib = ribPiece(rp.rib, o); if (rib) boardPieces.push(rib); else tooWide(rp.rib.name, rp.rib.id, rp.rib.height); }
    });
    const ply = packSheets(plyParts, o);
    const brd = packBoards(boardPieces, o);
    unplaced.push(...ply.unplaced, ...brd.unplaced);
    const sheetArea = o.sheet.w * o.sheet.h;
    const plyUsed = ply.sheets.reduce((s, sh) => s + sh.usedArea, 0);
    const stocks = new Map();
    for (const b of brd.boards) {
      const key = `${b.stock.thickness}×${b.stock.width}×${b.stock.length}`;
      const e = stocks.get(key) || { stock: key, count: 0, offcuts: [] };
      e.count++; e.offcuts.push(b.offcut); stocks.set(key, e);
    }
    const brdArea = brd.boards.reduce((s, b) => s + b.stock.width * b.stock.length, 0);
    const brdUsed = brd.boards.reduce((s, b) => s + b.pieces.reduce((q, p) => q + p.shapes.reduce((z, sh) => z + polyArea(sh.poly), 0), 0), 0);
    return {
      opts: o,
      sheets: ply.sheets,
      boards: brd.boards,
      unplaced,
      summary: {
        ramps: list.length,
        sheet: `${o.sheet.w}×${o.sheet.h}`,
        kerf: o.kerf, edgeTrim: o.edgeTrim,
        sheets: ply.sheets.length,
        sheetWastePct: ply.sheets.map((s) => s.wastePct),
        plyWastePct: pct(plyUsed, sheetArea * ply.sheets.length),
        boards: [...stocks.values()],
        boardWastePct: pct(brdUsed, brdArea),
        cuts: ply.sheets.reduce((s, sh) => s + sh.cuts.length, 0) + brd.boards.reduce((s, b) => s + b.cuts.length, 0),
        unplaced: unplaced.map((u) => u.id),
      },
    };
  }

  return { plan, DEFAULTS };
}
