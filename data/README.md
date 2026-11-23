# Данные карты пандусов

Здесь лежит реестр приставных пандусов и договор, по которому карта Stopgap вливается в карту доступности GoApsny.

| Файл | Что это |
| --- | --- |
| `ramps.geojson` | Реестр пандусов. Пока пуст: настоящие адреса вносит Алхас. |
| `ramps.demo.geojson` | Ровно три примера, по одному на состояние. Это не настоящие пандусы. Показываются с пометкой «пример», пока реестр пуст. `?demo=0` их скрывает, `?demo=1` показывает всегда. |

Кроме реестра на карту попадают заявки и текущий черновик мастера «Новый замер» с этого устройства, если у них отмечена точка.

## Реестр: GeoJSON

`FeatureCollection` из точек. Координаты в порядке GeoJSON: `[долгота, широта]`.

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [41.0190, 43.0033] },
  "properties": {
    "place_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "name": "Школа № 3",
    "address": "Сухум, улица, дом",
    "entrance": "главный",
    "status": "installed",
    "hl": 85, "hr": 70, "width": 900, "board": 40, "free_width": 1100,
    "paint_hex": "#102C54", "paint_ral": "RAL 5026", "paint_name": "Pearl Night Blue",
    "measured_at": "2026-09-02", "ordered_at": "2026-09-04", "installed_at": "2026-10-12",
    "place_status": "yellow",
    "note": "Порог с перекосом, слева выше."
  }
}
```

| Свойство | Обязательно | Смысл |
| --- | --- | --- |
| `place_id` или `id` | да | Идентификатор места. `place_id` — uuid из `public.places` GoApsny, если место там уже есть. |
| `status` | да | Состояние пандуса: `measured` (замер), `ordered` (заявка), `installed` (стоит). Статусы плана данных тоже принимаются, см. ниже. |
| `name`, `address`, `entrance` | нет | Место: название, адрес, какой вход. |
| `hl`, `hr` | нет | Высота порога слева (А) и справа (Б), мм. Без `hr` берётся `hl`. |
| `width`, `board`, `free_width` | нет | Ширина пандуса, толщина доски, свободная ширина проёма, мм. |
| `paint_hex`, `paint_ral`, `paint_name` | нет | Покраска. |
| `measured_at`, `ordered_at`, `installed_at` | нет | Даты, ISO 8601. |
| `place_status` | нет | Доступность места в GoApsny: `green`, `yellow`, `red`, `gray`. |
| `note` | нет | Заметка о пороге. Личные данные сюда не пишутся. |

Объект без координат, без известного статуса или без идентификатора на карту не попадает.

## Вид записи (общий для всех источников)

Все источники приводятся к одной записи в `src/ramps-source.js` (`normalize`). Экран карты и слой точек знают только её.

```js
{
  id, place_id,                 // place_id — uuid из places или null
  name, address, entrance, lat, lng,
  status,                       // доступность места: green | yellow | red | gray | null
  ramp_type,                    // portable_available | portable_on_request | none (RampType GoApsny)
  ramp: {
    status,                     // measured | ordered | installed
    hl, hr, width, board, freeWidth,
    paint: { hex, ral, name } | null,
    measured_at, ordered_at, installed_at,
    note, request_id, request_uuid
  },
  source,                       // registry | request | draft | demo
  demo                          // true — пример
}
```

`ramp_type` выводится из состояния пандуса: стоит → `portable_available`, заявка → `portable_on_request`, только замер → `none`.

В запись из заявки этого устройства идут только место и размеры пандуса. Замерщик, контакты, комментарии и фото на карту не попадают (закреплено тестом в `tests/map.test.mjs`).

### Статусы плана данных GoApsny

| Статус в плане | Состояние на карте |
| --- | --- |
| `draft`, `remeasure` | `measured` — замер |
| `submitted` … `ready` | `ordered` — заявка |
| `installed`, `service` | `installed` — стоит |

Сведение делает `statusFromPlan()`. Промежуточные статусы между `submitted` и `ready` перечислены там списком (`accepted`, `approved`, `review`, `in_review`, `queued`, `production`, `in_production`); список надо сверить с планом данных, когда он будет принят. Неизвестный статус на карту не идёт.

## Точка пандуса — центр пина GoApsny

На карте доступности GoApsny пин 28×36 окрашен по доступности места, в центре пина кружок. Кружок пурпурный, если `ramp_type` равен `portable_on_request` или `portable_available`, при любом статусе места. В Stopgap пандус на карте — тот же кружок без пина: пурпурная точка `#7A5AF8` с белой обводкой.

Разметку даёт чистая функция `rampDot()` из `src/ramps-layer.js`:

```js
const { rampDot, PIN } = createRampLayers();

rampDot({ installed: true, size: 20 });           // отдельный <svg> 20×20: маркер, список, легенда
rampDot({ installed, svg: false, ...PIN });       // только круги для <svg> пина 28×36
// PIN = { w: 28, h: 36, cx: 14, cy: 14, r: 5.5, stroke: 2.5 }
// при installed: true это ровно <circle cx="14" cy="14" r="5.5" fill="#7A5AF8" stroke="#FFFFFF" stroke-width="2.5"/>
```

`installed: true` — пандус стоит, точка сплошная. `installed: false` — пандуса ещё нет (заявка или замер), точка рисуется кольцом с белой серединой, чтобы карта не показывала несуществующий пандус как стоящий.

## Прослойка над движком карты: три действия

Весь Leaflet лежит в `src/ramps-layer.js`. Экран карты (`src/map.js`) и мастер (`src/intake.js`) зовут только прослойку:

```js
const view = await createRampLayers().createView(el, { center, zoom, onSelect, onMapClick, onPlace });
view.showPoints(records);       // показать точки
view.selectPoint(id);           // выбрать точку (null — снять выбор)
view.placePoint({ lat, lng });  // поставить точку объекта (null — убрать); нажатие на карту приходит в onPlace
```

Остальные методы обслуживают вид: `setBase`, `setNight`, `fit`, `focus`, `zoomBy`, `showMe`, `resize`, `destroy`. Если общая карта перейдёт на другой движок, переписывается только этот файл. Для карты на Leaflet есть готовый слой: `createRampLayer(L, { onSelect })` возвращает `L.LayerGroup` с `setData(records)` и `select(id)`.

Подложка — OpenStreetMap во всех настроениях. «Ночь» делается фильтром на слое плиток, точки и подписи он не задевает. Carto Voyager оставлена запасным ручным выбором.

## Замена источника

Сейчас данные читаются из файлов и из браузера. При слиянии с GoApsny источник меняется одним адаптером к представлению `ramps.place_card`:

```js
createRampsSource({ adapters: [async () => rows] });   // rows — записи в виде выше, можно без блока ramp, с ramp_type
createMap({ source });                                  // экран карты получает источник
```

## Ссылка «замерить вход» с карты доступности

```
?measure=1&place_id=<uuid>&name=…&address=…&entrance=…&lat=…&lng=…&return=<https-адрес>
```

Разбор — чистая функция `prefillFromQuery(search)` из `src/ramps-source.js`. Она возвращает `{ place, returnUrl }` или `null`, если `measure` не равен `1`.

- `place` — `{ place_id, name, address, entrance, lat, lng }` или `null`, если в ссылке нет ничего о месте. Строки обрезаются, `place_id` принимается только как uuid, плохие координаты отбрасываются.
- `returnUrl` — куда вернуть человека после заявки. Принимается только `https` и только с узлов: тот же сайт, `goapsny.org` с поддоменами, `goapsny-mvp.vercel.app`. Любой другой адрес даёт `null`.

Результат передаётся в мастер: `intake.open({ place, returnUrl })`. Новый черновик начинается с этим местом и точкой, `place_id` уходит в заявку как `object.place_id`, точка — как `object.geo = { lat, lng, src: "tap" | "gps", acc? }`. На экране «Заявка отправлена» при наличии `returnUrl` появляется ссылка «Вернуться на карту», автоперехода нет.

Новые заявки несут поле `uuid` (в плане данных `request_id` — uuid). Прежний короткий номер `id` вида `r…` остаётся.
