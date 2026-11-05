// Трафарет «goapsny.org» для GLB в src/ar.js (STENCIL_PNG). Тот же рисунок, что stencilCanvas в src/scene.js,
// но альфа только 0/255 (alphaMode MASK) и полоса 1024×176 по центру картинки 1024×256.
// Запуск: NODE_PATH=$(npm root -g) node scripts/stencil-png.cjs > base64 → вставить в STENCIL_PNG.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const out = await p.evaluate((W) => {
    const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
    const w = W, h = Math.round(W * 176 / 1024), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), text = 'goapsny.org', r = rng(31);
    let fs = 150 * W / 1024;
    const font = (s) => `800 ${s}px "Arial Black", "Helvetica Neue", Arial, system-ui, sans-serif`;
    g.font = font(fs); fs = Math.floor(fs * Math.min(1, (w * 0.94) / g.measureText(text).width)); g.font = font(fs);
    g.textBaseline = 'middle';
    const tw = g.measureText(text).width, x0 = (w - tw) / 2, yM = h * 0.54;
    g.fillStyle = '#fff'; g.fillText(text, x0, yM);
    g.globalCompositeOperation = 'destination-out';
    let x = x0;
    for (const ch of text) { const cw = g.measureText(ch).width; if ('goap'.includes(ch)) g.fillRect(x + cw * 0.47, 0, Math.max(3, fs * 0.07), h); x += cw; }
    const k = W / 1024;
    for (let i = 0; i < 500; i++) { const a = 0.2 + r() * 0.5; g.fillStyle = `rgba(0,0,0,${a > 0.5 ? 1 : 0})`; g.fillRect(r() * w, r() * h, (1 + r() * 2) * k, (1 + r() * 2) * k); }
    // только 0/255 по альфе: под alphaMode MASK и чтобы PNG был маленьким
    const d = g.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] >= 128; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = on ? 255 : 0; }
    g.globalCompositeOperation = 'source-over'; g.putImageData(d, 0, 0);
    const o = document.createElement('canvas'); o.width = 1024; o.height = 256; o.getContext('2d').drawImage(c, 0, 40);
    return o.toDataURL('image/png');
  }, 1024);
  process.stdout.write(out.split(',')[1]);
  await b.close();
})();
