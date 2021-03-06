// === === === === === === === === === === === ===
//
// === === === === === === === === === === === ===
import OrientDB from "orientjs";
const OrientDBClient = OrientDB.OrientDBClient;

class PDO {
  constructor(options = {}) {
    this.host = options.localhost || "localhost";
    this.port = options.port || 2424;
    this.httpPort = options.httpPort || 2480;
  }

  async connect(options) {
    try {
      this.username = options.username;
      this.password = options.password;
      this.name = options.name;
      this.options = options;

      // let client = (
      this.client = await OrientDBClient.connect({
        host: this.host,
        port: 2424,
        pool: {
          max: 10,
        },
      });

      this.pool = await this.client.sessions({
        name: this.options.name,
        username: this.options.username,
        password: this.options.password,
        pool: {
          max: 25,
        },
      });
      console.log("Connected");
      return this;
    } catch (err) {
      console.log("⚡ err::PDO.connect", err);
    }
  }

  // async queryAll(query, params) {
  //   try {
  //     const session = await this.pool.acquire();
  //     const message = await session.query(query, params).all();
  //     session.close();
  //     return message;
  //   } catch (err) {
  //     console.log("⚡ err::PDO.queryAll => ", err);
  //     process.exit();
  //   }
  // }

  // async queryOne(query, params) {
  //   try {
  //     const session = await this.pool.acquire();
  //     const message = await session.query(query, params).one();
  //     session.close();
  //     return message;
  //   } catch (err) {
  //     console.log("⚡ err::PDO.query => ", err);
  //     process.exit();
  //   }
  // }

  // liveQuery(options) {}

  // async insert(query, json) {
  //   try {
  //     const session = await this.pool.acquire();
  //     const message = await session.command(query, json).one();
  //     session.close();
  //     return message;
  //   } catch (err) {
  //     console.log("⚡ err::PDO.query => ", err);
  //     process.exit();
  //   }
  // }

  // async create(edgeClass, from, to) {
  //   try {
  //     const session = await this.pool.acquire();
  //     const message = await session
  //       .create("EDGE", edgeClass)
  //       .from(from)
  //       .to(to)
  //       .one();
  //     session.close();
  //     return message;
  //   } catch (err) {
  //     console.log("⚡ err::PDO.create => ", err);
  //     process.exit();
  //   }
  // }

  // command(options) {}
}

export { PDO };
