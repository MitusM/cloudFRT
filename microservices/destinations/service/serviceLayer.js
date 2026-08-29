// === === === === === === === === === === === ===
// serviceLayer.js — обёртка над app.ask (RPC по шине)
// === === === === === === === === === === === ===

export default function service(name, option, app) {
  return app.ask(name, option)
}
