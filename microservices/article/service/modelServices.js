// === === === === === === === === === === === ===
//
// === === === === === === === === === === === ===

import { PDO } from './dbServices.js'

class Model extends PDO {
  constructor(options) {
    super(options)
  }

  async queryAll(query, params) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query, params).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.queryAll => ModelService.js:19 ', err)
      process.exit()
    }
  }

  async queryOne(query, params) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query, params).one()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.query => ', err)
      process.exit()
    }
  }

  async queryRid(query) {
    try {
      const session = await this.pool.acquire()
      const message = await session.query(query).one()
      session.close()
      return message
    } catch (err) {
      return err
    }
  }

  liveQuery(options) {}

  async insert(query, json) {
    try {
      const session = await this.pool.acquire()
      const message = await session.command(query, json).one()
      session.close()
      return { message: message, type: 'insert', done: true }
    } catch (err) {
      console.log('⚡ err::PDO.insert => ', err)
      return { err: err, done: false }
    }
  }

  async create(edgeClass, from, to) {
    try {
      const session = await this.pool.acquire()
      const message = await session
        .create('EDGE', edgeClass)
        .from(from)
        .to(to)
        .one()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.create => ', err)
      process.exit()
    }
  }

  async command(query) {
    try {
      const session = await this.pool.acquire()
      const message = await session.command(query).all()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::PDO.command => ', err)
      return err
    }
  }

  /** Экранировать строку от SQL-инъекции для инлайна в запрос (одинарные кавычки) */
  sq(v) {
    return v == null ? "''" : `'${String(v).replace(/'/g, "\\'")}'`
  }

  getAll(limit = 10) {
    // ORDER BY created DESC
    return this.queryAll('SELECT @rid as rid, _id FROM article LIMIT ' + limit)
  }

  update(set, rid, obj) {
    return this.insert(
      'UPDATE article SET ' + set + ' UPSERT WHERE @rid =' + rid,
      { params: { ...obj } },
    )
  }

  async paginate(lowerRid, limit) {
    return this.queryAll(
      'SELECT @rid as rid,  FROM article WHERE @rid > ' +
        lowerRid +
        ' LIMIT ' +
        limit,
    )
  }

  getSettings() {
    return this.queryOne('SELECT * FROM Settings WHERE microservice="article"')
  }

  /** Сохранить настройки МС article (UPSERT по полю microservice).
   *  Возвращает { count } как от UPDATE UPSERT — обработчик ждёт count === 1.
   *  Внимание: обёртка insert() вернула бы { message, type, done }, что ломает
   *  проверку count — поэтому вызываем session.command напрямую. */
  async setSettings(obj) {
    try {
      const session = await this.pool.acquire()
      const message = await session
        .command(
          'UPDATE Settings SET settings=:settings, microservice="article", created=sysdate() UPSERT WHERE microservice="article"',
          { params: { settings: obj } },
        )
        .one()
      session.close()
      return message
    } catch (err) {
      console.log('⚡ err::Model.setSettings', err)
      return { count: 0, err }
    }
  }

  setCreated(table, obj, location) {
    // Безопасность: номер-место передаётся инлайном в SQL → экранируем кавычки,
    // допускаем только числа/пробел/запятую (координаты в формате "lng, lat").
    const safeLoc = String(location || '').replace(/[^0-9.,\-\s]/g, '')
    return this.insert(
      'INSERT INTO ' +
        table +
        ' SET title=:title, country=:country, country_id=:country_id,img_upload=:img_upload, created=sysdate(), id=:id, content=:content, description=:description, url=:url, keyword=:keyword, searchable=:searchable, tags=:tags, config=:config, image=:image, main=:main, location=ST_GeomFromText("POINT(' +
        safeLoc +
        ')")',
      { params: { ...obj } },
    )
  }

  // Допустимые значения для /article/validate (белый список классов и полей).
  // Защита от SQL-инъекции: table/params приходят из body напрямую.
  static SELECT_TABLES = ['Country', 'Territorial', 'City', 'article']

  select(table, params, value) {
    // --- белый список таблиц ---
    const tables = Model.SELECT_TABLES
    if (!tables.includes(table)) {
      throw new Error('select: недопустимая таблица ' + table)
    }
    // --- белый список полей (разрешаем печатаймые идентификаторы + точку для вложенных) ---
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(params)) {
      throw new Error('select: недопустимое поле ' + params)
    }
    // --- экранируем значение (double-quote для строкового литерала OrientSQL) ---
    const safeValue = String(value == null ? '' : value).replace(/"/g, '\\"')
    return this.queryAll(
      `SELECT ${params} FROM ${table} WHERE ${params} = "${safeValue}"`,
    )
  }
}

export { Model }
