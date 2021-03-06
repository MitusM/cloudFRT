import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Busboy from 'busboy'
import { constants } from 'fs'

import { mkDir } from './mkDir.js'

const require = createRequire(import.meta.url)
const fsPromises = fs.promises
const config = require('./config/upload.json')
/** Директория в которою происходит сохранение файла. Если не установлена то будет использована временная директория системы*/
let saveToFile
/** Массив из MIME-типов данных разрешённых к загрузке */
let mimeTypeLimit
/** true загрузить файлы, false загрузка не будет осуществлена. Выведены будут данные других полей */
let upload

let readStream

const getDescriptor = Object.getOwnPropertyDescriptor
let uploadFile = (req, options) => {
  return new Promise((resolve, reject) => {
    /**  */
    options = typeof options === 'string' ? config[options] : options

    /** Функция загрузки файла, заменяющая функцию загрузки файла по умолчанию */
    const customOnFile =
      typeof options.onFile === 'function' ? options.onFile : false
    let headers = options.headers || req.headers

    saveToFile = options.path || os.tmpdir()
    mimeTypeLimit = options.mimeTypeLimit
      ? !Array.isArray(options.mimeTypeLimit)
        ? [options.mimeTypeLimit]
        : options.mimeTypeLimit
      : null

    upload = options.upload || false
    readStream = options.readStream || false

    const busboy = Busboy({
      headers: headers,
    })
    const fields = {}
    const filePromises = []

    busboy
      .on('file', onFile.bind(null, filePromises, options))
      .on('field', onField.bind(null, fields))
      .on('end', onEnd)
      .on('close', onEnd)
      .on('error', onError)
      .on('finish', onEnd)

    busboy.on('partsLimit', function () {
      const err = new Error('Reach parts limit')
      err.code = 'Request_parts_limit'
      err.status = 413
      onError(err)
    })

    busboy.on('filesLimit', () => {
      const err = new Error('Reach files limit')
      err.code = 'Request_files_limit'
      err.status = 413
      onError(err)
    })

    busboy.on('fieldsLimit', () => {
      const err = new Error('Reach fields limit')
      err.code = 'Request_fields_limit'
      err.status = 413
      onError(err)
    })

    req.pipe(busboy)

    /**  */
    function onEnd(err) {
      /** Срабатывает когда файл загружен */
      if (err) {
        return reject(err)
      }
      if (customOnFile) {
        cleanup()
        resolve({
          fields,
        })
      } else {
        Promise.all(filePromises)
          .then((files) => {
            cleanup()
            resolve({
              fields,
              files,
            })
          })
          .then((obj) => obj)
          .catch(reject)
      }
    }

    function onError(err) {
      cleanup()
      return reject(err)
    }

    function cleanup() {
      busboy.removeListener('field', onField)
      busboy.removeListener('file', customOnFile || onFile)
      busboy.removeListener('end', cleanup)
      busboy.removeListener('close', cleanup)
      busboy.removeListener('close', cleanup)
      busboy.removeListener('error', onEnd)
      busboy.removeListener('partsLimit', onEnd)
      busboy.removeListener('filesLimit', onEnd)
      busboy.removeListener('fieldsLimit', onEnd)
      busboy.removeListener('finish', onEnd)
    }

    /**  */
    async function onFile(
      filePromises,
      options,
      fieldname,
      file,
      filename,
      encoding,
    ) {
      let csrf = req.session.csrfSecret
      if (csrf === fields.csrf) {
        let newName
        /** Создаём новое уникальное имя файлу, если options.basename: false */
        if (options.basename) {
          newName = file.tmpName = filename
        } else {
          newName = file.tmpName =
            Math.random().toString(16).substring(2) + '-' + filename
        }

        /** Папка в которую сохраняем файл. Если она не существует то она будет создана */
        mkDir(path.join(process.cwd(), saveToFile))
        /** относительный путь до файла */
        let relativePath = path.join(saveToFile, newName.filename)
        /** абсолютный путь к файлу */
        let saveTo = path.join(process.cwd(), relativePath)

        let access = await fsPromises
          .access(saveTo, constants.F_OK | constants.R_)
          .then((access) => true)
          .catch((err) => false)

        if (access) {
          let { name, ext } = path.parse(saveTo)
          newName = `${name}-${Math.random().toString(36).substring(2)}${ext}`
          saveTo = path.join(process.cwd(), saveToFile, newName)
        }

        // Create a write stream of the new file
        const writeStream = fs.createWriteStream(saveTo, {
          mode: '644',
        })

        const filePromise = new Promise((resolve, reject) =>
          writeStream
            .on('open', () =>
              file
                .pipe(writeStream)
                .on('error', reject)
                .on('finish', () => {
                  if (readStream) {
                    const readStream = fs.createReadStream(saveTo)
                    readStream.fieldname = fieldname
                    readStream.filename = filename
                    readStream.transferEncoding = readStream.encoding = encoding
                    readStream.mimeType = readStream.mime = mimetype
                    resolve(readStream)
                  } else {
                    const stream = {
                      // имя поля
                      fieldname: fieldname,
                      // папка в которую загрузили (относительный путь до файла)
                      path: relativePath,
                      // папка в которую загрузили (абсолютный путь до файла)
                      isAbsolute: saveTo,
                      // пака в которую загрузили (относительный путь)
                      folder: saveToFile,
                      // папка для уменьшенных копий
                      resize: options.resize,
                      // исходное имя
                      basename: filename.filename,
                      mimeType: filename.mimeType,
                      encoding: filename.encoding,
                      // новое имя
                      newName: newName.filename || newName,
                      limits: options.limits.fileSize,
                      mimeTypeLimit: options.mimeTypeLimit,
                    }
                    resolve(stream)
                  }
                }),
            )
            .on('error', (err) => {
              file.resume().on('error', reject)
              reject(err)
            }),
        )
        filePromises.push(filePromise)
      } else {
        new Error('Доступ к загрузке запрещён')
      }
    }

    function onField(fields, name, val) {
      if (getDescriptor(Object.prototype, name)) return
      // This looks like a stringified array, let's parse it
      if (name.indexOf('[') > -1) {
        const obj = objectFromBluePrint(extractFormData(name), val)
        reconcile(obj, fields)
      } else {
        if (fields.hasOwnProperty(name)) {
          if (Array.isArray(fields[name])) {
            fields[name].push(val)
          } else {
            fields[name] = [fields[name], val]
          }
        } else {
          fields[name] = val
        }
      }
    }

    /**
     *
     * Extract a hierarchy array from a stringified formData single input.
     *
     *
     * i.e. topLevel[sub1][sub2] => [topLevel, sub1, sub2]
     *
     * @param  {String} string: Stringify representation of a formData Object
     * @private
     * @return {Array}
     *
     */
    const extractFormData = (string) => {
      const arr = string.split('[')
      const first = arr.shift()
      const res = arr.map((v) => v.split(']')[0])
      res.unshift(first)
      return res
    }

    /**
     *
     * Generate an object given an hierarchy blueprint and the value
     *
     * i.e. [key1, key2, key3] => { key1: {key2: { key3: value }}};
     *
     * @param  {Array} arr:   from extractFormData
     * @param  {[type]} value: The actual value for this key
     * @return {[type]}       [description]
     * @private
     *
     */
    const objectFromBluePrint = (arr, value) => {
      return arr.reverse().reduce((acc, next) => {
        if (Number(next).toString() === 'NaN') {
          return {
            [next]: acc,
          }
        } else {
          const newAcc = []
          newAcc[Number(next)] = acc
          return newAcc
        }
      }, value)
    }

    /**
     * Reconciles formatted data with already formatted data
     *
     * @param  {Object} obj extracted Object
     * @param  {Object} target the field object
     * @return {Object} reconciled fields
     * @private
     *
     */
    const reconcile = (obj, target) => {
      const key = Object.keys(obj)[0]
      const val = obj[key]

      // The reconciliation works even with array has
      // Object.keys will yield the array indexes
      // see https://jsbin.com/hulekomopo/1/
      // Since array are in form of [ , , value3] [value1, value2]
      // the final array will be: [value1, value2, value3] has expected
      if (target.hasOwnProperty(key)) {
        return reconcile(val, target[key])
      } else {
        return (target[key] = val)
      }
    }
  })
}

export { uploadFile }
