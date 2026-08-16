/** ***** ***** ***** ***** ***** ***** *****
 * *  middleware - setup route middlewares  *
 * Trips: все /trips/* защищены (req.session.auth)
 * Для неавторизованного отдаём HTML-форму логина (как users),
 * а не JSON 401 — чтобы /trips/map/... показывал страницу авторизации.
 * ***** ***** ***** ***** ***** ***** ***** */
'use strict'

const middlewares = (app) => {
  app.all(['/trips(.*)'], async (req, res, next) => {
    if (!req.session.auth) {
      // Запрос ждёт JSON (API) — вернём 401 JSON
      const accepts = (req.headers['accept'] || '').toLowerCase()
      if (accepts.includes('application/json') || accepts.includes('*/*')) {
        // */* тянет и браузер — но для страниц браузер шлёт text/html первым.
        if (!accepts.includes('text/html')) {
          return res.status(401).json({ error: 'unauthorized' })
        }
      }

      // HTML-страница (браузер) — отдаём форму логина как в users
      try {
        const redirect = await res.app.ask('auth', {
          server: {
            action: 'aut:redirect',
            meta: {
              csrf: req.session.csrfSecret,
            },
          },
        })
        return res.end(redirect.response)
      } catch (err) {
        console.log('⚡ err::trips:auth-redirect', err)
        return res.status(500).json({ error: 'internal error' })
      }
    } else {
      next()
    }
  })

  return app
}

export { middlewares }
