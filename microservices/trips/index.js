import 'dotenv/config'
import dotenv from 'dotenv'
import pkg from 'app-root-path'
const reqModule = pkg.require
const MicroMQ = reqModule('./core/micromq/src/MicroService.js')

import { error } from './service/errorServices.js'

import { middlewares } from './service/middlewares/index.js'

import { action } from './action/index.js'

import { endpoints } from './controllers/index.js'

import { Model } from './service/modelServices.js'

dotenv.config()

// === === === === === === === === === === === ===
// 0. Fail-fast: обязательные переменные окружения
//    Без .env сервис не стартует — показываем понятную ошибку
//    вместо TypeError посреди импорта.
// === === === === === === === === === === === ===
const REQUIRED_ENV = [
  'RABBIT_URL',
  'ORIENTDB_NAME',
  'ORIENTDB_USERNAME',
  'ORIENTDB_PASSWORD',
  'VIEW_DIR',
]
const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length) {
  console.error(
    `\n❌ trips: отсутствуют обязательные переменные окружения: ${missing.join(', ')}`
  )
  console.error(
    '   Скопируй .env.example в .env и заполни значениями, затем запусти заново.\n'
  )
  process.exit(1)
}

const rabbitUrl = process.env.RABBIT_URL || 'amqp://guest:guest@localhost:5672/'
const timeout = process.env.TIMED_OUT || 5000
// === === === === === === === === === === === ===
// 1. Create an instance of a MicroService class
// === === === === === === === === === === === ===
const app = new MicroMQ({
  microservices: ['render', 'files', 'auth', 'users', 'cache', 'maps'],
  name: 'trips',
  rabbit: {
    url: rabbitUrl,
  },
  requests: {
    timeout: timeout,
  },
  db: await new Model().connect({
    name: process.env.ORIENTDB_NAME,
    username: process.env.ORIENTDB_USERNAME,
    password: process.env.ORIENTDB_PASSWORD,
  }),
})

// === === === === === === === === === === === ===
// 2. error - Create an Error event and handler
// === === === === === === === === === === === ===
error(app)

// === === === === === === === === === === === ===
// 3. middleware - setup route middlewares
// === === === === === === === === === === === ===
middlewares(app)

// === === === === === === === === === === === ===
// 4. actions
// === === === === === === === === === === === ===
action(app)

// === === === === === === === === === === === ===
// 5.URL (interfaces)
// === === === === === === === === === === === ===
endpoints(app)
// === === === === === === === === === === === ===
// 6. Run Microservice
// === === === === === === === === === === === ===
app.start()
// app.listen(7888)
