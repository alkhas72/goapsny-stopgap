// Палитра OSOKA UR 305 — одна на всё приложение: 3D, мастер замера, AR-примерка.
//
// Откуда коды (Алхас, 2026-11-05: «конкретные цвета краски Осока, которая у нас есть»):
//   паспорт проекта из диалога с Gemini, раздел «4. Палитра корпоративных цветов (Колеровка OSOKA UR 305)»,
//   «Утверждённые коды для заказа краски у производителя (DGENERX)» —
//   ramps/sources/gemini-dialog-StopgapABH-notebooklm.txt, около строки 3497; то же в ramps/osoka-paint-techcard.md, строка 93.
//   Заказ DGENERX оплачен 2026-06-22, состав заказа в письме не указан. Наличие в цеху НЕ подтверждено:
//   как только Алхас назовёт банки, которые есть, — поставить stock: true нужным строкам (или убрать лишние).
// Экранный цвет: RAL Classic — общепринятые sRGB-приближения (веер, не экран, — эталон);
//   RAL Design — пересчёт из самого кода (H L C = тон, светлота, насыщенность CIELCh, D65) в sRGB.
//   Английские названия RAL Design — из того же диалога, не сверены с веером.
// Единственное объявление верхнего уровня (файлы склеиваются в один артефакт).
export function createPaints() {
  const LIST = [
    { hex: "#102C54", ral: "RAL 5026", name: "Pearl Night Blue", ru: "перламутровый ночной синий", stock: null },
    { hex: "#D53032", ral: "RAL 3018", name: "Strawberry Red", ru: "клубнично-красный", stock: null },
    { hex: "#A12312", ral: "RAL 3013", name: "Tomato Red", ru: "томатно-красный", stock: null },
    { hex: "#F39F18", ral: "RAL 1037", name: "Sun Yellow", ru: "солнечно-жёлтый", stock: null },
    { hex: "#F3DA0B", ral: "RAL 1021", name: "Colza Yellow", ru: "рапсово-жёлтый", stock: null },
    { hex: "#9D9101", ral: "RAL 1027", name: "Curry", ru: "карри", stock: null },
    { hex: "#C35831", ral: "RAL 2013", name: "Pearl Orange", ru: "перламутровый оранжевый", stock: null },
    { hex: "#1C542D", ral: "RAL 6035", name: "Pearl Emerald Green", ru: "перламутровый изумрудный", stock: null },
    { hex: "#89AC76", ral: "RAL 6013", name: "Reed Green", ru: "тростниково-зелёный", stock: null },
    { hex: "#6C6874", ral: "RAL 4012", name: "Pearl Blackberry", ru: "перламутровый ежевичный", stock: null },
    { hex: "#262626", ral: "RAL 000 15 00", name: "Ink Black", ru: "чернильно-чёрный", stock: null },
    { hex: "#55615E", ral: "RAL 180 40 05", name: "Earth Green", ru: "землисто-зелёный", stock: null },
    { hex: "#7CB2D5", ral: "RAL 250 70 25", name: "Meadow Blossom Blue", ru: "голубой", stock: null },
    { hex: "#312E3D", ral: "RAL 300 20 10", name: "Heron Blue", ru: "глубокий тёмно-синий", stock: null },
  ];
  const RAW = { hex: null, ral: "Без покраски", name: "Натуральное дерево", ru: "натуральное дерево", stock: null };
  // stock: null — не подтверждено; true — банка есть в цеху; false — нет
  const STOCK_NOTE = "Утверждённый список для заказа OSOKA. Какие банки есть в цеху, пока не подтверждено.";
  const norm = (hex) => (hex == null || hex === "" ? null : "#" + String(hex).trim().replace(/^#/, "").toUpperCase());
  const list = (withRaw = true) => (withRaw ? LIST.concat(RAW) : LIST.slice());
  const find = (hex) => { const h = norm(hex); return h ? LIST.find((p) => p.hex === h) || null : RAW; };
  return { list, find, norm, RAW, STOCK_NOTE };
}
