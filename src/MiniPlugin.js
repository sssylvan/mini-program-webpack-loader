require('console.table')
require('colors')
const readline = require('readline')
const { moduleOnlyUsedBySubPackage } = require('./helpers/module')
const stdout = process.stdout

const { setEmitHook } = require('./hooks/setEmitHook')
const { setEnvHook } = require('./hooks/setEnvHook')
const { beforeCompile } = require('./hooks/beforeCompile')
const {
  setCompilation,
  setAdditionalPassHook
} = require('./hooks/setCompilation')
const { join } = require('path')
const utils = require('./utils')
const { ProgressPlugin } = require('webpack')
const MiniTemplate = require('./MiniTemplate')

const { get: getAppJson } = require('./helpers/app')
const { setMiniEntrys } = require('./shared/data')

class MiniPlugin {
  apply (compiler) {
    this.moduleOnlyUsedBySubPackage = moduleOnlyUsedBySubPackage

    this.compiler = compiler
    this.outputPath = compiler.options.output.path
    const compilerContext = join(compiler.context, 'src')

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
      undefined,
      this.outputPath
    )

    // hooks
    this.compiler.hooks.environment.tap('MiniPlugin', () =>
      setEnvHook(compiler)
    )
    this.compiler.hooks.beforeCompile.tapAsync(
      'MiniPlugin',
      (params, callback) => beforeCompile(compiler, params, callback)
    )
    this.compiler.hooks.compilation.tap('MiniPlugin', (compilation, callback) =>
      setCompilation(compilation, callback)
    )
    this.compiler.hooks.emit.tapAsync('MiniPlugin', (compilation, callback) =>
      setEmitHook(compilation, callback)
    )
    this.compiler.hooks.additionalPass.tapAsync('MiniPlugin', (callback) =>
      setAdditionalPassHook(callback)
    )
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

module.exports = MiniPlugin
