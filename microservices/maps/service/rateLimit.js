// === === === === === === === === === === === ===
// rateLimit — простой rate-limiter на Redis (INCR + EXPIRE, атомарно).
// Для браузерных публичных эндпоинтов карты (geocode, pois): ограничивает
// частоту по IP, чтобы прямые скриптовые запросы не долбили сервер.
// Без внешних зависимостей (ioredis уже есть в maps).
// === === === === === === === === === === === ===
import ioRedis from 'ioredis'

let client = null
function getClient() {
  if (client) return client
  const c = new ioRedis({
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    host: process.env.REDIS_HOST || '127.0.0.1',
    family: process.env.REDIS_FAMILY ? parseInt(process.env.REDIS_FAMILY, 10) : 4,
    password: process.env.REDIS_PASSWORD || undefined,
    db: 0,
  })
  // Без обработчика error ioredis выбрасывает unhandled 'error' event → крашит
  // процесс Node. Ловим: сбой Redis для rate-limit — fail-open (не блокируем).
  c.on('error', function (err) {
    console.log('⚡ rateLimit::redis error', err && err.message)
  })
  client = c
  return client
}

// Проверка лимита. Атомарно: INCR ключа, если он новый — EXPIRE.
// Возвращает { ok, remaining, retryAfterMs }.
async function checkLimit(key, windowMs, max) {
  const c = getClient()
  try {
    // multi: INCR + (EXPIRE только если key ещё не существовал).
    // ioredis multi возвращает Promise<[err, result][]>; INCR -> число.
    const results = await c.multi().incr(key).pexpire(key, windowMs).exec()
    const count = Array.isArray(results) && results[0] ? Number(results[0][1]) : 1
    const remaining = Math.max(0, max - count)
    if (count > max) {
      return { ok: false, remaining: 0, retryAfterMs: windowMs }
    }
    return { ok: true, remaining, retryAfterMs: 0 }
  } catch (err) {
    console.log('⚡ rateLimit::redis', err && err.message)
    // при сбое Redis — пропускаем (fail-open), чтобы не ломать карту
    return { ok: true, remaining: -1, retryAfterMs: 0 }
  }
}

// GET / POST — в middleware вызывается перед обработчиком.
// opts: { windowMs, max, keyPrefix, message?, status? }
function rateLimitMiddleware(opts = {}) {
  const windowMs = opts.windowMs || 60 * 1000
  const max = opts.max || 60
  const keyPrefix = opts.keyPrefix || 'rl'
  const message = opts.message || 'too many requests'
  const status = opts.status || 429

  return async function rateLimitMw(req, res, next) {
    try {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip || req.connection?.remoteAddress || 'unknown'
      const key = `${keyPrefix}:${ip}:${req.path}`
      const result = await checkLimit(key, windowMs, max)
      if (!result.ok) {
        // Res-обёртка микромq не имеет res.set() — без Retry-After заголовка.
        return res.status(status).json({ error: message })
      }
      next()
    } catch (err) {
      console.log('⚡ rateLimitMw THREW', err && err.stack || err)
      next() // fail-open
    }
  }
}

export { rateLimitMiddleware }
