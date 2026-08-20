// === === === === === === === === === === === ===
// Maps controllers — гео-эндпоинты (OSM/Nominatim/Overpass/Wikimedia)
// Портировано из TREK maps.controller.ts (7 эндпоинтов), пересажено на req.session.auth.
// Авторизация: middleware /maps(.*) уже проверяет req.session.auth (см. middlewares/index.js).
// === === === === === === === === === === === ===
import * as mapsService from '../service/mapsService.js'
import * as placePhotoCache from '../service/placePhotoCache.js'
import { renderMapHtml } from '../service/renderMapHtml.js'
import path from 'path'
import pkg from 'app-root-path'

const appRoot = pkg.path
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/')

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
  app.post('/maps/geocode', async (req, res) => {
    try {
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
  app.get('/maps/pois', async (req, res) => {
    try {
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
      const mapHtml = renderMapHtml({ containerId: 'poi-map', heightPx: 600 })
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

  // GET /maps/ — заглушка/заготовка. Позже здесь юзер будет работать с картой.
  // Пока возвращает метаданные МС и список доступных авторизованных эндпоинтов,
  // чтобы корень `/maps/` не висел (HTTP 000), а отдавал осмысленный ответ.
  app.get('/maps/', async (req, res) => {
    res.json({
      service: 'maps',
      name: 'maps',
      provider: 'openstreetmap',
      message: 'maps API — провайдер гео-данных (OSM). Здесь будет рабочая точка пользователя с картой.',
      endpoints: [
        'POST /maps/search',
        'POST /maps/geocode',
        'GET /maps/pois',
        'POST /maps/autocomplete',
        'GET /maps/details/:placeId',
        'GET /maps/place-photo/:placeId',
        'GET /maps/place-photo/:placeId/bytes',
        'GET /maps/reverse',
        'POST /maps/resolve-url',
        'GET /maps/map',
      ],
    })
  })

  return app
}

export { endpoints }
