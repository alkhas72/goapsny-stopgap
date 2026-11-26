// Режим мастера: только «Новый замер», без конструктора (адрес ?mode=wizard).
// Этим путём мастер открывается внутри карты GoApsny (?embed=1): человек измеряет вход и отправляет заявку,
// рабочее место мастерской (3D, чертёж, раскрой) остаётся в обычном режиме приложения.
// three.js при старте не грузится: он нужен только показу «Как мерить» и подгружается по его открытию.
// Примерка в дополненной реальности открывается отдельной вкладкой (ar.html), как и раньше.
import { createIntake } from "./intake.js";
import { createExport } from "./export.js";
import { createRampsSource } from "./ramps-source.js";
import { loadThree } from "./three-load.js";
import { PARAMS_VERSION } from "./ramp.js";

const d = document.documentElement;
const EMBED = d.dataset.embed === "1" && window.parent !== window;
const EXP = createExport(), GEO = createRampsSource();

// Сообщения карте: только своему адресу. ready — мастер открыт; close — человек закрыл мастер.
const tell = (type, extra) => { if (EMBED) try { window.parent.postMessage({ stopgap: type, ...extra }, location.origin); } catch {} };

// Цвет пандуса: то же место хранения, что у конструктора (ключ и поле paint), чтобы выбор был один на оба режима.
// Конструктора рядом нет, поэтому мастер читает и пишет цвет сам; параметры пандуса в записи не трогает.
const STORE = "goapsny-stopgap:v" + PARAMS_VERSION;
const stored = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
let paint = (() => { const v = stored(); return "paint" in v ? v.paint || null : "#102C54"; })();
const setPaint = (hex) => { paint = hex || null; try { localStorage.setItem(STORE, JSON.stringify({ ...stored(), paint })); } catch {} };

let pf = null;
try { pf = GEO.prefillFromQuery(location.search, { origin: location.origin }); } catch {}
const back = (() => { try { return GEO.safeReturn(pf && pf.returnUrl, location.origin); } catch { return null; } })();

const root = document.getElementById("app");
root.classList.add("is-wizard");
const intake = createIntake().mount(root, {
  exitTo: "map",
  save: (name, data) => EXP.save(name, data),
  loadThree: () => loadThree(),
  getPaint: () => paint,
  onPaint: setPaint,
  onOpen() { tell("ready"); },
  // Закрытие мастера: внутри карты — сказать карте; отдельной страницей — вернуться на карту
  onClose() {
    if (EMBED) return tell("close");
    try { location.assign(back || new URL("../", location.href).toString()); } catch {}
  },
});
intake.open(pf || undefined);
