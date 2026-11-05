// Рабочая формула пандуса, перенесённая из cad/ramp_model.py (ровный порог)
// и cad/ramp_skew.py (порог разной высоты). Сверка с движком build123d: tests/parity.test.mjs.
//
// Оси, мм: X от порога наружу, Y слева направо (смотрим на дверь), Z вверх.
// Земля z = 0 на левом краю; при перекосе земля наклонена поперёк, порог ровный.

export const PARAMS_VERSION = 1;
export const SLOPE = 6;          // 1:6, строго (ТЗ п. 2)
export const PLY = 18;           // фанера
export const RIB_OVER = 200;     // ребро только при пороге больше 20 см (ТЗ п. 2)
export const MAX_H = 300;        // ступень до 30 см (ТЗ п. 2)

// Python round(): к ближайшему чётному на .5, чтобы целые мм совпадали с движком
export function pyRound(x, nd = 0) {
  const m = 10 ** nd, v = x * m, f = Math.floor(v), d = v - f;
  let r = d > 0.5 + 1e-9 ? f + 1 : d < 0.5 - 1e-9 ? f : (f % 2 === 0 ? f : f + 1);
  return r / m;
}

export const DEFAULTS = { hl: 85, hr: 70, width: 900, board: 40, freeWidth: null };

// Проверка замера: ничего не округляет, только сообщает
export function validate(p) {
  const issues = [];
  if (!(p.hl > PLY) || !(p.hr > PLY)) issues.push({ level: "error", text: `Высота порога должна быть больше ${PLY} мм (толщина фанеры).` });
  if (Math.max(p.hl, p.hr) > MAX_H) issues.push({ level: "error", text: `Ступень выше ${MAX_H / 10} см: это другое изделие.` });
  if (p.freeWidth == null || !(p.freeWidth > 0)) issues.push({ level: "warn", text: "Замер неполный: не указана свободная ширина в месте примыкания." });
  else if (p.width > p.freeWidth) issues.push({ level: "error", text: `Пандус ${p.width} мм шире свободного места ${p.freeWidth} мм: он не встанет вплотную к ступени.` });
  if (p.board < 35 || p.board > 50) issues.push({ level: "warn", text: "Толщина доски вне 35–50 мм." });
  return issues;
}

function flat(p) {
  const { width: W, board: T } = p, h = p.hl;
  const G = SLOPE * h, bh = h - PLY, s = bh / G;
  const zr = pyRound(bh - T * s, 1);
  const L = Math.hypot(G, bh), ang = Math.atan(s);
  const n = [Math.sin(ang), Math.cos(ang)];               // нормаль к скату в плоскости XZ
  const plyAt = (y) => [[0, y, bh], [G, y, 0], [G + PLY * n[0], y, PLY * n[1]], [PLY * n[0], y, bh + PLY * n[1]]];
  const wedge = (x0, z0, y0, y1) => prism([[x0, 0], [G, 0], [x0, z0]], y0, y1);
  const parts = [
    { id: "ply", name: "Настил, фанера 18", mat: "ply", verts: [...plyAt(0), ...plyAt(W)], faces: QUAD_FACES },
    { id: "left", name: "Боковина левая", mat: "pine", ...wedge(0, bh, 0, T) },
    { id: "right", name: "Боковина правая", mat: "pine", ...wedge(0, bh, W - T, W) },
    { id: "rear", name: "Задний борт", mat: "pine", ...prism([[0, 0], [T, 0], [T, zr], [0, bh]], T, W - T) },
  ];
  if (h > RIB_OVER) parts.push({ id: "rib", name: "Ребро", mat: "pine", ...wedge(T, zr, (W - T) / 2, (W + T) / 2) });
  const totalLen = Math.max(G, L * Math.cos(ang) + PLY * Math.sin(ang));
  return {
    kind: "flat", parts, base: G,
    dims: {
      ply: { width: W, length: pyRound(L) },
      left: { height: pyRound(bh), ground: pyRound(G) },
      right: { height: pyRound(bh), ground: pyRound(G) },
      rib: h > RIB_OVER ? { height: pyRound(zr), ground: pyRound(G - T) } : null,
      rear: { length: pyRound(W - 2 * T), left: pyRound(bh), right: pyRound(bh), bevel: pyRound(ang * 180 / Math.PI, 1) },
      totalLen: pyRound(totalLen),
      slope: `1:${pyRound(G / bh, 1)}`,
    },
  };
}

function skew(p) {
  const { width: W, board: T, hl, hr } = p;
  const g = (hl - hr) / W;                 // подъём земли вправо на мм ширины
  const top = hl - PLY;                    // верх каркаса у порога (абсолютная высота)
  const hmax = Math.max(hl, hr), base = SLOPE * hmax;
  const a = (hmax - PLY) / base;           // уклон низа фанеры вдоль X
  const sN = Math.hypot(a, 1), n = [a / sN, 0, 1 / sN];
  const ground = (y) => g * y;
  const xc = (y) => (top - g * y) / a;     // касание низа фанеры с землёй
  const under = (x) => top - a * x;        // низ фанеры
  // боковина/ребро: между землёй и низом фанеры, от x0 до касания
  const board = (y0, y1, x0 = 0) => {
    const f = (y) => x0 === 0
      ? [[0, y, ground(y)], [xc(y), y, ground(y)], [0, y, top]]
      : [[x0, y, ground(y)], [xc(y), y, ground(y)], [x0, y, under(x0)]];
    return { verts: [...f(y0), ...f(y1)], faces: TRI_FACES };
  };
  const rearAt = (y) => [[0, y, ground(y)], [T, y, ground(y)], [T, y, under(T)], [0, y, top]];
  const plyBot = (y) => [[0, y, top], [xc(y), y, ground(y)]];
  const plyAt = (y) => {
    const [b0, b1] = plyBot(y);
    const t1 = [b1[0] + PLY * n[0], y, b1[2] + PLY * n[2]];
    const t0 = [0, y, top + PLY * sN];     // задний рез вертикальный, как в модели
    return [b0, b1, t1, t0];
  };
  const parts = [
    { id: "ply", name: "Настил, фанера 18", mat: "ply", verts: [...plyAt(0), ...plyAt(W)], faces: QUAD_FACES },
    { id: "left", name: "Боковина левая", mat: "pine", ...board(0, T) },
    { id: "right", name: "Боковина правая", mat: "pine", ...board(W - T, W) },
    { id: "rear", name: "Задний борт", mat: "pine", verts: [...rearAt(T), ...rearAt(W - T)], faces: QUAD_FACES },
  ];
  // Ребро на перекосе в cad/ramp_skew.py не строилось; добавлено по ТЗ п. 2, сверить с мастерской
  const ribOn = hmax > RIB_OVER;
  if (ribOn) parts.push({ id: "rib", name: "Ребро", mat: "pine", ...board((W - T) / 2, (W + T) / 2, T) });
  const slopeLen = (y) => xc(y) * sN + PLY * a;
  const dxF = xc(0) - xc(W);
  const yc = W / 2;
  return {
    kind: "skew", parts, base,
    dims: {
      ply: { width: W, length: pyRound(Math.max(slopeLen(0), slopeLen(W))), left: pyRound(slopeLen(0)), right: pyRound(slopeLen(W)), front: pyRound(Math.hypot(dxF, W, g * W)) },
      left: { height: pyRound(top), ground: pyRound(xc(0)) },
      right: { height: pyRound(top - g * W), ground: pyRound(xc(W)) },
      rib: ribOn ? { height: pyRound(under(T) - ground(yc)), ground: pyRound(xc(yc) - T) } : null,
      rear: { length: pyRound(W - 2 * T), left: pyRound(top - g * T), right: pyRound(top - g * (W - T)) },
      totalLen: pyRound(Math.max(xc(0), xc(W)) + PLY * n[0]),
      slope: `1:${pyRound(1 / a, 1)}`,
    },
  };
}

export function build(params) {
  const p = { ...DEFAULTS, ...params };
  const m = p.hl === p.hr ? flat(p) : skew(p);
  return { ...m, params: p, issues: validate(p) };
}

// Профиль в плоскости XZ, вытянутый по Y от y0 до y1
function prism(profile, y0, y1) {
  const k = profile.length;
  const verts = [...profile.map(([x, z]) => [x, y0, z]), ...profile.map(([x, z]) => [x, y1, z])];
  const faces = [];
  for (let i = 1; i < k - 1; i++) { faces.push([0, i + 1, i]); faces.push([k, k + i, k + i + 1]); }
  for (let i = 0; i < k; i++) { const j = (i + 1) % k; faces.push([i, j, k + j]); faces.push([i, k + j, k + i]); }
  return { verts, faces };
}
const TRI_FACES = prism([[0, 0], [1, 0], [0, 1]], 0, 1).faces;
const QUAD_FACES = prism([[0, 0], [1, 0], [1, 1], [0, 1]], 0, 1).faces;
