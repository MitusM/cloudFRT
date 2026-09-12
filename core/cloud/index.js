import Images from './images/index.js'

class Files extends Images {
  constructor(options) {
    super(options)
  }

  // { isDirectory: boolean; path: string; create: any; atime: any; ctime: any; mtime: any; file: string; type: any; name: string; height: any; width: any; }
  async statFile(file) {
    let obj = {}
    /** относительный путь до файла */
    let relativePathToFile = file.split(this.root)[1]
    /**  */
    let stat = await this.stat(file)
    obj.create = stat.create
    obj.atime = stat.atime
    obj.ctime = stat.ctime
    obj.mtime = stat.mtime
    obj.path = relativePathToFile

    let { ext, name } = this.name(file)
    obj.name = name
    if (stat.isDirectory) {
      obj.isDirectory = stat.isDirectory
    } else {
      obj.type = ext.slice(1)
      obj.size = stat.size
      obj.bytes = stat.bytes

      let img = this.extImg.indexOf(ext)
      if (img > 0) {
        // FIXME: Переписать на statImg
        let { height, width } = await this.dimensions(file)
        obj.height = height
        obj.width = width
        obj.image = true
      } else {
        obj.image = false
      }
    }

    return obj
  }

  async dirFiles(pathDirectory) {
    pathDirectory = this.resolve(pathDirectory)
    let files = await this.fs.readdir(pathDirectory).then((paths) =>
      paths.map(async (file) => {
        return await this.statFile(pathDirectory + '/' + file)
      }),
    )
    return Promise.all([...files])
    // .then((df) => df.filter(file => file !== undefined))
  }
}

// module.exports = Files
export default Files
