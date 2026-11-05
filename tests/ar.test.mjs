// AR: GLB, который пишет src/ar.js. Разбор своим парсером (заголовок, чанки, accessors, геометрия)
// и, если установлен, python pygltflib. Ориентация: начало — середина линии примыкания на земле,
// пандус уходит по +Z, ось Y вверх, А (hl) слева при взгляде на ступень (X < 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../src/ramp.js";
import { createAR } from "../src/ar.js";

const ar = createAR();

function parseGLB(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546C67, "magic glTF");
  assert.equal(dv.getUint32(4, true), 2, "версия 2");
  assert.equal(dv.getUint32(8, true), u8.byteLength, "длина в заголовке");
  const jl = dv.getUint32(12, true);
  assert.equal(dv.getUint32(16, true), 0x4E4F534A, "первый чанк JSON");
  assert.equal(jl % 4, 0, "JSON-чанк выровнен на 4");
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const bo = 20 + jl;
  const bl = dv.getUint32(bo, true);
  assert.equal(dv.getUint32(bo + 4, true), 0x004E4942, "второй чанк BIN");
  assert.equal(bl % 4, 0, "BIN-чанк выровнен на 4");
  assert.equal(bo + 8 + bl, u8.byteLength, "после BIN ничего нет");
  const bin = u8.subarray(bo + 8, bo + 8 + bl);
  assert.equal(json.buffers.length, 1);
  assert.ok(json.buffers[0].byteLength <= bl && bl - json.buffers[0].byteLength < 4, "byteLength буфера");
  const read = (ai) => {
    const a = json.accessors[ai], v = json.bufferViews[a.bufferView];
    assert.equal(v.byteOffset % 4, 0, "bufferView выровнен");
    assert.ok(v.byteOffset + v.byteLength <= json.buffers[0].byteLength, "bufferView внутри буфера");
    const n = a.count * ({ VEC3: 3, VEC2: 2 }[a.type] || 1);
    const T = a.componentType === 5126 ? Float32Array : a.componentType === 5123 ? Uint16Array : null;
    assert.ok(T, "тип компонента");
    assert.equal(v.byteLength, n * T.BYTES_PER_ELEMENT);
    return new T(bin.buffer.slice(bin.byteOffset + v.byteOffset, bin.byteOffset + v.byteOffset + v.byteLength));
  };
  return { json, read };
}

// Все треугольники в метрах, glTF, по деталям
function triangles(glb) {
  const { json, read } = parseGLB(glb);
  const out = [];
  json.meshes.forEach((m) => {
    const pr = m.primitives[0];
    const pos = read(pr.attributes.POSITION), nor = read(pr.attributes.NORMAL), idx = read(pr.indices);
    const tris = [];
    for (let i = 0; i < idx.length; i += 3) {
      const P = [0, 1, 2].map((k) => [...pos.subarray(idx[i + k] * 3, idx[i + k] * 3 + 3)]);
      tris.push({ P, n: [...nor.subarray(idx[i] * 3, idx[i] * 3 + 3)] });
    }
    out.push({ name: m.name, material: pr.material, tris });
  });
  return { json, parts: out };
}

const CASES = [{ hl: 85, hr: 70 }, { hl: 98, hr: 98 }, { hl: 70, hr: 85 }, { hl: 250, hr: 250 }, { hl: 240, hr: 190, width: 1000 }];

for (const c of CASES) {
  test(`GLB ${c.hl}/${c.hr}: формат, accessors min/max, размер`, () => {
    const m = build(c), glb = ar.toGLB(m, null);
    assert.ok(glb.byteLength < 200 * 1024, `размер ${glb.byteLength}`);
    const { json, read } = parseGLB(glb);
    assert.equal(json.asset.version, "2.0");
    assert.equal(json.meshes.length, m.parts.length);
    for (const [ai, a] of json.accessors.entries()) {
      const data = read(ai);
      if (!a.min) continue;
      const k = a.type === "VEC3" ? 3 : 1;
      for (let j = 0; j < k; j++) {
        let lo = Infinity, hi = -Infinity;
        for (let i = j; i < data.length; i += k) { lo = Math.min(lo, data[i]); hi = Math.max(hi, data[i]); }
        assert.equal(a.min[j], lo); assert.equal(a.max[j], hi);
      }
    }
    for (const mesh of json.meshes) {
      const pr = mesh.primitives[0];
      assert.equal(json.accessors[pr.attributes.POSITION].min.length, 3, "POSITION с min/max");
      assert.ok(json.accessors[pr.indices].max[0] < json.accessors[pr.attributes.POSITION].count);
    }
  });

  test(`GLB ${c.hl}/${c.hr}: начало координат, ось Y вверх, А слева, пандус по +Z`, () => {
    const m = build(c), p = m.params, { parts } = triangles(ar.toGLB(m, null));
    const all = parts.flatMap((q) => q.tris.flatMap((t) => t.P));
    const ext = (k, f) => f(...all.map((v) => v[k]));
    const W = p.width / 1000, eps = 1e-5;
    assert.ok(Math.abs(ext(0, Math.min) + W / 2) < eps && Math.abs(ext(0, Math.max) - W / 2) < eps, "по X от −W/2 до W/2");
    assert.ok(Math.abs(ext(2, Math.min)) < eps, "ничего не заходит за линию примыкания (Z < 0)");
    assert.ok(Math.abs(ext(2, Math.max) - m.dims.totalLen / 1000) < 0.0015, "длина по Z = totalLen");
    // земля под серединой линии примыкания на высоте 0; при перекосе слева ниже на (hl − hr)/2
    const g = (p.hl - p.hr) / 2000;
    const lowAt = (x) => Math.min(...all.filter((v) => Math.abs(v[0] - x) < eps).map((v) => v[1]));
    assert.ok(Math.abs(lowAt(-W / 2) + g) < eps, "земля слева");
    assert.ok(Math.abs(lowAt(W / 2) - g) < eps, "земля справа");
    // верх настила у порога: слева над землёй ≈ А, справа ≈ Б (настил 18 мм, срез вертикальный/по нормали)
    const ply = parts.find((q) => q.name.startsWith("Настил")).tris.flatMap((t) => t.P);
    const topAt = (x) => Math.max(...ply.filter((v) => Math.abs(v[0] - x) < eps && v[2] < 0.02).map((v) => v[1]));
    assert.ok(Math.abs(topAt(-W / 2) - (-g) - p.hl / 1000) < 0.003, `верх слева ${topAt(-W / 2)}`);
    assert.ok(Math.abs(topAt(W / 2) - g - p.hr / 1000) < 0.003, `верх справа ${topAt(W / 2)}`);
    // высокий край у начала: дальше по +Z настил только опускается
    const far = Math.max(...ply.filter((v) => v[2] > m.dims.totalLen / 1000 - 0.03).map((v) => v[1]));
    assert.ok(far < Math.min(p.hl, p.hr) / 1000 * 0.5, "у дальнего конца низко");
  });

  test(`GLB ${c.hl}/${c.hr}: нормали единичные, наружу, детали замкнуты`, () => {
    const { parts } = triangles(ar.toGLB(build(c), null));
    for (const q of parts) {
      const edges = new Map(), key = (v) => v.map((x) => x.toFixed(6)).join(",");
      for (const { P: [a, b, d], n } of q.tris) {
        assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, "нормаль единичная");
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        assert.ok(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0, `${q.name}: обход против часовой к нормали`);
        for (const [s, e] of [[a, b], [b, d], [d, a]]) { const k = key(s) + ">" + key(e); edges.set(k, (edges.get(k) || 0) + 1); }
      }
      for (const [k, cnt] of edges) {
        const [s, e] = k.split(">");
        assert.equal(cnt, 1, `${q.name}: ребро дважды в одну сторону`);
        assert.ok(edges.has(e + ">" + s), `${q.name}: деталь не замкнута или грани вывернуты`);
      }
    }
  });
}

test("материалы: берёза и сосна без покраски, краска на всех деталях, линейный цвет", () => {
  const m = build({ hl: 85, hr: 70 });
  const raw = parseGLB(ar.toGLB(m, null)).json;
  assert.equal(raw.materials.length, 2);
  const c = (h) => ((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))(h / 255);
  assert.ok(Math.abs(raw.materials[0].pbrMetallicRoughness.baseColorFactor[0] - c(0xD9)) < 1e-4, "берёза #D9B98A");
  assert.ok(Math.abs(raw.materials[1].pbrMetallicRoughness.baseColorFactor[2] - c(0x6A)) < 1e-4, "сосна #C9A06A");
  assert.equal(raw.materials[0].pbrMetallicRoughness.roughnessFactor, 0.75);
  assert.equal(raw.materials[0].pbrMetallicRoughness.metallicFactor, 0);
  const ply = raw.meshes.find((x) => x.name.startsWith("Настил"));
  assert.equal(ply.primitives[0].material, 0);
  assert.ok(raw.meshes.filter((x) => x !== ply).every((x) => x.primitives[0].material === 1));
  const painted = parseGLB(ar.toGLB(m, "#102c54")).json;
  for (const mat of painted.materials.slice(0, 2)) assert.deepEqual(mat.pbrMetallicRoughness.baseColorFactor.slice(0, 3).map((v) => +v.toFixed(4)), [c(0x10), c(0x2C), c(0x54)].map((v) => +v.toFixed(4)));
  assert.throws(() => ar.toGLB(m, "синий"));
});

test("размер GLB для 85/70 меньше 200 КБ", () => {
  const n = ar.toGLB(build({ hl: 85, hr: 70 }), null).byteLength;
  assert.ok(n < 200 * 1024, String(n));
});

test("supported() вне браузера не падает и объясняет причину", () => {
  const s = ar.supported();
  assert.equal(s.webxr || s.sceneViewer || s.quickLook, false);
  assert.ok(s.reason && s.message.includes("AR открывается на телефоне"));
});

test("ar.js: одно объявление верхнего уровня, без import (файлы склеиваются)", () => {
  const src = readFileSync(new URL("../src/ar.js", import.meta.url), "utf8");
  const top = src.split("\n").filter((l) => /^(export\s+)?(function|const|let|var|class|async)\b/.test(l));
  assert.deepEqual(top, ["export function createAR() {"]);
  assert.ok(!/^import\s/m.test(src));
});

test("GLB разбирается python pygltflib (если установлен)", (t) => {
  const glb = ar.toGLB(build({ hl: 85, hr: 70 }), "#102C54");
  const f = join(mkdtempSync(join(tmpdir(), "glb-")), "r.glb");
  writeFileSync(f, glb);
  const py = "import sys,pygltflib;g=pygltflib.GLTF2().load_binary(sys.argv[1]);b=g.binary_blob();" +
    "assert g.asset.version=='2.0';assert len(b)>=g.buffers[0].byteLength;print(len(g.meshes),len(g.materials),g.nodes[0].name)";
  let out;
  try { out = execFileSync("python3", ["-I", "-c", py, f], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim(); }
  catch (e) {
    if (e.code === "ENOENT" || /No module named/.test(String(e.stderr))) return t.skip("pygltflib не установлен");
    throw e;
  }
  assert.equal(out, "5 3 Пандус", "4 детали + надпись; 2 материала + трафарет");
});

// Надпись goapsny.org (Алхас, 2026-11-05): на верхней поверхности настила, вдоль ската снизу вверх, у края А
test("надпись goapsny.org: только на окрашенном, на верхе настила у края А, вдоль ската", () => {
  for (const c of [{ hl: 85, hr: 70 }, { hl: 98, hr: 98 }, { hl: 240, hr: 190, width: 1000 }]) {
    const m = build(c), W = m.params.width / 1000;
    assert.ok(!parseGLB(ar.toGLB(m, null)).json.meshes.some((x) => x.name.includes("goapsny")), "без покраски надписи нет");
    const glb = ar.toGLB(m, "#102C54"), { json, read } = parseGLB(glb);
    const mesh = json.meshes.find((x) => x.name.includes("goapsny"));
    assert.ok(mesh, "есть меш надписи");
    const pr = mesh.primitives[0], mat = json.materials[pr.material];
    assert.equal(mat.alphaMode, "MASK");
    assert.equal(json.images[0].mimeType, "image/png");
    const img = json.bufferViews[json.images[0].bufferView];
    const bin = glb.subarray(20 + new DataView(glb.buffer).getUint32(12, true) + 8);
    assert.deepEqual([...bin.subarray(img.byteOffset, img.byteOffset + 8)], [137, 80, 78, 71, 13, 10, 26, 10], "PNG-подпись");
    const pos = read(pr.attributes.POSITION), nor = read(pr.attributes.NORMAL), uv = read(pr.attributes.TEXCOORD_0);
    assert.equal(uv.length, 8);
    const P = [0, 1, 2, 3].map((i) => [...pos.subarray(i * 3, i * 3 + 3)]);
    // у края А: X < 0, ближе к левому краю, внутри боковины не залезает (≥ 60 мм от края)
    for (const p of P) { assert.ok(p[0] < 0, "слева"); assert.ok(p[0] > -W / 2 + 0.06, "не на боковине"); }
    // строка идёт вдоль ската: начало (u=0) ниже и дальше от ступени, конец (u=1) выше и ближе
    assert.ok(P[0][2] > P[1][2] && P[0][1] < P[1][1], "снизу вверх по скату");
    // нормаль вверх и к человеку (+Z), над настилом на 1–3 мм
    const n = [...nor.subarray(0, 3)];
    assert.ok(n[1] > 0.9 && n[2] > 0, `нормаль ${n}`);
    const ply = parseGLB(glb).json.meshes.findIndex((x) => x.name.startsWith("Настил"));
    const { parts } = triangles(glb);
    const top = parts[ply].tris.filter((t) => t.n[1] > 0.9);
    const d = (p) => { const [a] = top[0].P; return (p[0] - a[0]) * top[0].n[0] + (p[1] - a[1]) * top[0].n[1] + (p[2] - a[2]) * top[0].n[2]; };
    for (const p of P) { const h = d(p) * 1000; assert.ok(h > 0.5 && h < 3, `над настилом ${h} мм`); }
  }
});

test("GLB с надписью проходит Khronos glTF-Validator без ошибок (если установлен)", async (t) => {
  let v;
  try { v = (await import("gltf-validator")).default; } catch { return t.skip("gltf-validator не установлен"); }
  const r = await v.validateBytes(ar.toGLB(build({ hl: 85, hr: 70 }), "#102C54"));
  assert.equal(r.issues.numErrors, 0, JSON.stringify(r.issues.messages.slice(0, 3)));
  assert.equal(r.issues.numWarnings, 0, JSON.stringify(r.issues.messages.slice(0, 3)));
});
