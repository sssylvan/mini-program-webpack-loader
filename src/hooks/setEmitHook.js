
const { ConcatSource, RawSource } = require('webpack-sources')
const { get: getAppJson } = require('../helpers/app')
const transXml = require('../wx/transxml')
const { join } = require('path')
const utils = require('../utils')
const { getMain } = require('./beforeCompile')
const { getIgnoreEntrys, options, entryNames: enNames } = require('../shared/data')

function setEmitHook (compilation, callback) {
  let ignoreEntrys = getIgnoreEntrys()
  let assets = compilation.assets
  const { mainName, mainContext } = getMain()
  /**
       * 合并 app.json
       */
  assets['app.json'] = getAppJsonCode()

  console.assert(assets['app.json'], 'app.json 不应该为空')
  /**
       * 直接替换 js 代码
       */
  console.assert(
    assets[mainName + '.js'],
    `${join(mainContext, mainName + '.js')} 不应该不存在`
  )
  assets['app.js'] = assets[mainName + '.js']

  /**
       * 合并 .wxss 代码到 app.wxss
       */
  assets['app.wxss'] = getAppWxss(compilation)

  /**
     * ext.json 如果是字符串并且存在则读取文件
     */

  /**
     * 检查一些 js 文件路径
     */
  for (const file in assets) {

    let tempFile = utils.getDistPath(file)

    if (tempFile !== file) {
      assets[tempFile] = assets[file]
      delete assets[file]
    }

    if (ignoreEntrys.indexOf(file) > -1 || /node_modules/.test(file)) {
      delete assets[file]
    }
  }

  emitHook(compilation, callback)
}

function getAppJsonCode () {
  return new ConcatSource(JSON.stringify(getAppJson(), null, 2))
}

function getAppWxss (compilation) {
  let ext = '.wxss'
  let entryNames = [...new Set(enNames)]
  let wxssCode = ''

  entryNames.forEach((name) => {
    let code = compilation.assets[name + ext]
    if (code) {
      wxssCode += `/************ ${name + ext} *************/\n`
      wxssCode += code.source().toString()
    }
  })
  return new RawSource(wxssCode)
}

function emitHook (compilation, callback) {
  transXml(compilation)
    .then(() => callback())
    .catch(callback)
}
module.exports.setEmitHook = setEmitHook
