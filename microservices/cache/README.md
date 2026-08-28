# cache — Redis-кэш по шине (cloudFRT)

Микросервис-кэш cloudFRT на шине micromq. Не имеет собственного
HTTP-CRUD: это тонкая обёртка над **Redis**, которая выставляет RPC-экшены
(`cache:get` / `cache:set` / `cache:multi` / `cache:del`) для остальных
микросервисов. Каждый МС, которому нужно закэшировать данные или сбросить
кэш, обращается к нему через `app.ask('cache', ...)`.

## Возможности

- **`cache:get`** — прочитать значение по ключу (вернёт `null`, если ключа нет)
- **`cache:set`** — записать значение по ключу; опциональный `ttl` (сек) — с TTL или бессрочно
- **`cache:ttl`** — получить остаточное время жизни ключа, сек (`-2` = нет ключа, `-1` = без TTL)
- **`cache:multi`** — батч-операции за один RPC (например, несколько `get`/`set` подряд)
- **`cache:del`** — удалить ключи **по паттерну** (`users:list:**`), через `scanStream`

Поверх Redis добавляет две осмысленные абстракции:

1. **Удаление по паттерну** — удобно, когда кэш связан с сущностью
   (`users:list:*`), и после изменения сущности нужно сбросить все её
   варианты кэша одним вызовом.
2. **Опциональный TTL** — `cache:set` принимает `ttl` (сек). Без `ttl`
   ключ хранится бессрочно (прежнее поведение), с `ttl` — истекает.
   Это базовый кирпич для **Missing-кэша** (кэширования отрицательных
   результатов коротким временем жизни, см. ниже).

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

### `cache:set` (с опциональным TTL)

```js
await res.app.ask('cache', {
  server: {
    action: 'cache:set',
    meta: {
      options: { db: 1 },
      key: 'users:list:1',          // ключ
      val: JSON.stringify(users),   // значение (уже сериализованное)
      ttl: 3600,                    // опционально: секунд до истечения (без ttl — бессрочно)
    },
  },
})
// ответ: { status: 200, response: { value: 'OK' } }
```

### `cache:ttl` (остаточное время жизни)

```js
const { response } = await res.app.ask('cache', {
  server: {
    action: 'cache:ttl',
    meta: { options: { db: 1 }, list: 'users:list:1' },
  },
})
// response.value: 3599 (сек) | -1 (ключ есть, без TTL) | -2 (ключа нет)
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

## Missing-кэш (кэширование «данных нет»)

Паттерн для дорогих источников (внешние API, БД): когда результата **нет**
(пустой список), кэшировать сам факт отсутствия коротким TTL, чтобы не
долбить источник повторными запросами на каждый «холодный» ключ.

Договорённость (на стороне потребителя):
- **пустой результат** → писать маркер `__EMPTY__` с **коротким** TTL (например 60 сек)
- **есть данные** → писать `JSON.stringify(data)` с **длинным** TTL (например 3600 сек)
- при чтении: `value === '__EMPTY__'` → отдавать пустой список без похода в БД

Пример из `geo` (справочники стран/регионов/городов):

```js
const EMPTY = '__EMPTY__'
let list = response.value
if (list !== null) {
  listCities = list === EMPTY ? [] : JSON.parse(list)
} else {
  listCities = await db.cities(id)
  const isEmpty = Array.isArray(listCities) && listCities.length === 0
  await res.app.ask('cache', {
    server: { action: 'cache:set', meta: {
      options: { db: 2 },
      key: 'cities:' + id,
      val: isEmpty ? EMPTY : JSON.stringify(listCities),
      ttl: isEmpty ? 60 : 3600,
    }},
  })
}
```

Так отрицательный ответ живёт в Redis недолго (защита от дыр), но не
заставляет каждый раз снова ходить в источник.

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
├── action/                     # RPC-экшены: cache:get/set/multi/del/ttl
├── controllers/                # HTTP-роуты — ПУСТО (только middleware)
├── service/
│   ├── cacheServices.js        # класс Redis (обёртка над ioredis) — ядро МС
│   ├── errorServices.js        # обработка ошибок шины
│   └── middlewares/index.js    # авторизация /cache/:endpoint (req.session.auth)
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

> 🔎 `VIEW_DIR` используется только для fail-fast (фактически не рендерится).
> Остальных переменных в `.env` больше нет — мёртвые geo-переменные (MYSQL_*,
> PG_*, SALT, CACHE) были удалены при чистке МС 28.08.2026.

## Авторизация

`service/middlewares/index.js` вешает проверку `req.session.auth` на
`/cache/:endpoint` — при отсутствии сессии редиректит через `auth:redirect`.
Так как HTTP-роутов у cache фактически нет, middleware — задел/защита на случай
добавления прямых эндпоинтов. RPC-экшены по шине экранируются самой шиной
(доступ из зарегистрированных МС), сквозная авторизация — см. gateway cloudFRT.
