// === === === === === === === === === === === ===
// validation.js — валидация данных узлов Dest (админ-CRUD)
//
// Бест-практика в отличие от МС article (где валидация вручную в роутах,
// без нормализации/без списка допустимых полей):
//   - централизованная валидация,
//   - нормализация slug (латиница/цифры/дефис, проверка формата),
//   - список допустимых уровней,
//   - экранирование/санитизация ввода.
// === === === === === === === === === === === ===

export const LEVELS = ['country', 'region', 'place', 'attraction']

// Допустимые поля для создания/обновления
// (status НЕ редактируется формой — меняется отдельным эндпоинтом publish;
//  он принят здесь только для внутренних вызовов/API.)
export const FIELDS = [
  'slug', 'title', 'h1', 'level', 'description', 'content',
  'lat', 'lng', 'image', 'is_hub', 'priority', 'parentRid', 'status',
]

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Нормализовать slug: lower, пробелы→дефис, транслит уже сделан на клиенте */
export function normalizeSlug(raw) {
  if (typeof raw !== 'string') return null
  let s = raw.trim().toLowerCase()
  s = s.replace(/\s+/g, '-')
  s = s.replace(/[^a-z0-9-]/g, '')
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return s || null
}

/** Валидировать slug по формату */
export function validateSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug)
}

/**
 * Провалидировать входящие поля. Возвращает { ok, errors, clean }.
 * clean — безопасный объект для createDest/updateDest (отфильтрован по FIELDS).
 */
export function validateDestInput(body, { requireTitle = true, levelRequired = false } = {}) {
  const errors = []
  const clean = {}

  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Пустое тело запроса'], clean }
  }

  // slug — обязателен при создании, опционален при обновлении (если передан — валидный)
  if (body.slug !== undefined) {
    const s = normalizeSlug(body.slug)
    if (!s || !validateSlug(s)) {
      errors.push('slug: только латиница, цифры и дефис (a-z, 0-9, -)')
    } else {
      clean.slug = s
    }
  }

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      if (requireTitle) errors.push('title: обязательное поле')
    } else {
      clean.title = body.title.trim()
    }
  } else if (requireTitle) {
    errors.push('title: обязательное поле')
  }

  if (body.h1 !== undefined) clean.h1 = String(body.h1).trim()

  if (body.level !== undefined) {
    if (!LEVELS.includes(body.level)) {
      errors.push(`level: должно быть одно из: ${LEVELS.join(', ')}`)
    } else {
      clean.level = body.level
    }
  } else if (levelRequired) {
    clean.level = 'place'
  }

  if (body.description !== undefined) clean.description = String(body.description)
  if (body.content !== undefined) clean.content = body.content
  if (body.image !== undefined) clean.image = String(body.image)

  if (body.lat !== undefined && body.lng !== undefined) {
    const lat = parseFloat(body.lat)
    const lng = parseFloat(body.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      errors.push('coordinates: lat ∈ [-90,90], lng ∈ [-180,180]')
    } else {
      clean.lat = lat
      clean.lng = lng
    }
  }

  if (body.is_hub !== undefined) clean.is_hub = !!body.is_hub
  if (body.priority !== undefined) {
    const p = parseFloat(body.priority)
    if (Number.isNaN(p) || p < 0 || p > 1) {
      errors.push('priority: число в диапазоне [0,1]')
    } else {
      clean.priority = p
    }
  }

  // status: только 'draft' | 'published' (иначе игнорируем → останется как есть)
  if (body.status !== undefined) {
    if (body.status === 'published' || body.status === 'draft') clean.status = body.status
  }

  // parentRid: null/пусто → null (корень); иначе — строка RID
  if (body.parentRid !== undefined) {
    clean.parentRid =
      body.parentRid === null || body.parentRid === '' ? null : String(body.parentRid)
  }

  return { ok: errors.length === 0, errors, clean }
}
