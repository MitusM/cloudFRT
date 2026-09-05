# uploads — единый upload-микросервис изображений (cloudFRT)

Единая точка загрузки и удаления изображений для микросервисов cloudFRT, которые оперируют картинками.
Принимает **multipart-файл**, прогоняет **webp-конвейер** (original → webp → resize 480/960/1280/1920/2700) и складывает
результат на **общий диск** `cloudFRT/images/`, отдавая клиенту JSON с путями.

- **Транспорт:** HTTP `:7620` (за nginx location) **+** Rabbit-шина MicromQ — сервис полно­правный на шине (`name: 'uploads'`), другие МС вызывают его через `ask('uploads', …)`, он сам ходит `ask()` к `auth`/`users` за правами.
- **Файлы по шине НЕ ходят** — только **HTTP (multipart) + JSON путей**. Шина используется для RPC/координации, не для передачи байтов.
- **Кто уже переведён:** `destinations` (первый пилот). `article`/`country` пока живут на старом gateway-пути — переводятся следом.
- **Диск:** общий с сайтом (корень `app-root` = `cloudFRT/`), раздаётся nginx по `/images/*`; НЕ зависит от `cwd` сервиса.

> ⚠️ Ответ загрузки **структурно идентичен** прежнему HTTP-upload (gateway/destinations), чтобы клиентская вставка `<picture>` в tinyMCE не менялась.

---

## Зачем отдельный сервис

До uploads картинки грузились **разрозненно**: свои приёмы `upload` жили в gateway, `destinations`, `article`, `country` — с дублированием busboy/webp-кода и путей хранения. uploads **централизует** приём+конвейер+удаление в одном МС; остальные подключаются сменой URL-клиента (и, постепенно, чисткой локальных копий).

Решение (зафиксировано в MuninnDB `db`, 04–05.09.2026): единый МС `uploads` на **порту :7620**, проксируемый nginx location на `frt.su`, а не поддомен; session через общий Redis (та же админ-сессия, что у gateway).

---

## Структура микросервиса

```
microservices/uploads/
├── index.js               — точка входа (MicroMQ: HTTP :7620 + Rabbit start, fail-fast по env)
├── package.json           — ESM; без собственных deps (тянет из общего node_modules cloudFRT)
├── core/action.js         — session (общий Redis, cookie 'sid') + CSRF; SESSION_SECRET из .env
├── core/images/index.js   — класс File (extends core/cloud): webp/resizeWEBP/statFile/deleteArrayFiles
├── controllers/index.js   — HTTP-эндпоинты (/upload, /delete-image) + RPC (uploads:ping/health)
└── service/
    ├── csrf.js            — authGuard (req.session.auth) + csrfOk (сверка токена с сессией)
    └── errorServices.js   — обработчик ошибок MicroMQ
```

> Зависимости сервис не объявляет (package.json `dependencies: {}`): код требует из корневого `node_modules` cloudFRT через `app-root-path` (`sharp`, `busboy`, `express-session`, `connect-redis`, `csrf`, …), как и соседние МС (destinations и др.).

---

## Как работает загрузка

`POST /upload/:microservice-:mi` (например `/upload/destinations-dest`) — один и тот же путь, что был у destinations, но теперь обслуживается uploads.

1. **authGuard** — пропускает только залогиненную Redis-сессию (`req.session.auth === true`), иначе `401`.
2. **Приём multipart** через `busboy` — оригинала пишется в `<app-root>/images/:microservice-:mi/original/<file>`.
   - коллизия имени → добавляется случайный суффикс (`name-<rand>.ext`);
   - сервис **ждёт завершения записи всех файловых стримов** перед ответом (иначе `files=0`).
3. **webp-конвейер** (`class File` из `core/cloud`):
   - `webp([absPath], …)` → `webp/<file>.webp`;
   - `statFile` → размеры исходника;
   - `resizeWEBP(minFilter([480,960,1280,1920,2700], width), webp, resize)` → копии ≥ ширины исходника (формат webp);
   - `util.minFilter` отбирает ресайз-брейкпоинты, не превышающие ширины оригинала.
4. Возвращает JSON с путями (см. ниже).

**Общий диск / cwd НЕ используется:** uploads запускается из `microservices/uploads/`, поэтому gateway-утилита `core/upload` (пишет по `process.cwd()`) тут неприменима — весь приём/ресайз пишет по **абсолютному app-root пути** через `class File`. Менять это нельзя (иначе файлы лягут не туда).

### Формат ответа (`POST /upload/:ms-:mi`)

```jsonc
{
  "status": 200,
  "body": {
    "original":   { "name": "<file>.jpg", "pathFile": "/images/<ms>/<mi>/original/<file>.jpg" },
    "resize":     { "480": { "name": "480_<base>.webp", "pathFile": "/images/<ms>/<mi>/resize/480_<base>.webp", "width": 480, "height": …, "size": … },
                    "960": { … }, … },                 // только брейкпоинты ≤ ширины оригинала
    "webpOriginal": { "name": "<base>", "pathFile": "/images/<ms>/<mi>/webp/<file>.webp", "width": …, "height": …, "size": …, "bytes": … },
    "resolution":   [480, 960, …],                     // те же размеры
    "files":        [ "<resize-480>", "<resize-960>", "<original>", "<webp>" ]  // все созданные пути
  }
}
```

> `files` — полный список путей для каскадного удаления из БД/дропзоны. Структуру **не менять** (клиент-контракт).

### Валидность
- Не-картинка/мусор не роняет конвейер: `resize`/`webpOriginal` могут быть пусты/частичны, но сервер отвечает `200`, а не зависает/504.
- Нет файла в запросе → `400 { message: "Файл не получен" }`.

---

## Эндпоинты

### HTTP (за nginx location на frt.su, `:7620`)

| Метод | Путь | Защита | Описание |
|---|---|---|---|
| `POST` | `/upload/:microservice-:mi` | auth (401 без сессии) | приём multipart + webp-конвейер → JSON путей |
| `DELETE` | `/delete-image` | auth + CSRF (`403` при несовпадении) | удаление файлов по списку путей. body `{ files: [<path>, …], csrf }` |

**nginx:** на `frt.su` настроен `location ^~ /files/` → `127.0.0.1:7620` с `proxy_pass` и срезом префикса `/files/`.
Значит снаружи (клиент `admin.js`) путь — `/files/upload/:ms-:mi` и `/files/delete-image`, а на сервере за nginx идут `/upload/…`/`/delete-image` уже БЕЗ `/files`.

> ⚠️ Никогда не использовать `/upload/...` как nginx-location (без `/files/`): перехватит старые пути article/country, идущие через gateway.

### Rabbit-шина (RPC-действия, другие МС через `app.ask('uploads', …)`)

| Действие | Ответ |
|---|---|
| `uploads:ping` | `{ pong: true, ts: <ms> }` |
| `uploads:health` | `{ ok: true, root: <app-root> }` |

---

## Авторизация и CSRF

`uploads` использует **ту же админ-сессию, что и gateway**:
- **Redis** — общий стор (клиент `connect-redis`, пароль из env); ключ сессии `sid`; **`SESSION_SECRET` обязан совпадать с gateway** `core/action.js`, иначе uploads не увидит чужие сессии и любой запрос вернёт `401`.
- **authGuard** — `req.session.auth === true` (признак залогиненного), иначе `401 Unauthorized` JSON.
- **CSRF** — токен `csrfSecret` из той же сессии (gateway выдаёт его при рендере admin-страницы). DELETE сверяет `body.csrf` (JSON) или `body.fields.csrf` (multipart) с `req.session.csrfSecret`; несовпадение → `403`.
- Cookie подписывается `cookie-signature` (`sid=s:<id>.<sig>`); неподписанная игнорируется → для curl-тестов обязателен формат `s:`.

---

## Ограничения и нюансы (важно)

1. **Структура JSON ответа — контракт**, не менять (клиенты вставляют `<picture>` по этим путям).
2. **`/upload/…` не может быть nginx-location** без префикса (см. выше) — конфликт со старыми сервисами.
3. **Диск** — только общий `cloudFRT/images/` по app-root; `process.cwd()` сервиса не используется для записи.
4. **Коллизии файлов** решаются суффиксом `-rand`, не перезаписью.
5. **`recoverable` файлы** (original/webp/resize) чистит `deleteArrayFiles` через `/delete-image` — единый путь, чтобы не оставалось осиротевших файлов на диске.
6. **Не полагаться на `resize` при ширине < breakpoint**: для маленьких картинок `resize` пуст — ответ всё равно 200.

---

## Конфигурация (`.env`)

Сервис читает env из **своего каталога** `microservices/uploads/.env` (копия — `.env.example`).
**Без `.env` не стартует** (`core/action.js` fail-fast на `SESSION_SECRET`, `index.js` — на `RABBIT_URL`).

| Переменная | Обязат. | Описание |
|---|---|---|
| `RABBIT_URL` | ✅ | шина RabbitMQ (`amqp://…`) |
| `TIMED_OUT` | | таймаут RPC (мс), default `5000` |
| `MICROSERVICES_NAME` | | какие МС знает (через `,`); default `auth,users,cache,render` |
| `PORT` | | HTTP-порт, default `7620` |
| `REDIS_HOST/PORT/FAMILY` | | Redis (общий с gateway) |
| `REDIS_PASSWORD` | | пароль Redis |
| `SESSION_SECRET` | ✅ | секрет подписи cookie — **обязан совпадать с gateway** `core/action.js` (иначе `401` на все загрузки). В коде НЕ зашит, только env. |
| `UPLOAD_DIR` | | веб-папка на диске (default `/images/`) |
| `UPLOAD_FILESIZE` | | лимит размера файла |
| `UPLOAD_MIMETYPE` | | разрешённые типы |

> Ручное резюме по секретам: `SESSION_SECRET` вынесен из кода в env (commit `5c4bdb1`); корневой и uploads-`.env` не в git (правило `.env` в `.gitignore`).

---

## Запуск / сборка

Поднимается через общий `start-cloudfrt.sh` (uploads есть в `SERVICES`):

```bash
# dev (nodemon) или prod (node) — стек cloudFRT целиком:
bash /media/04E0AC01E0ABF6D8/agent/tim/scripts/start-cloudfrt.sh   # DEV_MODE=0 → node ./index.js
```

Проверка после старта:

```bash
# HTTP жив (за nginx):
curl -s -o /dev/null -w "%{http_code}\n" https://frt.su/files/upload/  # 404/400 (роут есть, param нет)
# RPC на шине доступен (логи: queue uploads:requests, redis CONNECTED, "HTTP :7620 + Rabbit (name=uploads)")
```

> Fail-fast: при отсутствии обязательных env сервис пишет причину и `exit(1)`.

---

## Связанные заметки
- Путь/структуру будущих МС-загрузок смотреть у **destinations**: `client -> /files/upload/:ms-:mi`, удаление `-> /files/delete-image`.
- План и решения: MuninnDB `db` (04–05.09.2026), commits `e6ce6b2` (создание) и `5c4bdb1` (вынос SESSION_SECRET в env).
