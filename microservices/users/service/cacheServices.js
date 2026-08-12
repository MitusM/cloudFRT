// import { createClient } from 'redis'
import ioRedis from 'ioredis'
// const redis = new Redis()
let defaultOptions = {
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379, // Redis port
  host: process.env.REDIS_HOST || '127.0.0.1', // Redis host
  family: process.env.REDIS_FAMILY ? parseInt(process.env.REDIS_FAMILY, 10) : 4, // 4 (IPv4) or 6 (IPv6)
  password: process.env.REDIS_PASSWORD || undefined, // Redis password (if set)
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
    try {
      return this.redis.get(key, function (err, result) {
        if (err) {
          console.error(err)
          return err
        } else {
          return result
        }
      })
    } catch (err) {
      return err
    }
  }

  set(key, value) {
    return this.redis.set(key, value)
  }

  pipeline() {
    return this.redis.pipeline()
  }

  multi(key) {
    return this.redis.multi(key)
  }

  del(key) {
    return this.redis.del(key)
  }

  async delPattern(pattern) {
    try {
      var stream = this.redis.scanStream({
        match: pattern,
      })
      return new Promise((resolve, reject) => {
        stream.on('data', (keys) => {
          // `keys` is an array of strings representing key names
          if (keys.length) {
            var pipeline = this.redis.pipeline()
            keys.forEach(function (key) {
              let d = pipeline.del(key)
            })
            let exec = pipeline.exec().catch((err) => reject(err))
          }
        })

        stream.on('end', () => {
          // console.log('done')
          resolve(true)
        })
      })
    } catch (err) {
      return err
    }
  }
}

export { Redis as Cache }
