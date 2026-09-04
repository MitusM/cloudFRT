// === === === === === === === === === === === ===
// modelServices.js — модель Dest (гео-каталог мест) для МС destinations
//
// Класс-вершина Dest в OrientDB. Иерархия и связи — ГРАФ-РЁБРАМИ (см. schema.sql):
//   Dest -PART_OF-> Dest        (Телецкое ∈ Горный Алтай ∈ Россия)
//   Dest -HAS_TRIP-> Trip       (место → поездки trips)
//   Dest -HAS_ARTICLE-> Article (место → статьи /stati/)
//   Dest -HAS_MAP-> Map         (место → карты maps)
//
// Етап 0: базовые операции (createDest, getBySlug, listChildren, parents chain).
// Рендер хабов и полноценный разбор пути — этапы 2-4.
// === === === === === === === === === === === ===
import { PDO } from './dbServices.js'

class Model extends PDO {
  constructor(options) {
    super(options)
  }

  // ---------- Базовые операции с OrientDB (как country/article) ----------
  async queryAll(query, params) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query, params).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.queryAll => ModelService.js:19 ', err)
      process.exit()
    }
  }

  async queryOne(query, params) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query, params).one()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.query => ', err)
      process.exit()
    }
  }

  async insert(query, json) {
    try {
      const session = await this.pool.acquire()
      const message = await session.command(query, json).one()
      session.close()
      return { message: message, type: 'insert', done: true }
    } catch (err) {
      console.log('⚡ err::PDO.insert => ', err)
      return { err: err, done: false }
    }
  }

  async create(edgeClass, from, to) {
    try {
      const session = await this.pool.acquire()
      const message = await session
        .create('EDGE', edgeClass)
        .from(from)
        .to(to)
        .one()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.create => ', err)
      process.exit()
    }
  }

  async command(query) {
    try {
      const session = await this.pool.acquire()
      const message = await session.command(query).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.command => ', err)
      return err
    }
  }

  // --- Создать узел места (вершина Dest) ---
  // parentRid опционален — при указании создаётся ребро PART_OF.
  // ПАРАМЕТРЫ ИНЛАЙНЯТСЯ в SQL (orientjs в этом стеке не подставляет
  // ни :named, ни позиционные ? — проверено; инлайн — как в article).
  //
  // ПУБЛИКАЦИЯ: новый узел создаётся как ЧЕРНОВИК (status='draft'), пока
  // админ не нажмёт «Опубликовать». Публичные SEO-страницы показывают
  // только status='published', причём draft прячет и всё своё поддерево.
  async createDest({
    slug,
    title,
    h1,
    level, // country | region | place | attraction
    description,
    content,
    lat,
    lng,
    image,
    is_hub,
    priority,
    parentRid,
    status, // 'draft' (default) | 'published'
  }) {
    // экранировать строку для инлайна в SQL (одинарные кавычки)
    const sq = (v) => (v == null ? "''" : `'${String(v).replace(/'/g, "\\'")}'`)
    const num = (v, d) => (v == null || v === '' ? d : v)
    // content хранится как строка (fix 31.08).
    const embed = (v) => (v == null || v === '' ? 'null' : sq(v))

    const loc = lat != null && lng != null
      ? `ST_GeomFromText('POINT(${num(lng, 0)} ${num(lat, 0)})')`
      : null
    const locSql = loc ? `, location = ${loc}` : ''

    // по умолчанию — черновик (новые материалы не появляются на сайте, пока
    // не опубликованы вручную).
    const st = status === 'published' ? 'published' : 'draft'

    const res = await this.insert(
      `CREATE VERTEX Dest SET
        slug = ${sq(slug)}, title = ${sq(title)}, h1 = ${sq(h1 || title)},
        level = ${sq(level || 'place')}, description = ${sq(description || '')},
        content = ${embed(content)}, image = ${sq(image || '')},
        is_hub = ${is_hub === undefined ? true : !!is_hub},
        priority = ${num(priority, 0.5)}, status = '${st}',
        created = sysdate()${locSql}`
    )
    if (!res.done || !res.message) return res
    const dest = Array.isArray(res.message) ? res.message[0] : res.message

    // ребро иерархии PART_OF, если задан родитель
    if (parentRid && dest['@rid']) {
      await this.create('PART_OF', dest['@rid'], parentRid)
    }
    return { done: true, dest }
  }

  // --- Список всех узлов (админ) ---
  async listAll(limit = 100, offset = 0) {
    const lim = parseInt(limit, 10) || 100
    const off = parseInt(offset, 10) || 0
    return this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, is_hub, priority, image, status, created
       FROM Dest ORDER BY created DESC SKIP ${off} LIMIT ${lim}`
    )
  }

  // --- Узел по RID (админ) ---
  async getByRid(rid) {
    return this.queryOne(`SELECT *, @rid as rid FROM ${rid}`)
  }

  /** Родитель узла (первый по out('PART_OF')) или null. Используется админ-UI. */
  async getParentRid(rid) {
    const row = await this.queryOne(
      `SELECT out('PART_OF') as parents FROM ${rid} WHERE out('PART_OF').size() > 0`
    )
    const p = row && row.parents
    if (Array.isArray(p) && p.length) return String(p[0]['@rid'] || p[0])
    return null
  }

  // --- Проверка: существует ли slug (внутри родителя или глобально) ---
  async slugExists(slug, parentRid, excludeRid) {
    const s = String(slug).replace(/'/g, "\\'")
    const exc = excludeRid ? ` AND @rid <> ${excludeRid}` : ''
    if (parentRid) {
      const r = await this.queryOne(
        `SELECT @rid FROM Dest WHERE slug = '${s}' AND ${parentRid} IN out('PART_OF')${exc}`
      )
      return !!r
    }
    const r = await this.queryOne(`SELECT @rid FROM Dest WHERE slug = '${s}'${exc}`)
    return !!r
  }

  // --- Обновить узел (безопасно: белый список полей + ЭКРАН-пингование) ---
  // Поля, которые можно менять. Безопасно от SQL-инъекции (нельзя произвольный set).
  async updateDest(rid, fields) {
    const ALLOWED = ['slug', 'title', 'h1', 'level', 'description', 'content', 'image', 'is_hub', 'priority', 'status']
    const sq = (v) => (v == null ? "''" : `'${String(v).replace(/'/g, "\\'")}'`)
    const num = (v) => (v == null ? 'null' : String(v))
    // content — EMBEDDED: пустое → null
    const embed = (v) => (v == null || v === '' ? 'null' : sq(v))
    const set = []

    for (const key of ALLOWED) {
      if (fields[key] === undefined) continue
      if (key === 'content') {
        set.push(`content = ${embed(fields[key])}`)
      } else if (key === 'priority') {
        const n = parseFloat(fields[key])
        set.push(`priority = ${Number.isNaN(n) ? 0.5 : n}`)
      } else if (key === 'is_hub') {
        set.push(`is_hub = ${fields[key] ? true : false}`)
      } else if (key === 'status') {
        // только черновик/опубликовано (игнорируем мусор)
        const st = fields[key] === 'published' ? 'published' : 'draft'
        set.push(`status = '${st}'`)
      } else {
        set.push(`${key} = ${sq(fields[key])}`)
      }
    }

    // координаты
    if (fields.lat != null && fields.lng != null) {
      set.push(`location = ST_GeomFromText('POINT(${num(fields.lng)} ${num(fields.lat)})')`)
    }

    if (!set.length) return { done: true, updated: 0 }
    const res = await this.command(`UPDATE ${rid} SET ${set.join(', ')}`)
    return { done: true, updated: (res && res.length) || 0 }
  }

  // --- Сменить статус публикации узла: 'draft' | 'published' ---
  async setStatus(rid, status) {
    const st = status === 'published' ? 'published' : 'draft'
    const res = await this.command(`UPDATE ${rid} SET status = '${st}'`)
    return { done: true, updated: (res && res.length) || 0 }
  }

  // --- Множество СКРЫТЫХ RID (draft-узлы + всё их поддерево). ---
  // Правило: черновик не показывается и прячет всех своих потомков (ребёнок
  // достижим только через опубликованных предков). Поэтому скрытые = все
  // draft-вершины и всё, что под ними вниз по PART_OF.
  async getClosedRids() {
    const rows = await this.queryAll(
      `SELECT @rid as rid FROM (
         TRAVERSE in('PART_OF') FROM (SELECT FROM Dest WHERE status = 'draft')
       )`
    )
    const set = new Set()
    for (const r of rows || []) set.add(String(r.rid))
    return set
  }

  // --- Сменить родителя: удалить старые PART_OF из узла, добавить новое ---
  async moveDest(rid, newParentRid) {
    // удалить все текущие рёбра PART_OF, где rid — исходящий (ребёнок)
    await this.command(`DELETE EDGE PART_OF WHERE out = ${rid}`)
    if (newParentRid) {
      await this.create('PART_OF', rid, newParentRid)
    }
    return { done: true }
  }

  // --- Является ли maybeChildRid потомком rid (для защиты от циклов при move) ---
  async isDescendant(rid, maybeChildRid) {
    if (!rid || !maybeChildRid) return false
    if (String(rid) === String(maybeChildRid)) return true
    // идём от maybeChildRid вверх по PART_OF: если встречаем rid — значит он потомок
    const rows = await this.queryAll(
      `SELECT @rid as rid FROM (
        TRAVERSE out('PART_OF') FROM ${maybeChildRid}
      ) WHERE @rid = ${rid}`
    )
    return rows.length > 0
  }

  // --- Найти узел по slug (внутри родителя или глобально) ---
  // Направление рёбер PART_OF: ребёнок -PART_OF-> родитель.
  //   out('PART_OF') узла = предки (куда напр. ребро)  → хлебные крошки
  //   in('PART_OF') узла  = дети (кто напр. на узел)   → спуск вниз
  async getBySlug(slug, parentRid) {
    const s = String(slug).replace(/'/g, "\\'")
    if (parentRid) {
      return this.queryOne(
        `SELECT * FROM Dest WHERE slug = '${s}' AND ${parentRid} IN out('PART_OF')`
      )
    }
    return this.queryOne(`SELECT * FROM Dest WHERE slug = '${s}'`)
  }

  // --- Список прямых детей узла (у кого ребро PART_OF на rid) ---
  // ПУБЛИЧНАЯ версия: показываем только опубликованных детей. Родитель на этот
  // момент уже опубликован (сюда заходят со страницы видимого узла), поэтому
  // достаточно self-status — а не-опубликованный ребёнок прячет и своё поддерево.
  async listChildren(rid, limit = 50) {
    return this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, image, priority, status FROM Dest
       WHERE ${rid} IN out('PART_OF') AND status = 'published'
       ORDER BY priority DESC LIMIT ${limit}`
    )
  }

  // --- Дети узла БЕЗ лимита (админ drill-down). Сортировка: уровень, затем приоритет ---
  async listChildrenAdmin(rid, limit = 50, offset = 0) {
    const lim = parseInt(limit, 10) || 50
    const off = parseInt(offset, 10) || 0
    return this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, image, priority, is_hub, status FROM Dest
       WHERE ${rid} IN out('PART_OF') ORDER BY priority DESC SKIP ${off} LIMIT ${lim}`
    )
  }

  async countChildrenAdmin(rid) {
    const row = await this.queryOne(
      `SELECT COUNT(*) as c FROM (
        SELECT FROM Dest WHERE ${rid} IN out('PART_OF')
      )`
    )
    return row ? (row.c || 0) : 0
  }

  // --- Дети верхнего уровня (страны, без родителя) для админ-корня ---
  async listRootAdmin(limit = 50, offset = 0) {
    const lim = parseInt(limit, 10) || 50
    const off = parseInt(offset, 10) || 0
    return this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, image, priority, is_hub, status FROM Dest
       WHERE out('PART_OF').size() = 0 ORDER BY priority DESC SKIP ${off} LIMIT ${lim}`
    )
  }

  async countRootAdmin() {
    const row = await this.queryOne(
      `SELECT COUNT(*) as c FROM Dest WHERE out('PART_OF').size() = 0`
    )
    return row ? (row.c || 0) : 0
  }

  // --- Цепочка предков (для хлебных крошек): от узла к корню ---
  // ребёнок -PART_OF-> родитель, поэтому предки = out('PART_OF') транзитивно
  async parentsChain(rid) {
    return this.queryAll(
      `SELECT @rid as rid, slug, title, level FROM (
        TRAVERSE out('PART_OF') FROM ${rid}
      )`
    )
  }

  // --- Узел по полному пути (массив slug от корня) [ПУБЛИЧНЫЙ] ---
  // Возвращает только узел, вся ветка которого опубликована: корень сам должен
  // быть published, и каждый следующий хопу — тоже published ребёнок. Поэтому
  // если где-то в цепочке черновик — спуск обрывается (null).
  async getByPath(slugs) {
    if (!slugs || !slugs.length) return null
    const esc = (s) => String(s).replace(/'/g, "\\'")
    const rootSlug = esc(slugs[0])
    // первый slug — корень (нет родителей: out('PART_OF').size() = 0)
    let current = await this.queryOne(
      `SELECT * FROM Dest WHERE slug = '${rootSlug}' AND out('PART_OF').size() = 0 AND status = 'published'`
    )
    if (!current) return null
    // спускаемся: каждый следующий slug — опубликованный ребёнок
    for (let i = 1; i < slugs.length; i++) {
      const rid = current['@rid']
      current = await this.queryOne(
        `SELECT * FROM Dest WHERE slug = '${esc(slugs[i])}' AND ${rid} IN out('PART_OF') AND status = 'published'`
      )
      if (!current) return null
    }
    return current
  }

  // --- Удалить узел (и рёбра) ---
  async deleteDest(rid) {
    return this.command(`DELETE VERTEX ${rid}`)
  }

  // ============ ЭТАП 4: ПЕРЕЛИНКОВКА И ХАБЫ ============
  //
  // «Топ-места»: важные целевые места/достопримечательности из ВСЕГО поддерева
  // узла (через уровни), чтобы дать прямые прыжки. Напр., хаб региона показывает
  // Водопад Корбу напрямую, минуя промежуточный хаб Телецкого озера.
  // Возвращает { places: [{rid,slug,title,level,priority,path:[rids]}], slugMap: {rid:slug} }.
  // path — цепочка RID от хаба до узла (для сборки полного URL).
  // ПУБЛИЧНЫЙ: исключаем черновики и всё, что под ними (closed), чтобы не
  // протащить опубликованный узел, живущий под черновиком.
  async getTopPlaces(rid, { levels = ['attraction', 'place'], limit = 12 } = {}) {
    const lim = parseInt(limit, 10) || 12
    const levelClause = levels.length ? `(${levels.map((l) => `level = '${l}'`).join(' OR ')})` : '1=1'
    const closed = await this.getClosedRids()
    const places = await this.queryAll(
      `SELECT @rid as rid, slug, title, level, priority, status, $path AS path FROM (
        TRAVERSE in('PART_OF') FROM ${rid}
      ) WHERE ${levelClause} AND status = 'published' ORDER BY priority DESC LIMIT ${lim}`
    )
    const publicPlaces = places.filter((p) => !closed.has(String(p.rid)))
    // карта rid→slug по всему поддереву (для промежуточных звеньев пути)
    const all = await this.queryAll(
      `SELECT @rid as rid, slug FROM (TRAVERSE in('PART_OF') FROM ${rid})`
    )
    const slugMap = {}
    for (const n of all) {
      const r = String(n.rid)
      slugMap[r] = n.slug
      slugMap[r.match(/#\d+:\d+/)?.[0]] = n.slug
    }
    return { places: publicPlaces, slugMap }
  }

  // «Похожие места»: братья по дереву (same parent). Для достопримечательности -
  // другие достопримечательности того же родителя.
  // Двухшагово (IN с коллекцией слева не парсится): получить родителя → дети родителя.
  async getSiblings(rid, limit = 8) {
    const lim = parseInt(limit, 10) || 8
    const parentRow = await this.queryOne(`SELECT out('PART_OF') AS p FROM ${rid}`)
    const parents = (parentRow && parentRow.p) || []
    if (!parents.length) return []
    // берём родителей (обычно один), для каждого собираем детей
    const parentsList = Array.isArray(parents) ? parents : [parents]
    const out = await this.queryAll(
      `SELECT @rid as rid, slug, title, level, priority, status FROM Dest
       WHERE ${parentsList.map((p) => `${p['@rid'] || p} IN out('PART_OF')`).join(' OR ')}
         AND @rid <> ${rid} AND status = 'published'
       ORDER BY priority DESC LIMIT ${lim}`
    )
    return out
  }

  // Прочитать поле links (ручные блоки перелинковки) узла
  async getLinks(rid) {
    const r = await this.queryOne(`SELECT links FROM ${rid}`)
    return (r && r.links) || null
  }

  // ---- Sitemap: все узлы дерева с полным путём и приоритетом ----
  // Возвращает [{ slug, title, level, priority, path:[rids] }] для каждого узла.
  async getSitemapTree() {
    const rows = await this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, priority, is_hub, image, status, $path AS path FROM (
        TRAVERSE in('PART_OF') FROM (SELECT FROM Dest WHERE out('PART_OF').size() = 0)
      )`
    )
    // slugMap по всему дереву
    const all = await this.queryAll(
      `SELECT @rid as rid, slug FROM (
        TRAVERSE in('PART_OF') FROM (SELECT FROM Dest WHERE out('PART_OF').size() = 0)
      )`
    )
    const slugMap = {}
    for (const n of all) {
      const key = String(n.rid)
      slugMap[key] = n.slug
      const m = key.match(/#\d+:\d+/)
      if (m) slugMap[m[0]] = n.slug
    }
    // собрать полный путь по $path
    return rows.map((r) => ({
      rid: String(r.rid),
      slug: r.slug,
      title: r.title,
      h1: r.h1,
      level: r.level,
      priority: r.priority,
      is_hub: r.is_hub,
      image: r.image,
      status: r.status || 'draft',
      // путь: от корня до узла (включительно), via slugMap
      path: (r.path || []).map((rid) => slugMap[String(rid)]).filter(Boolean).join('/'),
    }))
  }

  // --- Глобальный поиск по каталогу (slug/title), с полным путём от корня ---
  // LIKE по slug/title. Возвращает [{rid, slug, title, level, path}].
  async searchDest(q, limit = 50) {
    const esc = (s) => String(s).replace(/'/g, "\\'")
    const like = `%${esc(q).toLowerCase()}%`
    const rows = await this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, image, is_hub, status, $path AS path FROM (
        TRAVERSE in('PART_OF') FROM (SELECT FROM Dest WHERE out('PART_OF').size() = 0)
      ) WHERE (slug LIKE '${like}' OR title LIKE '${like}') ORDER BY title LIMIT ${limit}`
    )
    // slugMap по всему дереву — для сборки полного пути
    const all = await this.queryAll(
      `SELECT @rid as rid, slug FROM (
        TRAVERSE in('PART_OF') FROM (SELECT FROM Dest WHERE out('PART_OF').size() = 0)
      )`
    )
    const slugMap = {}
    for (const n of all) {
      slugMap[String(n.rid)] = n.slug
    }
    return rows.map((r) => ({
      rid: String(r.rid),
      slug: r.slug,
      title: r.title,
      h1: r.h1,
      level: r.level,
      image: r.image,
      is_hub: r.is_hub,
      status: r.status || 'draft',
      path: (r.path || []).map((rid) => slugMap[String(rid)]).filter(Boolean).join('/'),
    }))
  }

  // ---- Статьи /stati/ связанные с местом (этап 6) ----
  // Сначала по рёбрам HAS_ARTICLE (Dest → Article), затем fallback на статьи,
  // у которых url блога совпадает. Возвращает [{ url, title }].
  async getRelatedArticles(rid, limit = 6) {
    const lim = parseInt(limit, 10) || 6
    // статьи через ребро HAS_ARTICLE
    const viaEdge = await this.queryAll(
      `SELECT out('HAS_ARTICLE').url AS url, out('HAS_ARTICLE').title AS title
       FROM ${rid} WHERE out('HAS_ARTICLE').size() > 0`
    )
    if (viaEdge && viaEdge.length) {
      const urls = viaEdge[0].url
      const titles = viaEdge[0].title
      if (Array.isArray(urls)) {
        return urls.slice(0, lim).map((u, i) => {
          // title может быть EMBEDDED map {ru: '..'} или строкой
          let t = (Array.isArray(titles) && titles[i]) || 'Читать далее'
          if (t && typeof t === 'object') t = t.ru || t.en || t._ || Object.values(t)[0] || 'Читать далее'
          return { url: `/stati/${String(u).replace(/^\/+/, '')}`, title: String(t) }
        })
      }
    }
    return []
  }

  // ---------- ЭТАП 5: точки для карты узла (интеграция с МС maps) ----------
  // Собирает маркеры для карты на гео-хабе: сам узел (если есть location) +
  // прямые дочерние узлы с координатами. Возвращает { points, center }.
  // location хранится как OPoint { coordinates: [lng, lat] } (GeoJSON порядок!).
  async getMapPoints(rid) {
    const pull = (r) => {
      // нормализуем location в { lat, lng }
      if (r && r.location) {
        const c = r.location.coordinates
        if (Array.isArray(c) && c.length >= 2) {
          return { lat: Number(c[1]), lng: Number(c[0]) }
        }
      }
      return null
    }

    const points = []
    let center = null

    // сам узел
    const self = await this.getByRid(rid)
    const selfLoc = pull(self)
    if (selfLoc && self.title) {
      points.push({ name: self.title, level: self.level, ...selfLoc })
      center = selfLoc
    }

    // прямые дети с location (достопримечательности/подместа) — только опубликованные
    const kids = await this.queryAll(
      `SELECT @rid as rid, slug, title, level, location FROM Dest
       WHERE ${rid} IN out('PART_OF') AND location IS NOT NULL AND status = 'published'`
    )
    for (const k of kids || []) {
      const loc = pull(k)
      if (loc && k.title) {
        points.push({ name: k.title, level: k.level, ...loc })
      }
    }

    // центр: если у узла нет координат — средняя точка по дочерним
    if (!center && points.length) {
      const lat = points.reduce((a, p) => a + p.lat, 0) / points.length
      const lng = points.reduce((a, p) => a + p.lng, 0) / points.length
      center = { lat, lng }
    }

    return { points, center }
  }

  async getSettings() {
    return this.queryOne('SELECT * FROM Settings WHERE microservice="destinations"')
  }
}

export { Model }
