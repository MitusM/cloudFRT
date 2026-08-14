/** ***** ***** ***** ***** ***** ***** *****
 * *  middleware - setup route middlewares  *
 * Copyright (c) 2021 MitusM.
 *
 * ***** ***** ***** ***** ***** ***** ***** */
'use strict'

const middlewares = (app) => {
  app.all(
    [
      '/article/',
      '/article/settings(.*)',
      '/article/create-:add(.*)',
      '/article/upload-:upload(.*)',
      '/article/delete-:endpoint(.*)',
      '/article/create-:add(.*)',
      '/article/validate',
    ],
    async (req, res, next) => {
      if (!req.session.auth) {
        const redirect = await res.app.ask('auth', {
          server: {
            action: 'aut:redirect',
            meta: {
              csrf: req.session.csrfSecret,
            },
          },
        })
        res.end(redirect.response)
      } else {
        next()
      }
    },
  )

  return app
}

export { middlewares }
