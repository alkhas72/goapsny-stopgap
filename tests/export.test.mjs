// ZIP без сжатия: контрольная сумма и разбор стандартным распаковщиком (python zipfile).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExport } from "../src/export.js";

const ex = createExport();

test("crc32 по эталону", () => {
  assert.equal(ex.crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
});

test("zip читается стандартным распаковщиком, кириллица в имени", () => {
  const z = ex.zip([{ name: "пандус-85-70.svg", data: "<svg/>" }, { name: "pandus.dxf", data: "0\nEOF\n" }]);
  const f = join(mkdtempSync(join(tmpdir(), "zip-")), "t.zip");
  writeFileSync(f, z);
  let out;
  try { out = execFileSync("python3", ["-I", "-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('|'.join(n+'='+z.read(n).decode() for n in z.namelist()))", f]).toString().trim(); }
  catch (e) { if (e.code === "ENOENT") return; throw e; }
  assert.equal(out, "пандус-85-70.svg=<svg/>|pandus.dxf=0\nEOF");
});
