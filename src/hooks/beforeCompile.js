const { dirname, basename } = require('path')
const { flattenDeep, getFiles } = require('../utils')
const { reslovePagesFiles } = require('../helpers/page')
const {
  update: setAppJson,
  get: getAppJson,
  getTabBarIcons
} = require('../helpers/app')
const {
  resolveFilesForPlugin: resolveComponentsFiles
} = require('../helpers/component')
const { moduleOnlyUsedBySubPackage } = require('../helpers/module')
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
const { extname } = require('path')
const { join, isAbsolute } = require('path')

const { options, entryNames, chunkNames } = require('../shared/data')
const utils = require('../utils')

let mainContext
let mainEntry
let mainName
const mainChunkNameTemplate = '__assets_chunk_name__'
let mainChunkNameIndex = 0
let compiler
let resolver

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
  resolver = utils.createResolver(compiler)

  loadEntry(appJsonPath).then(() => {
    // 设置子包的 cachegroup
    options.commonSubPackages && setCacheGroup()
    callback()
  })
}

async function loadEntry (appJsonPath) {
  mainEntry = appJsonPath
  mainContext = dirname(mainEntry)
  mainName = basename(mainEntry, '.json')

  entryNames.push(mainName)

  // 获取配置信息，并设置，因为设置分包引用提取，需要先设置好
  const appJson = require(mainEntry)
  setAppJson(appJson, mainEntry, true)
  // 添加页面
  let pageFiles = reslovePagesFiles(appJson, mainContext, options)

  // 入口文件只打包对应的 wxss 文件 ? 啥时候打包的 ts 文件
  let entryFiles = getFiles(mainContext, mainName, ['.wxss', '.scss', '.less'])

  // 添加所有与这个 json 文件相关的 page 文件和 app 文件到编译中
  addEntrys(mainContext, [pageFiles, entryFiles, mainEntry])

  // fileTree.setFile(entryFiles, true /* ignore */)
  // fileTree.addEntry(mainEntry)
  if (appJson.usingComponents || appJson.publicComponents) {
    pageFiles.push(mainEntry)
  }
  const componentFiles = pageFiles.filter((file) => extname(file) === '.json')

  let tabBar = getAppJson().tabBar
  let extfile = options.extfile

  let entrys = [
    getFiles(mainContext, 'project.config', ['.json']), // project.config.json
    extfile === true ? getFiles(mainContext, 'ext', ['.json']) : [], // ext.json 只有 extfile 为 true 的时候才加载主包的 ext.json
    getFiles(mainContext, mainName, ['.js', '.ts']) // 打包主入口对应的 js 文件
  ]

  // tabBar icons
  entrys = entrys.concat(
    (tabBar && tabBar.list && getTabBarIcons(mainContext, tabBar.list)) || []
  )

  addEntrys(mainContext, entrys)

  const componentSet = new Set()

  await resolveComponentsFiles(
    resolver,
    componentFiles,
    componentSet
  )
  addEntrys(mainContext, Array.from(componentSet))
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

module.exports.loadEntrys = loadEntry
module.exports.addEntrys = addEntrys
module.exports.getResolver = () => {
  return resolver
}
