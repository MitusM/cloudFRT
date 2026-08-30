// === === === === === === === === === === === ===
// csrf.js — единый CSRF-хелпер для МС article
//
// Раньше проверка `body.csrf === req.session.csrfSecret` дублировалась в каждом
// мутирующем роуте controllers/index.js. Вынесено сюда.
// Поддерживает оба формата:
//   - JSON:  body.csrf
//   - multipart (DELETE): body.fields.csrf
// === === === === === === === === === === === ===

/**
 * Проверить, что переданный CSRF-токен совпадает с сессионным.
 * @param {object} body  — req.body (JSON) или req.body с полем fields (multipart)
 * @param {object} req   — объект запроса (req.session.csrfSecret)
 * @returns {boolean}
 */
export function csrfOk(body, req) {
  if (!req || !req.session || !req.session.csrfSecret) return false
  if (!body || typeof body !== 'object') return false
  const token = body.fields ? body.fields.csrf : body.csrf
  return typeof token === 'string' && token === req.session.csrfSecret
}

/**
 * Middleware: пропустить только при валидном CSRF, иначе 403.
 * Использовать на мутирующих роутах (POST/PUT/DELETE).
 */
export function csrfGuard(req, res, next) {
  if (csrfOk(req.body, req)) {
    return next()
  }
  return res.status(403).end('Forbidden')
}
