// === === === === === === === === === === === ===
// controllers/index.js — эндпоинты upload-МС uploads (cloudFRT)
//
// Единая точка загрузки изображений (приём multipart + webp-конвейер + delete)
// для всех микросервисов, которые грузят картинки (destinations — первый).
//
// HTTP :7620 (за nginx location frt.su) + Rabbit-шина: один и тот же набор
// роутов обрабатывается и по HTTP, и через очередь uploads:requests.
// Файлы НЕ ходят по шине — только через HTTP+JSON; по шине uploads слушает
// RPC-действия (app.action) и сам ходит ask() к auth/users для прав.
//
// Эндпоинты:
//   POST   /upload/:microservice-:mi  → приём multipart, webp-конвейер, JSON путей
//   DELETE /delete-image              → удаление файлов по списку путей (csrf)
//   RPC    uploads:ping / uploads:health — действия на шине (для других МС)
//
// ВАЖНО про диск: uploads запускается из microservices/uploads/ → process.cwd()
// != корень cloudFRT. Тут НЕЛЬЗЯ использовать gateway core/upload (он пишет по
// process.cwd()): весь приём пишет original по абсолютному пути app-root через
// класс File (core/cloud) — общий диск cloudFRT/images/... (nginx отдаёт /images/*),
// независимо от cwd.
// === === === === === === === === === === === ===
import 'dotenv/config'
import Busboy from 'busboy'
import fs from 'fs'
import path from 'path'
import pkg from 'app-root-path'
import dotenv from 'dotenv'
import File from '../core/images/index.js'
import { csrfOk, authGuard } from '../service/csrf.js'

const appRoot = pkg.path
dotenv.config()

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/images/'

// Вспомогательный: абсолютный путь папки в корне cloudFRT (без cwd).
const absFolder = (rel) =>
  rel
    .replace(/^\//, '')
    .replace(/\/$/, '')

const upload = async (req, res, appRootLocal, UPLOAD_DIR_LOCAL) => {
  const ms = req.params && req.params.microservice
  const mi = req.params && req.params.mi
  if (!ms || !mi) {
    return { status: 400, message: 'Параметры /:microservice-:mi обязательны' }
  }

  const base = `${UPLOAD_DIR_LOCAL}${ms}/${mi}`
  const originalFolder = `${base}/original/`
  const webpFolder = `${base}/webp/`
  const resizeFolder = `${base}/resize/`

  // --- Приём multipart через busboy (original → общий диск) ---
  const parsed = await new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers })
    const outFields = {}
    const savedFiles = []
    let settled = false
    const done = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve({ fields: outFields, files: savedFiles })
    }

    const finishField = (name, val) => {
      if (outFields[name] === undefined) outFields[name] = val
      else if (Array.isArray(outFields[name])) outFields[name].push(val)
      else outFields[name] = [outFields[name], val]
    }

    const filePromises = []

    bb.on('field', finishField)
    bb.on('error', done)
    bb.on('partsLimit', () => done(new Error('partsLimit')))
    bb.on('filesLimit', () => done(new Error('filesLimit')))
    bb.on('close', async () => {
      // Ждём завершения записи ВСЕХ файловых стримов, потом резолвим.
      try {
        await Promise.all(filePromises)
        done()
      } catch (e) {
        done(e)
      }
    })

    bb.on('file', (fieldname, file, filename) => {
      const origName = filename && (filename.filename || filename) || `file-${Date.now()}`

      const safeBase = path.basename(String(origName))
      const { ext, name } = path.parse(safeBase)
      const absDir = path.join(appRootLocal, absFolder(originalFolder))

      let fname = safeBase
      try {
        fs.mkdirSync(absDir, { recursive: true })
      } catch (e) {
        file.resume()
        filePromises.push(Promise.reject(e))
        return
      }
      let abs = path.join(absDir, fname)
      if (fs.existsSync(abs)) {
        fname = `${name}-${Math.random().toString(36).substring(2)}${ext}`
        abs = path.join(absDir, fname)
      }

      const ws = fs.createWriteStream(abs, { mode: 0o644 })
      const filePromise = new Promise((resolve, reject) => {
        ws.on('error', reject)
        ws.on('finish', () => {
          const rel = `${base}/original/${fname}`
          savedFiles.push({
            fieldname,
            filename: fname,
            originalName: safeBase,
            path: rel.startsWith('/') ? rel : `/${rel}`,
            isAbsolute: abs,
            folder: `/${originalFolder}`,
            resize: `/${resizeFolder}`,
            webpFolder: `/${webpFolder}`,
          })
          resolve()
        })
      })
      filePromises.push(filePromise)
      file.pipe(ws)
    })

    req.pipe(bb)
  })

  const fields = parsed.fields || {}
  const file0 = (parsed.files && parsed.files[0]) || null
  if (!file0 || !file0.isAbsolute) {
    return { status: 400, message: 'Файл не получен' }
  }

  // --- webp-конвейер (core/cloud, общий диск) — идентично destinations ---
  const Images = new File({ webQuality: 80, jpgQuality: 80 })

  const webpOut = await Images.webp([file0.isAbsolute], file0.webpFolder)
  const wepFile = webpOut[0] && webpOut[0].destinationPath
  if (!wepFile) {
    return { status: 500, message: 'Не удалось создать webp' }
  }

  const statF = await Images.statFile(wepFile)
  const imgWidth = statF.width

  const resolutionsArr = [480, 960, 1280, 1920, 2700]
  const minResolution = Images.util.minFilter(resolutionsArr, imgWidth)
  const img = await Images.resizeWEBP(minResolution, wepFile, file0.resize)
  const obj = await Images.util.arrayToObject(img, 'width')
  const imgR = img.map((f) => f.pathFile)

  const webpRel = String(wepFile).split(appRootLocal)[1]

  return {
    status: 200,
    body: {
      original: { name: file0.filename, pathFile: file0.path },
      resize: obj,
      webpOriginal: {
        originalName: statF.name,
        name: statF.name,
        pathFile: webpRel || wepFile,
        format: statF.type,
        size: statF.size,
        bytes: statF.bytes,
        height: statF.height,
        width: imgWidth,
      },
      resolution: minResolution,
      files: [...imgR, file0.path, statF.path],
    },
  }
}

const endpoint = (app) => {
  // Единый приём+конвейер. Структура ответа идентична destinations
  // POST /upload/destinations-dest — клиент (вставка <picture>) не меняется.
  app.post('/upload/:microservice-:mi', authGuard, async (req, res) => {
    try {
      const out = await upload(req, res, appRoot, UPLOAD_DIR)
      return res.status(out.status === 200 ? 200 : out.status).json(out)
    } catch (err) {
      console.log('⚡ err::uploads upload', err)
      if (!res.headersSent) res.status(500).json({ status: 500, message: 'Server error', error: err && err.message })
    }
  })

  // Удаление файлов изображения (DFS-очистка по списку путей)
  // DELETE /delete-image  body:{ files:[...], csrf }
  app.delete('/delete-image', authGuard, async (req, res) => {
    try {
      const body = (req && req.body) || {}
      if (!csrfOk(body, req)) {
        return res.status(403).json({ status: 403, message: 'Forbidden' })
      }
      if (!Array.isArray(body.files) || !body.files.length) {
        return res.status(400).json({ status: 400, message: 'files обязателен (массив путей)' })
      }
      const deleted = await new File().deleteArrayFiles(body.files)
      res.status(200).json({ status: deleted === true ? 201 : 200 })
    } catch (err) {
      console.log('⚡ err::uploads delete-image', err)
      return res.status(500).json({ status: 500, message: 'Server error' })
    }
  })

  // RPC-действия на шине (другие МС вызывают через ask('uploads', ...))
  app.action('uploads:ping', async (meta, res) => {
    res.json({ pong: true, ts: Date.now() })
  })
  app.action('uploads:health', async (meta, res) => {
    res.json({ ok: true, root: appRoot })
  })

  return app
}

export { endpoint }
