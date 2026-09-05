import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import dotenv from 'dotenv'

import csrf from 'csurf'
import RedisStore from 'connect-redis'
import session from 'express-session'
import { createClient } from 'redis'

dotenv.config()

// Redis-клиент (общий с gateway — админ-сессии живут там). Пароль беру из env.
let redisClient = createClient({
  password: process.env.REDIS_PASSWORD || undefined,
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
  },
})
redisClient.connect().then(() => console.log('[uploads] redis CONNECTED')).catch((e) => console.error('[uploads] redis CONNECT FAIL:', e.message))
redisClient.on('error', (e) => console.error('[uploads] redis ERR event:', e.message))

let redisStore = new RedisStore({
  client: redisClient,
})

/**
 * action(app) — подключает express-session (общий Redis, cookie 'sid') + CSRF.
 * SESSION_SECRET из env ОБЯЗАТЕЛЬНО должен совпадать с gateway (core/action.js),
 * чтобы uploads видел ту же admin-сессию (auth===true + тот же csrfSecret).
 * Секрет не зашит в коде — только в env (.env uploads), совпадает с gateway.
 */
const action = (app) => {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    console.error('[uploads] SESSION_SECRET не задан в .env (microservices/uploads/.env). Должен совпадать с gateway. Выход.')
    process.exit(1)
  }

  app.use(
    session({
      secret,
      name: 'sid',
      resave: false,
      saveUninitialized: true,
      cookie: {
        path: '/',
        httpOnly: false,
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days, синхронно с gateway
      },
      store: redisStore,
    }),
  )
  app.use(csrf())

  return app
}

export { action }
