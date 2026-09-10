'use strict'
module.exports = function () {
  return {
    module: {
      rules: [{
          test: /\.js$/,
          // include: inc,
          exclude: [/(node_modules|bower_components)/, /node_modules[\\\/]core-js/],
          use: {
            loader: 'babel-loader',
            options: {
              // ВАЖНО: НЕ задавать modules:'commonjs'.
              // package.json содержит "type":"module" → webpack парсит все .js
              // как javascript/esm. Babel, отдающий CJS с require(), в такой файл
              // НЕ перехватывается webpack'ом — сырой require() попадает в бандл
              // и падает в браузере с "require is not defined" (регрессия
              // 10.09.2026: пропали tinymce и весь JS на article/login/users/
              // destinations). Пусть babel оставляет ESM — webpack сам слинкует.
              presets: ['@babel/preset-env'],
              plugins: ['@babel/plugin-transform-runtime']
            }
          }
        },
        {
          test: /\.bundle\.js$/,
          use: {
            loader: 'bundle-loader'
          }
        }
      ]
    }
  }
}