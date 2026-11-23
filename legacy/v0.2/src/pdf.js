import { pdfFonts } from "./pdffonts.js";
// Заявка на пандус в PDF (Алхас, 2026-11-08: «человек JSON читать не будет»): A4, одна-две страницы —
// замер крупно, расчёт, покраска, заметки, снимок примерки; на второй — фото замера с подписями.
// jsPDF грузится с cdnjs только при нажатии «Скачать PDF»; шрифт — Liberation Sans (src/pdffonts.js).
// Единственное объявление верхнего уровня (файлы склеиваются в один артефакт).
export function createPdf() {
  const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  let loading = null;
  function loadJsPDF() {
    if (typeof window !== "undefined" && window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = JSPDF_URL; s.async = true; s.crossOrigin = "anonymous";
      s.onload = () => (window.jspdf && window.jspdf.jsPDF ? res(window.jspdf.jsPDF) : rej(new Error("jspdf")));
      s.onerror = () => { loading = null; rej(new Error("jspdf")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  const INK = [22, 39, 58], MUT = [108, 108, 112], LINE = [218, 218, 224], TINT = [201, 69, 47];
  const nf = (v) => (v == null || !Number.isFinite(+v) ? "—" : String(+(+v).toFixed(4)).replace(".", ","));
  const hexRGB = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const date = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }); };

  // req — заявка из intake.buildRequest; photos — [{ step, w, h, dataUrl }]; labels — подписи шагов
  async function make(req, photos = [], labels = {}) {
    const JsPDF = await loadJsPDF();
    const doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
    const F = pdfFonts();
    doc.addFileToVFS("ls-r.ttf", F.regular); doc.addFont("ls-r.ttf", "LS", "normal");
    doc.addFileToVFS("ls-b.ttf", F.bold); doc.addFont("ls-b.ttf", "LS", "bold");
    const W = 210, H = 297, M = 14, CW = W - 2 * M;
    let y = M;
    const font = (size, bold = false, color = INK) => { doc.setFont("LS", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color); };
    const text = (s, x, yy, o) => doc.text(String(s), x, yy, o);
    const h2 = (s) => { y += 4; font(11, true, MUT); text(s.toUpperCase(), M, y); y += 2; doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5; };
    const kv = (rows, x = M, w = CW) => {
      for (const [k, v] of rows) {
        font(10, false, MUT); text(k, x, y);
        font(11, false, INK);
        const lines = doc.splitTextToSize(String(v || "—"), w - 46);
        text(lines, x + 46, y); y += Math.max(1, lines.length) * 5 + 1.2;
      }
    };
    const para = (s, size = 10.5) => { font(size, false, INK); const lines = doc.splitTextToSize(String(s), CW); for (const l of lines) { if (y > H - M) { doc.addPage(); y = M; } text(l, M, y); y += size * 0.45; } y += 1; };
    const fitImg = (p, x, yy, bw, bh) => {
      const r = p.w > 0 && p.h > 0 ? p.w / p.h : 4 / 3;
      let w = bw, h = bw / r; if (h > bh) { h = bh; w = bh * r; }
      try { doc.addImage(p.dataUrl, "JPEG", x + (bw - w) / 2, yy, w, h, undefined, "FAST"); } catch {}
      return h;
    };

    // ---- шапка
    font(20, true); text("Заявка на приставной пандус", M, y + 6);
    font(11, true); text(`№ ${req.id}`, W - M, y + 1.5, { align: "right" });
    font(10, false, MUT); text(date(req.submittedAt || req.createdAt), W - M, y + 7, { align: "right" });
    y += 12; font(9.5, false, MUT); text("GoApsny: Stopgap · IDLab, Ассоциация «Инва-Содействие»", M, y); y += 3;

    // ---- объект и замерщик
    h2("Объект");
    kv([["Учреждение", req.object.name], ["Адрес", req.object.address], ["Вход", req.object.entrance], ["Замерщик", [req.roleText, req.measurer.name, req.measurer.contact].filter(Boolean).join(" · ")]]);

    // ---- замер крупно: как на рулетке
    h2("Замер, мм (как на рулетке)");
    const ms = req.measure, raw = ms.raw || {};
    const cells = [["Высота А, слева", raw.hl || nf(ms.hl)], ["Высота Б, справа", raw.hr || nf(ms.hr)], ["Свободная ширина", raw.freeWidth || nf(ms.freeWidth)], ["Ширина пандуса", raw.width || nf(ms.width)]];
    const cw = (CW - 9) / 4;
    cells.forEach(([k, v], i) => {
      const x = M + i * (cw + 3);
      doc.setDrawColor(...LINE); doc.setFillColor(246, 246, 249); doc.roundedRect(x, y - 1, cw, 20, 2, 2, "FD");
      font(9, false, MUT); text(k, x + 3, y + 4);
      font(20, true); text(String(v || "—"), x + 3, y + 14);
    });
    y += 24;

    // ---- расчёт и покраска
    h2("Расчёт по рабочей формуле, уклон 1:6");
    const r = req.result, d = r.dims || {}, sk = r.kind === "skew";
    kv([
      ["Тип", sk ? `перекос порога, разница ${nf(Math.abs((req.params.hl || 0) - (req.params.hr || 0)))} мм` : "ровный порог"],
      ["Длина по земле", sk ? `А ${d.left?.ground} мм · Б ${d.right?.ground} мм` : `${d.left?.ground} мм`],
      ["Ребро", r.rib ? `есть, высота ${d.rib?.height} мм` : "нет"],
      ["Общая длина", `${r.totalLen} мм`],
    ]);
    const rgb = hexRGB(req.paint.hex);
    font(10, false, MUT); text("Покраска", M, y);
    if (rgb) { doc.setFillColor(...rgb); doc.setDrawColor(...LINE); doc.roundedRect(M + 46, y - 3.6, 9, 4.6, 1, 1, "FD"); }
    font(11, false, INK); text([req.paint.ral, req.paint.name].filter(Boolean).join(" · ") + (rgb ? `  ${req.paint.hex}` : ""), M + 46 + (rgb ? 11 : 0), y); y += 6;
    if (r.issues && r.issues.length) { y += 1; for (const x of r.issues) { font(10, true, x.level === "error" ? TINT : INK); const ls = doc.splitTextToSize("• " + x.text, CW); text(ls, M, y); y += ls.length * 4.6 + 1; } }

    // ---- заметки
    const notes = [];
    if (req.extra && req.extra.note) notes.push(`Другие места: ${req.extra.note}`);
    for (const n of req.notes || []) notes.push(`${labels[n.step] || n.step}: ${n.text}`);
    if (req.comment) notes.push(`Комментарий: ${req.comment}`);
    if (notes.length) { h2("Заметки"); for (const n of notes.slice(0, 12)) para("• " + n); }

    // ---- примерка — на первой странице, если есть место
    const fit = photos.filter((p) => p.step === "fit");
    const rest = photos.filter((p) => p.step !== "fit");
    if (fit.length) {
      const room = H - M - y - 12;
      if (room < 60) { doc.addPage(); y = M; }
      h2(labels.fit || "Примерка");
      const bh = Math.min(H - M - y, 110);
      y += fitImg(fit[0], M, y, CW, bh) + 3;
    }

    // ---- фото замера: сетка 3×4 с подписями
    const all = [...rest, ...fit.slice(1)];
    if (all.length) {
      doc.addPage(); y = M;
      font(14, true); text(`Фото замера · № ${req.id}`, M, y + 4); y += 10;
      const cols = 3, gap = 4, bw = (CW - gap * (cols - 1)) / cols, bh = bw * 0.75, rowH = bh + 9;
      all.forEach((p, i) => {
        const col = i % cols;
        if (col === 0 && i > 0) y += rowH;
        if (y + rowH > H - M) { doc.addPage(); y = M; }
        const x = M + col * (bw + gap);
        doc.setFillColor(240, 240, 243); doc.rect(x, y, bw, bh, "F");
        const ih = fitImg(p, x, y, bw, bh); void ih;
        font(9, true, INK); text(labels[p.step] || p.step, x, y + bh + 5);
      });
    }
    // номер страницы
    const n = doc.getNumberOfPages();
    for (let k = 1; k <= n; k++) { doc.setPage(k); font(8.5, false, MUT); text(`№ ${req.id} · стр. ${k} из ${n}`, W - M, H - 7, { align: "right" }); }
    return new Uint8Array(doc.output("arraybuffer"));
  }
  return { make, JSPDF_URL };
}
