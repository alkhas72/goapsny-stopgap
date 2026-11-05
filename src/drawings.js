// Чертежи деталей по модели build() из src/ramp.js: контуры раскроя, SVG (деталь или лист A4), DXF R12.
// Чистые функции без DOM и библиотек, работают в браузере и в Node. Модель приходит аргументом.
// Все размеры на чертежах — целые мм из model.dims; формулу здесь не пересчитываем (tests/drawings.test.mjs).
//
// Файл склеивается с остальными в один скрипт, поэтому снаружи только createDrawings().
export function createDrawings() {
  // ---------- детали ----------

  // Контур в плоскости детали, мм. u — от порога наружу (или вдоль доски), v — вверх / поперёк.
  function partDrawings(model) {
    const d = model.dims, p = model.params || {};
    const T = p.board ?? 40, skew = model.kind === "skew";
    const board = `доска ${T}`;
    const name = (id, fallback) => {
      const part = (model.parts || []).find((x) => x.id === id);
      return part ? part.name.split(",")[0] : fallback;
    };
    const dim = (from, to, value, key) => ({ from, to, text: String(value), value, key });
    const out = [];

    // Настил: вид сверху, порог слева (u = 0), край А внизу (v = 0), край Б вверху (v = ширина)
    {
      const W = d.ply.width;
      let outline, dims, note;
      if (skew) {
        const a = d.ply.left, b = d.ply.right;
        outline = [[0, 0], [a, 0], [b, W], [0, W]];
        dims = [
          dim([0, 0], [0, W], W, "ply.width"),
          dim([0, 0], [a, 0], a, "ply.left"),
          dim([0, W], [b, W], b, "ply.right"),
          dim([a, 0], [b, W], d.ply.front, "ply.front"),
        ];
        note = `трапеция: край ${W} к порогу, косой рез ${d.ply.front}; снизу край А, сверху Б; резы 90°`;
      } else {
        const L = d.ply.length;
        outline = [[0, 0], [L, 0], [L, W], [0, W]];
        dims = [dim([0, 0], [0, W], W, "ply.width"), dim([0, 0], [L, 0], L, "ply.length")];
        note = `край ${W} к порогу; резы 90°`;
      }
      out.push({ id: "ply", name: name("ply", "Настил"), qty: 1, material: "фанера 18", outline, dims, note });
    }

    // Боковины: внешняя грань, порог слева. Прямоугольный треугольник: катеты «у порога» и «по земле».
    for (const [id, side] of [["left", "А"], ["right", "Б"]]) {
      const { height: h, ground: g } = d[id];
      out.push({
        id, name: name(id, id === "left" ? "Боковина левая" : "Боковина правая"), qty: 1, material: board,
        outline: [[0, 0], [g, 0], [0, h]],
        dims: [dim([0, 0], [g, 0], g, `${id}.ground`), dim([0, 0], [0, h], h, `${id}.height`)],
        note: `сторона ${side}; край ${h} — к порогу, ${g} — по земле`,
      });
    }

    // Задний борт: смотрим на дверь, край А слева. Верх ровный, низ идёт по земле.
    {
      const { length: L, left: a, right: b } = d.rear;
      const H = Math.max(a, b);
      const outline = [[0, H - a], [L, H - b], [L, H], [0, H]];
      const dims = [dim([0, H], [L, H], L, "rear.length"), dim([0, H - a], [0, H], a, "rear.left")];
      if (a !== b || skew) dims.push(dim([L, H - b], [L, H], b, "rear.right"));
      const bevel = d.rear.bevel != null ? `${d.rear.bevel}°` : `под уклон ${d.slope}`;
      out.push({
        id: "rear", name: name("rear", "Задний борт"), qty: 1, material: board, outline, dims,
        note: `смотрим на дверь, А слева; верх скосить ${bevel}` + (a !== b ? "; низ по земле" : ""),
      });
    }

    // Ребро: по центру, от заднего борта до земли
    if (d.rib) {
      const { height: h, ground: g } = d.rib;
      out.push({
        id: "rib", name: name("rib", "Ребро"), qty: 1, material: board,
        outline: [[0, 0], [g, 0], [0, h]],
        dims: [dim([0, 0], [g, 0], g, "rib.ground"), dim([0, 0], [0, h], h, "rib.height")],
        note: `по центру; край ${h} — к заднему борту`,
      });
    }
    return out;
  }

  // ---------- общая раскладка примитивов ----------
  // Примитивы в координатах «y вверх»: poly (контур реза), line, arrow, text. SVG и DXF рисуют их по-своему.

  const PAPER = { off: 6, ext: 1.5, extGap: 1, gap: 1.2, size: 3.2, arrow: 2.4, aw: 0.55, label: 3.4, note: 2.5, notes: true };
  const CAD = { off: 12, ext: 3, extGap: 2, gap: 2, size: 7, arrow: 5, aw: 1.4, label: 10, note: 0, notes: false };

  // Ширина строки с запасом под широкие шрифты (DejaVu Sans), чтобы подписи не наезжали
  const textW = (s, size, bold) => {
    let w = 0;
    for (const ch of String(s)) w += /[0-9]/.test(ch) ? 0.64 : /[ .,:;·°]/.test(ch) ? 0.34 : /[—×]/.test(ch) ? 0.8 : /[А-ЯЁA-Z]/.test(ch) ? 0.74 : 0.62;
    return w * size * (bold ? 1.1 : 1);
  };
  // Перенос по словам под ширину maxW
  const wrap = (s, size, maxW) => {
    const lines = [];
    let cur = "";
    for (const word of String(s).split(" ")) {
      const t = cur ? cur + " " + word : word;
      if (cur && textW(t, size) > maxW) { lines.push(cur); cur = word; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  function bboxOf(prims) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = ([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const q of prims) {
      if (q.t === "poly") q.pts.forEach(add);
      else if (q.t === "line") { add(q.a); add(q.b); }
      else if (q.t === "arrow") add(q.tip);
      else if (q.t === "text") textCorners(q).forEach(add);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function textCorners(q) {
    const w = textW(q.s, q.size, q.bold), h = q.size;
    const sx = q.anchor === "start" ? 0 : q.anchor === "end" ? -w : -w / 2;
    const r = (q.ang * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    return [[sx, -h / 2], [sx + w, -h / 2], [sx + w, h / 2], [sx, h / 2]].map(([x, y]) => [q.x + x * c - y * s, q.y + x * s + y * c]);
  }

  function dimPrims(a, b, c, text, S, out) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (!(len > 0)) return;
    const d = [dx / len, dy / len];
    let n = [-d[1], d[0]];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if ((mx - c[0]) * n[0] + (my - c[1]) * n[1] < 0) n = [-n[0], -n[1]];
    const at = (p, k) => [p[0] + n[0] * k, p[1] + n[1] * k];
    const A = at(a, S.off), B = at(b, S.off);
    out.push({ t: "line", a: at(a, S.extGap), b: at(a, S.off + S.ext), layer: "DIM" });
    out.push({ t: "line", a: at(b, S.extGap), b: at(b, S.off + S.ext), layer: "DIM" });
    const inside = len >= 2 * S.arrow + 1;
    if (inside) {
      out.push({ t: "line", a: A, b: B, layer: "DIM" });
      out.push({ t: "arrow", tip: A, dir: [-d[0], -d[1]], S, layer: "DIM" });
      out.push({ t: "arrow", tip: B, dir: d, S, layer: "DIM" });
    } else {
      const e = 2 * S.arrow;
      out.push({ t: "line", a: [A[0] - d[0] * e, A[1] - d[1] * e], b: [B[0] + d[0] * e, B[1] + d[1] * e], layer: "DIM" });
      out.push({ t: "arrow", tip: A, dir: d, S, layer: "DIM" });
      out.push({ t: "arrow", tip: B, dir: [-d[0], -d[1]], S, layer: "DIM" });
    }
    let ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    if (ang > 120) ang -= 180;                       // почти вертикальный текст читается снизу вверх
    if (ang <= -60) ang += 180;
    const room = len - (inside ? 2 * S.arrow : 0);
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    if (textW(text, S.size) + 1 <= room) {
      const P = at(M, S.gap + S.size / 2);
      out.push({ t: "text", x: P[0], y: P[1], s: text, size: S.size, ang, anchor: "middle", layer: "DIM", dim: true });
    } else {
      const anchor = n[0] > 0.3 ? "start" : n[0] < -0.3 ? "end" : "middle";
      const P = at(M, S.gap + (anchor === "middle" ? S.size / 2 : 0.5));
      out.push({ t: "text", x: P[0], y: P[1], s: text, size: S.size, ang: 0, anchor, layer: "DIM", dim: true });
    }
  }

  // Деталь в масштабе k (мм бумаги на мм детали): контур, размеры, подпись. Возвращает примитивы и рамку.
  function layoutPart(pd, k, S, num) {
    const pts = pd.outline.map(([u, v]) => [u * k, v * k]);
    const c = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    const prims = [{ t: "poly", pts, layer: "CUT" }];
    for (const dm of pd.dims) dimPrims([dm.from[0] * k, dm.from[1] * k], [dm.to[0] * k, dm.to[1] * k], c, dm.text, S, prims);
    const bb = bboxOf(prims);
    let y = bb.y1 + S.gap * 1.5;
    const label = `${num}. ${pd.name} — ${pd.material}, ${pd.qty} шт.`;
    if (S.notes && pd.note) {
      const maxW = Math.max(bb.w, textW(label, S.label, true), S.label * 18);
      for (const ln of wrap(pd.note, S.note, maxW).reverse()) {
        prims.push({ t: "text", x: bb.x0, y: y + S.note / 2, s: ln, size: S.note, ang: 0, anchor: "start", layer: "DIM" });
        y += S.note * 1.3;
      }
      y += S.gap * 0.5;
    }
    prims.push({ t: "text", x: bb.x0, y: y + S.label / 2, s: label, size: S.label, ang: 0, anchor: "start", layer: "DIM", bold: true });
    return { id: pd.id, prims, bbox: bboxOf(prims), outline: pts };
  }

  // ---------- SVG ----------

  const FONT = "'Golos Text', 'PT Sans', 'DejaVu Sans', Arial, Helvetica, sans-serif";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const f = (x) => { const r = Math.round(x * 100) / 100; return Object.is(r, -0) ? "0" : String(r); };
  const SCALES = [2, 2.5, 4, 5, 10, 15, 20, 25, 40, 50, 75, 100];

  // Примитивы с началом координат детали в (ox, oy) листа; y листа вниз
  function svgPrims(prims, ox, oy) {
    const X = (x) => ox + x, Y = (y) => oy - y;
    const o = [];
    for (const q of prims) {
      if (q.t === "poly") o.push(`<polygon points="${q.pts.map(([x, y]) => f(X(x)) + "," + f(Y(y))).join(" ")}" fill="none" stroke="#000" stroke-width="0.5" stroke-linejoin="miter"/>`);
      else if (q.t === "line") o.push(`<line x1="${f(X(q.a[0]))}" y1="${f(Y(q.a[1]))}" x2="${f(X(q.b[0]))}" y2="${f(Y(q.b[1]))}" stroke="#000" stroke-width="0.18"/>`);
      else if (q.t === "arrow") {
        const { tip, dir, S } = q, bx = tip[0] - dir[0] * S.arrow, by = tip[1] - dir[1] * S.arrow, nx = -dir[1] * S.aw, ny = dir[0] * S.aw;
        o.push(`<polygon points="${f(X(tip[0]))},${f(Y(tip[1]))} ${f(X(bx + nx))},${f(Y(by + ny))} ${f(X(bx - nx))},${f(Y(by - ny))}" fill="#000"/>`);
      } else if (q.t === "text") {
        const x = X(q.x), y = Y(q.y);
        const rot = q.ang ? ` transform="rotate(${f(-q.ang)} ${f(x)} ${f(y)})"` : "";
        o.push(`<text x="${f(x)}" y="${f(y + q.size * 0.35)}" font-size="${f(q.size)}"${q.anchor !== "start" ? ` text-anchor="${q.anchor}"` : ""}${q.bold ? ' font-weight="700"' : ""}${q.dim ? ' class="dim-text"' : ""}${rot}>${esc(q.s)}</text>`);
      }
    }
    return o.join("");
  }

  function svgDoc(wmm, hmm, title, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(wmm)}mm" height="${f(hmm)}mm" viewBox="0 0 ${f(wmm)} ${f(hmm)}" font-family="${esc(FONT)}" fill="#000">` +
      `<title>${esc(title)}</title><rect x="0" y="0" width="${f(wmm)}" height="${f(hmm)}" fill="#fff"/>${body}</svg>`;
  }

  const partGroup = (L, ox, oy) => `<g class="part" data-part="${esc(L.id)}">${svgPrims(L.prims, ox - L.bbox.x0, oy + L.bbox.y1)}</g>`;

  // Укладки деталей на поле листа. Каждая возвращает {at: [{it, x, y}], w, h} (y вниз) или null.
  // Колонка: настил слева, остальные детали столбиком справа.
  function column(items, W, H, gx, gy) {
    const [first, ...rest] = items;
    if (!rest.length) return null;
    const colW = Math.max(...rest.map((it) => it.bbox.w));
    const sumH = rest.reduce((s, it) => s + it.bbox.h, 0);
    const restH = sumH + gy * (rest.length - 1);
    if (first.bbox.w + gx + colW > W || Math.max(first.bbox.h, restH) > H) return null;
    const h = Math.max(first.bbox.h, restH);
    const g = rest.length > 1 ? Math.min((h - sumH) / (rest.length - 1), gy * 4) : 0;
    let y = (h - (sumH + g * (rest.length - 1))) / 2;
    const at = [{ it: first, x: 0, y: (h - first.bbox.h) / 2 }];
    for (const it of rest) { at.push({ it, x: first.bbox.w + gx, y }); y += it.bbox.h + g; }
    return { at, w: first.bbox.w + gx + colW, h };
  }
  // Колонка + полки: рядом с настилом — те детали, что влезают по ширине, остальные полками ниже.
  function hybrid(items, W, H, gx, gy) {
    const [first, ...rest] = items;
    const side = [], below = [];
    for (const it of rest) (first.bbox.w + gx + it.bbox.w <= W ? side : below).push(it);
    if (!side.length || !below.length) return null;
    const top = column([first, ...side], W, H, gx, gy);
    if (!top) return null;
    const bot = shelf(below, W, H - top.h - gy * 1.5, gx, gy);
    if (!bot) return null;
    const w = Math.max(top.w, bot.w), dy = top.h + gy * 1.5;
    const at = [...top.at.map((q) => ({ ...q, x: q.x + (w - top.w) / 2 })), ...bot.at.map((q) => ({ ...q, x: q.x + (w - bot.w) / 2, y: q.y + dy }))];
    return { at, w, h: dy + bot.h };
  }
  // Полки: слева направо, при нехватке места — новая полка; полки по центру.
  function shelf(items, W, H, gx, gy) {
    const rows = [];
    let row = null;
    for (const it of items) {
      if (it.bbox.w > W) return null;
      if (!row || row.w + gx + it.bbox.w > W) { row = { items: [], w: -gx, h: 0 }; rows.push(row); }
      row.items.push(it); row.w += gx + it.bbox.w; row.h = Math.max(row.h, it.bbox.h);
    }
    const total = rows.reduce((s, r) => s + r.h, 0) + gy * (rows.length - 1);
    if (total > H) return null;
    const w = Math.max(...rows.map((r) => r.w)), at = [];
    const g = rows.length > 1 ? gy + Math.min((H - total) / (rows.length - 1), gy) : 0;
    let y = 0;
    for (const r of rows) {
      let x = (w - r.w) / 2;
      for (const it of r.items) { at.push({ it, x, y: y + (r.h - it.bbox.h) / 2 }); x += it.bbox.w + gx; }
      y += r.h + g;
    }
    return { at, w, h: y - g };
  }

  const ru = (v) => (typeof v === "number" ? String(+v.toFixed(4)) : String(v)).replace(".", ",");
  function titleText(model) {
    const p = model.params || {};
    return `Пандус А ${ru(p.hl)} / Б ${ru(p.hr)}`;
  }

  function a4(model, opts) {
    const p = model.params || {}, d = model.dims;
    const parts = partDrawings(model);
    const PW = 210, PH = 297, M = 10, TB = 34;
    const area = { x: M + 3, y: M + 4, w: PW - 2 * M - 6, h: PH - 2 * M - TB - 10 };
    // крупнейший стандартный масштаб, при котором все детали влезают на поле
    let fit = null, den = SCALES[SCALES.length - 1];
    for (const s of SCALES) {
      const items = parts.map((pd, i) => layoutPart(pd, 1 / s, PAPER, i + 1));
      fit = column(items, area.w, area.h, 12, 8) || hybrid(items, area.w, area.h, 12, 8) || shelf(items, area.w, area.h, 10, 8);
      if (fit) { den = s; break; }
    }
    if (!fit) fit = shelf(parts.map((pd, i) => layoutPart(pd, 1 / den, PAPER, i + 1)), area.w, Infinity, 10, 8);
    const ox = area.x + (area.w - fit.w) / 2, oy = area.y + Math.max(0, area.h - fit.h) * 0.4;
    let body = "";
    for (const { it, x, y } of fit.at) body += partGroup(it, ox + x, oy + y);

    // рамка и основная надпись
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const x0 = M, x1 = PW - M, ty = PH - M - TB, ty1 = PH - M, cx = 128, cx2 = 164;
    const L = (a, b, c, e, w = 0.35) => `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}" stroke="#000" stroke-width="${w}"/>`;
    const T = (x, yy, s, size, extra = "") => `<text x="${f(x)}" y="${f(yy)}" font-size="${f(size)}"${extra}>${esc(s)}</text>`;
    const skew = model.kind === "skew";
    const line2 = `ширина ${ru(d.ply.width)} · уклон 1:6 · фанера 18 · доска ${ru(p.board ?? 40)}`;
    const line3 = skew
      ? `порог разный: земля скошена на ${ru(Math.abs(p.hl - p.hr))} мм; наклон фанеры ${ru(d.slope)}`
      : `порог ровный; наклон фанеры ${ru(d.slope)}`;
    const line4 = `длина пандуса ${d.totalLen}; размеры в мм; резы 90°, кроме верха заднего борта` + (d.rib ? "; с ребром" : "; без ребра");
    let tb = `<rect x="${x0}" y="${M}" width="${PW - 2 * M}" height="${PH - 2 * M}" fill="none" stroke="#000" stroke-width="0.5"/>`;
    tb += L(x0, ty, x1, ty, 0.5) + L(cx, ty, cx, ty1) + L(cx2, ty, cx2, ty + 11.3) + L(cx, ty + 11.3, x1, ty + 11.3) + L(cx, ty1 - 11.3, x1, ty1 - 11.3);
    tb += T(x0 + 3, ty + 8.5, titleText(model), 6.2, ' font-weight="700"');
    tb += T(x0 + 3, ty + 15.5, line2, 3.3) + T(x0 + 3, ty + 21.5, line3, 3) + T(x0 + 3, ty + 27.5, line4, 3);
    tb += T(cx + 2.5, ty + 3.9, "масштаб", 2.2) + T(cx + 2.5, ty + 9.3, `1:${den}`, 4.2, ' font-weight="700"');
    tb += T(cx2 + 2.5, ty + 3.9, "дата", 2.2) + T(cx2 + 2.5, ty + 9.3, date, 3.6);
    tb += T(cx + 2.5, ty + 16.2, "GoApsny: Stopgap · IDLab", 3) + T(cx + 2.5, ty + 20.6, "goapsny.org", 3.4, ' font-weight="700"');
    tb += T(cx + 2.5, ty1 - 4.2, "черновик — сверить с мастерской", 3.15, ' font-weight="700"');
    return svgDoc(PW, PH, `${titleText(model)}: детали, лист A4`, body + tb);
  }

  function single(model, id, opts) {
    const parts = partDrawings(model), i = parts.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`нет детали ${id}`);
    const pd = parts[i], maxW = opts.maxWidth ?? 180, maxH = opts.maxHeight ?? 120;
    let den = opts.scale, L;
    if (den) L = layoutPart(pd, 1 / den, PAPER, i + 1);
    else for (den of SCALES) { L = layoutPart(pd, 1 / den, PAPER, i + 1); if (L.bbox.w <= maxW && L.bbox.h <= maxH) break; }
    const m = 5, foot = 6;
    const W = L.bbox.w + 2 * m, H = L.bbox.h + 2 * m + foot;
    const sc = `<text x="${f(W - m)}" y="${f(H - m)}" font-size="2.5" text-anchor="end">${esc(`${titleText(model)} · М 1:${den} · размеры в мм · черновик`)}</text>`;
    return svgDoc(W, H, `${pd.name}: чертёж`, partGroup(L, m, m) + sc);
  }

  function toSVG(model, opts = {}) {
    return opts.part ? single(model, opts.part, opts) : a4(model, opts);
  }

  // ---------- DXF R12 ----------

  function toDXF(model) {
    const parts = partDrawings(model);
    const GAP = 50;
    const placed = [];
    let x = 0;
    parts.forEach((pd, i) => {
      const L = layoutPart(pd, 1, CAD, i + 1);
      const ub = bboxOf([L.prims[0]]);                    // рамка контура реза
      placed.push({ L, dx: x - ub.x0, dy: -ub.y0 });
      x += ub.w + GAP;
    });
    const n = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? "0.0" : Number.isInteger(r) ? r.toFixed(1) : String(r); };
    const enc = (s) => Array.from(String(s), (ch) => { const c = ch.codePointAt(0); return c < 128 ? ch : "\\U+" + c.toString(16).toUpperCase().padStart(4, "0"); }).join("");
    const ent = [];
    const line = (a, b, layer) => ent.push(0, "LINE", 8, layer, 10, n(a[0]), 20, n(a[1]), 30, "0.0", 11, n(b[0]), 21, n(b[1]), 31, "0.0");
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { L, dx, dy } of placed) {
      const P = ([px, py]) => [px + dx, py + dy];
      const bb = L.bbox;
      x0 = Math.min(x0, bb.x0 + dx); y0 = Math.min(y0, bb.y0 + dy); x1 = Math.max(x1, bb.x1 + dx); y1 = Math.max(y1, bb.y1 + dy);
      for (const q of L.prims) {
        if (q.t === "poly") q.pts.forEach((pt, j) => line(P(pt), P(q.pts[(j + 1) % q.pts.length]), "CUT"));
        else if (q.t === "line") line(P(q.a), P(q.b), "DIM");
        else if (q.t === "arrow") {
          const { tip, dir, S } = q, bx = tip[0] - dir[0] * S.arrow, by = tip[1] - dir[1] * S.arrow, nx = -dir[1] * S.aw, ny = dir[0] * S.aw;
          line(P(tip), P([bx + nx, by + ny]), "DIM");
          line(P(tip), P([bx - nx, by - ny]), "DIM");
        } else if (q.t === "text") {
          const [tx, ty] = P([q.x, q.y]);
          const h = q.anchor === "start" ? 0 : q.anchor === "end" ? 2 : 1;
          ent.push(0, "TEXT", 8, "DIM", 10, n(tx), 20, n(ty), 30, "0.0", 40, n(q.size), 1, enc(q.s), 50, n(q.ang || 0), 72, h, 11, n(tx), 21, n(ty), 31, "0.0", 73, 2);
        }
      }
    }
    const layer = (name, color) => [0, "LAYER", 2, name, 70, 0, 62, color, 6, "CONTINUOUS"];
    const out = [
      0, "SECTION", 2, "HEADER",
      9, "$ACADVER", 1, "AC1009",
      9, "$DWGCODEPAGE", 3, "ANSI_1251",
      9, "$INSBASE", 10, "0.0", 20, "0.0", 30, "0.0",
      9, "$EXTMIN", 10, n(x0), 20, n(y0), 30, "0.0",
      9, "$EXTMAX", 10, n(x1), 20, n(y1), 30, "0.0",
      9, "$LUNITS", 70, 2,
      9, "$INSUNITS", 70, 4,
      0, "ENDSEC",
      0, "SECTION", 2, "TABLES",
      0, "TABLE", 2, "LTYPE", 70, 1,
      0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, "0.0",
      0, "ENDTAB",
      0, "TABLE", 2, "LAYER", 70, 2,
      ...layer("CUT", 7), ...layer("DIM", 1),
      0, "ENDTAB",
      0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES", ...ent, 0, "ENDSEC",
      0, "EOF",
    ];
    let s = "";
    for (let i = 0; i < out.length; i += 2) s += `${String(out[i]).padStart(3, " ")}\n${out[i + 1]}\n`;
    return s;
  }

  return { partDrawings, toSVG, toDXF };
}
