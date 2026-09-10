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
              // @babel/preset-env 8: по умолчанию целится в современные браузеры
              // и НЕ транспилирует модули (отдаёт ESM), что ломает webpack:
              // loader обязан вернуть CJS. Явный modules:'commonjs' даёт
              // современный синтаксис (без старого полифиллинга) + CJS-обёртку.
              presets: [['@babel/preset-env', { modules: 'commonjs' }]],
              plugins: ['@babel/plugin-transform-runtime'],
              sourceType: 'module'
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