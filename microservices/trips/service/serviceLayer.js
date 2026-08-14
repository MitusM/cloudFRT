
module.exports = service

async function service(name, option, app) {
  const {status, response } = await app.ask(name, option)
  return {status, response}
}