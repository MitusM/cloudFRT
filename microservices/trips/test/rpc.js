// === === === === === === === === === === === ===
// Хелпер e2e для trips через шину micromq (RabbitMQ).
//
// ВАЖНАЯ МЕТОДИКА (проверено 15.08.2026):
// Формат RPC-сообщения, который ждёт MicroService (см. src/MicroService.js,
// строка ~121): JSON-тело вида
//   { requestId, queue, server: { action, meta } }
// где:
//   - requestId — строка, коррелирует запрос/ответ;
//   - queue     — имя ОТВЕТНОЙ очереди, ПЕРЕДАЁТСЯ В ТЕЛЕ JSON (не в properties
//                 replyTo!). trips отвечает в эту очередь;
//   - server    — { action, meta }; isRpcAction требует message.server.action.
// Если поле `queue` не передать в теле — trips обработает запрос (создаст
// данные!), но ответ уйдёт в undefined-очередь и клиент увидит таймаут.
// === === === === === === === === === === === ===
import amqp from 'amqplib'
import { readFileSync } from 'fs'
import { nanoid } from 'nanoid'

// читаем RABBIT_URL из .env cloudFRT (и из .env trips на всякий случай)
function loadEnv(file) {
  try {
    const env = {}
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
    return env
  } catch (e) { return {} }
}

const env = {
  ...loadEnv(new URL('../../.env', import.meta.url).pathname),
  ...loadEnv(new URL('../.env', import.meta.url).pathname),
}
const RABBIT_URL = env.RABBIT_URL || 'amqp://localhost'

let conn = null
let ch = null

async function getChannel() {
  if (!ch) {
    conn = await amqp.connect(RABBIT_URL)
    ch = await conn.createChannel()
  }
  return ch
}

/**
 * Вызвать шинный RPC у микросервиса.
 * @param {string} msName   имя МС (например 'trips')
 * @param {string} action   имя action (например 'trips:place-add')
 * @param {object} meta     метаданные RPC
 * @param {number} timeoutMs таймаут ожидания ответа
 * @returns {Promise<object>} распарсенный ответ {statusCode, response, headers}
 */
export async function rpc(msName, action, meta, timeoutMs = 8000) {
  const channel = await getChannel()
  const appId = 'trips-e2e-' + process.pid
  const reqQ = msName + ':requests'
  // УНИКАЛЬНАЯ очередь ответа на каждый вызов — иначе при параллельных тестах
  // ответы конкурентных запросов коллизируют в общей очереди (гонка exclusive).
  const resQ = msName + ':responses-' + appId + '-' + nanoid(6)
  await channel.assertQueue(resQ, { exclusive: true, autoDelete: true })

  const requestId = nanoid()
  const payload = JSON.stringify({
    requestId,
    queue: resQ, // ← ОБЯЗАТЕЛЬНО в теле JSON (см. методику выше)
    server: { action, meta },
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { channel.deleteQueue(resQ) } catch {}
      reject(new Error(`RPC ${msName}:${action} таймаут (${timeoutMs}мс)`))
    }, timeoutMs)

    channel.consume(
      resQ,
      (msg) => {
        if (!msg) return
        clearTimeout(timer)
        let json
        try {
          json = JSON.parse(msg.content.toString())
        } catch (err) {
          return reject(new Error('Не удалось распарсить ответ: ' + msg.content.toString()))
        }
        resolve(json)
      },
      { noAck: true },
    )

    channel.sendToQueue(reqQ, Buffer.from(payload))
  })
}

export async function close() {
  try { if (conn) await conn.close() } catch {}
  conn = null
  ch = null
}
