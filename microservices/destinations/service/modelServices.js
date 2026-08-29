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
  }) {
    // экранировать строку для инлайна в SQL (одинарные кавычки)
    const sq = (v) => (v == null ? "''" : `'${String(v).replace(/'/g, "\\'")}'`)
    const num = (v, d) => (v == null || v === '' ? d : v)

    const loc = lat != null && lng != null
      ? `ST_GeomFromText('POINT(${num(lng, 0)} ${num(lat, 0)})')`
      : null
    const locSql = loc ? `, location = ${loc}` : ''

    const res = await this.insert(
      `CREATE VERTEX Dest SET
        slug = ${sq(slug)}, title = ${sq(title)}, h1 = ${sq(h1 || title)},
        level = ${sq(level || 'place')}, description = ${sq(description || '')},
        content = ${sq(content || '')}, image = ${sq(image || '')},
        is_hub = ${is_hub === undefined ? true : !!is_hub},
        priority = ${num(priority, 0.5)}, created = sysdate()${locSql}`
    )
    if (!res.done || !res.message) return res
    const dest = Array.isArray(res.message) ? res.message[0] : res.message

    // ребро иерархии PART_OF, если задан родитель
    if (parentRid && dest['@rid']) {
      await this.create('PART_OF', dest['@rid'], parentRid)
    }
    return { done: true, dest }
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
  async listChildren(rid, limit = 50) {
    return this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, image, priority FROM Dest
       WHERE ${rid} IN out('PART_OF') ORDER BY priority DESC LIMIT ${limit}`
    )
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

  // --- Узел по полному пути (массив slug от корня) ---
  async getByPath(slugs) {
    if (!slugs || !slugs.length) return null
    const esc = (s) => String(s).replace(/'/g, "\\'")
    const rootSlug = esc(slugs[0])
    // первый slug — корень (нет родителей: out('PART_OF').size() = 0)
    let current = await this.queryOne(
      `SELECT * FROM Dest WHERE slug = '${rootSlug}' AND out('PART_OF').size() = 0`
    )
    if (!current) return null
    // спускаемся: каждый следующий slug — ребёнок (его out('PART_OF') = текущий)
    for (let i = 1; i < slugs.length; i++) {
      const rid = current['@rid']
      current = await this.queryOne(
        `SELECT * FROM Dest WHERE slug = '${esc(slugs[i])}' AND ${rid} IN out('PART_OF')`
      )
      if (!current) return null
    }
    return current
  }

  // --- Удалить узел (и рёбра) ---
  async deleteDest(rid) {
    return this.command(`DELETE VERTEX ${rid}`)
  }

  async getSettings() {
    return this.queryOne('SELECT * FROM Settings WHERE microservice="destinations"')
  }
}

export { Model }
