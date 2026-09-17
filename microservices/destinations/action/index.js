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

  return app
}

export { action }