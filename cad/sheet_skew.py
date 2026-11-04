"""Лист A4 для пандуса на скошенной площадке: всё снимается с модели ramp_skew.py."""
import math, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from ramp_skew import build, measure, face_at, W, T, P

hl, hr = float(sys.argv[2]), float(sys.argv[3])
num = sys.argv[4] if len(sys.argv) > 4 else "4"
m = build(hl, hr); d = measure(m); p = m["parts"]
fig = plt.figure(figsize=(8.27, 11.69))
fig.text(0.5, 0.975, f"Пандус №{num}: порог слева {hl:.0f} / справа {hr:.0f} (земля скошена на {hl-hr:.0f})", ha="center", va="top", fontsize=13, weight="bold")
fig.text(0.5, 0.952, f"ширина {W}, фанера {P} (рез 90°), доска {T}, без ребра; уклон фанеры {d['slope']} (мм)", ha="center", va="top", fontsize=10.5)

# 1. Фанера, вид сверху в плоскости листа
pl = d["ply"]; dx = math.sqrt(max(pl["front"]**2 - W**2, 0))
ax = fig.add_axes([0.05, 0.62, 0.9, 0.31]); ax.set_aspect("equal"); ax.axis("off")
poly = [(0, 0), (W, 0), (W, pl["right"]), (0, pl["left"])]
ax.add_patch(Polygon(poly, fc="#cfe3f5", ec="k", lw=1.5))
ax.set_xlim(-120, W + 120); ax.set_ylim(-90, max(pl["left"], pl["right"]) + 90)
ax.text(W/2, -45, f"{pl['back']}  (к порогу)", ha="center", fontsize=14)
ax.text(-15, pl["left"]/2, f"{pl['left']}", ha="right", va="center", fontsize=15)
ax.text(W + 15, pl["right"]/2, f"{pl['right']}", ha="left", va="center", fontsize=15)
ax.text(W/2, max(pl["left"], pl["right"]) + 25, f"косой рез {pl['front']}", ha="center", fontsize=14, color="#b00")
ax.text(W/2, pl["left"]*0.35, "1. ФАНЕРА 18, вид сверху\nлевый край длиннее правого", ha="center", fontsize=11)

# 2-3. Боковины, 4. задний борт
def ordered(pts):
    cx = sum(x for x, _ in pts) / len(pts); cy = sum(y for _, y in pts) / len(pts)
    return sorted(set((round(x, 3), round(y, 3)) for x, y in pts), key=lambda q: math.atan2(q[1] - cy, q[0] - cx))

def side(axr, title, h, g, yface, total):
    z0 = m["g"] * yface                                  # земля под этой гранью
    ply = [(v.X, v.Z - z0) for v in face_at(p["ply"], yface)]
    axr.add_patch(Polygon([(0, 0), (g, 0), (0, h)], fc="#f3d9a4", ec="k", lw=1.5))
    axr.add_patch(Polygon(ordered(ply), fc="#cfe3f5", ec="k", lw=1.5))
    axr.plot([0, 0], [0, total + 3], "k", lw=2.5)
    B, H = m["base"], max(hl, hr)
    axr.set_xlim(-0.3 * B, B * 1.1); axr.set_ylim(-0.1 * B, H * 1.45); axr.set_aspect("equal"); axr.axis("off")
    axr.text(g/2, -0.065 * B, f"{g}", ha="center", fontsize=14)
    axr.text(-10, h/2, f"{h}", ha="right", va="center", fontsize=14, color="#7a5a00")
    axr.annotate("+18", (-10, h + 9), xytext=(0, 1), textcoords="offset points", ha="right", va="center", fontsize=12, color="#3a6ea5")
    axr.annotate(f"порог {total:.0f}", (-10, total), xytext=(0, 16), textcoords="offset points", ha="right", va="center", fontsize=12)
    axr.set_title(title, fontsize=11)
side(fig.add_axes([0.03, 0.47, 0.46, 0.14]), "2. Левая боковина + фанера", *d["left"], 0, hl)
side(fig.add_axes([0.51, 0.47, 0.46, 0.14]), "3. Правая боковина + фанера", *d["right"], W, hr)
ax = fig.add_axes([0.05, 0.37, 0.9, 0.09]); ax.set_aspect("equal"); ax.axis("off")
L, a1, a2 = d["rear"]
ax.add_patch(Polygon([(0, 0), (L, a1 - a2), (L, a1), (0, a1)], fc="#f3d9a4", ec="k", lw=1.5))
ax.set_xlim(-80, L + 80); ax.set_ylim(-35, a1 + 25)
ax.text(L/2, -28, f"{L}", ha="center", fontsize=14); ax.text(-8, a1/2, f"{a1}", ha="right", va="center", fontsize=14)
ax.text(L + 8, a1 - a2/2, f"{a2}", ha="left", va="center", fontsize=14)
ax.set_title("4. Задний борт (вид от двери): низ по скосу земли, верх ровный", fontsize=11)

# 3D
ax = fig.add_axes([0.05, 0.08, 0.9, 0.28], projection="3d")
cols = dict(ply="#9cc3e6", left="#e8c27a", right="#e8c27a", rear="#c98f3a")
for name, part in p.items():
    vs, ts = part.tessellate(0.5)
    ax.add_collection3d(Poly3DCollection([[(vs[t].X, vs[t].Y, vs[t].Z) for t in tri] for tri in ts],
                        fc=cols[name], ec="none", alpha=0.4 if name == "ply" else 1))
B3 = m["base"] * 1.05; Z3 = max(hl, hr) * 2.3
ax.set_xlim(0, B3); ax.set_ylim(0, 900); ax.set_zlim(0, Z3); ax.set_box_aspect((B3, 900, Z3))
ax.view_init(25, -50); ax.set_axis_off()
fig.text(0.03, 0.03, "Модель build123d 0.13.0, размеры сняты с модели. Порог ровный, земля наклонена поперёк.\nФанера одним плоским листом, поэтому правая (низкая) сторона короче. goapsny.org", fontsize=9)
fig.savefig(sys.argv[1]); fig.savefig(sys.argv[1].replace(".pdf", ".png"), dpi=80)
