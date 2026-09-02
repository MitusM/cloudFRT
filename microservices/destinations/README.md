# destinations — гео-каталог мест (cloudFRT)

Микросервис `destinations`: SEO-структура сайта-каталога — гео-каталог мест (страны → регионы → места → достопримечательности) с иерархией в виде **графа OrientDB**.

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
│       ├── dest.html      —   страница места/хаба
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

**Индексы:** `Dest.slug_idx` (NOTUNIQUE, slug), `Dest.level_idx` (NOTUNIQUE, level).

### Рёбра

| Класс | Направление | Смысл |
|---|---|---|
| `PART_OF` | `Dest -PART_OF-> Dest` | иерархия: Телецкое ∈ Горный Алтай ∈ Россия |
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

**Пути:** `/destinations/russia/gornyj-altaj/teleckoe-ozero/...` — полные цепочки сегментов. При неверном пути (не прямой ребёнок) → 404 / нет узла.

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
- `getSitemapTree()` — обход дерева для sitemap.xml (через `in('PART_OF')`)
- `getRelatedArticles(rid, limit)` — связанные статьи через `HAS_ARTICLE`
- `getMapPoints(rid)` — маркеры карты (GeoJSON-координаты)
- `getSettings()` — настройки МС

---

## Валидация (`validation.js`)

- `LEVELS = ['country','region','place','attraction']`
- `FIELDS` — white-list полей для безопасной записи (clean-объект)
- `normalizeSlug(raw)` — lower, пробелы→дефис, только `a-z0-9-`
- `validateSlug(slug)` — regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `validateDestInput(body, {requireTitle, levelRequired})` — собирает ошибки, возвращает `{ clean, errors }`; проверяет level по `LEVELS`, координаты (lat ∈ [-90,90], lng ∈ [-180,180]), `priority` (0..1)

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
- `getMapPoints(rid)` собирает маркеры: сам узел (`location`) + прямые дети с координатами.
- Центр = `location` узла либо средняя точка по детям.
- Рендер — через RPC `maps:map` → `mapHtml`, отрисовка `MapsRender.renderMap` (MapLibre GL).
- Класс `HAS_MAP` остаётся как задел, если появится подписка на отдельные Map-вершины.

---

## Установка схемы (один раз)

```bash
cd <ORIENTDB_HOME>   # каталог установки OrientDB
./bin/console.sh
connect remote:127.0.0.1/<DBNAME> <USER> <PASSWORD>
# вставить содержимое microservices/destinations/schema.sql
```
