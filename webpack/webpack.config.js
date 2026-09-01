const path = require('path')
const { merge } = require('webpack-merge')
const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')

// const svg = require("./svg");
const images = require('./images')
const sass = require('./sass')
const babel = require('./babel')

var appRoot = require('app-root-path')

const pathList = {
  // source: path.join(appRoot.path, 'developer', 'js'),
  build: path.join(appRoot.path, 'public', 'js'),
  css: path.join(appRoot.path, 'public', 'css'),
}

// Обечистка копии из пакета tinymce 8 (CopyPlugin filter):
//   - *.ts — исходники скинов (для проды нужны только css/js)
//   - plugins/help/js/i18n/keynav/* — 60 локальей навигации help (у нас ru, help не подключён)
function tinymceFilter(resourcePath) {
  if (resourcePath.endsWith('.ts')) return false
  if (resourcePath.includes('/plugins/help/js/i18n/keynav/')) return false
  return true
}

const common = merge([
  {
    // context:
    entry: {
      style: './assets/js/index.js',
      settings: ['./microservices/users/assets/js/settings.js'],
      users: './microservices/users/assets/js/index.js',
      login: './microservices/auth/assets/js/index.js',
      article: './microservices/article/assets/js/index.js',
      destinations: './microservices/destinations/assets/js/index.js',
      destinations_admin: './microservices/destinations/assets/js/admin.js',
    },

    optimization: {
      runtimeChunk: 'single',
      splitChunks: {
        minSize: 0,
        minChunks: 2,
        maxInitialRequests: Infinity,
        // name: true,
        cacheGroups: {
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            enforce: true,
            chunks: 'all',
          },
        },
      },
    },

    output: {
      path: pathList.build,
      filename: '[name].js',
      chunkFilename: '[name].bundle.js',
      publicPath: pathList.build,
      assetModuleFilename: '[name][ext]',
    },
    devtool: false,
    watchOptions: {
      ignored: ['node_modules/**'],
    },
    stats: {
      assets: true,
      colors: true,
      errors: true,
      errorDetails: true,
      modules: false,
      performance: true,
      hash: false,
      version: false,
      timings: true,
      warnings: true,
      children: false,
    },

    plugins: [
      // new DuplicatePackageCheckerPlugin({
      //   emitError: true
      // }),

      new webpack.DefinePlugin({
        'process.env': {
          // This has effect on the react lib size
          NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
        },
      }),
      // отсекаем лишнее из пакета tinymce 8: .ts-исходники и keynav-локали help
      new CopyPlugin({
        patterns: [
        // Фильтр лишнего из пакета tinymce (aprейд до 8.x):
        //   - *.ts — исходники скинов (не нужны в проде, только css/js)
        //   - plugins/help/js/i18n/keynav/* — 60 локальей навигации help (у нас только ru, help не подключён)
        {
          from: 'node_modules/tinymce/plugins',
          to: path.join(pathList.build, '/plugins'),
          filter: tinymceFilter,
        },
        {
          from: 'node_modules/tinymce/skins',
          to: path.join(pathList.build, '/skins'),
          filter: tinymceFilter,
        },
        {
          from: 'assets/js/tinymce/langs',
          to: path.join(pathList.build, '/langs'),
        },
        {
          from: 'node_modules/tinymce/themes',
          to: path.join(pathList.build, '/themes'),
          filter: tinymceFilter,
        },
        {
          from: 'node_modules/tinymce/tinymce.min.js',
          to: path.join(pathList.build),
        },
        {
          from: 'node_modules/tinymce/icons',
          to: path.join(pathList.build, '/icons'),
          filter: tinymceFilter,
        },
        {
          from: 'node_modules/tinymce/models',
          to: path.join(pathList.build, '/models'),
          filter: tinymceFilter,
        },
        {
          from: 'assets/js/tinymce/oxide-icon-pack-template/dist/icons/cloudFRT/icons.js',
          to: path.join(pathList.build, '/icons'),
        },
        {
          from: 'node_modules/preloader-js/assets/css/preloader.css',
          to: path.join(pathList.css),
        },
        ],
        options: {
          concurrency: 100,
        },
      }),
    ],
  },
  images(),
  // svg(),
  babel(),
])

module.exports = function (env) {
  console.log('env', env)
  console.log('⚡ process.env.NODE_ENV', process.env.NODE_ENV)
  return merge([
    {
      mode: 'development',
      watch: true,
    },
    sass(),
    common,

    // analyzer
  ])
}
