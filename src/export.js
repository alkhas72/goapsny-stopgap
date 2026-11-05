// Выгрузка файлов: ZIP без сжатия (чертёж SVG + DXF для станка) и сохранение.
// В опубликованном артефакте файл отдаётся через возможность downloads (зритель подтверждает),
// в локальной копии — обычной ссылкой на Blob. Единственное объявление верхнего уровня — фабрика.
export function createExport() {
  const enc = new TextEncoder();
  let crcT = null;
  function crc32(b) {
    if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // files: [{ name, data: string | Uint8Array }] → Uint8Array (ZIP «stored», имена в UTF-8)
  function zip(files, date = new Date()) {
    const dt = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xFFFF;
    const dd = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
    const chunks = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const loc = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
        .forEach(([o, v, n]) => n === 4 ? loc.setUint32(o, v, true) : loc.setUint16(o, v, true));
      const cen = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
        .forEach(([o, v, n]) => n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true));
      chunks.push(new Uint8Array(loc.buffer), name, data);
      central.push(new Uint8Array(cen.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cenLen = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cenLen, 4], [16, off, 4], [20, 0, 2]]
      .forEach(([o, v, n]) => n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
    let p = 0;
    for (const c of all) { out.set(c, p); p += c.length; }
    return out;
  }
  // → "saved" | "declined" | "unavailable"
  async function save(filename, data) {
    const claude = typeof window !== "undefined" ? window.claude : null;
    if (claude && typeof claude.use === "function") {
      let dl = null;
      try { dl = await claude.use("downloads"); } catch { dl = null; }
      if (!dl) return "unavailable";
      try { await dl.save({ filename, data }); return "saved"; }
      catch (e) { return e && e.code === "declined" ? "declined" : "unavailable"; }
    }
    try {
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return "saved";
    } catch { return "unavailable"; }
  }
  return { zip, save, crc32 };
}
