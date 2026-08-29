// === === === === === === === === === === === ===
// controllers/index.js — эндпоинты МС destinations
//
// SEO-структура: frt.su/destinations/<страна>/<регион>/<место>/...
//   GET /destinations          → корневой хаб (все направления верхнего уровня)
//   GET /destinations/(.*)     → разбор слэш-пути, рендер хаба/места (этап 2)
//   POST/PUT/DELETE /destinations/admin/* → админ-CRUD (этап 3)
//
// Этап 0 (каркас): базовые эндпоинты, чтобы МС стартовал и отдавал корневой
//   хаб как JSON. Полноценный HTML-рендер хабов + перелинковка — этапы 2-4.
// === === === === === === === === === === === ===
import { Model } from '../service/modelServices.js'

const errorHandler = (res, message, status = 404) => {
  return res.status(status).json({ message })
}

const endpoints = async (app) => {
  const db = await app.options.db

  /** ---------- (RU) Корневой хаб: все направления верхнего уровня ---------- */
  app.get('/destinations/', async (req, res) => {
    try {
      // корни дерева = места без родителя (из них наружу PART_OF = на предков)
      const roots = await db.queryAll(
        `SELECT @rid as rid, slug, title, h1, level, image, priority
         FROM Dest WHERE out('PART_OF').size() = 0 ORDER BY priority DESC`
      )
      return res.status(200).json({ destinations: roots })
    } catch (err) {
      console.log('⚡ err::destinations root', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  /** ---------- (RU) Разбор слэш-пути /destinations/<...>/... ---------- */
  app.get('/destinations/(.*)', async (req, res) => {
    try {
      // путь после /destinations/ (парсим из req.path — (.*)-группа path-to-regexp v6
      // не отдаёт named-параметр, поэтому режем префикс сами)
      const path = (req.path || '').replace(/^\/destinations\/?/, '').replace(/\/+$/, '')
      const slugs = path.split('/').filter(Boolean)

      if (!slugs.length) {
        // корень обрабатывается выше; сюда не должны попасть
        return errorHandler(res, 'Not found')
      }

      const dest = await db.getByPath(slugs)
      if (!dest) {
        return errorHandler(res, 'Not found')
      }

      // TODO (этап 2): собрать данные хаба (хлебные крошки, дети, перелинковка)
      // и отрендерить HTML через МС render. Пока отдаём JSON-каркас.
      return res.status(200).json({
        slug: dest.slug,
        title: dest.title,
        h1: dest.h1,
        level: dest.level,
        '@rid': dest['@rid'],
        // TODO: блоки перелинковки (этап 4)
      })
    } catch (err) {
      console.log('⚡ err::destinations path', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  /** --------- Admin-CRUD (этап 3, заготовка) --------- */
  app.post('/destinations/admin/create', async (req, res) => {
    try {
      const { slug, title, h1, level, description, content, lat, lng, image, is_hub, priority, parentRid } = req.body || {}
      if (!slug || !title) return errorHandler(res, 'slug и title обязательны', 400)
      const result = await db.createDest({
        slug, title, h1, level, description, content, lat, lng, image, is_hub, priority, parentRid,
      })
      return res.status(200).json(result)
    } catch (err) {
      console.log('⚡ err::destinations create', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  app.delete('/destinations/admin/delete-:rid(.*)', async (req, res) => {
    try {
      const rid = req.params.rid
      if (!rid) return errorHandler(res, 'rid обязателен', 400)
      const result = await db.deleteDest(rid)
      return res.status(200).json(result)
    } catch (err) {
      console.log('⚡ err::destinations delete', err)
      return errorHandler(res, 'Server error', 500)
    }
  })
}

export { endpoints }
