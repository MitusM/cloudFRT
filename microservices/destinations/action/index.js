// === === === === === === === === === === === ===
// action/index.js — RPC-действия МС destinations на шине
// === === === === === === === === === === === ===
const action = async (app) => {
  // app.action('destinations:{name}', async (meta, res) => { ... })

  /**
   * destinations:search — поиск по кураторскому каталогу Dest.
   *
   * Сначала ищет по Dest (живые места из каталога), возвращает координаты
   * и метаданные. Используется maps:geocode и другими MC для пре-фильтрации
   * перед Nominatim.
   *
   * meta: { query, lang?, limit? (default 8, max 20) }
   * Ответ: { places: [{ name, address, lat, lng, slug, level, typeName, image, url, source }] }
   */
  app.action('destinations:search', async (meta, res) => {
    try {
      const { query, lang, limit } = meta || {}
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.json({ places: [] })
      }
      const db = await app.options.db
      const esc = (s) => String(s).replace(/'/g, "\\'")
      const like = `%${esc(query.trim()).toLowerCase()}%`
      const maxLimit = Math.min(parseInt(limit) || 8, 20)

      // ищем по Dest: только опубликованные, с координатами
      const rows = await db.queryAll(
        `SELECT title, description, level, slug, image,
                location.coordinates[0] AS lng, location.coordinates[1] AS lat,
                out('HAS_TYPE').name AS typeName, out('HAS_TYPE').slug AS typeSlug
         FROM Dest
         WHERE status = 'published' AND location IS NOT NULL
           AND title LIKE '${like}'
         ORDER BY priority DESC
         LIMIT ${maxLimit}`
      )

      const places = (rows || [])
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => ({
          name: r.title || '',
          address: r.description || '',
          lat: Number(r.lat),
          lng: Number(r.lng),
          slug: r.slug || '',
          level: r.level || '',
          typeName: Array.isArray(r.typeName) ? r.typeName[0] : (r.typeName || null),
          typeSlug: Array.isArray(r.typeSlug) ? r.typeSlug[0] : (r.typeSlug || null),
          image: r.image || '',
          source: 'destinations',
        }))

      res.json({ places })
    } catch (err) {
      console.log('⚡ err::destinations:search', err)
      res.status(500).json({ error: err.message || 'search failed' })
    }
  })

  /**
   * destinations:getRegionMap — данные для карты региона (все точки, типы, центр, элементы).
   *
   * Принимает slug региона. Находит Dest, собирает ВСЕ точки поддерева через
   * getMapPointsDeep + все дочерние элементы для сетки карточек.
   *
   * meta: { slug }
   * Ответ: { region: {title, h1, description, image, slug, level},
   *         points[], center{lat,lng}, types[],
   *         items[{slug, title, cardTitle, image, intro, typeName, level, url}] }
   *   или { error } / { error: 'slug required' }
   */
  app.action('destinations:getRegionMap', async (meta, res) => {
    try {
      const { slug } = meta || {}
      if (!slug || typeof slug !== 'string' || !slug.trim()) {
        return res.json({ error: 'slug required' })
      }

      const db = await app.options.db
      const region = await db.getBySlug(slug.trim())
      if (!region) {
        return res.json({ error: 'not found' })
      }

      const mapData = await db.getMapPointsDeep(region['@rid'])

      // первый абзац из HTML-контента
      const firstParagraph = (html) => {
        if (!html) return ''
        const src = String(html)
        const m = src.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
        if (m) return m[1].trim()
        const b = src.match(/^([\s\S]*?)(?=<h[1-6]|<div|<ul|<ol|<table|\z)/i)
        return (b ? b[1] : src).trim()
      }

      // все опубликованные потомки для сетки (без координат) — только места +
      const itemsRaw = await db.queryAll(
        `SELECT slug, title, h1, level, image, description, content,
                out('HAS_TYPE').name AS typeName
         FROM (TRAVERSE out('PART_OF') FROM ${region['@rid']} MAXDEPTH 10)
         WHERE @rid <> ${region['@rid']} AND status = 'published'
         ORDER BY priority DESC`
      )

      // урл от региона: parentSlugs берём slug региона, каждый потомок добавляет свой
      const parentSlug = region.slug
      const items = (itemsRaw || []).map((r) => {
        const title = r.title || ''
        const h1 = r.h1 || ''
        const cardTitle = h1 && h1 !== title ? h1 : title
        const content = r.content ? (typeof r.content === 'string' ? r.content : (r.content.html || '')) : ''
        const typeName = Array.isArray(r.typeName) ? r.typeName[0] : (r.typeName || null)
        return {
          slug: r.slug,
          title,
          cardTitle,
          image: r.image || '',
          intro: firstParagraph(content),
          typeName,
          level: r.level,
          url: `/destinations/${parentSlug}/${r.slug}`,
        }
      })

      res.json({
        region: {
          title: region.title || '',
          h1: region.h1 || region.title || '',
          description: region.description || '',
          image: region.image || '',
          slug: region.slug,
          level: region.level,
        },
        points: mapData.points,
        center: mapData.center,
        types: mapData.types || [],
        items,
      })
    } catch (err) {
      console.log('⚡ err::destinations:getRegionMap', err)
      res.status(500).json({ error: err.message || 'getRegionMap failed' })
    }
  })

  return app
}

export { action }