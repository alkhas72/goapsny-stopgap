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
  // at — { x, y } в координатах окна; соседнее окно (витрина ↔ приложение) получает настроение без своей волны.
  function set(m, at) {
    if (!ok(m)) return;
    const commit = () => {
      try { localStorage.setItem(KEY, m); } catch {}
      apply(m);
      const msg = { stopgap: "mood", mood: m };
      try { if (window.parent !== window) window.parent.postMessage(msg, location.origin); } catch {}
      document.querySelectorAll("iframe.sh-app").forEach((f) => { try { f.contentWindow.postMessage(msg, location.origin); } catch {} });
    };
    const calm = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } })();
    if (m === get() || calm || typeof document.startViewTransition !== "function") return commit();
    d.style.setProperty("--vx", (at && Number.isFinite(at.x) ? at.x : innerWidth - 56) + "px");
    d.style.setProperty("--vy", (at && Number.isFinite(at.y) ? at.y : 56) + "px");
    d.classList.add("mood-wave");
    try {
      const t = document.startViewTransition(commit);
      const done = () => d.classList.remove("mood-wave");
      t.finished.then(done, done);
    } catch { d.classList.remove("mood-wave"); commit(); }
  }
  addEventListener("storage", (e) => { if (e.key === KEY && ok(e.newValue) && e.newValue !== get()) apply(e.newValue); });
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || e.data.stopgap !== "mood") return;
    if (ok(e.data.mood) && e.data.mood !== get()) apply(e.data.mood);
  });
  return {
    LIST, NAMES, SWATCH, get, set,
    cycle(at) { const m = LIST[(LIST.indexOf(get()) + 1) % LIST.length]; set(m, at); return m; },
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
}
