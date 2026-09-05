import 'dotenv/config'
import dotenv from 'dotenv'
import pkg from 'app-root-path'
const reqModule = pkg.require
const MicroMQ = reqModule('./core/micromq/src/MicroService.js')

import { error } from './service/errorServices.js'
import { action } from './core/action.js'
import { endpoint } from './controllers/index.js'

dotenv.config()

// === === === === === === === === === === === ===
// 0. Fail-fast: обязательные переменные окружения
// === === === === === === === === === === === ===
const REQUIRED_ENV = ['RABBIT_URL']
const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`\n❌ uploads: отсутствуют обязательные переменные окружения: ${missing.join(', ')}`)
  process.exit(1)
}

const rabbitUrl = process.env.RABBIT_URL || 'amqp://guest:***@localhost:5672/'
const timeout = process.env.TIMED_OUT || 5000
const PORT = Number(process.env.PORT || 7620)

// === === === === === === === === === === === ===
// 1. MicroService: и HTTP (listen :7620) и Rabbit (start) — полноправный на шине.
//    name 'uploads' → очередь uploads:requests; другие МС вызывают ask('uploads',...).
//    Файлы идут ТОЛЬКО по HTTP (multipart) + JSON путей, НЕ по шине.
// === === === === === === === === === === === ===
const app = new MicroMQ({
  microservices: process.env.MICROSERVICES_NAME ? process.env.MICROSERVICES_NAME.split(',') : ['auth', 'users', 'cache', 'render'],
  name: 'uploads',
  rabbit: {
    url: rabbitUrl,
  },
  requests: {
    timeout: timeout,
  },
})

// === === === === === === === === === === === ===
// 2. error — событие/обработчик ошибок
// === === === === === === === === === === === ===
error(app)

// === === === === === === === === === === === ===
// 3. session + CSRF (общий Redis, cookie 'sid'); SESSION_SECRET из .env —
//    должен совпадать с gateway core/action.js, чтобы видеть ту же admin-сессию.
// === === === === === === === === === === === ===
action(app)

// === === === === === === === === === === === ===
// 4. endpoints — HTTP-роуты (/upload, /delete-image) + RPC-действия (uploads:ping…)
// === === === === === === === === === === === ===
endpoint(app)

// === === === === === === === === === === === ===
// 5. Запуск: HTTP :7620 (nginx location /files/) + Rabbit-шина (start)
// === === === === === === === === === === === ===
app.listen(PORT)
app.start()

console.log(`[uploads] HTTP :${PORT} + Rabbit (name=uploads)`)
