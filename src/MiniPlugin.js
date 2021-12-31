require('console.table')
require('colors')
const fs = require('fs')
const readline = require('readline')
const { join } = require('path')
const { ConcatSource } = require('webpack-sources')
const {
  util: { createHash }
} = require('webpack')
const utils = require('./utils')
const MiniProgam = require('./MiniProgram')
const {
  moduleOnlyUsedBySubPackage
} = require('./helpers/module')
const stdout = process.stdout

const { DEPS_MAP, getIgnoreEntrys } = require('./shared/data')
const { setEmitHook } = require('./hooks/setEmitHook')
const { setEnvHook } = require('./hooks/setEnvHook')
const { beforeCompile } = require('./hooks/beforeCompile')

class MiniPlugin extends MiniProgam {
  apply (compiler) {
    if (MiniPlugin.inited) {
      throw new Error(
        'mini-program-webpack-loader 是一个单例插件，不支持多次实例化'
      )
    }

    MiniPlugin.inited = true

    this.moduleOnlyUsedBySubPackage = moduleOnlyUsedBySubPackage

    super.apply(compiler)
    this._appending = []

    // hooks
    this.compiler.hooks.environment.tap(
      'MiniPlugin',
      () => setEnvHook(compiler)
    )
    this.compiler.hooks.beforeCompile.tapAsync(
      'MiniPlugin',
      (params, callback) => beforeCompile(compiler, params, callback)
    )
    this.compiler.hooks.compilation.tap(
      'MiniPlugin',
      this.setCompilation.bind(this)
    )
    this.compiler.hooks.emit.tapAsync('MiniPlugin', (compilation, callback) => setEmitHook(compilation, callback))
    this.compiler.hooks.additionalPass.tapAsync(
      'MiniPlugin',
      this.setAdditionalPassHook.bind(this)
    )
  }

  /**
   * 获取文件与打包输出目录的相对路径
   * @param {String} path 文件的绝对路径
   */
  getAesstPathHook (path) {
    return utils.getDistPath(path)
  }

  /**
   * compilation 事件处理
   * @param {*} compilation
   */
  setCompilation (compilation) {
    /**
     * 标准输出文件名称
     */
    compilation.mainTemplate.hooks.assetPath.tap(
      'MiniPlugin',
      this.getAesstPathHook.bind(this)
    )

    compilation.hooks.additionalAssets.tapAsync('MiniPlugin', (callback) => {
      compilation.assets['webpack-require.js'] = new ConcatSource(
        fs.readFileSync(join(__dirname, './lib/require.js'), 'utf8')
      )
      callback()
    })

    compilation.hooks.optimizeAssets.tap('MiniPlugin', (assets) => {
      const assetsKey = Object.keys(assets)
      const ignoreEntrys = getIgnoreEntrys()
      const entryNames = [...new Set(this.entryNames)]

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
        const fileMeta = this.fileTree.getFileByDist(
          utils.getDistPath(key),
          true
        )

        if (ignoreFiles.indexOf(key) > -1) return

        const hash = createHash(hashFunction)

        source.updateHash(hash)

        const contentHash = hash
          .digest(hashDigest)
          .substring(0, hashDigestLength)

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
      return this._appending.length > 0
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
  setAdditionalPassHook (callback) {
    if (this._appending.length > 0) {
      this.addEntrys(this.compilerContext, this._appending)
    }
    this._appending = []
    callback()
  }

  /**
   * 添加下一次编译新增的文件
   * @param {*} files
   */
  newFilesEntryFromLoader (files) {
    this._appending = this._appending.concat(files)
  }

  /**
   * 输出打包进度
   * @param {String} progress 进度
   * @param {String} event
   * @param {*} modules
   */
  progress (progress, event, modules) {
    readline.clearLine(process.stdout)
    readline.cursorTo(process.stdout, 0)

    if (+progress === 1) return
    stdout.write(
      `${'正在打包: '.gray} ${`${(progress * 100).toFixed(2)}%`.green} ${
        event || ''
      } ${modules || ''}`
    )
  }
}

module.exports = MiniPlugin
