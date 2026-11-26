// Собирает один HTML-фрагмент для просмотра в claude.ai Artifact: стили и код встроены,
// three.js грузится с jsDelivr. Запуск: node scripts/build-artifact.mjs → dist/stopgap.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const body = html.split("<!-- BODY:START -->")[1].split("<!-- BODY:END -->")[0];
const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");
// оболочка: тот же выбор, что в index.html (живая по умолчанию, ?skin=classic и ?skin=violet — прежние); витрины с корпусом телефона в артефакте нет
const boot = html.split("<head>")[1].split("</head>")[0].match(/<script>\n[\s\S]*?<\/script>/)[0];
const styles = ["src/styles.css", "src/skin-violet.css", "src/skin-living.css", "src/skin-living-intake.css", "src/map.css", "src/howto.css"];
const code = ["src/ramp.js", "src/drawings.js", "src/cutlist.js", "src/share.js", "src/export.js", "src/scene.js", "src/paints.js", "src/pdffonts.js", "src/pdf.js", "src/ramps-source.js", "src/ramps-layer.js", "src/howto.js", "src/intake.js", "src/mood.js", "src/ui.js", "src/app.js"].map((f) => `// ---- ${f}\n` + strip(read(f))).join("\n");
const out = `<title>GoApsny: Stopgap</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
${styles.map(read).join("\n")}
</style>
${boot}
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
${body}
<script type="module">
${code}
</script>
`;
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/stopgap.html", import.meta.url), out);
console.log("dist/stopgap.html", out.length, "bytes");
