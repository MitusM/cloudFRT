import path from 'path'
import pkg from 'app-root-path'
import dotenv from 'dotenv'
import { createRequire } from 'module'

import { Cache } from '../service/cacheServices.js'

const require = createRequire(import.meta.url)
const appRoot = pkg.path
dotenv.config()
/**  */
const lang = require('../lang/ru')
/** */
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/')

// const Redis = new Cache({ db: 2 })

const errorHandler = (res, message) => {
  // get: {"message":{}}
  return res.status(200).json({ message: message })
}

const endpoints = async (app) => {
  /**  */
  const db = await app.options.bd
  // const bd = await app.options.bd
  /**  */

  /**
   * Настройки - Settings
   */

  /*************************************
   *  * * * * * * POST * * * * * * *  *
   *************************************/
  app.post('/geo/regions', async (req, res) => {
    try {
      const body = req.body
      if (body.csrf === req.session.csrfSecret) {
        let id = body.id
        let listRegions
        /** Получаем данные из Redis */
        const { status, response } = await res.app.ask('cache', {
          server: {
            action: 'cache:get',
            meta: {
              options: { db: 2 },
              list: 'regions:' + id,
            },
          },
        })

        /**
       * Заносим данные полученные от Redis в переменную извлекая из объекта конечное значение
       
       * @returns {Boolean | Object} null - if no result or Object if the data is in redis
       */
        let country = response.value
        /** Если данные есть в Redis заносим в переменную и отдаём клиенту */
        if (country !== null) {
          listRegions = JSON.parse(country)
        } else {
          /** Если данных нет, то запрашиваем в БД и заносим в Redis */
          listRegions = await db.regions(id)

          //TODO: status, response не использованы в коде. Игнорить или использовать?
          const { status, response } = await res.app.ask('cache', {
            server: {
              action: 'cache:set',
              meta: {
                options: { db: 2 },
                key: 'regions:' + id,
                val: JSON.stringify(listRegions),
              },
            },
          })
        }

        res.status(200).json({ regions: listRegions })
      }
    } catch (err) {
      console.log('⚡ err::post-/geo/regions', err)
    }
  })

  app.post('/geo/cities', async (req, res) => {
    try {
      const body = req.body
      if (body.csrf === req.session.csrfSecret) {
        let id = body.id
        let listCities
        /** Получаем данные из Redis */
        const { status, response } = await res.app.ask('cache', {
          server: {
            action: 'cache:get',
            meta: {
              options: { db: 2 },
              list: 'cities:' + id,
            },
          },
        })

        /**
       * Заносим данные полученные от Redis в переменную извлекая из объекта конечное значение
       
       * @returns {Boolean | Object} null - if no result or Object if the data is in redis
       */
        let cities = response.value
        /** Если данные есть в Redis заносим в переменную и отдаём клиенту */
        if (cities !== null) {
          listCities = JSON.parse(cities)
        } else {
          /** Если данных нет, то запрашиваем в БД и заносим в Redis */
          listCities = await db.cities(id)

          //TODO: status, response не использованы в коде. Игнорить или использовать?
          const { status, response } = await res.app.ask('cache', {
            server: {
              action: 'cache:set',
              meta: {
                options: { db: 2 },
                key: 'cities:' + id,
                val: JSON.stringify(listCities),
              },
            },
          })
        }

        res.status(200).json({ regions: listCities })
      }
    } catch (err) {
      console.log('⚡ err::post-/geo/regions', err)
    }
  })

  /*************************************
   * * * * * * * * PUT * * * * * * * * *
   *************************************/

  /*************************************
   * * * * * * * DELETE * * * * * * * * *
   *************************************/

  return app
}

export { endpoints }
