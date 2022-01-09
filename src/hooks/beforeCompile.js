const { dirname, basename } = require('path')
const { flattenDeep } = require('../utils')
const { update: setAppJson, get: getAppJson } = require('../helpers/app')

const { moduleOnlyUsedBySubPackage } = require('../helpers/module')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
const { extname } = require('path')
const { join, isAbsolute } = require('path')

const { options, entryNames, chunkNames } = require('../shared/data')
const utils = require('../utils')
const { getAssetsFromAppJson } = require('../helpers/json')

let mainContext
let mainEntry
let mainName
const mainChunkNameTemplate = '__assets_chunk_name__'
let mainChunkNameIndex = 0
let compiler

module.exports.getMain = () => {
  return { mainName, mainEntry, mainContext }
}
/**
 * 根据入口文件进行构建依赖
 * @param {*} params
 * @param {*} callback
 */
module.exports.beforeCompile = (compr, callback) => {
  compiler = compr
  const entry = compiler.options.entry
  const appJsonPath = isAbsolute(entry) ? entry : join(compiler.context, entry)
  // loadEntry(appJsonPath).then(() => {
  //   // 设置子包的 cachegroup
  //   options.commonSubPackages && setCacheGroup()
  //   callback()
  // })/get

  const resolver = utils.createResolver(compiler)
  mainEntry = appJsonPath
  mainContext = dirname(mainEntry)
  mainName = basename(mainEntry, '.json')
  entryNames.push(mainName)
  const appJson = require(mainEntry)
  setAppJson(appJson, mainEntry, true)
  getAssetsFromAppJson(appJsonPath, resolver).then((files) => {
    addEntrys(mainContext, files)
    callback()
  })
}

function setCacheGroup () {
  let appJson = getAppJson()
  let cachegroups = compiler.options.optimization.splitChunks.cacheGroups

  if (options.setSubPackageCacheGroup) {
    let groups = options.setSubPackageCacheGroup(this, appJson)
    Object.assign(cachegroups, groups)
    return
  }

  if (appJson.subPackages) {
    for (const { root } of appJson.subPackages) {
      let name = root.replace('/', '')

      cachegroups[`${name}Commons`] = {
        name: `${root}/commonchunks`,
        chunks: 'initial',
        minSize: 0,
        minChunks: 1,
        test: (module) => moduleOnlyUsedBySubPackage(module, root + '/'),
        priority: 3
      }
    }
  }
}

function addEntrys (context, files) {
  let assetFiles = []
  let scriptFiles = []
  files = flattenDeep(files)

  files.forEach((file) =>
    /\.[j|t]s$/.test(file) ? scriptFiles.push(file) : assetFiles.push(file)
  )

  addAssetsEntry(context, assetFiles)
  addScriptEntry(context, scriptFiles)
}

function addAssetsEntry (context, entrys) {
  let chunkName = mainChunkNameTemplate + mainChunkNameIndex
  chunkNames.push(chunkName)
  new MultiEntryPlugin(context, entrys, chunkName).apply(compiler)

  // 自动生成
  mainChunkNameIndex++
}

function addScriptEntry (context, entrys) {
  for (const entry of entrys) {
    let fileName = utils.getDistPath(entry).replace(extname(entry), '')
    new SingleEntryPlugin(context, entry, fileName).apply(compiler)
  }
}

module.exports.addEntrys = addEntrys
