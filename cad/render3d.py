import sys, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from ramp_model import build
cols = dict(ply="#9cc3e6", left="#e8c27a", right="#e8c27a", rib="#d9a94f", rear="#c98f3a")
fig = plt.figure(figsize=(14, 4.8))
for i, a in enumerate(sys.argv[2:]):
    m = build(float(a)); ax = fig.add_subplot(1, len(sys.argv) - 2, i + 1, projection="3d")
    for name, part in m["parts"].items():
        al = 0.35 if name == "ply" else 1.0
        vs, ts = part.tessellate(0.5)
        tris = [[(vs[t].X, vs[t].Y, vs[t].Z) for t in tri] for tri in ts]
        ax.add_collection3d(Poly3DCollection(tris, fc=cols[name], ec="none", alpha=al))
    ax.set_xlim(0, 600); ax.set_ylim(0, 900); ax.set_zlim(0, 300)
    ax.set_box_aspect((600, 900, 300)); ax.view_init(28, -55); ax.set_axis_off()
    ax.set_title(f"порог {float(a):.0f} мм (фанера полупрозрачная)")
fig.tight_layout(); fig.savefig(sys.argv[1], dpi=90)
