# trips — ядро-агрегат поездок (cloudFRT)

Микросервис поездок cloudFRT на шине micromq. Управляет поездками (Trip),
местами (Place), гео-объектами (GeoObject) и участниками (TripMember).

## Возможности

### 🚗 CRUD поездок — полный жизненный цикл
- **Создание** — любой авторизованный пользователь может создать поездку (`POST /trips/`)
- **Чтение** — список своих + shared + публичных чужих (`GET /trips/`), карточка (`GET /trips/:id`)
- **Редактирование** — заголовок, описание, даты, валюта, напоминания, приватность, статус (`PUT /trips/:id`)
- **Архивирование / удаление** (`DELETE /trips/:id`)
- **Копирование** (`POST /trips/:id/copy`)
- **Смена владельца** (`POST /trips/:id/transfer`)

### 🔐 Модель доступа (изоляция поездок)
Поля `Trip.is_private` и `Trip.status`:
- **Частная** (`is_private=true`, дефолт) — видят владелец и участники
- **Публичная** (`is_private=false`) — видят все авторизованные
- **Запись** (PUT/DELETE/transfer/members/guests) — **только владелец**
- **Copy** — кто может читать
- **Места** (place-add) — участники, только при `status=open`; при `closed` — 403 `trip_closed`

### 👥 Участники и гости
- **Участники** — добавить/удалить (`POST/DELETE /trips/:id/members/:userId`)
- **Гости** — добавить/изменить/удалить (`POST/PUT/DELETE /trips/:id/guests/:userId`)
- **Роли** в ребре `TripMember`: `member` / `guest` / `owner`

### 📍 Места (POI)
- **Добавление** через шину (`trips:place-add`) — name, lat/lng, osm_id, google_place_id, address, source, url, article_id/article_rid
- **Дедупликация** — повторный place-add с тем же `osm_id` (или `name+lat/lng`) возвращает существующее (`duplicated:true`)
- **Связка место ↔ статья (B+C)** — `Place -[hasObject]-> GeoObject`, ребро `TripPlace` несёт `article_id`/`article_rid`
- **Топ объектов** (`trips:top-places`) — агрегация по графу GeoObject ← Place ← TripPlace

### 🗺️ Карта поездки
- **`GET /trips/map/:id`** — интерактивная HTML-карта (MapLibre GL 4.4.0)
- Стиль **OpenFreeMap Liberty**, маркеры мест + popup (name/address/note/day), `fitBounds`

### 📦 Экспорт и бандл
- **Оффлайн-бандл** (`GET /trips/:id/bundle`)
- **Экспорт в iCalendar** (`GET /trips/:id/export.ics`)

### 🔄 RPC-интеграция (сервис-2-сервис по шине)
- `trips:list-user` — поездки пользователя для другого МС (резолв юзера через `users:user:get`)
- `trips:place-add` — добавить место «в поездку» из другой статьи/сервиса
- `trips:top-places` — топ объектов к посещению

Все эндпоинты авторизованы через `req.session.auth` (cookie `sid`, см. gateway cloudFRT).

## Структура

```
trips/
├── index.js              # точка входа, name='trips' на шине
├── schema.sql            # схема OrientDB (выполнять ВРУЧНУЮ один раз)
├── action/               # RPC-действия (trips:*)
├── controllers/          # HTTP-роуты (req.session)
├── service/              # сервисный слой: modelServices, dbServices и др.
└── test/                 # e2e-тесты
```

## Запуск

```bash
# из своей папки (чтобы dotenv подхватил .env)
cp .env.example .env   # если .env ещё нет — скопировать шаблон и заполнить
cd microservices/trips
node ./index.js            # прод
nodemon --watch . ./index.js   # dev (перезапуск при правке)
```

> ⚠️ Без `.env` сервис **не стартует**: `index.js` делает fail-fast и сообщает,
> каких переменных не хватает (не TypeError посреди импорта).

Сквозная авторизация — через `req.session` (см. gateway cloudFRT).

## Схема БД (OrientDB)

Код trips **НЕ создаёт схему автоматически** — только данные
(`CREATE VERTEX/EDGE`). Классы/свойства/индексы заводятся вручную через
`schema.sql`. Ядро: 3 вершины + 3 ребра.

| Тип | Класс | Назначение |
|---|---|---|
| VERTEX | `Trip` | Поездка (title, dates, currency, owner/ownerRid, is_private, status, …) |
| VERTEX | `Place` | Снапшот места (lat/lng, osm_id, url, _id=nanoid) |
| VERTEX | `GeoObject` | Канонический эталон места (дедуп по osm_id) |
| EDGE | `TripMember` | Trip -[участвует]-> User (role, is_guest, invited_by) |
| EDGE | `TripPlace` | Trip -[место]-> Place (+ article_id/article_rid = связка со статьёй) |
| EDGE | `hasObject` | Place -[связан]-> GeoObject |

## Модель доступа

Поле `Trip.is_private` (дефолт **true** = частная):

| | Частная (`is_private=true`) | Публичная (`is_private=false`) |
|---|---|---|
| Чтение | владелец + участники (TripMember) | все (владелец, участники, любые авторизованные) |
| Запись (PUT/DELETE/transfer/members/guests/cover) | только владелец (`owner`) | только владелец (`owner`) |
| Copy | кто может читать | кто может читать |

- Владелец — по `ownerRid` == текущий user.rid.
- Участники/гости — по рёбрам `TripMember` (независимо от is_private).
- Список `GET /trips/` отдаёт: свои + где участник + публичные чужие.
- Поле `Trip.status` (`open`/`closed`, дефолт `open`): пока `open` — идёт формирование,
  любой участник может добавить место (`trips:place-add`); при `closed` добавление
  мест возвращает 403 `trip_closed` (поездка сформирована).
  Статус меняет владелец через `PUT /trips/:id` (`status`).


### Установка схемы (один раз)

```bash
cd <ORIENTDB_HOME>   # каталог установки OrientDB
./bin/console.sh
connect remote:127.0.0.1/<DBNAME> <USER> <PASSWORD>
# вставить содержимое microservices/trips/schema.sql
```

> ⚠️ Выполнять **один раз на чистой БД**. OrientDB 3.2.55 не понимает
> `IF NOT EXISTS` и `DEFAULT` внутри `CREATE PROPERTY` — поэтому DEFAULT
> задаётся отдельными `ALTER PROPERTY`. Повторный прогон даст
> "already exists" (не фатально, console продолжает), но не предназначен
> для пере-прогона.

Полная документация (графовые обходы, связка B+C со статьёй, топ-эндпоинт,
подводные камни): `work/trek-cloudfrt-схема-orientdb-trips.md` (агент Тима).

## Тесты

```bash
npm test   # node --test test/*.test.js
```
