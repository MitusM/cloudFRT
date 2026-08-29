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
import 'dotenv/config' // важнo: загрузить .env ПЕРВЫМ (до создания CacheRedis ниже)
import path from 'path'
import pkg from 'app-root-path'
import dotenv from 'dotenv'
import { Model } from '../service/modelServices.js'
import { validateDestInput, normalizeSlug } from '../service/validation.js'
import { Cache } from '../service/cacheServices.js'

const appRoot = pkg.path
dotenv.config()
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/')
const APP_URL = process.env.APP_URL || 'https://cloud.frt.su'

// Кэш публичных SEO-страниц (Redis). Ключи 'destPage:<path>'
// ioredis подключается в конструкторе (метод .connect() не нужен).
const CacheRedis = new Cache({ db: 0 })
const CACHE_TTL = 300 // сек, публичный кэш страниц

// Инвалидировать кэш всех публичных страниц (при записи узла проще сбросить всё,
// чем трекать затронутые пути — список путей невелик на старте)
function invalidatePageCache() {
  try {
    return CacheRedis.delPattern('destPage:*')
  } catch (e) {
    return Promise.resolve()
  }
}

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

// ---- Нормализовать ручные блоки перелинковки поля links ----
// Структура поля: { где_жить: [{slug|url, title}], тур: [...], полезное: [...] }
// На выходе плоский список {url, title} (сгруппированы заголовком в шаблоне не требуется).
function normalizeManualLinks(links) {
  if (!links || typeof links !== 'object') return []
  const order = ['где_жить', 'тур', 'полезное', 'top_places', 'похожие']
  const out = []
  for (const key of order) {
    const group = links[key]
    if (!Array.isArray(group)) continue
    for (const item of group) {
      if (!item || typeof item !== 'object') continue
      const title = item.title || item.name || ''
      const url = item.url || (item.slug ? `/stati/${item.slug}` : item.path)
      if (title && url) out.push({ title, url })
    }
  }
  return out
}

const endpoints = async (app) => {
  const db = await app.options.db

  /** ---------- (RU) Корневой хаб: все направления верхнего уровня ---------- */
  app.get('/destinations/', async (req, res) => {
    try {
      // кэш: пробуем сначала из Redis
      const cached = await CacheRedis.get('destPage:__root__')
      if (cached) return res.status(200).end(cached)

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
      // кэшировать публичную страницу
      CacheRedis.set('destPage:__root__', response.html, CACHE_TTL)
      res.status(200).end(response.html)
    } catch (err) {
      console.log('⚡ err::destinations root', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  /** ---------- (RU) XML Sitemap по дереву с приоритетами (этап 6) ---------- */
  app.get('/destinations/sitemap.xml', async (req, res) => {
    try {
      const tree = await db.getSitemapTree()

      // Приоритет: выше для хабов/стран, ниже для достопримечательностей,
      // но не меньше ~0.5 (все страницы ценны).
      const LEVEL_PRIO = { country: 0.9, region: 0.8, place: 0.7, attraction: 0.6 }
      const urls = tree
        .filter((n) => n.path) // без корня самого? корень — отдельная страница, добавим своё
        .map((n) => {
          const base = (n.priority !== undefined && n.priority != null ? n.priority : LEVEL_PRIO[n.level]) || 0.6
          const prio = Math.max(0.5, Math.min(1, Number(base)))
          return { loc: `${APP_URL}/destinations/${n.path}`, prio, level: n.level }
        })

      // корневой хаб тоже в sitemap (0.9)
      urls.unshift({ loc: `${APP_URL}/destinations/`, prio: 0.9, level: 'root' })

      // собрать XML построчно (избегаем переноса внутри литерала)
      const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
      for (const u of urls) {
        lines.push('  <url>', `    <loc>${u.loc}</loc>`, `    <priority>${(u.prio || 0.6).toFixed(1)}</priority>`, '  </url>')
      }
      lines.push('</urlset>')
      const xml = lines.join('\n')

      // micromq-обвязка res не имеет .type()/.set() — отдаём как есть
      res.status(200).end(xml)

      res.status(200).type('application/xml').end(xml)
    } catch (err) {
      console.log('⚡ err::destinations sitemap', err)
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

      // кэш публичной страницы
      const cacheKey = `destPage:${slugs.join('/')}`
      const cachedHtml = await CacheRedis.get(cacheKey)
      if (cachedHtml) return res.status(200).end(cachedHtml)

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

      // ===== ЭТАП 4: перелинковка =====
      const basePath = `/destinations/${slugs.join('/')}`

      // «Топ-места»: прямые ссылки на цели из всего поддерева (через уровни),
      // чтобы дать SEO-вес, напр. Водопад Корбу из хаба Горного Алтая.
      // Показываем только на хабах (не на чистой достопримечательности).
      const isHub = dest.level !== 'attraction' && (dest.is_hub === undefined ? true : dest.is_hub)
      let topPlaces = []
      if (isHub) {
        const { places, slugMap } = await db.getTopPlaces(dest['@rid'], { limit: 12 })
        topPlaces = places
          .filter((t) => {
            // исключить сам хаб из топ-мест (не ссылаемся на текущую страницу)
            return !(t.rid && String(t.rid) === String(dest['@rid']))
          })
          .map((t) => {
            // path = массив RID от хаба до узла; первый элемент — сам хаб (basePath уже
            // заканчивается хабом), поэтому подпуть = path без первого (и без самого узла,
            // который добавляется отдельно)
            const pathRids = (t.path || []).slice(1)
            const subSlugs = pathRids.map((r) => slugMap[String(r)]).filter(Boolean)
            const url = `${basePath}/${subSlugs.join('/')}`
            return { title: t.title, level: t.level, url }
          })
      }

      // «Похожие места»: братья по дереву. Для брата URL = up уровень + slug.
      const sibs = await db.getSiblings(dest['@rid'], 8)
      // родительский путь = basePath без последнего сегмента (текущий узел)
      const parentPath = slugs.slice(0, -1).join('/')
      const siblings = sibs.map((s) => ({
        title: s.title,
        level: s.level,
        url: `/destinations/${parentPath}/${s.slug}`,
      }))

      // ручные блоки перелинковки (links поле узла): где жить / тур / кастом
      const manualLinks = await db.getLinks(dest['@rid'])
      const links = normalizeManualLinks(manualLinks)

      // статьи /stati/ по месту (этап 6: машина ссылок блога)
      const related = await db.getRelatedArticles(dest['@rid'], 6)

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
        top_places: topPlaces,
        siblings,
        links: links,
        articles: related,
        current_year: new Date().getFullYear(),
      }

      const { response } = await res.app.ask('render', {
        server: {
          action: 'html',
          meta: { dir: templateDir, page: 'index.html', data },
        },
      })
      // кэшировать публичную страницу (ключ = путь)
      CacheRedis.set(`destPage:${slugs.join('/')}`, response.html, CACHE_TTL)
      res.status(200).end(response.html)
    } catch (err) {
      console.log('⚡ err::destinations path', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  /** --------- Admin-CRUD (этап 3, REST) ---------*/
  // список всех узлов
  app.get('/destinations/admin/', async (req, res) => {
    try {
      const limit = req.query.limit
      const offset = req.query.offset
      const list = await db.listAll(limit, offset)
      return res.status(200).json({ destinations: list })
    } catch (err) {
      console.log('⚡ err::destinations admin list', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  // один узел по RID
  app.get('/destinations/admin/:rid', async (req, res) => {
    try {
      const rid = req.params.rid
      if (!rid) return errorHandler(res, 'rid обязателен', 400)
      const dest = await db.getByRid(rid)
      if (!dest) return errorHandler(res, 'Not found')
      return res.status(200).json({ dest })
    } catch (err) {
      console.log('⚡ err::destinations admin get', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  // создать узел
  app.post('/destinations/admin/create', async (req, res) => {
    try {
      const body = req.body || {}
      const { ok, errors, clean } = validateDestInput(body, { requireTitle: true })
      if (!ok) return errorHandler(res, { errors }, 400)

      // уникальность slug (внутри родителя или глобально)
      const dup = await db.slugExists(clean.slug, clean.parentRid)
      if (dup) return errorHandler(res, { errors: ['slug уже занят в этом разделе'] }, 409)

      const result = await db.createDest({
        slug: clean.slug,
        title: clean.title,
        h1: clean.h1,
        level: clean.level,
        description: clean.description,
        content: clean.content,
        lat: clean.lat,
        lng: clean.lng,
        image: clean.image,
        is_hub: clean.is_hub,
        priority: clean.priority,
        parentRid: clean.parentRid,
      })
      if (!result.done) return errorHandler(res, result.err || 'Ошибка создания', 500)

      // инвалидировать кэш публичных страниц
      await invalidatePageCache()
      return res.status(201).json({ done: true, rid: result.dest && result.dest['@rid'] })
    } catch (err) {
      console.log('⚡ err::destinations create', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  // обновить узел
  app.put('/destinations/admin/:rid', async (req, res) => {
    try {
      const body = req.body || {}
      const rid = req.params.rid
      if (!rid) return errorHandler(res, 'rid обязателен', 400)

      const { ok, errors, clean } = validateDestInput(body, { requireTitle: false })
      if (!ok) return errorHandler(res, { errors }, 400)

      // если меняется slug — проверить уникальность
      if (clean.slug) {
        const dup = await db.slugExists(clean.slug, clean.parentRid)
        if (dup) return errorHandler(res, { errors: ['slug уже занят в этом разделе'] }, 409)
      }

      const result = await db.updateDest(rid, clean)
      // если меняется родитель — перенести в дереве
      if (clean.parentRid !== undefined) {
        await db.moveDest(rid, clean.parentRid)
      }

      // инвалидировать кэш публичных страниц
      await invalidatePageCache()
      return res.status(200).json({ done: true, updated: result.updated })
    } catch (err) {
      console.log('⚡ err::destinations update', err)
      return errorHandler(res, 'Server error', 500)
    }
  })

  // удалить узел
  app.delete('/destinations/admin/:rid', async (req, res) => {
    try {
      const rid = req.params.rid
      if (!rid) return errorHandler(res, 'rid обязателен', 400)
      // удалить рёбра и вершину
      await db.command(`DELETE EDGE PART_OF WHERE out = ${rid} OR in = ${rid}`)
      await db.deleteDest(rid)
      await invalidatePageCache()
      return res.status(200).json({ done: true })
    } catch (err) {
      console.log('⚡ err::destinations delete', err)
      return errorHandler(res, 'Server error', 500)
    }
  })
}

export { endpoints }
