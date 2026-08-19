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
  Опции: `controlsPosition` (по умолчанию `'top-right'`), `hideControls` (`false`),
  `styles` (default `true`).

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

## Эндпоинты (все авторизованы `req.session.auth`)
- `POST /maps/search` — поиск места
- `GET /maps/pois` — POI по категории и bbox (Overpass)
- `POST /maps/autocomplete` — автодополнение
- `GET /maps/details/:placeId` — детали места
- `GET /maps/place-photo/:placeId` — мета фото
- `GET /maps/place-photo/:placeId/bytes` — фото (JPEG)
- `GET /maps/reverse` — координаты → адрес
- `POST /maps/resolve-url` — Google Maps URL → координаты
- `GET /maps/map` — интерактивная карта гео-объектов (HTML)
- `GET /maps/` — метаданные сервиса + список эндпоинтов (рабочая точка пользователя)

## RPC (сервис-2-сервис по шине)
- `maps:map` — вернуть HTML карты + JS `window.MapsRender.*` (для trips и др.)

## Структура
- `index.js` — регистрация МС на шине micromq (name='maps', сервисы render/files/auth/users/cache)
- `action/index.js` — RPC-action `maps:map`
- `service/renderMapHtml.js` — единая генерация HTML карты
- `service/mapsService.js` — гео-логика (18 экспортов: Nominatim/Overpass/Wikimedia/SSRF/крипто)
- `controllers/index.js` — REST-эндпоинты + GET /maps/map + заглушка /maps/
- `view/html/` — шаблоны (layout `index.html`, страница карты `page/map.html`)
- `core/` — ssrfGuard.js, ipv6.js, apiKeyCrypto.js (aes-256-gcm)

Все эндпоинты авторизованы через `req.session.auth` (cookie `sid`, см. gateway cloudFRT).
