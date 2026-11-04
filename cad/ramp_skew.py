#!/usr/bin/env python3
"""Пандус на площадке с поперечным уклоном земли. 3D-модель build123d, размеры снимаются с модели.

Использование: ramp_skew.py OUT_DIR H_LEFT_MM H_RIGHT_MM
H_LEFT, H_RIGHT — высота порога над землёй на левом и правом краях пандуса (смотрим на дверь).
Порог горизонтален, земля наклонена поперёк (вдоль пандуса ровная).

Правила цеха: ширина 900, доска 40, фанера 18 (рез 90°), боковина у порога = порог − 18,
основание = порог × 6 по высокой стороне. Фанера — один плоский лист, поэтому уклон один
на всю ширину, и низкая сторона получается короче.
Оси: X от порога наружу, Y слева направо, Z вверх; земля z=0 на левом краю.
"""
import math
import sys

from build123d import (Axis, Box, Compound, ExportDXF, Keep, Plane, Pos, Unit, Vector,
                       export_gltf, export_step)

W, T, P, K = 900, 40, 18, 6


def build(hl, hr):
    g = (hl - hr) / W                       # подъём земли на мм ширины (вправо)
    top = hl - P                            # абсолютная высота верха каркаса у порога
    hmax = max(hl, hr)
    base = K * hmax                         # основание по высокой стороне
    a = (hmax - P) / base                   # уклон низа фанеры вдоль X
    ground = Plane(origin=(0, 0, 0), z_dir=Vector(0, -g, 1))
    ply_bottom = Plane(origin=(0, 0, top), z_dir=Vector(a, 0, 1))

    def frame(y0, y1, x0=0):
        blk = Box(base * 1.5, y1 - y0, 400)
        blk = Pos(x0 + base * 0.75, (y0 + y1) / 2, 100) * blk
        blk = blk.split(ply_bottom, keep=Keep.BOTTOM)
        blk = blk.split(ground, keep=Keep.TOP)
        return blk

    left = frame(0, T)
    right = frame(W - T, W)
    rear = frame(T, W - T)
    rear = rear.split(Plane(origin=(T, 0, 0), z_dir=(1, 0, 0)), keep=Keep.BOTTOM)

    # фанера: толстая плита над ply_bottom, срез 90° к поверхности по линии касания земли
    n = Vector(a, 0, 1).normalized()
    slab = Pos(base * 0.75, W / 2, 100) * Box(base * 1.5, W, 400)
    slab = slab.split(ply_bottom, keep=Keep.TOP)
    slab = slab.split(Plane(origin=Vector(0, 0, top) + n * P, z_dir=n), keep=Keep.BOTTOM)
    slab = slab.split(Plane(origin=(0, 0, 0), z_dir=(1, 0, 0)), keep=Keep.TOP)
    p0 = Vector(top / a, 0, 0)                               # касание земли слева
    p1 = Vector((top - g * W) / a, W, g * W)                 # касание земли справа
    d = (p1 - p0).normalized()
    m = d.cross(n)
    if m.X < 0:
        m = -m
    ply = slab.split(Plane(origin=p0, z_dir=m), keep=Keep.BOTTOM)
    return dict(hl=hl, hr=hr, g=g, a=a, base=base,
                parts=dict(ply=ply, left=left, right=right, rear=rear))


def ply_top(ply, a):
    n = Vector(a, 0, 1).normalized()
    return max(ply.faces(), key=lambda f: f.normal_at().dot(n) * 1e6 + f.center().Z)


def face_at(part, axis_val, axis="Y"):
    return [v for v in part.vertices() if abs(getattr(v, axis) - axis_val) < 1e-6]


def measure(m):
    p = m["parts"]
    lv = face_at(p["left"], 0)                 # внешняя грань левой боковины
    rv = face_at(p["right"], W)                # внешняя грань правой боковины
    def tri(vs):
        hgt = max(v.Z for v in vs if abs(v.X) < 1e-6) - min(v.Z for v in vs if abs(v.X) < 1e-6)
        return round(hgt), round(max(v.X for v in vs))
    rear_l = face_at(p["rear"], T); rear_r = face_at(p["rear"], W - T)
    rh = lambda vs: round(max(v.Z for v in vs if abs(v.X) < 1e-6) - min(v.Z for v in vs if abs(v.X) < 1e-6))
    top_face = ply_top(p["ply"], m["a"])
    tv = top_face.vertices()
    back = [v for v in tv if v.X < 50]; front = [v for v in tv if v.X >= 50]
    bl, br = sorted(back, key=lambda v: v.Y); fl, fr = sorted(front, key=lambda v: v.Y)
    L = lambda u, v: round((Vector(u) - Vector(v)).length)
    return dict(
        left=tri(lv), right=tri(rv),
        rear=(round(W - 2 * T), rh(rear_l), rh(rear_r)),
        ply=dict(back=L(bl, br), left=L(bl, fl), right=L(br, fr), front=L(fl, fr)),
        slope=f"1:{1 / m['a']:.1f}",
    )


def export(m, out):
    p = m["parts"]
    tag = f"{out}/ramp-4-skew-{m['hl']:g}-{m['hr']:g}"
    export_step(Compound(list(p.values())), f"{tag}.step")
    export_gltf(Compound(list(p.values())), f"{tag}.glb", binary=True)
    dxf = ExportDXF(unit=Unit.MM)
    f = ply_top(p["ply"], m["a"])
    f = f.rotate(Axis.Y, -math.degrees(math.atan(m["a"])))      # уложить лист в плоскость XY
    f = Pos(0, 0, -f.center().Z) * f
    dxf.add_shape(f)
    dxf.write(f"{tag}-fanera-top.dxf")
    return tag


if __name__ == "__main__":
    m = build(float(sys.argv[2]), float(sys.argv[3]))
    print(measure(m))
    print(export(m, sys.argv[1]))
