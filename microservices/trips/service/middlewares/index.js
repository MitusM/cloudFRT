/** ***** ***** ***** ***** ***** ***** *****
 * *  middleware - setup route middlewares  *
 * Trips: все /trips/* защищены (req.session.auth)
 * API-ответ 401 JSON при отсутствии сессии.
 * ***** ***** ***** ***** ***** ***** ***** */
'use strict'

const middlewares = (app) => {
  app.all(['/trips(.*)'], async (req, res, next) => {
    //  Открытый маршрут (без авторизации): /trips/map/:id — карта поездки,
    //  временно открыт для просмотра (dev). Убрать исключение, когда вернём auth.
    if (req.path && req.path.startsWith('/trips/map/')) {
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
