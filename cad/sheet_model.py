"""Лист A4 по 3D-моделям build123d (ramp_model.py): профили и размеры берутся с модели."""
import math, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from ramp_model import build, measure, side_profile, W, T, P

def ordered(pts):
    cx = sum(x for x, _ in pts) / len(pts); cy = sum(y for _, y in pts) / len(pts)
    return sorted(set((round(x, 3), round(y, 3)) for x, y in pts), key=lambda q: math.atan2(q[1] - cy, q[0] - cx))

hs = [float(a) for a in sys.argv[2:]]
fig = plt.figure(figsize=(8.27, 11.69))
fig.text(0.5, 0.975, f"Приставные пандусы: ширина {W}, фанера {P}, доска {T} (мм)", ha="center", va="top", fontsize=13, weight="bold")
top, bottom = 0.95, 0.31; hrow = (top - bottom) / len(hs)
rows = [["№", "Порог", "Фанера 18\n(рез 90°)", "Боковина ×2\nвысота / по земле", "Ребро ×1\nвысота / длина", "Задний борт\nдлина × высота"]]
for i, h in enumerate(hs):
    m = build(h); d = measure(m); tri, ply = side_profile(m); g = m["G"]; bh = m["bh"]
    ax = fig.add_axes([0.03, top - (i + 1) * hrow + 0.01, 0.94, hrow - 0.02])
    ax.add_patch(Polygon(ordered(tri), fc="#f3d9a4", ec="k", lw=1.5))
    ax.add_patch(Polygon(ordered(ply), fc="#cfe3f5", ec="k", lw=1.5))
    ax.plot([0, 0], [0, h + 5], "k", lw=2.5); ax.plot([-0.08 * g, g * 1.08], [0, 0], "k", lw=1)
    yd = -0.12 * g / 6
    ax.annotate("", (0, yd), (d["side"][1], yd), arrowprops=dict(arrowstyle="<->", lw=1.2))
    ax.text(d["side"][1] / 2, yd, f" {d['side'][1]} ", ha="center", va="center", fontsize=15, backgroundcolor="white")
    ax.annotate("", (-0.03 * g, 0), (-0.03 * g, bh), arrowprops=dict(arrowstyle="<->", lw=1.2, color="#7a5a00"))
    ax.text(-0.045 * g, bh / 2, f"{d['side'][0]}", ha="right", va="center", fontsize=15, color="#7a5a00")
    ax.text(-0.045 * g, bh + 9, f"порог {h:.0f}", ha="right", va="bottom", fontsize=12)
    ax.text(g * 0.45, bh * 0.55 + P + 4, f"фанера {d['ply'][0]} × {d['ply'][1]}", rotation=-m["ang"], ha="center", fontsize=13)
    ax.text(g, h * 0.95, f"№{i + 1}  порог {h:.0f}", ha="right", va="top", fontsize=14, weight="bold")
    ax.set_xlim(-0.2 * g, g * 1.1); ax.set_ylim(-0.3 * g / 6, h + 20); ax.set_aspect("equal"); ax.axis("off")
    rows.append([str(i + 1), f"{h:.0f}", f"{d['ply'][0]} × {d['ply'][1]}", f"{d['side'][0]} / {d['side'][1]}",
                 (f"{d['rib'][0]} / {d['rib'][1]}" if d['rib'] else "нет"), f"{d['rear'][0]} × {d['rear'][1]}, {d['bevel']}°"])
ax = fig.add_axes([0.03, 0.07, 0.94, 0.21]); ax.axis("off")
tb = ax.table(cellText=rows, loc="center", cellLoc="center"); tb.auto_set_font_size(False); tb.set_fontsize(13); tb.scale(1, 3.0)
for j in range(6): tb[0, j].set_text_props(weight="bold", fontsize=9.5)
fig.text(0.03, 0.035, "Построено 3D-моделью build123d 0.13.0; размеры сняты с модели. Основание = порог × 6, боковина = порог − 18.\nЦентральное ребро только при пороге от 200 мм. Файлы: STEP, GLB (3D), DXF боковины. goapsny.org", fontsize=9)
fig.savefig(sys.argv[1]); fig.savefig(sys.argv[1].replace(".pdf", ".png"), dpi=80)
