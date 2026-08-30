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
    // /destinations/admin/* при отсутствии сессии: отдать форму авторизации (как в users),
    // а не голый JSON {"error":"unauthorized"}
    if (!req.session.auth) {
      try {
        const redirect = await res.app.ask('auth', {
          server: {
            action: 'aut:redirect',
            meta: { csrf: req.session.csrfSecret },
          },
        })
        const html =
          (redirect && redirect.response && redirect.response.html) ||
          (redirect && redirect.html) ||
          (redirect && redirect.response) ||
          ''
        if (html) {
          // аутентификация подтверждена — пропускаем к защищённому ресурсу
          return res.status(200).end(html)
        }
        return res.status(401).json({ error: 'unauthorized' })
      } catch (err) {
        console.log('⚡ err::destinations middleware aut:redirect', err)
        return res.status(401).json({ error: 'unauthorized' })
      }
    }
    next()
  })

  return app
}

export { middlewares }
