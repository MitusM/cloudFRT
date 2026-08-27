// === === === === === === === === === === === ===
// geoToken — подписанный HMAC-токен для публичных гео-эндпоинтов карты
// (geocode/pois). Поверх rate-limit (Redis) и проверки Origin/Referer.
//
// Зачем: все гео-источники maps СТОРОННИЕ хостинг-API (Nominatim/Overpass)
// с дефицитными демо-лимитами. Прямой долбёж /maps/geocode жжёт чужую квоту
// → бан IP у провайдера → карта ломается всем. Origin/Referer подделывается,
// а отсутствие заголовка вообще пропускается. Токен — жёсткий рубеж: скрипт
// без реальной загрузки страницы + сессии не получит валидный HMAC.
//
// Формат токена: <base64url(expMs)>.<base64url(hmac)>
//   hmac = HMAC-SHA256(secret, `${sessionId}|${ip}|${expMs}`)
// Привязка сессия+IP: токен не переиспользовать с другого IP/сессии.
// TTL задаётся при подписи (по умолчанию 5 мин), проверяется при verify.
//
// Встраивается в window._frtMapToken на страницах /maps/ и /maps/map;
// клиентский fetch geocode/pois шлёт его в заголовке X-Maps-Token.
// === === === === === === === === === === === ===
import crypto from 'crypto'

// Секрет подписи. Приоритет: MAPS_TOKEN_SECRET, фолбэк — ENCRYPTION_KEY
// (детерминированный, не меняется между рестартами). Если нет обоих —
// НЕ генерируем на лету (сломало бы проверку между рестартами), а возвращаем
// null и публичные гео-эндпоинты с токеном просто не защищаются (fail-open).
// Но на проде MAPS_TOKEN_SECRET должен быть задан (см. .env.example).
function getSecret() {
  return process.env.MAPS_TOKEN_SECRET || process.env.ENCRYPTION_KEY || null
}

// Base64url без паддинга (для в URL/заголовке).
function b64u(buf) {
  return Buffer.from(buf).toString('base64url')
}
function b64uDecode(s) {
  return Buffer.from(s, 'base64url')
}

// Подписать токен. nowMs — для тестов/клиентского смещения (по умолчанию Date.now()).
function signToken({ sessionId, ip, secret, ttlMs = 5 * 60 * 1000, nowMs = Date.now() }) {
  const expMs = nowMs + ttlMs
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${sessionId}|${ip}|${expMs}`)
    .digest()
  return `${b64u(String(expMs))}.${b64u(mac)}`
}

// Проверить токен. Спокойно возвращает boolean, ничего не бросает.
// Проверяет: формат, валидный exp (число, не истёк), MAC и привязку к сессии/IP.
function verifyToken(token, { sessionId, ip, secret, nowMs = Date.now() }) {
  if (!token || !secret || typeof token !== 'string') return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expB64 = token.slice(0, dot)
  const macB64 = token.slice(dot + 1)
  // exp должен быть валидным числом
  let expMs = NaN
  try {
    expMs = Number(b64uDecode(expB64).toString())
  } catch (e) {
    return false
  }
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false // истёк/мусор

  // Проверка MAC с константным временем
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${sessionId}|${ip}|${expMs}`)
    .digest()
  let supplied = null
  try {
    supplied = b64uDecode(macB64)
  } catch (e) {
    return false
  }
  if (!supplied || supplied.length !== expected.length) return false
  return crypto.timingSafeEqual(expected, supplied)
}

export { signToken, verifyToken, getSecret }
