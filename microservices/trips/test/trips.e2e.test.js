// === === === === === === === === === === === ===
// E2E-тест trips: шинный RPC list-user + place-add (+ дедуп).
//
// Запуск (с учётом ESM: RABBIT_URL читается из .env, нужен живой стек):
//   NODE_PATH=... node --test test/   (из microservices/trips)
// или напрямую:
//   node --test test/trips.e2e.test.js
//
// Тест НЕ зависит от HTTP-слоя: дёргает МС trips напрямую через шину RabbitMQ
// (формат из src/MicroService.js: {requestId, queue, server:{action, meta}}).
// Нужны живые: RabbitMQ (:5672), OrientDB (:2424), сервис trips.
// Создаёт в dev-БД тестовую поездку + Place и оставляет их (idempotent по
// nanoid-суффиксу, чтобы повторные прогоны не конфликтовали).
// === === === === === === === === === === === ===
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { rpc, close } from './rpc.js'

// misha (#22:0) — владелец тестовых данных в dev-БД
const MISHA = '#22:0'
const suffix = Date.now().toString(36)
const TRIP_ID = 'e2e-trip-' + suffix // поездка, создаваемая тестом

before(async () => {
  // Создаём тестовую поездку на прямую в OrientDB (REST), чтобы у trips был
  // объект для линковки места. Шаблон полей — как у trips createTrip.
  const pw = process.env.ORIENTDB_PASSWORD
  const user = process.env.ORIENTDB_USERNAME || 'misha'
  if (!pw) throw new Error('ORIENTDB_PASSWORD не задан (взять из cloudFRT/.env)')
  const auth = Buffer.from(`${user}:${pw}`).toString('base64')
  const q =
    'CREATE VERTEX Trip SET ' +
    'title="E2E test trip ' + suffix + '", description="автотест trips RPC", ' +
    'start_date="2026-08-20 10:00:00", end_date="2026-08-25 10:00:00", ' +
    'currency="RUB", is_archived=false, reminder_days=0, ' +
    '_id="' + TRIP_ID + '", owner="misha", ownerRid="' + MISHA + '", ' +
    'created_at="2026-08-15 10:00:00", updated_at="2026-08-15 10:00:00"'
  const url =
    'http://127.0.0.1:2480/command/cloudFRT/sql/' +
    encodeURIComponent(q)
  const res = await fetch(url, { headers: { Authorization: 'Basic ' + auth } })
  const body = await res.json()
  assert.ok(body.result && body.result[0], 'не удалось создать тестовую поездку: ' + JSON.stringify(body).slice(0, 200))
})

after(async () => {
  await close()
})

test('trips:list-user возвращает список поездок misha (содержит тестовую)', async () => {
  const { statusCode, response } = await rpc('trips', 'trips:list-user', {
    user: { rid: MISHA },
  })
  assert.equal(statusCode, 200)
  assert.ok(Array.isArray(response.trips), 'response.trips должен быть массивом')
  const found = response.trips.find((t) => t._id === TRIP_ID || String(t['@rid']) === String(t['@rid']))
  // хотя бы поездка с нашим _id есть среди получившихся
  const byId = response.trips.filter((t) => t._id === TRIP_ID).length
  assert.ok(byId >= 1, 'тестовая поездка ' + TRIP_ID + ' должна быть в списке')
})

test('trips:place-add создаёт Place и линкует к поездке', async () => {
  const { statusCode, response } = await rpc('trips', 'trips:place-add', {
    user: { rid: MISHA },
    tripId: TRIP_ID,
    place: {
      name: 'Красная площадь',
      description: 'из e2e-теста',
      address: 'Москва, Красная площадь',
      lat: 55.75393,
      lng: 37.6208,
      osm_id: 'relation:8128374',
      source: 'article',
      url: '/e2e/red-square',
    },
  })
  assert.equal(statusCode, 200)
  assert.ok(response.place, 'place-add должен вернуть place')
  assert.ok(response.place.rid, 'place должен иметь rid')
  assert.ok(response.place._id, 'place должен иметь _id')
})

test('trips:place-add дедуплицирует повторное добавление того же места', async () => {
  const meta = {
    user: { rid: MISHA },
    tripId: TRIP_ID,
    place: {
      name: 'Красная площадь',
      lat: 55.75393,
      lng: 37.6208,
      osm_id: 'relation:8128374',
      source: 'article',
    },
  }
  const first = await rpc('trips', 'trips:place-add', meta)
  const second = await rpc('trips', 'trips:place-add', meta)
  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.equal(first.response.place.rid, second.response.place.rid, 'повторное добавление должно вернуть тот же rid')
  assert.equal(second.response.duplicated, true, 'второй вызов должен пометить duplicated:true')
})
