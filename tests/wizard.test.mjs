// Режим мастера (?mode=wizard): загрузка three.js по требованию и разметка входа в режим.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadThree } from "../src/three-load.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// Подставная страница: скрипты «загружаются» сразу, three.min.js кладёт THREE в окно
function fakePage({ fail = false } = {}) {
  const win = {}, added = [];
  const doc = {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: {
      appendChild(s) {
        added.push(s);
        queueMicrotask(() => {
          if (fail) return s.onerror();
          if (/three\.min\.js$/.test(s.src)) win.THREE = {};
          if (/OrbitControls\.js$/.test(s.src) && win.THREE) win.THREE.OrbitControls = function () {};
          s.onload();
        });
      },
    },
  };
  return { win, doc, added };
}

test("three.js для показа «Как мерить»: один файл, один запрос на сколько угодно вызовов", async () => {
  const { win, doc, added } = fakePage();
  const [a, b] = await Promise.all([loadThree({ doc, win }), loadThree({ doc, win })]);
  assert.equal(a, win.THREE);
  assert.equal(b, win.THREE);
  assert.equal(added.length, 1);
  assert.match(added[0].src, /three@0\.147\.0\/build\/three\.min\.js$/);
  await loadThree({ doc, win });
  assert.equal(added.length, 1, "three уже в окне: новых запросов нет");
});

test("three.js для конструктора: с управлением камерой, порядок как в разметке", async () => {
  const { win, doc, added } = fakePage();
  await loadThree({ controls: true, doc, win });
  assert.deepEqual(added.map((s) => s.src.split("/").pop()), ["three.min.js", "OrbitControls.js"]);
  assert.ok(added.every((s) => s.async === false), "скрипты выполняются по порядку");
  assert.equal(typeof win.THREE.OrbitControls, "function");
});

test("three.js не загрузился: ошибка, повторный вызов пробует снова", async () => {
  const bad = fakePage({ fail: true });
  await assert.rejects(loadThree({ doc: bad.doc, win: bad.win }), /three/);
  assert.equal(bad.added[0].removed, true);
  await assert.rejects(loadThree({ doc: bad.doc, win: bad.win }), /three/);
  assert.equal(bad.added.length, 2);
});

test("вход в режим мастера: без document.write, three не стоит в разметке, сборка одним файлом берёт первый блок", () => {
  const html = read("index.html"), boot = read("src/boot.js"), wizard = read("src/wizard.js");
  assert.doesNotMatch(html, /document\.write/);
  assert.doesNotMatch(html, /<script src="[^"]*three/);
  assert.match(html, /q\.get\("mode"\) === "wizard"/);
  assert.match(html, /q\.get\("embed"\) === "1"/);
  assert.match(boot, /dataset\.mode === "wizard"\) import\("\.\/wizard\.js"\)/);
  assert.match(boot, /loadThree\(\{ controls: true \}\)/);
  assert.match(wizard, /exitTo: "map"/);
  assert.match(wizard, /getPaint:/);
  assert.match(wizard, /onPaint:/);
  // сборка одним файлом (scripts/build-artifact.mjs) берёт первый блок <script> с переводом строки: это выбор оболочки
  const first = html.split("<head>")[1].split("</head>")[0].match(/<script>\n[\s\S]*?<\/script>/)[0];
  assert.match(first, /dataset\.skin/);
  assert.doesNotMatch(first, /preload/);
});

test("после разделения с картой: своей карты пандусов на пути человека нет, первый шаг без «Где ещё нужен пандус»", () => {
  const app = read("src/app.js"), ui = read("src/ui.js"), shell = read("src/shell.js"), intake = read("src/intake.js"), build = read("scripts/build-artifact.mjs");
  assert.doesNotMatch(app, /from "\.\/map\.js"/);
  assert.doesNotMatch(app, /createMap/);
  assert.match(app, /prefillFromQuery/, "вход в замер по ссылке с карты GoApsny остаётся");
  assert.doesNotMatch(ui, /data-map-open/);
  assert.doesNotMatch(shell, /data-go="map"/);
  assert.doesNotMatch(build, /src\/map\.js/);
  assert.match(intake, /o \+= mediaHTML\("overview"\);/);
  assert.doesNotMatch(intake, /mediaHTML\("overview"\) \+ extraHTML\(\)/);
});
