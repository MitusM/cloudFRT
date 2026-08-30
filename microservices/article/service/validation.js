// === === === === === === === === === === === ===
// validation.js — централизованная валидация данных МС article
//
// Раньше валидация была вручную в роутах controllers/index.js (проверка
// пустоты title/country/ate, инлайн в switch). Здесь — единые правила полей,
// нормализация и белый список допустимых полей (как в МС destinations).
// === === === === === === === === === === === ===

// Микросервисы, в которые article умеет писать (белый список для create)
export const TABLES = ['Country', 'Territorial', 'City']

// Строковые поля, которые чистим (trim) при создании/обновлении
export const STRING_FIELDS = [
  'title', 'description', 'url', 'keyword', 'country_id', 'main',
]

// Поля, не требующие обработки (передаём как есть)
export const PASSTHROUGH_FIELDS = [
  'id', 'searchable', 'country', 'img_upload',
  'comments', 'like', 'numberViews',           // config → отдельно
  'imageTotalArticle', 'upload_total', 'image', // image
  'folder',
]

/**
 * Провалидировать/очистить входящие поля статьи.
 * Возвращает { ok, errors, obj } — obj безопасен для setCreated/update.
 */
export function validateArticleInput(body) {
  const errors = []
  const obj = {}

  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Пустое тело запроса'], obj }
  }

  // title — обязательное поле (в create без title не сохраняем)
  if (body.title === undefined || typeof body.title !== 'string' || !body.title.trim()) {
    errors.push('title: обязательное поле')
  } else {
    obj.title = { ru: body.title.trim() }
  }

  // Прямые строковые поля, доступные в белом списке
  for (const f of STRING_FIELDS) {
    if (f === 'title') continue
    if (body[f] !== undefined) obj[f] = String(body[f]).trim()
  }

  // Поля «как есть»
  for (const f of PASSTHROUGH_FIELDS) {
    if (f === 'comments' || f === 'like' || f === 'numberViews') continue
    if (f === 'imageTotalArticle' || f === 'upload_total' || f === 'image') continue
    if (body[f] !== undefined) obj[f] = body[f]
  }

  // content — EMBEDDED { ru: ... }
  if (body.content !== undefined) {
    obj.content = { ru: typeof body.content === 'string' ? body.content.trim() : body.content }
  }

  // tags — EMBEDDED { ru: ... }
  if (body.tags !== undefined) {
    obj.tags = { ru: body.tags }
  }

  // config — EMBEDDED { commented, likely, views }
  if (body.comments !== undefined || body.like !== undefined || body.numberViews !== undefined) {
    obj.config = {
      commented: body.comments,
      likely: body.like,
      views: body.numberViews,
    }
  }

  // image — EMBEDDED { folder, total_article, uploaded_total, image }
  if (body.folder !== undefined || body.imageTotalArticle !== undefined ||
      body.upload_total !== undefined || body.image !== undefined) {
    obj.image = {
      folder: typeof body.folder === 'string' ? body.folder.trim() : body.folder,
      total_article: body.imageTotalArticle,
      uploaded_total: body.upload_total,
      image: Array.isArray(body.image) ? body.image.join(', ') : String(body.image),
    }
  }

  if (body.img_upload !== undefined) obj.img_upload = body.img_upload

  return { ok: errors.length === 0, errors, obj }
}
