// === === === === === === === === === === === ===
// cacheServices.js — Redis-кэш для МС destinations (ioredis, как country/article)
// === === === === === === === === === === === ===
import ioRedis from 'ioredis'

let defaultOptions = {
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  host: process.env.REDIS_HOST || '127.0.0.1',
  family: process.env.REDIS_FAMILY ? parseInt(process.env.REDIS_FAMILY, 10) : 4,
  password: process.env.REDIS_PASSWORD || undefined,
  db: 0,
}

let extend = function () {
  let merged = {}
  Array.prototype.forEach.call(arguments, function (obj) {
    for (let key in obj) {
      if (!obj.hasOwnProperty(key)) return
      merged[key] = obj[key]
    }
  })
  return merged
}

class Redis {
  constructor(options) {
    options = extend(defaultOptions, options)
    this.redis = new ioRedis(options)
  }

  get(key) {
    return this.redis.get(key)
  }

  set(key, value, ttlSec) {
    if (ttlSec) return this.redis.set(key, value, 'EX', ttlSec)
    return this.redis.set(key, value)
  }

  del(key) {
    return this.redis.del(key)
  }

  // удалить все ключи по паттерну, напр. 'destPage:*'
  async delPattern(pattern) {
    let stream = this.redis.scanStream({ match: pattern, count: 100 })
    return await new Promise((resolve) => {
      let keys = []
      stream.on('data', (resultKeys) => {
        keys = keys.concat(resultKeys)
      })
      stream.on('end', () => {
        if (keys.length === 0) return resolve()
        this.redis.del(keys)
        resolve()
      })
      stream.on('error', () => resolve())
    })
  }
}

export { Redis as Cache }
