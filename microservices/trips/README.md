# trips — ядро-агрегат поездок (cloudFRT)

Микросервис поездок cloudFRT на шине micromq. Управляет поездками (Trip),
местами (Place), гео-объектами (GeoObject) и участниками (TripMember).

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
| VERTEX | `Trip` | Поездка (title, dates, currency, owner/ownerRid, …) |
| VERTEX | `Place` | Снапшот места (lat/lng, osm_id, url, _id=nanoid) |
| VERTEX | `GeoObject` | Канонический эталон места (дедуп по osm_id) |
| EDGE | `TripMember` | Trip -[участвует]-> User (role, is_guest, invited_by) |
| EDGE | `TripPlace` | Trip -[место]-> Place (+ article_id/article_rid = связка со статьёй) |
| EDGE | `hasObject` | Place -[связан]-> GeoObject |

### Установка схемы (один раз)

```bash
cd /media/04E0AC01E0ABF6D8/orientdb-community-3.2.55
./bin/console.sh
connect remote:127.0.0.1/cloudFRT misha <PASSWORD>
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
