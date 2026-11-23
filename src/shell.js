// Витрина на компьютере (по эталону «Суфлёр АИС»): корпус iPhone 392 px на живом фоне, причал с настроениями
// и кнопка «Во весь экран». Внутри корпуса — то же самое приложение в окне iframe: оно видит ширину телефона
// и раскладывается как на телефоне, а «во весь экран» растягивает окно, и приложение само переходит в широкий вид.
// На телефонах и планшетах витрины нет (см. index.html): приложение занимает экран целиком.
import { createMood } from "./mood.js";

const d = document.documentElement;
const MOOD = createMood();
const KEY = "goapsny-stopgap:shell";
const narrow = matchMedia("(max-width: 540px)");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ico = (p, w = 2) => `<svg class="sh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  expand: ico('<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>'),
  cube: ico('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>', 1.9),
  pin: ico('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500c0 5.300 7 11.500 7 11.500z"/><circle cx="12" cy="9.500" r="2.500"/>', 1.9),
  plus: ico('<path d="M12 5v14M5 12h14"/>', 2.2),
  arrow: ico('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.1),
};

const src = location.pathname + location.search + location.hash;
const root = document.createElement("div");
root.className = "sh";
root.innerHTML = `
  <div class="desktop-stage" aria-hidden="true">
    <div class="bg-blob blob-1"></div><div class="bg-blob blob-2"></div><div class="bg-blob blob-3"></div>
  </div>

  <aside class="desktop-dock" aria-label="Оформление витрины">
    <div class="desktop-brand">
      <span class="desktop-logo">Stopgap</span>
      <span class="desktop-tag">GoApsny · приставные пандусы</span>
    </div>
    <div class="mood-pills" role="radiogroup" aria-label="Настроение цвета">
      ${MOOD.LIST.map((m) => `<button type="button" class="mood-dot" role="radio" data-mood-set="${m}" aria-label="${esc(MOOD.NAMES[m])}" title="${esc(MOOD.NAMES[m])}" style="--c:${MOOD.SWATCH[m]}"></button>`).join("")}
    </div>
    <button type="button" class="desktop-shell-btn" data-shell-to="full" title="Развернуть приложение на всё окно">${I.expand}<span>Во весь экран</span></button>
  </aside>

  <section class="sh-side sh-left" aria-label="О приложении">
    <p class="sh-micro">Конструктор IDLab</p>
    <h2 class="sh-head">Пандус<br>под ваш<br>вход<span class="sh-spark" aria-hidden="true"></span></h2>
    <p class="sh-lead">Два замера высоты порога, и приложение считает пандус с уклоном 1:6, показывает сборку в 3D и отдаёт чертёж.</p>
    <ol class="sh-steps">
      <li><b>1</b><span>Замер</span></li>
      <li><b>2</b><span>Расчёт</span></li>
      <li><b>3</b><span>Сборка</span></li>
    </ol>
  </section>

  <div class="phone-frame">
    <div class="phone-chrome" aria-hidden="true">
      <span class="chrome-time" data-time>9:41</span>
      <div class="dynamic-island" data-island><span class="island-dot"></span></div>
      <div class="chrome-icons">
        <svg viewBox="0 0 18 12" width="16" height="11" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
        <svg viewBox="0 0 24 12" width="22" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1.5" width="19" height="9" rx="2.5"/><rect x="3" y="3.5" width="14" height="5" rx="1" fill="currentColor" stroke="none"/><path d="M22 4.5v3" stroke-linecap="round"/></svg>
      </div>
    </div>
    <div class="phone-viewport">
      <iframe class="sh-app" title="GoApsny: Stopgap, конструктор пандусов" src="${esc(src)}" allow="camera; microphone; xr-spatial-tracking; accelerometer; gyroscope; magnetometer; fullscreen; clipboard-write; geolocation; web-share"></iframe>
    </div>
    <div class="home-indicator" aria-hidden="true"></div>
  </div>

  <nav class="sh-side sh-right" aria-label="Быстрые действия">
    <p class="sh-micro">Открыть сразу</p>
    <button type="button" class="sh-go go-pink" data-go="home"><span class="sh-go-ico">${I.cube}</span><span class="sh-go-t"><b>Конструктор</b><small>3D-модель и размеры</small></span></button>
    <button type="button" class="sh-go go-dark" data-go="map"><span class="sh-go-ico">${I.pin}</span><span class="sh-go-t"><b>Карта пандусов</b><small>Замеры, заявки, установленные</small></span></button>
    <button type="button" class="sh-go go-lime" data-go="intake"><span class="sh-go-ico">${I.plus}</span><span class="sh-go-t"><b>Новый замер</b><small>Мастер, AR-примерка, отправка</small></span></button>
    <p class="sh-note">На телефоне приложение открывается сразу во весь экран, без рамки.</p>
  </nav>`;
document.body.appendChild(root);

const $ = (s) => root.querySelector(s);
const frame = $(".sh-app"), islandEl = $("[data-island]"), timeEl = $("[data-time]"), chrome = $(".phone-chrome");
const win = () => frame.contentWindow;
const post = (msg) => { try { win().postMessage({ stopgap: msg.type, ...msg }, location.origin); } catch {} };

// ---- вид: корпус телефона или во весь экран ----
function framed() { return narrow.matches ? null : d.dataset.shell === "full" ? "full" : "phone"; }
function syncFramed() {
  try {
    const fd = frame.contentDocument && frame.contentDocument.documentElement; if (!fd) return;
    const f = framed();
    if (f) fd.dataset.framed = f; else delete fd.dataset.framed;
  } catch {}
}
function setShell(to) {
  d.dataset.shell = to === "full" ? "full" : "phone";
  try { localStorage.setItem(KEY, d.dataset.shell); } catch {}
  syncFramed();
}
root.addEventListener("click", (e) => {
  const sh = e.target.closest("[data-shell-to]"); if (sh) return setShell(sh.dataset.shellTo);
  const md = e.target.closest("[data-mood-set]"); if (md) { const r = md.getBoundingClientRect(); return MOOD.set(md.dataset.moodSet, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }
  const go = e.target.closest("[data-go]"); if (go) { post({ type: "go", to: go.dataset.go }); try { frame.focus(); } catch {} }
});
frame.addEventListener("load", syncFramed);
narrow.addEventListener?.("change", syncFramed);

// ---- настроение: точки причала и приложение меняются вместе ----
function paintMood(m) {
  root.querySelectorAll("[data-mood-set]").forEach((b) => { const on = b.dataset.moodSet === m; b.classList.toggle("active", on); b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
}
paintMood(MOOD.get());
MOOD.onChange(paintMood);
$(".mood-pills").addEventListener("keydown", (e) => {
  const k = e.key; if (k !== "ArrowRight" && k !== "ArrowLeft") return;
  e.preventDefault();
  const i = MOOD.LIST.indexOf(MOOD.get()), n = MOOD.LIST.length;
  const m = MOOD.LIST[(i + (k === "ArrowRight" ? 1 : n - 1)) % n];
  MOOD.set(m); root.querySelector(`[data-mood-set="${m}"]`)?.focus();
});

// ---- сообщения от приложения: остров оживает во время сборки, кнопка «Телефон» возвращает корпус ----
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.source !== win() || !e.data || typeof e.data !== "object") return;
  const m = e.data;
  if (m.stopgap === "island") islandEl.classList.toggle("active", !!m.on);
  else if (m.stopgap === "shell") setShell(m.to);
  else if (m.stopgap === "screen") chrome.classList.toggle("on-paper", m.name !== "home");
});

// ---- адрес: код конфигурации (#s1-...) живёт в адресе витрины и доходит до приложения ----
addEventListener("hashchange", () => { try { if (win().location.hash !== location.hash) win().location.replace(location.pathname + location.search + location.hash); } catch {} });

// ---- корпус телефона чуть поворачивается за курсором, пока тот гуляет по полям витрины; над приложением выпрямляется ----
const phone = $(".phone-frame");
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let raf = 0, tx = 0, ty = 0;
  const paint = () => { raf = 0; phone.style.setProperty("--tilt-x", tx.toFixed(2) + "deg"); phone.style.setProperty("--tilt-y", ty.toFixed(2) + "deg"); };
  const aim = (x, y) => { tx = x; ty = y; if (!raf) raf = requestAnimationFrame(paint); };
  addEventListener("pointermove", (e) => {
    if (d.dataset.shell !== "phone" || e.pointerType === "touch") return;
    const r = phone.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
    aim(Math.max(-5, Math.min(5, dx * 12)), Math.max(-4, Math.min(4, -dy * 9)));
  }, { passive: true });
  phone.addEventListener("pointerenter", () => aim(0, 0));
  d.addEventListener("pointerleave", () => aim(0, 0));
}

// ---- живые часы в строке состояния ----
function tick() { const t = new Date(); timeEl.textContent = t.getHours() + ":" + String(t.getMinutes()).padStart(2, "0"); }
tick(); setInterval(tick, 15000);
