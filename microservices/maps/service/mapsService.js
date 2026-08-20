// mapsService — гео-микросервис cloudFRT (провайдер OpenStreetMap по умолчанию).
// Портировано из TREK server/src/services/mapsService.ts.
// Адаптации: getMapsKey из env (GOOGLE_PLACES_API_KEY), SQLite-ветки Google → no-op,
// getAppUrl → process.env.APP_URL. Google-ветки остаются, но включаются только при ключе в env.

import { safeFetchFollow, SsrfBlockedError } from './utils/ssrfGuard.js'
import { decrypt_api_key } from './utils/apiKeyCrypto.js'
import * as placePhotoCache from './placePhotoCache.js'

// ── Google API call counter ───────────────────────────────────────────────────
let googleApiCallCount = 0

function googleFetch(endpoint, label, init) {
  googleApiCallCount++
  console.debug(`[Google API] #${googleApiCallCount} ${label} → ${endpoint}`)
  const referer = process.env.APP_URL
  return fetch(endpoint, {
    ...init,
    headers: { ...(referer ? { Referer: referer } : {}), ...((init && init.headers) || {}) },
  })
}

// ── User-Agent + locale normalisation (BCP-47) ───────────────────────────────
export function buildUserAgent(instanceUrl) {
  const base = 'TREK Travel Planner (https://github.com/liketrek/TREK)'
  if (instanceUrl && !instanceUrl.startsWith('http://localhost')) return `${base}; ${instanceUrl}`
  return base
}
const UA = buildUserAgent(process.env.APP_URL)

const API_LANG_OVERRIDES = { br: 'pt-BR', gr: 'el', 'el-GR': 'el' }
function toApiLang(lang, fallback = 'en') {
  const code = (lang || '').trim()
  if (!code) return fallback
  return API_LANG_OVERRIDES[code] ?? code
}

const GOOGLE_FTID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i

export function googleFtidFromMapsUrl(url) {
  if (!url) return null
  try {
    const ftid = new URL(url).searchParams.get('ftid')?.trim()
    return ftid && GOOGLE_FTID_RE.test(ftid) ? ftid.toLowerCase() : null
  } catch {
    return null
  }
}

// ── Concurrency limiter for outbound photo fetches ───────────────────────────
const MAX_CONCURRENT_PHOTO_FETCHES = 5
let photoFetchActive = 0
const photoFetchQueue = []

function acquirePhotoFetchSlot() {
  if (photoFetchActive < MAX_CONCURRENT_PHOTO_FETCHES) {
    photoFetchActive++
    return Promise.resolve()
  }
  return new Promise((resolve) => photoFetchQueue.push(resolve))
}

function releasePhotoFetchSlot() {
  const next = photoFetchQueue.shift()
  if (next) next()
  else photoFetchActive--
}

// ── API key retrieval (заглушка: читаем из env, не из OrientDB) ─────────────
// Решение 14.08.2026: Google-ключ выносим в .env (GOOGLE_PLACES_API_KEY), поле
// maps_api_key в OrientDB User НЕ заводим. Пусто → весь трафик через OSM.
export function getMapsKey() {
  const raw = process.env.GOOGLE_PLACES_API_KEY
  return decrypt_api_key(raw)
}

// ── Nominatim search ─────────────────────────────────────────────────────────
export async function searchNominatim(query, lang) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '10',
    'accept-language': toApiLang(lang),
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': UA },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Nominatim API error: ${response.status} ${response.statusText}${text ? ' - ' + text.substring(0, 200) : ''}`)
  }
  const data = await response.json()
  return data.map((item) => ({
    google_place_id: null,
    google_ftid: null,
    osm_id: `${item.osm_type}:${item.osm_id}`,
    name: item.name || item.display_name?.split(',')[0] || '',
    address: item.display_name || '',
    lat: parseFloat(item.lat) || null,
    lng: parseFloat(item.lon) || null,
    rating: null,
    website: null,
    phone: null,
    source: 'openstreetmap',
  }))
}

// ── Nominatim lookup (by OSM ID) ─────────────────────────────────────────────
export async function lookupNominatim(osmType, osmId, lang) {
  const typePrefix = osmType.charAt(0).toUpperCase() // N, W, R
  const params = new URLSearchParams({
    osm_ids: `${typePrefix}${osmId}`,
    format: 'json',
    'accept-language': toApiLang(lang),
  })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/lookup?${params}`, {
      headers: { 'User-Agent': UA },
    })
    if (!res.ok) return null
    const data = await res.json()
    const item = data[0]
    if (!item) return null
    return {
      name: item.name || item.display_name?.split(',')[0] || '',
      address: item.display_name || '',
      lat: parseFloat(item.lat) || null,
      lng: parseFloat(item.lon) || null,
    }
  } catch {
    return null
  }
}

// ── Overpass API (OSM details) ───────────────────────────────────────────────
const OVERPASS_TIMEOUT_MS = 12000
const MAX_BBOX_SPAN_DEG = 0.5
const POI_CACHE_TTL_MS = 5 * 60 * 1000
const POI_CACHE_MAX = 500

const DEFAULT_OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

export function resolveOverpassEndpoints(raw = process.env.OVERPASS_URL) {
  const custom = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => {
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    })
  return custom.length ? custom : DEFAULT_OVERPASS_MIRRORS
}
const OVERPASS_MIRRORS = resolveOverpassEndpoints()

export async function fetchOverpassDetails(osmType, osmId) {
  const typeMap = { node: 'node', way: 'way', relation: 'rel' }
  const oType = typeMap[osmType]
  if (!oType) return null
  const query = `[out:json][timeout:5];${oType}(${osmId});out tags;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.elements?.[0] || null
  } catch {
    return null
  }
}

// ── Overpass POI search (category within bbox) ───────────────────────────────
const CATEGORY_OSM_FILTERS = {
  restaurant: ['amenity=restaurant', 'amenity=fast_food'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub', 'amenity=nightclub'],
  hotel: ['tourism=hotel', 'tourism=hostel', 'tourism=guest_house', 'tourism=apartment', 'tourism=motel'],
  sights: ['tourism=attraction', 'tourism=viewpoint', 'historic=monument', 'historic=castle', 'historic=memorial', 'historic=ruins'],
  museum: ['tourism=museum', 'tourism=gallery', 'tourism=artwork', 'amenity=theatre'],
  nature: ['leisure=park', 'leisure=garden', 'natural=beach', 'natural=peak'],
  activity: ['tourism=theme_park', 'tourism=zoo', 'tourism=aquarium', 'leisure=water_park'],
  shopping: ['shop=mall', 'shop=department_store', 'amenity=marketplace'],
  supermarket: ['shop=supermarket', 'shop=convenience'],
}
export const POI_CATEGORY_KEYS = Object.keys(CATEGORY_OSM_FILTERS)

const POI_CACHE = new Map()

async function overpassFetch(query) {
  const body = `data=${encodeURIComponent(query)}`
  const controllers = []

  const attempt = async (url) => {
    const ctrl = new AbortController()
    controllers.push(ctrl)
    const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url}`)
      const data = await res.json()
      if (data.remark) throw new Error(`Overpass remark @ ${url}: ${data.remark}`)
      if (!Array.isArray(data.elements)) throw new Error(`Overpass non-OSM body @ ${url}`)
      return data.elements
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    return await Promise.any(OVERPASS_MIRRORS.map(attempt))
  } catch (err) {
    const reasons =
      err instanceof AggregateError
        ? err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(' | ')
        : err instanceof Error
          ? err.message
          : String(err)
    console.error(`[Overpass] all ${OVERPASS_MIRRORS.length} endpoint(s) failed — ${reasons}`)
    throw Object.assign(new Error('Could not reach any Overpass endpoint'), { status: 502 })
  } finally {
    controllers.forEach((c) => {
      try { c.abort() } catch { /* noop */ }
    })
  }
}

export async function searchOverpassPois(category, bbox, limit = 60) {
  const filters = CATEGORY_OSM_FILTERS[category]
  if (!filters) throw Object.assign(new Error('Unknown POI category'), { status: 400 })

  let { south, west, north, east } = bbox
  let clamped = false
  if (north - south > MAX_BBOX_SPAN_DEG) {
    const c = (north + south) / 2
    south = c - MAX_BBOX_SPAN_DEG / 2
    north = c + MAX_BBOX_SPAN_DEG / 2
    clamped = true
  }
  if (east - west > MAX_BBOX_SPAN_DEG) {
    const c = (east + west) / 2
    west = c - MAX_BBOX_SPAN_DEG / 2
    east = c + MAX_BBOX_SPAN_DEG / 2
    clamped = true
  }

  const cacheKey = `${category}|${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}|${limit}`
  const cached = POI_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.at < POI_CACHE_TTL_MS) return cached.value
  if (cached) POI_CACHE.delete(cacheKey)

  const box = `(${south},${west},${north},${east})`
  const selectors = filters
    .map((f) => {
      const [k, v] = f.split('=')
      return `  nwr["${k}"="${v}"]${box};`
    })
    .join('\n')
  const query = `[out:json][timeout:20];\n(\n${selectors}\n);\nout center tags ${limit + 25};`

  const elements = await overpassFetch(query)

  const pois = []
  for (const el of elements) {
    const tags = el.tags || {}
    const name = tags.name || tags['name:en'] || tags.brand || null
    if (!name) continue
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    const matched = filters.find((f) => {
      const [k, v] = f.split('=')
      return tags[k] === v
    }) || filters[0]
    const addr = [tags['addr:street'], tags['addr:housenumber'], tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ') || null
    pois.push({
      osm_id: `${el.type}:${el.id}`,
      name, lat, lng, category,
      poi_type: matched,
      address: addr,
      website: tags.website || tags['contact:website'] || null,
      phone: tags.phone || tags['contact:phone'] || null,
      opening_hours: tags.opening_hours || null,
      cuisine: tags.cuisine || null,
      source: 'openstreetmap',
    })
  }
  const truncated = pois.length > limit
  const value = { pois: pois.slice(0, limit), source: 'openstreetmap', truncated, clamped }
  if (POI_CACHE.size >= POI_CACHE_MAX) POI_CACHE.delete(POI_CACHE.keys().next().value)
  POI_CACHE.set(cacheKey, { at: Date.now(), value })
  return value
}

// ── Opening hours parsing ────────────────────────────────────────────────────
export function parseOpeningHours(ohString) {
  const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const result = LONG.map((d) => `${d}: ?`)
  for (const segment of ohString.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(.+)$/i)
    if (!match) continue
    const [, daysPart, timePart] = match
    const dayIndices = new Set()
    for (const range of daysPart.split(',')) {
      const parts = range.trim().split('-').map((d) => DAYS.indexOf(d.trim()))
      if (parts.length === 2 && parts[0] >= 0 && parts[1] >= 0) {
        for (let i = parts[0]; i !== (parts[1] + 1) % 7; i = (i + 1) % 7) dayIndices.add(i)
        dayIndices.add(parts[1])
      } else if (parts[0] >= 0) {
        dayIndices.add(parts[0])
      }
    }
    for (const idx of dayIndices) result[idx] = `${LONG[idx]}: ${timePart.trim()}`
  }
  let openNow = null
  try {
    const now = new Date()
    const jsDay = now.getDay()
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1
    const todayLine = result[dayIdx]
    const timeRanges = [...todayLine.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)]
    if (timeRanges.length > 0) {
      const nowMins = now.getHours() * 60 + now.getMinutes()
      openNow = timeRanges.some((m) => {
        const start = parseInt(m[1]) * 60 + parseInt(m[2])
        const end = parseInt(m[3]) * 60 + parseInt(m[4])
        return end > start ? nowMins >= start && nowMins < end : nowMins >= start || nowMins < end
      })
    }
  } catch { /* best effort */ }
  return { weekdayDescriptions: result, openNow }
}

// ── Build standardized OSM details ───────────────────────────────────────────
export function buildOsmDetails(tags, osmType, osmId) {
  let opening_hours = null
  let open_now = null
  if (tags.opening_hours) {
    const parsed = parseOpeningHours(tags.opening_hours)
    const hasData = parsed.weekdayDescriptions.some((line) => !line.endsWith('?'))
    if (hasData) {
      opening_hours = parsed.weekdayDescriptions
      open_now = parsed.openNow
    }
  }
  return {
    website: tags['contact:website'] || tags.website || null,
    phone: tags['contact:phone'] || tags.phone || null,
    opening_hours,
    open_now,
    osm_url: `https://www.openstreetmap.org/${osmType}/${osmId}`,
    summary: tags.description || null,
    source: 'openstreetmap',
  }
}

// ── Wikimedia Commons photo lookup ───────────────────────────────────────────
export async function fetchWikimediaPhoto(lat, lng, name) {
  if (name) {
    try {
      const searchParams = new URLSearchParams({
        action: 'query', format: 'json', titles: name, prop: 'pageimages',
        piprop: 'thumbnail', pithumbsize: '400', pilimit: '1', redirects: '1',
      })
      const res = await fetch(`https://en.wikipedia.org/w/api.php?${searchParams}`, { headers: { 'User-Agent': UA } })
      if (res.ok) {
        const data = await res.json()
        const pages = data.query?.pages
        if (pages) {
          for (const page of Object.values(pages)) {
            if (page.thumbnail?.source) return { photoUrl: page.thumbnail.source, attribution: 'Wikipedia' }
          }
        }
      }
    } catch { /* fall through to geosearch */ }
  }
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'geosearch', ggsprimary: 'all',
    ggsnamespace: '6', ggsradius: '300', ggscoord: `${lat}|${lng}`, ggslimit: '5',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '400',
  })
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return null
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0]
      const mime = info?.mime || ''
      if (info?.url && (mime.startsWith('image/jpeg') || mime.startsWith('image/png'))) {
        const attribution = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '').trim() || null
        return { photoUrl: info.thumburl ?? info.url, attribution }
      }
    }
    return null
  } catch {
    return null
  }
}

// ── Search places (Google or Nominatim fallback) ─────────────────────────────
export async function searchPlaces(query, lang, locationBias) {
  const apiKey = getMapsKey()
  if (!apiKey) {
    const places = await searchNominatim(query, lang)
    return { places, source: 'openstreetmap' }
  }

  const searchBody = { textQuery: query, languageCode: toApiLang(lang) }
  if (locationBias) {
    searchBody.locationBias = {
      circle: { center: { latitude: locationBias.lat, longitude: locationBias.lng }, radius: locationBias.radius ?? 50000 },
    }
  }
  const response = await googleFetch('https://places.googleapis.com/v1/places:searchText', 'searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.websiteUri,places.nationalPhoneNumber,places.types,places.googleMapsUri',
    },
    body: JSON.stringify(searchBody),
  })
  const data = await response.json()
  if (!response.ok) {
    const err = new Error(data.error?.message || 'Google Places API error')
    err.status = response.status
    throw err
  }
  const places = (data.places || []).map((p) => ({
    google_place_id: p.id,
    google_ftid: googleFtidFromMapsUrl(p.googleMapsUri),
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    lat: p.location?.latitude || null,
    lng: p.location?.longitude || null,
    rating: p.rating || null,
    website: p.websiteUri || null,
    phone: p.nationalPhoneNumber || null,
    types: p.types || [],
    source: 'google',
  }))
  return { places, source: 'google' }
}

// ── Поиск мест: сначала наши SearchPlace (OrientDB), фолбэк — Nominatim ─────
// Вариант 1 (20.08.2026): поиск по названию бьёт сначала по вершине SearchPlace
// в OrientDB. Если там пусто — Nominatim (OSM). Найденные места СОХРАНЯЕМ в
// SearchPlace, чтобы постепенно наполнить БД своими POI и в следующий раз
// находить локально (без внешнего запроса).
// db — Model extends PDO (app.options.db), query|lang — строка.
function toOrientDateTime(value) {
  if (!value) return value
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export async function searchSearchPlace(db, query, lang) {
  const LIMIT = 8
  // 1) Ищем в своих SearchPlace (нечётко по имени, только поисковые)
  let local = []
  if (db) {
    try {
      local = await db.queryAll(
        'SELECT FROM SearchPlace WHERE searchable = true AND name LIKE :term LIMIT :limit',
        { params: { term: '%' + String(query).toLowerCase() + '%', limit: LIMIT } },
      )
      local = (local || []).map((p) => ({
        id: String(p['@rid']),
        name: p.name || '',
        address: p.address || '',
        lat: p.lat != null ? Number(p.lat) : null,
        lng: p.lng != null ? Number(p.lng) : null,
        osm_id: p.osm_id || null,
        google_place_id: p.google_place_id || null,
        url: p.url || null,
        source: p.source || 'local',
      }))
    } catch (err) {
      console.log('⚡ err::searchSearchPlace(локальный) => ', err)
      local = []
    }
  }
  if (local.length) {
    return { places: local, source: 'local' }
  }

  // 2) Промах — внешний Nominatim/Google
  let remote
  try {
    remote = await searchPlaces(query, lang)
  } catch (err) {
    console.log('⚡ err::searchSearchPlace(внешний) => ', err)
    remote = { places: [], source: 'error' }
  }
  const places = (remote.places || []).slice(0, LIMIT).map((p) => ({
    id: p.osm_id || null,
    name: p.name || '',
    address: p.address || '',
    lat: p.lat != null ? Number(p.lat) : null,
    lng: p.lng != null ? Number(p.lng) : null,
    osm_id: p.osm_id || null,
    google_place_id: p.google_place_id || null,
    url: p.website || null,
    source: p.source || remote.source || 'openstreetmap',
  }))

  // 3) Сохраняем найденное в SearchPlace (наполняем БД своими POI)
  if (db) {
    for (const p of places) {
      if (!p.name || p.lat == null || p.lng == null) continue
      try {
        const exists = await db.queryAll(
          'SELECT FROM SearchPlace WHERE name = :name AND lat = :lat AND lng = :lng LIMIT 1',
          { params: { name: p.name, lat: p.lat, lng: p.lng } },
        )
        if (exists && exists.length) continue
        await db.command(
          'CREATE VERTEX SearchPlace SET ' +
            'name=:name, address=:address, lat=:lat, lng=:lng, osm_id=:osm_id, ' +
            'google_place_id=:google_place_id, url=:url, source=:source, ' +
            'searchable=true, created_at=:created_at',
          { params: {
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
            osm_id: p.osm_id,
            google_place_id: p.google_place_id,
            url: p.url,
            source: p.source,
            created_at: toOrientDateTime(new Date()),
          } },
        )
      } catch (err) {
        console.log('⚡ err::searchSearchPlace(сохранение) => ', err)
      }
    }
  }

  return { places, source: remote.source || 'openstreetmap' }
}

// ── Autocomplete (Google or Nominatim fallback) ─────────────────────────────
export async function autocompletePlaces(input, lang, locationBias) {
  const apiKey = getMapsKey()
  if (!apiKey) return autocompleteNominatim(input, lang)

  const body = { input, languageCode: toApiLang(lang) }
  if (locationBias) {
    body.locationBias = {
      rectangle: {
        low: { latitude: locationBias.low.lat, longitude: locationBias.low.lng },
        high: { latitude: locationBias.high.lat, longitude: locationBias.high.lng },
      },
    }
  }
  const response = await googleFetch('https://places.googleapis.com/v1/places:autocomplete', 'autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    const err = new Error(data.error?.message || 'Google Places Autocomplete error')
    err.status = response.status
    throw err
  }
  const suggestions = (data.suggestions || [])
    .filter((s) => s.placePrediction)
    .slice(0, 5)
    .map((s) => ({
      placeId: s.placePrediction.placeId,
      mainText: s.placePrediction.structuredFormat?.mainText?.text || '',
      secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || '',
    }))
  return { suggestions, source: 'google' }
}

async function autocompleteNominatim(input, lang) {
  try {
    const places = await searchNominatim(input, lang)
    const suggestions = places
      .filter((p) => p.osm_id && p.osm_id.includes(':') && p.osm_id.split(':')[1] !== '')
      .slice(0, 5)
      .map((p) => {
        const parts = (p.address || '').split(',').map((s) => s.trim())
        return { placeId: p.osm_id, mainText: p.name || parts[0] || '', secondaryText: parts.slice(1).join(', ') }
      })
    return { suggestions, source: 'nominatim' }
  } catch (err) {
    console.error('Nominatim autocomplete failed:', err)
    return { suggestions: [], source: 'nominatim' }
  }
}

// ── Place details (Google or OSM) ────────────────────────────────────────────
export async function getPlaceDetails(placeId, lang) {
  // OSM details: placeId is "node:123456" or "way:123456"
  if (placeId.includes(':')) {
    const [osmType, osmId] = placeId.split(':')
    const element = await fetchOverpassDetails(osmType, osmId)
    const details = buildOsmDetails(element?.tags || {}, osmType, osmId)
    const needsNominatim = !details.lat && !details.lng || !details.address
    const nominatim = needsNominatim ? await lookupNominatim(osmType, osmId, lang) : null
    return {
      place: {
        ...details,
        name: element?.tags?.name || nominatim?.name || '',
        address: details.address || nominatim?.address || '',
        lat: details.lat ?? nominatim?.lat ?? null,
        lng: details.lng ?? nominatim?.lng ?? null,
        osm_id: placeId,
      },
    }
  }

  // Google details
  const langKey = toApiLang(lang, 'de')
  const apiKey = getMapsKey()
  if (!apiKey) throw Object.assign(new Error('Google Maps API key not configured'), { status: 400 })
  const response = await googleFetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=${langKey}`, `getPlaceDetails(${placeId})`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,nationalPhoneNumber,regularOpeningHours,googleMapsUri',
    },
  })
  const data = await response.json()
  if (!response.ok) {
    const err = new Error(data.error?.message || 'Google Places API error')
    err.status = response.status
    throw err
  }
  return {
    place: {
      google_place_id: data.id,
      google_ftid: googleFtidFromMapsUrl(data.googleMapsUri),
      name: data.displayName?.text || '',
      address: data.formattedAddress || '',
      lat: data.location?.latitude || null,
      lng: data.location?.longitude || null,
      rating: data.rating || null,
      rating_count: data.userRatingCount || null,
      website: data.websiteUri || null,
      phone: data.nationalPhoneNumber || null,
      opening_hours: data.regularOpeningHours?.weekdayDescriptions || null,
      open_now: data.regularOpeningHours?.openNow ?? null,
      google_maps_url: data.googleMapsUri || null,
      summary: null,
      reviews: [],
      source: 'google',
      cached_at: Date.now(),
    },
  }
}

// ── Reverse geocoding ────────────────────────────────────────────────────────
export async function reverseGeocode(lat, lng, lang) {
  const params = new URLSearchParams({
    lat, lon: lng, format: 'json', addressdetails: '1', zoom: '18', 'accept-language': toApiLang(lang),
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: { 'User-Agent': UA },
  })
  if (!response.ok) return { name: null, address: null }
  const data = await response.json()
  const addr = data.address || {}
  const name = data.name || addr.tourism || addr.amenity || addr.shop || addr.building || addr.road || null
  return { name, address: data.display_name || null }
}

// ── Place photo (Google or Wikimedia, disk-cached) ────────────────────────────
export async function getPlacePhoto(placeId, lat, lng, name) {
  // Disk cache hit — serve immediately
  const diskHit = placePhotoCache.get(placeId)
  if (diskHit) return { photoUrl: diskHit.photoUrl, attribution: diskHit.attribution }

  // Recent error — don't hammer the API
  if (placePhotoCache.getErrored(placeId)) {
    throw Object.assign(new Error('(Cache) No photo available'), { status: 404 })
  }

  // Deduplicate concurrent requests for the same placeId
  const existing = placePhotoCache.getInFlight(placeId)
  if (existing) {
    const result = await existing
    if (!result) throw Object.assign(new Error('(Cache) No photo available'), { status: 404 })
    return { photoUrl: `/api/maps/place-photo/${encodeURIComponent(placeId)}/bytes`, attribution: result.attribution }
  }

  const fetchPromise = (async () => {
    await acquirePhotoFetchSlot()
    try {
      const apiKey = getMapsKey()
      const isCoordLookup = placeId.startsWith('coords:')

      const fetchWikimediaFallback = async () => {
        if (isNaN(lat) || isNaN(lng)) return null
        try {
          const wiki = await fetchWikimediaPhoto(lat, lng, name)
          if (!wiki) return null
          const imgRes = await safeFetchFollow(wiki.photoUrl, undefined, { bypassInternalIpAllowed: true })
          if (!imgRes.ok) return null
          const bytes = Buffer.from(await imgRes.arrayBuffer())
          const cached = await placePhotoCache.put(placeId, bytes, wiki.attribution)
          return { filePath: cached.filePath, attribution: cached.attribution }
        } catch {
          return null
        }
      }

      const fetchGooglePhoto = async () => {
        if (!apiKey || /^https?:\/\//i.test(placeId)) return null
        const detailsRes = await googleFetch(`https://places.googleapis.com/v1/places/${placeId}`, `getPlacePhoto/details(${placeId})`, {
          headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'photos' },
        })
        const body = await detailsRes.text()
        if (!detailsRes.ok) {
          console.error('Google Places photo details error:', detailsRes.status, body.slice(0, 200))
          return null
        }
        let details
        try { details = body ? JSON.parse(body) : { photos: [] } } catch { return null }
        if (!details.photos?.length) return null
        const photo = details.photos[0]
        const attribution = photo.authorAttributions?.[0]?.displayName || null
        const mediaRes = await googleFetch(`https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=400`, `getPlacePhoto/media(${placeId})`, {
          headers: { 'X-Goog-Api-Key': apiKey },
        })
        if (!mediaRes.ok) return null
        const bytes = Buffer.from(await mediaRes.arrayBuffer())
        if (!bytes.length) return null
        const cached = await placePhotoCache.put(placeId, bytes, attribution)
        return { filePath: cached.filePath, attribution }
      }

      if (!isCoordLookup) {
        const googlePhoto = await fetchGooglePhoto()
        if (googlePhoto) return googlePhoto
      }
      const fallback = await fetchWikimediaFallback()
      if (fallback) return fallback
      placePhotoCache.markError(placeId)
      return null
    } finally {
      releasePhotoFetchSlot()
    }
  })()

  placePhotoCache.setInFlight(placeId, fetchPromise)
  const result = await fetchPromise
  if (!result) throw Object.assign(new Error('No photo available'), { status: 404 })
  return { photoUrl: `/api/maps/place-photo/${encodeURIComponent(placeId)}/bytes`, attribution: result.attribution }
}

// ── Resolve Google Maps URL ──────────────────────────────────────────────────
export async function resolveGoogleMapsUrl(url) {
  let resolvedUrl = url

  const extractCoords = (s) => {
    const at = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) }
    const data = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    if (data) return { lat: parseFloat(data[1]), lng: parseFloat(data[2]) }
    const q = s.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) }
    return null
  }

  const followRedirects = async (target, init) => {
    try {
      return await safeFetchFollow(target, { signal: AbortSignal.timeout(10000), ...init }, { bypassInternalIpAllowed: true })
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        throw Object.assign(new Error('URL blocked by SSRF check'), { status: 403 })
      }
      throw err
    }
  }

  const parsed = new URL(url)
  const GOOGLE_MAPS_HOSTS = ['goo.gl', 'maps.app.goo.gl', 'google.com', 'www.google.com', 'maps.google.com']
  const isShort = ['goo.gl', 'maps.app.goo.gl'].includes(parsed.hostname)
  const isGoogleMaps = GOOGLE_MAPS_HOSTS.includes(parsed.hostname)
  if (isShort || (isGoogleMaps && !extractCoords(url))) {
    resolvedUrl = (await followRedirects(url)).url || resolvedUrl
  }

  let coords = extractCoords(resolvedUrl)
  if (!coords) {
    try {
      const pageRes = await followRedirects(resolvedUrl, { headers: { 'User-Agent': 'TREK-Travel-Planner/1.0' } })
      coords = extractCoords(await pageRes.text())
    } catch (err) {
      if (err?.status === 403) throw err
    }
  }

  let placeName = null
  const placeMatch = resolvedUrl.match(/\/place\/([^/@]+)/)
  if (placeMatch) placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))

  if (!coords || isNaN(coords.lat) || isNaN(coords.lng)) {
    throw Object.assign(new Error('Could not extract coordinates from URL'), { status: 400 })
  }
  const { lat, lng } = coords

  const nominatimRes = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    { headers: { 'User-Agent': 'TREK-Travel-Planner/1.0' }, signal: AbortSignal.timeout(8000) },
  )
  const nominatim = await nominatimRes.json()
  const name = placeName || nominatim.name || nominatim.address?.tourism || nominatim.address?.building || null
  const address = nominatim.display_name || null
  return { lat, lng, name, address, google_ftid: googleFtidFromMapsUrl(resolvedUrl) }
}
