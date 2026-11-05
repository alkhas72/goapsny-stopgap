// Собирает один HTML-фрагмент для просмотра в claude.ai Artifact: стили и код встроены,
// three.js грузится с jsDelivr. Запуск: node scripts/build-artifact.mjs → dist/stopgap.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const body = html.split("<!-- BODY:START -->")[1].split("<!-- BODY:END -->")[0];
const ramp = read("src/ramp.js").replace(/^export /gm, "");
const app = read("src/app.js").replace(/^import .*$/m, "");
const out = `<title>GoApsny: Stopgap</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
${read("src/styles.css")}
</style>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
${body}
<script type="module">
${ramp}
${app}
</script>
`;
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/stopgap.html", import.meta.url), out);
console.log("dist/stopgap.html", out.length, "bytes");
