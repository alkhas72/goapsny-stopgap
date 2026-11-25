import test from "node:test";
import assert from "node:assert/strict";
import handler, { validate, requestNumber, buildPackage, createWorkPackage, configFromEnv } from "../api/intake.js";

const REQ = {
  v: 1, type: "ramp-request", uuid: "3f2b8c1e-1111-4222-8333-444455556666", submittedAt: "2026-11-25T10:00:00Z",
  roleText: "Сотрудник", measurer: { name: "Тест", contact: "+7 940 000" },
  object: { name: "Тестовая аптека", address: "Сухум, ул. Тестовая 1", place_id: null },
  measure: { hl: 120, hr: 95, width: 900, freeWidth: 850 },
  paint: { hex: "#102C54", ral: "RAL 5026", name: "x" },
  result: { kind: "straight", slope: 6, totalLen: 700, rib: false, issues: [{ level: "info", text: "ок" }] },
  photoCount: 4,
};
const mkRes = () => { const r = { h: {}, setHeader(k, v) { r.h[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };

test("номер заявки стабилен и зависит от uuid и месяца", () => {
  assert.equal(requestNumber(REQ), "RMP-2611-3F2B8C");
  assert.equal(requestNumber(REQ), requestNumber({ ...REQ }));
});

test("validate: пропускает полную заявку и отклоняет неполные", () => {
  assert.equal(validate(REQ), null);
  assert.ok(validate(null));
  assert.ok(validate({ ...REQ, type: "x" }));
  assert.ok(validate({ ...REQ, uuid: "abc" }));
  assert.ok(validate({ ...REQ, measure: { hl: "x", hr: 1, width: 1 } }));
  assert.ok(validate({ ...REQ, measurer: { name: "a", contact: "" } }));
  assert.ok(validate({ ...REQ, object: { name: "a", address: "" } }));
});

test("buildPackage: тема и описание содержат номер и замер", () => {
  const p = buildPackage(REQ, "RMP-2611-3F2B8C");
  assert.match(p.subject, /RMP-2611-3F2B8C/);
  assert.match(p.description.raw, /А 120, Б 95, ширина 900/);
});

test("createWorkPackage: шлёт POST в OpenProject с проектом и типом, ключ в Basic", async () => {
  let call;
  const f = async (url, init) => { call = { url, init }; return { ok: true, json: async () => ({ id: 77 }) }; };
  const out = await createWorkPackage(REQ, { url: "https://pro.example/", token: "T", project: "3", type: "1" }, f);
  assert.equal(out.workPackage, 77);
  assert.equal(call.url, "https://pro.example/api/v3/work_packages");
  assert.equal(JSON.parse(call.init.body)._links.project.href, "/api/v3/projects/3");
  assert.equal(call.init.headers.Authorization, "Basic " + Buffer.from("apikey:T").toString("base64"));
});

test("createWorkPackage: ошибка AISPro поднимается наверх", async () => {
  await assert.rejects(createWorkPackage(REQ, { url: "u", token: "T", project: "3", type: "1" }, async () => ({ ok: false, status: 500 })));
});

test("handler: GET 405, плохая заявка 400, без настройки 503", async () => {
  const saved = { ...process.env };
  for (const k of ["OPENPROJECT_URL", "OPENPROJECT_TOKEN", "OPENPROJECT_PROJECT"]) delete process.env[k];
  let r = mkRes(); await handler({ method: "GET" }, r); assert.equal(r.code, 405);
  r = mkRes(); await handler({ method: "POST", body: { v: 1 } }, r); assert.equal(r.code, 400);
  r = mkRes(); await handler({ method: "POST", body: REQ }, r); assert.equal(r.code, 503);
  assert.equal(configFromEnv({}), null);
  Object.assign(process.env, saved);
});
