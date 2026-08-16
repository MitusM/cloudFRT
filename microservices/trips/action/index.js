// === === === === === === === === === === === ===
// Trips RPC-actions (сервис-2-сервис через шину)
// === === === === === === === === === === === ===

const action = async (app) => {
  /**
   * trips:list-user — список поездок пользователя для другого МС (напр. article).
   * Не требует req.session: пользователь определяется по meta.user (rid|username|_id).
   *
   * meta:
   *   { user: { rid } } | { user: { username } } | { user: { _id } }
   *   (просто { rid } / { username } / { _id } тоже принимается)
   *   optional { archived: boolean }
   *
   * Ответ: { trips: [...] } — owned + shared (те же, что GET /trips/)
   *         { error: 'user_not_found' } если юзер не найден
   *         { error: 'trips:list-user requires user' } если meta.user нет
   */
  app.action('trips:list-user', async (meta, res) => {
    try {
      const db = await app.options.db
      const u = meta.user || {}
      const rid = meta.rid || u.rid
      const username = meta.username || u.username
      const _id = meta._id || u._id

      if (!rid && !username && !_id) {
        return res.status(400).json({ error: 'trips:list-user requires user (rid|username|_id)' })
      }

      //  резолв юзера через users user:get (по rid|username|_id), получаем RID
      const userQP = rid
        ? { rid }
        : username
          ? { username }
          : { _id }
      let user = null
      try {
        const resp = await res.app.ask('users', { server: { action: 'user:get', meta: userQP } })
        user = resp && resp.response ? resp.response.user : resp && resp.user
      } catch (err) {
        console.log('⚡ err::trips:list-user user:get', err)
      }
      if (!user || !user.rid) {
        return res.status(404).json({ error: 'user_not_found' })
      }

      const archived = !!(meta.archived === true || meta.archived === '1' || meta.archived === 'true')
      const owned = await db.listTrips(user.rid, archived)
      const shared = await db.tripsOfUser(user.rid)
      const ownedRids = new Set((owned || []).map((t) => String(t['@rid'])))
      const all = []
      for (const t of owned || []) all.push(t)
      for (const t of shared || []) {
        if (!ownedRids.has(String(t['@rid']))) all.push(t)
      }
      res.json({ trips: all })
    } catch (err) {
      console.log('⚡ err::trips:list-user', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  /**
   * trips:place-add — добавить место (POI) в поездку. Вызывается по шине из
   * article (путь Б: клик в статье «добавить в поездку») или из maps (путь А).
   * Article шлёт ПОЛНЫЙ снапшот места (name, lat, lng, osm_id/...), trips
   * сохраняет его как вершину Place и линкует к Trip ребром TripPlace.
   *
   * meta:
   *   { user: { rid } }  — кто добавляет (резолв владельца/члена через users:user:get)
   *   { tripId: <_id поездки> }  — во что добавляем
   *   { place: { name, lat, lng, osm_id?, google_place_id?, google_ftid?,
   *              address?, description?, source?, url? } }
   *   (принимается также { tripId } = { rid } если передан RID вида '#...')
   *
   * Ответ: { place: { rid, _id, ...поля } }
   *         { error: 'place-add requires user/tripId/place' } | 'trip_not_found' |
   *         { error: 'forbidden' } (не владелец/член) | 'internal'
   */
  app.action('trips:place-add', async (meta, res) => {
    try {
      const db = await app.options.db
      const u = meta.user || {}
      const rid = meta.rid || u.rid
      const username = meta.username || u.username
      const _id = meta._id || u._id

      if (!rid && !username && !_id) {
        return res.status(400).json({ error: 'place-add requires user (rid|username|_id)' })
      }
      const tripId = meta.tripId
      const placeData = meta.place || {}
      if (!tripId) return res.status(400).json({ error: 'place-add requires tripId' })
      if (!placeData || (!placeData.name && !placeData.lat && !placeData.lng)) {
        return res.status(400).json({ error: 'place-add requires place {name}|{lat,lng}' })
      }
      if (placeData.lat == null || placeData.lng == null) {
        return res.status(400).json({ error: 'place-add requires place {lat,lng}' })
      }

      //  резолв юзера через users user:get
      const userQP = rid ? { rid } : username ? { username } : { _id }
      let user = null
      try {
        const resp = await res.app.ask('users', { server: { action: 'user:get', meta: userQP } })
        user = resp && resp.response ? resp.response.user : resp && resp.user
      } catch (err) {
        console.log('⚡ err::trips:place-add user:get', err)
      }
      if (!user || !user.rid) {
        return res.status(404).json({ error: 'user_not_found' })
      }

      //  найти поездку: tripId может быть _id или RID (#...)
      const trip = /^#\d+:\d+$/.test(String(tripId))
        ? await db.getTrip(String(tripId))
        : await db.getTripById(String(tripId))
      if (!trip) return res.status(404).json({ error: 'trip_not_found' })

      //  проверка права: владелец (ownerRid) или участник/гость
      const isOwner = String(trip.ownerRid) === String(user.rid)
      let isMember = false
      if (!isOwner) {
        const m = await db.isMember(String(trip['@rid']), String(user.rid))
        isMember = !!m
      }
      if (!isOwner && !isMember) {
        return res.status(403).json({ error: 'forbidden' })
      }

      //  создать Place (снапшот) и линковать к Trip
      //  ДЕДУП: если в поездке уже есть место с таким же osm_id (либо с тем же
      //  name+lat+lng при отсутствии osm_id) — не плодить дубликат, вернуть его.
      const existingPlaces = await db.getTripPlaces(String(trip['@rid']))
      const dup = existingPlaces.find((p) => {
        if (placeData.osm_id && p.osm_id) return String(p.osm_id) === String(placeData.osm_id)
        return (
          String(p.name) === String(placeData.name) &&
          Number(p.lat) === Number(placeData.lat) &&
          Number(p.lng) === Number(placeData.lng)
        )
      })
      if (dup) {
        return res.json({ place: { rid: String(dup['@rid'] || dup.rid), _id: String(dup._id) }, duplicated: true })
      }

      const place = await db.createPlace({
        name: placeData.name,
        description: placeData.description || '',
        address: placeData.address || '',
        lat: placeData.lat,
        lng: placeData.lng,
        osm_id: placeData.osm_id || null,
        google_place_id: placeData.google_place_id || null,
        google_ftid: placeData.google_ftid || null,
        source: placeData.source || 'article',
        url: placeData.url || null,
      })
      if (!place) return res.status(500).json({ error: 'place_create_failed' })

      await db.addPlaceToTrip(String(trip['@rid']), place.rid, {
        added_at: new Date().toISOString(),
        added_by: String(user.rid),
        day: placeData.day || null,
        note: placeData.note || null,
        article_id: placeData.article_id || null,
        article_rid: placeData.article_rid || null,
      })

      //  B+C: привязать метку к каноническому GeoObject (эталон места, дедуп
      //  osm_id → name+lat/lng). Даже если фронт не передал GeoObject —
      //  резолвим/создаём по данным места, чтобы топ-запросы работали.
      try {
        const geoRid = await db.findOrCreateGeoObject(placeData)
        if (geoRid) await db.linkPlaceToGeoObject(place.rid, geoRid)
      } catch (err) {
        console.log('⚡ warn::trips:place-add geo-link', err)
      }

      res.json({ place: { rid: place.rid, _id: place._id } })
    } catch (err) {
      console.log('⚡ err::trips:place-add', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  /**
   * trips:top-places — топ объектов к посещению (места, чаще всего
   * встречающиеся в поездках). Считается по графу
   * GeoObject <-hasObject- Place <-TripPlace- Trip (B+C).
   *
   * meta:
   *   { limit: <int> }        — сколько вернуть (по умолч. 10; <=0 → без лимита)
   *   { minTrips: <int> }     — только объекты с >= N поездок (по умолч. 1)
   *   { orderBy: 'trips'|'users'|'places' } — по какой метрике сортировать (по умолч. 'trips')
   *   { fetchUsers: <bool> }  — не используется напрямую; users считается всегда
   *
   * Ответ:
   *   {
   *     top: [
   *       { geo: { rid, name, osm_id, lat, lng, source, url },
   *         trips: <n>, users: <n>, places: <n>,
   *         topTrips: [ { rid, title, ownerRid } ... ] }
   *     ],
   *     total: <n>
   *   }
   */
  app.action('trips:top-places', async (meta, res) => {
    try {
      const db = await app.options.db
      const limit = Number.isInteger(meta.limit) ? meta.limit : 10
      const minTrips = Number.isInteger(meta.minTrips) && meta.minTrips > 0 ? meta.minTrips : 1
      const orderBy = ['users', 'places'].includes(meta.orderBy) ? meta.orderBy : 'trips'

      const top = await db.topGeoObjects(limit, minTrips, orderBy)
      res.json({ top: top || [], total: top ? top.length : 0 })
    } catch (err) {
      console.log('⚡ err::trips:top-places', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  return app
}

export { action }
