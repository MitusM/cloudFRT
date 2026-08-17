import 'dotenv/config'
import dotenv from 'dotenv'
import pkg from 'app-root-path'
const reqModule = pkg.require
const MicroMQ = reqModule('./core/micromq/src/MicroService.js')

import { error } from './service/errorServices.js'

import { middlewares } from './service/middlewares/index.js'

import { action } from './action/index.js'

import { endpoints } from './controllers/index.js'
/** MySQL */
// import { GeoModel } from './service/modelServices.js'
/** PostgresSQL */
import { Model } from './service/model.js'

dotenv.config()

// === === === === === === === === === === === ===
// 0. Fail-fast: обязательные переменные окружения
// === === === === === === === === === === === ===
const REQUIRED_ENV = ['RABBIT_URL', 'VIEW_DIR']
const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length) {
  console.error(
    `\n❌ geo: отсутствуют обязательные переменные окружения: ${missing.join(', ')}`
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
  microservices: ['render', 'files', 'auth', 'article', 'users', 'cache'],
  name: 'geo',
  rabbit: {
    url: rabbitUrl,
  },
  requests: {
    timeout: timeout,
  },
  // db: await new GeoModel().connect({
  //   database: process.env.MYSQL_DATABASE,
  //   user: process.env.MYSQL_USER,
  //   password: process.env.MYSQL_PASSWORD,
  // }),
  bd: await new Model().connect({
    dialect: process.env.DIALECT,
    host: process.env.HOST,
    database: process.env.DATABASE,
    user: process.env.USER,
    password: process.env.PASSWORD,
    port: process.env.PORT,
    pool: process.env.POOL,
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
