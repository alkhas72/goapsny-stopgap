// Настроение оболочки: мята, орхидея, лайм, ночь. Хранится в браузере и сразу доходит до соседнего окна
// (витрина ↔ приложение внутри неё): через событие storage, а где хранилище закрыто — сообщением между окнами.
// Ночь включает тёмную тему сцены и списков.
export function createMood() {
  const KEY = "goapsny-stopgap:mood";
  const LIST = ["sage", "orchid", "lime", "night"];
  const NAMES = { sage: "Мята", orchid: "Орхидея", lime: "Лайм", night: "Ночь" };
  const SWATCH = { sage: "#8EC0A1", orchid: "#E88CC8", lime: "#E6EE6C", night: "#1A2420" };
  const BAR = { sage: "#bedec9", orchid: "#f7cbe7", lime: "#f5f9ad", night: "#182620" };
  const d = document.documentElement, subs = new Set();
  const ok = (m) => LIST.includes(m);
  const get = () => (ok(d.dataset.mood) ? d.dataset.mood : "sage");
  function apply(m) {
    d.dataset.mood = m;
    d.dataset.theme = m === "night" ? "dark" : "light";
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => { x.content = BAR[m]; });
    subs.forEach((f) => { try { f(m); } catch {} });
  }
  // Смена настроения человеком: новый цвет расходится кругом от места нажатия (где браузер это умеет).
  // at — { x, y } в координатах окна. Витрина и приложение внутри неё ведут одну общую волну: ведёт витрина,
  // приложение получает ту же точку в своих координатах и тот же радиус, поэтому круг проходит сквозь корпус телефона.
  let pending = null;
  const calm = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } };
  const point = (at) => ({ x: at && Number.isFinite(at.x) ? at.x : innerWidth - 56, y: at && Number.isFinite(at.y) ? at.y : 56 });
  const reach = (p) => Math.ceil(Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y))) + 8;
  function run(m, p, r, commit) {
    if (m === get() || calm() || typeof document.startViewTransition !== "function") return commit();
    d.style.setProperty("--vx", p.x + "px");
    d.style.setProperty("--vy", p.y + "px");
    d.style.setProperty("--vr", (Number.isFinite(r) && r > 0 ? r : reach(p)) + "px");
    d.classList.add("mood-wave");
    pending = m;
    const done = () => { d.classList.remove("mood-wave"); if (pending === m) pending = null; };
    try { document.startViewTransition(commit).finished.then(done, done); } catch { done(); commit(); }
  }
  function lead(m, at) {
    const p = point(at), r = reach(p);
    const frames = [...document.querySelectorAll("iframe.sh-app")];
    const tell = (wave) => frames.forEach((f) => {
      try {
        const b = f.getBoundingClientRect();
        f.contentWindow.postMessage(wave ? { stopgap: "mood", mood: m, at: { x: p.x - b.left, y: p.y - b.top }, r } : { stopgap: "mood", mood: m }, location.origin);
      } catch {}
    });
    const waving = m !== get() && !calm() && typeof document.startViewTransition === "function";
    if (waving) tell(true); // приложение снимает свой кадр одновременно с витриной
    run(m, p, r, () => {
      try { localStorage.setItem(KEY, m); } catch {}
      apply(m);
      try { if (window.parent !== window) window.parent.postMessage({ stopgap: "mood", mood: m }, location.origin); } catch {}
      if (!waving) tell(false);
    });
  }
  function set(m, at) {
    if (!ok(m)) return;
    // Внутри витрины волну ведёт она: приложение просит и ждёт ответа; не дождалось — меняет само.
    if (d.dataset.framed && window.parent !== window && m !== get()) {
      try {
        window.parent.postMessage({ stopgap: "mood-ask", mood: m, at: point(at) }, location.origin);
        setTimeout(() => { if (get() !== m && pending !== m) lead(m, at); }, 260);
        return;
      } catch {}
    }
    lead(m, at);
  }
  addEventListener("storage", (e) => { if (e.key === KEY && ok(e.newValue) && e.newValue !== get() && e.newValue !== pending) apply(e.newValue); });
  addEventListener("message", (e) => {
    const m = e.data;
    if (e.origin !== location.origin || !m || typeof m !== "object" || !ok(m.mood)) return;
    if (m.stopgap === "mood-ask") {
      const f = [...document.querySelectorAll("iframe.sh-app")].find((x) => x.contentWindow === e.source); if (!f) return;
      const b = f.getBoundingClientRect(), a = m.at;
      return lead(m.mood, a && Number.isFinite(a.x) && Number.isFinite(a.y) ? { x: a.x + b.left, y: a.y + b.top } : null);
    }
    if (m.stopgap !== "mood" || m.mood === get() || m.mood === pending) return;
    const a = m.at;
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) run(m.mood, a, m.r, () => apply(m.mood));
    else apply(m.mood);
  });
  // Настроение могли сменить, пока это окно ещё загружалось: сверяемся с хранилищем.
  try { const s = localStorage.getItem(KEY); if (ok(s) && s !== get()) apply(s); } catch {}
  return {
    LIST, NAMES, SWATCH, get, set,
    cycle(at) { const m = LIST[(LIST.indexOf(get()) + 1) % LIST.length]; set(m, at); return m; },
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
}
