const utils = require('../utils')
const { getIgnoreEntrys } = require('../shared/data')

function setEmitHook (compilation, callback) {
  let ignoreEntrys = getIgnoreEntrys()
  let assets = compilation.assets
  /** * 检查一些 js 文件路径 */
  for (const file in assets) {
    let tempFile = utils.getDistPath(file)

    if (tempFile !== file) {
      //  node_modules/@vant/weapp/dist/icon/index.json -> @vant/weapp/dist/icon/index.json
      console.log('tempFile !== file', file, tempFile)
      assets[tempFile] = assets[file]
      delete assets[file]
    }

    if (ignoreEntrys.indexOf(file) > -1 || /node_modules/.test(file)) {
      delete assets[file]
    }
  }

  // transXml(compilation)
  //   .then(() => callback())
  //   .catch(callback)
  callback()
}

module.exports.setEmitHook = setEmitHook
