// === === === === === === === === === === === ===
// Maps controllers — гео-эндпоинты (OSM/Nominatim/Overpass/Wikimedia)
// Портировано из TREK maps.controller.ts (7 эндпоинтов), пересажено на req.session.auth.
// Авторизация: middleware /maps(.*) уже проверяет req.session.auth (см. middlewares/index.js).
// === === === === === === === === === === === ===
import * as mapsService from '../service/mapsService.js'
import * as placePhotoCache from '../service/placePhotoCache.js'

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
        'GET /maps/pois',
        'POST /maps/autocomplete',
        'GET /maps/details/:placeId',
        'GET /maps/place-photo/:placeId',
        'GET /maps/place-photo/:placeId/bytes',
        'GET /maps/reverse',
        'POST /maps/resolve-url',
      ],
    })
  })

  return app
}

export { endpoints }
