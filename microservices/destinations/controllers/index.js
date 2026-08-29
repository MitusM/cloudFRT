// === === === === === === === === === === === ===
// controllers/index.js — эндпоинты МС destinations
//
// SEO-структура: frt.su/destinations/<страна>/<регион>/<место>/...
//   GET /destinations          → корневой хаб (все направления верхнего уровня)
//   GET /destinations/(.*)     → разбор слэш-пути, рендер хаба/места (HTML)
//   POST/PUT/DELETE /destinations/admin/* → админ-CRUD (этап 3)
//
// Рендер через МС render (Nunjucks, action 'html').
// Этап 2: публичные SEO-страницы (хабы + хлебные крошки + BreadcrumbList schema).
// === === === === === === === === === === === ===
import path from 'path'
import pkg from 'app-root-path'
import dotenv from 'dotenv'
import { Model } from '../service/modelServices.js'

const appRoot = pkg.path
dotenv.config()
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/')
const APP_URL = process.env.APP_URL || 'https://cloud.frt.su'

const errorHandler = (res, message, status = 404) => {
  return res.status(status).json({ message })
}

// ---- Хлебные крошки: parentsChain возвращает [текущий, ...предки] (TRAVERSE out) ----
// Направление PART_OF: ребёнок -> родитель, поэтому TRAVERSE out() идёт от текущего к корню.
// Нормализуем в порядок [корень ... текущий] для отображения.
function buildBreadcrumb(chain, currentSlug) {
  // chain: [текущий, родитель, ..., корень] → развернуть в [корень, ..., текущий]
  const reversed = [...chain].reverse()
  const crumbs = []
  let acc = ''
  for (let i = 0; i < reversed.length; i++) {
    const node = reversed[i]
    if (!node || !node.slug) continue
    acc = acc ? `${acc}/${node.slug}` : node.slug
    const isCurrent = node.slug === currentSlug
    crumbs.push({
      name: node.title || node.slug,
      url: `/destinations/${acc}`,
      current: isCurrent,
    })
  }
  // корневой хаб всегда первым
  crumbs.unshift({ name: 'Куда поехать', url: '/destinations/', current: false })
  return crumbs
}

// ---- BreadcrumbList schema (JSON-LD) ----
function breadcrumbSchema(breadcrumb) {
  const items = breadcrumb.map((b, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: b.name,
    item: `${APP_URL}${b.url}`,
  }))
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  })}</script>`
}

const endpoints = async (app) => {
  const db = await app.options.db

  /** ---------- (RU) Корневой хаб: все направления верхнего уровня ---------- */
  app.get('/destinations/', async (req, res) => {
    try {
      // корни дерева = места без родителя (out('PART_OF').size() = 0)
      const roots = await db.queryAll(
        `SELECT @rid as rid, slug, title, h1, level, image, priority
         FROM Dest WHERE out('PART_OF').size() = 0 ORDER BY priority DESC`
      )

      const countries = roots.map((r) => ({
        slug: r.slug,
        title: r.title,
        h1: r.h1,
        level: r.level,
        url: `/destinations/${r.slug}`,
      }))

      const crumbs = [{ name: 'Куда поехать', url: '/destinations/', current: true }]
      const entry = countries[0] || {}
      const data = {
        title: 'Куда поехать — направления',
        h1: 'Куда поехать',
        description: 'Каталог направлений путешествий: страны, регионы, места и достопримечательности.',
        page: './page/root.html',
        breadcrumb: crumbs,
        breadcrumb_schema: breadcrumbSchema(crumbs),
        countries,
        current_year: new Date().getFullYear(),
      }

      const { response } = await res.app.ask('render', {
        server: {
          action: 'html',
          meta: { dir: templateDir, page: 'index.html', data },
        },
      })
      res.status(200).end(response.html)
    } catch (err) {
      console.log('⚡ err::destinations root', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  /** ---------- (RU) Разбор слэш-пути /destinations/<...>/... ---------- */
  app.get('/destinations/(.*)', async (req, res) => {
    try {
      // путь после /destinations/ (парсим из req.path — (.*)-группа path-to-regexp v6
      // не отдаёт named-параметр в этом стеке, режем префикс сами)
      const fullPath = (req.path || '').replace(/^\/+/, '').split('/').filter(Boolean)
      // первый сегмент = 'destinations', остальное — дерево
      const slugs = fullPath.slice(1)

      if (!slugs.length) {
        return errorHandler(res, 'Not found')
      }

      const dest = await db.getByPath(slugs)
      if (!dest) {
        return errorHandler(res, 'Not found')
      }

      // хлебные крошки: цепочка предков + текущий
      const chain = await db.parentsChain(dest['@rid'])
      const breadcrumb = buildBreadcrumb(chain, dest.slug)

      // дети (для хабов: подместа/достопримечательности)
      const kids = await db.listChildren(dest['@rid'])
      const children = kids.map((k) => ({
        slug: k.slug,
        title: k.title,
        level: k.level,
        url: `/destinations/${slugs.join('/')}/${k.slug}`,
      }))

      const data = {
        title: `${dest.title} — направления`,
        h1: dest.h1 || dest.title,
        description: dest.description || '',
        image: dest.image || '',
        page: './page/dest.html',
        breadcrumb,
        breadcrumb_schema: breadcrumbSchema(breadcrumb),
        level: dest.level,
        content: dest.content && dest.content.html ? dest.content.html : (dest.content || ''),
        children,
        links: [], // этап 4 — перелинковка
        current_year: new Date().getFullYear(),
      }

      const { response } = await res.app.ask('render', {
        server: {
          action: 'html',
          meta: { dir: templateDir, page: 'index.html', data },
        },
      })
      res.status(200).end(response.html)
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
