// === === === === === === === === === === === ===
// Кэш OG-картинок поездок (disk-based).
//
// Серверный рендер OG-превью (maps:og -> headless Chromium) стоит ~6-25с на
// запрос (пересоздание браузера + загрузка тайлов). Чтобы соцсети/краулеры и
// реальные пользователи не получали такой лаг, готовый PNG кладём на диск и
// отдаём из кэша. Инвалидация — при изменении трипа/мест и по TTL.
//
// Хранение: <appRoot>/og-cache/<tripId>.png
// (скрытая рабочая папка cloudFRT, дисковая, переживает рестарт сервиса).
// === === === === === === === === === === === ===
import path from 'path'
import fsp from 'fs/promises'
import pkg from 'app-root-path'
import dotenv from 'dotenv'

dotenv.config()
const appRoot = pkg.path

// TTL по умолчанию: 7 дней. OG-превью не меняется, пока не меняется трип/места;
// отдельная инвалидация срабатывает при изменении (PUT /trips/:id, place-add).
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function cacheDir() {
  return path.join(appRoot, process.env.OG_CACHE_DIR || 'og-cache')
}

function cachePath(tripId) {
  // tripId — стабильный _id (не @rid), безопасен для имени файла
  const safe = String(tripId).replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(cacheDir(), `${safe}.png`)
}

/**
 * Получить готовый PNG из кэша, если он есть и не протух.
 * @param {string} tripId
 * @param {object} [opts] @param {number} [opts.ttlMs]
 * @returns {Promise<Buffer|null>} PNG-байты или null
 */
export async function getOgCache(tripId, opts = {}) {
  try {
    const ttlMs = Number(opts.ttlMs) || DEFAULT_TTL_MS
    const p = cachePath(tripId)
    const st = await fsp.stat(p)
    if (Date.now() - st.mtimeMs > ttlMs) return null // протух — как кэш-промах
    return await fsp.readFile(p)
  } catch (e) {
    return null
  }
}

/**
 * Положить готовый PNG в кэш.
 * @param {string} tripId
 * @param {Buffer} buffer PNG-байты
 */
export async function setOgCache(tripId, buffer) {
  try {
    await fsp.mkdir(cacheDir(), { recursive: true })
    await fsp.writeFile(cachePath(tripId), buffer)
  } catch (e) {
    console.log('⚡ maps: og-cache write fail', e && e.message)
  }
}

/**
 * Инвалидировать кэш OG-картинки поездки (при изменении трипа/мест).
 * @param {string} tripId
 */
export async function clearOgCache(tripId) {
  try {
    await fsp.rm(cachePath(tripId), { force: true })
  } catch (e) {
    console.log('⚡ maps: og-cache clear fail', e && e.message)
  }
}
