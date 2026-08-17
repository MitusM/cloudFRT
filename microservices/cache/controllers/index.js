import path from 'path'
import pkg from 'app-root-path'
import dotenv from 'dotenv'
import { createRequire } from 'module'

import { Cache } from '../service/cacheServices.js'

const require = createRequire(import.meta.url)
const appRoot = pkg.path
dotenv.config()
/**  */
const lang = require('../lang/ru')
/** */
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/')

// const Redis = new Cache({ db: 2 })

const errorHandler = (res, message) => {
  // get: {"message":{}}
  return res.status(200).json({ message: message })
}

const endpoints = async (app) => {
  /**  */
  const db = await app.options.db
  const bd = await app.options.bd
  /**  */

  /**
   * Настройки - Settings
   */

  /*************************************
   *  * * * * * * POST * * * * * * *  *
   *************************************/


  /*************************************
   * * * * * * * * PUT * * * * * * * * *
   *************************************/

  /*************************************
   * * * * * * * DELETE * * * * * * * * *
   *************************************/

  return app
}

export { endpoints }
