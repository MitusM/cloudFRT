import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import dotenv from 'dotenv'

import csrf from 'csurf'

dotenv.config()
// const redis = require('redis')
// var session = require('express-session')
// const RedisStore = require('connect-redis')(session)
// const redisClient = redis.createClient()
// const RedisSess = new RedisStore({ client: redisClient })

import RedisStore from 'connect-redis'
import session from 'express-session'
import { createClient } from 'redis'

// Initialize client.
let redisClient = createClient({
  password: process.env.REDIS_PASSWORD || undefined,
})
redisClient.connect().then(() => console.log('[gateway] redis CONNECTED')).catch((e) => console.error('[gateway] redis CONNECT FAIL:', e.message))
redisClient.on('error', (e) => console.error('[gateway] redis ERR event:', e.message))

// Initialize store.
let redisStore = new RedisStore({
  client: redisClient,
})

// Секрет подписи cookie сессии. Общий для gateway и upload-МС (иначе uploads не увидит admin-сессию).
// Хранится ТОЛЬКО в .env (корень cloudFRT, dotenv.config() в index.js). В коде не зашит.
const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET) {
  console.error('[gateway] SESSION_SECRET не задан. Добавьте SESSION_SECRET=<значение> в корневой .env (dotenv) и перезапустите. Выход.')
  process.exit(1)
}

const action = (app) => {
  app.action('gateway:session', async (meta, res) => {
    try {
      redisStore.set(meta.sid, {
        ...meta.session,
        auth: meta.auth,
        user: meta.user,
      })
    } catch (err) {
      console.error('⚡ gateway:session ERR', err)
      return err
    }
  })

  app.action('gateway:session-destroy', async (meta, res) => {
    try {
      redisStore.destroy(meta.sid)
      const location = meta && meta.location ? meta.location : '/'
      res
        .writeHead(302, {
          location: location,
        })
        .end()
    } catch (err) {
      console.error('⚡ session-destroy ERR', err)
      return err
    }
  })

  app.use(
    session({
      secret: SESSION_SECRET,
      name: 'sid',
      resave: false, // не сохранять сеанс, если он не изменен
      saveUninitialized: true,
      cookie: {
        path: '/',
        httpOnly: false,
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 14, // expires in 14 days
      },
      store: redisStore,
    }),
  )
  // 3.2 CSRF
  app.use(csrf())

  return app
}

export { action }
