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
      console.log('⚡ query::', query)
      console.log('⚡ params::', params)
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

  setCreated(table, obj, location) {
    return this.insert(
      'INSERT INTO ' +
        table +
        ' SET title=:title, country=:country, country_id=:country_id,img_upload=:img_upload, created=sysdate(), id=:id, content=:content, description=:description, url=:url, keyword=:keyword, searchable=:searchable, tags=:tags, config=:config, image=:image, main=:main, location=ST_GeomFromText("POINT(' +
        location +
        ')")',
      { params: { ...obj } },
    )
  }

  select(table, params, value) {
    return this.queryAll(
      `SELECT ${params} FROM ${table} WHERE ${params} = "${value}"`,
    )
  }
}

export { Model }
