import path from "path";
import pkg from "app-root-path";
import dotenv from "dotenv";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
dotenv.config();

const lang = require("../lang/ru");
const appRoot = pkg.path;
const templateDir = path.join(appRoot, process.env.VIEW_DIR || 'view/html/');

const action = (app) => {
  app.action("aut:redirect", async (meta, res) => {
    const template = await res.app.ask(
      "render",
      {
        server: {
          action: "html",
          meta: {
            dir: templateDir, // directory users template
            page: process.env.TEMPLATE_FILE, // file template
            data: {
              csrf: meta.csrf,
              title: "Авторизация | cloudFRT",
              lang: lang,
            },
          },
        },
      },
      res.app
    );
    return await res.end(template.response.html);
  });
  return app;
};

export { action };
