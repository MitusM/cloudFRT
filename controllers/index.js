import dotenv from 'dotenv'

dotenv.config()

const endpoints = async (app) => {
  app.all('/:microservice/(.*)', async (req, res) => {
    try {
      await res.delegate(req.params.microservice)
    } catch (err) {
      //  МС не найден/недоступен — не роняем gateway (напр. статика /public/ в dev)
      if (String(err && err.message).startsWith('Microservice')) {
        return res.status(404).end('Not Found')
      }
      console.log('⚡ err::delegate', err)
      if (!res.headersSent) res.status(500).end('Internal Error')
    }
  })
  return app
}

export { endpoints }
