/** ===== ===== ===== ===== ===== ===== ===== =====
 * errorServices.js — Create an Error event and handler (uploads-МС)
 * ===== ===== ===== ===== ===== ===== ===== ===== */
const error = (app) => {
  app.on('error', (err, req, res) => {
    if (res && res.status) {
      res.status(err.status || 500)
      res.json({ error: err.message || 'Server error' })
    }
  })

  app.use(async (req, res, next) => {
    try {
      await next()
    } catch (err) {
      if (res && res.status && !res.headersSent) {
        res.status(err.status || 500)
        res.json({ error: err.message || 'Server error' })
      }
      app.emit('error', err, req, res)
    }
  })
  return app
}

export { error }
