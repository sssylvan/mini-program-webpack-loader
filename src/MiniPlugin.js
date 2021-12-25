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
const { get: getAppJson } = require('./helpers/app')
const {
  moduleOnlyUsedBySubPackage
} = require('./helpers/module')
const stdout = process.stdout

const { DEPS_MAP } = require('./shared/data')
const { setEnvHook } = require('./hooks/setEnvHook')

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
      this.beforeCompile.bind(this)
    )
    this.compiler.hooks.compilation.tap(
      'MiniPlugin',
      this.setCompilation.bind(this)
    )
    this.compiler.hooks.emit.tapAsync('MiniPlugin', this.setEmitHook.bind(this))
    this.compiler.hooks.additionalPass.tapAsync(
      'MiniPlugin',
      this.setAdditionalPassHook.bind(this)
    )
  }

  /**
   * 根据入口文件进行构建依赖
   * @param {*} params
   * @param {*} callback
   */
  beforeCompile (params, callback) {
    if (this.hasLoaded) return callback()

    this.loadEntrys(this.miniEntrys).then(() => {
      // 设置子包的 cachegroup
      this.options.commonSubPackages && this.setCacheGroup()
      this.hasLoaded = true
      callback()
    })
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
    this.helperPlugin.setCompilation &&
      this.helperPlugin.setCompilation(compilation)
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
      const ignoreEntrys = this.getIgnoreEntrys()
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
      let ignoreEntrys = this.getIgnoreEntrys()
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

  setEmitHook (compilation, callback) {
    let ignoreEntrys = this.getIgnoreEntrys()
    let assets = compilation.assets

    if (!this.options.forPlugin) {
      /**
       * 合并 app.json
       */
      assets['app.json'] = this.helperPlugin.getAppJsonCode()

      console.assert(assets['app.json'], 'app.json 不应该为空')
      /**
       * 直接替换 js 代码
       */
      console.assert(
        assets[this.mainName + '.js'],
        `${join(this.mainContext, this.mainName + '.js')} 不应该不存在`
      )
      assets['app.js'] = this.helperPlugin.getAppJsCode(
        assets[this.mainName + '.js']
      )

      /**
       * 合并 .wxss 代码到 app.wxss
       */
      assets['app.wxss'] = this.getAppWxss(compilation)
    } else {
      assets['plugin.json'] = this.helperPlugin.getPluginJsonCode()
    }

    /**
     * ext.json 如果是字符串并且存在则读取文件
     */
    if (typeof this.options.extfile === 'string') {
      assets['ext.json'] = this.getExtJson()
    }

    /**
     * 检查一些 js 文件路径
     */
    for (const file in assets) {
      const { replaceFile } = this.options

      let tempFile = utils.getDistPath(file)

      if (tempFile !== file) {
        assets[tempFile] = assets[file]
        delete assets[file]
      }

      if (
        assets[file] &&
        Array.isArray(replaceFile) &&
        typeof replaceFile[1] === 'function'
      ) {
        const rFile = replaceFile[1](file)
        if (rFile !== file) {
          assets[utils.getDistPath(rFile)] = assets[file]
          delete assets[file]
        }
      }

      if (ignoreEntrys.indexOf(file) > -1 || /node_modules/.test(file)) {
        delete assets[file]
      }
    }

    this.helperPlugin.emitHook(compilation, callback)
  }

  setCacheGroup () {
    let appJson = getAppJson()
    let cachegroups = this.compiler.options.optimization.splitChunks.cacheGroups

    if (this.options.setSubPackageCacheGroup) {
      let groups = this.options.setSubPackageCacheGroup(this, appJson)
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
