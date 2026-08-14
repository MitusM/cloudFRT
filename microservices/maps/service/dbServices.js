// === === === === === === === === === === === ===
//
// === === === === === === === === === === === ===
import OrientDB from 'orientjs';
const OrientDBClient = OrientDB.OrientDBClient;

class PDO {
  constructor(options = {}) {
    this.host = options.localhost || 'localhost';
    this.port = options.port || 2424;
    this.httpPort = options.httpPort || 2480;
  }

  async connect(options) {
    try {
      this.username = options.username;
      this.password = options.password;
      this.name = options.name;
      this.options = options;

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
      console.log('🙏🏻 Connected');
      return this;
    } catch (err) {
      console.log('⚡ err::PDO.connect', err);
    }
  }
}

export { PDO };
