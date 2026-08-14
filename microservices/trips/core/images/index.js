import Files from '../../../../core/cloud/index.js'

class File extends Files {
  constructor(options) {
    super(options)
  }

  /**
   * Изменение изображения до указанного размера
   * @param {Array} resolutionArray width Размер
   * @param {String} file Изображение которое должно быть изменено
   * @param {String} folder Папка в которую сохраняем изменённое изображение
   * @param {boolean} resNewName false Если к имени файла не добавлять ширину изображение. По умолчанию true.
   * @param {boolean} reteniva false не добавлять к имени файла приставку @2х. По умолчанию true.
   *
   * @example:new Images().resize([400, 600], absolutePathFile.ext, /images)
   */
  // resizePreview
  async resizeJPG(
    resolutionArray,
    file,
    folder,
    resNewName = true,
    reteniva = false,
  ) {
    /** Папка в которую сохраняем уменьшенные копии */
    const writePath = this.mkDir(this.path.resolve(this.root + folder))
    let filePromise = []

    for (let i = 0; i < resolutionArray.length; i++) {
      const resolution = resolutionArray[i]
      const { ext, name } = this.name(file)
      const newName = resNewName
        ? this.newName(name, resolution, reteniva) + ext
        : name + ext
      const resizeFilePath = this.path.resolve(writePath, newName)
      let promisesPush = new Promise((resolve, reject) => {
        this.sharp(file)
          .resize(resolution)
          .jpeg({ mozjpeg: true })
          .toFormat('jpg', { progressive: true, quality: 80 })
          .toFile(this.path.resolve(writePath, newName))
          .then((info) => {
            resolve({
              originalName: name,
              name: newName,
              pathFile: resizeFilePath.split(this.root)[1],
              format: info.format,
              width: info.width,
              height: info.height,
              size: info.size,
            })
          })
          .catch((err) => reject(err))
      })

      filePromise.push(promisesPush)
    }
    try {
      return await Promise.all(filePromise)
    } catch (error) {
      return error
    }
  }

  /**
   * Изменение изображения до указанного размера
   * @param {Array} resolutionArray width Размер
   * @param {String} file Изображение которое должно быть изменено
   * @param {String} folder Папка в которую сохраняем изменённое изображение
   * @param {boolean} resNewName false Если к имени файла не добавлять ширину изображение. По умолчанию true.
   * @param {boolean} reteniva false не добавлять к имени файла приставку @2х. По умолчанию true.
   * @returns {Promise}
   *
   * @example:new Images().resize([400, 600], absolutePathFile.ext, /images)
   */
  async resizeWEBP(
    resolutionArray,
    file,
    folder,
    resNewName = true,
    reteniva = false,
  ) {
    /** Папка в которую сохраняем уменьшенные копии */
    const writePath = this.mkDir(this.path.resolve(this.root + folder))
    let filePromise = []

    for (let i = 0; i < resolutionArray.length; i++) {
      const resolution = resolutionArray[i]
      const { ext, name } = this.name(file)
      const newName = resNewName
        ? this.newName(name, resolution, reteniva) + ext
        : name + ext
      const writePath = this.mkDir(this.path.resolve(this.root + folder))
      const resizeFilePath = this.path.resolve(writePath, newName)
      let promisesPush = new Promise((resolve, reject) => {
        this.sharp(file)
          .resize(resolution)
          .toFormat('webp', {
            quality: 50,
          })
          .toFile(resizeFilePath)
          .then((info) => {
            resolve({
              originalName: name,
              name: newName,
              pathFile: resizeFilePath.split(this.root)[1],
              format: info.format,
              width: info.width,
              height: info.height,
              size: info.size,
            })
          })
          .catch((err) => reject(err))
      })

      filePromise.push(promisesPush)
    }
    try {
      return await Promise.all(filePromise)
    } catch (error) {
      return error
    }
  }
}

export default File
