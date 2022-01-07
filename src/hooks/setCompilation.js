const { DEPS_MAP, getIgnoreEntrys } = require('../shared/data')
const fs = require('fs')
const { join } = require('path')
const { ConcatSource } = require('webpack-sources')
const { util: { createHash } } = require('webpack')
const utils = require('../utils')
const { fileTree, entryNames: enNames } = require('../shared/data')
const { addEntrys, getResolver } = require('./beforeCompile')
const { update: setAppJson } = require('../helpers/app')
const { resolveFilesForPlugin: resolveComponentsFiles } = require('../helpers/component')
const { reslovePagesFiles } = require('../helpers/page')
let _appending = []
/**
 * compilation 事件处理
 * @param {*} compilation
 */
function setCompilation (compilation) {
  // compilation.hooks.optimizeTree.tapAsync('MiniPlugin', async (chunks, modules, cb) => await optimizeTree(chunks, modules, cb))

  async function optimizeTree (chunks, modules, cb) {
    const jsonPaths = modules
      .map((module) => module.resource)
      .filter((jsonPath) => jsonPath && /\.json/.test(jsonPath))
    const resolver = getResolver()

    async function append (jsonPaths) {
      jsonPaths.forEach(async (path) => {
        const json = JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }))

        console.log(json)
        let {
          componentGenerics,
          usingComponents,
          pages = [],
          subPackages = []
        } = json
        if (usingComponents || componentGenerics) {
          let assets = await resolveComponentsFiles(resolver, usingComponents)
          const jsonPaths = assets.filter((jsonPath) => jsonPath && /\.json/.test(jsonPath))
          console.log('jsonPaths', jsonPaths)
          await append(jsonPaths)
          assets.forEach(a => !_appending.includes(a) && _appending.push(a))
        }

        if (pages.length || subPackages.length) {
          let newFiles = await reslovePagesFiles(json, this.context)
          const jsonPaths = newFiles.filter((jsonPath) => jsonPath && /\.json/.test(jsonPath))
          console.log('jsonPaths', jsonPaths)
          await append(jsonPaths)
          jsonPaths.forEach(a => !_appending.includes(a) && _appending.push(a))
          setAppJson(json, path)
        }
      })
    }
    await append(jsonPaths)
    console.log(_appending)
    cb()
  }
  /**
   * 标准输出文件名称
   */
  compilation.mainTemplate.hooks.assetPath.tap('MiniPlugin', (path) =>
    utils.getDistPath(path)
  )

  compilation.hooks.additionalAssets.tapAsync('MiniPlugin', (callback) => {
    compilation.assets['webpack-require.js'] = new ConcatSource(
      fs.readFileSync(join(__dirname, '../lib/require.js'), 'utf8')
    )
    callback()
  })

  compilation.hooks.optimizeAssets.tap('MiniPlugin', (assets) => {
    const assetsKey = Object.keys(assets)
    const ignoreEntrys = getIgnoreEntrys()
    const entryNames = [...new Set(enNames)]

    const { outputOptions } = compilation
    const { hashFunction, hashDigest, hashDigestLength } = outputOptions

    const ignoreFiles = utils.flattenDeep([
      ignoreEntrys,
      entryNames.map((name) =>
        ['.wxss', '.js', '.json'].map((ext) => `${name}${ext}`)
      )
    ])

    assetsKey.forEach((key) => {
      const source = assets[key]
      const fileMeta = fileTree.getFileByDist(utils.getDistPath(key), true)

      if (ignoreFiles.indexOf(key) > -1) return

      const hash = createHash(hashFunction)

      source.updateHash(hash)

      const contentHash = hash.digest(hashDigest).substring(0, hashDigestLength)

      if (fileMeta.hash === contentHash) {
        delete assets[key]
        return
      }

      fileMeta.updateHash(contentHash)
    })
  })

  /**
   * 检查是否有需要动态添加的入口文件，如果有需要重新编译
   */
  compilation.hooks.needAdditionalPass.tap('MiniPlugin', () => {
    return _appending.length > 0
  })

  compilation.hooks.optimizeChunks.tap('MiniPlugin', (chunks) => {
    let ignoreEntrys = getIgnoreEntrys()
    for (const chunk of chunks) {
      if (chunk.hasEntryModule() && !ignoreEntrys.indexOf(chunk.name) !== 0) {
        // 记录模块之间依赖关系
        for (const module of chunk.getModules()) {
          if (!module.isEntryModule()) {
            const resourcePath = module.resource
            let relPath = utils.getDistPath(resourcePath)
            let chunkName = chunk.name + '.js'
            utils.setMapValue(DEPS_MAP, relPath, chunkName)

            module._usedModules = DEPS_MAP[relPath]
          }
        }
      }
    }
  })
}

/**
 * 动态添加文件，有些自定义组件，对应的 js 文件需要作为入口文件。
 * @param {Function} callback webpack compilation callback
 */
function setAdditionalPassHook (callback) {
  if (_appending.length > 0) {
    addEntrys(utils.compilerContext, _appending)
  }
  _appending = []
  callback()
}

module.exports.setCompilation = setCompilation
module.exports.setAdditionalPassHook = setAdditionalPassHook
module.exports.setAppending = (files) => {
  _appending = _appending.concat(files)
}
