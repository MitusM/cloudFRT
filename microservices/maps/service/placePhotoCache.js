// placePhotoCache — файловый кэш фото мест (JPEG) + мета в OrientDB (PlacePhotoMeta).
// Портировано из TREK server/src/services/placePhotoCache.ts.
// Адаптация: вместо SQLite google_place_photo_meta — OrientDB-класс PlacePhotoMeta (async-зеркало).
// isReferenced (places/collection_places) на этапе 4 не проверяем — всегда true (не вычищаем по реф).
import { Jimp, JimpMime } from 'jimp'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'

// Директория кэша фото (переопределяема для тестов). По умолчанию — uploads/photos/google внутри МС maps.
const photoRoot = path.dirname(new URL(import.meta.url).pathname)
const GOOGLE_PHOTO_DIR =
  process.env.TREK_PLACE_PHOTO_DIR || path.join(photoRoot, '../../uploads/photos/google')
const ERROR_TTL = 5 * 60 * 1000

const MAX_DIM = 800
const JPEG_QUALITY = 80

// In-flight dedup — предотвращает стампеды на один placeId.
const inFlight = new Map()

// In-memory set placeId -> файл подтверждён на диске (эта сессия).
const knownOnDisk = new Set()

// In-memory мета: placeId -> { attribution, error_at }. Синхронное зеркало для get().
// OrientDB (PlacePhotoMeta) — персистентное async-зеркало, пишется в put/markError.
const metaCache = new Map()

// Ссылка на Model с OrientDB-методами (ставится после инициализации МС).
export function setDb(db) {
  // db — экземпляр Model (список методов: getPhotoMeta, upsertPhotoMeta, markPhotoError, deletePhotoMeta)
  _DB = db
}
let _DB = null

// Загрузить мету из OrientDB в память при старте (async). Вызывается после connect.
export async function loadMetaFromDb() {
  if (!_DB) return
  try {
    const rows = await _DB.allPhotoMeta()
    for (const r of rows || []) {
      metaCache.set(r.place_id, {
        attribution: r.attribution ?? null,
        error_at: r.error_at != null ? Number(r.error_at) : null,
      })
    }
  } catch (e) {
    console.log('⚡ err::placePhotoCache.loadMetaFromDb', e)
  }
}

try {
  fs.mkdirSync(GOOGLE_PHOTO_DIR, { recursive: true })
} catch {
  /* already exists */
}

function filePath(placeId) {
  const hash = crypto.createHash('sha1').update(placeId).digest('hex')
  return path.join(GOOGLE_PHOTO_DIR, `${hash}.jpg`)
}

function proxyUrl(placeId) {
  return `/api/maps/place-photo/${encodeURIComponent(placeId)}/bytes`
}

const metaOf = (placeId) => metaCache.get(placeId) || null

export function get(placeId) {
  const row = metaOf(placeId)
  // Запись есть, но с error_at — не «кэшированный» (это ошибка)
  if (!row || row.error_at != null) return null

  const fp = filePath(placeId)
  if (!knownOnDisk.has(placeId)) {
    if (!fs.existsSync(fp)) {
      metaCache.delete(placeId)
      return null
    }
    knownOnDisk.add(placeId)
  }
  return { photoUrl: proxyUrl(placeId), filePath: fp, attribution: row.attribution }
}

export function getErrored(placeId) {
  const row = metaOf(placeId)
  if (!row || row.error_at == null) return false
  return Date.now() - row.error_at < ERROR_TTL
}

export function markError(placeId) {
  knownOnDisk.delete(placeId)
  metaCache.set(placeId, { attribution: null, error_at: Date.now() })
  // async-зеркало в OrientDB
  if (_DB) _DB.markPhotoError(placeId).catch(() => {})
}

async function downscale(bytes) {
  try {
    const img = await Jimp.read(bytes)
    if (img.bitmap.width <= MAX_DIM && img.bitmap.height <= MAX_DIM) return bytes
    img.scaleToFit({ w: MAX_DIM, h: MAX_DIM })
    return await img.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY })
  } catch {
    return bytes
  }
}

export async function put(placeId, bytes, attribution) {
  const fp = filePath(placeId)
  const tmp = fp + '.tmp'

  const resized = await downscale(bytes)
  await fsPromises.writeFile(tmp, resized)
  await fsPromises.rename(tmp, fp)

  knownOnDisk.add(placeId)
  metaCache.set(placeId, { attribution, error_at: null })

  if (_DB) {
    _DB.upsertPhotoMeta(placeId, { attribution, fetchedAt: Date.now(), errorAt: null }).catch(() => {})
  }

  return { photoUrl: proxyUrl(placeId), filePath: fp, attribution }
}

export function getInFlight(placeId) {
  return inFlight.get(placeId)
}

export function setInFlight(placeId, promise) {
  inFlight.set(placeId, promise)
  promise
    .finally(() => inFlight.delete(placeId))
    .catch(() => {
      /* awaiter logs */
    })
}

export function serveFilePath(placeId) {
  if (knownOnDisk.has(placeId)) return filePath(placeId)
  const fp = filePath(placeId)
  if (!fs.existsSync(fp)) return null
  knownOnDisk.add(placeId)
  return fp
}

// Удалить кэш-запись по placeId (мета + файл). На этапе 4 вызов извне не активен.
export function removeIfUnreferenced(placeId) {
  if (!_DB) return
  _DB.isPhotoReferenced(placeId).then((ref) => {
    if (ref) return
    deleteEntry(placeId)
  })
}

function deleteEntry(placeId) {
  try {
    fs.unlinkSync(filePath(placeId))
    knownOnDisk.delete(placeId)
  } catch {
    /* already gone */
  }
  metaCache.delete(placeId)
  knownOnDisk.delete(placeId)
  if (_DB) _DB.deletePhotoMeta(placeId).catch(() => {})
}
