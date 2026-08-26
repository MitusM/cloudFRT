/** ***** ***** ***** ***** ***** ***** *****
 * *  middleware - setup route middlewares  *
 * Maps: публичные роуты (GET /maps/map, POST /maps/geocode) доступны БЕЗ
 * авторизации — чтобы карту можно было смотреть и искать места без логина.
 * Остальные /maps/* защищены (req.session.auth); API-ответ 401 JSON.
 * ***** ***** ***** ***** ***** ***** ***** */
'use strict'

// публичные пути — их не режем по session.auth
// ВАЖНО: /maps/og НЕ публичный — HTTP-вариант рендера OG доступен только
// авторизованным (а фактически ходит через RPC maps:og по шине, HTTP-роут
// удалён). Серверный рендер (headless Chromium, ~6-28с) — тупящая мишень для
// DoS, поэтому наружу не открыт.
const PUBLIC_PATHS = [
  '/maps/',
  '/maps/map',
  '/maps/geocode',
  '/maps/pois',
]

const middlewares = (app) => {
  app.all(['/maps(.*)'], async (req, res, next) => {
    // публичные эндпоинты (точное совпадение пути или путь + query) — пропускаем
    const path = req.path || (req.url || '').split('?')[0]
    const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
    if (isPublic) {
      return next()
    }
    if (!req.session.auth) {
      res.status(401).json({ error: 'unauthorized' })
    } else {
      next()
    }
  })

  return app
}

export { middlewares }
