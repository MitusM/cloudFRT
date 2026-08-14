// === === === === === === === === === === === ===
// Trips controllers — ядро агрегата поездок
// Взято из карты REST-API TREK, пересажено на req.session.auth (cloudFRT)
// === === === === === === === === === === === ===

const endpoints = async (app) => {
  const db = await app.options.db

  //  получить юзера через users user:get (по rid|username|_id)
  const getUser = async (res, meta) => {
    try {
      const resp = await res.app.ask('users', { server: { action: 'user:get', meta } })
      //  ответ {status, response:{user}} либо прямой {user}
      const u = resp && resp.response ? resp.response.user : resp && resp.user
      return u || null
    } catch (err) {
      console.log('⚡ err::user:get', err)
      return null
    }
  }

  //  текущий юзер из сессии: {username, _id, group, rid, ...}
  const me = (req) => req.session.user || null

  //  роль текущего юзера в трипе: 'owner' | 'member' | 'guest' | null
  const roleOf = async (trip, req) => {
    const user = me(req)
    if (!user || !trip) return null
    //  владелец
    if (trip.ownerRid === user.rid || String(trip.ownerRid) === String(user.rid)) return 'owner'
    //  член/гость через ребро
    const edge = await db.isMember(trip['@rid'], user.rid)
    if (!edge) return null
    return edge.is_guest ? 'guest' : 'member'
  }

  //  загрузить трип по :id (стабильный _id или RID), 404 если нет
  const loadTrip = async (req, res) => {
    const id = req.params.id
    //  RID формата #cluster:pos — внутренние вызовы; иначе стабильный _id
    const trip = id
      ? /^#\d+:\d+$/.test(id)
        ? await db.getTrip(id)
        : await db.getTripById(id)
      : null
    if (!trip) {
      res.status(404).json({ error: 'trip_not_found' })
      return null
    }
    return trip
  }

  //  разрешить «:userId» из URL: RID (#x:y) → по rid, иначе по username (fallback _id)
  const resolveUser = (res, key) => {
    if (!key) return null
    return /^#\d+:\d+$/.test(key)
      ? getUser(res, { rid: key })
      : getUser(res, { username: key })
  }

  //  нормализация дат: инференс start/end ±6 дней, end >= start
  const normalizeDates = (start, end) => {
    const d = (s) => (s ? new Date(s) : null)
    let s = d(start)
    let e = d(end)
    const now = new Date()
    if (!s) s = new Date(now.getTime() - 6 * 86400000)
    if (!e) e = new Date(now.getTime() + 6 * 86400000)
    if (e < s) e = new Date(s.getTime() + 6 * 86400000)
    const pad = (n) => String(n).padStart(2, '0')
    const fmt = (dd) => `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`
    return { start_date: fmt(s), end_date: fmt(e) }
  }

  //  ==== GET /trips/ — список трипов юзера (?archived=1) ====
  app.get('/trips/', async (req, res) => {
    try {
      const user = me(req)
      const archived = req.query.archived === '1' || req.query.archived === 'true'
      const owned = await db.listTrips(user.rid, archived)
      //  + трипы, где юзер участник (не владелец)
      const shared = await db.tripsOfUser(user.rid)
      const ownedRids = new Set((owned || []).map((t) => String(t['@rid'])))
      const all = []
      for (const t of owned || []) all.push(t)
      for (const t of shared || []) {
        if (!ownedRids.has(String(t['@rid']))) all.push(t)
      }
      res.json({ trips: all })
    } catch (err) {
      console.log('⚡ err::trips:list', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== POST /trips/ — создать поездку ====
  app.post('/trips/', async (req, res) => {
    try {
      const user = me(req)
      const body = req.body || {}
      if (body.csrf && body.csrf !== req.session.csrfSecret) {
        return res.status(403).json({ error: 'csrf' })
      }
      if (!body.title || !String(body.title).trim()) {
        return res.status(400).json({ error: 'title_required' })
      }
      const dates = normalizeDates(body.start_date, body.end_date)
      const trip = await db.createTrip(
        {
          title: String(body.title).trim(),
          description: body.description || '',
          start_date: dates.start_date,
          end_date: dates.end_date,
          currency: body.currency || 'EUR',
          is_archived: false,
          reminder_days: body.reminder_days != null ? body.reminder_days : 3,
          owner: user._id,
        },
        user.rid,
        new Date().toISOString(),
      )
      if (!trip) {
        return res.status(500).json({ error: 'create_failed' })
      }
      //  владелец сразу становится членом (ребро owner)
      await db.addMember(trip.rid, user.rid, {
        role: 'owner',
        is_guest: false,
        invited_by: user._id,
        added_at: new Date().toISOString(),
      })
      const created = await db.getTrip(trip.rid)
      //  вернуть стабильный _id для ссылок
      if (created) created._id = trip._id
      res.status(201).json({ trip: created })
    } catch (err) {
      console.log('⚡ err::trips:create', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== GET /trips/:id — один трип ====
  app.get('/trips/:id', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (!role) return res.status(403).json({ error: 'forbidden' })
      trip.userRole = role
      res.json({ trip })
    } catch (err) {
      console.log('⚡ err::trips:get', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== PUT /trips/:id — обновить ====
  app.put('/trips/:id', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (role !== 'owner' && role !== 'member') return res.status(403).json({ error: 'forbidden' })
      const body = req.body || {}
      if (body.csrf && body.csrf !== req.session.csrfSecret) {
        return res.status(403).json({ error: 'csrf' })
      }
      const fields = {}
      for (const k of ['title', 'description', 'start_date', 'end_date', 'currency', 'reminder_days']) {
        if (body[k] !== undefined) fields[k] = body[k]
      }
      if (fields.title !== undefined) fields.title = String(fields.title).trim()
      fields.updated_at = new Date().toISOString()
      if (Object.keys(fields).length > 1) {
        await db.updateTrip(trip['@rid'], fields)
      }
      const updated = await db.getTrip(trip['@rid'])
      res.json({ trip: updated })
    } catch (err) {
      console.log('⚡ err::trips:update', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== DELETE /trips/:id — удалить (каскадно убирает членов) ====
  app.delete('/trips/:id', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (role !== 'owner') return res.status(403).json({ error: 'forbidden' })
      await db.deleteTrip(trip['@rid'])
      res.json({ ok: true })
    } catch (err) {
      console.log('⚡ err::trips:delete', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== POST /trips/:id/copy — копия ====
  app.post('/trips/:id/copy', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const user = me(req)
      const role = await roleOf(trip, req)
      if (!role) return res.status(403).json({ error: 'forbidden' })
      const dates = normalizeDates(trip.start_date, trip.end_date)
      const newTrip = await db.createTrip(
        {
          title: trip.title + ' (копия)',
          description: trip.description || '',
          start_date: dates.start_date,
          end_date: dates.end_date,
          currency: trip.currency || 'EUR',
          is_archived: false,
          reminder_days: trip.reminder_days != null ? trip.reminder_days : 3,
          owner: user._id,
        },
        user.rid,
        new Date().toISOString(),
      )
      if (!newTrip) return res.status(500).json({ error: 'create_failed' })
      await db.addMember(newTrip, user.rid, {
        role: 'owner',
        is_guest: false,
        invited_by: user._id,
        added_at: new Date().toISOString(),
      })
      res.status(201).json({ trip: await db.getTrip(newTrip) })
    } catch (err) {
      console.log('⚡ err::trips:copy', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== POST /trips/:id/transfer — передача владения ====
  app.post('/trips/:id/transfer', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const user = me(req)
      const role = await roleOf(trip, req)
      if (role !== 'owner') return res.status(403).json({ error: 'forbidden' })
      const body = req.body || {}
      //  новый владелец: по username|_id|rid
      const target = body.username || body._id || body.rid
      if (!target) return res.status(400).json({ error: 'target_required' })
      const newOwner = await getUser(
        res,
        body.rid ? { rid: body.rid } : body.username ? { username: body.username } : { _id: body._id },
      )
      if (!newOwner) return res.status(404).json({ error: 'user_not_found' })
      //  старый владелец ребро -> member
      const oldEdge = await db.isMember(trip['@rid'], user.rid)
      await db.removeMember(trip['@rid'], user.rid)
      await db.addMember(trip['@rid'], user.rid, {
        role: 'member', is_guest: false, invited_by: newOwner._id, added_at: new Date().toISOString(),
      })
      //  новый владелец: owner + поля
      await db.addMember(trip['@rid'], newOwner.rid, {
        role: 'owner', is_guest: false, invited_by: user._id, added_at: new Date().toISOString(),
      })
      await db.updateTrip(trip['@rid'], {
        owner: newOwner._id,
        ownerRid: newOwner.rid,
        updated_at: new Date().toISOString(),
      })
      res.json({ ok: true })
    } catch (err) {
      console.log('⚡ err::trips:transfer', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== GET /trips/:id/members — участники ====
  app.get('/trips/:id/members', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (!role) return res.status(403).json({ error: 'forbidden' })
      const members = await db.getMembers(trip['@rid'])
      res.json({ members })
    } catch (err) {
      console.log('⚡ err::trips:members:list', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== POST /trips/:id/members — добавить участника ====
  app.post('/trips/:id/members', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const user = me(req)
      const role = await roleOf(trip, req)
      if (role !== 'owner' && role !== 'member') return res.status(403).json({ error: 'forbidden' })
      const body = req.body || {}
      const target = body.username || body._id || body.rid
      if (!target) return res.status(400).json({ error: 'target_required' })
      const targetUser = await getUser(
        res,
        body.rid ? { rid: body.rid } : body.username ? { username: body.username } : { _id: body._id },
      )
      if (!targetUser) return res.status(404).json({ error: 'user_not_found' })
      const edge = await db.addMember(trip['@rid'], targetUser.rid, {
        role: body.role || 'member',
        is_guest: false,
        invited_by: user._id,
        added_at: new Date().toISOString(),
      })
      res.status(201).json({ ok: !!edge })
    } catch (err) {
      console.log('⚡ err::trips:members:add', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== DELETE /trips/:id/members/:userId — убрать участника ====
  app.delete('/trips/:id/members/:userId', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (role !== 'owner') return res.status(403).json({ error: 'forbidden' })
      const targetUser = await resolveUser(res, req.params.userId)
      if (!targetUser) return res.status(404).json({ error: 'user_not_found' })
      await db.removeMember(trip['@rid'], targetUser.rid)
      res.json({ ok: true })
    } catch (err) {
      console.log('⚡ err::trips:members:del', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== POST /trips/:id/guests — пригласить гостя ====
  app.post('/trips/:id/guests', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const user = me(req)
      const role = await roleOf(trip, req)
      if (role !== 'owner' && role !== 'member') return res.status(403).json({ error: 'forbidden' })
      const body = req.body || {}
      const target = body.username || body._id || body.rid || body.email
      if (!target) return res.status(400).json({ error: 'target_required' })
      const targetUser = await getUser(
        res,
        body.rid ? { rid: body.rid } : body.username ? { username: body.username } : { _id: body._id },
      )
      if (!targetUser) return res.status(404).json({ error: 'user_not_found' })
      const edge = await db.addMember(trip['@rid'], targetUser.rid, {
        role: 'guest',
        is_guest: true,
        invited_by: user._id,
        added_at: new Date().toISOString(),
      })
      res.status(201).json({ ok: !!edge })
    } catch (err) {
      console.log('⚡ err::trips:guests:add', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== PUT /trips/:id/guests/:userId — изменить роль ====
  app.put('/trips/:id/guests/:userId', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (role !== 'owner') return res.status(403).json({ error: 'forbidden' })
      const body = req.body || {}
      const targetUser = await resolveUser(res, req.params.userId)
      if (!targetUser) return res.status(404).json({ error: 'user_not_found' })
      //  нужен метод смены роли на ребре
      const edge = await db.isMember(trip['@rid'], targetUser.rid)
      if (!edge) return res.status(404).json({ error: 'not_member' })
      await db.command(
        "UPDATE TripMember SET role='" +
          (body.role || 'guest') +
          "', is_guest=" +
          (body.role === 'member' ? 'false' : 'true') +
          ' WHERE @rid = ' +
          edge['@rid'],
      )
      res.json({ ok: true })
    } catch (err) {
      console.log('⚡ err::trips:guests:role', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== DELETE /trips/:id/guests/:userId — убрать гостя ====
  app.delete('/trips/:id/guests/:userId', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (role !== 'owner') return res.status(403).json({ error: 'forbidden' })
      const targetUser = await resolveUser(res, req.params.userId)
      if (!targetUser) return res.status(404).json({ error: 'user_not_found' })
      await db.removeMember(trip['@rid'], targetUser.rid)
      res.json({ ok: true })
    } catch (err) {
      console.log('⚡ err::trips:guests:del', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== GET /trips/:id/bundle — оффлайн-бандл (ядро) ====
  app.get('/trips/:id/bundle', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (!role) return res.status(403).json({ error: 'forbidden' })
      const members = await db.getMembers(trip['@rid'])
      res.json({ trip, members })
    } catch (err) {
      console.log('⚡ err::trips:bundle', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  //  ==== GET /trips/:id/export.ics — экспорт iCalendar ====
  app.get('/trips/:id/export.ics', async (req, res) => {
    try {
      const trip = await loadTrip(req, res)
      if (!trip) return
      const role = await roleOf(trip, req)
      if (!role) return res.status(403).json({ error: 'forbidden' })
      const fmtDate = (iso) => {
        const d = new Date(iso)
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
      }
      const uid = String(trip['@rid']).replace(/[^a-zA-Z0-9]/g, '') || trip.title
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//cloudFRT//Trips//EN',
        'BEGIN:VEVENT',
        'UID:' + uid + '@cloudfrt',
        'SUMMARY:' + (trip.title || 'Trip').replace(/[\\,;]/g, '\\$&'),
        'DTSTART;VALUE=DATE:' + fmtDate(trip.start_date || new Date()),
        'DTEND;VALUE=DATE:' + fmtDate(trip.end_date || new Date()),
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')
      res.status(200)
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="trip.ics"',
      })
      res.end(ics)
    } catch (err) {
      console.log('⚡ err::trips:export', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  return app
}

export { endpoints }
