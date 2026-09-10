import Gateway from './core/micromq/gateway.js'
import dotenv from 'dotenv'
// import { createRequire } from 'module'

import { error } from './core/error.js'

import { middlewares } from './core/middlewares.js'

import { action } from './core/action.js'

import { endpoints } from './controllers/index.js'

// const require = createRequire(import.meta.url)

// === === === === === === === === === === === ===
// 0. Страховка от падения процесса на необработанном промис-реджекте.
//    Шина (amqplib) может отвалиться в любой момент — Gateway не должен
//    из-за этого умирать: ошибку логируем, процесс живёт дальше.
// === === === === === === === === === === === ===
process.on('unhandledRejection', (err) => {
  console.error('⚡ unhandledRejection:', (err && err.message) || err)
})

process.on('uncaughtException', (err) => {
  console.error('⚡ uncaughtException:', (err && err.message) || err)
})

dotenv.config()

const rabbitUrl = process.env.RABBIT_URL || 'amqp://guest:guest@localhost:5672/'
const timeout = process.env.TIMED_OUT || 5000

// === === === === === === === === === === === ===
// 1. Gateway connection
// === === === === === === === === === === === ===
const app = new Gateway({
  // TODO: remove .env перенести в array?
  microservices: process.env.MICROSERVICES_NAME.split(','),
  // microservices: ['auth', 'users', 'render', 'files', 'article', 'geo'],
  rabbit: {
    url: rabbitUrl,
  },
  requests: {
    timeout: timeout,
  },
})

// === === === === === === === === === === === ===
// 2. error - Create an Error event and handler
//    error - создаем событие error и обработчик
// === === === === === === === === === === === ===
error(app)

// === === === === === === === === === === === ===
// 3. actions
// === === === === === === === === === === === ===
action(app)

// === === === === === === === === === === === ===
// 4. middleware - setup route middlewares
// === === === === === === === === === === === ===
middlewares(app)

// === === === === === === === === === === === ===
// 5. Connecting and microservice endpoints
// === === === === === === === === === === === ===
endpoints(app)

// We listen to the port and accept requests
app.listen(process.env.PORT || 7606)
