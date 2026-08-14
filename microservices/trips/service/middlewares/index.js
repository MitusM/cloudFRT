/** ***** ***** ***** ***** ***** ***** *****
 * *  middleware - setup route middlewares  *
 * Trips: все /trips/* защищены (req.session.auth)
 * API-ответ 401 JSON при отсутствии сессии.
 * ***** ***** ***** ***** ***** ***** ***** */
'use strict'

const middlewares = (app) => {
  app.all(['/trips(.*)'], async (req, res, next) => {
    if (!req.session.auth) {
      res.status(401).json({ error: 'unauthorized' })
    } else {
      next()
    }
  })

  return app
}

export { middlewares }
