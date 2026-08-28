# cache — Redis-кэш по шине (cloudFRT)

Микросервис-кэш cloudFRT на шине micromq. Не имеет собственного
HTTP-CRUD: это тонкая обёртка над **Redis**, которая выставляет RPC-экшены
(`cache:get` / `cache:set` / `cache:multi` / `cache:del`) для остальных
микросервисов. Каждый МС, которому нужно закэшировать данные или сбросить
кэш, обращается к нему через `app.ask('cache', ...)`.

## Возможности

- **`cache:get`** — прочитать значение по ключу (вернёт `null`, если ключа нет)
- **`cache:set`** — записать значение по ключу (обычно это `JSON.stringify` данных)
- **`cache:multi`** — батч-операции за один RPC (например, несколько `get` подряд)
- **`cache:del`** — удалить ключи **по паттерну** (`users:list:**`), через `scanStream`

Поверх Redis добавляет одну осмысленную абстракцию: удаление **по паттерну** —
удобно, когда кэш связан с сущностью (`users:list:*`), и после изменения сущности
нужно сбросить все её варианты кэша одним вызовом.

## Механика использования (по шине)

Ответ оборачивается микромкью-стандартом: `res.json({ value: ... })`,
который на стороне вызывающего МС приходит как
`{ status: 200, response: { value: ... } }`.

### `cache:get`

```js
const { status, response } = await res.app.ask('cache', {
  server: {
    action: 'cache:get',
    meta: {
      options: { db: 1 },        // номер Redis-BD (см. ниже)
      list: 'settings:users',    // ⚠️ ключ передаётся в поле `list`
    },
  },
})
const value = response.value      // null, если ключа нет
```

### `cache:set`

```js
await res.app.ask('cache', {
  server: {
    action: 'cache:set',
    meta: {
      options: { db: 1 },
      key: 'users:list:1',          // ключ
      val: JSON.stringify(users),   // значение (уже сериализованное)
    },
  },
})
// ответ: { status: 200, response: { value: 'OK' } }
```

### `cache:multi`

```js
const { response } = await res.app.ask('cache', {
  server: {
    action: 'cache:multi',
    meta: {
      options: { db: 1 },
      list: [
        ['get', 'settings:users'],
        ['get', 'users:list:1'],
      ],
    },
  },
})
// response — массив пар [err, value]: [ [null, '...'], [null, null] ]
```

### `cache:del` (по паттерну)

```js
await res.app.ask('cache', {
  server: {
    action: 'cache:del',
    meta: {
      options: { db: 1 },
      pattern: 'users:list:**',   // удалить все ключи по паттерну
    },
  },
})
```

> ⚠️ **Несимметричность полей.** Ключ везде передаётся по-разному:
> `cache:get` и `cache:multi` берут ключ/список из поля **`list`**,
> `cache:set` — из **`key`** (значение из `val`), `cache:del` — из **`pattern`**.
> Это унаследованная особенность сигнатур — при использовании сверяться с
> фактическими вызовами в `geo`, `users`, `article`, `country`.

## Номера Redis-BD (db)

`options.db` выбирает логическую БД внутри одного Redis-инстанса:

| db | Назначение (по факту использования) | Примеры ключей |
|---|---|---|
| `1` | Кэш пользователей / настроек (`users`, `article`, `country`) | `settings:users`, `users:list:1` |
| `2` | Гео-кэш (`geo`) | `country` |

## Структура

```
cache/
├── index.js                    # точка входа, name='cache' на шине (+ Redis)
├── action/                     # RPC-экшены: cache:get/set/multi/del
├── controllers/                # HTTP-роуты — ПУСТО (только middleware)
├── service/
│   ├── cacheServices.js        # класс Redis (обёртка над ioredis) — ядро МС
│   ├── middlewares/index.js    # авторизация /cache/:endpoint (req.session.auth)
│   └── ...                     # connect.js, viewsServices, errorServices (не используются)
├── view/                       # шаблоны (не задействовано: HTTP-эндпоинтов нет)
└── lang/ru.json                # словарь (используется контроллером)
```

## Запуск

```bash
# из своей папки (чтобы dotenv подхватил .env)
cp .env.example .env   # если .env ещё нет — скопировать шаблон и заполнить
cd microservices/cache
node ./index.js            # прод
nodemon --watch . ./index.js   # dev (перезапуск при правке)
```

> ⚠️ Без `.env` сервис **не стартует**: `index.js` делает fail-fast и сообщает,
> каких переменных не хватает (`RABBIT_URL`, `VIEW_DIR`).

## Переменные окружения

Реально используются только часть из `.env` (см. `cacheServices.js` и `index.js`):

| Переменная | Назначение | Обязательна |
|---|---|---|
| `RABBIT_URL` | URL шины RabbitMQ | ✅ |
| `REDIS_PORT` | Порт Redis (по умолчанию 6379) | — |
| `REDIS_HOST` | Хост Redis (по умолчанию 127.0.0.1) | — |
| `REDIS_FAMILY` | IP-семейство: 4 (IPv4) / 6 (IPv6) | — |
| `REDIS_PASSWORD` | Пароль Redis | — |
| `TIMED_OUT` | Таймаут RPC, мс (по умолчанию 5000) | — |
| `VIEW_DIR` | Каталог шаблонов (fail-fast; фактически не рендерится) | ✅ (для fail-fast) |

> 🔎 Остальные переменные в `.env` (`MYSQL_*`, `PG_*`, `DIALECT`, `HOST`,
> `DATABASE`, `USER`, `SALT`, `CACHE`) — **унаследованы от `geo`** и cache
> не использует. `connect.js` (Postgres/Sequelize) тоже остался от копипаста —
> в работе кэш-МС не участвует. Это кандидат на чистку (не трогается без явного
> решения).

## Авторизация

`service/middlewares/index.js` вешает проверку `req.session.auth` на
`/cache/:endpoint` — при отсутствии сессии редиректит через `auth:redirect`.
Так как HTTP-роутов у cache фактически нет, middleware — задел/защита на случай
добавления прямых эндпоинтов. RPC-экшены по шине экранируются самой шиной
(доступ из зарегистрированных МС), сквозная авторизация — см. gateway cloudFRT.
