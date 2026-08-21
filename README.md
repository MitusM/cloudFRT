# cloudFRT

ESM-монорепо: **Gateway + RabbitMQ-микросервисы** (MicroMQ) + **OrientDB**.

Стек: Node.js (ESM), RabbitMQ (amin's MicroMQ / `core/micromq`), OrientDB 3.x (графовая БД), Redis. Сервисы общаются по RPC-шине (RabbitMQ); HTTP-вход один — Gateway (порт `7606`).

## Архитектура

```
HTTP-клиент
   │
   ▼
 Gateway (core/micromq) ── RabbitMQ ──▶ Микросервисы (RPC-консьюмеры)
   │  res.delegate(...)                    users, auth, render, article, trips,
   │                       ◀─────── JSON   country, cache, maps, geo
   ▼
 клиент ← res.end(...)
```

- **Один вход** — Gateway: клиентский HTTP → `res.delegate()` → очередь → микросервис-консьюмер → ответ `Response` → JSON обратно по шине → Gateway `res.end()`.
- **Ответы микросервисов сериализуются через `JSON.stringify`** (Buffer ломается). Для бинарных данных используется контракт `{ __frtBase64: string, contentType?: string }` — Gateway декодирует base64 и отдаёт настоящие байты клиенту (правка в `core/micromq/src/Gateway.js`).

## Микросервисы

| Сервис | Роль |
|---|---|
| `gateway` | HTTP-шлюз, маршрутизация RPC-запросов |
| `users`/`auth` | Авторизация/сессии |
| `render` | Рендер HTML |
| `article` | Статьи |
| `trips` | Агрегат поездок (Trip + TripMember + TripPlace) |
| `country` | Страны |
| `cache` | Кэш |
| `maps` | Визуальная карта (MapLibre GL) + гео |
| `geo` | Гео-провайдер (опционально, нужен Postgres) |

## Карта (МС maps)

Визуальная карта рендерится **в одной точке** — `microservices/maps/service/renderMapHtml.js` (MapLibre GL 4.4, CDN unpkg + OpenFreeMap Liberty; спутник — Esri World Imagery). Этот же HTML отдаётся и по RPC `maps:map`, и по `GET /maps/map`, и его переиспользуют поездки (trips) и OG-превью.

Публичные эндпоинты: `/maps/map`, `/maps/geocode`, `/maps/pois`, `/maps/og`.

### Экспорт карты в PNG (клиентский)
Кнопка «Скачать карту как PNG» (📥) в тулбаре карты — модалка с превью, экспорт через плагин `maplibre-gl-map-to-image` (CDN). Опция отключения — `export: false` в `MapsRender.createMap`.

### OG-превью поездки (серверный рендер)
При шеринге ссылки на поездку соцсети показывают карту поездки с маркерами (1200×630):

- `trips GET /trips/:id/og-image` — грузит поездку + места → RPC `maps:og` → PNG.
- `maps:og` / `microservices/maps/service/ogExport.js` — рендер во **headless Chromium** (Playwright), та же точка рендера `renderMapHtml`, что и у пользователя → картинка 1:1.
- OG-мета-теги (`og:image`, `twitter:card`) в `<head>` страницы поездки, URL публичный из `x-forwarded-proto`/`host`.
- `/trips/map` и `/trips/:id/og-image` открыты анонимно (защита на `canRead`: приватая поездка → 403).
- **Кэш**: `trips/service/ogCache.js` → `cloudFRT/og-cache/<tripId>.png`, TTL 7 дней + инвалидация при изменении трипа/мест. Холодный рендер ~7–28 с, из кэша — миллисекунды.

*Playwright установлен отдельно: `npm i playwright --no-save` + `npx playwright install chromium`. Зависимость осознанно не в `package.json` (нужна только там, где включён ОG-рендер).*

## Запуск

- Скрипт подъёма стека: `scripts/start-cloudfrt.sh` (Redis / RabbitMQ / OrientDB + Gateway и микросервисы через nodemon).
- Переменные окружения — в `.env` (OrientDB, Redis, таймаут Gateway `TIMED_OUT`).
