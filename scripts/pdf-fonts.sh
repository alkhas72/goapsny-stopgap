#!/bin/sh
# Шрифт для PDF-заявки: Liberation Sans (SIL Open Font License 1.1), подмножество — латиница, кириллица, знаки.
# Нужны fonttools (pyftsubset) и шрифты Liberation (Debian/Ubuntu: fonts-liberation2). Запуск: sh scripts/pdf-fonts.sh
set -e
T=$(mktemp -d)
for w in Regular Bold; do
  pyftsubset /usr/share/fonts/truetype/liberation/LiberationSans-$w.ttf \
    --unicodes="U+0020-007E,U+00A0-00BF,U+00D7,U+0401-045F,U+2010-2026,U+2116,U+2212" \
    --output-file=$T/$w.ttf --no-hinting --desubroutinize --layout-features=''
done
{
  echo "// Сгенерировано scripts/pdf-fonts.sh — не править руками."
  echo "// Liberation Sans, Copyright (c) 2012 Red Hat, Inc.; Digitized data (c) 2010 Google Corporation. SIL Open Font License 1.1."
  echo "// Единственное объявление верхнего уровня (файлы склеиваются в один артефакт)."
  printf 'export function pdfFonts() {\n  return {\n    regular: "%s",\n    bold: "%s",\n  };\n}\n' "$(base64 -w0 $T/Regular.ttf)" "$(base64 -w0 $T/Bold.ttf)"
} > src/pdffonts.js
rm -r "$T"
echo "src/pdffonts.js $(wc -c < src/pdffonts.js) bytes"
