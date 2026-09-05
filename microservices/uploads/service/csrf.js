// === === === === === === === === === === === ===
// csrf.js — единый CSRF/auth-хелпер для upload-МС uploads
//
// uploads видит ТУ ЖЕ Redis-сессию админа, что и gateway (одинаковый
// SESSION_SECRET + RedisStore, cookie 'sid'). req.session.auth===true — признак
// залогиненного пользователя (как на gateway). req.session.csrfSecret —
// CSRF-токен, который gateway выдал при рендере admin-страницы и который
// клиент шлёт обратно на upload.
// === === === === === === === === === === === ===

/** Проверить CSRF-токен против сессионного. JSON: body.csrf; multipart: body.fields.csrf */
export function csrfOk(body, req) {
  if (!req || !req.session || !req.session.csrfSecret) return false
  if (!body || typeof body !== 'object') return false
  const token = body.fields ? body.fields.csrf : body.csrf
  return typeof token === 'string' && token === req.session.csrfSecret
}

/** Middleware: пропустить только при залогиненной сессии (auth===true), иначе 401. */
export async function authGuard(req, res, next) {
  if (req && req.session && req.session.auth === true) {
    return next()
  }
  const r = res
  return r.status ? r.status(401).json({ status: 401, message: 'Unauthorized' }) : r
}
