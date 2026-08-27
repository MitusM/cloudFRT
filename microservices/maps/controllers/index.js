// === === === === === === === === === === === ===
// Maps controllers — гео-эндпоинты (OSM/Nominatim/Overpass/Wikimedia)
// Портировано из TREK maps.controller.ts (7 эндпоинтов), пересажено на req.session.auth.
// Авторизация: middleware /maps(.*) уже проверяет req.session.auth (см. middlewares/index.js).
// === === === === === === === === === === === ===
import * as mapsService from '../service/mapsService.js'
import * as placePhotoCache from '../service/placePhotoCache.js'
import { renderMapHtml } from '../service/renderMapHtml.js'
import { rateLimitMiddleware } from '../service/rateLimit.js'
import { signToken, verifyToken, getSecret } from '../service/geoToken.js'
import path from 'path'
import fs from 'fs'
import pkg from 'app-root-path'

const appRoot = pkg.path
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/')

// Публичные браузерные эндпоинты карты (geocode/pois) доступны всем, поэтому
// (а) дёргать их напрямую может любой. Чтобы отсечь часть нелегитимного
// трафика (скрипты, чужие сайты), комбинируем:
//   1) rate-limit по IP (Redis INCR)
//   2) проверка источника Referer/Origin — только наши домены
// CSRF для этих эндпоинтов не применяем: геокодер с публичной карты не шлёт
// токен, а у анонима он и так есть — проверка сломала бы поиск без реальной
// защиты. Это НЕ пуленепробиваемая защита (Referer/Origin подделываются),
// но режет случайные и скриптовые обращения.
//
// Лимиты и разрешённые домены вынесены в .env (см. ниже). Дефолты на случай
// отсутствия env-переменных: окно 60с, geocode 30/мин, pois 60/мин.
const RL_WINDOW_MS = process.env.RL_WINDOW_MS ? parseInt(process.env.RL_WINDOW_MS, 10) : 60000
const RL_GEOCODE_MAX = process.env.RL_GEOCODE_MAX ? parseInt(process.env.RL_GEOCODE_MAX, 10) : 30
const RL_POIS_MAX = process.env.RL_POIS_MAX ? parseInt(process.env.RL_POIS_MAX, 10) : 60
// Список доменов из env (через запятую). Поддомены разрешаются автоматически.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'dev.frt.su,cloud.frt.su,localhost,127.0.0.1')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean)
const ALLOWED_SCHEMES = ['http:', 'https:']

// Разрешить, если Origin/Referer отсутствует (внутренний RPC/curl с нашего хоста)
// или указывает на наш домен. Прямые сторонние запросы с чужим Origin бьём.
function looksInternal(req) {
  const origin = req.headers.origin
  const referer = req.headers.referer
  const src = origin || referer
  if (!src) return true // нет Origin/Referer — считаем внутренним (curl с хоста, RPC)
  try {
    const u = new URL(src)
    if (!ALLOWED_SCHEMES.includes(u.protocol)) return false
    const host = (u.hostname || '').toLowerCase()
    return ALLOWED_ORIGINS.some((d) => host === d || host.endsWith('.' + d))
  } catch (e) {
    return false
  }
}

// Docker/микросервисная шина: RPC maps:og и сервис-2-сервис не ходят сюда,
// но для безопасности внешних публичных браузерных эндпоинтов проверяем источник.
function assertInternal(req, res) {
  if (looksInternal(req)) return true
  res.status(403).json({ error: 'forbidden' })
  return false
}

// CSRF-проверка НЕ применяется к публичным эндпоинтам карты: геокодер не
// шлёт токен, а у анонима он и так есть — проверка сломала бы поиск без
// реальной защиты. Rate-limit + Origin если нужно. Для авторизованных
// мутирующих роутов maps CSRF добавлять отдельно (как в users/trips).

// Лимиты для публичных эндпоинтов (защита от скриптового долбления).
// geocode — поиск (дорогой Nominatim/Overpass), pois — лёгкий, но по bbox.
const RL_GEOCODE = rateLimitMiddleware({ keyPrefix: 'rl:geocode', windowMs: RL_WINDOW_MS, max: RL_GEOCODE_MAX })
const RL_POIS = rateLimitMiddleware({ keyPrefix: 'rl:pois', windowMs: RL_WINDOW_MS, max: RL_POIS_MAX })

// ---- Токен для публичных гео-эндпоинтов (HMAC+TTL, сессия+IP) ----
// Секрет подписи (MAPS_TOKEN_SECRET или фолбэк ENCRYPTION_KEY). Если секрета
// нет — публичные гео-эндпоинты работают БЕЗ токена (fail-open), но на проде
// MAPS_TOKEN_SECRET должен быть задан (см. .env.example). TTL по умолчанию 5 мин.
const GEO_TOKEN_TTL_MS = process.env.MAPS_TOKEN_TTL_MS ? parseInt(process.env.MAPS_TOKEN_TTL_MS, 10) : 5 * 60 * 1000

// IP из заголовка (за nginx) или сокета — тот же источник, что и в rate-limit,
// чтобы привязка токена к IP не расходилась с реальным IP запроса.
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip || req.connection?.remoteAddress || 'unknown'
}
// Session id: session.auth и sessionID есть у каждого (даже анонима) —
// express-session с saveUninitialized:true создаёт сессию всем.
function sessionIdOf(req) {
  return (req.session && (req.session.id || req.sessionID)) || 'anon'
}
// Выдать токен для встраивания в страницу.
function issueGeoToken(req) {
  const secret = getSecret()
  if (!secret) return ''
  return signToken({ sessionId: sessionIdOf(req), ip: clientIp(req), secret, ttlMs: GEO_TOKEN_TTL_MS })
}
// Middleware проверки токена для публичных гео-эндпоинтов. Идёт ПОСЛЕ
// assertInternal (источник) и rate-limit. Без валидного токена — 403.
function requireGeoToken(req, res, next) {
  const secret = getSecret()
  // Нет секрета → не защищаем (fail-open), но логируем разово на старте
  if (!secret) return next()
  const token = req.headers['x-maps-token'] || ''
  if (verifyToken(token, { sessionId: sessionIdOf(req), ip: clientIp(req), secret })) {
    return next()
  }
  res.status(403).json({ error: 'forbidden: invalid or expired token' })
}

const endpoints = async (app) => {
  // POST /maps/search — поиск мест (OSM Nominatim / Google)
  app.post('/maps/search', async (req, res) => {
    try {
      const { query, lang, locationBias } = req.body || {}
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query required' })
      }
      const result = await mapsService.searchPlaces(query, lang, locationBias)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:search', err)
      res.status(err.status || 500).json({ error: err.message || 'search failed' })
    }
  })

  // POST /maps/geocode — поиск мест для геокодера (maplibre-gl-geocoder).
  // Сначала наши SearchPlace (OrientDB), фолбэк — Nominatim; найденное
  // сохраняем в SearchPlace (наполнение БД своими POI). Возвращает GeoJSON
  // FeatureCollection { type, features:[{type,geometry:{Point,[lng,lat]},properties}] }
  app.post('/maps/geocode', RL_GEOCODE, requireGeoToken, async (req, res) => {
    try {
      // источник (Referer/Origin). CSRF не применяем — геокодер с публичной
      // карты не шлёт токен, а у анонима он и так есть; rate-limit + Origin
      // режут скриптовый и с чужих сайтов трафик.
      if (!assertInternal(req, res)) return
      const { query, lang } = req.body || {}
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ type: 'FeatureCollection', features: [] })
      }
      const db = await app.options.db
      const result = await mapsService.searchSearchPlace(db, query, lang)
      const features = (result.places || [])
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(p.lng), Number(p.lat)] },
          properties: {
            id: p.id,
            name: p.name || '',
            place_name: p.name || p.address || '',
            text: p.name || '',
            place_formatted: p.address || '',
            address: p.address || '',
            osm_id: p.osm_id,
            google_place_id: p.google_place_id,
            url: p.url,
            source: p.source,
            center: [Number(p.lng), Number(p.lat)],
          },
        }))
      res.json({ type: 'FeatureCollection', features, source: result.source })
    } catch (err) {
      console.log('⚡ err::maps:geocode', err)
      res.status(err.status || 500).json({ error: err.message || 'geocode failed' })
    }
  })

  // GET /maps/pois — POI по категории в bbox
  app.get('/maps/pois', RL_POIS, requireGeoToken, async (req, res) => {
    try {
      // GET — не мутирует, CSRF не нужен; проверяем только источник.
      if (!assertInternal(req, res)) return
      const { category, south, west, north, east, limit } = req.query
      if (!category) return res.status(400).json({ error: 'category required' })
      const bbox = {
        south: parseFloat(south),
        west: parseFloat(west),
        north: parseFloat(north),
        east: parseFloat(east),
      }
      if ([bbox.south, bbox.west, bbox.north, bbox.east].some(Number.isNaN)) {
        return res.status(400).json({ error: 'bbox (south,west,north,east) required' })
      }
      const result = await mapsService.searchOverpassPois(category, bbox, limit ? parseInt(limit) : 60)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:pois', err)
      res.status(err.status || 500).json({ error: err.message || 'pois failed' })
    }
  })

  // POST /maps/autocomplete — подсказки (OSM Nominatim / Google)
  app.post('/maps/autocomplete', async (req, res) => {
    try {
      const { input, lang, locationBias } = req.body || {}
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: 'input required' })
      }
      const result = await mapsService.autocompletePlaces(input, lang, locationBias)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:autocomplete', err)
      res.status(err.status || 500).json({ error: err.message || 'autocomplete failed' })
    }
  })

  // GET /maps/details/:placeId — детали места (OSM / Google)
  app.get('/maps/details/:placeId', async (req, res) => {
    try {
      const { placeId } = req.params
      const lang = req.query.lang
      const result = await mapsService.getPlaceDetails(placeId, lang)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:details', err)
      res.status(err.status || 500).json({ error: err.message || 'details failed' })
    }
  })

  // GET /maps/place-photo/:placeId — фото места (Wikimedia/Google, кэш)
  // Вызывается ДО /bytes: если фото нет в кэше — триггерит загрузку (getPlacePhoto),
  // возвращает proxy URL на /bytes; сам байтовый эндпоинт — ниже.
  app.get('/maps/place-photo/:placeId', async (req, res) => {
    try {
      const { placeId } = req.params
      const lat = parseFloat(req.query.lat)
      const lng = parseFloat(req.query.lng)
      const name = req.query.name
      const result = await mapsService.getPlacePhoto(placeId, lat, lng, name)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:place-photo', err)
      res.status(err.status || 500).json({ error: err.message || 'photo failed' })
    }
  })

  // GET /maps/place-photo/:placeId/bytes — отдача байтов фото из кэша
  app.get('/maps/place-photo/:placeId/bytes', async (req, res) => {
    try {
      const { placeId } = req.params
      const served = placePhotoCache.serveFilePath(placeId)
      if (!served) return res.status(404).json({ error: 'no photo' })
      return res.sendFile(served)
    } catch (err) {
      console.log('⚡ err::maps:place-photo-bytes', err)
      res.status(err.status || 500).json({ error: err.message || 'photo failed' })
    }
  })

  // GET /maps/reverse — reverse geocoding (OSM Nominatim)
  app.get('/maps/reverse', async (req, res) => {
    try {
      const { lat, lng, lang } = req.query
      if (lat == null || lng == null) return res.status(400).json({ error: 'lat,lng required' })
      const result = await mapsService.reverseGeocode(String(lat), String(lng), lang)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:reverse', err)
      res.status(err.status || 500).json({ error: err.message || 'reverse failed' })
    }
  })

  // POST /maps/resolve-url — resolve Google Maps URL → координаты
  app.post('/maps/resolve-url', async (req, res) => {
    try {
      const { url } = req.body || {}
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' })
      const result = await mapsService.resolveGoogleMapsUrl(url)
      res.json(result)
    } catch (err) {
      console.log('⚡ err::maps:resolve-url', err)
      res.status(err.status || 500).json({ error: err.message || 'resolve failed' })
    }
  })

  // GET /maps/map — HTML-страница интерактивной карты гео-объектов (POI).
  // Шаг 3: общий рендер карты (MapLibre + MapsRender) генерится напрямую
  // через renderMapHtml (без self-RPC maps→maps, чтобы не ловить дедлок
  // шины); страница грузит POI через /maps/pois по bbox и рисует их
  // через MapsRender.setPoints.
  app.get('/maps/map', async (req, res) => {
    try {
      const mapHtml = renderMapHtml({ containerId: 'poi-map', heightPx: 900, token: issueGeoToken(req) })
      const renderResp = await res.app.ask('render', {
        server: {
          action: 'html',
          meta: {
            dir: templateDir,
            page: process.env.TEMPLATE_FILE,
            data: {
              csrf: req.session.csrfSecret,
              title: 'Карта гео-объектов | Maps',
              lang: 'ru',
              breadcrumb: 'map',
              page: './page/map.html',
              mapHtml: mapHtml,
              // Горно-Алтайск (Горный Алтай). Порядок MapLibre: [lng, lat].
              // Раньше тут был [lat, lng] перепутанный (55.75, 37.61) — из-за этого
              // карта открывалась в Туркменистане. lng=85.9789, lat=51.9299.
              center: [85.9789, 51.9299],
              zoom: 12,
            },
          },
        },
      })
      const { response } = renderResp
      res.status(200).end(response.html)
    } catch (err) {
      console.log('⚡ err::maps:map-page', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  // GET /maps/ — полноценная HTML-страница интерактивной карты, где юзер работает
  // (рисует гео-объекты, добавляет точки/маркеры/текст, экспортирует GeoJSON).
  // Использует собственный шаблон view/index.html (самодостаточная страница, без
  // общего layout от render МС). В него подставляется renderMapHtml() — та же карта
  // с инструментами рисования, что и на /maps/map.
  // Доступен всем (см. PUBLIC_PATHS в service/middlewares/index.js).
  app.get('/maps/', async (req, res) => {
    try {
      const mapHtml = renderMapHtml({
        containerId: 'poi-map',
        heightPx: 640,
        center: [85.9789, 51.9299], // Горно-Алтайск (Горный Алтай), порядок [lng, lat]
        zoom: 12,
        token: issueGeoToken(req),
      })
      const file = await fs.promises.readFile(path.join(appRoot, process.env.VIEW_DIR, '..', 'index.html'), 'utf8')
      const html = file
        .replace('{{ title }}', 'Интерактивная карта | Maps')
        .replace('{{ mapHtml | safe }}', mapHtml)
      res.status(200).end(html)
    } catch (err) {
      console.log('⚡ err::maps:/ (корень)', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  return app
}

export { endpoints }
