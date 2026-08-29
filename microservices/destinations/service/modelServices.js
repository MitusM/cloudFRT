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
    // content — тип EMBEDDED: пустое значение/null, не строка (иначе OValidationException)
    const embed = (v) => (v == null || v === '' ? 'null' : sq(v))

    const loc = lat != null && lng != null
      ? `ST_GeomFromText('POINT(${num(lng, 0)} ${num(lat, 0)})')`
      : null
    const locSql = loc ? `, location = ${loc}` : ''

    const res = await this.insert(
      `CREATE VERTEX Dest SET
        slug = ${sq(slug)}, title = ${sq(title)}, h1 = ${sq(h1 || title)},
        level = ${sq(level || 'place')}, description = ${sq(description || '')},
        content = ${embed(content)}, image = ${sq(image || '')},
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

  // --- Список всех узлов (админ) ---
  async listAll(limit = 100, offset = 0) {
    const lim = parseInt(limit, 10) || 100
    const off = parseInt(offset, 10) || 0
    return this.queryAll(
      `SELECT @rid as rid, slug, title, h1, level, is_hub, priority, image, created
       FROM Dest ORDER BY created DESC SKIP ${off} LIMIT ${lim}`
    )
  }

  // --- Узел по RID (админ) ---
  async getByRid(rid) {
    return this.queryOne(`SELECT *, @rid as rid FROM ${rid}`)
  }

  // --- Проверка: существует ли slug (внутри родителя или глобально) ---
  async slugExists(slug, parentRid) {
    const s = String(slug).replace(/'/g, "\\'")
    if (parentRid) {
      const r = await this.queryOne(
        `SELECT @rid FROM Dest WHERE slug = '${s}' AND ${parentRid} IN out('PART_OF')`
      )
      return !!r
    }
    const r = await this.queryOne(`SELECT @rid FROM Dest WHERE slug = '${s}'`)
    return !!r
  }

  // --- Обновить узел (безопасно: белый список полей + ЭКРАН-пингование) ---
  // Поля, которые можно менять. Безопасно от SQL-инъекции (нельзя произвольный set).
  async updateDest(rid, fields) {
    const ALLOWED = ['slug', 'title', 'h1', 'level', 'description', 'content', 'image', 'is_hub', 'priority']
    const sq = (v) => (v == null ? "''" : `'${String(v).replace(/'/g, "\\'")}'`)
    const num = (v) => (v == null ? 'null' : String(v))
    // content — EMBEDDED: пустое → null
    const embed = (v) => (v == null || v === '' ? 'null' : sq(v))
    const set = []

    for (const key of ALLOWED) {
      if (fields[key] === undefined) continue
      if (key === 'content') {
        set.push(`content = ${embed(fields[key])}`)
      } else if (key === 'priority' || key === 'is_hub') {
        if (key === 'is_hub') {
          set.push(`is_hub = ${fields[key] ? true : false}`)
        } else {
          const n = parseFloat(fields[key])
          set.push(`priority = ${Number.isNaN(n) ? 0.5 : n}`)
        }
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

  // --- Сменить родителя: удалить старые PART_OF из узла, добавить новое ---
  async moveDest(rid, newParentRid) {
    // удалить все текущие рёбра PART_OF, где rid — исходящий (ребёнок)
    await this.command(`DELETE EDGE PART_OF WHERE out = ${rid}`)
    if (newParentRid) {
      await this.create('PART_OF', rid, newParentRid)
    }
    return { done: true }
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

  // ============ ЭТАП 4: ПЕРЕЛИНКОВКА И ХАБЫ ============
  //
  // «Топ-места»: важные целевые места/достопримечательности из ВСЕГО поддерева
  // узла (через уровни), чтобы дать прямые прыжки. Напр., хаб региона показывает
  // Водопад Корбу напрямую, минуя промежуточный хаб Телецкого озера.
  // Возвращает { places: [{rid,slug,title,level,priority,path:[rids]}], slugMap: {rid:slug} }.
  // path — цепочка RID от хаба до узла (для сборки полного URL).
  async getTopPlaces(rid, { levels = ['attraction', 'place'], limit = 12 } = {}) {
    const lim = parseInt(limit, 10) || 12
    const levelClause = levels.length ? `(${levels.map((l) => `level = '${l}'`).join(' OR ')})` : '1=1'
    const places = await this.queryAll(
      `SELECT @rid as rid, slug, title, level, priority, $path AS path FROM (
        TRAVERSE in('PART_OF') FROM ${rid}
      ) WHERE ${levelClause} ORDER BY priority DESC LIMIT ${lim}`
    )
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
    return { places, slugMap }
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
      `SELECT @rid as rid, slug, title, level, priority FROM Dest
       WHERE ${parentsList.map((p) => `${p['@rid'] || p} IN out('PART_OF')`).join(' OR ')}
         AND @rid <> ${rid}
       ORDER BY priority DESC LIMIT ${lim}`
    )
    return out
  }

  // Прочитать поле links (ручные блоки перелинковки) узла
  async getLinks(rid) {
    const r = await this.queryOne(`SELECT links FROM ${rid}`)
    return (r && r.links) || null
  }

  async getSettings() {
    return this.queryOne('SELECT * FROM Settings WHERE microservice="destinations"')
  }
}

export { Model }
