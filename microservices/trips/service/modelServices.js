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
      console.log('⚡ query::', query)
      console.log('⚡ params::', params)
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
}

export { Model }
