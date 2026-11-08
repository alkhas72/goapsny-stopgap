import { build, validate, DEFAULTS, MAX_H, PLY, RIB_OVER, PARAMS_VERSION } from "./ramp.js";
import { createPaints } from "./paints.js";
import { createPdf } from "./pdf.js";
// «Новый замер»: пошаговая анкета замерщика (заявка на пандус) с фото или видео и помощником Claude.
// createIntake() без DOM отдаёт чистые функции (их проверяет tests/intake.test.mjs),
// createIntake().mount(root, handlers) строит мастер поверх конструктора; 3D остаётся прежней сценой.
// Помощник — возможность sample (window.claude.use), заявки — db, личность — user, файл — downloads.
// Каждая возможность может прийти null: мастер работает и без них. Единственное объявление верхнего уровня.
export function createIntake() {
  // ---------- все тексты для людей: правятся здесь ----------
  const T = {
    entry: "Новый замер",
    close: "К конструктору",
    closeAria: "Закрыть замер и вернуться к конструктору. Черновик сохранится",
    stepOf: (i, n) => `Шаг ${i} из ${n}`,
    progAria: "Шаги замера",
    back: "Назад", next: "Далее", toSend: "К отправке",
    optional: "необязательно", required: "обязательно",
    mm: "мм",
    resume: {
      title: "Продолжить замер?",
      text: (obj, step) => `Есть черновик${obj ? ` «${obj}»` : ""}: остановились на шаге ${step}. Фото и числа сохранены на этом устройстве.`,
      cont: "Продолжить", fresh: "Начать заново",
      freshConfirm: "Удалить черновик и его фото и начать заново?",
    },
    roles: [
      { v: "staff", t: "Сотрудник учреждения" },
      { v: "auditor", t: "Аудитор сообщества" },
      { v: "other", t: "Другое" },
    ],
    steps: {
      // Сценарий съёмки (Алхас, 2026-11-08): замер строится вокруг серии фото. Минимум 4 снимка —
      // высота А, высота Б, отмеренная ширина, общий план; потом необязательно — другие места для пандуса.
      // Тексты — только то, что помогает замеру (Алхас, 2026-11-08: «никакой избыточной информации»).
      who: { short: "Кто и где", title: "Кто и где", lead: "" },
      hl: { short: "Высота А", title: "Высота слева", lead: "Рулетка вертикально у левого края, вплотную к ступени.", label: "Высота А", sub: "от земли до верха ступени", media: "Фото рулетки у точки А", shot: "Снимите рулетку слева" },
      hr: { short: "Высота Б", title: "Высота справа", lead: "То же у правого края, в той же линии.", label: "Высота Б", sub: "от земли до верха ступени", media: "Фото рулетки у точки Б", shot: "Снимите рулетку справа" },
      free: { short: "Ширина", title: "Ширина", lead: "Рулетка вдоль ступени от А до Б: обычно 90 см, в узком проёме 80–85.", label: "Свободная ширина", sub: "между выступами, у ступени", media: "Фото отмеренной ширины", shot: "Снимите рулетку вдоль ступени" },
      width: { short: "Ширина", title: "Ширина пандуса", lead: "", label: "Ширина пандуса", sub: "900 мм или меньше" },
      overview: { short: "Общий план", title: "Общий план", lead: "Отойдите на 3–4 м и снимите вход целиком.", media: "Фото общего плана", shot: "Снимите вход целиком" },
      extra: { short: "Ещё места", title: "Где ещё нужен пандус", lead: "Необязательно. Подиум, туалет, порог внутри: снимите, если есть.", media: "Другие места", shot: "Снимите ступень или порог", note: "Что на снимках", notePh: "Подиум у сцены 25 см, порог в туалет…" },
      check: { short: "Пандус", title: "Ваш пандус", lead: "" },
      fit: { short: "Примерка", title: "Примерка", lead: "Выберите цвет, поставьте пандус к ступени в AR и сохраните снимок экрана.", media: "Снимок примерки", shot: "Добавьте снимок экрана из AR", gallery: true },
      send: { short: "Отправка", title: "Отправка", lead: "" },
    },
    distAB: (w) => `Расстояние между точками А и Б — ${w} мм, это ширина пандуса.`,
    abNote: "Точки А и Б — края будущего пандуса, обычно в 90 см друг от друга.",
    narrow: "Мерьте по краям пандуса, не на узкой базе 30–50 см.",
    asIs: "Введите число как есть, без округления. Можно с запятой: 87,5.",
    fitFree: (fw) => `Взять по свободной ширине: ${fw} мм`,
    fitDone: (fw) => `Ширина равна свободной: ${fw} мм`,
    hrSameNote: "Пока высота Б не введена, 3D показывает ровный порог высотой А.",
    tooHighNote: "Заявку всё равно можно отправить: замер пригодится мастерской.",
    fields: {
      role: "Кто вы", roleOther: "Кто именно", name: "Имя и фамилия", contact: "Телефон или другой контакт",
      object: "Учреждение или объект", address: "Адрес", entrance: "Какой вход", comment: "Комментарий",
    },
    ph: {
      roleOther: "например, родственник", name: "Как к вам обращаться", contact: "+7 940 …, Telegram, почта",
      object: "Школа № 3, поликлиника…", address: "Город, улица, дом", entrance: "главный, со двора…",
      comment: "Ступень сколота, рядом люк…", number: "как на рулетке",
    },
    need: {
      role: "Выберите, кто вы.", name: "Впишите имя.", object: "Впишите учреждение или объект.", address: "Впишите адрес.",
      overview: "Снимите вход целиком.", photo: "Сначала снимите рулетку.", free: "Введите свободную ширину: без неё замер неполный.",
      number: "Это не число. Только цифры и запятая, например 845,5.", positive: "Число должно быть больше нуля.",
      hl: "Введите высоту А.", hr: "Введите высоту Б.",
    },
    media: {
      photo: "Сделать фото", video: "Снять видео", gallery: "Галерея",
      toVideo: "Снять видео вместо фото", toPhoto: "Сделать фото вместо видео",
      remove: "Удалить снимок", frame: (t) => `кадр ${t} с`, frames: "Кадры из видео",
      busyPhoto: "Обрабатываю фото…", busyVideo: "Достаю кадры из видео…",
      maxPhotos: (n) => `Не больше ${n} фото на шаг. Удалите лишнее, чтобы добавить новое.`,
      tapShot: "Нажмите, чтобы снять", more: "Ещё фото", count: (n, m) => `${n} из ${m}`,
      badPhoto: "Это фото не открылось. Попробуйте другое.",
      badVideo: "Это видео браузер не может открыть (формат или кодек). Сделайте фото: режим переключён на «Фото».",
      videoHints: {
        overview: "Медленно обведите камерой вход: дверь, ступень, место пандуса. 5–10 секунд.",
        free: "Ведите камеру вдоль рулетки от одного выступа до другого, в линии примыкания.",
        hl: "Покажите рулетку у левого края (А), затем пройдитесь камерой к правому краю (Б) вдоль линии примыкания.",
        hr: "Покажите рулетку у правого края (Б), затем пройдитесь камерой к левому краю (А) вдоль линии примыкания.",
      },
      noSlot: "На этом шаге снимать не нужно.",
    },
    check: {
      type: "Тип", flat: "Ровный порог", skew: "Перекос порога", diff: (a, b, d) => `А ${a} · Б ${b} · разница ${d} мм`,
      width: "Ширина пандуса", free: "Свободная ширина", ground: "Длина по земле", slope: "Уклон настила",
      rib: "Ребро", ribYes: (h) => `есть · высота ${h} мм`, ribNo: `нет · порог до ${RIB_OVER} мм`,
      total: "Общая длина", board: "Доска боковин", boardNote: "как в конструкторе",
      ok: "Замер полный · пандус помещается в свободную ширину",
      see3dPhone: "3D-модель вверху показывает этот пандус.", see3dDesk: "3D-модель рядом показывает этот пандус.",
    },
    send: {
      who: "Кто меряет", obj: "Объект", measure: "Замер", edit: "Изменить", photos: "Снимков",
      submit: "Отправить заявку", sending: "Отправляю…",
      okTitle: "Заявка отправлена", okText: (id) => `Номер заявки: ${id}.`,
      photosSaved: (n, m) => `Снимков сохранено с заявкой: ${n} из ${m}.`,
      photosLocal: "Снимки не поместились в хранилище: они есть в файле заявки.",
      localTitle: "Заявка сохранена на этом устройстве",
      localText: (id) => `Номер: ${id}. Скачайте файл заявки и передайте его в АИС.`,
      why: { nodb: "Хранилище заявок здесь недоступно.", noid: "Не удалось узнать вашу учётную запись: войдите в Claude, чтобы отправлять заявки.", timeout: "Хранилище не ответило за 10 секунд.", error: "Хранилище отклонило заявку." },
      download: "Скачать заявку PDF", making: "Готовлю PDF…", pdfFail: "PDF не собрался: нет связи с сервером библиотеки. Попробуйте ещё раз.", downloaded: "Файл заявки сохранён.", declined: "Сохранение отменено.", noDownload: "Скачивание здесь недоступно.",
      again: "Новый замер", toApp: "К конструктору",
    },
    paint: {
      title: "Покраска OSOKA", aria: "Цвет покраски", row: "Покраска",
      rawName: "Без покраски", rawSub: "фанера и сосна без покрытия",
      note: "Цвет на экране приблизительный.",
    },
    ar: {
      open: "Примерить в AR",
      blocked: "Браузер не открыл новую вкладку. Откройте ссылку вручную:",
    },
    ai: {
      // Голос — главный способ общения (Алхас, 2026-11-08): наговорить, а не вбивать; сказанное записывается в заявку
      name: "Помощник", aria: "Помощник: голосом", open: "Сказать помощнику голосом", close: "Закрыть",
      // приглашение на каждом шаге (Алхас, 2026-11-08: помощник явно виден и зовёт говорить голосом)
      invite: {
        hl: "Говорите голосом: что видите у ступени", hr: "Говорите голосом: что видите у ступени",
        free: "Скажите, что мешает: наличник, труба, перила", overview: "Опишите вход голосом",
        extra: "Расскажите, где ещё нужен пандус", check: "Спросите или уточните голосом",
        fit: "Скажите, какой цвет выбрало заведение", who: "Скажите, что важно знать мастерской", send: "Добавьте голосом, что важно мастерской",
      },
      placeholder: "Скажите или напишите",
      listen: "Слушаю…", tapMic: "Нажмите и говорите", kbd: "Нажмите микрофон на клавиатуре и говорите.",
      micOn: "Начать диктовку", micOff: "Остановить диктовку",
      saved: "Записано в заявку.",
      send: "Отправить", stop: "Остановить ответ",
      thinking: "Думаю…", stopped: "Ответ остановлен.", truncated: "Ответ оборван: спросите короче.",
      off: {
        none: "",
        not_granted: "",
        disabled: "",
      },
      noImages: "Снимки здесь не проверить.",
      err: {
        rate_limited: "Слишком много вопросов подряд. Подождите минуту и спросите снова.",
        session_expired: "Нужно снова войти в Claude.",
        image_rejected: "Снимок не подошёл помощнику. Снимите ещё раз.",
        refused: "Помощник не ответил на этот вопрос. Спросите иначе.",
        prompt_too_large: "Слишком длинный разговор. Начните вопрос заново.",
        empty: "Помощник ничего не ответил. Спросите иначе.",
        other: "Связь прервалась. Попробуйте ещё раз.",
      },
      suggest: (v, field) => `Взять ${v} мм ${field}?`,
      taken: (v) => `Взято: ${v} мм`,
      fieldFor: { freeWidth: "для свободной ширины", width: "для ширины пандуса", hl: "для высоты А", hr: "для высоты Б" },
      needMedia: "Сначала снимите фото или видео на этом шаге.",
      quick: {
        overview: [["check", "Проверь фото"]],
        free: [["read", "Прочитай число"], ["check", "Проверь фото"]],
        extra: [["check", "Проверь фото"]],
        hl: [["read", "Прочитай число"], ["check", "Проверь фото"]],
        hr: [["read", "Прочитай число"], ["check", "Проверь фото"]],
        fit: [["check", "Проверь снимок"]],
        check: [["issues", "Что не так?"]],
      },
      checkVideo: "Проверь кадры",
      ask: {
        check: "Проверь снимки этого шага: рулетка стоит в линии примыкания к ступени? Число читается? Это нужный край?",
        read: "Прочитай значение на рулетке на снимках этого шага. Если читается ясно, предложи число.",
        issues: "Объясни замечания к замеру и что исправить.",
      },
      tips: {
        who: "Укажите, кто меряет, и точный адрес объекта. Имя и контакт видят только владелец и редакторы страницы.",
        overview: "Отойдите на 3–4 метра и снимите вход целиком: дверь, ступень и площадку, где встанет пандус.",
        free: "Рулетку держите ровно у ступени, там, где пандус встанет вплотную. Мерьте между выступами: наличники, трубы, перила. Ширина пандуса — 900 мм или свободная ширина, если она меньше.",
        width: "Ширина пандуса не больше свободной ширины. Обычно 900 мм; если свободно меньше, возьмите свободную ширину.",
        extra: "Снимайте всё, что мешает человеку на коляске дальше входа: подиумы, ступени внутри, туалет, узкие двери. Это необязательно.",
        hl: "Слева, на краю будущего пандуса, в линии примыкания: рулетка вертикально от земли до верха ступени. Не мерьте на узкой базе 30–50 см.",
        hr: "Справа, на другом краю пандуса, в той же линии. Между точками А и Б — ровно ширина пандуса.",
        check: "Посмотрите тип порога, уклон и ребро. Если число неверное, вернитесь к шагу и исправьте.",
        send: "Проверьте данные. В комментарий — всё, чего нет в полях.",
        fit: "Откройте AR, поставьте пандус вплотную к ступени, сделайте снимок экрана и добавьте его из галереи.",
      },
    },
  };

  // ---------- шаги ----------
  // Порядок — как снимает замерщик (Алхас, 2026-11-08): А, Б, ширина, общий план, «глубже»; кто и где — в конце
  const STEPS = ["hl", "hr", "free", "overview", "extra", "check", "fit", "who", "send"];
  const MEDIA_STEPS = ["hl", "hr", "free", "overview", "extra", "fit"];
  const PHOTO_REQUIRED = ["hl", "hr", "free", "overview"];   // программа-минимум: 4 снимка
  const MAX_PHOTOS = 3, MAX_EXTRA = 8;
  const maxPhotos = (step) => (step === "extra" ? MAX_EXTRA : MAX_PHOTOS);
  const FIELD_STEP = { freeWidth: "free", width: "free", hl: "hl", hr: "hr" };
  const DRAFT_KEY = "goapsny-stopgap:intake-draft:v2";
  const SENT_KEY = "goapsny-stopgap:intake-sent:v1";
  const DB_TIMEOUT = 10000;
  const DOC_LIMIT = 256 * 1024;
  const DB_MAX_PHOTOS = 20;
  const PHOTO_DOC_MAX = 180000;                // символов data URL на одну фото-запись (с запасом от 256 KiB)
  const AR_BASE = "https://goapsny-stopgap.vercel.app";   // страница AR с собственным выбором цвета
  const DB_PHOTO_PLAN = [{ max: 800, q: 0.7 }, { max: 800, q: 0.55 }, { max: 640, q: 0.5 }, { max: 480, q: 0.45 }];

  // ---------- чистые функции ----------
  // Ввод: запятая или точка, без округления. null — пусто, undefined — не число.
  function parseNum(s) {
    const t = String(s ?? "").trim().replace(/\s+/g, "").replace(",", ".");
    if (t === "") return null;
    if (!/^\d+(\.\d*)?$/.test(t)) return undefined;
    const x = Number(t.replace(/\.$/, ""));
    return Number.isFinite(x) ? x : undefined;
  }
  const num = (v) => (v == null || !Number.isFinite(+v) ? "" : String(+(+v).toFixed(4)).replace(".", ","));
  const defaultWidth = (fw) => Math.min(DEFAULTS.width, fw);

  // Размер для уменьшения: длинная сторона не больше max, без увеличения
  function fitSize(w, h, max) {
    if (!(w > 0 && h > 0 && max > 0)) return { w: 0, h: 0, s: 0 };
    const s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), s };
  }

  // Моменты для кадров из видео: n (4–6) равномерно, по серединам отрезков, не в самом конце
  function frameCount(duration) { return duration < 3 ? 4 : duration < 8 ? 5 : 6; }
  function frameTimes(duration, n) {
    if (!(duration > 0) || !Number.isFinite(duration)) return [];
    const k = Math.min(6, Math.max(4, n || frameCount(duration)));
    const ms = (x) => Math.round(x * 1000) / 1000;
    const end = ms(Math.max(0, duration - 0.05));
    return Array.from({ length: k }, (_, i) => Math.min(end, ms((i + 0.5) * duration / k)));
  }

  function newId(now = Date.now(), rnd = Math.random) {
    return "r" + now.toString(36) + Math.floor(rnd() * 36 ** 4).toString(36).padStart(4, "0");
  }
  function emptyDraft(now = new Date()) {
    return {
      v: 2, id: newId(now.getTime()), createdAt: now.toISOString(), updatedAt: now.toISOString(), step: 0, maxStep: 0, mode: "photo",
      role: "", roleOther: "", name: "", contact: "", object: "", address: "", entrance: "",
      free: "", width: "", hl: "", hr: "", comment: "", extraNote: "",
      media: { hl: [], hr: [], free: [], overview: [], extra: [], fit: [] }, chat: [], sent: null,
    };
  }
  const hasData = (d) => !!d && !d.sent && !!(d.role || d.name || d.object || d.address || d.free || d.hl || d.hr || MEDIA_STEPS.some((s) => d.media?.[s]?.length));

  // Числа замера из черновика (как введены), ширина по умолчанию — min(900, свободная)
  function values(d) {
    const fw = parseNum(d.free), w0 = parseNum(d.width), hl = parseNum(d.hl), hr = parseNum(d.hr);
    const freeWidth = fw > 0 ? fw : null;
    const width = w0 > 0 ? w0 : freeWidth != null ? defaultWidth(freeWidth) : null;
    return { freeWidth, width, hl: hl > 0 ? hl : null, hr: hr > 0 ? hr : null };
  }
  // Что передать в конструктор (тот же onParams): только введённое; без Б порог считается ровным по А
  function draftParams(d) {
    const v = values(d), p = {};
    if (v.freeWidth != null) p.freeWidth = v.freeWidth;
    if (v.width != null) p.width = v.width;
    if (v.hl != null) { p.hl = v.hl; p.hr = v.hr ?? v.hl; } else if (v.hr != null) p.hr = v.hr;
    return p;
  }

  // Можно ли дальше: { ok, reason, warn }. Тексты ошибок замера — из validate() (src/ramp.js)
  function stepCheck(id, d, mediaCount = 0) {
    const R = (reason, rule = false) => ({ ok: false, reason, warn: "", rule });
    const v = values(d);
    if (id === "who") {
      if (!d.role) return R(T.need.role);
      if (!d.name.trim()) return R(T.need.name);
      if (!d.object.trim()) return R(T.need.object);
      if (!d.address.trim()) return R(T.need.address);
    } else if (id === "overview") {
      if (mediaCount < 1) return R(T.need.overview);
    } else if (id === "free") {
      if (mediaCount < 1) return R(T.need.photo);
      const x = parseNum(d.free);
      if (x === null) return R(T.need.free);
      if (x === undefined) return R(T.need.number);
      if (!(x > 0)) return R(T.need.positive);
      if (parseNum(d.width) === undefined) return R(T.need.number);
      if (d.width.trim() && !(parseNum(d.width) > 0)) return R(T.need.positive);
      const err = validate({ ...DEFAULTS, freeWidth: v.freeWidth, width: v.width ?? 0 }).find((e) => e.level === "error");
      if (err) return R(err.text, true);
    } else if (id === "width") {
      if (parseNum(d.width) === undefined) return R(T.need.number);
      if (d.width.trim() && !(parseNum(d.width) > 0)) return R(T.need.positive);
      const err = validate({ ...DEFAULTS, freeWidth: v.freeWidth, width: v.width ?? 0 }).find((x) => x.level === "error");
      if (err) return R(err.text, true);
    } else if (id === "hl" || id === "hr") {
      if (mediaCount < 1) return R(T.need.photo);
      const x = parseNum(d[id]);
      if (x === null) return R(T.need[id]);
      if (x === undefined) return R(T.need.number);
      if (!(x > 0)) return R(T.need.positive);
      const errs = validate({ ...DEFAULTS, freeWidth: null, hl: x, hr: x }).filter((e) => e.level === "error");
      if (x <= PLY) return R(errs[0]?.text || T.need.positive, true);
      if (x > MAX_H) return { ok: true, reason: "", warn: (errs[0]?.text || "") + " " + T.tooHighNote, rule: true };
    }
    return { ok: true, reason: "", warn: "", rule: false };
  }
  // Первый шаг, который ещё не пройден (для перехода по полоске шагов)
  function firstBlocked(d, counts) {
    for (let i = 0; i < STEPS.length; i++) if (!stepCheck(STEPS[i], d, counts[STEPS[i]] || 0).ok) return i;
    return STEPS.length;
  }

  const clip = (s, n) => String(s ?? "").trim().slice(0, n);
  function roleText(d) {
    const r = T.roles.find((x) => x.v === d.role);
    return d.role === "other" && d.roleOther.trim() ? clip(d.roleOther, 120) : r ? r.t : "";
  }
  // Заявка: всё, что ушло в хранилище или в файл. Числа расчёта — только из build().dims
  function buildRequest(d, model, { now = new Date(), photos = [], paint = null } = {}) {
    const v = values(d), dm = model.dims, p = model.params;
    return {
      v: 1, type: "ramp-request", app: "goapsny-stopgap", paramsVersion: PARAMS_VERSION,
      id: d.id, createdAt: d.createdAt, submittedAt: now.toISOString(),
      role: d.role, roleText: roleText(d),
      measurer: { name: clip(d.name, 200), contact: clip(d.contact, 200) },
      object: { name: clip(d.object, 300), address: clip(d.address, 400), entrance: clip(d.entrance, 200) },
      measure: { freeWidth: v.freeWidth, width: v.width, hl: v.hl, hr: v.hr, raw: { freeWidth: d.free.trim(), width: d.width.trim(), hl: d.hl.trim(), hr: d.hr.trim() } },
      params: { hl: p.hl, hr: p.hr, width: p.width, board: p.board, freeWidth: p.freeWidth },
      paint: paint ? { hex: paint.hex ?? null, ral: paint.ral || "", name: paint.name || "" } : { hex: null, ral: PAINTS.RAW.ral, name: PAINTS.RAW.name },
      result: {
        kind: model.kind, slope: dm.slope, totalLen: dm.totalLen, rib: !!dm.rib,
        dims: JSON.parse(JSON.stringify(dm)),
        issues: model.issues.map((x) => ({ level: x.level, text: x.text })),
      },
      comment: clip(d.comment, 4000),
      extra: { note: clip(d.extraNote, 2000) },
      // сказанное голосом или написанное в окне «Голосом» (без автоматических вопросов к снимкам)
      notes: (d.chat || []).filter((m) => m.role === "user" && !m.auto && String(m.content || "").trim()).slice(-40).map((m) => ({ step: m.step, text: clip(m.content, 1000) })),
      photos: photos.map((x) => ({ step: x.step, kind: x.kind, ...(x.t != null ? { t: x.t } : {}) })),
      photoCount: photos.length, photosStored: 0,
    };
  }
  // Покраска для заявки: hex (или null — без покраски) + RAL и название из палитры OSOKA (src/paints.js)
  const PAINTS = createPaints();
  const PDF = createPdf();
  function paintRecord(hex, paints = PAINTS.list()) {
    const x = hex ? "#" + String(hex).trim().replace(/^#/, "").toUpperCase() : null;
    const hit = (paints || []).find((p) => (p.hex ? p.hex.toUpperCase() : null) === x);
    if (hit) return { hex: x, ral: hit.ral, name: hit.name };
    return x ? { hex: x, ral: "", name: "" } : { hex: null, ral: PAINTS.RAW.ral, name: PAINTS.RAW.name };
  }
  // Ссылка «Примерить в AR»: числа как введены (запятая допустима), покраска без # или raw
  function arUrl(v, paintHex, base = AR_BASE) {
    const q = new URLSearchParams();
    for (const k of ["hl", "hr", "width", "board"]) {
      const s = v && v[k] != null ? String(v[k]).trim() : "";
      if (s) q.set(k, s);
    }
    const hx = paintHex ? String(paintHex).trim().replace(/^#/, "") : "";
    q.set("paint", /^[0-9a-f]{6}$/i.test(hx) ? hx.toUpperCase() : "raw");
    return `${String(base).replace(/\/+$/, "")}/ar?${q.toString()}`;
  }
  // Значения для AR из черновика: как введены; Б по умолчанию = А, ширина по умолчанию — из расчёта
  function arValues(d, model) {
    const v = values(d);
    return {
      hl: d.hl.trim(), hr: d.hr.trim() || d.hl.trim(),
      width: d.width.trim() || (v.width == null ? "" : v.width === v.freeWidth ? d.free.trim() : String(v.width)),
      board: model && model.params ? model.params.board : "",
    };
  }
  const docBytes = (o) => new TextEncoder().encode(JSON.stringify(o)).length;

  // Ответ помощника: строки «ПРЕДЛОЖЕНИЕ: hl=87» вырезаются из текста и становятся кнопками
  const SUG_RE = /^\s*ПРЕДЛОЖЕНИЕ\s*:\s*(freeWidth|width|hl|hr)\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:мм)?\s*\.?\s*$/i;
  function parseSuggestions(text) {
    const items = [], keep = [];
    for (const line of String(text || "").split("\n")) {
      const m = line.match(SUG_RE);
      if (m) {
        const key = Object.keys(FIELD_STEP).find((k) => k.toLowerCase() === m[1].toLowerCase());
        const raw = m[2].replace(".", ","), value = parseNum(raw);
        if (key && value > 0 && value <= 5000 && !items.some((x) => x.key === key)) items.push({ key, raw, value });
      } else if (/^\s*ПРЕДЛОЖЕНИЕ\s*:/i.test(line)) { /* неразборчивое предложение не показываем */ }
      else keep.push(line);
    }
    return { text: keep.join("\n").trim(), items };
  }
  // Во время потока: не показывать начатую служебную строку
  function visibleStream(text) {
    const lines = String(text || "").split("\n").filter((l) => !/^\s*ПРЕДЛОЖЕНИЕ/i.test(l));
    const last = (lines[lines.length - 1] || "").trim().toUpperCase();
    if (last && "ПРЕДЛОЖЕНИЕ".startsWith(last)) lines.pop();
    return lines.join("\n").trimEnd();
  }

  // Инструкция для помощника (каждый вызов без памяти). Имя, контакт и адрес не передаются.
  function buildPrompt(d, stepId, ctx = {}) {
    const v = values(d), i = STEPS.indexOf(stepId), S = T.steps[stepId];
    const known = [
      `свободная ширина: ${v.freeWidth != null ? num(v.freeWidth) + " мм" : "не введена"}`,
      `ширина пандуса: ${v.width != null ? num(v.width) + " мм" + (d.width.trim() ? "" : " (по умолчанию)") : "не выбрана"}`,
      `высота А (слева): ${v.hl != null ? num(v.hl) + " мм" : "не введена"}`,
      `высота Б (справа): ${v.hr != null ? num(v.hr) + " мм" : "не введена"}`,
    ];
    const lines = [
      "Ты — помощник замерщика в приложении GoApsny: Stopgap (приставные пандусы IDLab, Ассоциация «Инва-Содействие», Абхазия). Замерщик стоит у входа с телефоном и рулеткой и шаг за шагом заполняет заявку на пандус.",
      "Отвечай по-русски, коротко (до 5 предложений), простыми словами, без Markdown и без списков со звёздочками.",
      "",
      "Правила замера:",
      "1. Свободная ширина в месте примыкания обязательна: ширина, свободная от наличников и других выступов, ровно там, где пандус встанет вплотную к ступени напротив двери.",
      `2. Ширина пандуса не больше свободной ширины; обычно ${DEFAULTS.width} мм.`,
      "3. Высоты А (слева) и Б (справа) меряют, стоя лицом к двери, на двух краях будущего пандуса, ровно в линии, где пандус встанет к ступени: от земли до верха ступени. Расстояние между А и Б равно ширине пандуса. Мерить на узкой базе 30–50 см нельзя: при наклонной земле разница высот выйдет меньше настоящей.",
      "4. Числа вводятся как есть, без округления.",
      `5. Ступень до ${MAX_H} мм. Уклон строго 1:6. Внутреннее ребро только при высоте больше ${RIB_OVER} мм.`,
      "",
      "Нельзя: говорить о прочности, безопасности, допустимой нагрузке, цене и сроках — это решает мастерская. Не меняй правила. Не выдумывай числа: если на снимке не читается, так и скажи и попроси переснять ближе и ровнее.",
      "Если на снимке ясно читается значение рулетки для поля этого шага, добавь в самом конце ответа отдельную строку ровно в таком виде: ПРЕДЛОЖЕНИЕ: <поле>=<число>",
      "где поле — freeWidth, width, hl или hr, число — в миллиметрах, как на рулетке, без округления (если шкала в сантиметрах, умножь на 10). Замерщик сам решит, брать ли его. Не предлагай число, если не уверен.",
      "Замерщик чаще говорит голосом: в тексте возможны ошибки распознавания. Если это заметка, а не вопрос, ответь одним коротким предложением, что записано; если в ней названо число для поля этого шага, предложи его строкой ПРЕДЛОЖЕНИЕ (сантиметры переведи в миллиметры).",
      "",
      `Сейчас шаг ${i + 1} из ${STEPS.length}: «${S.title}». Задача шага: ${S.lead || S.title}`,
      `Уже введено: ${known.join("; ")}.`,
    ];
    if (ctx.summary) lines.push(`Расчёт приложения (рабочая формула): ${ctx.summary}.`);
    if (ctx.issues && ctx.issues.length) lines.push(`Замечания приложения: ${ctx.issues.join(" ")}`);
    if (ctx.images && ctx.images.length) lines.push(`К последнему сообщению приложены снимки этого шага по порядку: ${ctx.images.join("; ")}.`);
    else lines.push("Снимков к этому сообщению нет.");
    return lines.join("\n");
  }
  function modelSummary(m) {
    const d = m.dims, p = m.params, sk = m.kind === "skew";
    return [
      sk ? `перекос порога (А ${num(p.hl)}, Б ${num(p.hr)} мм)` : `ровный порог ${num(p.hl)} мм`,
      `ширина ${num(d.ply.width)} мм`, `уклон ${String(d.slope).replace(".", ",")}`,
      d.rib ? `ребро есть, высота ${d.rib.height} мм` : "ребра нет", `общая длина ${d.totalLen} мм`,
    ].join(", ");
  }
  function withTimeout(pr, ms) {
    let t;
    return Promise.race([Promise.resolve(pr).finally(() => clearTimeout(t)), new Promise((_, rej) => { t = setTimeout(() => rej({ code: "timeout" }), ms); })]);
  }

  // ======================================================================
  // DOM: мастер поверх конструктора
  // ======================================================================
  function mount(root, handlers) {
    const h = handlers || {};
    const doc = document;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const $ = (sel, el = box) => el.querySelector(sel);
    const $$ = (sel, el = box) => Array.from(el.querySelectorAll(sel));
    const mqWide = matchMedia("(min-width: 1200px)");
    const mqPhone = matchMedia("(max-width: 819.98px)");
    const ICON = {
      back: '<path d="M14.5 5.5 8 12l6.5 6.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      chev: '<path d="M9.5 5.5 16 12l-6.5 6.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      up: '<path d="M5.5 14.5 12 8l6.5 6.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      down: '<path d="M5.5 9.5 12 16l6.5-6.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" style="fill:none;stroke:currentColor" stroke-width="1.8"/>',
      video: '<rect x="3" y="6.5" width="12.5" height="11" rx="2" style="fill:none;stroke:currentColor" stroke-width="1.8"/><path d="M15.5 10.5 21 7.5v9l-5.5-3z" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
      gallery: '<rect x="3.5" y="5" width="17" height="14" rx="2" style="fill:none;stroke:currentColor" stroke-width="1.8"/><path d="m4.5 17 5-5 3.5 3.5 2.5-2.5 4 4" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="15.5" cy="9.5" r="1.6" style="fill:currentColor"/>',
      close: '<path d="M7 7l10 10M17 7 7 17" style="stroke:currentColor" stroke-width="2.2" stroke-linecap="round"/>',
      spark: '<path d="M12 3.5c.5 4 2.2 6.6 6.5 8.5-4.3 1.9-6 4.5-6.5 8.5-.5-4-2.2-6.6-6.5-8.5 4.3-1.9 6-4.5 6.5-8.5z" style="fill:currentColor"/>',
      send: '<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" style="fill:none;stroke:currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      stop: '<rect x="7" y="7" width="10" height="10" rx="2" style="fill:currentColor"/>',
      mic: '<rect x="9" y="3.5" width="6" height="11" rx="3" style="fill:none;stroke:currentColor" stroke-width="1.8"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      clock: '<circle cx="12" cy="12" r="8.5" style="fill:none;stroke:currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      warn: '<path d="M10.3 3.9 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" style="fill:currentColor"/><path d="M12 9v5" style="stroke:var(--on-sym)" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.3" style="fill:var(--on-sym)"/>',
      error: '<path d="M8.3 2.5h7.4l5.8 5.8v7.4l-5.8 5.8H8.3l-5.8-5.8V8.3z" style="fill:currentColor"/><path d="M9 9l6 6M15 9l-6 6" style="stroke:var(--on-sym)" stroke-width="2.2" stroke-linecap="round"/>',
      ok: '<circle cx="12" cy="12" r="10" style="fill:currentColor"/><path d="M7.5 12.4 10.5 15.3 16.6 9" style="fill:none;stroke:var(--on-sym)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      check: '<path d="M5 12.5 10 17.5 19 7" style="fill:none;stroke:currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
      cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 7.5 12 12l8-4.5M12 12v9" style="fill:none;stroke:currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
      download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" style="fill:none;stroke:currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    };
    const icon = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[n]}</svg>`;

    // ---------- черновик ----------
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { d = null; }
    if (!d || d.v !== 2) d = emptyDraft();
    d.media = { hl: [], hr: [], free: [], overview: [], extra: [], fit: [], ...(d.media || {}) };
    d.mode = "photo";                            // видео пока не обрабатываем (Алхас, 2026-11-08)
    if (typeof d.extraNote !== "string") d.extraNote = "";
    d.chat = Array.isArray(d.chat) ? d.chat.filter((m) => m && m.content && !m.pending) : [];
    let saveT = 0;
    const saveNow = () => { try { d.updatedAt = new Date().toISOString(); localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, chat: d.chat.slice(-30).map(({ role, content, step, sug, local }) => ({ role, content, step, sug, local })) })); } catch {} };
    const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 250); };

    // ---------- снимки: память + IndexedDB ----------
    const media = new Map();                     // id → { id, step, kind, t, blob, url, w, h }
    const idb = (() => {
      let p = null;
      const open = () => p || (p = withTimeout(new Promise((res) => {
        try {
          const r = indexedDB.open("goapsny-stopgap-intake", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("media");
          r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
        } catch { res(null); }
      }), 3000).catch(() => null));
      const tx = async (mode, fn) => {
        const db = await open(); if (!db) return null;
        return withTimeout(new Promise((res) => {
          try {
            const t = db.transaction("media", mode), r = fn(t.objectStore("media"));
            t.oncomplete = () => res(r && "result" in r ? r.result : true); t.onerror = t.onabort = () => res(null);
          } catch { res(null); }
        }), 4000).catch(() => null);
      };
      return { put: (k, v) => tx("readwrite", (s) => s.put(v, k)), get: (k) => tx("readonly", (s) => s.get(k)), del: (k) => tx("readwrite", (s) => s.delete(k)), clear: () => tx("readwrite", (s) => s.clear()) };
    })();
    const stepMedia = (s) => (d.media[s] || []).map((id) => media.get(id)).filter(Boolean);
    const counts = () => Object.fromEntries(MEDIA_STEPS.map((s) => [s, stepMedia(s).length]));
    async function restoreMedia() {
      for (const s of MEDIA_STEPS) {
        const keep = [];
        for (const id of d.media[s]) {
          if (media.has(id)) { keep.push(id); continue; }
          const rec = await idb.get(id);
          if (rec && rec.blob) { media.set(id, { ...rec, id, url: URL.createObjectURL(rec.blob) }); keep.push(id); }
        }
        d.media[s] = keep;
      }
    }
    function addMedia(step, rec) {
      const id = "m" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      const m = { ...rec, id, step, url: URL.createObjectURL(rec.blob) };
      media.set(id, m); d.media[step].push(id);
      idb.put(id, { step, kind: m.kind, t: m.t ?? null, w: m.w, h: m.h, blob: m.blob });
      return m;
    }
    function removeMedia(id) {
      const m = media.get(id); if (!m) return;
      d.media[m.step] = d.media[m.step].filter((x) => x !== id);
      URL.revokeObjectURL(m.url); media.delete(id); idb.del(id);
    }

    // ---------- изображения ----------
    async function decodeImage(blob) {
      if (typeof createImageBitmap === "function") { try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch {} }
      return new Promise((res, rej) => {
        const url = URL.createObjectURL(blob), im = new Image();
        im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 1000); };
        im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
        im.src = url;
      });
    }
    const srcSize = (s) => ({ w: s.videoWidth || s.naturalWidth || s.width, h: s.videoHeight || s.naturalHeight || s.height });
    async function toJpeg(src, max, q) {
      const sz = srcSize(src), f = fitSize(sz.w, sz.h, max);
      if (!f.w) throw new Error("size");
      const c = doc.createElement("canvas"); c.width = f.w; c.height = f.h;
      c.getContext("2d").drawImage(src, 0, 0, f.w, f.h);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
      if (!blob) throw new Error("encode");
      return { blob, w: f.w, h: f.h };
    }
    const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
    async function photoForDb(blob) {
      const src = await decodeImage(blob);
      for (const a of DB_PHOTO_PLAN) {
        const j = await toJpeg(src, a.max, a.q), u = await blobToDataURL(j.blob);
        if (u.length <= PHOTO_DOC_MAX) return { dataUrl: u, w: j.w, h: j.h };
      }
      return null;
    }
    // Кадры из видео: скрытый <video>, перемотка к моментам frameTimes(), снимок в canvas
    function loadVideo(file) {
      return new Promise((res, rej) => {
        const v = doc.createElement("video");
        v.muted = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
        const url = URL.createObjectURL(file);
        let done = false;
        const fail = (why) => { if (done) return; done = true; clearTimeout(to); URL.revokeObjectURL(url); rej(new Error(why)); };
        const to = setTimeout(() => fail("timeout"), 12000);
        v.onerror = () => fail("decode");
        v.onloadeddata = async () => {
          if (done) return;
          if (!v.videoWidth) return fail("novideo");
          let dur = v.duration;
          if (!Number.isFinite(dur) || !(dur > 0)) {           // webm без длительности: перемотка в конец
            try { v.currentTime = 1e9; await waitSeek(v); dur = v.duration; } catch {}
            if (!Number.isFinite(dur) || !(dur > 0)) dur = v.currentTime;
          }
          if (!(dur > 0)) return fail("duration");
          done = true; clearTimeout(to); res({ v, url, dur });
        };
        v.src = url;
        try { v.load(); } catch {}
      });
    }
    function waitSeek(v) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => { v.onseeked = null; rej(new Error("seek")); }, 5000);
        v.onseeked = () => { clearTimeout(t); v.onseeked = null; res(); };
      });
    }
    async function videoFrames(file) {
      const { v, url, dur } = await loadVideo(file);
      const out = [];
      try {
        for (const t of frameTimes(dur)) {
          v.currentTime = t; await waitSeek(v);
          const j = await toJpeg(v, 1280, 0.85);
          out.push({ ...j, t });
        }
      } finally { URL.revokeObjectURL(url); v.removeAttribute("src"); try { v.load(); } catch {} }
      if (!out.length) throw new Error("frames");
      return out;
    }

    // ---------- разметка ----------
    const box = doc.createElement("section");
    box.className = "ik";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", T.entry);
    box.innerHTML = `
      <div class="ik-card">
        <header class="ik-head">
          <div class="ik-head-row">
            <button type="button" class="ik-close" data-ik-close aria-label="${esc(T.closeAria)}">${icon("back")}<span>${esc(T.close)}</span></button>
            <span class="ik-count num-tab" data-ik-count aria-live="polite"></span>
          </div>
          <ol class="ik-prog" data-ik-prog aria-label="${esc(T.progAria)}"></ol>
        </header>
        <div class="ik-main" data-ik-main>
          <div class="ik-body" data-ik-body></div>
          <aside class="ik-ai" data-ik-ai role="dialog" aria-label="${esc(T.ai.aria)}" hidden>
            <div class="ik-ai-head"><span class="ik-ai-name">${esc(T.ai.name)}</span><button type="button" class="ik-ai-x" data-ik-ai-close aria-label="${esc(T.ai.close)}">${icon("close")}</button></div>
            <p class="ik-ai-note" data-ik-ai-note hidden></p>
            <div class="ik-log" data-ik-log aria-live="polite" aria-relevant="additions text"></div>
            <div class="ik-quick" data-ik-quick></div>
            <form class="ik-compose" data-ik-form>
              <textarea rows="1" data-ik-q placeholder="${esc(T.ai.placeholder)}" enterkeyhint="send" aria-label="${esc(T.ai.placeholder)}"></textarea>
              <button type="submit" class="ik-cbtn ik-send" data-ik-send aria-label="${esc(T.ai.send)}">${icon("send", "i-send")}${icon("stop", "i-stop")}</button>
            </form>
            <div class="ik-micbar"><button type="button" class="ik-mic" data-ik-mic aria-pressed="false" aria-label="${esc(T.ai.micOn)}">${icon("mic")}</button><p class="ik-mic-s" data-ik-mic-s aria-live="polite"></p></div>
          </aside>
        </div>
        <footer class="ik-foot">
          <div class="ik-invite-w" data-ik-invite hidden></div>
          <p class="ik-reason" data-ik-reason aria-live="polite"></p>
          <div class="ik-nav" data-ik-nav></div>
        </footer>
      </div>
      <input type="file" hidden data-ik-in="photo" accept="image/*" capture="environment">
      <input type="file" hidden data-ik-in="photo-g" accept="image/*" multiple>`;
    root.appendChild(box);
    const body = $("[data-ik-body]"), logEl = $("[data-ik-log]"), qEl = $("[data-ik-q]");

    // ---------- состояние ----------
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null;
    let rec = null;
    const st = { listening: false, micErr: !SR, tried: {}, open: false, view: "step", aiOpen: false, busy: false, ctl: null, sample: undefined, aiOff: "", imagesOK: false, maxImages: 4, capBusy: "", capMsg: "", capFromAi: false, sending: false, sendNote: "", lastApplied: "", opener: null };
    const curStep = () => STEPS[d.step] || STEPS[0];

    // ---------- возможности ----------
    const use = async (name) => { try { const c = typeof window !== "undefined" ? window.claude : null; return c && typeof c.use === "function" ? await c.use(name) : null; } catch { return null; } };
    async function initAI() {
      const s = await use("sample");
      if (typeof s !== "function") { st.sample = null; st.aiOff = ""; renderAI(); return; }
      st.sample = s;
      try { const lim = await s.limits(); st.imagesOK = !!lim?.images; st.maxImages = Math.max(1, Math.min(6, lim?.images?.maxCount || 4)); } catch { st.imagesOK = false; }
      renderAI();
    }

    // ---------- параметры в конструктор (тот же путь onParams) ----------
    function applyParams() {
      const p = draftParams(d), key = JSON.stringify(p);
      if (key === st.lastApplied) return;
      st.lastApplied = key;
      if (Object.keys(p).length && typeof h.onParams === "function") h.onParams(p);
    }
    const getModel = () => (typeof h.getModel === "function" ? h.getModel() : build(draftParams(d)));
    // покраска живёт в конструкторе (state.paint): мастер только читает её и меняет тем же onPaint; цвета — из src/paints.js
    const paints = PAINTS.list();
    const curPaint = () => (typeof h.getPaint === "function" ? h.getPaint() : null) || null;
    function paintHTML() {
      if (!paints.length) return "";
      const P = T.paint, r = paintRecord(curPaint(), paints);
      return `<div class="ik-sum-h"><span>${esc(P.title)}</span></div><div class="group finish ik-paint">
        <div class="swatch-name" aria-live="polite"><span class="finish-name" data-ik-paint-name>${esc(r.hex ? r.name || r.hex : P.rawName)}</span><span class="finish-ral num-tab" data-ik-paint-ral>${esc(r.hex ? [r.ral, r.hex].filter(Boolean).join(" · ") : P.rawSub)}</span></div>
        <div class="swatches" role="radiogroup" aria-label="${esc(P.aria)}" data-ik-swatches>${paints.map((p) => {
          const on = (p.hex ? p.hex.toUpperCase() : null) === r.hex;
          return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="swatch${p.hex ? "" : " swatch-raw"}" data-ik-paint="${p.hex || ""}" aria-label="${esc(p.ral + (p.hex ? ", " + p.name : ""))}" style="--sw:${p.hex || "transparent"}"></button>`;
        }).join("")}</div>
      </div><p class="sec-f">${esc(P.note)} ${esc(PAINTS.STOCK_NOTE)}</p>`;
    }
    function setPaint(hex) {
      if (typeof h.onPaint === "function") h.onPaint(hex || null);
      const P = T.paint, r = paintRecord(curPaint(), paints);
      for (const b of $$("[data-ik-paint]", body)) {
        const on = ((b.dataset.ikPaint || "").toUpperCase() || null) === r.hex;
        b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      }
      const nm = $("[data-ik-paint-name]", body), rl = $("[data-ik-paint-ral]", body);
      if (nm) nm.textContent = r.hex ? r.name || r.hex : P.rawName;
      if (rl) rl.textContent = r.hex ? [r.ral, r.hex].filter(Boolean).join(" · ") : P.rawSub;
    }

    // ---------- схема «вид сверху» ----------
    function planSVG(hi, v) {
      const tint = "var(--tint-ink)", ink = "var(--sch-ink)", mut = "var(--sch-mut)";
      const on = (k) => hi === k;
      const pt = (x, L, k) => (on(k) ? `<circle cx="${x}" cy="46" r="17" style="fill:var(--tint-soft)"/>` : "") +
        `<circle cx="${x}" cy="46" r="${on(k) ? 12 : 10}" style="fill:${on(k) ? "var(--tint)" : "var(--navy-pt)"};stroke:var(--cell)" stroke-width="2"/><text x="${x}" y="50.5" text-anchor="middle" class="sch-pt">${L}</text>`;
      const fwT = v.freeWidth != null ? `свободно ${num(v.freeWidth)} мм` : "свободная ширина";
      const wT = `А–Б = ширина пандуса${v.width != null ? " " + num(v.width) + " мм" : ""}`;
      return `<svg viewBox="0 0 340 222" width="100%" aria-hidden="true" focusable="false">
        <rect x="0" y="0" width="340" height="46" style="fill:var(--sch-wall)"/>
        <rect x="88" y="0" width="164" height="46" style="fill:var(--sch-open)"/>
        <text x="170" y="14" text-anchor="middle" class="sch-t" style="fill:${mut}">дверь</text>
        <rect x="76" y="12" width="12" height="42" rx="2" style="fill:var(--sch-jamb)"/><rect x="252" y="12" width="12" height="42" rx="2" style="fill:var(--sch-jamb)"/>
        <text x="70" y="30" text-anchor="end" class="sch-t" style="fill:${mut}">наличник</text>
        <g style="stroke:${on("free") ? tint : ink}" stroke-width="${on("free") ? 2.4 : 1.2}"><line x1="90" y1="38" x2="250" y2="38"/><path d="M90 32v12M250 32v12"/></g>
        <text x="170" y="31" text-anchor="middle" class="sch-t sch-b" style="fill:${on("free") ? tint : ink}">${esc(fwT)}</text>
        <rect x="96" y="46" width="148" height="104" rx="3" style="fill:var(--sch-ramp);stroke:var(--sch-ramp-edge)" stroke-width="1.6"/>
        <text x="170" y="66" text-anchor="middle" class="sch-t" style="fill:var(--sch-ramp-ink)">↑ линия примыкания</text>
        <text x="170" y="108" text-anchor="middle" class="sch-t sch-b" style="fill:var(--sch-ramp-ink)">пандус</text>
        ${pt(96, "А", "hl")}${pt(244, "Б", "hr")}
        <text x="84" y="76" text-anchor="end" class="sch-t ${on("hl") ? "sch-b" : ""}" style="fill:${on("hl") ? tint : ink}">А слева</text>
        <text x="256" y="76" class="sch-t ${on("hr") ? "sch-b" : ""}" style="fill:${on("hr") ? tint : ink}">Б справа</text>
        <g style="stroke:${on("width") ? tint : ink}" stroke-width="${on("width") ? 2.4 : 1.2}"><line x1="96" y1="168" x2="244" y2="168"/><path d="M96 162v12M244 162v12"/></g>
        <text x="170" y="190" text-anchor="middle" class="sch-t sch-b" style="fill:${on("width") ? tint : ink}">${esc(wT)}</text>
        <text x="170" y="212" text-anchor="middle" class="sch-t" style="fill:${mut}">вид сверху, вы стоите лицом к двери</text>
      </svg>`;
    }

    // ---------- шаги: разметка ----------
    const textRow = (f, opt, extra = "") => `
      <label class="ik-text"><span class="ik-text-l">${esc(T.fields[f])}${opt ? `<span class="row-sub"> · ${esc(T.optional)}</span>` : ""}</span>
      <input type="text" data-f="${f}" value="${esc(d[f])}" placeholder="${esc(T.ph[f] || "")}" autocomplete="off" ${extra}></label>`;
    const numRow = (f, label, sub, val) => `
      <div class="row row-big ik-num" data-row="${f}">
        <label class="big-label" for="ik-${f}">${esc(label)}<span class="row-sub">${esc(sub)}</span></label>
        <div class="big-line"><div class="big-input"><input id="ik-${f}" data-f="${f}" data-num type="text" inputmode="decimal" autocomplete="off" spellcheck="false" enterkeyhint="done" value="${esc(val)}" placeholder="${esc(T.ph.number)}"><span class="unit" aria-hidden="true">${esc(T.mm)}</span></div></div>
      </div>`;
    // Окно съёмки — главное на шаге: большое поле под фото, на телефоне занимает бо́льшую часть экрана
    function mediaHTML(step) {
      const S = T.steps[step], photos = stepMedia(step), max = maxPhotos(step), last = photos[photos.length - 1];
      const busy = st.capBusy ? "disabled" : "", full = photos.length >= max ? "disabled" : "";
      const k0 = S.gallery ? "photo-g" : "photo";   // примерка — снимок экрана из галереи
      const th = (m) => `<div class="ik-th"><img src="${m.url}" alt="${esc(S.media)}"><button type="button" class="ik-th-x" data-ik-rm="${m.id}" aria-label="${esc(T.media.remove)}">${icon("close")}</button></div>`;
      const shot = last
        ? `<div class="ik-shot ik-shot-has"><img src="${last.url}" alt="${esc(S.media)}"></div>`
        : `<button type="button" class="ik-shot" data-ik-cap="${k0}" ${busy}><span class="ik-shot-ico" aria-hidden="true">${icon(S.gallery ? "gallery" : "camera")}</span><span class="ik-shot-t">${esc(S.shot || S.media)}</span></button>`;
      return `<div class="group group-gap ik-media" data-ik-media="${step}">
        ${shot}
        ${photos.length ? `<div class="ik-thumbs">${photos.map(th).join("")}</div>` : ""}
        ${st.capBusy ? `<p class="ik-cap-busy" role="status"><span class="ik-spin" aria-hidden="true"></span>${esc(st.capBusy)}</p>` : ""}
        ${st.capMsg ? `<div class="banner banner-warn banner-in" role="alert">${icon("warn", "b-ico")}<span>${esc(st.capMsg)}</span></div>` : ""}
        ${photos.length ? `<div class="ik-cap-row">
          ${S.gallery ? "" : `<button type="button" class="btn-plain ik-cap" data-ik-cap="photo" ${busy} ${full}>${icon("camera")}<span>${esc(T.media.more)}</span></button>`}
          <button type="button" class="btn-plain ik-cap" data-ik-cap="photo-g" ${busy} ${full}>${icon("gallery")}<span>${esc(T.media.gallery)}</span></button>
          <span class="ik-cap-n row-sub num-tab">${esc(T.media.count(photos.length, max))}</span>
        </div>` : S.gallery ? "" : `<div class="ik-cap-row"><button type="button" class="btn-plain ik-cap" data-ik-cap="photo-g" ${busy}>${icon("gallery")}<span>${esc(T.media.gallery)}</span></button></div>`}
      </div>`;
    }
    function fitInput(inp) {
      const v = inp.value;
      inp.style.width = v ? `${v.length + 0.35}ch` : `${Math.max(1, inp.placeholder.length) * 0.5 + 0.4}ch`;   // подсказка мельче цифр
    }
    const banner = (lvl, text) => `<div class="banner banner-${lvl}" role="${lvl === "err" ? "alert" : "status"}">${icon(lvl === "err" ? "error" : lvl === "warn" ? "warn" : "ok", "b-ico")}<span>${esc(text)}</span></div>`;

    function stepHTML(id) {
      const S = T.steps[id], v = values(d);
      let o = `<h2 class="ik-title" tabindex="-1" data-ik-h>${esc(S.title)}</h2>${S.lead ? `<p class="ik-lead">${esc(S.lead)}</p>` : ""}`;
      if (id === "who") {
        o += `<div class="group ik-roles" role="radiogroup" aria-label="${esc(T.fields.role)}">` +
          T.roles.map((r) => `<button type="button" class="row ik-role" role="radio" aria-checked="${d.role === r.v}" data-ik-role="${r.v}"><span>${esc(r.t)}</span>${icon("check", "ik-ck")}</button>`).join("") + `</div>` +
          (d.role === "other" ? `<div class="group group-gap">${textRow("roleOther", true)}</div>` : "") +
          `<div class="group group-gap">${textRow("name", false, 'autocomplete="name"')}${textRow("contact", true, 'inputmode="text" autocomplete="tel"')}</div>` +
          `<div class="group group-gap">${textRow("object", false)}${textRow("address", false, 'autocomplete="street-address"')}${textRow("entrance", true)}</div>`;
      } else if (id === "overview") {
        o += mediaHTML(id);
      } else if (id === "extra") {
        o += mediaHTML(id) +
          `<div class="group group-gap"><label class="ik-text"><span class="ik-text-l">${esc(S.note)}</span><textarea data-f="extraNote" rows="2" placeholder="${esc(S.notePh)}">${esc(d.extraNote)}</textarea></label></div>`;
      } else if (id === "free") {
        const W = T.steps.width, shown = d.width.trim() ? d.width : num(v.width);
        const same = v.freeWidth != null && v.width === v.freeWidth;
        o += mediaHTML(id) + `<div class="group group-gap">${numRow("free", S.label, S.sub, d.free)}</div>` +
          `<div class="group">${numRow("width", W.label, W.sub, shown)}` +
          `<button type="button" class="row row-action" data-ik-fit ${v.freeWidth == null ? "hidden" : ""} ${same ? "disabled" : ""}>${esc(same ? T.fitDone(num(v.freeWidth)) : T.fitFree(num(v.freeWidth ?? 0)))}</button></div>` +
          `<div class="issues" data-ik-issues></div>` +
          `<div class="group group-gap"><div class="cell-schema" role="img" aria-label="Вид сверху: свободная ширина между наличниками в месте, где пандус встанет к ступени">${planSVG("free", v)}</div></div>`;
      } else if (id === "hl" || id === "hr") {
        o += mediaHTML(id) +
          `<div class="group group-gap">${numRow(id, S.label, S.sub, d[id])}</div>` +
          `<div class="issues" data-ik-issues></div>` +
          `<p class="sec-f ik-narrow">${esc(T.narrow)}</p>` +
          `<div class="group group-gap"><div class="cell-schema" role="img" aria-label="Вид сверху: точка ${id === "hl" ? "А на левом" : "Б на правом"} краю пандуса в линии примыкания">${planSVG(id, v)}</div></div>`;
      } else if (id === "check") {
        o += checkHTML();
      } else if (id === "fit") {
        o += paintHTML() +
          `<div class="group group-gap"><button type="button" class="row row-action ik-ar" data-ik-ar>${icon("cube")}<span>${esc(T.ar.open)}</span></button></div>` +
          `<p class="ik-send-note" data-ik-ar-note role="status"></p>` + mediaHTML(id);
      } else if (id === "send") {
        o += sendHTML();
      }
      return o;
    }
    function checkHTML() {
      applyParams();
      const m = getModel(), dm = m.dims, p = m.params, sk = m.kind === "skew", C = T.check;
      const rows = [
        [C.type, sk ? `${C.skew} · ${C.diff(num(p.hl), num(p.hr), num(+Math.abs(p.hl - p.hr).toFixed(4)))}` : `${C.flat} ${num(p.hl)} мм`],
        [C.width, `${num(dm.ply.width)} мм`],
        [C.ground, sk ? `А ${dm.left.ground} · Б ${dm.right.ground} мм` : `${dm.left.ground} мм`],
        [C.rib, dm.rib ? C.ribYes(dm.rib.height) : C.ribNo],
        [C.total, `${dm.totalLen} мм`],
      ];
      return `<div class="group">${rows.map(([k, v]) => `<div class="row row-kv"><span>${esc(k)}</span><span class="kv-v c2 num-tab">${esc(v)}</span></div>`).join("")}</div>` +
        (m.issues.length ? `<div class="issues">${m.issues.map((x) => banner(x.level === "error" ? "err" : "warn", x.text)).join("")}</div>` : "");
    }
    function sendHTML() {
      const v = values(d), S = T.send, all = MEDIA_STEPS.flatMap(stepMedia);
      const grp = (title, step, rows) => `<div class="ik-sum-h"><span>${esc(title)}</span><button type="button" class="ik-edit" data-ik-goto="${STEPS.indexOf(step)}">${esc(S.edit)}</button></div>` +
        `<div class="group">${rows.filter(Boolean).map(([k, val]) => `<div class="row row-kv"><span>${esc(k)}</span><span class="kv-v c2">${esc(val || "—")}</span></div>`).join("")}</div>`;
      return grp(S.who, "who", [[T.fields.role, roleText(d)], [T.fields.name, d.name.trim()], [T.fields.contact, d.contact.trim()]]) +
        grp(S.obj, "who", [[T.fields.object, d.object.trim()], [T.fields.address, d.address.trim()], [T.fields.entrance, d.entrance.trim()]]) +
        grp(T.paint.row, "fit", [[T.paint.row, (() => { const r = paintRecord(curPaint(), paints); return r.hex ? [r.ral, r.name].filter(Boolean).join(" · ") : T.paint.rawName; })()]]) +
        grp(S.measure, "free", [[T.steps.free.label, v.freeWidth != null ? `${d.free.trim()} мм` : ""], [T.steps.width.label, v.width != null ? `${num(v.width)} мм` : ""], [T.steps.hl.label, v.hl != null ? `${d.hl.trim()} мм` : ""], [T.steps.hr.label, v.hr != null ? `${d.hr.trim()} мм` : ""], [S.photos, String(all.length)]]) +
        `<div class="group group-gap"><label class="ik-text"><span class="ik-text-l">${esc(T.fields.comment)}</span><textarea data-f="comment" rows="2" placeholder="${esc(T.ph.comment)}">${esc(d.comment)}</textarea></label></div>` +
        `<p class="ik-send-note" data-ik-send-note role="status">${esc(st.sendNote)}</p>`;
    }
    function resumeHTML() {
      return `<h2 class="ik-title" tabindex="-1" data-ik-h>${esc(T.resume.title)}</h2><p class="ik-lead">${esc(T.resume.text(d.object.trim(), d.step + 1))}</p>`;
    }
    function doneHTML() {
      const s = d.sent, S = T.send, ok = s.stored === "db";
      let o = `<div class="ik-done ${ok ? "ik-done-ok" : "ik-done-local"}">${icon(ok ? "ok" : "warn", "ik-done-ico")}<h2 class="ik-title" tabindex="-1" data-ik-h>${esc(ok ? S.okTitle : S.localTitle)}</h2>` +
        `<p class="ik-lead">${esc(ok ? S.okText(s.id) : S.localText(s.id))}</p>`;
      if (!ok && s.reason) o += `<p class="ik-lead c2">${esc(S.why[s.reason] || S.why.error)}</p>`;
      if (ok && s.photoCount && s.photosStored < s.photoCount) o += `<p class="ik-lead c2">${esc(s.photosStored ? S.photosSaved(s.photosStored, s.photoCount) : S.photosLocal)}</p>`;
      o += `</div><div class="group group-gap"><button type="button" class="row row-action ik-dl" data-ik-dl>${icon("download")}<span>${esc(S.download)}</span></button></div>` +
        `<p class="ik-send-note" data-ik-dl-note role="status"></p>`;
      return o;
    }

    // ---------- отрисовка ----------
    function renderProg() {
      const n = STEPS.length, i = d.step, lim = firstBlocked(d, counts());
      $("[data-ik-count]").textContent = st.view === "step" ? T.stepOf(i + 1, n) : "";
      $("[data-ik-prog]").innerHTML = STEPS.map((s, j) => {
        const can = st.view === "step" && j !== i && j <= Math.max(d.maxStep, 0) && j <= lim;
        return `<li class="${j < i || st.view === "done" ? "done" : j === i && st.view === "step" ? "cur" : ""}"><button type="button" data-ik-goto="${j}" ${can ? "" : "disabled"} aria-label="${esc(`${T.stepOf(j + 1, n)}: ${T.steps[s].short}`)}"${j === i ? ' aria-current="step"' : ""}><span class="ik-seg" aria-hidden="true"></span><span class="ik-seg-l" aria-hidden="true">${esc(T.steps[s].short)}</span></button></li>`;
      }).join("");
    }
    function renderNav() {
      const nav = $("[data-ik-nav]"), reason = $("[data-ik-reason]");
      if (st.view !== "step") $("[data-ik-invite]").hidden = true;
      if (st.view === "resume") {
        reason.textContent = ""; reason.className = "ik-reason";
        nav.innerHTML = `<button type="button" class="btn-plain" data-ik-act="fresh">${esc(T.resume.fresh)}</button><button type="button" class="btn-filled" data-ik-act="cont"><span>${esc(T.resume.cont)}</span>${icon("chev")}</button>`;
        return;
      }
      if (st.view === "done") {
        reason.textContent = ""; reason.className = "ik-reason";
        nav.innerHTML = `<button type="button" class="btn-plain" data-ik-act="again">${esc(T.send.again)}</button><button type="button" class="btn-filled" data-ik-act="close"><span>${esc(T.send.toApp)}</span></button>`;
        return;
      }
      const id = curStep(), c = stepCheck(id, d, stepMedia(id).length), last = id === "send";
      const inv = $("[data-ik-invite]");
      inv.hidden = false;
      inv.innerHTML = `<button type="button" class="ik-invite" data-ik-voice aria-label="${esc(T.ai.open)}"><span class="ik-ai-av" aria-hidden="true">${icon("spark")}</span><span class="ik-invite-t"><span class="ik-invite-n">${esc(T.ai.name)}</span><span class="ik-invite-s">${esc(T.ai.invite[id] || T.ai.tapMic)}</span></span><span class="ik-invite-mic" aria-hidden="true">${icon("mic")}</span></button>`;
      reason.textContent = c.ok ? c.warn : c.reason;
      reason.className = "ik-reason" + (c.ok ? (c.warn ? " is-warn" : "") : " is-block");
      const nextLabel = last ? (st.sending ? T.send.sending : T.send.submit) : STEPS[d.step + 1] === "send" ? T.toSend : T.next;
      nav.innerHTML = `<button type="button" class="btn-plain" data-ik-act="back" ${d.step === 0 ? "disabled" : ""}>${icon("back")}<span>${esc(T.back)}</span></button>` +
        `<button type="button" class="btn-filled" data-ik-act="${last ? "submit" : "next"}" aria-disabled="${!c.ok || st.sending}" ${st.sending ? "disabled" : ""}><span>${esc(nextLabel)}</span>${last ? "" : icon("chev")}</button>`;
      const iss = $("[data-ik-issues]");
      if (iss) iss.innerHTML = c.rule ? banner("err", c.warn || c.reason) : "";
      $$("[data-row]", body).forEach((r) => r.classList.toggle("row-missing", !c.ok && !!st.tried[id] && r.dataset.row === id && !String(d[id] || "").trim()));
      reason.classList.toggle("is-quiet", !c.ok && !c.rule && !st.tried[id]);
      $$("input[data-num]", body).forEach(fitInput);
    }
    function renderBody(focus) {
      body.innerHTML = st.view === "resume" ? resumeHTML() : st.view === "done" ? doneHTML() : stepHTML(curStep());
      const peek = st.view === "step" && (curStep() === "check" || curStep() === "fit");
      box.classList.toggle("ik-peek", peek);
      root.classList.toggle("ik-peek-on", st.open && peek);
      body.scrollTop = 0;
      if (focus) requestAnimationFrame(() => $("[data-ik-h]", body)?.focus({ preventScroll: true }));
    }
    function render(focus) { renderProg(); renderBody(focus); renderNav(); renderAI(); }
    function renderMedia() {
      const id = curStep(), el = $(`[data-ik-media="${id}"]`, body);
      if (el) el.outerHTML = mediaHTML(id);
      renderNav(); renderProg(); renderQuick();
    }

    // ---------- помощник ----------
    function renderAI() {
      const ai = $("[data-ik-ai]");
      ai.hidden = !st.aiOpen;
      box.classList.toggle("ik-ai-max", st.aiOpen);
      const note = $("[data-ik-ai-note]");
      note.textContent = st.aiOff; note.hidden = !st.aiOff;
      const mic = $("[data-ik-mic]");
      mic.hidden = st.micErr;
      mic.setAttribute("aria-pressed", String(st.listening));
      mic.setAttribute("aria-label", st.listening ? T.ai.micOff : T.ai.micOn);
      $("[data-ik-mic-s]").textContent = st.micErr ? T.ai.kbd : st.listening ? T.ai.listen : T.ai.tapMic;
      const sendB = $("[data-ik-send]");
      sendB.classList.toggle("is-busy", st.busy);
      sendB.setAttribute("aria-label", st.busy ? T.ai.stop : T.ai.send);
      renderQuick();
      if (!logEl.childElementCount && d.chat.length) renderLog();
    }
    // ---------- диктовка (Web Speech API; где её нет или микрофон закрыт — диктовка с клавиатуры телефона) ----------
    const growQ = () => { qEl.style.height = "auto"; qEl.style.height = Math.min(qEl.scrollHeight, 110) + "px"; };
    function micStart() {
      if (st.micErr || st.listening || st.busy) return;
      try { rec = new SR(); } catch { st.micErr = true; renderAI(); return; }
      rec.lang = "ru-RU"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      const base = qEl.value.trim();
      let fin = "";
      rec.onresult = (e) => {
        let interim = ""; fin = "";
        for (let k = 0; k < e.results.length; k++) { const r = e.results[k]; if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript; }
        qEl.value = [base, (fin + interim).trim()].filter(Boolean).join(" "); growQ();
      };
      rec.onerror = (e) => { if (["not-allowed", "service-not-allowed", "audio-capture"].includes(e && e.error)) st.micErr = true; };
      rec.onend = () => {
        st.listening = false; rec = null; renderAI();
        if (fin.trim() && st.aiOpen && !st.busy) $("[data-ik-form]").requestSubmit();
        else if (st.aiOpen) qEl.focus({ preventScroll: true });
      };
      st.listening = true; renderAI();
      try { rec.start(); } catch { st.listening = false; st.micErr = true; rec = null; renderAI(); }
    }
    function micStop() { try { rec?.stop(); } catch {} }
    function openVoice() {
      st.aiOpen = true; renderAI(); renderLog();
      if (!st.micErr) micStart(); else requestAnimationFrame(() => qEl.focus({ preventScroll: true }));
    }
    function closeVoice() {
      try { rec?.abort(); } catch {}
      st.listening = false; st.aiOpen = false; renderAI();
      requestAnimationFrame(() => $("[data-ik-voice]")?.focus({ preventScroll: true }));
    }
    function renderQuick() {
      const id = st.view === "done" ? "send" : curStep(), has = stepMedia(id).length > 0;
      const qs = st.sample ? (T.ai.quick[id] || []).filter(([k]) => k !== "issues" || getModel().issues.length) : [];
      $("[data-ik-quick]").innerHTML = qs.map(([k, label]) => {
        const needAI = k !== "how", needM = k === "check" || k === "read";
        const dis = st.busy || (needAI && !st.sample) || (needM && (!has || !st.imagesOK));
        const lbl = k === "check" && d.mode === "video" && stepMedia(id).some((m) => m.kind === "frame") ? T.ai.checkVideo : label;
        return `<button type="button" class="ik-chip" data-ik-quick-k="${k}" ${dis ? "disabled" : ""} ${needM && !has ? `title="${esc(T.ai.needMedia)}"` : ""}>${esc(lbl)}</button>`;
      }).join("");
    }
    function msgEl(m, i) {
      const el = doc.createElement("div");
      el.className = `ik-msg ik-msg-${m.role === "user" ? "me" : "ai"}${m.err ? " is-err" : ""}${m.local ? " is-local" : ""}`;
      el.dataset.i = i;
      if (m.media && m.media.length) {
        const strip = doc.createElement("div"); strip.className = "ik-msg-media";
        for (const id of m.media) { const x = media.get(id); if (!x) continue; const im = doc.createElement("img"); im.src = x.url; im.alt = ""; strip.appendChild(im); }
        el.appendChild(strip);
      }
      const t = doc.createElement("div"); t.className = "ik-msg-t";
      t.textContent = m.pending && !m.content ? T.ai.thinking : m.content;
      if (m.pending && !m.content) t.classList.add("is-thinking");
      el.appendChild(t);
      if (m.note) { const l = doc.createElement("span"); l.className = "ik-msg-tag"; l.textContent = m.note; el.appendChild(l); }
      if (m.sug && m.sug.length) {
        const row = doc.createElement("div"); row.className = "ik-sugs";
        m.sug.forEach((s, k) => {
          const b = doc.createElement("button"); b.type = "button"; b.className = "ik-sug" + (s.taken ? " is-taken" : "");
          b.dataset.ikSug = `${i}:${k}`; b.disabled = !!s.taken;
          b.textContent = s.taken ? T.ai.taken(s.raw) : T.ai.suggest(s.raw, T.ai.fieldFor[s.key]);
          row.appendChild(b);
        });
        el.appendChild(row);
      }
      return el;
    }
    function renderLog() {
      logEl.replaceChildren(...d.chat.map(msgEl));
      logEl.scrollTop = logEl.scrollHeight;
    }
    function updateMsg(i) {
      const old = logEl.querySelector(`[data-i="${i}"]`), nu = msgEl(d.chat[i], i);
      if (old) old.replaceWith(nu); else logEl.appendChild(nu);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function pushMsg(m) { d.chat.push(m); if (d.chat.length > 40) { d.chat.splice(0, d.chat.length - 40); renderLog(); } else updateMsg(d.chat.length - 1); save(); return d.chat.length - 1; }

    async function ask(question, opt = {}) {
      const id = st.view === "done" ? "send" : curStep();
      if (st.busy || !question.trim()) return;
      if (!st.sample) { pushMsg({ role: "user", content: question, step: id }); pushMsg({ role: "assistant", content: T.ai.saved, step: id, local: true }); renderAI(); return; }
      let list = [];
      if (opt.media && st.imagesOK) {
        const all = stepMedia(id);
        const pref = opt.prefer ? all.filter((m) => m.kind === opt.prefer) : all;
        list = (pref.length ? pref : all).slice(-st.maxImages);
      }
      const ctx = { images: list.map((m, k) => `${k + 1} — ${m.kind === "frame" ? `кадр из видео на ${num(m.t)} с` : "фото"}`) };
      if (id === "check" || id === "send") { const m = getModel(); ctx.summary = modelSummary(m); ctx.issues = m.issues.map((x) => x.text); }
      const history = d.chat.filter((m) => m.content && !m.err && !m.pending && !m.local).slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const ui = pushMsg({ role: "user", content: question, step: id, media: list.map((m) => m.id), ...(opt.auto ? { auto: true } : {}) });
      const ai = pushMsg({ role: "assistant", content: "", step: id, pending: true });
      void ui;
      st.busy = true; renderAI();
      const ctl = new AbortController(); st.ctl = ctl;
      const turns = [{ role: "user", content: buildPrompt(d, id, ctx) }, ...history, { role: "user", content: question }];
      try {
        const r = await st.sample(turns, {
          signal: ctl.signal, cache: false, ...(list.length ? { images: list.map((m) => m.blob) } : {}),
          onText: ({ text }) => { d.chat[ai].content = visibleStream(text); updateMsg(ai); },
        });
        const ps = parseSuggestions(r.text);
        d.chat[ai] = { role: "assistant", content: ps.text || visibleStream(r.text), step: id, sug: ps.items, note: r.truncated ? T.ai.truncated : "" };
      } catch (e) {
        const code = e && e.code, kept = e && typeof e.text === "string" ? visibleStream(e.text) : "";
        const E = T.ai.err;
        if (code === "cancelled") d.chat[ai] = { role: "assistant", content: kept || T.ai.stopped, step: id, note: kept ? T.ai.stopped : "", err: !kept };
        else if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) {
          st.sample = null; st.aiOff = code === "not_granted" ? T.ai.off.not_granted : code === "sampling_disabled" ? T.ai.off.disabled : T.ai.off.none;
          d.chat.splice(ai, 1); logEl.querySelector(`[data-i="${ai}"]`)?.remove();
          pushMsg({ role: "assistant", content: T.ai.saved, step: id, local: true });
        } else if (code === "images_unavailable") { st.imagesOK = false; d.chat[ai] = { role: "assistant", content: T.ai.noImages, step: id, err: true }; }
        else {
          const msg = code === "rate_limited" ? E.rate_limited : code === "session_expired" ? E.session_expired : code === "image_rejected" ? E.image_rejected
            : code === "refused" ? E.refused : code === "prompt_too_large" ? E.prompt_too_large : code === "empty_completion" ? E.empty : E.other;
          d.chat[ai] = code === "refused" || !kept ? { role: "assistant", content: msg, step: id, err: true } : { role: "assistant", content: kept, step: id, note: msg };
          if (code === "prompt_too_large") d.chat = d.chat.slice(-4);
        }
      } finally {
        if (st.ctl === ctl) st.ctl = null;
        st.busy = false;
        if (d.chat[ai]) d.chat[ai].pending = false;
        renderLog(); renderAI(); save();
      }
    }
    function quick(k) {
      const id = st.view === "done" ? "send" : curStep();
      const label = (T.ai.quick[id] || []).find((x) => x[0] === k)?.[1] || "";
      if (k === "how") return ask(label);
      if (k === "issues") return ask(T.ai.ask.issues, { auto: true });
      const vidFrames = d.mode === "video" && stepMedia(id).some((m) => m.kind === "frame");
      return ask(k === "read" ? T.ai.ask.read : T.ai.ask.check, { media: true, auto: true, prefer: vidFrames ? "frame" : null });
    }
    function takeSuggestion(i, k) {
      const s = d.chat[i]?.sug?.[k]; if (!s || s.taken) return;
      const f = { freeWidth: "free", width: "width", hl: "hl", hr: "hr" }[s.key];
      d[f] = s.raw; s.taken = true;
      save(); applyParams(); updateMsg(i);
      const inp = $(`input[data-f="${f}"]`, body);
      if (inp) inp.value = s.raw;
      if (st.view === "step" && ["check", "free", "hl", "hr"].includes(curStep())) renderBody(false);
      renderNav(); renderProg();
    }

    // ---------- съёмка ----------
    function pick(kind, fromAi) {
      if (st.capBusy) return;
      const id = curStep(); if (!MEDIA_STEPS.includes(id)) return;
      if (kind.startsWith("photo") && stepMedia(id).filter((m) => m.kind === "photo").length >= maxPhotos(id)) { st.capMsg = T.media.maxPhotos(maxPhotos(id)); renderMedia(); return; }
      st.capFromAi = !!fromAi;
      const inp = $(`[data-ik-in="${kind}"]`);
      inp.value = ""; inp.click();
    }
    async function onFiles(kind, files) {
      const id = curStep(); if (!files || !files.length || !MEDIA_STEPS.includes(id)) return;
      const fromAi = st.capFromAi; st.capFromAi = false;
      st.capMsg = "";
      let added = 0;
      if (kind.startsWith("photo")) {
        st.capBusy = T.media.busyPhoto; renderMedia(); renderAI();
        for (const f of Array.from(files)) {
          if (stepMedia(id).filter((m) => m.kind === "photo").length >= maxPhotos(id)) { st.capMsg = T.media.maxPhotos(maxPhotos(id)); break; }
          try { const j = await toJpeg(await decodeImage(f), 1280, 0.85); addMedia(id, { kind: "photo", ...j }); added++; }
          catch { st.capMsg = T.media.badPhoto; }
        }
      } else {
        st.capBusy = T.media.busyVideo; renderMedia(); renderAI();
        try {
          const fr = await videoFrames(files[0]);
          stepMedia(id).filter((m) => m.kind === "frame").forEach((m) => removeMedia(m.id));   // одно видео на шаг: новые кадры заменяют старые
          for (const x of fr) { addMedia(id, { kind: "frame", ...x }); added++; }
        } catch {
          st.capMsg = T.media.badVideo; d.mode = "photo";
        }
      }
      st.capBusy = ""; saveNow();
      if (curStep() === id && st.view === "step") renderMedia();
      renderAI();
      if (fromAi && added && st.sample) quick("check");
    }

    // ---------- отправка ----------
    function allMedia() { return MEDIA_STEPS.flatMap(stepMedia); }
    async function submit() {
      if (st.sending) return;
      st.sending = true; st.sendNote = T.send.sending; renderNav();
      const note = $("[data-ik-send-note]"); if (note) note.textContent = st.sendNote;
      applyParams();
      const ms = allMedia(), now = new Date();
      const req = buildRequest(d, getModel(), { now, photos: ms, paint: paintRecord(curPaint(), paints) });
      const res = { id: req.id, at: now.toISOString(), stored: "local", reason: "", photoCount: ms.length, photosStored: 0, ar: arUrl(arValues(d, getModel()), req.paint.hex) };
      try {
        const db = await withTimeout(use("db"), DB_TIMEOUT).catch(() => null);
        const user = db ? await withTimeout(use("user"), DB_TIMEOUT).catch(() => null) : null;
        const uid = user && typeof user.id === "function" ? await withTimeout(user.id(), DB_TIMEOUT).catch(() => null) : null;
        if (!db) res.reason = "nodb";
        else if (!uid) res.reason = "noid";
        else if (docBytes(req) > DOC_LIMIT) res.reason = "error";
        else {
          const base = `requests/${uid}`, ref = db.doc(`${base}/items/${req.id}`);
          await withTimeout(ref.set(req), DB_TIMEOUT);
          res.stored = "db";
          let n = 0;
          // в хранилище — не больше DB_MAX_PHOTOS снимков (сначала фото, потом кадры); все снимки есть в файле заявки
          const toDb = [...ms.filter((m) => m.kind === "photo"), ...ms.filter((m) => m.kind !== "photo")].slice(0, DB_MAX_PHOTOS);
          for (let k = 0; k < toDb.length; k++) {
            try {
              const m = toDb[k], ph = await photoForDb(m.blob); if (!ph) continue;
              await withTimeout(db.doc(`${base}/items/${req.id}/photos/p${k + 1}`).set({ step: m.step, kind: m.kind, t: m.t ?? null, w: ph.w, h: ph.h, dataUrl: ph.dataUrl }), DB_TIMEOUT);
              n++;
            } catch (e) { if (e && (e.code === "timeout" || e.code === "quota_exceeded" || e.code === "revoked")) break; }
          }
          res.photosStored = n;
          if (n) await withTimeout(ref.update({ photosStored: n }), DB_TIMEOUT).catch(() => {});
          await withTimeout(db.doc(base).set({ lastId: req.id, updatedAt: now.toISOString() }), DB_TIMEOUT).catch(() => {});
        }
      } catch (e) {
        if (res.stored !== "db") res.reason = e && e.code === "timeout" ? "timeout" : "error";
      }
      req.photosStored = res.photosStored;
      try {
        const list = JSON.parse(localStorage.getItem(SENT_KEY) || "[]");
        list.push({ ...req, stored: res.stored });
        localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(-20)));
      } catch {}
      st.lastRequest = req;
      d.sent = res; st.sending = false; st.sendNote = "";
      saveNow();
      st.view = "done"; render(true);
    }
    function openAR() {
      const url = d.sent?.ar || arUrl(arValues(d, getModel()), curPaint());
      let w = null;
      try { w = window.open(url, "_blank"); } catch { w = null; }
      const note = $("[data-ik-ar-note]");
      if (w) { try { w.opener = null; } catch {} if (note) note.textContent = ""; }
      else if (note) { note.textContent = T.ar.blocked + " "; const a = doc.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = (() => { try { return decodeURI(url).replace(/%2C/gi, ","); } catch { return url; } })(); a.className = "ik-ar-link"; note.append(a); }
    }
    async function download() {
      const note = $("[data-ik-dl-note]");
      const req = st.lastRequest || (() => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || "[]").find((x) => x.id === d.sent?.id) || null; } catch { return null; } })();
      if (!req) return;
      const photos = [];
      for (const m of allMedia()) { try { photos.push({ step: m.step, kind: m.kind, t: m.t ?? null, w: m.w, h: m.h, dataUrl: await blobToDataURL(m.blob) }); } catch {} }
      if (note) note.textContent = T.send.making;
      const labels = Object.fromEntries(STEPS.map((s) => [s, T.steps[s].short]));
      let data;
      try { data = await PDF.make(req, photos.filter((p) => p.kind === "photo"), labels); }
      catch { if (note) note.textContent = T.send.pdfFail; return; }
      const r = typeof h.save === "function" ? await h.save(`zayavka-pandus-${req.id}.pdf`, data) : "unavailable";
      if (note) note.textContent = r === "saved" ? T.send.downloaded : r === "declined" ? T.send.declined : T.send.noDownload;
    }
    async function reset() {
      for (const id of [...media.keys()]) removeMedia(id);
      await idb.clear();
      d = emptyDraft(); st.lastApplied = ""; st.lastRequest = null; logEl.replaceChildren();
      saveNow();
    }

    // ---------- переходы ----------
    function go(i) {
      i = Math.max(0, Math.min(STEPS.length - 1, i));
      d.step = i; d.maxStep = Math.max(d.maxStep || 0, i);
      st.capMsg = ""; st.view = "step";
      applyParams(); save(); render(true);
    }
    function next() {
      const id = curStep(), c = stepCheck(id, d, stepMedia(id).length);
      if (!c.ok) {
        st.tried[id] = true; renderNav();
        const r = $("[data-ik-reason]"); r.classList.remove("shake"); void r.offsetWidth; r.classList.add("shake");
        const inp = $("input[data-num]", body);
        if (inp) inp.focus();
        return;
      }
      go(d.step + 1);
    }
    function open() {
      if (st.open) return;
      st.open = true; st.opener = doc.activeElement;
      box.hidden = false; root.classList.add("is-intake");
      st.view = d.sent ? "done" : hasData(d) ? "resume" : "step";
      if (st.view === "step") applyParams();
      render(true);
      if (st.sample === undefined) initAI();
      if (typeof h.onOpen === "function") h.onOpen();
    }
    function close() {
      if (!st.open) return;
      if (st.ctl) st.ctl.abort();
      try { rec?.abort(); } catch {}
      st.listening = false; st.aiOpen = false;
      st.open = false; box.hidden = true;
      root.classList.remove("is-intake", "ik-peek-on");
      saveNow();
      if (typeof h.onClose === "function") h.onClose();
      try { st.opener?.focus?.({ preventScroll: true }); } catch {}
    }

    // ---------- события ----------
    box.addEventListener("click", async (e) => {
      const t = e.target;
      const b = t.closest("button"); if (!b || b.disabled) return;
      if (b.matches("[data-ik-close]")) return close();
      if (b.dataset.ikAct) {
        const a = b.dataset.ikAct;
        if (a === "back") { if (d.step > 0) go(d.step - 1); }
        else if (a === "next") next();
        else if (a === "submit") { const c = stepCheck("send", d, 0); if (c.ok) submit(); }
        else if (a === "cont") { st.view = "step"; applyParams(); await restoreMedia(); render(true); }
        else if (a === "fresh") { if (!(hasData(d)) || confirm(T.resume.freshConfirm)) { await reset(); st.view = "step"; render(true); } }
        else if (a === "again") { await reset(); st.view = "step"; render(true); }
        else if (a === "close") close();
        return;
      }
      if (b.dataset.ikGoto != null) return go(+b.dataset.ikGoto);
      if (b.dataset.ikRole) { d.role = b.dataset.ikRole; save(); const y = body.scrollTop; renderBody(false); body.scrollTop = y; renderNav(); renderProg(); return; }
      if (b.matches("[data-ik-fit]")) { d.width = d.free.trim(); save(); applyParams(); renderBody(false); renderNav(); return; }
      if (b.dataset.ikCap) return pick(b.dataset.ikCap, false);
      if (b.matches("[data-ik-voice]")) return openVoice();
      if (b.matches("[data-ik-ai-close]")) return closeVoice();
      if (b.matches("[data-ik-mic]")) return st.listening ? micStop() : micStart();
      if (b.dataset.ikRm) { removeMedia(b.dataset.ikRm); saveNow(); renderMedia(); return; }
      if (b.dataset.ikQuickK) return quick(b.dataset.ikQuickK);
      if (b.dataset.ikSug) { const [i, k] = b.dataset.ikSug.split(":").map(Number); return takeSuggestion(i, k); }
      if (b.matches("[data-ik-dl]")) return download();
      if (b.matches("[data-ik-ar]")) return openAR();
      if (b.dataset.ikPaint != null) return setPaint(b.dataset.ikPaint || null);
    });
    body.addEventListener("input", (e) => {
      const t = e.target, f = t.dataset?.f; if (!f) return;
      d[f] = t.value; save();
      if (t.dataset.num !== undefined) {
        fitInput(t);
        t.closest(".big-input")?.classList.toggle("bad", parseNum(t.value) === undefined);
        applyParams();
      }
      renderNav();
      if (f === "free" || f === "width") { const fit = $("[data-ik-fit]", body); if (fit) { const v = values(d), same = v.freeWidth != null && v.width === v.freeWidth; fit.hidden = v.freeWidth == null; fit.disabled = same;
        const wi = $('input[data-f="width"]', body); if (f === "free" && wi && !d.width.trim()) { wi.value = num(v.width); fitInput(wi); } fit.textContent = same ? T.fitDone(num(v.freeWidth)) : T.fitFree(num(v.freeWidth)); } }
    });
    body.addEventListener("keydown", (e) => {
      const sw = e.target.closest?.("[data-ik-swatches]");
      if (sw && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const all = $$("[data-ik-paint]", sw), cur = Math.max(0, all.indexOf(doc.activeElement));
        const nx = (cur + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + all.length) % all.length;
        all[nx].focus(); setPaint(all[nx].dataset.ikPaint || null);
        return;
      }
      if (e.key === "Enter" && e.target.matches?.("input[data-f]")) { e.preventDefault(); if (e.target.dataset.num !== undefined) e.target.blur(); else next(); }
    });
    for (const inp of $$("[data-ik-in]")) inp.addEventListener("change", () => onFiles(inp.dataset.ikIn, inp.files));
    $("[data-ik-form]").addEventListener("submit", (e) => {
      e.preventDefault();
      if (st.busy) { st.ctl?.abort(); return; }
      const q = qEl.value.trim(); if (!q) return;
      qEl.value = ""; qEl.style.height = "";
      ask(q, { media: false });
    });
    qEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("[data-ik-form]").requestSubmit(); }
    });
    qEl.addEventListener("input", growQ);
    doc.addEventListener("keydown", (e) => {
      if (!st.open || e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (st.aiOpen) closeVoice();
      else close();
    });
    mqWide.addEventListener?.("change", () => { if (st.open) renderAI(); });

    restoreMedia().then(() => { if (st.open && st.view === "step") { renderMedia(); renderAI(); } });
    return { open, close, isOpen: () => st.open, el: box };
  }

  return {
    T, STEPS, MEDIA_STEPS, PHOTO_REQUIRED, maxPhotos, DB_PHOTO_PLAN, PHOTO_DOC_MAX, DOC_LIMIT,
    parseNum, fitSize, frameCount, frameTimes, defaultWidth, newId, emptyDraft, hasData, values, draftParams,
    AR_BASE, paintRecord, arUrl, arValues,
    stepCheck, firstBlocked, buildRequest, docBytes, parseSuggestions, visibleStream, buildPrompt, modelSummary, withTimeout,
    mount,
  };
}
