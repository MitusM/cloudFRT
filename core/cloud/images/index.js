import sharp from 'sharp'
import { promisify } from 'util'
import { imageSizeFromFile } from 'image-size/fromFile'
import imagemin from 'imagemin'
import imageminMozjpeg from 'imagemin-mozjpeg'
import imageminPngquant from 'imagemin-pngquant'
import imageminWebp from 'imagemin-webp'
import imageminSvgo from 'imagemin-svgo'
// const { extendDefaultPlugins } = require('svgo')
// import extendDefaultPlugins from 'svgo'
import path from 'path'

import File from '../path/file.js'

// FIXME: Вынести в util
const arrFiles = (file, folder) =>
  file.reduce((arr, obj) => {
    return arr.concat(path.join(folder, obj.name))
  }, [])

/** @namespace */
class Images extends File {
  constructor(options) {
    super(options)
    this.util.arrFiles = arrFiles
    this.sharp = sharp
  }

  /**
   * Определяем размер по ширине и высоте файла и его расширение
   * Determine the size of the width and height of the file and its expansion
   * Supported formats BMP, CUR, DDS, GIF, ICNS, ICO, JPEG, KTX, PNG, PNM(PAM, PBM, PFM, PGM, PPM), PSD, SVG, TIFF, WebP
   * @param {string} file Абс
   * @returns {Promise<object>} {width,height,type}
   * @example:
   * await new File.dimensions(path) //=> { height: 1024, width: 682, type: 'jpg' }
   */
  // image-size v2: нет sync-API с путём; imageSizeFromFile читает файл сам (async).
  async dimensions(file) {
    return await imageSizeFromFile(file)
  }

  async statImg(file) {
    file = this.resolve(file)
    const dimensions = await this.dimensions(file)
    const size = this.size(file)
    const { name } = this.name(file)

    return {
      name,
      // ext,
      size,
      width: dimensions.width,
      height: dimensions.height,
      ext: dimensions.type,
    }
  }

  metadata(file) {
    return this.sharp(file).metadata()
  }

  /**
   * Новое имя файла
   * @param {string} name Новое имя изображения
   * @param {number} width Размер изображения
   * @param {boolean} reteniva true - Добавление '@2x'. По умолчанию false
   * @example:
   * new Images().newName('name', 400, true) // => 400_name@2x
   * new Images().newName('name', 400) // => 400_name
   * new Images().newName('name') // => name
   * new Images().newName(400, false) // => 400_aa1c74433210c
   * new Images().newName(400, true) // => 400_06789e598c4df@2x
   * new Images().newName(400) // => 400_b8655d6c1aaf8
   * new Images().newName(true) // => 06789e598c4df@2x
   *
   */
  newName(...arg) {
    // newName, width, reteniva = false
    let args = [].slice.call(arguments, 0)
    // newName ⬇️
    let newName =
      typeof args[0] === 'string'
        ? args[0]
        : Math.random().toString(16).substring(2)
    // width ⬇️
    let width
    if (typeof args[1] === 'number') {
      width = `${args[1]}_`
    } else if (typeof args[0] === 'number') {
      width = `${args[0]}_`
    } else {
      width = ''
    }
    // reteniva ⬇️
    let reteniva
    if (typeof args[2] === 'boolean' && args[2] === true) {
      reteniva = '@2x'
    } else if (typeof args[1] === 'boolean' && args[1] === true) {
      reteniva = '@2x'
    } else if (typeof args[3] === 'boolean' && args[3] === true) {
      reteniva = '@2x'
    } else if (typeof args[0] === 'boolean' && args[0] === true) {
      reteniva = '@2x'
    } else {
      reteniva = ''
    }
    return width + newName + reteniva
  }

  /**
   * Изменение изображения до указанного размера
   * @param {string|number} resolution Размер изображения 800x600 где 800 - ширина, 600 - высота, или 800 где 800 - ширина
   * @param {string} file абсолютный путь до файла
   * @param {string} folder папка в которую сохраняем изменённое изображение
   * @param {string} name имя файла
   * @returns {Promise}
   * @example
   * new Images().resize('800x600', absolutePathFile, '../resize', newName + ext)
   * new Images().resize('800', absolutePathFile, '../resize', newName + ext)
   */
  resize(resolution, file, folder, name) {
    return new Promise((resolve, reject) => {
      let arr = resolution.split('x')
      let res =
        arr.length === 1
          ? {
              width: +arr[0],
            }
          : {
              width: +arr[0],
              height: +arr[1],
            }
      const writePath = this.mkDir(path.resolve(this.root + folder))
      const resizeFilePath = path.resolve(writePath, name)
      sharp(file)
        .resize(res)
        // .metadata() // error: is not a function
        .toFile(resizeFilePath)
        .then((info) => {
          resolve({
            name,
            pathFile: resizeFilePath,
            format: info.format,
            width: info.width,
            height: info.height,
            size: info.size,
            folder: writePath,
          })
        })
        .catch((err) => reject(err))
    })
  }

  //
  async optimazition(file, folder) {
    file = typeof file === 'string' ? [file] : file
    // FIXME: extend default options
    const jpgQuality = this.options.jpgQuality
      ? {
          quality: this.options.jpgQuality,
        }
      : {}

    const pngQuality = this.options.pngQuality
      ? {
          quality: this.options.pngQuality,
        }
      : {
          quality: [0.6, 0.8],
        }

    const webpQuality = this.options.webpQuality
      ? {
          quality: this.options.webpQuality,
        }
      : {
          quality: 50,
        }

    // try {
    // FIXME: Вынести в отдельный метод
    folder = this.isAbsolute(folder)
      ? folder
      : this.resolve([].slice.call(arguments, 1).join(''))

    return await imagemin(file, {
      destination: this.mkDir(folder),
      plugins: [
        // imageminWebp(webpQuality),
        imageminMozjpeg(jpgQuality),
        imageminPngquant(pngQuality),
        imageminWebp(webpQuality),
        // imageminSvgo({
        //   plugins: extendDefaultPlugins([{
        //     name: 'removeViewBox',
        //     active: false
        //   }])
        // })
      ],
    })
    // } catch (error) {
    //   new Error(error)
    // }
  }

  /**
   * Конвертируем изображение в WebP. С одновременной его оптимизации.
   * @param {array} file абсолютный путь до файла
   * @param {string} folder папка в которую сохраняем изменённое изображение
   * @returns {Promise}
   */
  async webp(file, folder) {
    file = typeof file === 'string' ? [file] : file
    const webpQuality = this.options.webpQuality
      ? {
          quality: this.options.webpQuality,
        }
      : {
          // FIXME: extend default options
          quality: 50,
        }
    // FIXME: Вынести в отдельный метод
    folder = this.isAbsolute(folder)
      ? folder
      : this.resolve([].slice.call(arguments, 1).join(''))

    return await imagemin(file, {
      destination: this.mkDir(folder),
      plugins: [imageminWebp(webpQuality)],
    })
  }

  /**
   * Выводим все изображения. Также будут выведены все изображения из всех поддиректорий рекурсивно.
   * @memberof images
   * @instance
   * @param {string} path директория
   * @returns (array)
   */
  foto(path) {
    path = this.resolve(path)
    return (
      this.create()
        .paths(path)
        // .depth(depth)
        .ext(
          '.bmp',
          '.gif',
          '.jpeg',
          '.jpg',
          'JPG',
          '.png',
          '.svg',
          '.tiff',
          '.webp',
        )
        // .ignoreHiddenDirectories()
        .find()
    )
  }
}

// module.exports = Images
export default Images
