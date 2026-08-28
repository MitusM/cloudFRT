import dotenv from 'dotenv'
dotenv.config()

const action = async (app) => {
  /** PostgresSQL */
  const client = app.options.bd
  app.action('geo:division:country', async (meta, res) => {
    try {
      let listCountry
      /** Получаем данные из Redis */
      const { status, response } = await res.app.ask('cache', {
        server: {
          action: 'cache:get',
          meta: {
            options: { db: 2 },
            list: 'country',
          },
        },
      })
      /**
       * Заносим данные полученные от Redis в переменную извлекая из объекта конечное значение
       
       * @returns {Boolean | Object} null - if no result or Object if the data is in redis
       */
      let country = response.value
      /** Договорённый маркер Missing-кэша: данных нет, но мы это запомнили */
      const EMPTY = '__EMPTY__'
      /** Если данные есть в Redis заносим в переменную и отдаём клиенту */
      if (country !== null) {
        listCountry = country === EMPTY ? [] : JSON.parse(country)
      } else {
        /** Если данных нет, то запрашиваем в БД */
        listCountry = await client.countryList()
        /** Missing-кэш: пустой результат кэшируем на короткий TTL, иначе на длинный */
        const isEmpty = Array.isArray(listCountry) && listCountry.length === 0
        await res.app.ask('cache', {
          server: {
            action: 'cache:set',
            meta: {
              options: { db: 2 },
              key: 'country',
              val: isEmpty ? EMPTY : JSON.stringify(listCountry),
              ttl: isEmpty ? 60 : 3600,
            },
          },
        })
      }

      res.json({
        country: listCountry,
      })
    } catch (err) {
      console.log('⚡ err::geo:division', err)
      res.json({ error: err.message })
    }
  })

  app.action('geo:division:list', async (meta, res) => {})

  return app
}

export { action }
