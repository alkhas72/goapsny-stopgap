#!/usr/bin/env python3
"""Пандус как 3D-модель build123d. Размеры, виды и файлы для цеха снимаются с модели.

Использование: ramp_model.py OUT_DIR H1_MM H2_MM ...
Правила цеха (Алхас, 2026-10-31): ширина 900, доска 40, фанера 18, основание = порог × 6,
боковина = порог − 18, фанера прямоугольник с резами 90°, размеры целыми мм.

Оси: X от порога наружу, Y поперёк (ширина), Z вверх. Порог в плоскости X=0.
"""
import math
import sys

from build123d import (Align, Axis, Box, BuildPart, BuildSketch, Compound, ExportDXF, Plane,
                       Polygon, Pos, Rot, Unit, export_gltf, export_step, extrude)

W, T, P, K = 900, 40, 18, 6
RIB_OVER = 200                     # ребро только при пороге БОЛЬШЕ 20 см (ТЗ 2026-11-04, п. 2)


def wedge(x0, x1, z0, y0, thick):
    """Треугольная/трапециевидная деталь под скат: профиль в плоскости XZ, толщина по Y."""
    with BuildPart() as bp:
        with BuildSketch(Plane.XZ.offset(-y0)):
            Polygon((x0, 0), (x1, 0), (x0, z0), align=None) if z0 > 0 else None
        extrude(amount=-thick)
    return bp.part


def build(h):
    G = K * h                      # основание по полной высоте порога
    bh = h - P                     # высота боковины у порога
    s = bh / G                     # уклон каркаса
    zr = round(bh - T * s, 1)      # высота каркаса на расстоянии T от порога

    left = wedge(0, G, bh, 0, T)
    right = wedge(0, G, bh, W - T, T)
    rib = wedge(T, G, zr, (W - T) / 2, T) if h > RIB_OVER else None
    with BuildPart() as rb:        # задний борт: верх скошен под скат
        with BuildSketch(Plane.XZ.offset(-T)):
            Polygon((0, 0), (T, 0), (T, zr), (0, bh), align=None)
        extrude(amount=-(W - 2 * T))
    rear = rb.part
    L = math.hypot(G, bh)
    ang = math.degrees(math.atan(s))
    ply = Pos(0, 0, bh) * Rot(0, ang, 0) * Box(L, W, P, align=(Align.MIN, Align.MIN, Align.MIN))
    parts = dict(ply=ply, left=left, right=right, rear=rear)
    if h > RIB_OVER:
        parts["rib"] = rib
    return dict(h=h, G=G, bh=bh, ang=ang, parts=parts)


def measure(m):
    """Размеры деталей, снятые с тел модели."""
    p = m["parts"]
    sb = p["left"].bounding_box().size
    rb = p["rear"].bounding_box().size
    ply_len = max(round(e.length) for e in p["ply"].edges()
                  if abs((e.end_point() - e.start_point()).Y) < 1e-6)
    return dict(
        ply=(round(p["ply"].bounding_box().size.Y), ply_len),   # ширина × длина
        side=(round(sb.Z), round(sb.X)),                              # высота × по земле
        rib=(round(p["rib"].bounding_box().size.Z), round(p["rib"].bounding_box().size.X)) if "rib" in p else None,
        rear=(round(rb.Y), round(rb.Z)),
        bevel=round(m["ang"], 1),
        total_len=round(Compound(list(p.values())).bounding_box().size.X),
    )


def side_profile(m):
    """Профили боковины и фанеры в разрезе Y=0, вершины прямо из модели."""
    p = m["parts"]
    tri = [(v.X, v.Z) for v in p["left"].vertices() if abs(v.Y) < 1e-6]
    ply = [(v.X, v.Z) for v in p["ply"].vertices() if abs(v.Y) < 1e-6]
    return tri, ply


def export(m, out_dir, idx):
    p = m["parts"]
    tag = f"{out_dir}/ramp-{idx}-h{m['h']:g}"
    export_step(Compound(list(p.values())), f"{tag}.step")
    export_gltf(Compound(list(p.values())), f"{tag}.glb", binary=True)
    dxf = ExportDXF(unit=Unit.MM)
    dxf.add_layer("side")
    side_face = p["left"].faces().sort_by(Axis.Y)[0].rotate(Axis.X, -90)
    dxf.add_shape(side_face, layer="side")
    dxf.write(f"{tag}-bokovina.dxf")


if __name__ == "__main__":
    out = sys.argv[1]
    for i, a in enumerate(sys.argv[2:], 1):
        m = build(float(a))
        print(i, measure(m))
        export(m, out, i)
