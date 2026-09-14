# destinations — гео-каталог мест с типами DestType (cloudFRT)

Микросервис `destinations`: SEO-структура сайта-каталога — гео-каталог мест (страны → регионы → места → достопримечательности) с иерархией в виде **графа OrientDB** и **типами объектов (DestType)** через ребро `HAS_TYPE`.

- **Шина:** микро­сервис cloudFRT на MicromQ (RabbitMQ), `name: 'destinations'`; зависимые МС: `render`, `files`, `auth`, `users`, `cache`, `maps`
- **БД:** OrientDB 3.2.55 (граф: класс-вершина `Dest` + рёбра)
- **Кэш:** Redis (инвалидация страниц/настроек)
- **Рендер:** Nunjucks через МС `render` (обёртка `index.html` + подключаемые страницы)

> Развёрнут на прод-домене (полный прокси на gateway). См. `schema.sql` — правки схемы вручную, код БД не создаёт.

---

## Структура микросервиса

```
microservices/destinations/
├── index.js               — точка входа (MicroMQ, fail-fast по env)
├── schema.sql             — ⚠️ схема OrientDB (грузится ВРУЧНУЮ, один раз)
├── package.json
├── .env / .env.example
├── action/index.js        — RPC-действия на шине
├── controllers/index.js   — HTTP-эндпоинты (публичные + админ)
├── lang/                  — языковые строки
├── view/html/             — Nunjucks-шаблоны
│   ├── index.html         —   SEO-оболочка (layout, {% include page %})
│   └── page/
│       ├── root.html      —   корневой хаб (список стран)
│       ├── dest.html      —   страница места/хаба (с type-badge)
│       ├── destCard.html  —   partial для карточки места (переиспользуется в root + category)
│       ├── category.html  —   страница категории по типу (добавлено 13.09.2026)
│       └── admin.html     —   админ-UI (SPA CRUD)
└── service/
    ├── modelServices.js   — доступ к OrientDB (запросы, CreateVertex, рёбра)
    ├── validation.js      — централизованная валидация полей/координат
    ├── cacheServices.js   — Redis (ioredis)
    ├── dbServices.js      — пул OrientDB (PDO)
    ├── errorServices.js / error/
    ├── middlewares/index.js — auth/CSRF для админ-путей
    └── serviceLayer.js    — RPC-обёртка app.ask
```

---

## Структура БД (OrientDB 3.2.55)

Схема — **граф**: вершина `Dest` (узел места) и типизированные рёбра. Путь в URL = цепочка `PART_OF` от корня (страна) вниз.

### Вершина `Dest` (extends V)

| Свойство | Тип | Описание |
|---|---|---|
| `slug` | STRING | сегмент URL (`gornyj-altaj`), normalized: `a-z0-9-`, пробелы→дефис |
| `title` | STRING | название места |
| `h1` | STRING | H1 (если отличается от title) |
| `level` | STRING | `country` \| `region` \| `place` \| `attraction` |
| `description` | STRING | SEO description |
| `content` | EMBEDDED | контент хаба (rich) |
| `image` | STRING | URL изображения |
| `is_hub` | BOOLEAN | хаб или нет (default `true`) |
| `priority` | DOUBLE | приоритет в sitemap (0..1) |
| `location` | EMBEDDED | координаты — `ST_GeomFromText('POINT(lng lat)')` (порядок GeoJSON: [lng, lat]!) |
| `created` | DATETIME | ⚠️ ТОЛЬКО через `toOrientDate()` (`'YYYY-MM-DD HH:mm:ss'`); ISO OrientDB не парсит |
| `links` | EMBEDDEDMAP | ручные блоки перелинковки: `{ top_places:[{slug,title,url}], похожие:[...], где_жить:[...], тур:[...] }` |

### Вершина `DestType` (extends V) — добавлено 12.09.2026

Каталог типов объектов. Dest связывается с DestType через ребро `HAS_TYPE`.

| Свойство | Тип | Описание |
|---|---|---|
| `slug` | STRING | сегмент URL в единственном числе (`ozero`, `vodopad`) |
| `slug_plural` | STRING | URL категории во множественном (`ozera`, `vodopady`) — добавлено 13.09.2026 |
| `name` | STRING | название (`Озеро`, `Водопад`) |
| `name_plural` | STRING | название мн.ч. (`Озёра`, `Водопады`) |
| `icon` | STRING | ключ маппинга иконки (маппится в renderMapHtml.js через TYPE_COLORS + TYPE_SVG) |
| `description` | STRING | описание типа |
| `priority` | DOUBLE | приоритет сортировки |
| `created` | DATETIME | |

**Типы в БД (14):** `ozero`, `vodopad`, `gora`, `vershina`, `peshchera`, `reka`, `dolina`, `plyazh`, `ostrov`, `park`, `zapovednik`, `muzej`, `vidovaya-ploshchadka`, `rodnik`.

**Индексы:** `DestType.slug_idx` (NOTUNIQUE).

### Индексы
- `Dest.slug_idx` (NOTUNIQUE, slug), `Dest.level_idx` (NOTUNIQUE, level)
- `DestType.slug_idx` (NOTUNIQUE, slug)

### Рёбра

| Класс | Направление | Смысл |
|---|---|---|
| `PART_OF` | `Dest -PART_OF-> Dest` | иерархия: Телецкое ∈ Горный Алтай ∈ Россия |
| `HAS_TYPE` | `Dest -HAS_TYPE-> DestType` | тип объекта (озеро, водопад, гора…) — добавлено 13.09.2026 |
| `HAS_TRIP` | `Dest -HAS_TRIP-> Trip` | место → поездки (МС trips) |
| `HAS_ARTICLE` | `Dest -HAS_ARTICLE-> Article` | место → статьи `/stati/` (МС article) |
| `HAS_MAP` | `Dest -HAS_MAP-> Map` | место → отдельные Map-вершины *(задел на будущее; сейчас карта строится по `location` узлов, сущность Map не используется)* |

### Настройки

Класс `Settings` с полем `microservice = 'destinations'` — симметрия с `article`/`users` (опционально, в schema закомментировано).

### ⚠️ Важные ограничения/нюансы

1. **Схему грузит ТОЛЬКО `schema.sql` вручную** (OrientDB console), код выполняет только DML (`CREATE VERTEX`). Класс/свойства/индексы код не создаёт.
2. **`IF NOT EXISTS` / `DEFAULT` внутри `CREATE PROPERTY` НЕ поддерживаются** в 3.2.55 → `DEFAULT` задаётся отдельной командой `ALTER PROPERTY`; повторный прогон выдаёт "already exists" (это норма).
3. **`created`** — пишется через `toOrientDate()`, не ISO.
4. **`location`** — `ST_GeomFromText('POINT(lng lat)')`, читается как `OPoint { coordinates: [lng, lat] }` (GeoJSON-порядок).
5. Уникальность slug — на уровне поля (`NOTUNIQUE` индекс); уникальность **пути** (родитель+slug) на этапе 2 оценивалась, при необходимости пересмотреть.

---

## HTTP-эндпоинты

### Публичные (SEO)

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/destinations/` | Корневой хаб: список стран |
| `GET` | `/destinations/sitemap.xml` | XML-карта сайта (ждёт `in('PART_OF')` от корней) |
| `GET` | `/destinations/(.*)` | Страница по пути из сегментов slug (catch-all, `next` для `/admin/*`) |
| `GET` | `/destinations/<parent>/<slug_plural>/` | Страница категории (список мест одного типа) — добавлено 13.09.2026 |

**Пути:** `/destinations/russia/gornyj-altaj/teleckoe-ozero/...` — полные цепочки сегментов. При неверном пути (не прямой ребёнок) → 404 / нет узла.

**Категории:** последний сегмент интерпретируется как `slug_plural` → матчинг в порядке: `slug_plural > slug > name_plural`. Страница рендерится через `page/category.html`.

### Админ (auth `req.session.auth` + CSRF)

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/destinations/admin/page` | Админ-UI (SPA-рендер через `render`) |
| `GET` | `/destinations/admin/` | Заглушка/редирект админки |
| `GET` | `/destinations/admin/:rid` | Получить узел по RID |
| `POST` | `/destinations/admin/create` | Создать узел `Dest` |
| `PUT` | `/destinations/admin/:rid` | Обновить узел |
| `DELETE` | `/destinations/admin/:rid` | Удалить узел (и рёбра) |

> Админ-пути защищены middleware: без сессии — форма авторизации (RPC `auth` `aut:redirect`), HTTP 200; несовпадение CSRF — 403.

### RPC-действия (action)

`action/index.js` — шаблон для RPC-экшенов на шине (сейчас пуст, заготовка). Логика страниц и карт вызывается напрямую из контроллеров:

- **Карта на гео-хабе** — контроллер `GET /destinations/(.*)` вызывает RPC `maps:map` через `app.ask('maps', ...)` → `mapHtml`, передаёт `mapPoints`/`mapCenter` в шаблон.
- Сборка маркеров — `modelServices.getMapPoints(rid)`.

---

## Модель (`modelServices.js`) — ключевые методы

Данные (кроме явно публичных) обычно идут через публичные хендлеры; методы модели инкапсулируют граф-запросы OrientDB.

- `createDest({...})`, `updateDest(rid, fields)`, `deleteDest(rid)` — CRUD вершины
- `getByRid(rid)`, `getBySlug(slug, parentRid)`, `slugExists(slug, parentRid)`
- `listAll(limit, offset)`, `listChildren(rid, limit)`, `getParentRid(rid)`
- `moveDest(rid, newParentRid)` — смена родителя (перемещение в дереве)
- `parentsChain(rid)` — цепочка предков (хлебные крошки)
- `getByPath(slugs)` — узел по массиву сегментов пути (публичные SEO-страницы)
- `getTopPlaces(rid, {levels, limit})` — топ-места (детей нужных level)
- `getSiblings(rid, limit)` — братья (по общему родителю)
- `getLinks(rid)` — ручные блоки перелинковки (свойство `links`)
- `getTypes()` — список всех DestType (slug, slug_plural, name, name_plural, icon)
- `getDestType(rid)` — тип конкретного Dest (`out('HAS_TYPE')`)
- `setDestType(destRid, typeSlug)` — привязать/сменить/снять тип (DELETE EDGE + CREATE EDGE)
- `getSimilarByType(rid, limit)` — того же типа под тем же родителем (графовый запрос)
- `getByParentAndType(parentRid, typeSlug, limit)` — все published под parent с типом (для категорий)
- `getSitemapTree()` — обход дерева для sitemap.xml (через `in('PART_OF')`)
- `getRelatedArticles(rid, limit)` — связанные статьи через `HAS_ARTICLE`
- `getMapPoints(rid)` — маркеры карты (координаты + typeSlug, typeName, typeIcon для symbol-слоя/маркера)
- `getSettings()` — настройки МС

## Фронтенд

### type-badge
На странице места (`dest.html`) показывается значок типа иконка + название (например «🏔 Гора»).
- Класс `.dest-type-badge` в SCSS
- Данные: `type_badge: { slug, name, icon }` из контроллера

### Страница категории
`/destinations/<parent>/<slug_plural>/` — список мест одного типа под одним родителем.
- Шаблон: `page/category.html`
- Grid карточек через partial `page/destCard.html`
- Заголовок: «Озёра Горного Алтая» (name_plural + title родителя)
- Данные: `getByParentAndType(parentRid, slug)`

---

## Валидация (`validation.js`)

- `LEVELS = ['country','region','place','attraction']`
- `VALID_TYPES` — 14 slugs типов DestType
- `FIELDS` — white-list полей + `'type'` (добавлено 13.09.2026)
- `normalizeSlug(raw)` — lower, пробелы→дефис, только `a-z0-9-`
- `validateSlug(slug)` — regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `validateTypeSlug(slug)` — проверка на вхождение в VALID_TYPES
- `validateDestInput(body, {requireTitle, levelRequired})` — собирает ошибки, возвращает `{ clean, errors }`; проверяет level по `LEVELS`, тип по VALID_TYPES, координаты (lat ∈ [-90,90], lng ∈ [-180,180]), `priority` (0..1)

> Централизованная валидация (в отличие от ручной в роутах `article`).

---

## Конфигурация (`.env`)

| Переменная | Описание |
|---|---|
| `RABBIT_URL` | шина RabbitMQ |
| `TIMED_OUT` | таймаут RPC (мс), default 15000 |
| `ORIENTDB_HOST/PORT/HTTPPORT/USERNAME/PASSWORD/NAME/POOL` | подключение к OrientDB |
| `REDIS_PORT/HOST/FAMILY/PASSWORD` | Redis-кэш |
| `APP_URL` | базовый URL (см. `.env`) |
| `VIEW_DIR` | каталог шаблонов (`/microservices/destinations/view/html/`) |
| `TEMPLATE_FILE` | основной layout (`index.html`) |

**Fail-fast:** без обязательных env (`RABBIT_URL`, `ORIENTDB_NAME/USERNAME/PASSWORD`, `VIEW_DIR`) сервис стартует с ошибкой и exit.

---

## Карты (этап 5)

Карта на гео-хабе строится **по координатам узлов** графа (без отдельной сущности Map):
- `getMapPoints(rid)` собирает маркеры: сам узел (`location`) + прямые дети с координатами + **typeSlug, typeName, typeIcon** (через `out('HAS_TYPE')`).
- Центр = `location` узла либо средняя точка по детям.
- Рендер — через RPC `maps:map` → `mapHtml`, отрисовка `MapsRender.renderMap` (MapLibre GL).
- Иконки типов на маркерах — `TYPE_COLORS` (цвет пина) + `TYPE_SVG` (инлайн SVG 12×12) в `addMarkers()` renderMapHtml.js (с 14.09.2026, коммит b1ee2cd).
- Легенда типов — `addLegend()` в левом нижнем углу карты.
- Класс `HAS_MAP` остаётся как задел, если появится подписка на отдельные Map-вершины.

---

## Установка схемы (один раз)

```bash
cd <ORIENTDB_HOME>   # каталог установки OrientDB
./bin/console.sh
connect remote:127.0.0.1/<DBNAME> <USER> <PASSWORD>
# вставить содержимое microservices/destinations/schema.sql
```

Схема включает DestType + HAS_TYPE (добавлены 12-13.09.2026).

После загрузки схемы — загрузить базовые 14 типов через OrientDB REST:
```bash
curl -X POST "http://localhost:2480/command/cloudFRT/sql" \
  -u "misha:23502350" \
  -H "Content-Type: application/json" \
  -d '{"command":"INSERT INTO DestType SET slug = 'ozero', slug_plural = 'ozera', name = 'Озеро', name_plural = 'Озёра', icon = 'lake'"}'
# ... и т.д. для всех 14 типов
```
