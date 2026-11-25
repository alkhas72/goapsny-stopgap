// Приёмник заявок на приставной пандус: заявка из мастера «Новый замер» → рабочий пакет в AISPro (OpenProject).
// POST /api/intake, тело — JSON заявки из src/intake.js buildRequest(). Ответ: { number }.
// Личные данные заявителя уходят только в пакет AISPro; в публичные источники ничего не пишется.
// Настройки в переменных окружения (секретов в репозитории нет):
//   OPENPROJECT_URL      например https://pro.abhazia.org
//   OPENPROJECT_TOKEN    ключ API пользователя интеграции
//   OPENPROJECT_PROJECT  id или identifier проекта (для проверки — ais-bridge-test)
//   OPENPROJECT_TYPE     id типа пакета, по умолчанию 1 («Задача»)
// Без настройки функция отвечает 503 и ничего не принимает: молчаливой потери заявок нет.

const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestNumber(req) {
  const t = new Date(req.submittedAt || req.createdAt || Date.now());
  const ym = String(t.getUTCFullYear()).slice(2) + String(t.getUTCMonth() + 1).padStart(2, "0");
  return `RMP-${ym}-${req.uuid.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function validate(req) {
  if (!req || typeof req !== "object") return "Пустая заявка";
  if (req.type !== "ramp-request" || req.v !== 1) return "Неизвестный вид заявки";
  if (!UUID.test(String(req.uuid || ""))) return "Нет номера заявки (uuid)";
  const m = req.measure || {};
  for (const k of ["hl", "hr", "width"]) {
    if (!Number.isFinite(Number(m[k]))) return `Нет числа замера: ${k}`;
  }
  if (!clip(req.object?.address, 400) && !req.object?.geo) return "Нужен адрес или точка объекта";
  if (!clip(req.measurer?.contact, 200)) return "Нужен контакт заявителя";
  return null;
}

export function buildPackage(req, number) {
  const o = req.object || {}, me = req.measurer || {}, m = req.measure || {}, r = req.result || {};
  const geo = o.geo ? `${o.geo.lat}, ${o.geo.lng}` : "";
  const issues = (r.issues || []).map((i) => `- ${i.level}: ${clip(i.text, 300)}`).join("\n");
  const lines = [
    `**Номер заявки:** ${number}`,
    `**Заявитель:** ${clip(me.name, 200)} (${clip(req.roleText, 120)}), ${clip(me.contact, 200)}`,
    `**Объект:** ${clip(o.name, 300)}, ${clip(o.address, 400)}${o.entrance ? `, вход: ${clip(o.entrance, 200)}` : ""}`,
    geo ? `**Точка:** ${geo}` : "",
    o.place_id ? `**Место на карте GoApsny:** ${o.place_id}` : "",
    `**Замер, мм:** А ${m.hl}, Б ${m.hr}, ширина ${m.width}, свободная ширина ${m.freeWidth ?? "—"}`,
    `**Расчёт:** тип ${r.kind ?? "—"}, уклон ${r.slope ?? "—"}, длина ${r.totalLen ?? "—"}${r.rib ? ", с ребром" : ""}`,
    `**Покраска:** ${req.paint?.ral || ""} ${req.paint?.name || ""} ${req.paint?.hex || ""}`.trim(),
    issues ? `**Замечания расчёта:**\n${issues}` : "",
    req.comment ? `**Комментарий:** ${clip(req.comment, 4000)}` : "",
    `**Снимков в заявке:** ${req.photoCount ?? 0}`,
    `Заявка № ${number} получена от мастера замера, код заявки ${req.uuid}.`,
  ].filter(Boolean);
  return {
    subject: `Пандус ${number}: ${clip(o.name || o.address, 120)}`,
    description: { format: "markdown", raw: lines.join("\n\n") },
  };
}

export async function createWorkPackage(req, cfg, fetchImpl = fetch) {
  const number = requestNumber(req);
  const pkg = buildPackage(req, number);
  const base = cfg.url.replace(/\/$/, "");
  const body = {
    ...pkg,
    _links: {
      project: { href: `/api/v3/projects/${cfg.project}` },
      type: { href: `/api/v3/types/${cfg.type}` },
    },
  };
  const r = await fetchImpl(`${base}/api/v3/work_packages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`apikey:${cfg.token}`).toString("base64"),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`AISPro ответил ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return { number, workPackage: j.id ?? null };
}

export function configFromEnv(env = process.env) {
  if (!env.OPENPROJECT_URL || !env.OPENPROJECT_TOKEN || !env.OPENPROJECT_PROJECT) return null;
  return { url: env.OPENPROJECT_URL, token: env.OPENPROJECT_TOKEN, project: env.OPENPROJECT_PROJECT, type: env.OPENPROJECT_TYPE || "1" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Только POST" }); }
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const bad = validate(body);
  if (bad) return res.status(400).json({ error: bad });
  const cfg = configFromEnv();
  if (!cfg) return res.status(503).json({ error: "Приём заявок не настроен" });
  try {
    const out = await createWorkPackage(body, cfg);
    return res.status(201).json({ number: out.number });
  } catch {
    return res.status(502).json({ error: "Не удалось передать заявку, попробуйте позже" });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
