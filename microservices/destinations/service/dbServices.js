// === === === === === === === === === === === ===
// dbServices.js — соединение с OrientDB для МС destinations
// (тот же PDO-паттерн, что у article/maps/trips)
// === === === === === === === === === === === ===
import OrientDB from 'orientjs';
const OrientDBClient = OrientDB.OrientDBClient;

class PDO {
  constructor(options = {}) {
    this.host = options.localhost || 'localhost';
    this.port = options.port || 2424;
    this.httpPort = options.httpPort || 2480;
  }

  // Экранировать строку для ИНЛАЙНА в SQL (orientjs в этом стеке не
  // подставляет :named / ? — значения инлайнятся в текст запроса).
  // Помимо одинарной кавычки обязательно обрабатываем обратный слэш и
  // управляющие символы (\n, \r): иначе многострочный HTML из tinyMCE
  // роняет запрос с `Lexical error ... Encountered "\n"`.
  _sqlStr(v) {
    if (v == null) return "''"
    const s = String(v)
      .replace(/\\/g, '\\\\')   // \  → \\ (должно идти ПЕРВЫМ)
      .replace(/'/g, "\\'")        // '  → \'
      .replace(/\r/g, '\\r')       // CR → \r
      .replace(/\n/g, '\\n')       // LF → \n
      .replace(/\t/g, '\\t')       // TAB → \t
    return `'${s}'`
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
      console.log('🙏🏻 Connected (destinations)');
      return this;
    } catch (err) {
      console.log('⚡ err::PDO.connect', err);
    }
  }
}

export { PDO };
