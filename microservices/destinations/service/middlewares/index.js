/** ***** ***** ***** ***** ***** ***** *****
 * *  middleware - setup route middlewares  *
 * destinations: SEO-страницы (GET /destinations/*) доступны БЕЗ авторизации —
 * чтобы их индексировали поисковики и открывались без логина.
 * Админ-CRUD (/destinations/admin/*) защищён (req.session.auth) — 401 JSON.
 * ***** ***** ***** ***** ***** ***** ***** */
'use strict'

// Публичные пути просмотра (SEO-страницы). ВАЖНО: /destinations/admin/* — защищён.
function isPublicPath(path) {
  if (!path) return false
  // корневой хаб и любые гео-страницы — публичные
  if (path === '/destinations' || path === '/destinations/') return true
  // любые вложенные гео-страницы — публичные, кроме /admin/
  return path.startsWith('/destinations/') && !path.startsWith('/destinations/admin/')
}

const middlewares = (app) => {
  app.all(['/destinations(.*)'], async (req, res, next) => {
    const path = req.path || (req.url || '').split('?')[0]
    if (isPublicPath(path)) {
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
