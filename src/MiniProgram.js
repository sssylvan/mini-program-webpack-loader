const { existsSync } = require('fs')
const { join } = require('path')
const utils = require('./utils')
const WxPluginHelper = require('./wx/plugin')
const { ProgressPlugin } = require('webpack')
const loader = require('./loader')
const MiniTemplate = require('./MiniTemplate')

const { ConcatSource, RawSource } = require('webpack-sources')

const { flattenDeep } = require('./utils')
const { get: getAppJson } = require('./helpers/app')
const { fileTree, setOption, chunkNames, setMiniEntrys, entryNames: enNames } = require('./shared/data')

const { getEntryConfig, loadEntrys, addEntrys } = require('./hooks/beforeCompile')

module.exports = class MiniProgam {
  constructor (options) {
    global.MINI_PROGRAM_PLUGIN = this

    this.chunkNames = chunkNames

    this.options = setOption(options)

    this.fileTree = fileTree

    this.helperPlugin = new WxPluginHelper(this)
    this.getEntryConfig = getEntryConfig
    this.loadEntrys = loadEntrys
    this.addEntrys = addEntrys
    this.entryNames = enNames
  }

  apply (compiler) {
    this.compiler = compiler
    this.outputPath = compiler.options.output.path
    this.compilerContext = join(compiler.context, 'src')

    // 向 loader 中传递插件实例
    loader.$applyPluginInstance(this)

    // 使用模板插件，用于设置输出格式
    new MiniTemplate(this).apply(compiler)
    new ProgressPlugin({ handler: this.progress }).apply(compiler)

    this.helperPlugin.apply(compiler)

    /**
     * 小程序入口文件
     */
    this.miniEntrys = setMiniEntrys(compiler)

    // 设置计算打包后路径需要的参数（在很多地方需要使用）
    utils.setDistParams(
      this.compilerContext,
      this.miniEntrys,
      this.options.resources,
      this.outputPath
    )
  }

  getGlobalComponents () {
    return this.appJsonCode.usingComponents || {}
  }

  getExtJson () {
    if (!existsSync(this.options.extfile)) {
      console.warn(`${this.options.extfile} 文件找不到`)
      return new ConcatSource(JSON.stringify({}, null, 2))
    }

    let ext = require(this.options.extfile)
    return new ConcatSource(JSON.stringify(ext, null, 2))
  }

  getAppWxss (compilation) {
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

  getIgnoreEntrys () {
    /**
     * 多个入口，所有文件对应的原始文件将被丢弃
     */
    let entryNames = [...new Set(enNames)]

    if (this.options.forPlugin) {
      entryNames.splice(entryNames.indexOf('plugin'))
    }

    entryNames = entryNames.map((name) => {
      if (name === 'app') return []
      return ['.json', '.wxss', '.js'].map((ext) => name + ext)
    })

    entryNames = flattenDeep(entryNames)

    /**
     * 静态资源的主文件
     */
    entryNames = entryNames.concat(
      this.chunkNames.map((chunkName) => chunkName + '.js')
    )

    return entryNames
  }

  /**
   * 获取路径所在的 package root
   * @param {String} path
   */
  getPathRoot (path) {
    let { subPackages } = getAppJson()

    for (const { root } of subPackages) {
      let match = path.match(root)

      if (match !== null && match.index === 0) {
        return root
      }
    }

    return ''
  }
}
