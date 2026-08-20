// === === === === === === === === === === === ===
//
// === === === === === === === === === === === ===

import { PDO } from './dbServices.js'

// OrientDB DATETIME требует 'YYYY-MM-DD HH:mm:ss' (local UTC) — ISO не парсит.
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
    let session
    try {
      session = await this.pool.acquire()
      const message = await session.query(query, params).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.queryAll => ModelService.js ', err)
      session?.close()
      return null
    }
  }

  async queryOne(query, params) {
    let session
    try {
      session = await this.pool.acquire()
      const message = await session.query(query, params).one()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.queryOne => ', err)
      session?.close()
      return null
    }
  }

  async command(query, params) {
    let session
    try {
      session = await this.pool.acquire()
      const message = await session.command(query, params).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.command => ', err)
      session?.close()
      return null
    }
  }

  async insert(query, json) {
    let session
    try {
      session = await this.pool.acquire()
      const message = await session.command(query, json).one()
      session.close()
      return { message: message, type: 'insert', done: true }
    } catch (err) {
      console.log('⚡ err::PDO.insert => ', err)
      session?.close()
      return { err: err, done: false }
    }
  }

  // === === === === === === === ===
  // PlacePhotoMeta — мета фото-кэша (аналог SQLite google_place_photo_meta)
  // === === === === === === === ===

  //  Инфо по записи place_id (для get/dereg), или null
  async getPhotoMeta(placeId) {
    try {
      const s = await this.pool.acquire()
      const row = await s
        .query('SELECT FROM PlacePhotoMeta WHERE place_id = :placeId LIMIT 1', {
          params: { placeId },
        })
        .one()
      s.close()
      return row || null
    } catch (err) {
      console.log('⚡ err::getPhotoMeta => ', err)
      return null
    }
  }

  //  Признак «недавняя ошибка» (error_at в пределах TTL). placeId — строка.
  async isPhotoErrored(placeId, ttlMs) {
    const row = await this.getPhotoMeta(placeId)
    if (!row || row.error_at == null) return false
    return Date.now() - Number(row.error_at) < ttlMs
  }

  //  Upsert: положить/обновить инфо (fetched_at) — INSERT OR REPLACE-аналог.
  //  Использует param-подстановку orientjs (безопасно от инъекций).
  async upsertPhotoMeta(placeId, { attribution = null, fetchedAt = Date.now(), errorAt = null } = {}) {
    // Проверяем существование
    const existing = await this.getPhotoMeta(placeId)
    if (existing) {
      const set = []
      const p = { placeId }
      if (attribution !== undefined) { set.push('attribution = :attribution'); p.attribution = attribution }
      if (fetchedAt !== undefined) { set.push('fetched_at = :fetched_at'); p.fetched_at = fetchedAt }
      if (errorAt !== undefined) { set.push('error_at = :error_at'); p.error_at = errorAt }
      if (!set.length) return existing
      const q = 'UPDATE PlacePhotoMeta SET ' + set.join(', ') + ' WHERE place_id = :placeId'
      return this.command(q, { params: p })
    }
    // создаём новую вершину
    const q =
      'CREATE VERTEX PlacePhotoMeta SET place_id = :place_id, attribution = :attribution, fetched_at = :fetched_at, error_at = :error_at'
    return this.insert(q, {
      params: {
        place_id: placeId,
        attribution: attribution ?? null,
        fetched_at: fetchedAt ?? Date.now(),
        error_at: errorAt ?? null,
      },
    })
  }

  //  markError: установить error_at (и сбросить cached)
  async markPhotoError(placeId) {
    return this.upsertPhotoMeta(placeId, { attribution: null, fetchedAt: Date.now(), errorAt: Date.now() })
  }

  //  DELETE по place_id (снять запись)
  async deletePhotoMeta(placeId) {
    return this.command('DELETE VERTEX PlacePhotoMeta WHERE place_id = :placeId', { params: { placeId } })
  }

  //  Все меты (для sweep-подобного прохода) — place_id + error_at
  async allPhotoMeta() {
    return this.queryAll('SELECT place_id, attribution, fetched_at, error_at FROM PlacePhotoMeta')
  }

  //  Проверить, референсится ли место (для eviction). На этапе 4 НЕ вычищаем
  //  фото по референсу (places/collection_places — trips-домен, этап 6).
  //  => всегда true (не удаляем по ref).
  async isPhotoReferenced(placeId) {
    return true
  }
}

export { Model }
