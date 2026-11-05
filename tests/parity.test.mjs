// Сверка JS-формулы с моделью build123d (cad/). Ожидаемые числа сняты с модели: tests/expected.json.
// Запуск: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "../src/ramp.js";

const exp = JSON.parse(readFileSync(new URL("./expected.json", import.meta.url)));

for (const [h, e] of Object.entries(exp.flat)) {
  test(`ровный порог ${h}`, () => {
    const d = build({ hl: +h, hr: +h }).dims;
    assert.deepEqual([d.ply.width, d.ply.length], e.ply);
    assert.deepEqual([d.left.height, d.left.ground], e.side);
    assert.deepEqual(d.rib && [d.rib.height, d.rib.ground], e.rib);
    assert.deepEqual([d.rear.length, d.rear.left], e.rear);
    assert.equal(d.rear.bevel, e.bevel);
    assert.equal(d.totalLen, e.total_len);
  });
}

for (const [k, e] of Object.entries(exp.skew)) {
  test(`перекос ${k}`, () => {
    const [hl, hr] = k.split("/").map(Number);
    const d = build({ hl, hr }).dims;
    assert.deepEqual([d.left.height, d.left.ground], e.left);
    assert.deepEqual([d.right.height, d.right.ground], e.right);
    assert.deepEqual([d.rear.length, d.rear.left, d.rear.right], e.rear);
    assert.deepEqual({ back: d.ply.width, left: d.ply.left, right: d.ply.right, front: d.ply.front }, e.ply);
    assert.equal(d.slope, e.slope);
  });
}

test("ребро: 200 мм нет, 201 мм есть (ТЗ п. 2)", () => {
  assert.equal(build({ hl: 200, hr: 200 }).dims.rib, null);
  assert.ok(build({ hl: 201, hr: 201 }).dims.rib);
});

test("без свободной ширины замер неполный", () => {
  assert.ok(build({ hl: 85, hr: 70 }).issues.some((i) => i.text.startsWith("Замер неполный")));
  assert.ok(build({ hl: 85, hr: 70, freeWidth: 845 }).issues.some((i) => i.level === "error"));
});
