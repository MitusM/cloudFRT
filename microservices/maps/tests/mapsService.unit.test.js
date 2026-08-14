// === === === === === === === === === === === ===
// Maps unit tests — чистые функции без сетевых вызовов
// Запуск: node --test tests/
// === === === === === === === === === === === ===
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUserAgent,
  googleFtidFromMapsUrl,
  parseOpeningHours,
  resolveOverpassEndpoints,
  POI_CATEGORY_KEYS,
  buildOsmDetails,
} from '../service/mapsService.js'

test('buildUserAgent: подставляет instance URL, отбрасывает localhost', () => {
  const withUrl = buildUserAgent('https://cloud.frt.su')
  assert.ok(withUrl.includes('cloud.frt.su'))
  const noLocal = buildUserAgent('http://localhost:3003')
  assert.ok(!noLocal.includes('localhost'))
  assert.ok(!noLocal.includes(';'))
})

test('googleFtidFromMapsUrl: извлекает ftid, отклоняет мусор', () => {
  assert.equal(googleFtidFromMapsUrl('https://maps.google.com/?cid=123'), null)
  assert.equal(googleFtidFromMapsUrl('https://maps.google.com/place/?ftid=0x1:0x2'), '0x1:0x2')
  assert.equal(googleFtidFromMapsUrl(null), null)
  assert.equal(googleFtidFromMapsUrl('not a url'), null)
})

test('parseOpeningHours: weekday + openNow', () => {
  const r = parseOpeningHours('Mo-Fr 09:00-18:00; Sa 10:00-14:00')
  assert.equal(r.weekdayDescriptions.length, 7)
  assert.ok(r.weekdayDescriptions[0].includes('09:00-18:00')) // Mo
  assert.ok(r.weekdayDescriptions[4].includes('09:00-18:00')) // Fr
  assert.ok(r.weekdayDescriptions[5].includes('10:00-14:00')) // Sa
  assert.ok(r.weekdayDescriptions[6].endsWith('?')) // Su — без данных
})

test('resolveOverpassEndpoints: кастомные заменяют дефолтные, мусор отбрасывается', () => {
  const custom = resolveOverpassEndpoints('https://a.example/api, garbage, http://b.example/x')
  assert.deepEqual(custom, ['https://a.example/api', 'http://b.example/x'])
  const def = resolveOverpassEndpoints(undefined)
  assert.ok(def.length >= 3)
})

test('POI_CATEGORY_KEYS: известные категории', () => {
  assert.ok(POI_CATEGORY_KEYS.includes('restaurant'))
  assert.ok(POI_CATEGORY_KEYS.includes('sights'))
  assert.ok(POI_CATEGORY_KEYS.includes('hotel'))
})

test('buildOsmDetails: opening_hours парсится только при данных', () => {
  const d1 = buildOsmDetails({ name: 'X', 'contact:website': 'https://x.example' }, 'node', '1')
  assert.equal(d1.website, 'https://x.example')
  assert.equal(d1.opening_hours, null)
  const d2 = buildOsmDetails({ opening_hours: 'Mo-Fr 09:00-17:00' }, 'way', '2')
  assert.ok(Array.isArray(d2.opening_hours))
  assert.equal(d2.osm_url, 'https://www.openstreetmap.org/way/2')
})
