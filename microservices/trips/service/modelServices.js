// === === === === === === === === === === === ===
//
// === === === === === === === === === === === ===

import { PDO } from './dbServices.js'
import { nanoid } from 'nanoid'

// OrientDB (3.x) DATETIME требует формат 'YYYY-MM-DD HH:mm:ss' (local UTC).
// ISO-строки вида '2026-08-14T06:28:35.308Z' он не парсит.
function toOrientDate(value) {
  if (!value) return value
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

class Model extends PDO {
  constructor(options) {
    super(options)
  }

  async queryAll(query, params) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query, params).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.queryAll => ModelService.js:19 ', err)
      throw err
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
      throw err
    }
  }

  async queryRid(query) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query).one()
      session.close()
      return message
    } catch (err) {
      return err
    }
  }

  liveQuery(options) {}

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
      return { err: err, done: false }
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

  // === === === === === === === === ===
  // Trip (вершина)
  // === === === === === === === === ===

  getAll = () => {
    return this.queryAll('SELECT FROM Trip')
  }

  //  Список трипов владельца (опционально только архивные)
  listTrips(ownerRid, archived) {
    if (archived) {
      return this.queryAll(
        'SELECT FROM Trip WHERE ownerRid = :rid AND is_archived = true',
        { params: { rid: ownerRid } },
      )
    }
    return this.queryAll(
      'SELECT FROM Trip WHERE ownerRid = :rid ORDER BY created_at DESC',
      { params: { rid: ownerRid } },
    )
  }

  //  Одна поездка по RID
  getTrip(rid) {
    return this.queryOne('SELECT FROM Trip WHERE @rid = ' + rid)
  }

  //  Поиск поездки по стабильному _id (для URL, RID нестабилен при экспорте и содержит '#')
  getTripById(id) {
    return this.queryOne("SELECT FROM Trip WHERE _id = '" + id + "'")
  }

  //  Создать поездку (вершину). Возвращает { rid, _id }
  async createTrip(obj, ownerRid, created) {
    obj.ownerRid = ownerRid
    obj._id = obj._id || nanoid(21)
    obj.created_at = toOrientDate(created)
    obj.updated_at = toOrientDate(created)
    const q =
      'CREATE VERTEX Trip SET title=:title, description=:description, ' +
      'start_date=:start_date, end_date=:end_date, currency=:currency, ' +
      'is_archived=:is_archived, reminder_days=:reminder_days, ' +
      '_id=:_id, owner=:owner, ownerRid=:ownerRid, created_at=:created_at, updated_at=:updated_at'
    const res = await this.insert(q, { params: { ...obj } })
    if (res.done && res.message) {
      return {
        rid: String(res.message['@rid']),
        _id: String(obj._id),
      }
    }
    return null
  }

  //  Update: безопасно конвертим даты (если переданы) в OrientDB-формат
  updateTrip(rid, fields) {
    const f = { ...fields }
    ;['created_at', 'updated_at', 'added_at'].forEach((k) => {
      if (f[k] !== undefined) f[k] = toOrientDate(f[k])
    })
    const set = Object.keys(f)
      .map((k) => k + '=:' + k)
      .join(', ')
    return this.insert(
      'UPDATE Trip SET ' + set + ' WHERE @rid = ' + rid,
      { params: { ...f } },
    )
  }

  //  Удалить поездку (каскадно убирает TripMember)
  deleteTrip(rid) {
    return this.command('DELETE VERTEX Trip WHERE @rid = ' + rid)
  }

  // === === === === === === === === ===
  // TripMember (ребро Trip-[TripMember]->User)
  // === === === === === === === === ===

  //  Участники поездки: рёбра с полем user (in)
  async getMembers(tripRid) {
    const edges = await this.queryAll(
      "SELECT out, in, role, is_guest, invited_by, added_at FROM TripMember WHERE out = " +
        tripRid,
    )
    if (!edges) return []
    //  рёбра дают in (User RID) — это участники
    return edges.map((e) => ({
      userRid: e.in,
      role: e.role,
      is_guest: !!e.is_guest,
      invited_by: e.invited_by,
      added_at: e.added_at,
    }))
  }

  //  Добавить участника/гостя ребром
  async addMember(tripRid, userRid, obj) {
    const params = { ...obj }
    if (params.added_at !== undefined) params.added_at = toOrientDate(params.added_at)
    const res = await this.insert(
      'CREATE EDGE TripMember FROM ' +
        tripRid +
        ' TO ' +
        userRid +
        ' SET role=:role, is_guest=:is_guest, invited_by=:invited_by, added_at=:added_at',
      { params },
    )
    return res.done ? res.message : null
  }

  //  Удалить участника/гостя ребром
  removeMember(tripRid, userRid) {
    return this.command(
      'DELETE EDGE TripMember WHERE out = ' +
        tripRid +
        ' AND in = ' +
        userRid,
    )
  }

  //  Проверить членство юзера в трипе: рёбра out=trip and in=user
  async isMember(tripRid, userRid) {
    const edges = await this.queryAll(
      'SELECT FROM TripMember WHERE out = ' +
        tripRid +
        ' AND in = ' +
        userRid,
    )
    return edges && edges.length > 0 ? edges[0] : null
  }

  //  Все поездки, где юзер участник (графовый обход от User)
  tripsOfUser(userRid) {
    return this.queryAll(
      "SELECT FROM (SELECT expand(out('TripMember')) FROM Trip) " +
        "WHERE @rid IN (SELECT expand(in('TripMember')) FROM User WHERE @rid = " +
        userRid +
        ')',
    )
  }

  // === === === === === === === === ===
  // Place (вершина) + ребро Trip─Place
  // === === === === === === === === ===
  // Вершина Place — снапшот места (POI) внутри поездки. Поля копируются из
  // статьи (путь Б) или из maps-поиска (путь А) в момент добавления, чтобы
  // метка оставалась осмысленной даже если источник (OSM/статья) изменится.
  // location: OPoint через ST_GeomFromText("POINT(lon lat)") — единообразно с article.

  //  Создать Place (вершину). Возвращает { rid, _id } или null.
  //  ВАЖНО: location НЕ храним как spatial OPoint. orientjs (клиентская либа,
  //  через которую trips ходит в OrientDB) не умеет вставлять ST_GeomFromText —
  //  падает «Document belongs to abstract class 'OPoint' and cannot be saved»
  //  (проверено изолированно; REST умеет, orientjs нет). Для снапшота места
  //  достаточно плоских полей lat/lng (нужны для MapLibre-карты); spatial-
  //  поиск мест в поездке не нужен (места выбираются по рёбрам Trip─Place).
  async createPlace(obj) {
    const p = { ...obj }
    p._id = p._id || nanoid(21)
    p.created_at = toOrientDate(p.created_at || new Date())
    const q =
      'CREATE VERTEX Place SET ' +
      'name=:name, description=:description, address=:address, ' +
      'lat=:lat, lng=:lng, osm_id=:osm_id, google_place_id=:google_place_id, ' +
      'google_ftid=:google_ftid, source=:source, url=:url, _id=:_id, created_at=:created_at'
    const res = await this.insert(q, {
      params: {
        name: p.name,
        description: p.description,
        address: p.address,
        lat: Number(p.lat),
        lng: Number(p.lng),
        osm_id: p.osm_id,
        google_place_id: p.google_place_id,
        google_ftid: p.google_ftid,
        source: p.source,
        url: p.url,
        _id: p._id,
        created_at: p.created_at,
      },
    })
    if (res.done && res.message) {
      return {
        rid: String(res.message['@rid']),
        _id: String(p._id),
      }
    }
    return null
  }

  //  Добавить место в поездку ребром Trip-[TripPlace]->Place
  //  article_id (стабильный ключ Article.id) и article_rid (#CLUSTER:RID) —
  //  связка поездки со статьёй-источником (вариант B+C).
  async addPlaceToTrip(tripRid, placeRid, obj) {
    const params = { ...obj }
    if (params.added_at !== undefined) params.added_at = toOrientDate(params.added_at)
    const res = await this.insert(
      'CREATE EDGE TripPlace FROM ' +
        tripRid +
        ' TO ' +
        placeRid +
        ' SET added_at=:added_at, added_by=:added_by, day=:day, note=:note, ' +
        'article_id=:article_id, article_rid=:article_rid',
      { params },
    )
    return res.done ? res.message : null
  }

  //  Места поездки (обход от Trip по ребру TripPlace)
  async getTripPlaces(tripRid) {
    const edges = await this.queryAll(
      'SELECT out, in, added_at, added_by, day, note, article_id, article_rid FROM TripPlace WHERE out = ' +
        tripRid,
    )
    if (!edges) return []
    // рёбра дают in (Place RID) — это места поездки
    const out = []
    for (const e of edges) {
      const place = await this.getPlace(e.in)
      if (place) out.push({ ...place, added_at: e.added_at, added_by: e.added_by, day: e.day, note: e.note, article_id: e.article_id, article_rid: e.article_rid })
    }
    return out
  }

  //  Найти канонический GeoObject места (дедуп): сначала по osm_id,
  //  фолбэк — по name+lat+lng. Создать, если нет. Возвращает rid GeoObject.
  async findOrCreateGeoObject(placeObj) {
    const lat = Number(placeObj.lat)
    const lng = Number(placeObj.lng)
    let existing = null
    if (placeObj.osm_id) {
      const hit = await this.queryOne(
        "SELECT @rid FROM GeoObject WHERE osm_id = '" +
          String(placeObj.osm_id).replace(/'/g, "''") + "' LIMIT 1",
      )
      if (hit && hit['@rid']) existing = hit['@rid']
    }
    if (!existing && !Number.isNaN(lat) && !Number.isNaN(lng) && placeObj.name) {
      const hit = await this.queryAll(
        'SELECT @rid FROM GeoObject WHERE name = :name AND lat = :lat AND lng = :lng LIMIT 1',
        { params: { name: placeObj.name, lat, lng } },
      )
      if (hit && hit.length && hit[0]['@rid']) existing = hit[0]['@rid']
    }
    if (existing) return String(existing)
    // не найден — создаём канонічний GeoObject (снапшот места)
    const g = {
      name: placeObj.name,
      lat,
      lng,
      osm_id: placeObj.osm_id || null,
      google_place_id: placeObj.google_place_id || null,
      google_ftid: placeObj.google_ftid || null,
      url: placeObj.url || null,
      source: placeObj.source || 'article',
      created_at: toOrientDate(new Date()),
    }
    const created = await this.insert(
      'CREATE VERTEX GeoObject SET ' +
        'name=:name, lat=:lat, lng=:lng, osm_id=:osm_id, ' +
        'google_place_id=:google_place_id, google_ftid=:google_ftid, ' +
        'url=:url, source=:source, created_at=:created_at',
      { params: g },
    )
    if (created.done && created.message) return String(created.message['@rid'])
    return null
  }

  //  Ребро Place-[hasObject]->GeoObject (привязка метки к эталонному объекту)
  async linkPlaceToGeoObject(placeRid, geoRid) {
    if (!placeRid || !geoRid) return null
    const res = await this.insert(
      'CREATE EDGE hasObject FROM ' + placeRid + ' TO ' + geoRid,
      {},
    )
    return res.done ? res.message : null
  }

  //  Одно место по RID
  getPlace(rid) {
    return this.queryOne('SELECT FROM Place WHERE @rid = ' + rid)
  }

  //  Поиск места по стабильному _id
  getPlaceById(id) {
    return this.queryOne("SELECT FROM Place WHERE _id = '" + id + "'")
  }

  //  Убрать место из поездки (удалить ребро; саму вершину Place можно удалить отдельно)
  removePlaceFromTrip(tripRid, placeRid) {
    return this.command(
      'DELETE EDGE TripPlace WHERE out = ' + tripRid + ' AND in = ' + placeRid,
    )
  }

  // === === === === === === === === ===
  // Топ-объекты (места к посещению) — B+C
  // === === === === === === === === ===
  // Агрегируем по графу GeoObject<-hasObject-Place<-TripPlace-Trip.
  // Для каждого GeoObject считаем: сколько Place-меток (in_hasObject),
  // в скольких поездках (уникальные Trip через двойной in()), у скольких
  // уникальных пользователей (ownerRid этих Trip). Возвращает топ, отсор­
  // тированный по выбранной метрике и урезанный лимитом.
  //
  // orderBy: 'trips' (default) | 'users' | 'places'
  // Используем проверенные обходы (не проекцию in() в SELECT — orientjs её
  // не всегда корректно отдаёт; надёжнее отдельные query по @rid).
  async topGeoObjects(limit = 10, minTrips = 1, orderBy = 'trips') {
    let geos = []
    try {
      geos = await this.queryAll(
        'SELECT @rid AS geoRid, name AS geoName, osm_id, lat, lng, source, url FROM GeoObject',
      )
    } catch (err) {
      console.log('⚡ err::topGeoObjects fetch geos', err)
      return []
    }
    if (!geos || !geos.length) return []

    const out = []
    for (const g of geos) {
      // 1) входящие Place (места-метки на этот объект) — проверенный обход
      let places = []
      try {
        places = await this.queryAll(
          "SELECT expand(in('hasObject')) FROM GeoObject WHERE @rid = " +
            String(g.geoRid || g['@rid']),
        )
      } catch (err) {
        console.log('⚡ err::topGeoObjects places-for-geo', err)
        places = []
      }
      if (!places || !places.length) continue

      const tripRids = new Set()
      const ownerRids = new Set()
      const topTrips = []
      // 2) для каждого Place — его поездки (in('TripPlace'))
      for (const pl of places) {
        let trips = []
        try {
          trips = await this.queryAll(
            "SELECT @rid, title, ownerRid FROM (SELECT expand(in('TripPlace')) FROM Place WHERE @rid = " +
              String(pl['@rid'] || pl.rid) + ')',
          )
        } catch (err) {
          console.log('⚡ err::topGeoObjects trips-for-place', err)
          trips = []
        }
        for (const t of trips || []) {
          const rrid = String(t['@rid'])
          if (rrid && !tripRids.has(rrid)) {
            tripRids.add(rrid)
            topTrips.push({ rid: rrid, title: t.title, ownerRid: t.ownerRid ? String(t.ownerRid) : null })
          }
          if (t.ownerRid) ownerRids.add(String(t.ownerRid))
        }
      }

      const tripsCount = tripRids.size
      if (tripsCount < minTrips) continue
      out.push({
        geo: {
          rid: String(g.geoRid || g['@rid']),
          name: g.geoName,
          osm_id: g.osm_id || null,
          lat: g.lat,
          lng: g.lng,
          source: g.source || null,
          url: g.url || null,
        },
        trips: tripsCount,
        users: ownerRids.size,
        places: places.length,
        topTrips,
      })
    }

    // сортировка по выбранной метрике (ти-брейк: trips desc, затем name)
    const key = orderBy === 'users' ? 'users' : orderBy === 'places' ? 'places' : 'trips'
    out.sort((a, b) => {
      if (b[key] !== a[key]) return b[key] - a[key]
      if (b.trips !== a.trips) return b.trips - a.trips
      return String(a.geo.name || '').localeCompare(String(b.geo.name || ''))
    })

    const n = Number.isInteger(limit) && limit > 0 ? limit : out.length
    return out.slice(0, n)
  }
}

export { Model }
