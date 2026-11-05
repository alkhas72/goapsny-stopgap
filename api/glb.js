// GLB этого пандуса по https для Scene Viewer на Android (внешнее приложение не читает blob:).
// /api/glb?hl=85&hr=70&width=900&board=40&paint=102C54 — те же параметры, что у ar.html; формула та же, что в приложении.
import { build } from "../src/ramp.js";
import { createAR } from "../src/ar.js";

const AR = createAR();
const num = (v) => (v == null || String(v).trim() === "" ? undefined : Number(String(v).trim().replace(",", ".")));

export default function handler(req, res) {
  const q = new URL(req.url, "http://x").searchParams;
  const params = {};
  for (const k of ["hl", "hr", "width", "board", "freeWidth"]) {
    const v = num(q.get(k));
    if (v === undefined) continue;
    if (!Number.isFinite(v)) return res.status(400).send(`Неверное число: ${k}`);
    params[k] = v;
  }
  const raw = (q.get("paint") || "").trim();
  const paint = !raw || /^(raw|none|нет)$/i.test(raw) ? null : "#" + raw.replace(/^#/, "");
  if (paint && !/^#[0-9a-f]{6}$/i.test(paint)) return res.status(400).send("Цвет: ожидается вид 102C54");
  const model = build(params);
  const errs = model.issues.filter((i) => i.level === "error");
  if (errs.length) return res.status(422).send(errs.map((i) => i.text).join(" "));
  const glb = Buffer.from(AR.toGLB(model, paint));
  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Disposition", `inline; filename="pandus-${params.hl ?? ""}-${params.hr ?? ""}.glb"`);
  res.status(200).send(glb);
}
