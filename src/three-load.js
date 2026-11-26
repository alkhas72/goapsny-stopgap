// three.js r147 с jsDelivr: один раз на страницу, без document.write.
// Конструктору нужны three.min.js и OrbitControls.js (src/boot.js грузит их до приложения),
// мастеру в режиме ?mode=wizard хватает одного three.min.js, и только для показа «Как мерить».
const CDN = "https://cdn.jsdelivr.net/npm/three@0.147.0/";
const CORE = CDN + "build/three.min.js", CONTROLS = CDN + "examples/js/controls/OrbitControls.js";
const pages = new WeakMap();                              // запросы по страницам: на каждую свой набор

function script(doc, src) {
  let jobs = pages.get(doc); if (!jobs) pages.set(doc, (jobs = new Map()));
  if (jobs.has(src)) return jobs.get(src);
  const job = new Promise((resolve, reject) => {
    const s = doc.createElement("script");
    s.src = src; s.async = false;                       // порядок выполнения как в разметке: сначала three, потом управление камерой
    s.onload = () => resolve();
    s.onerror = () => { jobs.delete(src); s.remove(); reject(new Error("three")); };
    doc.head.appendChild(s);
  });
  jobs.set(src, job);
  return job;
}

export function loadThree({ controls = false, doc = document, win = window } = {}) {
  const core = win.THREE ? Promise.resolve() : script(doc, CORE);
  const extra = !controls || (win.THREE && win.THREE.OrbitControls) ? Promise.resolve() : script(doc, CONTROLS);
  return Promise.all([core, extra]).then(() => { if (!win.THREE) throw new Error("three"); return win.THREE; });
}
