# maps — гео-провайдер и рендер карт (cloudFRT)

Гео-микросервис cloudFRT (9-й МС, `name='maps'`) на шине micromq. Провайдер
картографических данных (OpenStreetMap) **и** единая точка рендера HTML-карт
(MapLibre GL) для всего cloudFRT. Портирован из TREK `mapsService.ts`.

## Возможности

### 🗺️ Рендер карт — единая точка для всего cloudFRT
Общий рендер карты живёт **только здесь** (не дублируется в других МС):
- **`GET /maps/map`** — интерактивная HTML-страница карты гео-объектов: выбор категории POI,
  по видимой области (bbox) грузит `/maps/pois` (Overpass) и рисует маркеры.
- **RPC `maps:map`** (сервис-2-сервис по шине) — trips берёт карту поездки
  (`GET /trips/map/:id`) через этот RPC и подставляет **свои** места.
- **`service/renderMapHtml.js`** — единая генерация HTML: MapLibre GL 4.4.0 (CDN unpkg) +
  стиль **OpenFreeMap Liberty** (`https://tiles.openfreemap.org/styles/liberty`) +
  JS `window.MapsRender.*`. Используется и RPC, и контроллером напрямую.
- **JS `window.MapsRender`**: `renderMap` (простой контракт — добавление маркеров),
  `createMap` / `setPoints` / `addPoints` / `clearPoints` / `fitToPoints`
  (интерактивный режим: сброс + добавление + fitBounds). Опции: `center` (по умолчанию
  `[37.62, 55.75]`), `zoom` (5), `markerColor` (`#e11d48`), `styleUrl`, `fitBoundsPadding` (48),
  `fitBoundsMaxZoom` (14). Точки: `lat`/`lng` обязательны, поддерживают
  `name` / `address` / `note` / `day`.
- **Локализация подписей**: собственная функция (не внешний плагин). Каждый
  symbol-слой получает text-field на ОДНОМ заданном языке (`name:ru`, `name:en`, …)
  — никаких пар `latin + nonlatin` (без «EN + RU»). Опция `language`: `'ru'`
  (по умолчанию — работаем с Россией), `'auto'` (язык браузера посетителя) или явный
  iso-код (`ru`, `en`, `de`, `fr`, …). Пробрасывается в RPC `maps:map` и `GET /maps/map`
  через `meta`/query.
- **Тулбар-контролы** (self-contained, по мотивам `@mapbox-controls/*`, совместимы с MapLibre GL,
  без внешних npm-зависимостей):
  - 🧭 **Компас** — кнопка, `map.easeTo({bearing:0, pitch:0})` (вернуть на север);
  - 📏 **Линейка** — клики по карте рисуют ломаную с подписями расстояний
    (haversine, км/м); промежуточные точки — накопленная длина сегментов,
    последняя точка — **общая длина всей ломаной** («<км> итого»);
    публичный API: `map._frtRuler` =
    `{activate, deactivate, toggle, addPoint(lnglat), reset}`
    (для интеграций/тестов).
  - 🏷 **Тултип** — при наведении на маркер показывает имя места (popup остаётся по клику).
  - 🛰 **Виды карты** — переключатель «Стандартная / Спутниковая»: стандартная —
    OpenFreeMap Liberty (с локализацией подписей); спутниковая — Esri World Imagery
    (растровые снимки + подписи поверх), без внешних API-ключей. Активная кнопка
    подсвечена, переживает перезагрузку стиля. Опция `styles: false` — скрыть.
  - 📥 **Экспорт карты в PNG** — кнопка «Скачать карту как PNG»: открывает модалку
    с превью, экспорт через плагин `maplibre-gl-map-to-image` (CDN unpkg @1.2.0,
    depends on `html-to-image`). Опция `export: false` — скрыть.
  - 🛠 **Панель «Инструменты» (редактор)** — раскрывающийся блок: линейка, текст,
    точка, маркер, рисование фигур (линия/полигон/прямоугольник/круг/от руки/
    повёрнутый/линия от руки), выделение/удаление/undo/redo и экспорт GeoJSON.
    По умолчанию свёрнута (кнопки скрыты, показываются по клику на тумблер).
    Подробно — в разделе «Панель Инструменты» ниже. Скрывается `hideControls:true`.
  Опции: `controlsPosition` (по умолчанию `'top-right'`), `hideControls` (`false`),
  `styles` (default `true`), `export` (default `true`).

#### 📥 Экспорт карты в PNG (клиентский)
Кнопка 📥 в тулбаре → модалка с превью → «Скачать PNG» (свежий жест пользователя
гарантирует download без user-activation-блокировки браузера). Механика —
`maplibre-gl-map-to-image@1.2.0`: `window.MapLibreGLMapToImage.toElement(map, opts)`
рендерит карту + маркеры в PNG/JPEG/SVG, результат кладёт в `src` скрытого
`<img id="frt-map-export-img">`. Имя файла `frt-map-YYYY-MM-DD_HH-MM.png`.

> ⚠️ **Два бага плагина, обойдены в `makeExport`:**
> (1) при `coverEdits:false` плагин не создаёт `map._canvasContextAttributes`,
> но в `.then` всегда пишет `_canvasContextAttributes.preserveDrawingBuffer`
> → TypeError. Фикс: `if (!map._canvasContextAttributes) map._canvasContextAttributes = {};`
> перед вызовом.
> (2) плагин ждёт `map.once('idle')`; статичная/заснувшая карта (спутник,
> рендер-растры не обновляются) никогда не шлёт `idle` → промис висит вечно,
> кнопка «застревает». Фикс: «будильник» — микро-прыжок центра туда-обратно
> (~0.8с после старта) форсирует реальный рендер → `idle` → плагин резолвится.

#### 🛠 Панель «Инструменты» — редактор гео-объектов (рисуем/редактируем/экспорт)
На всех картах, где не `hideControls`, в позиции `controlsPosition` (по умолчанию
`top-right`) добавлена раскрывающаяся панель **«Инструменты»** (`makeToolsPanel`):
кнопка тумблер раскрывает группу — линейка, текст, точка, маркер, рисование
фигур, выделение/удаление/undo/redo и экспорт GeoJSON. По умолчанию все кнопки
панели скрыты и показываются по клику на «Инструменты».

**Инструменты панели (`makeToolsPanel`, собирает перечисленные ниже):**

- 📏 **Линейка** — клики рисуют ломаную с подписями расстояний (haversine,
  км/м); промежуточные точки — накопленная длина, последняя — общая
  («<км> итого»). Публичный API: `map._frtRuler`
  `{activate, deactivate, toggle, addPoint(lnglat), reset}`.
- ✏️ **Добавить текст** — клик по карте → попап-инпут «Введите текст» → сохраняется
  как Point-Feature с `properties.text` в `map._frtTextFeatures` (слои текста
  рендерит `frtRenderTextLayer`, пересоздаётся на `style.load`).
- 📍 **Поставить точку** — клик ставит маркер-точку (`_frtPointMarkers`).
  Публичный API: `MapsRender.frtGetPoints(map)` / `frtSetPoints` / `frtClearPoints`
  (массив `{lng, lat, _frtId}`).
- 📌 **Поставить маркер** — клик ставит маркер-пин (`_frtMarkerMarkers`, отличный
  от точки). Публичный API: `MapsRender.frtGetMarkers(map)` / `frtSetMarkers` /
  `frtClearMarkers` (`{lng, lat, _frtId}`).
- **Рисование фигур** (кнопка — toggle режима, клики по карте рисуют):
  - **Линия** (`LineString`, `map._frtLineString`)
  - **Полигон** (`map._frtPolygon`)
  - **Прямоугольник** (`map._frtRectangle`)
  - **Круг** (`map._frtCircle`, хранится центр+радиус)
  - **От руки** (freehand-полигон, `map._frtFreehand`, ломаная вершин `pts`)
  - **Повёрнутый** (повёрнутый прямоугольник, `map._frtAngledRect`)
  - **Линия от руки** (freehand-линия, `map._frtFreehandLine`, `pts`)
  Каждый держит `features[]`, API `getById`/`removeById`/`getFeatures`/`restore`.
- **Менеджер (Select/Delete/Undo/Redo)** — `map._frtManager`:
  - **Выбрать** — клик по фиче подсвечивает её (`highlightFeature`, синий контур +
    вершины-точки);
  - **Удалить** — удаляет выбранную фичу (из того инструмента, которому она
    принадлежит по `_frtId`);
  - **Отменить / Вернуть** — истории `undoStack`/`redoStack` (откат добавления,
    удаления, изменения фич).
- 📥 **Скачать GeoJSON** — `exportGeoJSON()` собирает **все** рисованные фигуры
  (линии/полигоны/прямоугольники/круги/от руки/повёрнутые/линии от руки) +
  точки (`_tool:'point'`) + маркеры (`_tool:'marker'`) + текст в один
  `FeatureCollection` и скачивает `map-features.geojson`. Нормализация:
  круг → полигон (64 сегмента), прямоугольник → полигон по min/max углам,
  от руки → полигон (замкнутый ring), линия от руки → `LineString`.

> ℹ️ **Отличие панели «Инструменты» от остальных контролов.** Экспорт PNG,
> компас, виды карты, тултип — отдельные постоянные контролы (видно всегда).
> Панель «Инструменты» — раскрывающийся редактор: по умолчанию свёрнут,
> все кнопки скрыты, становятся видны по клику на тумблер.

#### 🖼️ OG-превью поездки (серверный рендер, headless Chromium)
При шеринге ссылки на поездку соцсети показывают её карту с маркерами 1:1
(тот же код рендера, что видит пользователь), размер `1200×630`:

- `trips GET /trips/:id/og-image` — грузит поездку + места → RPC `maps:og` → PNG;
- `maps:og` / **`service/ogExport.js`** — рендер во headless Chromium (Playwright):
  HTML через `renderMapHtml` (`hideControls:true`, `styles:false`, `export:false`),
  boot-скрипт `MapsRender.createMap` → `setPoints(маркеры)` → ждёт `window.__frtOG`
  (maplibregl + style + tiles + места) → скриншот контейнера.
- **бинарный ответ**: шина сериализует JSON, поэтому МС отдаёт
  `{ __frtBase64, contentType:'image/png' }`, а Gateway
  (`core/micromq/src/Gateway.js`) декодирует в Buffer и пишет настоящие байты.
- **таймаут**: headless-рендер ~7–28 с → `TIMED_OUT` поднят 15с→60с
  (корневой `.env` и `trips/.env`), иначе Gateway режет 408.
- **кэш**: `trips/service/ogCache.js` → `cloudFRT/og-cache/<tripId>.png` (TTL 7 дней,
  инвалидация при изменении трипа/мест). Холодный рендер ~28 с, из кэша — миллисекунды.
- Playwright установлен отдельно (`npm i playwright --no-save` + `npx playwright install
  chromium`); осознанно не в `package.json` (нужен только для OG-рендера).

> ⚠️ **Шрифт подписей линейки.** `text-font` symbol-слоя обязан быть из набора глифов
> стиля (поле `glyphs`), иначе MapLibre молча не рисует текст. Для OpenFreeMap Liberty
> это Noto Sans (Regular/Bold/Italic) — Roboto там нет, не использовать.

> ⚠️ **self-RPC нельзя.** Внутри maps-контроллера нельзя звать `app.ask('maps', ...)`
> (maps→maps) — запрос зависает (шина не обрабатывает self-вызов). Контроллер
> `GET /maps/map` вызывает `renderMapHtml` напрямую; на шину `maps:map` ходят только
> другие МС (trips).

### 🔍 Поиск и детали мест
- **Поиск** (`POST /maps/search`) — по тексту (query + lang + locationBias) → Nominatim
- **Автодополнение** (`POST /maps/autocomplete`) — 5 подсказок на ввод
- **Детали** (`GET /maps/details/:placeId`) — карточка места (+ expand/lang/refresh)
- **Reverse** (`GET /maps/reverse`) — координаты → адрес (Nominatim)
- **Resolve URL** (`POST /maps/resolve-url`) — Google Maps URL → координаты

### 📍 POI (точки интереса)
- **`GET /maps/pois?category=...&south=...&west=...&north=...&east=...`** — POI по категории
  и bbox через Overpass (OpenStreetMap).
- Категории (`POI_CATEGORY_KEYS`): restaurant, cafe, bar, hotel, sights, museum,
  nature, activity, shopping, supermarket.
- bbox клампится (макс. размер области), кэш 5 мин / 500 записей, зеркала Overpass
  через `Promise.any`.

### 🖼️ Фото мест (Wikimedia)
- **`GET /maps/place-photo/:placeId`** — мета фото
- **`GET /maps/place-photo/:placeId/bytes`** — само фото (кэшированный JPEG)
- Источники: enwiki pageimages + Wikimedia Commons geosearch

## Провайдеры
- **Данные мест** → OpenStreetMap (Nominatim + Overpass + Wikimedia для фото)
- **Визуальные тайлы карты** → OpenFreeMap Liberty (MapLibre GL, рендер из maps)
- **Google-ветки** — зарезервированы (код есть), активны только если задан
  `GOOGLE_PLACES_API_KEY`; по умолчанию пусто → **100% трафик через OSM**.

## Эндпоинты
Авторизованы `req.session.auth`: `POST /maps/search`, `GET /maps/pois`,
`POST /maps/autocomplete`, `GET /maps/details/:placeId`,
`GET /maps/place-photo/:placeId`, `GET /maps/place-photo/:placeId/bytes`,
`GET /maps/reverse`, `POST /maps/resolve-url`, `GET /maps/`.

Публичные (без auth, `PUBLIC_PATHS`):
- `GET /maps/map` — интерактивная карта гео-объектов (HTML)
- `GET /maps/geocode` — поиск места (SearchPlace из OrientDB → фолбэк Nominatim)
- `GET /maps/pois` — POI по категории и bbox
- `GET /maps/og` — серверный рендер карты в PNG (для OG-превью; query: `markers` JSON,
  `width`/`height`/`language`) — отладочный HTTP-вариант RPC `maps:og`

## RPC (сервис-2-сервис по шине)
- `maps:map` — вернуть HTML карты + JS `window.MapsRender.*` (для trips и др.)
- `maps:og` — вернуть бинарный PNG карты `{ __frtBase64, contentType:'image/png' }`
  (для OG-превью поездок; запрос: `markers`[], `width`, `height`, `language`)

## Структура
- `index.js` — регистрация МС на шине micromq (name='maps', сервисы render/files/auth/users/cache)
- `action/index.js` — RPC-action `maps:map`
- `service/renderMapHtml.js` — единая генерация HTML карты
- `service/ogExport.js` — серверный рендер PNG через headless Chromium (Playwright)
- `service/mapsService.js` — гео-логика (18 экспортов: Nominatim/Overpass/Wikimedia/SSRF/крипто)
- `controllers/index.js` — REST-эндпоинты + GET /maps/map + заглушка /maps/
- `view/html/` — шаблоны (layout `index.html`, страница карты `page/map.html`)
- `core/` — ssrfGuard.js, ipv6.js, apiKeyCrypto.js (aes-256-gcm)

Все эндпоинты авторизованы через `req.session.auth` (cookie `sid`, см. gateway cloudFRT).
