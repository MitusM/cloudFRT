const action = async (app) => {
  app.action("user:auth", async (meta, res) => {
    try {
      const client = await app.options.db;
      const auth = await client.getLogin({
        username: meta.username,
        password: meta.password,
      });

      res.json({
        user: auth,
      });
    } catch (err) {
      console.log("⚡ err::user:auth", err);
      process.exit(err);
    }
  });

  /**
   * user:get — чистый RPC-эндпоинт (сервис-2-сервис) для получения юзера БЕЗ пароля.
   * Используется trips/maps и другими микросервисами cloudFRT.
   *
   * meta (одно из):
   *   { rid: "#12:0" }        — поиск по RID OrientDB
   *   { username: "misha" }   — поиск по логину
   *   { _id: "id-xxx" }       — поиск по стабильному _id
   *   { fields: [...] }        — опционально: подмножество полей (default = все безопасные)
   *
   * Ответ: { user: {...} | null }
   * Поля юзера: rid, _id, username, email, block, group, created, quota.
   * hashedPassword и salt НИКОГДА не возвращаются.
   */
  app.action("user:get", async (meta, res) => {
    try {
      const client = await app.options.db;
      // ВАЖНО: @rid нельзя алиасить как `rid` — через queryRid/queryOne (.one()) алиас
      // сериализуется в строку "null". Используем @rid напрямую (приходит строкой '#cluster:pos').
      const ridField = meta.fields ? ['@rid', ...meta.fields.filter((f) => f !== '@rid')].join(', ') : '@rid, _id, username, email, block, group, created, quota';
      const select = `SELECT ${ridField} FROM User WHERE `;
      let user;

      if (meta.rid) {
        // по RID: #cluster:pos
        user = await client.queryRid(select + '@rid = ' + meta.rid);
      } else if (meta.username) {
        // по логину (username уникален)
        user = await client.queryOne(select + 'username =: username', {
          params: { username: meta.username },
        });
      } else if (meta._id) {
        // по стабильному _id
        user = await client.queryOne(select + '_id =: id', {
          params: { id: meta._id },
        });
      } else {
        return res.json({ error: 'user:get requires meta.rid | meta.username | meta._id' });
      }

      // Нормализация RID: поле приходит как `@rid` (строка '#cluster:pos'), отдаём наружу как `rid`.
      if (user && user['@rid']) {
        user.rid = String(user['@rid']);
        delete user['@rid'];
      }

      res.json({ user: user || null });
    } catch (err) {
      console.log('⚡ err::user:get', err);
      res.json({ error: err.message || err });
    }
  });

  return app;
};

export { action };
