const action = async (app) => {
  const client = app.options.redis
  app.action('cache:get', async (meta, res) => {
    try {
      let options = meta.options
      let getRedis = await new client(options).get(meta.list)

      res.json({
        value: getRedis,
      })
    } catch (err) {
      console.log('⚡ err::cache:get', err)
      res.json({ value: null, error: err.message })
    }
  })

  app.action('cache:set', async (meta, res) => {
    try {
      let options = meta.options
      // ttl опционален: если задан (сек) — ключ истекает (Missing/TTL-кэш),
      // иначе — бессрочно, как раньше
      let ttl = meta.ttl
      let setRedis = await new client(options).set(meta.key, meta.val, ttl)

      res.json({
        value: setRedis,
      })
    } catch (err) {
      console.log('⚡ err::cache:set', err)
      res.json({ value: null, error: err.message })
    }
  })

  app.action('cache:ttl', async (meta, res) => {
    try {
      let options = meta.options
      let ttl = await new client(options).ttl(meta.list)
      res.json({ value: ttl })
    } catch (err) {
      console.log('⚡ err::cache:ttl', err)
      res.json({ value: null, error: err.message })
    }
  })

  app.action('cache:multi', async (meta, res) => {
    try {
      let options = meta.options
      let list = meta.list
      let multi = await new client(options).multi(list).exec()

      res.json({ ...multi })
    } catch (err) {
      console.log('⚡ err::cache:multi', err)
      res.json({ error: err.message })
    }
  })

  app.action('cache:del', async (meta, res) => {
    try {
      let options = meta.options
      let pattern = meta.pattern
      let del = await new client(options).delPattern(pattern)
      console.log('⚡ del::', del)
      res.end(del)
    } catch (err) {
      console.log('⚡ err::cache:del', err)
      res.json({ value: false, error: err.message })
    }
  })

  return app
}

export { action }
