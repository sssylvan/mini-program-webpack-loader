const { join } = require('path')
const utils = require('./utils')
const { ProgressPlugin } = require('webpack')
const loader = require('./loader')
const MiniTemplate = require('./MiniTemplate')

const { get: getAppJson } = require('./helpers/app')
const { fileTree, setOption, chunkNames, setMiniEntrys, entryNames: enNames } = require('./shared/data')

const { getEntryConfig, loadEntrys } = require('./hooks/beforeCompile')

module.exports = class MiniProgam {
  constructor (options) {
    global.MINI_PROGRAM_PLUGIN = this

    this.chunkNames = chunkNames

    this.options = setOption(options)

    this.fileTree = fileTree

    this.getEntryConfig = getEntryConfig
    this.loadEntrys = loadEntrys
    this.entryNames = enNames
  }

  apply (compiler) {
    this.compiler = compiler
    this.outputPath = compiler.options.output.path
    const compilerContext = join(compiler.context, 'src')

    // 向 loader 中传递插件实例
    loader.$applyPluginInstance(this)

    // 使用模板插件，用于设置输出格式
    new MiniTemplate(this).apply(compiler)
    new ProgressPlugin({ handler: this.progress }).apply(compiler)

    /**
     * 小程序入口文件
     */
    this.miniEntrys = setMiniEntrys(compiler)

    // 设置计算打包后路径需要的参数（在很多地方需要使用）
    utils.setDistParams(
      compilerContext,
      this.miniEntrys,
      this.options.resources,
      this.outputPath
    )
  }

  getGlobalComponents () {
    return this.appJsonCode.usingComponents || {}
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
